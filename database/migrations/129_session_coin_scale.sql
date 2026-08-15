-- Migration 129: oturum altin olcegi ve tek odeme noktasi.
--
-- SORUN 1 - hesap iki yerdeydi. Altin odemesi complete_game_session icinde
-- (increment_coins), denetim kaydi ise apply_verified_session_rewards icinde
-- (reward_ledger) yapiliyordu. Ikisi de ayni v_correct_count'u kullandigi icin
-- bugune kadar tutarli kaldilar, ama katsayi/prim/tavan gibi bir kural
-- eklenince iki yazim noktasi sessizce ayrisirdi.
--
-- SORUN 2 - olcek. Kazanim dogru cevap basina 1 altindi; ortalama oturum
-- ~9 altin veriyordu. Magazadaki en ucuz urun 1200 altin, yani ~133 oturum.
-- Kisi basi ortalama oturum 5.5 iken bu ulasilamaz; bugune kadar hic satin
-- alma gerceklesmedi.
--
-- COZUM. Odeme ve defter kaydi ayni isleme alindi (tek hesap noktasi) ve
-- olcek buyutuldu:
--   dogru cevap basina 3 + oturum primi 10 + gunun ilk oturumu 15
--   gunluk tavan 80 (farmlamaya karsi; XP tarafi bu tavandan etkilenmez)
-- 15 soruluk oturumda ~10 dogru -> 40 altin. Haftada uc oturum ~120-150.
--
-- Idempotency degismedi: XP satiri hala sentinel, reward_ledger tekilligi
-- (source_type, source_id, reward_type, reward_key) ayni oturumun iki kez
-- odenmesini engelliyor.
--
-- DAVRANIS DEGISIKLIGI: complete_game_session dogrudan cagrilirsa artik altin
-- vermez. Odul yalniz dogrulanmis oturuma (verified_attempts) aittir; bu
-- bilincli bir sikilastirmadir.
BEGIN;

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

  -- 1. Session insert -- BILEREK 'active' ile baslar, hemen ardindan 'completed'a
  -- UPDATE edilir (asagida, ayni transaction). Bu iki-adimli dans ZORUNLU: trg_session_complete
  -- (full-schema.sql:549-550, AFTER UPDATE ON game_sessions) YALNIZ NEW.status='completed'
  -- AND OLD.status='active' gecisinde tetiklenir -- haftalik leaderboard (leaderboard_weekly),
  -- update_streak(), VE profiles.total_sessions/total_questions/correct_answers hepsi bu
  -- trigger'a bagli. Dogrudan status='completed' ile INSERT yapmak (ilk taslak) bu trigger'i
  -- hic tetiklemezdi -- leaderboard/streak/profil-sayaclari sessizce donardi (Vercel Agent
  -- Review bulgusu, PR#271). NOT: trg_session_complete HICBIR numarali migration'da yok --
  -- yalniz full-schema.sql/schema.sql/setup.js'te (mevcut migration-drift sorunu, Turgut'un
  -- dis denetim raporunda ayrica flag'lendi, bu migration'in kapsami DEGIL).
  BEGIN
    INSERT INTO game_sessions (
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

  -- 2c. active -> completed (trg_session_complete'i tetikler -- leaderboard/streak/
  -- profil-sayaclari, yukaridaki not). completed_at burada set edilir.
  UPDATE game_sessions SET status = 'completed', completed_at = NOW()
  WHERE id = v_session_id;

  -- 3. Coin: migration 129 ile BURADAN KALDIRILDI. Altin artik yalniz
  -- apply_verified_session_rewards icinde, reward_ledger kaydiyla ayni islemde
  -- veriliyor. Hesap tek yerde durmazsa katsayi/prim/tavan kurallari iki
  -- yazim noktasi arasinda sessizce ayrisir.

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
    gs.total_xp,
    gs.correct_count,
    gs.total_questions,
    gs.game
  INTO
    v_user_id,
    v_game,
    v_total_xp,
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
    jsonb_build_object('attemptId', p_attempt_id, 'game', v_game)
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
  FOR UPDATE;

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

NOTIFY pgrst, 'reload schema';
COMMIT;
