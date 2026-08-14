-- Migration 120: narrow, auditable student-support follow-ups for institution pilots.
-- This is not a CRM, discipline, attendance or parent-contact module. Direct table
-- access stays closed; teachers write only for their assigned active classroom.
BEGIN;

CREATE TABLE IF NOT EXISTS public.institution_student_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  followup_ref text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(16), 'hex')
    CHECK (followup_ref ~ '^[0-9a-f]{32}$'),
  institution_id uuid NOT NULL REFERENCES public.pilot_institutions(id) ON DELETE RESTRICT,
  classroom_id uuid NOT NULL REFERENCES public.teacher_classrooms(id) ON DELETE RESTRICT,
  membership_id uuid NOT NULL REFERENCES public.teacher_classroom_memberships(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason_code text NOT NULL CHECK (reason_code IN (
    'support_needed', 'inactivity', 'learning_decline', 'program_review'
  )),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  note text CHECK (note IS NULL OR char_length(btrim(note)) BETWEEN 1 AND 500),
  opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at timestamptz,
  CHECK (
    (status = 'open' AND resolved_at IS NULL)
    OR (status = 'resolved' AND resolved_at IS NOT NULL AND resolved_at >= opened_at)
  ),
  FOREIGN KEY (membership_id, student_id, classroom_id)
    REFERENCES public.teacher_classroom_memberships(id, student_id, classroom_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS institution_student_followups_one_open_reason
  ON public.institution_student_followups (membership_id, reason_code)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS institution_student_followups_classroom_window
  ON public.institution_student_followups (classroom_id, opened_at DESC, status);

ALTER TABLE public.institution_student_followups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.institution_student_followups
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.open_institution_student_followup(
  p_user_id uuid,
  p_classroom_id uuid,
  p_member_ref text,
  p_reason_code text,
  p_note text,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_membership public.teacher_classroom_memberships%ROWTYPE;
  v_followup public.institution_student_followups%ROWTYPE;
  v_request public.pilot_institution_requests%ROWTYPE;
  v_note text := NULLIF(btrim(p_note), '');
  v_hash text;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_request_id IS NULL
    OR p_member_ref IS NULL OR p_member_ref !~ '^[0-9a-f]{32}$'
    OR p_reason_code IS NULL OR p_reason_code NOT IN (
      'support_needed', 'inactivity', 'learning_decline', 'program_review'
    ) OR (v_note IS NOT NULL AND char_length(v_note) > 500) THEN
    RAISE EXCEPTION 'invalid institution follow-up request' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution follow-up actor mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_classroom
  FROM public.teacher_classrooms
  WHERE id = p_classroom_id AND teacher_id = p_user_id AND status = 'active';
  IF NOT FOUND OR NOT public.institution_pilot_has_role(
    p_user_id, v_classroom.institution_id, ARRAY['manager', 'teacher']::text[]
  ) THEN
    RAISE EXCEPTION 'assigned institution teacher required' USING ERRCODE = '42501';
  END IF;
  SELECT membership.* INTO v_membership
  FROM public.teacher_classroom_memberships AS membership
  JOIN public.profiles AS profile ON profile.id = membership.student_id AND profile.deleted_at IS NULL
  WHERE membership.classroom_id = p_classroom_id
    AND membership.member_ref = p_member_ref
    AND membership.status = 'active';
  IF NOT FOUND OR public.teacher_classroom_is_blocked(p_user_id, v_membership.student_id) THEN
    RAISE EXCEPTION 'active classroom member not found' USING ERRCODE = 'P0002';
  END IF;

  v_hash := public.institution_pilot_payload_hash(jsonb_build_object(
    'classroomId', p_classroom_id, 'memberRef', p_member_ref,
    'reasonCode', p_reason_code, 'note', v_note
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_user_id::text || ':followup-open:' || p_request_id::text, 0
  ));
  SELECT * INTO v_request
  FROM public.pilot_institution_requests
  WHERE user_id = p_user_id AND operation = 'open_student_followup' AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'follow-up request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;

  INSERT INTO public.institution_student_followups (
    institution_id, classroom_id, membership_id, student_id, teacher_id,
    reason_code, note
  ) VALUES (
    v_classroom.institution_id, v_classroom.id, v_membership.id,
    v_membership.student_id, p_user_id, p_reason_code, v_note
  ) RETURNING * INTO v_followup;

  v_result := jsonb_build_object(
    'followupRef', v_followup.followup_ref,
    'reasonCode', v_followup.reason_code,
    'status', v_followup.status,
    'openedAt', v_followup.opened_at,
    'resolvedAt', v_followup.resolved_at,
    'replayed', false
  );
  INSERT INTO public.pilot_institution_requests (
    user_id, operation, request_id, payload_hash, result
  ) VALUES (
    p_user_id, 'open_student_followup', p_request_id, v_hash, v_result
  );
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.resolve_institution_student_followup(
  p_user_id uuid,
  p_followup_ref text,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_followup public.institution_student_followups%ROWTYPE;
  v_request public.pilot_institution_requests%ROWTYPE;
  v_hash text;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_followup_ref IS NULL
    OR p_followup_ref !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'invalid institution follow-up resolution' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution follow-up actor mismatch' USING ERRCODE = '42501';
  END IF;
  v_hash := public.institution_pilot_payload_hash(jsonb_build_object('followupRef', p_followup_ref));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_user_id::text || ':followup-resolve:' || p_request_id::text, 0
  ));
  SELECT * INTO v_request
  FROM public.pilot_institution_requests
  WHERE user_id = p_user_id AND operation = 'resolve_student_followup' AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'follow-up resolution payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;

  SELECT followup.* INTO v_followup
  FROM public.institution_student_followups AS followup
  JOIN public.teacher_classrooms AS classroom
    ON classroom.id = followup.classroom_id AND classroom.status = 'active'
  JOIN public.teacher_classroom_memberships AS membership
    ON membership.id = followup.membership_id AND membership.status = 'active'
  JOIN public.profiles AS profile
    ON profile.id = followup.student_id AND profile.deleted_at IS NULL
  WHERE followup.followup_ref = p_followup_ref
    AND followup.teacher_id = p_user_id
    AND classroom.teacher_id = p_user_id
    AND followup.status = 'open'
  FOR UPDATE OF followup;
  IF NOT FOUND OR NOT public.institution_pilot_has_role(
    p_user_id, v_followup.institution_id, ARRAY['manager', 'teacher']::text[]
  ) OR public.teacher_classroom_is_blocked(p_user_id, v_followup.student_id) THEN
    RAISE EXCEPTION 'open follow-up not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.institution_student_followups
  SET status = 'resolved', resolved_at = clock_timestamp()
  WHERE id = v_followup.id
  RETURNING * INTO v_followup;
  v_result := jsonb_build_object(
    'followupRef', v_followup.followup_ref,
    'reasonCode', v_followup.reason_code,
    'status', v_followup.status,
    'openedAt', v_followup.opened_at,
    'resolvedAt', v_followup.resolved_at,
    'replayed', false
  );
  INSERT INTO public.pilot_institution_requests (
    user_id, operation, request_id, payload_hash, result
  ) VALUES (
    p_user_id, 'resolve_student_followup', p_request_id, v_hash, v_result
  );
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_institution_classroom_followup_metrics(
  p_user_id uuid,
  p_classroom_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_role text;
  v_followed_refs jsonb;
  v_eligible_count integer;
  v_timely_count integer;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_window_start IS NULL OR p_window_end IS NULL
    OR p_window_end <= p_window_start OR p_window_end > clock_timestamp() + interval '5 minutes'
    OR p_window_end - p_window_start > interval '366 days' THEN
    RAISE EXCEPTION 'invalid classroom follow-up metrics window' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'classroom follow-up metrics actor mismatch' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_classroom
  FROM public.teacher_classrooms
  WHERE id = p_classroom_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'classroom not found' USING ERRCODE = 'P0002'; END IF;
  SELECT membership.role INTO v_role
  FROM public.pilot_institution_memberships AS membership
  JOIN public.pilot_institutions AS institution
    ON institution.id = membership.institution_id AND institution.status IN ('pilot', 'active')
  JOIN public.profiles AS profile
    ON profile.id = membership.user_id AND profile.deleted_at IS NULL
  WHERE membership.user_id = p_user_id
    AND membership.institution_id = v_classroom.institution_id
    AND membership.status = 'active'
    AND membership.role IN ('manager', 'teacher');
  IF v_role IS NULL OR (v_role = 'teacher' AND v_classroom.teacher_id <> p_user_id) THEN
    RAISE EXCEPTION 'institution classroom access required' USING ERRCODE = '42501';
  END IF;

  WITH scoped_followups AS (
    SELECT followup.membership_id, membership.member_ref, min(followup.opened_at) AS first_opened_at
    FROM public.institution_student_followups AS followup
    JOIN public.teacher_classroom_memberships AS membership
      ON membership.id = followup.membership_id
      AND membership.classroom_id = followup.classroom_id
      AND membership.student_id = followup.student_id
      AND membership.status = 'active'
    JOIN public.profiles AS profile
      ON profile.id = membership.student_id AND profile.deleted_at IS NULL
    WHERE followup.classroom_id = p_classroom_id
      AND followup.institution_id = v_classroom.institution_id
      AND followup.opened_at >= p_window_start
      AND followup.opened_at < p_window_end
      AND NOT public.teacher_classroom_is_blocked(v_classroom.teacher_id, membership.student_id)
    GROUP BY followup.membership_id, membership.member_ref
  )
  SELECT COALESCE(jsonb_agg(member_ref ORDER BY member_ref), '[]'::jsonb)
  INTO v_followed_refs
  FROM scoped_followups;

  WITH eligible_followups AS (
    SELECT followup.membership_id, min(followup.opened_at) AS first_opened_at
    FROM public.institution_student_followups AS followup
    JOIN public.teacher_classroom_memberships AS membership
      ON membership.id = followup.membership_id AND membership.status = 'active'
    JOIN public.profiles AS profile
      ON profile.id = membership.student_id AND profile.deleted_at IS NULL
    WHERE followup.classroom_id = p_classroom_id
      AND followup.institution_id = v_classroom.institution_id
      AND followup.opened_at >= p_window_start
      AND followup.opened_at < p_window_end - interval '14 days'
      AND NOT public.teacher_classroom_is_blocked(v_classroom.teacher_id, membership.student_id)
    GROUP BY followup.membership_id
  )
  SELECT count(*), count(*) FILTER (WHERE EXISTS (
    SELECT 1
    FROM public.institution_study_programs AS program
    WHERE program.membership_id = eligible_followups.membership_id
      AND program.classroom_id = p_classroom_id
      AND program.status IN ('published', 'completed')
      AND program.published_at >= eligible_followups.first_opened_at
      AND program.published_at <= eligible_followups.first_opened_at + interval '14 days'
  ))
  INTO v_eligible_count, v_timely_count
  FROM eligible_followups;

  RETURN jsonb_build_object(
    'followedMemberRefs', v_followed_refs,
    'interventionEligibleCount', v_eligible_count,
    'timelyInterventionCount', v_timely_count,
    'interventionStudentCount', v_eligible_count
  );
END;
$fn$;

REVOKE ALL ON FUNCTION
  public.open_institution_student_followup(uuid, uuid, text, text, text, uuid),
  public.resolve_institution_student_followup(uuid, text, uuid),
  public.get_institution_classroom_followup_metrics(uuid, uuid, timestamptz, timestamptz)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.open_institution_student_followup(uuid, uuid, text, text, text, uuid),
  public.resolve_institution_student_followup(uuid, text, uuid),
  public.get_institution_classroom_followup_metrics(uuid, uuid, timestamptz, timestamptz)
TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
