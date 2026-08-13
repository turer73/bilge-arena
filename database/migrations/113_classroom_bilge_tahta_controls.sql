BEGIN;

ALTER TABLE public.teacher_classrooms
  ADD COLUMN IF NOT EXISTS bilge_tahta_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_my_classroom_bilge_tahta_access(
  p_user_id uuid,
  p_classroom_id uuid,
  p_institution_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_is_teacher boolean := false;
  v_is_student boolean := false;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_institution_id IS NULL THEN
    RAISE EXCEPTION 'user and classroom required' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'classroom actor mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_classroom
  FROM public.teacher_classrooms
  WHERE id = p_classroom_id
    AND institution_id = p_institution_id
    AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'classroom not found' USING ERRCODE = 'P0002';
  END IF;

  v_is_teacher := v_classroom.teacher_id = p_user_id
    AND p_institution_id = public.institution_pilot_active_institution(p_user_id)
    AND public.teacher_classroom_is_teacher(p_user_id);
  SELECT EXISTS (
    SELECT 1
    FROM public.teacher_classroom_memberships AS membership
    JOIN public.profiles AS profile ON profile.id = membership.student_id
    WHERE membership.classroom_id = v_classroom.id
      AND membership.student_id = p_user_id
      AND membership.status = 'active'
      AND profile.deleted_at IS NULL
      AND public.institution_pilot_has_role(
        v_classroom.teacher_id,
        p_institution_id,
        ARRAY['teacher', 'manager']::text[]
      )
      AND NOT public.teacher_classroom_is_blocked(p_user_id, v_classroom.teacher_id)
  ) INTO v_is_student;

  IF NOT v_is_teacher AND NOT v_is_student THEN
    RAISE EXCEPTION 'classroom not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object('enabled', v_classroom.bilge_tahta_enabled);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.set_teacher_classroom_bilge_tahta(
  p_user_id uuid,
  p_classroom_id uuid,
  p_institution_id uuid,
  p_enabled boolean,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_hash text;
  v_request public.teacher_classroom_requests%ROWTYPE;
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_result jsonb;
  v_institution_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_institution_id IS NULL
    OR p_enabled IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'invalid Bilge Tahta setting' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'classroom actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.teacher_classroom_is_teacher(p_user_id) THEN
    RAISE EXCEPTION 'teacher permission required' USING ERRCODE = '42501';
  END IF;
  v_institution_id := public.institution_pilot_active_institution(p_user_id);
  IF v_institution_id IS NULL OR v_institution_id <> p_institution_id THEN
    RAISE EXCEPTION 'institution membership required' USING ERRCODE = '42501';
  END IF;

  v_hash := public.teacher_classroom_payload_hash(jsonb_build_object(
    'classroomId', p_classroom_id,
    'institutionId', p_institution_id,
    'enabled', p_enabled
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'teacher-request:' || p_user_id::text || ':bilge-tahta:' || p_request_id::text, 0
  ));
  SELECT * INTO v_request
  FROM public.teacher_classroom_requests
  WHERE user_id = p_user_id
    AND operation = 'set_bilge_tahta'
    AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'Bilge Tahta request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;

  SELECT * INTO v_classroom
  FROM public.teacher_classrooms
  WHERE id = p_classroom_id
    AND teacher_id = p_user_id
    AND institution_id = v_institution_id
    AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'classroom not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.teacher_classrooms
  SET bilge_tahta_enabled = p_enabled
  WHERE id = v_classroom.id;

  v_result := jsonb_build_object(
    'classroomId', v_classroom.id,
    'enabled', p_enabled,
    'replayed', false
  );
  INSERT INTO public.teacher_classroom_requests(user_id, operation, request_id, payload_hash, result)
  VALUES (p_user_id, 'set_bilge_tahta', p_request_id, v_hash, v_result);
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION
  public.get_my_classroom_bilge_tahta_access(uuid, uuid, uuid),
  public.set_teacher_classroom_bilge_tahta(uuid, uuid, uuid, boolean, uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.get_my_classroom_bilge_tahta_access(uuid, uuid, uuid),
  public.set_teacher_classroom_bilge_tahta(uuid, uuid, uuid, boolean, uuid)
TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
