-- Migration 115: identifier-minimal institution tracking directory.
-- Managers see active classrooms in their tenant; teachers see only classrooms
-- they own. Student ids and contact fields never leave the SECURITY DEFINER RPC.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_institution_tracking_directory(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_membership public.pilot_institution_memberships%ROWTYPE;
  v_institution public.pilot_institutions%ROWTYPE;
  v_classrooms jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'institution tracking actor required' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution tracking actor mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT membership, institution
  INTO v_membership, v_institution
  FROM public.pilot_institution_memberships AS membership
  JOIN public.pilot_institutions AS institution
    ON institution.id = membership.institution_id
    AND institution.status IN ('pilot', 'active')
  JOIN public.profiles AS profile
    ON profile.id = membership.user_id AND profile.deleted_at IS NULL
  WHERE membership.user_id = p_user_id
    AND membership.status = 'active'
    AND membership.role IN ('manager', 'teacher');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active institution membership required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', classroom.id,
    'name', classroom.name,
    'teacherAlias', public.teacher_classroom_safe_alias(classroom.teacher_id),
    'activeStudentCount', (
      SELECT count(*)
      FROM public.teacher_classroom_memberships AS student_membership
      JOIN public.profiles AS student_profile
        ON student_profile.id = student_membership.student_id
        AND student_profile.deleted_at IS NULL
      WHERE student_membership.classroom_id = classroom.id
        AND student_membership.status = 'active'
        AND NOT public.teacher_classroom_is_blocked(classroom.teacher_id, student_membership.student_id)
    ),
    'students', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'memberRef', student_membership.member_ref,
        'alias', public.teacher_classroom_safe_alias(student_membership.student_id),
        'joinedAt', student_membership.accepted_at
      ) ORDER BY student_membership.accepted_at, student_membership.member_ref)
      FROM public.teacher_classroom_memberships AS student_membership
      JOIN public.profiles AS student_profile
        ON student_profile.id = student_membership.student_id
        AND student_profile.deleted_at IS NULL
      WHERE student_membership.classroom_id = classroom.id
        AND student_membership.status = 'active'
        AND NOT public.teacher_classroom_is_blocked(classroom.teacher_id, student_membership.student_id)
    ), '[]'::jsonb)
  ) ORDER BY classroom.created_at, classroom.id), '[]'::jsonb)
  INTO v_classrooms
  FROM public.teacher_classrooms AS classroom
  WHERE classroom.institution_id = v_membership.institution_id
    AND classroom.status = 'active'
    AND (v_membership.role = 'manager' OR classroom.teacher_id = p_user_id);

  RETURN jsonb_build_object(
    'institution', jsonb_build_object(
      'name', v_institution.name,
      'status', v_institution.status
    ),
    'membership', jsonb_build_object('role', v_membership.role),
    'classrooms', v_classrooms
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_institution_tracking_directory(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_institution_tracking_directory(uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
