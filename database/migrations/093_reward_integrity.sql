-- Migration 093: verified-session reward integrity and append-only reward ledger
--
-- R0.3 closes the remaining split reward paths.  A verified session is first
-- committed by 081/092, then the NULL -> non-NULL verified_attempt binding
-- invokes the private helper below in that same transaction.  Any helper
-- failure therefore rolls back session, answers, XP, coins and the binding.
--
-- Quest-claim coins keep the established economy: round(xp_reward * 0.2),
-- clamped to the inclusive 5..25 range.
-- This is stored in reward_ledger metadata so clients can render the result
-- without re-deriving a mutable policy.
--
-- Rollback (forward-data warning: do not erase audit rows in production):
--   BEGIN;
--   DROP TRIGGER IF EXISTS trg_verified_attempt_reward_integrity ON public.verified_attempts;
--   DROP FUNCTION IF EXISTS public.trg_verified_attempt_reward_integrity();
--   DROP FUNCTION IF EXISTS public.apply_verified_session_rewards(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.claim_daily_quest_reward(uuid, uuid);
--   ALTER TABLE public.user_achievements DROP COLUMN IF EXISTS source_session_id;
--   DROP TABLE IF EXISTS public.reward_ledger;
--   COMMIT;

BEGIN;

CREATE TABLE IF NOT EXISTS public.reward_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  reward_type text NOT NULL,
  reward_key text NOT NULL,
  amount integer NOT NULL CHECK (amount >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT reward_ledger_source_identity_unique
    UNIQUE (source_type, source_id, reward_type, reward_key)
);

CREATE INDEX IF NOT EXISTS reward_ledger_user_created_idx
  ON public.reward_ledger (user_id, created_at DESC);

ALTER TABLE public.reward_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reward_ledger FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.reward_ledger
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.reward_ledger TO authenticated;
DROP POLICY IF EXISTS reward_ledger_own_select ON public.reward_ledger;
CREATE POLICY reward_ledger_own_select ON public.reward_ledger
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- xp_log used to have a FOR ALL own-row policy.  It is an audit log, so users
-- retain only read access; every write stays inside trusted definer functions.
ALTER TABLE public.xp_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.xp_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.xp_log TO authenticated;
DROP POLICY IF EXISTS xp_own ON public.xp_log;
DROP POLICY IF EXISTS xp_log_own_select ON public.xp_log;
DO $migration$
DECLARE
  v_policy_name text;
BEGIN
  FOR v_policy_name IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'xp_log'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.xp_log', v_policy_name);
  END LOOP;
END
$migration$;
CREATE POLICY xp_log_own_select ON public.xp_log
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

ALTER TABLE public.user_achievements
  ADD COLUMN IF NOT EXISTS source_session_id uuid;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_achievements_source_session_id_fkey'
      AND conrelid = 'public.user_achievements'::regclass
  ) THEN
    ALTER TABLE public.user_achievements
      ADD CONSTRAINT user_achievements_source_session_id_fkey
      FOREIGN KEY (source_session_id)
      REFERENCES public.game_sessions(id)
      ON DELETE SET NULL;
  END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS user_achievements_source_session_idx
  ON public.user_achievements (source_session_id)
  WHERE source_session_id IS NOT NULL;

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

  INSERT INTO public.reward_ledger (
    user_id, source_type, source_id, reward_type, reward_key, amount, metadata
  )
  VALUES (
    v_user_id, 'session', p_session_id, 'coin', 'correct_answers',
    COALESCE(v_correct_count, 0),
    jsonb_build_object('attemptId', p_attempt_id, 'game', v_game)
  );

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

CREATE OR REPLACE FUNCTION public.trg_verified_attempt_reward_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $trigger$
BEGIN
  PERFORM public.apply_verified_session_rewards(NEW.id, NEW.session_id);
  RETURN NEW;
END;
$trigger$;

REVOKE ALL ON FUNCTION public.trg_verified_attempt_reward_integrity()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_verified_attempt_reward_integrity ON public.verified_attempts;
CREATE TRIGGER trg_verified_attempt_reward_integrity
AFTER UPDATE OF completed_at, session_id ON public.verified_attempts
FOR EACH ROW
WHEN (
  OLD.completed_at IS NULL
  AND OLD.session_id IS NULL
  AND NEW.completed_at IS NOT NULL
  AND NEW.session_id IS NOT NULL
)
EXECUTE FUNCTION public.trg_verified_attempt_reward_integrity();

CREATE OR REPLACE FUNCTION public.claim_daily_quest_reward(
  p_user_id uuid,
  p_user_quest_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $claim$
DECLARE
  v_quest record;
  v_xp_earned integer;
  v_coins_earned integer;
BEGIN
  SELECT udq.id, udq.user_id, udq.is_completed, udq.xp_claimed, dq.xp_reward
  INTO v_quest
  FROM public.user_daily_quests AS udq
  JOIN public.daily_quests AS dq ON dq.id = udq.quest_id
  WHERE udq.id = p_user_quest_id
  FOR UPDATE OF udq;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'daily quest not found'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_quest.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'daily quest owner mismatch'
      USING ERRCODE = '42501';
  END IF;
  IF v_quest.is_completed IS NOT TRUE THEN
    RAISE EXCEPTION 'daily quest is not completed'
      USING ERRCODE = '22023';
  END IF;

  IF v_quest.xp_claimed IS TRUE THEN
    SELECT COALESCE(max(amount) FILTER (WHERE reward_type = 'xp'), 0),
           COALESCE(max(amount) FILTER (WHERE reward_type = 'coin'), 0)
    INTO v_xp_earned, v_coins_earned
    FROM public.reward_ledger
    WHERE source_type = 'daily_quest_claim'
      AND source_id = p_user_quest_id
      AND reward_key = 'claimed';
    RETURN jsonb_build_object(
      'xpEarned', v_xp_earned,
      'coinsEarned', v_coins_earned,
      'alreadyProcessed', true
    );
  END IF;

  v_xp_earned := COALESCE(v_quest.xp_reward, 0);
  IF v_xp_earned <= 0 THEN
    RAISE EXCEPTION 'daily quest reward must be positive'
      USING ERRCODE = '22023';
  END IF;
  v_coins_earned := GREATEST(5, LEAST(25, ROUND(v_xp_earned::numeric * 0.2)::integer));

  UPDATE public.user_daily_quests
  SET xp_claimed = true
  WHERE id = p_user_quest_id;

  PERFORM public.increment_xp(p_user_id, v_xp_earned, 'daily_quest', p_user_quest_id);
  PERFORM public.increment_coins(p_user_id, v_coins_earned);

  INSERT INTO public.reward_ledger (
    user_id, source_type, source_id, reward_type, reward_key, amount, metadata
  )
  VALUES
    (p_user_id, 'daily_quest_claim', p_user_quest_id, 'xp', 'claimed', v_xp_earned,
      jsonb_build_object('coinFormula', 'max(5, min(25, round(xp_reward * 0.2)))')),
    (p_user_id, 'daily_quest_claim', p_user_quest_id, 'coin', 'claimed', v_coins_earned,
      jsonb_build_object('coinFormula', 'max(5, min(25, round(xp_reward * 0.2)))'));

  RETURN jsonb_build_object(
    'xpEarned', v_xp_earned,
    'coinsEarned', v_coins_earned,
    'alreadyProcessed', false
  );
END;
$claim$;

REVOKE ALL ON FUNCTION public.claim_daily_quest_reward(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_quest_reward(uuid, uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
