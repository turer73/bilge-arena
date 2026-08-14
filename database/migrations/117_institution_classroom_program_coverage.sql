-- Migration 117: identifier-minimal, read-only program coverage for a class.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_institution_classroom_published_program_members(
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
  v_refs jsonb;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_window_start IS NULL OR p_window_end IS NULL
    OR p_window_end <= p_window_start OR p_window_end > clock_timestamp() + interval '5 minutes'
    OR p_window_end - p_window_start > interval '5 years' THEN
    RAISE EXCEPTION 'invalid classroom program coverage window' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'classroom program coverage actor mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_classroom FROM public.teacher_classrooms
    WHERE id = p_classroom_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'classroom not found' USING ERRCODE = 'P0002'; END IF;
  SELECT membership.role INTO v_role
  FROM public.pilot_institution_memberships AS membership
  JOIN public.pilot_institutions AS institution ON institution.id=membership.institution_id
    AND institution.status IN ('pilot','active')
  JOIN public.profiles AS profile ON profile.id=membership.user_id AND profile.deleted_at IS NULL
  WHERE membership.user_id=p_user_id AND membership.institution_id=v_classroom.institution_id
    AND membership.status='active' AND membership.role IN ('manager','teacher');
  IF v_role IS NULL OR (v_role='teacher' AND v_classroom.teacher_id<>p_user_id) THEN
    RAISE EXCEPTION 'institution classroom access required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(program_member.member_ref ORDER BY program_member.member_ref), '[]'::jsonb)
  INTO v_refs
  FROM (
    SELECT DISTINCT membership.member_ref
    FROM public.institution_study_programs AS program
    JOIN public.teacher_classroom_memberships AS membership
      ON membership.id=program.membership_id AND membership.classroom_id=program.classroom_id
      AND membership.student_id=program.student_id AND membership.status='active'
    JOIN public.profiles AS profile ON profile.id=membership.student_id AND profile.deleted_at IS NULL
    WHERE program.classroom_id=p_classroom_id
      AND program.status IN ('published','completed')
      AND program.published_at>=p_window_start AND program.published_at<p_window_end
      AND NOT public.teacher_classroom_is_blocked(v_classroom.teacher_id,membership.student_id)
  ) AS program_member;
  RETURN jsonb_build_object('memberRefs',v_refs);
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_institution_classroom_published_program_members(uuid,uuid,timestamptz,timestamptz)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_institution_classroom_published_program_members(uuid,uuid,timestamptz,timestamptz)
  TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
