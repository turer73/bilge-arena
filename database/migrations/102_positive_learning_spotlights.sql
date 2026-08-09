-- Migration 102: read-only, positive verified-learning spotlights.
-- No reward, XP, league-point, preference, membership, or cohort write occurs here.
BEGIN;

CREATE INDEX IF NOT EXISTS verified_attempts_completed_user_at_idx
  ON public.verified_attempts (user_id, completed_at)
  WHERE completed_at IS NOT NULL AND session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_my_weekly_learning_spotlights(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_current_week date := public.weekly_learning_league_week_start(clock_timestamp());
  v_week_start date;
  v_pref public.weekly_learning_league_preferences%ROWTYPE;
  v_member public.weekly_learning_league_memberships%ROWTYPE;
  v_cohort public.weekly_learning_league_cohorts%ROWTYPE;
  v_status text;
  v_boards jsonb;
  v_empty_board jsonb := jsonb_build_object(
    'me', jsonb_build_object('eligible', false, 'rank', NULL, 'value', NULL),
    'entries', '[]'::jsonb
  );
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required' USING ERRCODE = '22023';
  END IF;
  -- Server routes call this service-only RPC after authenticating the owner;
  -- a direct JWT-backed caller cannot choose a different owner.
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'spotlight owner mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_pref FROM public.weekly_learning_league_preferences WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','opted_out','weekStart',NULL,
      'boards',jsonb_build_object('improved',v_empty_board,'consistent',v_empty_board,'comeback',v_empty_board),
      'privacy',jsonb_build_object('cohortOnly',true,'positiveOnly',true,'verifiedOnly',true,'fullTableHidden',true));
  END IF;

  -- Prefer this week's active/waiting record. When a new week has not placed
  -- the owner yet, retain their latest immutable final membership for read-only
  -- final-state display (the same R3.1 ownership boundary).
  SELECT * INTO v_member
  FROM public.weekly_learning_league_memberships
  WHERE user_id = p_user_id AND (week_start = v_current_week OR status = 'finalized')
  ORDER BY (week_start = v_current_week) DESC, week_start DESC
  LIMIT 1;
  IF NOT FOUND THEN
    v_status := CASE WHEN v_pref.opted_in THEN 'waiting' ELSE 'opted_out' END;
    RETURN jsonb_build_object('status',v_status,'weekStart',NULL,
      'boards',jsonb_build_object('improved',v_empty_board,'consistent',v_empty_board,'comeback',v_empty_board),
      'privacy',jsonb_build_object('cohortOnly',true,'positiveOnly',true,'verifiedOnly',true,'fullTableHidden',true));
  END IF;
  IF v_member.status = 'waiting' THEN
    RETURN jsonb_build_object('status','waiting','weekStart',NULL,
      'boards',jsonb_build_object('improved',v_empty_board,'consistent',v_empty_board,'comeback',v_empty_board),
      'privacy',jsonb_build_object('cohortOnly',true,'positiveOnly',true,'verifiedOnly',true,'fullTableHidden',true));
  END IF;
  SELECT * INTO v_cohort FROM public.weekly_learning_league_cohorts WHERE id = v_member.cohort_id;
  IF NOT FOUND OR v_cohort.status NOT IN ('active','finalized') THEN
    RAISE EXCEPTION 'invalid league cohort' USING ERRCODE = '23514';
  END IF;
  v_week_start := v_member.week_start;
  v_status := CASE WHEN v_cohort.status = 'finalized' THEN 'finalized' ELSE 'active' END;

  WITH cohort_users AS (
    SELECT m.user_id
    FROM public.weekly_learning_league_memberships m
    WHERE m.cohort_id = v_member.cohort_id
      AND m.status IN ('active','finalized')
  ), activity AS (
    SELECT cu.user_id,
      COALESCE(sum(gs.correct_count) FILTER (WHERE va.completed_at >= (v_week_start::timestamp AT TIME ZONE 'Europe/Istanbul')
        AND va.completed_at < ((v_week_start + 7)::timestamp AT TIME ZONE 'Europe/Istanbul')), 0)::integer AS current_correct,
      COALESCE(sum(gs.total_questions) FILTER (WHERE va.completed_at >= (v_week_start::timestamp AT TIME ZONE 'Europe/Istanbul')
        AND va.completed_at < ((v_week_start + 7)::timestamp AT TIME ZONE 'Europe/Istanbul')), 0)::integer AS current_answered,
      count(DISTINCT (va.completed_at AT TIME ZONE 'Europe/Istanbul')::date) FILTER (WHERE va.completed_at >= (v_week_start::timestamp AT TIME ZONE 'Europe/Istanbul')
        AND va.completed_at < ((v_week_start + 7)::timestamp AT TIME ZONE 'Europe/Istanbul') AND gs.total_questions > 0)::integer AS active_days,
      COALESCE(sum(gs.correct_count) FILTER (WHERE va.completed_at >= ((v_week_start - 28)::timestamp AT TIME ZONE 'Europe/Istanbul')
        AND va.completed_at < (v_week_start::timestamp AT TIME ZONE 'Europe/Istanbul')), 0)::integer AS baseline_correct,
      COALESCE(sum(gs.total_questions) FILTER (WHERE va.completed_at >= ((v_week_start - 28)::timestamp AT TIME ZONE 'Europe/Istanbul')
        AND va.completed_at < (v_week_start::timestamp AT TIME ZONE 'Europe/Istanbul')), 0)::integer AS baseline_answered,
      max((va.completed_at AT TIME ZONE 'Europe/Istanbul')::date) FILTER (
        WHERE va.completed_at < (v_week_start::timestamp AT TIME ZONE 'Europe/Istanbul')
          AND gs.id IS NOT NULL
          AND gs.total_questions > 0
      ) AS last_prior_day
    FROM cohort_users cu
    LEFT JOIN public.verified_attempts va ON va.user_id = cu.user_id AND va.completed_at IS NOT NULL AND va.session_id IS NOT NULL
    LEFT JOIN public.game_sessions gs ON gs.id = va.session_id AND gs.user_id = cu.user_id AND gs.status = 'completed'
    GROUP BY cu.user_id
  ), scores AS (
    SELECT a.*,
      ((a.current_correct + 10)::numeric / (a.current_answered + 20) * 10000) AS current_score,
      ((a.baseline_correct + 10)::numeric / (a.baseline_answered + 20) * 10000) AS baseline_score,
      hashtextextended(a.user_id::text,0) AS stable_a, hashtextextended(a.user_id::text,1) AS stable_b
    FROM activity a
  ), improved_base AS (
    SELECT *, round(current_score - baseline_score)::integer AS value
    FROM scores
    WHERE current_answered >= 10 AND active_days >= 2 AND baseline_answered >= 20
      AND current_score > baseline_score
  ), improved AS (
    SELECT *, row_number() OVER (ORDER BY value DESC,current_score DESC,active_days DESC,stable_a,stable_b)::integer AS rank
    FROM improved_base
  ), consistent_base AS (
    SELECT *, active_days AS value FROM scores WHERE active_days >= 2
  ), consistent AS (
    SELECT *, dense_rank() OVER (ORDER BY active_days DESC)::integer AS rank,
      row_number() OVER (ORDER BY active_days DESC,stable_a,stable_b)::integer AS display_order
    FROM consistent_base
  ), comeback_base AS (
    SELECT *, active_days AS value FROM scores
    WHERE current_answered >= 10 AND active_days >= 2
      AND last_prior_day IS NOT NULL AND last_prior_day <= v_week_start - 7
  ), comeback AS (
    SELECT *, row_number() OVER (ORDER BY active_days DESC,current_score DESC,stable_a,stable_b)::integer AS rank
    FROM comeback_base
  ), improved_entries AS (
    SELECT i.*, row_number() OVER (ORDER BY i.rank)::integer AS display_order FROM improved i
  ), comeback_entries AS (
    SELECT c.*, row_number() OVER (ORDER BY c.rank)::integer AS display_order FROM comeback c
  )
  SELECT jsonb_build_object(
    'improved', jsonb_build_object(
      'me', COALESCE((SELECT jsonb_build_object('eligible',true,'rank',rank,'value',value) FROM improved WHERE user_id=p_user_id),
        jsonb_build_object('eligible',false,'rank',NULL,'value',NULL)),
      'entries', COALESCE((SELECT jsonb_agg(jsonb_build_object('rank',x.rank,
        'name',CASE WHEN p.deleted_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.friendships f WHERE f.status='blocked' AND ((f.user_id=p_user_id AND f.friend_id=x.user_id) OR (f.user_id=x.user_id AND f.friend_id=p_user_id))) THEN 'Gizli Arenacı' ELSE COALESCE(NULLIF(btrim(p.display_name),''),NULLIF(btrim(p.username),''),'Arenacı') END,
        'avatarUrl',CASE WHEN p.deleted_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.friendships f WHERE f.status='blocked' AND ((f.user_id=p_user_id AND f.friend_id=x.user_id) OR (f.user_id=x.user_id AND f.friend_id=p_user_id))) THEN NULL WHEN (left(p.avatar_url,1)='/' AND left(p.avatar_url,2)<>'//') OR p.avatar_url ~ '^https://([a-z0-9-]+\.)?supabase\.co/storage/v1/object/public/' OR p.avatar_url ~ '^https://([a-z0-9-]+\.)?googleusercontent\.com/' THEN p.avatar_url ELSE NULL END,
        'value',x.value,'isMe',x.user_id=p_user_id) ORDER BY x.display_order) FROM improved_entries x JOIN public.profiles p ON p.id=x.user_id WHERE x.display_order<=3 OR x.user_id=p_user_id),'[]'::jsonb)),
    'consistent', jsonb_build_object(
      'me', COALESCE((SELECT jsonb_build_object('eligible',true,'rank',rank,'value',value) FROM consistent WHERE user_id=p_user_id),jsonb_build_object('eligible',false,'rank',NULL,'value',NULL)),
      'entries', COALESCE((SELECT jsonb_agg(jsonb_build_object('rank',x.rank,
        'name',CASE WHEN p.deleted_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.friendships f WHERE f.status='blocked' AND ((f.user_id=p_user_id AND f.friend_id=x.user_id) OR (f.user_id=x.user_id AND f.friend_id=p_user_id))) THEN 'Gizli Arenacı' ELSE COALESCE(NULLIF(btrim(p.display_name),''),NULLIF(btrim(p.username),''),'Arenacı') END,
        'avatarUrl',CASE WHEN p.deleted_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.friendships f WHERE f.status='blocked' AND ((f.user_id=p_user_id AND f.friend_id=x.user_id) OR (f.user_id=x.user_id AND f.friend_id=p_user_id))) THEN NULL WHEN (left(p.avatar_url,1)='/' AND left(p.avatar_url,2)<>'//') OR p.avatar_url ~ '^https://([a-z0-9-]+\.)?supabase\.co/storage/v1/object/public/' OR p.avatar_url ~ '^https://([a-z0-9-]+\.)?googleusercontent\.com/' THEN p.avatar_url ELSE NULL END,
        'value',x.value,'isMe',x.user_id=p_user_id) ORDER BY x.display_order) FROM consistent x JOIN public.profiles p ON p.id=x.user_id WHERE x.display_order<=3 OR x.user_id=p_user_id),'[]'::jsonb)),
    'comeback', jsonb_build_object(
      'me', COALESCE((SELECT jsonb_build_object('eligible',true,'rank',rank,'value',value) FROM comeback WHERE user_id=p_user_id),jsonb_build_object('eligible',false,'rank',NULL,'value',NULL)),
      'entries', COALESCE((SELECT jsonb_agg(jsonb_build_object('rank',x.rank,
        'name',CASE WHEN p.deleted_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.friendships f WHERE f.status='blocked' AND ((f.user_id=p_user_id AND f.friend_id=x.user_id) OR (f.user_id=x.user_id AND f.friend_id=p_user_id))) THEN 'Gizli Arenacı' ELSE COALESCE(NULLIF(btrim(p.display_name),''),NULLIF(btrim(p.username),''),'Arenacı') END,
        'avatarUrl',CASE WHEN p.deleted_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.friendships f WHERE f.status='blocked' AND ((f.user_id=p_user_id AND f.friend_id=x.user_id) OR (f.user_id=x.user_id AND f.friend_id=p_user_id))) THEN NULL WHEN (left(p.avatar_url,1)='/' AND left(p.avatar_url,2)<>'//') OR p.avatar_url ~ '^https://([a-z0-9-]+\.)?supabase\.co/storage/v1/object/public/' OR p.avatar_url ~ '^https://([a-z0-9-]+\.)?googleusercontent\.com/' THEN p.avatar_url ELSE NULL END,
        'value',x.value,'isMe',x.user_id=p_user_id) ORDER BY x.display_order) FROM comeback_entries x JOIN public.profiles p ON p.id=x.user_id WHERE x.display_order<=3 OR x.user_id=p_user_id),'[]'::jsonb)))
  INTO v_boards;

  RETURN jsonb_build_object('status',v_status,'weekStart',v_week_start::text,'boards',v_boards,
    'privacy',jsonb_build_object('cohortOnly',true,'positiveOnly',true,'verifiedOnly',true,'fullTableHidden',true));
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_my_weekly_learning_spotlights(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_weekly_learning_spotlights(uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
