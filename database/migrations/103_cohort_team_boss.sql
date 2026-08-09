-- Migration 103: read-only cohort team boss derived exclusively from R3.1 contributions.
-- It creates no tables, triggers, rewards, or mutable state.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_weekly_team_boss(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_current_week date := public.weekly_learning_league_week_start(clock_timestamp());
  v_pref public.weekly_learning_league_preferences%ROWTYPE;
  v_member public.weekly_learning_league_memberships%ROWTYPE;
  v_cohort public.weekly_learning_league_cohorts%ROWTYPE;
  v_week_start date;
  v_status text;
  v_member_count integer;
  v_active_member_count integer;
  v_total integer;
  v_owner integer;
  v_target integer;
  v_progress integer;
  v_remaining integer;
  v_percent integer;
  v_phase text;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id is required' USING ERRCODE = '22023'; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'team boss owner mismatch' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_pref FROM public.weekly_learning_league_preferences WHERE user_id=p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','opted_out','weekStart',NULL,'boss',NULL,'team',NULL,
      'privacy',jsonb_build_object('cohortOnly',true,'individualsHidden',true,'verifiedOnly',true,'rewardFree',true));
  END IF;
  SELECT * INTO v_member FROM public.weekly_learning_league_memberships
  WHERE user_id=p_user_id AND (week_start=v_current_week OR status='finalized')
  ORDER BY (week_start=v_current_week) DESC, week_start DESC LIMIT 1;
  IF NOT FOUND THEN
    v_status := CASE WHEN v_pref.opted_in THEN 'waiting' ELSE 'opted_out' END;
    RETURN jsonb_build_object('status',v_status,'weekStart',NULL,'boss',NULL,'team',NULL,
      'privacy',jsonb_build_object('cohortOnly',true,'individualsHidden',true,'verifiedOnly',true,'rewardFree',true));
  END IF;
  IF v_member.status='waiting' THEN
    RETURN jsonb_build_object('status','waiting','weekStart',NULL,'boss',NULL,'team',NULL,
      'privacy',jsonb_build_object('cohortOnly',true,'individualsHidden',true,'verifiedOnly',true,'rewardFree',true));
  END IF;
  SELECT * INTO v_cohort FROM public.weekly_learning_league_cohorts
  WHERE id=v_member.cohort_id AND week_start=v_member.week_start;
  IF NOT FOUND OR v_cohort.status NOT IN ('active','finalized') THEN RAISE EXCEPTION 'invalid league cohort' USING ERRCODE='23514'; END IF;
  v_week_start := v_member.week_start;
  v_status := CASE WHEN v_cohort.status='finalized' THEN 'finalized' ELSE 'active' END;

  SELECT count(*)::integer INTO v_member_count
  FROM public.weekly_learning_league_memberships m
  WHERE m.cohort_id=v_member.cohort_id AND m.week_start=v_member.week_start
    AND m.status IN ('active','finalized');
  IF v_member_count NOT BETWEEN 20 AND 30 THEN
    RAISE EXCEPTION 'team boss requires a 20-30 member cohort' USING ERRCODE='23514';
  END IF;
  v_target := v_member_count * 30;

  -- Every predicate is needed: a contribution cannot be reassigned to another
  -- membership/cohort/user, and only positive, trusted R3.1 rows count.
  SELECT COALESCE(sum(c.points),0)::integer,
         count(DISTINCT m.user_id) FILTER (WHERE c.points>0)::integer,
         COALESCE(sum(c.points) FILTER (WHERE c.user_id=p_user_id),0)::integer
  INTO v_total,v_active_member_count,v_owner
  FROM public.weekly_learning_league_contributions c
  JOIN public.weekly_learning_league_memberships m
    ON m.id=c.membership_id AND m.user_id=c.user_id AND m.cohort_id=c.cohort_id
   AND m.cohort_id=v_member.cohort_id AND m.week_start=v_week_start
   AND m.status IN ('active','finalized')
  JOIN public.weekly_learning_league_cohorts cohort ON cohort.id=m.cohort_id
   AND cohort.id=v_member.cohort_id AND cohort.week_start=v_week_start
  WHERE c.cohort_id=v_member.cohort_id AND c.points>0;

  v_progress := least(v_total,v_target);
  v_remaining := v_target-v_progress;
  v_percent := least(100,greatest(0,(v_progress*100)/v_target));
  v_owner := least(210,greatest(0,v_owner));
  v_phase := CASE WHEN v_progress=v_target THEN 'defeated'
    WHEN v_progress*3 < v_target THEN 'awakening'
    WHEN v_progress*3 < v_target*2 THEN 'weakened'
    ELSE 'critical' END;
  RETURN jsonb_build_object('status',v_status,'weekStart',v_week_start::text,
    'boss',jsonb_build_object('name','Unutma Ejderi','phase',v_phase,'target',v_target,
      'progress',v_progress,'remaining',v_remaining,'progressPercent',v_percent,
      'defeated',v_progress=v_target),
    'team',jsonb_build_object('memberCount',v_member_count,'activeMemberCount',v_active_member_count,
      'ownerContribution',v_owner),
    'privacy',jsonb_build_object('cohortOnly',true,'individualsHidden',true,'verifiedOnly',true,'rewardFree',true));
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_my_weekly_team_boss(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_weekly_team_boss(uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
