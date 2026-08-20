-- Migration 132: keep institution staff access separate from platform content/admin roles.
-- Institution managers and teachers can manage their classrooms without receiving
-- the global teacher_pilot role or any /admin entry permission.
BEGIN;

INSERT INTO public.role_permissions (role_id, permission)
SELECT role.id, 'teacher.classrooms.manage'
FROM public.roles AS role
WHERE role.slug = 'institution_pilot_staff'
ON CONFLICT (role_id, permission) DO NOTHING;

-- Migration 112 assigned teacher_pilot automatically to every institution staff
-- member. Remove that legacy coupling for active institution memberships. A
-- platform administrator may explicitly reassign a global content role later when
-- a real dual-role use case is reviewed.
DELETE FROM public.user_roles AS user_role
USING public.roles AS role
WHERE user_role.role_id = role.id
  AND role.slug = 'teacher_pilot'
  AND EXISTS (
    SELECT 1
    FROM public.pilot_institution_memberships AS membership
    JOIN public.pilot_institutions AS institution
      ON institution.id = membership.institution_id
      AND institution.status IN ('pilot', 'active')
    WHERE membership.user_id = user_role.user_id
      AND membership.status = 'active'
  )
  AND EXISTS (
    SELECT 1
    FROM public.user_roles AS institution_assignment
    JOIN public.roles AS institution_role
      ON institution_role.id = institution_assignment.role_id
      AND institution_role.slug = 'institution_pilot_staff'
    WHERE institution_assignment.user_id = user_role.user_id
  );

CREATE OR REPLACE FUNCTION public.provision_pilot_institution(
  p_user_id uuid,
  p_name text,
  p_manager_user_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_name text := btrim(p_name);
  v_hash text;
  v_request public.pilot_institution_requests%ROWTYPE;
  v_institution public.pilot_institutions%ROWTYPE;
  v_membership public.pilot_institution_memberships%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_manager_user_id IS NULL OR p_request_id IS NULL
    OR v_name IS NULL OR char_length(v_name) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'invalid institution provision request' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.institution_pilot_is_platform_admin(p_user_id) THEN
    RAISE EXCEPTION 'institution platform permission required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_manager_user_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'institution manager not found' USING ERRCODE = 'P0002';
  END IF;

  v_hash := public.institution_pilot_payload_hash(jsonb_build_object(
    'name', v_name,
    'managerUserId', p_manager_user_id
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'institution-request:' || p_user_id::text || ':provision:' || p_request_id::text, 0
  ));
  SELECT * INTO v_request
  FROM public.pilot_institution_requests
  WHERE user_id = p_user_id AND operation = 'provision' AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'institution request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pilot_institution_memberships
    WHERE user_id = p_manager_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'manager already belongs to an active institution'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.pilot_institutions(name, created_by)
  VALUES (v_name, p_user_id)
  RETURNING * INTO v_institution;

  INSERT INTO public.pilot_institution_memberships(
    institution_id, user_id, role, assigned_by
  ) VALUES (
    v_institution.id, p_manager_user_id, 'manager', p_user_id
  ) RETURNING * INTO v_membership;

  INSERT INTO public.user_roles(user_id, role_id, assigned_by)
  SELECT p_manager_user_id, role.id, p_user_id
  FROM public.roles AS role
  WHERE role.slug = 'institution_pilot_staff'
  ON CONFLICT (user_id, role_id) DO NOTHING;

  v_result := jsonb_build_object(
    'institution', jsonb_build_object(
      'id', v_institution.id,
      'name', v_institution.name,
      'status', v_institution.status,
      'studentLimit', v_institution.student_limit,
      'staffLimit', v_institution.staff_limit,
      'createdAt', v_institution.created_at
    ),
    'membership', jsonb_build_object(
      'memberRef', v_membership.member_ref,
      'role', v_membership.role,
      'joinedAt', v_membership.joined_at
    ),
    'replayed', false
  );
  INSERT INTO public.pilot_institution_requests(
    user_id, operation, request_id, payload_hash, result
  ) VALUES (p_user_id, 'provision', p_request_id, v_hash, v_result);
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.add_pilot_institution_teacher(
  p_user_id uuid,
  p_institution_id uuid,
  p_teacher_user_id uuid,
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
  v_institution public.pilot_institutions%ROWTYPE;
  v_membership public.pilot_institution_memberships%ROWTYPE;
  v_result jsonb;
  v_staff_count integer;
BEGIN
  IF p_user_id IS NULL OR p_institution_id IS NULL OR p_teacher_user_id IS NULL
    OR p_request_id IS NULL OR p_teacher_user_id = p_user_id THEN
    RAISE EXCEPTION 'invalid institution teacher request' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.institution_pilot_has_role(
    p_user_id, p_institution_id, ARRAY['manager']::text[]
  ) AND NOT public.institution_pilot_is_platform_admin(p_user_id) THEN
    RAISE EXCEPTION 'institution manager permission required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_teacher_user_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'institution teacher not found' USING ERRCODE = 'P0002';
  END IF;

  v_hash := public.institution_pilot_payload_hash(jsonb_build_object(
    'institutionId', p_institution_id,
    'teacherUserId', p_teacher_user_id
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'institution-request:' || p_user_id::text || ':add-teacher:' || p_request_id::text, 0
  ));
  SELECT * INTO v_request
  FROM public.pilot_institution_requests
  WHERE user_id = p_user_id AND operation = 'add_teacher' AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'institution request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'institution-staff:' || p_institution_id::text, 0
  ));
  SELECT * INTO v_institution
  FROM public.pilot_institutions
  WHERE id = p_institution_id AND status IN ('pilot', 'active')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'institution not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*) INTO v_staff_count
  FROM public.pilot_institution_memberships
  WHERE institution_id = p_institution_id AND status = 'active';
  IF v_staff_count >= v_institution.staff_limit THEN
    RAISE EXCEPTION 'institution staff capacity reached' USING ERRCODE = 'P0003';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.pilot_institution_memberships
    WHERE user_id = p_teacher_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'teacher already belongs to an active institution'
      USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.teacher_classrooms
    WHERE teacher_id = p_teacher_user_id
      AND institution_id <> p_institution_id
  ) THEN
    RAISE EXCEPTION 'teacher classrooms require an explicit tenant transfer'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.pilot_institution_memberships(
    institution_id, user_id, role, assigned_by
  ) VALUES (
    p_institution_id, p_teacher_user_id, 'teacher', p_user_id
  ) RETURNING * INTO v_membership;

  INSERT INTO public.user_roles(user_id, role_id, assigned_by)
  SELECT p_teacher_user_id, role.id, p_user_id
  FROM public.roles AS role
  WHERE role.slug = 'institution_pilot_staff'
  ON CONFLICT (user_id, role_id) DO NOTHING;

  v_result := jsonb_build_object(
    'institutionId', p_institution_id,
    'memberRef', v_membership.member_ref,
    'role', v_membership.role,
    'joinedAt', v_membership.joined_at,
    'replayed', false
  );
  INSERT INTO public.pilot_institution_requests(
    user_id, operation, request_id, payload_hash, result
  ) VALUES (p_user_id, 'add_teacher', p_request_id, v_hash, v_result);
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.teacher_classroom_is_teacher(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS user_role
    JOIN public.roles AS role ON role.id = user_role.role_id
    JOIN public.role_permissions AS permission ON permission.role_id = role.id
    JOIN public.profiles AS profile ON profile.id = user_role.user_id
    JOIN public.pilot_institution_memberships AS membership
      ON membership.user_id = user_role.user_id
      AND membership.status = 'active'
      AND membership.role IN ('manager', 'teacher')
    JOIN public.pilot_institutions AS institution
      ON institution.id = membership.institution_id
      AND institution.status IN ('pilot', 'active')
    WHERE user_role.user_id = p_user_id
      AND role.slug = 'institution_pilot_staff'
      AND permission.permission = 'teacher.classrooms.manage'
      AND profile.deleted_at IS NULL
  );
$fn$;

NOTIFY pgrst, 'reload schema';
COMMIT;
