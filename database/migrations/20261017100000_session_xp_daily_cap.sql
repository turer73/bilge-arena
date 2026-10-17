-- Oturum XP'sine gunluk tavan; haftalik XP liderligi odenen XP ve Istanbul
-- haftasiyla (derin inceleme 2026-10-15 §4.2, §9 aksiyon 9)
--
-- Sorun 1 - tavan yok. Oturum XP'si sinirsizdi. Cevap anahtari notlamayla
-- toplanabildigi icin (her notlama dogru sikki acar) bir bot bankayi bir
-- saatin altinda toplayip sonra %100 oturumlar oynayabiliyordu. Tum zamanlar
-- liderligi profiles.total_xp'ye, haftalik liderlik leaderboard_weekly.xp_earned'a
-- gore siralaniyor. Canli olcum (2026-10-17): tum zamanlar zirvesi 5.830 XP,
-- haftalik zirve 840 XP.
--
-- Sorun 2 - hafta UTC. update_weekly_leaderboard ve leaderboard_weekly_ranked
-- haftayi date_trunc('week', now()) ile, yani veritabani saat diliminde (UTC)
-- aciyordu. Lig, gorevler ve altin tavani Istanbul gununu kullaniyor.
--
-- COZUM
--   * Oturum XP'si Istanbul gununde en cok c_daily_session_xp_cap (2500) odenir.
--     Gunun odenmis oturum XP'si xp_log'daki 'session_complete' satirlarindan
--     okunur (bu nedeni yalniz complete_game_session yazar). Kullanici profil
--     satiri kilitlenerek ayni kullanicinin eszamanli oturumlari siralanir.
--   * game_sessions.total_xp NOMINAL kalir: 106'nin baglama tetikleyicisi onu
--     cevaplardan yeniden hesaplayip esitlik ister. Odenen miktar yeni
--     game_sessions.xp_awarded sutununa yazilir; profil/xp_log, haftalik
--     liderlik ve reward_ledger'in oturum XP satiri bu degeri kullanir.
--   * Haftalik liderlik ve gorunumu Istanbul haftasini (pazartesi 00:00) kullanir.
--   * Profil kilitleri FOR NO KEY UPDATE. 129'daki apply_verified_session_rewards
--     profili FOR UPDATE ile kilitliyordu. Ayni kullanicinin iki oturumu
--     eszamanli tamamlaninca, her birinin game_sessions INSERT'i FK uzerinden
--     profilde KEY SHARE tuttugu icin ikisi kilitleniyordu (deadlock; gercek
--     PostgreSQL 16 testiyle olculdu). NO KEY UPDATE, KEY SHARE ile catismaz.
--
-- Tavan degeri 2500 (kullanici karari, 2026-10-17). Canli olcum, son 90 gun:
-- oturum XP'li 116 kullanici-gunu; p50 290, p90 910, p99 ~1634, en yuksek 2270.
-- 1500'u asan yalniz 3 gun vardi ve uc de durust gorunuyordu (%80-88 dogruluk,
-- soru basina 13-17 sn). 2500 bunlarin hicbirini kesmez. Bot icin kazanc gunde
-- 2500 ile sinirlanir; tavan cevap toplamayi engellemez, getirisini sinirlar.
--
-- DAVRANIS: complete_game_session JSON'una 'xpAwarded' eklendi. 'totalXP'
-- nominal (cevaplardan hesaplanan) kalir.
--
-- Uygulama sirasi: route, xp_awarded sutunu yoksa nominal XP'yi gosterir; bu
-- migration route'tan once ya da sonra uygulanabilir.
--
-- Geri alma: complete_game_session ve apply_verified_session_rewards icin 129,
-- update_weekly_leaderboard icin 007 (+030 search_path), gorunum icin 177
-- tanimlarini yeniden uygulamak. xp_awarded sutunu kalabilir (NULL = nominal).

BEGIN;

ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS xp_awarded integer;

DO $constraint$
BEGIN
  ALTER TABLE public.game_sessions
    ADD CONSTRAINT game_sessions_xp_awarded_range
    CHECK (xp_awarded IS NULL OR (xp_awarded >= 0 AND xp_awarded <= total_xp));
EXCEPTION WHEN duplicate_object THEN NULL;
END
$constraint$;

COMMENT ON COLUMN public.game_sessions.xp_awarded IS
  'Bu oturum icin fiilen odenen XP (gunluk oturum XP tavanindan sonra). NULL = tavandan onceki kayit; total_xp odenmistir.';

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
  c_daily_session_xp_cap CONSTANT integer := 2500;
  v_existing RECORD;
  v_session_id UUID;
  v_xp_today integer;
  v_xp_awarded integer;
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
  v_xp_awarded := LEAST(
    GREATEST(COALESCE(p_total_xp, 0), 0),
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
    'correctCount', p_correct_count,
    'wrongCount', p_wrong_count,
    'alreadyProcessed', false
  );
END;
$fn$;

-- 092'den beri yalniz complete_verified_game_session (sahip yetkisiyle) cagirir.
REVOKE ALL ON FUNCTION public.complete_game_session(
  UUID, UUID, TEXT, TEXT, TEXT, SMALLINT, JSONB, INTEGER, INTEGER, INTEGER,
  SMALLINT, SMALLINT, INTEGER, NUMERIC
) FROM PUBLIC, anon, authenticated, service_role;

-- Oturum XP defter satiri (reward_ledger 'session_complete') odenen miktari
-- yazar; nominal oturum puani metadata.nominalXp'de kalir. Govde 129 ile ayni,
-- yalniz XP kaynagi ve metadata degisti.
CREATE OR REPLACE FUNCTION public.apply_verified_session_rewards(
  p_attempt_id uuid,
  p_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid;
  v_game text;
  v_session_game text;
  v_total_xp integer;
  v_nominal_xp integer;
  v_correct_count integer;
  v_total_questions integer;
  v_session_correct_streak integer;
  v_current_streak integer;
  v_total_sessions integer;
  v_correct_answers integer;
  v_longest_streak integer;
  v_profile_xp integer;
  v_rooms_completed integer;
  v_multiplayer_firsts integer;
  v_completed_quests integer;
  v_first_application boolean;
  v_badge_xp integer := 0;
  -- Migration 129 - altin olcegi. Ayar tek yerde.
  v_coin_amount integer;
  v_coins_today integer;
  v_is_first_today boolean;
  c_coin_per_correct constant integer := 3;
  c_session_bonus constant integer := 10;
  c_first_session_bonus constant integer := 15;
  c_daily_coin_cap constant integer := 80;
BEGIN
  -- Lock the exact attempt/session pair.  The trigger can only call this for
  -- a completed binding, and this check prevents a definer caller from mixing
  -- users, games or unrelated sessions.
  SELECT
    va.user_id,
    va.game,
    -- Odenen oturum XP'si (gunluk tavandan sonra); NULL = tavandan onceki kayit.
    COALESCE(gs.xp_awarded, gs.total_xp),
    gs.total_xp,
    gs.correct_count,
    gs.total_questions,
    gs.game
  INTO
    v_user_id,
    v_game,
    v_total_xp,
    v_nominal_xp,
    v_correct_count,
    v_total_questions,
    v_session_game
  FROM public.verified_attempts AS va
  JOIN public.game_sessions AS gs ON gs.id = va.session_id
  WHERE va.id = p_attempt_id
    AND va.session_id = p_session_id
    AND va.completed_at IS NOT NULL
    AND gs.status = 'completed'
  FOR UPDATE OF va, gs;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'verified completed attempt/session pair not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- A session game mismatch cannot be represented by the application path.
  IF v_game IS DISTINCT FROM v_session_game THEN
    RAISE EXCEPTION 'verified attempt game does not match completed session'
      USING ERRCODE = '22023';
  END IF;

  -- The session XP row is the idempotency sentinel.  A replay never performs
  -- this NULL->non-NULL update, but this also makes direct repeated helper
  -- execution harmless.
  INSERT INTO public.reward_ledger (
    user_id, source_type, source_id, reward_type, reward_key, amount, metadata
  )
  VALUES (
    v_user_id, 'session', p_session_id, 'xp', 'session_complete',
    COALESCE(v_total_xp, 0),
    jsonb_build_object('attemptId', p_attempt_id, 'game', v_game, 'nominalXp', v_nominal_xp)
  )
  ON CONFLICT (source_type, source_id, reward_type, reward_key) DO NOTHING
  RETURNING true INTO v_first_application;

  IF COALESCE(v_first_application, false) IS NOT TRUE THEN
    RETURN;
  END IF;

  -- Altin: dogru cevap katsayisi + oturum primi + gunun ilk oturumu primi,
  -- gunluk tavanla sinirli. Odeme ve defter kaydi AYNI islemde yapilir;
  -- migration 129 oncesinde odeme complete_game_session icindeydi ve hesap
  -- iki ayri yerde durdugu icin ayrisma riski tasiyordu.
  SELECT COALESCE(sum(amount), 0), COALESCE(sum(amount), 0) = 0
  INTO v_coins_today, v_is_first_today
  FROM public.reward_ledger
  WHERE user_id = v_user_id
    AND reward_type = 'coin'
    AND source_type = 'session'
    AND created_at >= timezone('Europe/Istanbul', date_trunc('day', timezone('Europe/Istanbul', now())));

  v_coin_amount := COALESCE(v_correct_count, 0) * c_coin_per_correct
    + c_session_bonus
    + CASE WHEN v_is_first_today THEN c_first_session_bonus ELSE 0 END;
  v_coin_amount := LEAST(v_coin_amount, GREATEST(c_daily_coin_cap - v_coins_today, 0));

  INSERT INTO public.reward_ledger (
    user_id, source_type, source_id, reward_type, reward_key, amount, metadata
  )
  VALUES (
    v_user_id, 'session', p_session_id, 'coin', 'correct_answers',
    v_coin_amount,
    jsonb_build_object(
      'attemptId', p_attempt_id, 'game', v_game,
      'correct', COALESCE(v_correct_count, 0),
      'firstToday', v_is_first_today,
      'dailyCap', c_daily_coin_cap
    )
  );

  -- increment_coins p_amount <= 0'da RAISE eder; tavana takilan oturum tum
  -- islemi geri almamali.
  IF v_coin_amount > 0 THEN
    PERFORM public.increment_coins(v_user_id, v_coin_amount);
  END IF;

  -- Lock this state before it is used for streak quests or badge eligibility.
  -- It also serializes reward application for concurrent sessions of a user.
  -- NO KEY UPDATE (129 had FOR UPDATE): a concurrent session's game_sessions
  -- INSERT holds KEY SHARE on this row through its FK, and upgrading to FOR
  -- UPDATE against it deadlocks two sessions of one user.
  SELECT
    COALESCE(p.current_streak, 0),
    COALESCE(p.total_sessions, 0),
    COALESCE(p.correct_answers, 0),
    COALESCE(p.longest_streak, 0),
    COALESCE(p.total_xp, 0),
    COALESCE(p.rooms_completed, 0),
    COALESCE(p.multiplayer_firsts, 0)
  INTO
    v_current_streak,
    v_total_sessions,
    v_correct_answers,
    v_longest_streak,
    v_profile_xp,
    v_rooms_completed,
    v_multiplayer_firsts
  FROM public.profiles AS p
  WHERE p.id = v_user_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found for verified session reward'
      USING ERRCODE = 'P0002';
  END IF;

  -- current_streak is a daily-login/activity metric. Quest streaks instead
  -- use the maximum consecutive correct run in this completed session.
  WITH ordered_answers AS (
    SELECT
      sa.is_correct,
      sum(CASE WHEN sa.is_correct IS TRUE THEN 0 ELSE 1 END)
        OVER (ORDER BY sa.question_order NULLS LAST, sa.question_id) AS run_group
    FROM public.session_answers AS sa
    WHERE sa.session_id = p_session_id
  ), correct_runs AS (
    SELECT count(*)::integer AS run_length
    FROM ordered_answers
    WHERE is_correct IS TRUE
    GROUP BY run_group
  )
  SELECT COALESCE(max(run_length), 0)
  INTO v_session_correct_streak
  FROM correct_runs;

  -- Quest transitions are set-based and scoped to Istanbul's calendar day.
  -- UPDATE expressions reference the locked current row, so concurrent session
  -- completions cannot overwrite one another's progress.
  WITH changed_quests AS (
    UPDATE public.user_daily_quests AS udq
    SET
      current_value = CASE dq.quest_type
        WHEN 'play_sessions' THEN COALESCE(udq.current_value, 0) + 1
        WHEN 'correct_answers' THEN COALESCE(udq.current_value, 0) + COALESCE(v_correct_count, 0)
        WHEN 'streak_maintain' THEN GREATEST(COALESCE(udq.current_value, 0), v_session_correct_streak)
        WHEN 'accuracy' THEN GREATEST(
          COALESCE(udq.current_value, 0),
          CASE WHEN COALESCE(v_total_questions, 0) > 0
            THEN ROUND((COALESCE(v_correct_count, 0)::numeric / v_total_questions) * 100)::integer
            ELSE 0 END
        )
        WHEN 'specific_game' THEN CASE
          WHEN dq.target_game = v_game THEN COALESCE(udq.current_value, 0) + 1
          ELSE COALESCE(udq.current_value, 0) END
        ELSE COALESCE(udq.current_value, 0)
      END,
      is_completed = CASE
        WHEN CASE dq.quest_type
          WHEN 'play_sessions' THEN COALESCE(udq.current_value, 0) + 1
          WHEN 'correct_answers' THEN COALESCE(udq.current_value, 0) + COALESCE(v_correct_count, 0)
          WHEN 'streak_maintain' THEN GREATEST(COALESCE(udq.current_value, 0), v_session_correct_streak)
          WHEN 'accuracy' THEN GREATEST(
            COALESCE(udq.current_value, 0),
            CASE WHEN COALESCE(v_total_questions, 0) > 0
              THEN ROUND((COALESCE(v_correct_count, 0)::numeric / v_total_questions) * 100)::integer
              ELSE 0 END
          )
          WHEN 'specific_game' THEN CASE
            WHEN dq.target_game = v_game THEN COALESCE(udq.current_value, 0) + 1
            ELSE COALESCE(udq.current_value, 0) END
          ELSE COALESCE(udq.current_value, 0)
        END >= dq.target_value THEN true
        ELSE false
      END,
      completed_at = CASE
        WHEN CASE dq.quest_type
          WHEN 'play_sessions' THEN COALESCE(udq.current_value, 0) + 1
          WHEN 'correct_answers' THEN COALESCE(udq.current_value, 0) + COALESCE(v_correct_count, 0)
          WHEN 'streak_maintain' THEN GREATEST(COALESCE(udq.current_value, 0), v_session_correct_streak)
          WHEN 'accuracy' THEN GREATEST(
            COALESCE(udq.current_value, 0),
            CASE WHEN COALESCE(v_total_questions, 0) > 0
              THEN ROUND((COALESCE(v_correct_count, 0)::numeric / v_total_questions) * 100)::integer
              ELSE 0 END
          )
          WHEN 'specific_game' THEN CASE
            WHEN dq.target_game = v_game THEN COALESCE(udq.current_value, 0) + 1
            ELSE COALESCE(udq.current_value, 0) END
          ELSE COALESCE(udq.current_value, 0)
        END >= dq.target_value THEN clock_timestamp()
        ELSE NULL
      END
    FROM public.daily_quests AS dq
    WHERE udq.quest_id = dq.id
      AND udq.user_id = v_user_id
      AND udq.date = (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
      AND udq.is_completed = false
    RETURNING udq.id, dq.slug, udq.is_completed
  )
  INSERT INTO public.reward_ledger (
    user_id, source_type, source_id, reward_type, reward_key, amount, metadata
  )
  SELECT
    v_user_id, 'daily_quest_completion', changed_quests.id, 'progress', 'completed', 0,
    jsonb_build_object('sessionId', p_session_id, 'quest', changed_quests.slug)
  FROM changed_quests
  WHERE changed_quests.is_completed IS TRUE
  ON CONFLICT (source_type, source_id, reward_type, reward_key) DO NOTHING;

  SELECT count(*)::integer
  INTO v_completed_quests
  FROM public.user_daily_quests AS udq
  WHERE udq.user_id = v_user_id
    AND udq.is_completed = true;

  WITH eligible_badges(code, xp_reward) AS (
    SELECT code, xp_reward
    FROM (VALUES
      ('first_game', 50, v_total_sessions >= 1),
      ('ten_games', 100, v_total_sessions >= 10),
      ('fifty_games', 250, v_total_sessions >= 50),
      ('hundred_games', 500, v_total_sessions >= 100),
      ('first_correct', 25, v_correct_answers >= 1),
      ('hundred_correct', 200, v_correct_answers >= 100),
      ('thousand_correct', 1000, v_correct_answers >= 1000),
      ('streak_5', 75, v_longest_streak >= 5),
      ('streak_10', 200, v_longest_streak >= 10),
      ('streak_20', 500, v_longest_streak >= 20),
      ('xp_1000', 100, v_profile_xp >= 1000),
      ('xp_10000', 500, v_profile_xp >= 10000),
      ('xp_50000', 2000, v_profile_xp >= 50000),
      ('daily_first', 50, v_completed_quests >= 1),
      ('login_7', 150, v_current_streak >= 7),
      ('login_30', 750, v_current_streak >= 30),
      ('login_100', 3000, v_current_streak >= 100),
      ('mp_first_room', 50, v_rooms_completed >= 1),
      ('mp_ten_rooms', 200, v_rooms_completed >= 10),
      ('mp_first_win', 150, v_multiplayer_firsts >= 1),
      ('mp_five_firsts', 500, v_multiplayer_firsts >= 5)
    ) AS definitions(code, xp_reward, eligible)
    WHERE eligible
  ), inserted_badges AS (
    INSERT INTO public.user_achievements (
      user_id, achievement_id, earned_at, source_session_id
    )
    SELECT v_user_id, eligible_badges.code, clock_timestamp(), p_session_id
    FROM eligible_badges
    ON CONFLICT (user_id, achievement_id) DO NOTHING
    RETURNING achievement_id
  ), ledger_badges AS (
    INSERT INTO public.reward_ledger (
      user_id, source_type, source_id, reward_type, reward_key, amount, metadata
    )
    SELECT
      v_user_id, 'badge', p_session_id, 'xp', inserted_badges.achievement_id,
      eligible_badges.xp_reward,
      jsonb_build_object('badge', inserted_badges.achievement_id)
    FROM inserted_badges
    JOIN eligible_badges ON eligible_badges.code = inserted_badges.achievement_id
    ON CONFLICT (source_type, source_id, reward_type, reward_key) DO NOTHING
    RETURNING amount
  )
  SELECT COALESCE(sum(amount), 0)::integer INTO v_badge_xp FROM ledger_badges;

  IF v_badge_xp > 0 THEN
    PERFORM public.increment_xp(v_user_id, v_badge_xp, 'badge_earned', p_session_id);
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_verified_session_rewards(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Haftalik XP liderligi: odenen XP ve Istanbul haftasi. Govde 007 ile ayni;
-- search_path 030'daki public yerine pg_catalog (tum adlar nitelikli).
CREATE OR REPLACE FUNCTION public.update_weekly_leaderboard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_week_start date := (date_trunc('week', now() AT TIME ZONE 'Europe/Istanbul'))::date;
  v_week_end   date := v_week_start + 6;
  v_xp         integer;
BEGIN
  IF NEW.status = 'completed' AND OLD.status = 'active' THEN
    v_xp := COALESCE(NEW.xp_awarded, NEW.total_xp);
    INSERT INTO public.leaderboard_weekly AS lw (user_id, week_start, week_end, xp_earned, sessions_played, correct_answers)
    VALUES (NEW.user_id, v_week_start, v_week_end, v_xp, 1, NEW.correct_count)
    ON CONFLICT (user_id, week_start) DO UPDATE SET
      xp_earned       = lw.xp_earned + v_xp,
      sessions_played = lw.sessions_played + 1,
      correct_answers = lw.correct_answers + NEW.correct_count,
      accuracy_pct    = round(
        (lw.correct_answers + NEW.correct_count)::numeric /
        NULLIF(lw.sessions_played * 10, 0) * 100, 2
      );

    -- Seri guncelle (tek yazici: update_streak, Istanbul gunu)
    PERFORM public.update_streak(NEW.user_id);

    -- Profil stat guncelle
    UPDATE public.profiles SET
      total_sessions  = total_sessions + 1,
      total_questions = total_questions + NEW.total_questions,
      correct_answers = correct_answers + NEW.correct_count
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.update_weekly_leaderboard()
  FROM PUBLIC, anon, authenticated, service_role;

-- 177'deki gorunum; tek fark hafta filtresi Istanbul haftasi.
CREATE OR REPLACE VIEW public.leaderboard_weekly_ranked
WITH (security_invoker = true)
AS
SELECT
  lw.id,
  lw.user_id,
  lw.week_start,
  lw.week_end,
  lw.xp_earned,
  lw.sessions_played,
  lw.correct_answers,
  lw.accuracy_pct,
  lw.rank,
  p.username,
  p.display_name,
  p.avatar_url,
  p.level_name,
  p.current_streak,
  RANK() OVER (
    PARTITION BY lw.week_start
    ORDER BY lw.xp_earned DESC
  ) AS current_rank
FROM public.leaderboard_weekly lw
JOIN public.profiles p ON p.id = lw.user_id
WHERE lw.week_start = (date_trunc('week', now() AT TIME ZONE 'Europe/Istanbul'))::date
  AND p.leaderboard_opt_in
  AND p.deleted_at IS NULL
  AND p.username NOT LIKE '\_\_honeypot\_%\_\_' ESCAPE '\';

REVOKE ALL ON TABLE public.leaderboard_weekly_ranked
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.leaderboard_weekly_ranked TO service_role;

DO $verify$
DECLARE
  v_signature text := 'public.complete_game_session(uuid,uuid,text,text,text,smallint,jsonb,integer,integer,integer,smallint,smallint,integer,numeric)';
BEGIN
  IF position('c_daily_session_xp_cap' IN pg_get_functiondef(v_signature::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'session xp cap: complete_game_session has no daily cap';
  END IF;
  IF has_function_privilege('service_role', v_signature, 'EXECUTE')
     OR has_function_privilege('authenticated', v_signature, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.apply_verified_session_rewards(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.update_weekly_leaderboard()', 'EXECUTE') THEN
    RAISE EXCEPTION 'session xp cap: internal session functions must not be executable by API roles';
  END IF;
  IF has_table_privilege('anon', 'public.leaderboard_weekly_ranked', 'SELECT')
     OR has_table_privilege('authenticated', 'public.leaderboard_weekly_ranked', 'SELECT') THEN
    RAISE EXCEPTION 'session xp cap: a browser role can read the weekly ranking view';
  END IF;
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
