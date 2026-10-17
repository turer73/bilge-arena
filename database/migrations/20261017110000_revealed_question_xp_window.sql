-- Cevabi acilmis soru 7 gun XP vermez (derin inceleme 2026-10-15 §4.2,
-- §9 aksiyon 9; Klipper disc #2578)
--
-- Sorun. Her notlama dogru sikki acar (secim -1 ya da yanlis olsa da). Bir bot
-- notlamayla bankayi toplayip ayni sorulari baska denemelerde %100 oynayabiliyor.
-- 20261017100000'daki gunluk oturum XP tavani (1500) getiriyi sinirliyor ama
-- toplanan cevaplarla oynamayi XP'siz birakmiyordu.
--
-- Karar (kullanici, 2026-10-17): bir sorunun cevabi bir denemede acildiktan
-- sonra 7 gun boyunca BASKA bir denemede o soru 0 XP verir. Soru dogruluk,
-- gunluk gorev ve FSRS sayimlarinda kalir; yalniz XP odemesi duser.
--
-- Cozum.
--   * question_answer_reveals(user_id, question_id): kullanici ve soru basina
--     odeme penceresini tasiyan deneme ve acilma ani. Notlama her acilista
--     record_question_reveal'i cagirir. Satir yoksa ya da 7 gunden eskiyse bu
--     deneme pencereyi alir; aksi halde satir degismez.
--   * complete_game_session odemeyi su sirayla hesaplar: nominal XP, eksi
--     pencerenin baska denemeye ait oldugu sorularin XP'si, sonra gunluk tavan.
--     total_xp ve xp_earned nominal kalir (106'nin baglama dogrulamasi).
--   * complete_verified_game_session dogrulanmis denemeyi islem-yerel bir
--     ayarla (bilge.verified_attempt_id) ic fonksiyona iletir; imza degismez.
--
-- SINIR. Pencere sabirli bir botu yalniz geciktirir: bankayi bir kez toplayip
-- 7 gun bekleyen bot, sonra her soruyu haftada bir kez odeyerek gunluk tavana
-- kadar XP alir. Kural "topla ve hemen oyna" saldirisini ve haftalik liderlikte
-- anlik sisirmeyi kapatir; uzun vadeli sinir gunluk tavandir.
--
-- Uygulama sirasi: 20261017100000'dan sonra. Notlama route'u RPC yoksa
-- (PGRST202) notlamayi engellemez, yalniz loglar; migration route'tan once ya
-- da sonra uygulanabilir. RPC'den once acilan cevaplar kayitli degildir.
--
-- Geri alma: complete_game_session icin 20261017100000, sarmalayici icin 092
-- tanimini yeniden uygulamak; DROP FUNCTION record_question_reveal; DROP TABLE
-- question_answer_reveals.

BEGIN;

CREATE TABLE IF NOT EXISTS public.question_answer_reveals (
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id uuid NOT NULL,
  attempt_id  uuid NOT NULL REFERENCES public.verified_attempts(id) ON DELETE CASCADE,
  revealed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, question_id)
);

COMMENT ON TABLE public.question_answer_reveals IS
  'Kullanici ve soru basina XP odeme penceresi: cevabi ilk acan deneme ve ani. Pencere 7 gun; yalniz record_question_reveal yazar.';

ALTER TABLE public.question_answer_reveals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.question_answer_reveals FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_question_reveal(
  p_user_id     uuid,
  p_attempt_id  uuid,
  p_question_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  c_reveal_window CONSTANT interval := interval '7 days';
  v_attempt public.verified_attempts%ROWTYPE;
  v_owner uuid;
BEGIN
  IF p_user_id IS NULL OR p_attempt_id IS NULL OR p_question_id IS NULL THEN
    RAISE EXCEPTION 'user, attempt and question are required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_attempt FROM public.verified_attempts WHERE id = p_attempt_id;
  IF NOT FOUND OR v_attempt.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'attempt owner mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT (p_question_id = ANY(v_attempt.question_ids)) THEN
    RAISE EXCEPTION 'question is not part of the attempt' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.question_answer_reveals AS r (user_id, question_id, attempt_id, revealed_at)
  VALUES (p_user_id, p_question_id, p_attempt_id, clock_timestamp())
  ON CONFLICT (user_id, question_id) DO UPDATE
    SET attempt_id = EXCLUDED.attempt_id,
        revealed_at = EXCLUDED.revealed_at
    WHERE r.revealed_at <= clock_timestamp() - c_reveal_window;

  SELECT attempt_id INTO v_owner
    FROM public.question_answer_reveals
    WHERE user_id = p_user_id AND question_id = p_question_id;

  -- true: bu deneme sorunun XP penceresinin sahibi (soru XP verebilir).
  RETURN v_owner = p_attempt_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_question_reveal(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_question_reveal(uuid, uuid, uuid) TO service_role;

-- 20261017100000'daki tanim + tekrar kurali.
CREATE OR REPLACE FUNCTION public.complete_game_session(
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
SET search_path = pg_catalog
AS $fn$
DECLARE
  -- Istanbul gunu basina odenecek en cok oturum XP'si. Ayar tek yerde.
  c_daily_session_xp_cap CONSTANT integer := 1500;
  -- Cevabi baska bir denemede acilmis soru bu sure boyunca XP vermez.
  c_reveal_window CONSTANT interval := interval '7 days';
  v_existing RECORD;
  v_session_id UUID;
  v_xp_today integer;
  v_xp_awarded integer;
  v_attempt_id uuid;
  v_repeat_xp integer := 0;
  v_repeat_count integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required' USING ERRCODE = '42501';
  END IF;
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'client_request_id required' USING ERRCODE = '22023';
  END IF;

  -- Hizli-yol idempotency: ayni istek daha once tamamen islendiyse ayni sonucu don
  SELECT id, total_xp, correct_count, wrong_count, xp_awarded
    INTO v_existing
    FROM public.game_sessions
    WHERE user_id = p_user_id AND client_request_id = p_client_request_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'sessionId', v_existing.id,
      'totalXP', v_existing.total_xp,
      'xpAwarded', COALESCE(v_existing.xp_awarded, v_existing.total_xp),
      'correctCount', v_existing.correct_count,
      'wrongCount', v_existing.wrong_count,
      'alreadyProcessed', true
    );
  END IF;

  -- complete_verified_game_session bu islemde dogrulanmis denemeyi yazar
  -- (set_config ..., true). Dogrudan cagrida (yalniz sahip) tekrar kurali yok.
  v_attempt_id := NULLIF(current_setting('bilge.verified_attempt_id', true), '')::uuid;

  -- 1. Session insert -- BILEREK 'active' ile baslar, ayni islemde 'completed'a
  -- UPDATE edilir: trg_session_complete (update_weekly_leaderboard) yalniz
  -- active -> completed gecisinde tetiklenir (bkz. 081/129).
  BEGIN
    INSERT INTO public.game_sessions (
      user_id, client_request_id, game, mode, status,
      total_questions, correct_count, wrong_count, skipped_count,
      base_xp, bonus_xp, total_xp, time_spent_sec, avg_time_sec,
      streak_at_start, filter_category, filter_difficulty
    ) VALUES (
      p_user_id, p_client_request_id, p_game, p_mode, 'active',
      p_correct_count + p_wrong_count, p_correct_count, p_wrong_count, 0,
      p_base_xp, p_bonus_xp, p_total_xp, p_time_spent_sec, p_avg_time_sec,
      0, p_category, p_filter_difficulty
    )
    RETURNING id INTO v_session_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id, total_xp, correct_count, wrong_count, xp_awarded
      INTO v_existing
      FROM public.game_sessions
      WHERE user_id = p_user_id AND client_request_id = p_client_request_id;
    RETURN jsonb_build_object(
      'sessionId', v_existing.id,
      'totalXP', v_existing.total_xp,
      'xpAwarded', COALESCE(v_existing.xp_awarded, v_existing.total_xp),
      'correctCount', v_existing.correct_count,
      'wrongCount', v_existing.wrong_count,
      'alreadyProcessed', true
    );
  END;

  -- 2. Cevaplari toplu ekle
  INSERT INTO public.session_answers (
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
  PERFORM public.batch_increment_question_stats(
    (SELECT array_agg((x->>'question_id')::uuid) FROM jsonb_array_elements(p_answers) x),
    (SELECT array_agg((x->>'is_correct')::boolean) FROM jsonb_array_elements(p_answers) x)
  );

  -- 3. Gunluk oturum XP tavani. Profil satiri kilitlenir: ayni kullanicinin
  -- eszamanli tamamlamalari burada siralanir ve sonraki okuma oncekinin
  -- commit ettigi xp_log satirini gorur. FOR UPDATE degil FOR NO KEY UPDATE:
  -- game_sessions INSERT'inin FK kontrolu profilde KEY SHARE tutar; FOR UPDATE
  -- iki eszamanli oturumda bu KEY SHARE'lerle kilitlenmeye (deadlock) girer.
  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR NO KEY UPDATE;
  SELECT COALESCE(sum(xl.amount), 0)::integer
    INTO v_xp_today
    FROM public.xp_log AS xl
    WHERE xl.user_id = p_user_id
      AND xl.reason = 'session_complete'
      AND xl.created_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul');
  -- Tekrar kurali: cevabi son 7 gunde BASKA bir denemede acilmis sorunun XP'si
  -- odenmez. Soru dogruluk, gorev ve FSRS sayimlarinda kalir; yalniz odeme
  -- duser (total_xp ve xp_earned nominal: 106 dogrulamasi).
  IF v_attempt_id IS NOT NULL THEN
    SELECT COALESCE(sum(GREATEST(x.xp_earned, 0)), 0)::integer,
           count(*) FILTER (WHERE x.xp_earned > 0)::integer
      INTO v_repeat_xp, v_repeat_count
      FROM jsonb_to_recordset(p_answers) AS x(question_id uuid, xp_earned smallint)
      JOIN public.question_answer_reveals AS r
        ON r.user_id = p_user_id AND r.question_id = x.question_id
      WHERE r.attempt_id <> v_attempt_id
        AND r.revealed_at > now() - c_reveal_window;
  END IF;

  v_xp_awarded := LEAST(
    GREATEST(COALESCE(p_total_xp, 0) - v_repeat_xp, 0),
    GREATEST(c_daily_session_xp_cap - v_xp_today, 0)
  );

  -- 4. active -> completed (trg_session_complete'i tetikler; haftalik liderlik
  -- xp_awarded'i kullanir). completed_at burada set edilir.
  UPDATE public.game_sessions
    SET status = 'completed', completed_at = now(), xp_awarded = v_xp_awarded
    WHERE id = v_session_id;

  -- 5. Coin: 129'dan beri yalniz apply_verified_session_rewards icinde.

  -- 6. XP + seviye + xp_log (increment_xp icinde atomik). 0 XP (hepsi yanlis
  -- ya da tavan dolu) gecerli: increment_xp p_amount <= 0'da RAISE eder.
  IF v_xp_awarded > 0 THEN
    PERFORM public.increment_xp(p_user_id, v_xp_awarded, 'session_complete', v_session_id);
  END IF;

  -- 7. Konu-ilerleme -- atomik upsert.
  IF p_category IS NOT NULL AND length(trim(p_category)) > 0 THEN
    INSERT INTO public.user_topic_progress AS utp (user_id, game, category, questions_seen, correct, last_seen_at)
    VALUES (p_user_id, p_game, p_category, p_correct_count + p_wrong_count, p_correct_count, now())
    ON CONFLICT (user_id, game, category) DO UPDATE SET
      questions_seen = utp.questions_seen + EXCLUDED.questions_seen,
      correct = utp.correct + EXCLUDED.correct,
      last_seen_at = now();
  END IF;

  RETURN jsonb_build_object(
    'sessionId', v_session_id,
    'totalXP', p_total_xp,
    'xpAwarded', v_xp_awarded,
    'xpRepeatWithheld', v_repeat_xp,
    'repeatQuestions', v_repeat_count,
    'correctCount', p_correct_count,
    'wrongCount', p_wrong_count,
    'alreadyProcessed', false
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.complete_game_session(
  UUID, UUID, TEXT, TEXT, TEXT, SMALLINT, JSONB, INTEGER, INTEGER, INTEGER,
  SMALLINT, SMALLINT, INTEGER, NUMERIC
) FROM PUBLIC, anon, authenticated, service_role;

-- 092'deki tanim; tek fark ic fonksiyondan once dogrulanmis denemenin
-- islem-yerel ayara yazilmasi.
CREATE OR REPLACE FUNCTION public.complete_verified_game_session(
    p_attempt_id         UUID,
    p_user_id            UUID,
    p_client_request_id  UUID,
    p_game               TEXT,
    p_mode               TEXT,
    p_category           TEXT,
    p_filter_difficulty  SMALLINT,
    p_answers            JSONB,
    p_total_xp           INTEGER,
    p_base_xp            INTEGER,
    p_bonus_xp           INTEGER,
    p_correct_count      SMALLINT,
    p_wrong_count        SMALLINT,
    p_time_spent_sec     INTEGER,
    p_avg_time_sec       NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_attempt         RECORD;
    v_result          JSONB;
    v_submitted_ids   UUID[];
    v_existing_game   RECORD;
BEGIN
    -- Lock the verified attempt row, preventing concurrent completions.
    SELECT * INTO v_attempt
    FROM public.verified_attempts
    WHERE id = p_attempt_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'attempt % not found', p_attempt_id
            USING ERRCODE = 'P0002';
    END IF;

    -- Explicitly reject NULL or mismatched user, game, or mode.
    IF v_attempt.user_id IS DISTINCT FROM p_user_id THEN
        RAISE EXCEPTION 'user_id mismatch for attempt %', p_attempt_id
            USING ERRCODE = '42501';
    END IF;
    IF v_attempt.game IS DISTINCT FROM p_game OR v_attempt.mode IS DISTINCT FROM p_mode THEN
        RAISE EXCEPTION 'game or mode mismatch for attempt %', p_attempt_id
            USING ERRCODE = '22023';
    END IF;

    -- Replay path: if this attempt was already completed, return the original session data.
    IF v_attempt.completed_at IS NOT NULL AND v_attempt.session_id IS NOT NULL THEN
        SELECT id, total_xp, correct_count, wrong_count
        INTO v_existing_game
        FROM public.game_sessions
        WHERE id = v_attempt.session_id AND user_id = p_user_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'session % not found or mismatched user', v_attempt.session_id
                USING ERRCODE = 'P0002';
        END IF;
        RETURN jsonb_build_object(
            'sessionId',        v_existing_game.id,
            'totalXP',          v_existing_game.total_xp,
            'correctCount',     v_existing_game.correct_count,
            'wrongCount',       v_existing_game.wrong_count,
            'alreadyProcessed', true
        );
    END IF;

    -- Fresh path: the attempt must not be expired.
    IF v_attempt.expires_at <= clock_timestamp() THEN
        RAISE EXCEPTION 'attempt % has expired (expires_at %)', p_attempt_id, v_attempt.expires_at
            USING ERRCODE = '22023';
    END IF;

    -- p_answers must be a non-empty JSON array.
    IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' OR jsonb_array_length(p_answers) = 0 THEN
        RAISE EXCEPTION 'answers must be a non-empty JSON array'
            USING ERRCODE = '22023';
    END IF;

    -- Every element must contain a canonical 8-4-4-4-12 hex UUID in question_id.
    PERFORM 1 FROM jsonb_array_elements(p_answers) AS elem
    WHERE (elem->>'question_id') IS NULL
       OR (elem->>'question_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    IF FOUND THEN
        RAISE EXCEPTION 'each answer must contain a canonical UUID question_id'
            USING ERRCODE = '22023';
    END IF;

    -- Extract the submitted IDs (now safe to cast).
    SELECT array_agg(qid ORDER BY qid) INTO v_submitted_ids
    FROM (
        SELECT (elem->>'question_id')::uuid AS qid
        FROM jsonb_array_elements(p_answers) AS elem
    ) sub;

    -- No duplicate question_ids allowed.
    IF cardinality(v_submitted_ids) != (SELECT COUNT(DISTINCT uid) FROM unnest(v_submitted_ids) AS uid) THEN
        RAISE EXCEPTION 'duplicate question_ids in answers'
            USING ERRCODE = '22023';
    END IF;

    -- Submitted IDs must be a subset of the issued IDs (life exhaustion allows early stop).
    IF EXISTS (
        SELECT 1 FROM unnest(v_submitted_ids) AS uid
        WHERE uid != ALL(v_attempt.question_ids)
    ) THEN
        RAISE EXCEPTION 'submitted question_ids must be a subset of issued question_ids'
            USING ERRCODE = '22023';
    END IF;

    -- client_request_id must be present and unique for this user.
    IF p_client_request_id IS NULL THEN
        RAISE EXCEPTION 'client_request_id must not be NULL'
            USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.game_sessions
        WHERE user_id = p_user_id AND client_request_id = p_client_request_id
    ) THEN
        RAISE EXCEPTION 'duplicate client_request_id for user %', p_user_id
            USING ERRCODE = '23505';
    END IF;

    -- Tekrar kurali icin dogrulanmis deneme ic fonksiyona islem-yerel olarak
    -- iletilir (20261017110000). Imza degismez.
    PERFORM set_config('bilge.verified_attempt_id', p_attempt_id::text, true);

    -- Delegate to the original 14-arg SECURITY DEFINER function in the same transaction.
    v_result := public.complete_game_session(
        p_user_id, p_client_request_id, p_game, p_mode, p_category,
        p_filter_difficulty, p_answers, p_total_xp, p_base_xp, p_bonus_xp,
        p_correct_count, p_wrong_count, p_time_spent_sec, p_avg_time_sec
    );

    -- The result must be non-null, contain a sessionId, and represent a fresh completion.
    IF v_result IS NULL THEN
        RAISE EXCEPTION 'internal error: complete_game_session returned NULL'
            USING ERRCODE = 'P0002';
    END IF;
    IF v_result->>'sessionId' IS NULL THEN
        RAISE EXCEPTION 'internal error: complete_game_session returned null sessionId'
            USING ERRCODE = 'P0002';
    END IF;
    IF (v_result->>'alreadyProcessed') IS DISTINCT FROM 'false' THEN
        RAISE EXCEPTION 'concurrent collision: attempt already completed'
            USING ERRCODE = '23505';
    END IF;

    -- Bind the session to the locked attempt with a single UPDATE.
    UPDATE public.verified_attempts
    SET session_id = (v_result->>'sessionId')::uuid,
        completed_at = clock_timestamp()
    WHERE id = p_attempt_id;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_verified_game_session(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, SMALLINT, JSONB, INTEGER, INTEGER, INTEGER,
    SMALLINT, SMALLINT, INTEGER, NUMERIC
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_verified_game_session(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, SMALLINT, JSONB, INTEGER, INTEGER, INTEGER,
    SMALLINT, SMALLINT, INTEGER, NUMERIC
) TO service_role;

DO $verify$
DECLARE
  v_inner text := 'public.complete_game_session(uuid,uuid,text,text,text,smallint,jsonb,integer,integer,integer,smallint,smallint,integer,numeric)';
  v_wrapper text := 'public.complete_verified_game_session(uuid,uuid,uuid,text,text,text,smallint,jsonb,integer,integer,integer,smallint,smallint,integer,numeric)';
BEGIN
  IF position('question_answer_reveals' IN pg_get_functiondef(v_inner::regprocedure)) = 0
     OR position('c_daily_session_xp_cap' IN pg_get_functiondef(v_inner::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'revealed question xp: complete_game_session lacks the repeat rule or the daily cap';
  END IF;
  IF position('bilge.verified_attempt_id' IN pg_get_functiondef(v_wrapper::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'revealed question xp: wrapper does not pass the verified attempt';
  END IF;
  IF has_function_privilege('authenticated', 'public.record_question_reveal(uuid,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.record_question_reveal(uuid,uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.record_question_reveal(uuid,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', v_inner, 'EXECUTE')
     OR has_function_privilege('authenticated', v_wrapper, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_wrapper, 'EXECUTE') THEN
    RAISE EXCEPTION 'revealed question xp: unexpected function privileges';
  END IF;
  IF has_table_privilege('service_role', 'public.question_answer_reveals', 'SELECT')
     OR has_table_privilege('authenticated', 'public.question_answer_reveals', 'SELECT')
     OR has_table_privilege('anon', 'public.question_answer_reveals', 'SELECT') THEN
    RAISE EXCEPTION 'revealed question xp: reveal table must be private';
  END IF;
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
