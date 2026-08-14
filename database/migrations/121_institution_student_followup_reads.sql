-- Migration 121: assigned-teacher read model for one student's support history.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_institution_student_followups(
  p_user_id uuid,
  p_classroom_id uuid,
  p_member_ref text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_membership public.teacher_classroom_memberships%ROWTYPE;
  v_followups jsonb;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_member_ref IS NULL
    OR p_member_ref !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'invalid institution follow-up scope' USING ERRCODE = '22023';
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'followupRef', scoped.followup_ref,
    'reasonCode', scoped.reason_code,
    'status', scoped.status,
    'note', scoped.note,
    'openedAt', scoped.opened_at,
    'resolvedAt', scoped.resolved_at
  ) ORDER BY scoped.opened_at DESC), '[]'::jsonb)
  INTO v_followups
  FROM (
    SELECT followup_ref, reason_code, status, note, opened_at, resolved_at
    FROM public.institution_student_followups
    WHERE institution_id = v_classroom.institution_id
      AND classroom_id = p_classroom_id
      AND membership_id = v_membership.id
      AND student_id = v_membership.student_id
      AND teacher_id = p_user_id
    ORDER BY opened_at DESC
    LIMIT 20
  ) AS scoped;
  RETURN jsonb_build_object('followups', v_followups);
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_institution_student_followups(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_institution_student_followups(uuid, uuid, text)
  TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
