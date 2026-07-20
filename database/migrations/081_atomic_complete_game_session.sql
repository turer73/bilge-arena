-- Migration 081: complete_game_session — atomik oturum-tamamlama RPC (Faz 1, konu#6 karari)
--
-- Sorun (Turgut'un onayladigi Faz-1 kapsami, konu#6 sentez+karar): sessions/route.ts
-- POST handler'i 8 ayri, transaction-disi Supabase cagrisi yapiyordu (session insert,
-- answers insert, question-stats RPC, status update, coin RPC, XP RPC, quest update,
-- topic-progress read+write, badge check). Kismi hata (orn. answers insert basarili ama
-- XP RPC'si network hatasi alirsa) tutarsiz odul durumuna yol aciyordu. Ayrica
-- user_topic_progress yazma path'i migration 043'teki accuracy_pct GENERATED ALWAYS
-- kolonuna elle yazmaya calisiyordu -- Postgres hatasi dis try/catch'te yutuluyor,
-- bu tablo hicbir zaman gercek session verisiyle guncellenmiyordu (klipper kor-tur
-- pozisyonu, konu#6).
--
-- Fix: session+answers+question-stats+coin+XP+topic-progress TEK SECURITY DEFINER
-- fonksiyonda, tek transaction'da (ya hepsi ya hicbiri). Gunluk-gorev-guncelleme ve
-- rozet-kontrolu BILINCLI OLARAK disarida birakildi (route.ts'te best-effort try/catch
-- olarak kalir) -- para/skor degil, blast-radius sinirli tutuluyor.
--
-- Idempotency (Turgut karari, konu#6 sentez-sonrasi ek-kapsam): client crypto.randomUUID()
-- ile ureteceginiz p_client_request_id, UNIQUE(user_id, client_request_id) ile korunuyor --
-- ayni istek (network-retry) ikinci kez gelirse YENIDEN ODUL URETMEZ, ilk sonucu doner.
-- Race-free desen: once SELECT ile hizli-yol kontrolu, INSERT'te unique_violation
-- yakalanirsa (gercek es-zamanli cakisma) yine ilk sonuc donulur -- hicbir zaman hata
-- firlatilmaz (DeepSeek 3.-goz onerisi).
--
-- Nested SECURITY DEFINER cagrilari (increment_xp/increment_coins/batch_increment_question_stats)
-- guvenli, kanitli desen: migration 077'deki submit_challenge_answer zaten increment_xp'yi
-- nested cagiriyor. UYARI (ayri hardening ticket, bu migration'in kapsami DEGIL):
-- increment_coins (mig 055) ve batch_increment_question_stats (mig 022) hala authenticated'a
-- acik -- increment_xp/grant_multiplayer_stats gibi service-role-only'e sikilastirilmadi.
--
-- mastery_level: bu migration'a DAHIL DEGIL (esik-kurali hicbir yerde tanimli degil,
-- yeni is-kurali tasarimi gerektirir -- Faz-1'in "buyuk rewrite yapma" kisitina gri-alan
-- eklerdi). questions_seen/correct/last_seen_at dogru guncelleniyor, mastery_level
-- default(0) kaliyor -- mevcut durumdan regresyon degil (zaten hep 0'di, hic yazilmiyordu).
--
-- Rollback:
--   BEGIN;
--     DROP FUNCTION IF EXISTS public.complete_game_session(
--       UUID, UUID, TEXT, TEXT, TEXT, SMALLINT, JSONB, INTEGER, INTEGER, INTEGER,
--       SMALLINT, SMALLINT, INTEGER, NUMERIC
--     );
--     ALTER TABLE public.game_sessions DROP COLUMN IF EXISTS client_request_id;
--     -- route.ts eski cok-adimli koduna donmeli (ayri commit'te), aksi halde route
--     -- artik var olmayan RPC'yi cagirir ve tum oturum-kaydetme kirilir.
--   COMMIT;

BEGIN;

-- Idempotency backstop: ayni kullanicidan ayni client_request_id ikinci INSERT'te
-- unique_violation firlatir (NULL'lar constraint'e girmez, coklu-NULL serbest --
-- eski/dolayli insert path'leri etkilenmez, sadece yeni RPC bu kolonu doldurur).
ALTER TABLE public.game_sessions
  ADD COLUMN IF NOT EXISTS client_request_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_game_sessions_user_client_request
  ON public.game_sessions (user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE FUNCTION public.complete_game_session(
  p_user_id           UUID,
  p_client_request_id UUID,
  p_game              TEXT,
  p_mode              TEXT,
  p_category          TEXT,
  p_filter_difficulty SMALLINT,
  p_answers           JSONB,
  p_total_xp          INTEGER,
  p_base_xp           INTEGER,
  p_bonus_xp          INTEGER,
  p_correct_count     SMALLINT,
  p_wrong_count       SMALLINT,
  p_time_spent_sec    INTEGER,
  p_avg_time_sec      NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing RECORD;
  v_session_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required' USING ERRCODE = '42501';
  END IF;
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'client_request_id required' USING ERRCODE = '22023';
  END IF;

  -- Hizli-yol idempotency: ayni istek daha once tamamen islendiyse ayni sonucu don
  SELECT id, total_xp, correct_count, wrong_count
    INTO v_existing
    FROM game_sessions
    WHERE user_id = p_user_id AND client_request_id = p_client_request_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'sessionId', v_existing.id,
      'totalXP', v_existing.total_xp,
      'correctCount', v_existing.correct_count,
      'wrongCount', v_existing.wrong_count,
      'alreadyProcessed', true
    );
  END IF;

  -- 1. Session insert (dogrudan completed -- tek-transaction'da 'active' ara-durumuna
  -- gerek yok; grep dogrulandi: game_sessions.status='active' baska hicbir yerde
  -- okunmuyor, sadece bu tablonun kendi INSERT'inde yaziliyordu).
  BEGIN
    INSERT INTO game_sessions (
      user_id, client_request_id, game, mode, status,
      total_questions, correct_count, wrong_count, skipped_count,
      base_xp, bonus_xp, total_xp, time_spent_sec, avg_time_sec,
      streak_at_start, completed_at, filter_category, filter_difficulty
    ) VALUES (
      p_user_id, p_client_request_id, p_game, p_mode, 'completed',
      p_correct_count + p_wrong_count, p_correct_count, p_wrong_count, 0,
      p_base_xp, p_bonus_xp, p_total_xp, p_time_spent_sec, p_avg_time_sec,
      0, NOW(), p_category, p_filter_difficulty
    )
    RETURNING id INTO v_session_id;
  EXCEPTION WHEN unique_violation THEN
    -- Gercek es-zamanli cakisma (iki concurrent istek ayni client_request_id):
    -- diger transaction commit oldu, sonucunu don -- hata firlatma.
    SELECT id, total_xp, correct_count, wrong_count
      INTO v_existing
      FROM game_sessions
      WHERE user_id = p_user_id AND client_request_id = p_client_request_id;
    RETURN jsonb_build_object(
      'sessionId', v_existing.id,
      'totalXP', v_existing.total_xp,
      'correctCount', v_existing.correct_count,
      'wrongCount', v_existing.wrong_count,
      'alreadyProcessed', true
    );
  END;

  -- 2. Cevaplari toplu ekle
  INSERT INTO session_answers (
    session_id, question_id, user_id, selected_option, is_correct,
    is_skipped, time_taken_sec, is_fast, xp_earned, question_order
  )
  SELECT
    v_session_id, x.question_id, p_user_id, x.selected_option, x.is_correct,
    x.is_skipped, x.time_taken_sec, x.is_fast, x.xp_earned, x.question_order
  FROM jsonb_to_recordset(p_answers) AS x(
    question_id UUID, selected_option SMALLINT, is_correct BOOLEAN,
    is_skipped BOOLEAN, time_taken_sec NUMERIC, is_fast BOOLEAN,
    xp_earned SMALLINT, question_order SMALLINT
  );

  -- 2b. Soru-bazli istatistikler (nested cagri, ayni transaction)
  PERFORM batch_increment_question_stats(
    (SELECT array_agg((x->>'question_id')::uuid) FROM jsonb_array_elements(p_answers) x),
    (SELECT array_agg((x->>'is_correct')::boolean) FROM jsonb_array_elements(p_answers) x)
  );

  -- 3. Coin -- yalniz dogru-cevap varsa (increment_coins p_amount<=0'da RAISE eder,
  -- 0-dogru bir oturumu tum transaction'i geri alarak kaybettirmemek icin guard)
  IF p_correct_count > 0 THEN
    PERFORM increment_coins(p_user_id, p_correct_count);
  END IF;

  -- 4. XP + seviye + ledger (increment_xp icinde atomik) -- ayni guard: p_total_xp=0
  -- (tum sorulari yanlis yapan ogrenci) gecerli bir senaryo, increment_xp'yi
  -- cagirmamak GEREKIR yoksa RAISE tum session'i geri alir.
  IF p_total_xp > 0 THEN
    PERFORM increment_xp(p_user_id, p_total_xp, 'session_complete', v_session_id);
  END IF;

  -- 5. Konu-ilerleme -- atomik upsert (select-then-write DEGIL, iki concurrent
  -- session ayni kategoriye yazarsa lost-update'i onler). accuracy_pct'e ARTIK
  -- YAZILMIYOR (GENERATED ALWAYS kolon -- eski bug buradaydi).
  IF p_category IS NOT NULL AND length(trim(p_category)) > 0 THEN
    INSERT INTO user_topic_progress (user_id, game, category, questions_seen, correct, last_seen_at)
    VALUES (p_user_id, p_game, p_category, p_correct_count + p_wrong_count, p_correct_count, NOW())
    ON CONFLICT (user_id, game, category) DO UPDATE SET
      questions_seen = user_topic_progress.questions_seen + EXCLUDED.questions_seen,
      correct = user_topic_progress.correct + EXCLUDED.correct,
      last_seen_at = NOW();
  END IF;

  RETURN jsonb_build_object(
    'sessionId', v_session_id,
    'totalXP', p_total_xp,
    'correctCount', p_correct_count,
    'wrongCount', p_wrong_count,
    'alreadyProcessed', false
  );
END;
$$;

-- DEFINER fonksiyon: yalniz service_role cagirabilir (grant_multiplayer_stats/increment_xp
-- deseniyle tutarli -- route zaten auth+server-side XP hesaplama yaptiktan sonra cagirir).
REVOKE EXECUTE ON FUNCTION public.complete_game_session(
  UUID, UUID, TEXT, TEXT, TEXT, SMALLINT, JSONB, INTEGER, INTEGER, INTEGER,
  SMALLINT, SMALLINT, INTEGER, NUMERIC
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_game_session(
  UUID, UUID, TEXT, TEXT, TEXT, SMALLINT, JSONB, INTEGER, INTEGER, INTEGER,
  SMALLINT, SMALLINT, INTEGER, NUMERIC
) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_game_session(
  UUID, UUID, TEXT, TEXT, TEXT, SMALLINT, JSONB, INTEGER, INTEGER, INTEGER,
  SMALLINT, SMALLINT, INTEGER, NUMERIC
) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_game_session(
  UUID, UUID, TEXT, TEXT, TEXT, SMALLINT, JSONB, INTEGER, INTEGER, INTEGER,
  SMALLINT, SMALLINT, INTEGER, NUMERIC
) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
