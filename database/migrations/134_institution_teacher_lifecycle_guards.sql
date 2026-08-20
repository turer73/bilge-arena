-- Migration 134: keep teacher membership and classroom ownership lifecycle
-- consistent while institution managers add and remove staff.
BEGIN;

CREATE OR REPLACE FUNCTION public.add_my_institution_teacher_by_email(
  p_user_id uuid,
  p_teacher_email text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_email text := lower(btrim(p_teacher_email));
  v_institution_id uuid;
  v_teacher_user_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR v_email IS NULL
    OR char_length(v_email) NOT BETWEEN 3 AND 254
    OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'invalid institution teacher email request' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution teacher actor mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT membership.institution_id INTO v_institution_id
  FROM public.pilot_institution_memberships AS membership
  JOIN public.pilot_institutions AS institution
    ON institution.id = membership.institution_id
    AND institution.status IN ('pilot', 'active')
  JOIN public.profiles AS profile
    ON profile.id = membership.user_id AND profile.deleted_at IS NULL
  WHERE membership.user_id = p_user_id
    AND membership.status = 'active'
    AND membership.role = 'manager';
  IF NOT FOUND OR NOT public.institution_member_has_permission(
    p_user_id, v_institution_id, 'institution.staff.manage'
  ) THEN
    RAISE EXCEPTION 'institution staff manager required' USING ERRCODE = '42501';
  END IF;

  SELECT auth_user.id INTO v_teacher_user_id
  FROM auth.users AS auth_user
  JOIN public.profiles AS profile
    ON profile.id = auth_user.id AND profile.deleted_at IS NULL
  WHERE lower(auth_user.email) = v_email
    AND auth_user.email_confirmed_at IS NOT NULL
    AND auth_user.deleted_at IS NULL
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'verified institution teacher not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN public.add_pilot_institution_teacher(
    p_user_id,
    v_institution_id,
    v_teacher_user_id,
    p_request_id
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_teacher_classroom(
  p_user_id uuid,
  p_name text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_name text := btrim(p_name);
  v_membership public.pilot_institution_memberships%ROWTYPE;
  v_institution_id uuid;
  v_hash text;
  v_request public.teacher_classroom_requests%ROWTYPE;
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL
    OR v_name IS NULL OR char_length(v_name) NOT BETWEEN 2 AND 60 THEN
    RAISE EXCEPTION 'invalid classroom request' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'classroom actor mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT membership.* INTO v_membership
  FROM public.pilot_institution_memberships AS membership
  JOIN public.pilot_institutions AS institution
    ON institution.id = membership.institution_id
    AND institution.status IN ('pilot', 'active')
  JOIN public.profiles AS profile
    ON profile.id = membership.user_id AND profile.deleted_at IS NULL
  WHERE membership.user_id = p_user_id
    AND membership.status = 'active'
    AND membership.role IN ('manager', 'teacher')
  FOR UPDATE OF membership;
  IF NOT FOUND OR NOT public.teacher_classroom_is_teacher(p_user_id) THEN
    RAISE EXCEPTION 'teacher permission and institution membership required'
      USING ERRCODE = '42501';
  END IF;
  v_institution_id := v_membership.institution_id;

  v_hash := public.teacher_classroom_payload_hash(jsonb_build_object(
    'institutionId', v_institution_id,
    'name', v_name
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'teacher-request:' || p_user_id::text || ':create:' || p_request_id::text, 0
  ));
  SELECT * INTO v_request
  FROM public.teacher_classroom_requests
  WHERE user_id = p_user_id AND operation = 'create_classroom' AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'classroom request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;

  INSERT INTO public.teacher_classrooms (institution_id, teacher_id, name)
  VALUES (v_institution_id, p_user_id, v_name)
  RETURNING * INTO v_classroom;

  v_result := jsonb_build_object(
    'classroom', jsonb_build_object(
      'id', v_classroom.id,
      'name', v_classroom.name,
      'status', v_classroom.status,
      'createdAt', v_classroom.created_at
    ),
    'replayed', false
  );
  INSERT INTO public.teacher_classroom_requests(user_id, operation, request_id, payload_hash, result)
  VALUES (p_user_id, 'create_classroom', p_request_id, v_hash, v_result);
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.remove_pilot_institution_teacher(
  p_user_id uuid,
  p_institution_id uuid,
  p_member_ref text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_hash text;
  v_request public.pilot_institution_requests%ROWTYPE;
  v_membership public.pilot_institution_memberships%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_institution_id IS NULL OR p_request_id IS NULL
    OR p_member_ref IS NULL OR p_member_ref !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'invalid institution removal request' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.institution_pilot_has_role(
    p_user_id, p_institution_id, ARRAY['manager']::text[]
  ) AND NOT public.institution_pilot_is_platform_admin(p_user_id) THEN
    RAISE EXCEPTION 'institution manager permission required' USING ERRCODE = '42501';
  END IF;

  v_hash := public.institution_pilot_payload_hash(jsonb_build_object(
    'institutionId', p_institution_id,
    'memberRef', p_member_ref
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'institution-request:' || p_user_id::text || ':remove-teacher:' || p_request_id::text, 0
  ));
  SELECT * INTO v_request
  FROM public.pilot_institution_requests
  WHERE user_id = p_user_id AND operation = 'remove_teacher' AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'institution request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;

  SELECT * INTO v_membership
  FROM public.pilot_institution_memberships
  WHERE institution_id = p_institution_id
    AND member_ref = p_member_ref
    AND role = 'teacher'
    AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'institution teacher not found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.teacher_classrooms AS classroom
    WHERE classroom.institution_id = p_institution_id
      AND classroom.teacher_id = v_membership.user_id
      AND classroom.status = 'active'
  ) THEN
    RAISE EXCEPTION 'teacher has active classrooms' USING ERRCODE = 'P0003';
  END IF;

  UPDATE public.pilot_institution_memberships
  SET status = 'removed', ended_at = clock_timestamp()
  WHERE id = v_membership.id
  RETURNING * INTO v_membership;

  IF NOT EXISTS (
    SELECT 1 FROM public.pilot_institution_memberships
    WHERE user_id = v_membership.user_id AND status = 'active'
  ) THEN
    DELETE FROM public.user_roles AS user_role
    USING public.roles AS role
    WHERE user_role.user_id = v_membership.user_id
      AND user_role.role_id = role.id
      AND role.slug = 'institution_pilot_staff';
  END IF;

  v_result := jsonb_build_object(
    'institutionId', p_institution_id,
    'memberRef', v_membership.member_ref,
    'status', v_membership.status,
    'endedAt', v_membership.ended_at,
    'replayed', false
  );
  INSERT INTO public.pilot_institution_requests(
    user_id, operation, request_id, payload_hash, result
  ) VALUES (p_user_id, 'remove_teacher', p_request_id, v_hash, v_result);
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION
  public.add_my_institution_teacher_by_email(uuid,text,uuid),
  public.create_teacher_classroom(uuid,text,uuid),
  public.remove_pilot_institution_teacher(uuid,uuid,text,uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.add_my_institution_teacher_by_email(uuid,text,uuid),
  public.create_teacher_classroom(uuid,text,uuid),
  public.remove_pilot_institution_teacher(uuid,uuid,text,uuid)
TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
