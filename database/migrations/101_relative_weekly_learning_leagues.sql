-- Migration 101: private, opt-in, verified-learning weekly leagues.
--
-- The league is deliberately isolated from XP/reward tables.  All writes go
-- through the narrowly-granted RPCs below or the verified_attempts trigger.
-- Rollback is operational: first disable callers, then add a forward migration
-- which marks cohorts cancelled; do not delete audit/membership/contribution data.

BEGIN;

CREATE TABLE IF NOT EXISTS public.weekly_learning_league_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  opted_in boolean NOT NULL DEFAULT false,
  effective_week_start date,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.weekly_learning_league_tiers (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  tier text NOT NULL DEFAULT 'bronz'
    CHECK (tier IN ('bronz', 'gumus', 'altin', 'elmas')),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.weekly_learning_league_cohorts (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  week_start date NOT NULL,
  exam_type text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('bronz', 'gumus', 'altin', 'elmas')),
  cohort_number integer NOT NULL CHECK (cohort_number > 0),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'finalized', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finalized_at timestamptz,
  UNIQUE (week_start, exam_type, tier, cohort_number)
);

CREATE TABLE IF NOT EXISTS public.weekly_learning_league_memberships (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  week_start date NOT NULL,
  cohort_id uuid REFERENCES public.weekly_learning_league_cohorts(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('waiting', 'active', 'finalized')),
  points integer NOT NULL DEFAULT 0 CHECK (points >= 0),
  active_days integer NOT NULL DEFAULT 0 CHECK (active_days BETWEEN 0 AND 7),
  last_contribution_at timestamptz,
  final_rank integer CHECK (final_rank BETWEEN 1 AND 30),
  final_zone text CHECK (final_zone IN ('promotion', 'safe', 'demotion')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (week_start, user_id),
  CHECK (
    (status = 'waiting' AND cohort_id IS NULL AND final_rank IS NULL AND final_zone IS NULL)
    OR (status = 'active' AND cohort_id IS NOT NULL AND final_rank IS NULL AND final_zone IS NULL)
    OR (status = 'finalized' AND cohort_id IS NOT NULL AND final_rank IS NOT NULL AND final_zone IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.weekly_learning_league_contributions (
  session_id uuid PRIMARY KEY REFERENCES public.game_sessions(id) ON DELETE RESTRICT,
  membership_id uuid NOT NULL REFERENCES public.weekly_learning_league_memberships(id) ON DELETE RESTRICT,
  cohort_id uuid NOT NULL REFERENCES public.weekly_learning_league_cohorts(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  points integer NOT NULL CHECK (points BETWEEN 0 AND 15),
  contributed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- One canonical request per week and per request id gives both retry and
-- accidental double-cron replays one stable result.
CREATE TABLE IF NOT EXISTS public.weekly_learning_league_formation_requests (
  request_id uuid PRIMARY KEY,
  week_start date NOT NULL UNIQUE,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Preference requests are private too.  Unlike a timestamp-derived upsert,
-- this preserves a request UUID's canonical payload/result across retries and
-- across an Istanbul week boundary.
CREATE TABLE IF NOT EXISTS public.weekly_learning_league_preference_requests (
  request_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  opted_in boolean NOT NULL,
  effective_week_start date NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS weekly_learning_league_memberships_cohort_idx
  ON public.weekly_learning_league_memberships (cohort_id, status);
CREATE INDEX IF NOT EXISTS weekly_learning_league_contributions_user_day_idx
  ON public.weekly_learning_league_contributions (user_id, contributed_at);
CREATE INDEX IF NOT EXISTS weekly_learning_league_cohorts_week_idx
  ON public.weekly_learning_league_cohorts (week_start, status);

ALTER TABLE public.weekly_learning_league_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_learning_league_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_learning_league_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_learning_league_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_learning_league_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_learning_league_formation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_learning_league_preference_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.weekly_learning_league_preferences,
  public.weekly_learning_league_tiers,
  public.weekly_learning_league_cohorts,
  public.weekly_learning_league_memberships,
  public.weekly_learning_league_contributions,
  public.weekly_learning_league_formation_requests,
  public.weekly_learning_league_preference_requests
  FROM PUBLIC, anon, authenticated, service_role;

-- Istanbul calendar Monday.  It is intentionally SQL/immutable and only used
-- with timestamps supplied by the database, never a client-provided timestamp.
CREATE OR REPLACE FUNCTION public.weekly_learning_league_week_start(p_at timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT ((p_at AT TIME ZONE 'Europe/Istanbul')::date
          - (extract(isodow FROM p_at AT TIME ZONE 'Europe/Istanbul')::integer - 1))
$$;

CREATE OR REPLACE FUNCTION public.set_weekly_learning_league_preference(
  p_user_id uuid,
  p_opted_in boolean,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_week date := public.weekly_learning_league_week_start(clock_timestamp());
  v_existing_request public.weekly_learning_league_preference_requests%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_opted_in IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'user_id, opted_in and request_id are required' USING ERRCODE = '22023';
  END IF;
  -- API calls this service-only RPC after authenticating the owner.  For a
  -- direct JWT-backed invocation, still fail closed if the owner differs.
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'preference owner mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id) THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('wll-preference-request:' || p_request_id::text, 0));
  SELECT * INTO v_existing_request FROM public.weekly_learning_league_preference_requests
   WHERE request_id = p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing_request.user_id IS DISTINCT FROM p_user_id
       OR v_existing_request.opted_in IS DISTINCT FROM p_opted_in THEN
      RAISE EXCEPTION 'preference request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_existing_request.result || jsonb_build_object('replayed', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('wll-preference-user:' || p_user_id::text, 0));

  INSERT INTO public.weekly_learning_league_preferences
    (user_id, opted_in, effective_week_start)
  VALUES (p_user_id, p_opted_in, v_week + 7)
  ON CONFLICT (user_id) DO UPDATE SET
    opted_in = EXCLUDED.opted_in,
    effective_week_start = EXCLUDED.effective_week_start,
    updated_at = clock_timestamp();

  v_result := jsonb_build_object('optedIn', p_opted_in,
    'effectiveWeekStart', (v_week + 7)::text, 'replayed', false);
  INSERT INTO public.weekly_learning_league_preference_requests
    (request_id, user_id, opted_in, effective_week_start, result)
  VALUES (p_request_id, p_user_id, p_opted_in, v_week + 7, v_result);
  RETURN v_result;
END
$fn$;

-- A verified attempt becomes eligible for points only at the atomically-bound
-- completed/session transition performed by complete_verified_game_session.
CREATE OR REPLACE FUNCTION public.capture_weekly_learning_league_contribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_member public.weekly_learning_league_memberships%ROWTYPE;
  v_correct integer;
  v_week date;
  v_day date;
  v_used integer;
  v_points integer;
  v_had_day boolean;
BEGIN
  IF NEW.completed_at IS NULL OR NEW.session_id IS NULL
     OR (OLD.completed_at IS NOT NULL AND OLD.session_id IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  SELECT gs.correct_count INTO v_correct
  FROM public.game_sessions gs
  WHERE gs.id = NEW.session_id
    AND gs.user_id = NEW.user_id
    AND gs.status = 'completed';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'verified attempt session is not a completed owned session'
      USING ERRCODE = '23514';
  END IF;

  v_week := public.weekly_learning_league_week_start(NEW.completed_at);
  v_day := (NEW.completed_at AT TIME ZONE 'Europe/Istanbul')::date;
  SELECT m.* INTO v_member
  FROM public.weekly_learning_league_memberships m
  JOIN public.weekly_learning_league_cohorts c ON c.id = m.cohort_id
  WHERE m.user_id = NEW.user_id
    AND m.week_start = v_week
    AND m.status = 'active'
    AND c.status = 'active'
  FOR UPDATE OF m;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- The locked membership serializes the daily cap for this user/week.  The
  -- session primary key remains the durable idempotency backstop.
  SELECT COALESCE(sum(c.points), 0), bool_or(c.points > 0)
  INTO v_used, v_had_day
  FROM public.weekly_learning_league_contributions c
  WHERE c.user_id = NEW.user_id
    AND (c.contributed_at AT TIME ZONE 'Europe/Istanbul')::date = v_day;
  v_points := least(greatest(v_correct, 0), 15, greatest(30 - v_used, 0));

  INSERT INTO public.weekly_learning_league_contributions
    (session_id, membership_id, cohort_id, user_id, points, contributed_at)
  VALUES (NEW.session_id, v_member.id, v_member.cohort_id, NEW.user_id,
          v_points, NEW.completed_at)
  ON CONFLICT (session_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  UPDATE public.weekly_learning_league_memberships
  SET points = points + v_points,
      active_days = active_days + CASE WHEN v_points > 0 AND NOT COALESCE(v_had_day, false)
                                       THEN 1 ELSE 0 END,
      last_contribution_at = CASE WHEN v_points > 0 THEN NEW.completed_at
                                  ELSE last_contribution_at END
  WHERE id = v_member.id;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_capture_weekly_learning_league_contribution ON public.verified_attempts;
CREATE TRIGGER trg_capture_weekly_learning_league_contribution
AFTER UPDATE OF completed_at, session_id ON public.verified_attempts
FOR EACH ROW EXECUTE FUNCTION public.capture_weekly_learning_league_contribution();

CREATE OR REPLACE FUNCTION public.form_weekly_learning_leagues(
  p_week_start date,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_existing jsonb;
  v_result jsonb;
  v_partition record;
  v_cohort_id uuid;
  v_count integer;
  v_groups integer;
  v_group integer;
  v_size integer;
  v_offset integer;
  v_assigned integer := 0;
  v_waiting integer := 0;
  v_formed integer := 0;
  v_finalized integer := 0;
BEGIN
  IF p_week_start IS NULL OR p_request_id IS NULL
     OR extract(isodow FROM p_week_start)::integer <> 1 THEN
    RAISE EXCEPTION 'week_start must be a Monday and request_id is required' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('wll-formation:' || p_week_start::text, 0));

  -- Request-id lookup is separate from week lookup: OR + INTO could pick an
  -- arbitrary row if a caller accidentally supplied two existing identities.
  SELECT result INTO v_existing
  FROM public.weekly_learning_league_formation_requests
  WHERE request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF (v_existing->>'weekStart')::date <> p_week_start THEN
      RAISE EXCEPTION 'request_id is already bound to another week' USING ERRCODE = '23505';
    END IF;
    RETURN v_existing || jsonb_build_object('replayed', true);
  END IF;
  SELECT result INTO v_existing
  FROM public.weekly_learning_league_formation_requests
  WHERE week_start = p_week_start
  FOR UPDATE;
  IF FOUND THEN
    RETURN v_existing || jsonb_build_object('replayed', true);
  END IF;

  -- First freeze the preceding week, then use its immutable ranks for tier moves.
  WITH ranked AS (
    SELECT m.id, c.id AS cohort_id,
      row_number() OVER (PARTITION BY c.id ORDER BY m.points DESC, m.active_days DESC,
                          m.last_contribution_at ASC NULLS LAST,
                          hashtextextended(m.user_id::text, 0), hashtextextended(m.user_id::text, 1)) AS rnk,
      count(*) OVER (PARTITION BY c.id) AS member_count
    FROM public.weekly_learning_league_memberships m
    JOIN public.weekly_learning_league_cohorts c ON c.id = m.cohort_id
    WHERE c.week_start = p_week_start - 7 AND c.status = 'active' AND m.status = 'active'
  )
  UPDATE public.weekly_learning_league_memberships m
  SET status = 'finalized', final_rank = ranked.rnk,
      final_zone = CASE WHEN ranked.rnk <= 3 THEN 'promotion'
                        WHEN ranked.rnk >= ranked.member_count - 2 THEN 'demotion'
                        ELSE 'safe' END
  FROM ranked WHERE m.id = ranked.id;

  UPDATE public.weekly_learning_league_cohorts c
  SET status = 'finalized', finalized_at = clock_timestamp()
  WHERE c.week_start = p_week_start - 7 AND c.status = 'active';
  GET DIAGNOSTICS v_finalized = ROW_COUNT;

  UPDATE public.weekly_learning_league_tiers t
  SET tier = CASE
    WHEN m.final_zone = 'promotion' THEN CASE t.tier WHEN 'bronz' THEN 'gumus'
      WHEN 'gumus' THEN 'altin' WHEN 'altin' THEN 'elmas' ELSE 'elmas' END
    WHEN m.final_zone = 'demotion' THEN CASE t.tier WHEN 'elmas' THEN 'altin'
      WHEN 'altin' THEN 'gumus' WHEN 'gumus' THEN 'bronz' ELSE 'bronz' END
    ELSE t.tier END,
    updated_at = clock_timestamp()
  FROM public.weekly_learning_league_memberships m
  JOIN public.weekly_learning_league_cohorts c ON c.id = m.cohort_id
  WHERE t.user_id = m.user_id AND c.week_start = p_week_start - 7
    AND m.status = 'finalized' AND m.final_zone IN ('promotion', 'demotion');

  CREATE TEMP TABLE pg_temp.wll_candidates (
    user_id uuid PRIMARY KEY, exam_type text NOT NULL, tier text NOT NULL,
    skill_score numeric NOT NULL, stable_a bigint NOT NULL, stable_b bigint NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO pg_temp.wll_candidates (user_id, exam_type, tier, skill_score, stable_a, stable_b)
  SELECT p.id, COALESCE(p.exam_type, 'yks'), COALESCE(t.tier, 'bronz'),
    ((COALESCE(sum(gs.correct_count), 0)::numeric + 10)
      / (COALESCE(sum(gs.total_questions), 0)::numeric + 20) * 10000),
    hashtextextended(p.id::text, 0), hashtextextended(p.id::text, 1)
  FROM public.profiles p
  JOIN public.weekly_learning_league_preferences pref ON pref.user_id = p.id
  LEFT JOIN public.weekly_learning_league_tiers t ON t.user_id = p.id
  JOIN public.verified_attempts va ON va.user_id = p.id
    AND va.completed_at >= ((p_week_start - 28)::timestamp AT TIME ZONE 'Europe/Istanbul')
    AND va.completed_at < (p_week_start::timestamp AT TIME ZONE 'Europe/Istanbul')
    AND va.session_id IS NOT NULL
  JOIN public.game_sessions gs ON gs.id = va.session_id AND gs.user_id = p.id
    AND gs.status = 'completed'
  WHERE p.deleted_at IS NULL
    AND pref.opted_in = true AND pref.effective_week_start <= p_week_start
  GROUP BY p.id, p.exam_type, t.tier;

  -- First-time participants acquire the durable bronze tier only after they
  -- passed the verified-activity eligibility gate above.
  INSERT INTO public.weekly_learning_league_tiers (user_id, tier)
  SELECT user_id, 'bronz' FROM pg_temp.wll_candidates
  ON CONFLICT (user_id) DO NOTHING;

  FOR v_partition IN
    SELECT exam_type, tier, count(*)::integer AS candidate_count
    FROM pg_temp.wll_candidates GROUP BY exam_type, tier ORDER BY exam_type, tier
  LOOP
    v_count := v_partition.candidate_count;
    IF v_count < 20 THEN
      v_groups := 0;
    ELSIF v_count < 40 THEN
      v_groups := 1; -- 31..39 intentionally forms a full 30 and leaves the rest waiting.
    ELSE
      v_groups := ceil(v_count::numeric / 30)::integer;
    END IF;
    v_offset := 0;
    FOR v_group IN 1..v_groups LOOP
      v_size := least(30, v_count - v_offset);
      -- Spread eligible 40..N partitions evenly while retaining 20..30 bounds.
      IF v_count >= 40 THEN
        v_size := floor(v_count::numeric / v_groups)::integer
                  + CASE WHEN v_group <= (v_count % v_groups) THEN 1 ELSE 0 END;
      END IF;
      INSERT INTO public.weekly_learning_league_cohorts
        (week_start, exam_type, tier, cohort_number)
      VALUES (p_week_start, v_partition.exam_type, v_partition.tier, v_group)
      RETURNING id INTO v_cohort_id;
      INSERT INTO public.weekly_learning_league_memberships (week_start, cohort_id, user_id, status)
      SELECT p_week_start, v_cohort_id, ordered.user_id, 'active'
      FROM (
        SELECT user_id, row_number() OVER (ORDER BY skill_score DESC, stable_a, stable_b) AS rn
        FROM pg_temp.wll_candidates
        WHERE exam_type = v_partition.exam_type AND tier = v_partition.tier
      ) ordered
      WHERE ordered.rn > v_offset AND ordered.rn <= v_offset + v_size;
      v_offset := v_offset + v_size;
      v_assigned := v_assigned + v_size;
      v_formed := v_formed + 1;
    END LOOP;
    INSERT INTO public.weekly_learning_league_memberships (week_start, cohort_id, user_id, status)
    SELECT p_week_start, NULL, ordered.user_id, 'waiting'
    FROM (
      SELECT user_id, row_number() OVER (ORDER BY skill_score DESC, stable_a, stable_b) AS rn
      FROM pg_temp.wll_candidates
      WHERE exam_type = v_partition.exam_type AND tier = v_partition.tier
    ) ordered
    WHERE ordered.rn > v_offset;
    GET DIAGNOSTICS v_size = ROW_COUNT;
    v_waiting := v_waiting + v_size;
  END LOOP;

  v_result := jsonb_build_object('weekStart', p_week_start::text,
    'finalizedCohortCount', v_finalized, 'formedCohortCount', v_formed,
    'assignedMemberCount', v_assigned, 'waitingMemberCount', v_waiting, 'replayed', false);
  INSERT INTO public.weekly_learning_league_formation_requests (request_id, week_start, result)
  VALUES (p_request_id, p_week_start, v_result);
  RETURN v_result;
END
$fn$;

CREATE OR REPLACE FUNCTION public.get_my_weekly_learning_league(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_week_start date := public.weekly_learning_league_week_start(clock_timestamp());
  v_pref public.weekly_learning_league_preferences%ROWTYPE;
  v_member public.weekly_learning_league_memberships%ROWTYPE;
  v_cohort public.weekly_learning_league_cohorts%ROWTYPE;
  v_rank integer;
  v_count integer;
  v_entries jsonb := '[]'::jsonb;
  v_status text;
  v_zone text := 'pending';
  v_is_final boolean := false;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id is required' USING ERRCODE = '22023'; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'league owner mismatch' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_pref FROM public.weekly_learning_league_preferences WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','opted_out','optedIn',false,'effectiveWeekStart',NULL,
      'week',NULL,'entries',v_entries,'privacy',jsonb_build_object('bottomHidden',true,'sessionCap',15,'dailyCap',30));
  END IF;
  -- During the first formation of a new week, retain the immediately previous
  -- immutable final for the final-state UI until this owner is placed again.
  SELECT * INTO v_member FROM public.weekly_learning_league_memberships
   WHERE user_id = p_user_id
     AND (week_start = v_week_start OR status = 'finalized')
   ORDER BY (week_start = v_week_start) DESC, week_start DESC
   LIMIT 1;
  IF NOT FOUND THEN
    v_status := CASE WHEN v_pref.opted_in THEN 'waiting' ELSE 'opted_out' END;
    RETURN jsonb_build_object('status',v_status,'optedIn',v_pref.opted_in,
      'effectiveWeekStart',v_pref.effective_week_start::text,'week',NULL,'entries',v_entries,
      'privacy',jsonb_build_object('bottomHidden',true,'sessionCap',15,'dailyCap',30));
  END IF;
  IF v_member.status = 'waiting' THEN
    RETURN jsonb_build_object('status','waiting','optedIn',v_pref.opted_in,
      'effectiveWeekStart',v_pref.effective_week_start::text,'week',NULL,'entries',v_entries,
      'privacy',jsonb_build_object('bottomHidden',true,'sessionCap',15,'dailyCap',30));
  END IF;
  v_week_start := v_member.week_start;
  SELECT * INTO v_cohort FROM public.weekly_learning_league_cohorts WHERE id = v_member.cohort_id;
  v_is_final := v_cohort.status = 'finalized';
  v_status := CASE WHEN v_is_final THEN 'finalized' ELSE 'active' END;
  IF v_is_final THEN
    v_rank := v_member.final_rank; v_zone := v_member.final_zone;
  ELSE
    SELECT ranked.rnk, ranked.member_count INTO v_rank, v_count FROM (
      SELECT m.user_id, row_number() OVER (ORDER BY m.points DESC, m.active_days DESC,
        m.last_contribution_at ASC NULLS LAST, hashtextextended(m.user_id::text,0),hashtextextended(m.user_id::text,1))::integer AS rnk,
        count(*) OVER ()::integer AS member_count
      FROM public.weekly_learning_league_memberships m WHERE m.cohort_id = v_member.cohort_id AND m.status = 'active'
    ) ranked WHERE ranked.user_id = p_user_id;
    v_zone := CASE WHEN v_rank <= 3 THEN 'promotion' WHEN v_rank >= v_count - 2 THEN 'demotion' ELSE 'safe' END;
  END IF;
  SELECT count(*)::integer INTO v_count FROM public.weekly_learning_league_memberships
    WHERE cohort_id = v_member.cohort_id;
  WITH ranked AS (
    SELECT m.user_id, m.points, m.active_days,
      CASE WHEN v_is_final THEN m.final_rank ELSE row_number() OVER (ORDER BY m.points DESC,m.active_days DESC,m.last_contribution_at ASC NULLS LAST,hashtextextended(m.user_id::text,0),hashtextextended(m.user_id::text,1))::integer END AS rnk,
      CASE WHEN v_is_final THEN m.final_zone ELSE CASE WHEN row_number() OVER (ORDER BY m.points DESC,m.active_days DESC,m.last_contribution_at ASC NULLS LAST,hashtextextended(m.user_id::text,0),hashtextextended(m.user_id::text,1)) <= 3 THEN 'promotion' ELSE 'safe' END END AS entry_zone
    FROM public.weekly_learning_league_memberships m WHERE m.cohort_id = v_member.cohort_id
  ), visible AS (
    SELECT * FROM ranked WHERE rnk <= 3 OR (rnk BETWEEN greatest(v_rank - 2, 1) AND least(v_rank + 2, v_count) AND rnk <= v_count - 3)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('rank',v.rnk,
      'name',CASE WHEN p.deleted_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.friendships f WHERE f.status = 'blocked' AND ((f.user_id=p_user_id AND f.friend_id=v.user_id) OR (f.user_id=v.user_id AND f.friend_id=p_user_id))) THEN 'Gizli Arenacı' ELSE COALESCE(NULLIF(btrim(p.display_name),''),NULLIF(btrim(p.username),''),'Arenacı') END,
      'avatarUrl',CASE WHEN p.deleted_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.friendships f WHERE f.status = 'blocked' AND ((f.user_id=p_user_id AND f.friend_id=v.user_id) OR (f.user_id=v.user_id AND f.friend_id=p_user_id))) THEN NULL WHEN (left(p.avatar_url,1)='/' AND left(p.avatar_url,2)<>'//') OR p.avatar_url ~ '^https://([a-z0-9-]+\.)?supabase\.co/storage/v1/object/public/' OR p.avatar_url ~ '^https://([a-z0-9-]+\.)?googleusercontent\.com/' THEN p.avatar_url ELSE NULL END,
      'points',v.points,'activeDays',v.active_days,'isMe',v.user_id=p_user_id,'zone',v.entry_zone) ORDER BY v.rnk),'[]'::jsonb)
  INTO v_entries FROM visible v JOIN public.profiles p ON p.id = v.user_id;
  RETURN jsonb_build_object('status',v_status,'optedIn',v_pref.opted_in,
    'effectiveWeekStart',v_pref.effective_week_start::text,
    'week',jsonb_build_object('startsOn',v_week_start::text,'endsOn',(v_week_start+7)::text,
      'tier',v_cohort.tier,'memberCount',v_count,'points',v_member.points,'rank',v_rank,
      'zone',v_zone,'isFinal',v_is_final),'entries',v_entries,
    'privacy',jsonb_build_object('bottomHidden',true,'sessionCap',15,'dailyCap',30));
END
$fn$;

REVOKE ALL ON FUNCTION public.weekly_learning_league_week_start(timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.capture_weekly_learning_league_contribution() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_weekly_learning_league_preference(uuid, boolean, uuid),
  public.get_my_weekly_learning_league(uuid), public.form_weekly_learning_leagues(date, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_weekly_learning_league_preference(uuid, boolean, uuid),
  public.get_my_weekly_learning_league(uuid), public.form_weekly_learning_leagues(date, uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
