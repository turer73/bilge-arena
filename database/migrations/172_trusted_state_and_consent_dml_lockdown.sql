-- Migration 172: economy/leaderboard state and evidentiary logs are route-only.
--
-- Live effective-privilege review found historical table/column grants still
-- made user_daily_quests, leaderboard_weekly and several evidence queues
-- writable through PostgREST. RLS limited some rows to auth.uid(), but it did
-- not make client-supplied completion, rank or consent evidence trustworthy.

BEGIN;

-- Remove every historical mutation policy, including policies that are only
-- latent after the ACL revoke. SELECT policies are preserved or recreated.
DROP POLICY IF EXISTS "daily_own" ON public.user_daily_quests;
DROP POLICY IF EXISTS "user_daily_quests_select_own" ON public.user_daily_quests;
CREATE POLICY "user_daily_quests_select_own" ON public.user_daily_quests
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "lb_own" ON public.leaderboard_weekly;
DROP POLICY IF EXISTS "lb_own_update" ON public.leaderboard_weekly;

DROP POLICY IF EXISTS "badges_own" ON public.user_badges;
DROP POLICY IF EXISTS "user_badges_select_own" ON public.user_badges;
CREATE POLICY "user_badges_select_own" ON public.user_badges
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Service can insert logs" ON public.client_logs;
DROP POLICY IF EXISTS "Anyone can insert consent logs" ON public.consent_logs;
DROP POLICY IF EXISTS "premium_waitlist_insert_anyone" ON public.premium_waitlist;
DROP POLICY IF EXISTS "premium_waitlist_insert_service_role_only" ON public.premium_waitlist;
DROP POLICY IF EXISTS "premium_waitlist_update_admin" ON public.premium_waitlist;
DROP POLICY IF EXISTS "user_reports_insert" ON public.user_reports;
DROP POLICY IF EXISTS "user_reports_update_admin" ON public.user_reports;
DROP POLICY IF EXISTS "user_reports_select_admin" ON public.user_reports;

-- Table-level REVOKE does not remove a historical column grant. Revoke both
-- layers, including PUBLIC inheritance, then add back only server INSERTs.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.badges,
  public.client_logs,
  public.consent_logs,
  public.daily_quests,
  public.leaderboard_weekly,
  public.premium_waitlist,
  public.user_achievements,
  public.user_badges,
  public.user_daily_quests,
  public.user_reports
FROM PUBLIC, anon, authenticated, service_role;

DO $revoke_columns$
DECLARE
  v_column record;
BEGIN
  FOR v_column IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (
        'badges', 'client_logs', 'consent_logs', 'daily_quests',
        'leaderboard_weekly', 'premium_waitlist', 'user_achievements',
        'user_badges', 'user_daily_quests', 'user_reports'
      )
  LOOP
    EXECUTE format(
      'REVOKE INSERT (%I), UPDATE (%I) ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role',
      v_column.column_name, v_column.column_name, v_column.table_name
    );
  END LOOP;
END
$revoke_columns$;

GRANT INSERT ON TABLE public.client_logs TO service_role;
-- The auth callback needs both current-evidence/intent-owner lookups and the
-- append-only insert. Declare the read privilege instead of depending on an
-- inherited/default Supabase grant that may differ between environments.
GRANT SELECT, INSERT ON TABLE public.consent_logs TO service_role;
GRANT INSERT ON TABLE public.premium_waitlist TO service_role;
GRANT INSERT ON TABLE public.user_daily_quests TO service_role;
GRANT INSERT ON TABLE public.user_reports TO service_role;

-- OAuth/magic-link callback binds one signed legal-consent intent to at most
-- one user. Two rows are expected per intent (terms + KVKK notice), hence the
-- pair key. Legacy/cookie rows have no intentId and are intentionally outside
-- this partial index.
CREATE UNIQUE INDEX IF NOT EXISTS ux_consent_logs_legal_intent_type
  ON public.consent_logs ((consent_value ->> 'intentId'), consent_type)
  WHERE consent_type IN ('terms', 'kvkk')
    AND consent_value ? 'intentId';

-- PII-bearing waitlist rows are not an AAL1/PostgREST admin read surface.
-- There is currently no admin waitlist UI; operational access remains through
-- the database owner until a governed AAL2 route is introduced.
REVOKE SELECT ON TABLE public.premium_waitlist FROM PUBLIC, anon, authenticated;

DO $revoke_waitlist_columns$
DECLARE
  v_column record;
BEGIN
  FOR v_column IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'premium_waitlist'
  LOOP
    EXECUTE format(
      'REVOKE SELECT (%I) ON TABLE public.premium_waitlist FROM PUBLIC, anon, authenticated',
      v_column.column_name
    );
  END LOOP;
END
$revoke_waitlist_columns$;

-- Bind a daily reward to the immutable completion evidence emitted by
-- apply_verified_session_rewards. This is defense-in-depth beyond the ACL:
-- even a pre-migration forged, unclaimed row cannot mint XP or coins.
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
  SELECT
    udq.id,
    udq.user_id,
    udq.date,
    udq.current_value,
    udq.is_completed,
    udq.completed_at,
    udq.xp_claimed,
    dq.target_value,
    dq.xp_reward,
    dq.is_active,
    EXISTS (
      SELECT 1
      FROM public.reward_ledger evidence
      WHERE evidence.user_id = udq.user_id
        AND evidence.source_type = 'daily_quest_completion'
        AND evidence.source_id = udq.id
        AND evidence.reward_type = 'progress'
        AND evidence.reward_key = 'completed'
    ) AS has_verified_completion
  INTO v_quest
  FROM public.user_daily_quests AS udq
  JOIN public.daily_quests AS dq ON dq.id = udq.quest_id
  WHERE udq.id = p_user_quest_id
  FOR UPDATE OF udq;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'daily quest not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_quest.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'daily quest owner mismatch' USING ERRCODE = '42501';
  END IF;

  -- Preserve idempotent replay for rewards that were already committed before
  -- this migration, even if their historical completion evidence is absent.
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

  IF v_quest.is_active IS NOT TRUE
     OR v_quest.is_completed IS NOT TRUE
     OR v_quest.completed_at IS NULL
     OR COALESCE(v_quest.current_value, 0) < v_quest.target_value
     OR v_quest.date IS DISTINCT FROM
        (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date
     OR v_quest.has_verified_completion IS NOT TRUE THEN
    RAISE EXCEPTION 'daily quest has no verified current-day completion'
      USING ERRCODE = '22023';
  END IF;

  v_xp_earned := COALESCE(v_quest.xp_reward, 0);
  IF v_xp_earned <= 0 THEN
    RAISE EXCEPTION 'daily quest reward must be positive' USING ERRCODE = '22023';
  END IF;
  v_coins_earned := GREATEST(
    5,
    LEAST(25, ROUND(v_xp_earned::numeric * 0.2)::integer)
  );

  UPDATE public.user_daily_quests
  SET xp_claimed = true
  WHERE id = p_user_quest_id;

  PERFORM public.increment_xp(
    p_user_id,
    v_xp_earned,
    'daily_quest',
    p_user_quest_id
  );
  PERFORM public.increment_coins(p_user_id, v_coins_earned);

  INSERT INTO public.reward_ledger (
    user_id, source_type, source_id, reward_type, reward_key, amount, metadata
  )
  VALUES
    (
      p_user_id, 'daily_quest_claim', p_user_quest_id, 'xp', 'claimed',
      v_xp_earned,
      jsonb_build_object(
        'completionEvidence', 'verified_session',
        'coinFormula', 'max(5, min(25, round(xp_reward * 0.2)))'
      )
    ),
    (
      p_user_id, 'daily_quest_claim', p_user_quest_id, 'coin', 'claimed',
      v_coins_earned,
      jsonb_build_object(
        'completionEvidence', 'verified_session',
        'coinFormula', 'max(5, min(25, round(xp_reward * 0.2)))'
      )
    );

  RETURN jsonb_build_object(
    'xpEarned', v_xp_earned,
    'coinsEarned', v_coins_earned,
    'alreadyProcessed', false
  );
END
$claim$;

REVOKE ALL ON FUNCTION public.claim_daily_quest_reward(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_quest_reward(uuid, uuid)
  TO service_role;

DO $verify$
DECLARE
  v_table text;
  v_role text;
  v_policy_count integer;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'public.badges', 'public.client_logs', 'public.consent_logs',
    'public.daily_quests', 'public.leaderboard_weekly',
    'public.premium_waitlist', 'public.user_achievements',
    'public.user_badges', 'public.user_daily_quests', 'public.user_reports'
  ] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_table_privilege(v_role, v_table, 'INSERT')
         OR has_table_privilege(v_role, v_table, 'UPDATE')
         OR has_table_privilege(v_role, v_table, 'DELETE')
         OR has_table_privilege(v_role, v_table, 'TRUNCATE')
         OR has_table_privilege(v_role, v_table, 'REFERENCES')
         OR has_table_privilege(v_role, v_table, 'TRIGGER')
         OR has_any_column_privilege(v_role, v_table, 'INSERT')
         OR has_any_column_privilege(v_role, v_table, 'UPDATE') THEN
        RAISE EXCEPTION '172 verification: browser DML remains on % for %', v_table, v_role;
      END IF;
    END LOOP;
  END LOOP;

  FOREACH v_table IN ARRAY ARRAY[
    'public.badges', 'public.daily_quests', 'public.leaderboard_weekly',
    'public.user_achievements', 'public.user_badges'
  ] LOOP
    IF has_table_privilege('service_role', v_table, 'INSERT')
       OR has_table_privilege('service_role', v_table, 'UPDATE')
       OR has_table_privilege('service_role', v_table, 'DELETE')
       OR has_any_column_privilege('service_role', v_table, 'INSERT')
       OR has_any_column_privilege('service_role', v_table, 'UPDATE') THEN
      RAISE EXCEPTION '172 verification: direct service writer remains on %', v_table;
    END IF;
  END LOOP;

  FOREACH v_table IN ARRAY ARRAY[
    'public.client_logs', 'public.consent_logs', 'public.premium_waitlist',
    'public.user_daily_quests', 'public.user_reports'
  ] LOOP
    IF NOT has_table_privilege('service_role', v_table, 'INSERT')
       OR has_table_privilege('service_role', v_table, 'UPDATE')
       OR has_table_privilege('service_role', v_table, 'DELETE') THEN
      RAISE EXCEPTION '172 verification: service INSERT-only contract invalid on %', v_table;
    END IF;
  END LOOP;

  IF NOT has_table_privilege('service_role', 'public.consent_logs', 'SELECT') THEN
    RAISE EXCEPTION '172 verification: service consent evidence read is missing';
  END IF;

  SELECT count(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'badges', 'client_logs', 'consent_logs', 'daily_quests',
      'leaderboard_weekly', 'premium_waitlist', 'user_achievements',
      'user_badges', 'user_daily_quests', 'user_reports'
    )
    AND cmd <> 'SELECT';
  IF v_policy_count <> 0 THEN
    RAISE EXCEPTION '172 verification: % non-SELECT policies remain', v_policy_count;
  END IF;

  IF has_table_privilege('authenticated', 'public.premium_waitlist', 'SELECT')
     OR has_table_privilege('anon', 'public.premium_waitlist', 'SELECT')
     OR has_any_column_privilege('authenticated', 'public.premium_waitlist', 'SELECT')
     OR has_any_column_privilege('anon', 'public.premium_waitlist', 'SELECT')
     OR has_function_privilege(
       'authenticated',
       'public.claim_daily_quest_reward(uuid,uuid)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.claim_daily_quest_reward(uuid,uuid)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION '172 verification: read/RPC boundary is invalid';
  END IF;

  IF to_regclass('public.ux_consent_logs_legal_intent_type') IS NULL THEN
    RAISE EXCEPTION '172 verification: legal consent replay index missing';
  END IF;
END
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';
