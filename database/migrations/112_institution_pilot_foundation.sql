-- Migration 112: single-institution pilot tenant boundary.
-- This extends the default-off teacher classroom pilot. It does not add
-- billing, attendance, parent access, branding, analytics or integrations.
BEGIN;

INSERT INTO public.roles (slug, name, description, is_system)
VALUES (
  'institution_pilot_staff',
  'Kurum Pilotu Personeli',
  'Varsayılan kapalı Bilge Arena Kurumsal pilot erişimi',
  true
)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_system = true;

INSERT INTO public.role_permissions (role_id, permission)
SELECT role.id, 'institution.pilot.access'
FROM public.roles AS role
WHERE role.slug = 'institution_pilot_staff'
ON CONFLICT (role_id, permission) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission)
SELECT role.id, 'institution.pilots.manage'
FROM public.roles AS role
WHERE role.slug = 'super_admin'
ON CONFLICT (role_id, permission) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.pilot_institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  status text NOT NULL DEFAULT 'pilot'
    CHECK (status IN ('pilot', 'active', 'suspended', 'archived')),
  student_limit smallint NOT NULL DEFAULT 200 CHECK (student_limit BETWEEN 1 AND 200),
  staff_limit smallint NOT NULL DEFAULT 6 CHECK (staff_limit BETWEEN 1 AND 6),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  archived_at timestamptz,
  CHECK (
    (status = 'archived' AND archived_at IS NOT NULL)
    OR (status <> 'archived' AND archived_at IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.pilot_institution_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_ref text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(16), 'hex')
    CHECK (member_ref ~ '^[0-9a-f]{32}$'),
  institution_id uuid NOT NULL REFERENCES public.pilot_institutions(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('manager', 'teacher')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  assigned_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ended_at timestamptz,
  CHECK (
    (status = 'active' AND ended_at IS NULL)
    OR (status = 'removed' AND ended_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS pilot_institution_one_active_membership
  ON public.pilot_institution_memberships (institution_id, user_id)
  WHERE status = 'active';

-- The first paid pilot intentionally permits staff to belong to only one
-- institution at a time. Multi-branch and cross-institution staff come later.
CREATE UNIQUE INDEX IF NOT EXISTS pilot_institution_one_active_tenant_per_staff
  ON public.pilot_institution_memberships (user_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS pilot_institution_one_active_manager
  ON public.pilot_institution_memberships (institution_id)
  WHERE status = 'active' AND role = 'manager';

CREATE INDEX IF NOT EXISTS pilot_institution_memberships_scope
  ON public.pilot_institution_memberships (institution_id, status, role);

CREATE TABLE IF NOT EXISTS public.pilot_institution_requests (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  operation text NOT NULL CHECK (char_length(operation) BETWEEN 1 AND 80),
  request_id uuid NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, operation, request_id)
);

ALTER TABLE public.pilot_institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilot_institution_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilot_institution_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.pilot_institutions,
  public.pilot_institution_memberships,
  public.pilot_institution_requests
FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.teacher_classrooms
  ADD COLUMN IF NOT EXISTS institution_id uuid
  REFERENCES public.pilot_institutions(id) ON DELETE RESTRICT;

-- R4.2 was never opened as a live pilot. Fail closed if that assumption is no
-- longer true instead of inventing a tenant for pre-existing classroom data.
DO $block$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.teacher_classrooms WHERE institution_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'teacher classrooms exist without an institution; explicit migration required'
      USING ERRCODE = '23514';
  END IF;
END;
$block$;

ALTER TABLE public.teacher_classrooms
  ALTER COLUMN institution_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS teacher_classrooms_institution_owner
  ON public.teacher_classrooms (institution_id, teacher_id, status);

CREATE OR REPLACE FUNCTION public.institution_pilot_payload_hash(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');
$fn$;

CREATE OR REPLACE FUNCTION public.institution_pilot_is_platform_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS user_role
    JOIN public.role_permissions AS permission ON permission.role_id = user_role.role_id
    JOIN public.profiles AS profile ON profile.id = user_role.user_id
    WHERE user_role.user_id = p_user_id
      AND permission.permission = 'institution.pilots.manage'
      AND profile.deleted_at IS NULL
  );
$fn$;

CREATE OR REPLACE FUNCTION public.institution_pilot_has_role(
  p_user_id uuid,
  p_institution_id uuid,
  p_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.pilot_institution_memberships AS membership
    JOIN public.pilot_institutions AS institution ON institution.id = membership.institution_id
    JOIN public.profiles AS profile ON profile.id = membership.user_id
    WHERE membership.user_id = p_user_id
      AND membership.institution_id = p_institution_id
      AND membership.status = 'active'
      AND membership.role = ANY(p_roles)
      AND institution.status IN ('pilot', 'active')
      AND profile.deleted_at IS NULL
  );
$fn$;

CREATE OR REPLACE FUNCTION public.institution_pilot_active_institution(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT membership.institution_id
  FROM public.pilot_institution_memberships AS membership
  JOIN public.pilot_institutions AS institution ON institution.id = membership.institution_id
  JOIN public.profiles AS profile ON profile.id = membership.user_id
  WHERE membership.user_id = p_user_id
    AND membership.status = 'active'
    AND membership.role IN ('manager', 'teacher')
    AND institution.status IN ('pilot', 'active')
    AND profile.deleted_at IS NULL
  LIMIT 1;
$fn$;

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
  WHERE role.slug IN ('teacher_pilot', 'institution_pilot_staff')
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

  INSERT INTO public.pilot_institution_memberships(
    institution_id, user_id, role, assigned_by
  ) VALUES (
    p_institution_id, p_teacher_user_id, 'teacher', p_user_id
  ) RETURNING * INTO v_membership;

  INSERT INTO public.user_roles(user_id, role_id, assigned_by)
  SELECT p_teacher_user_id, role.id, p_user_id
  FROM public.roles AS role
  WHERE role.slug IN ('teacher_pilot', 'institution_pilot_staff')
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

CREATE OR REPLACE FUNCTION public.get_my_pilot_institution(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_membership public.pilot_institution_memberships%ROWTYPE;
  v_institution public.pilot_institutions%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user required' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution actor mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT membership.* INTO v_membership
  FROM public.pilot_institution_memberships AS membership
  JOIN public.profiles AS profile ON profile.id = membership.user_id
  WHERE membership.user_id = p_user_id
    AND membership.status = 'active'
    AND profile.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'institution membership not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_institution
  FROM public.pilot_institutions
  WHERE id = v_membership.institution_id AND status IN ('pilot', 'active');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'institution not active' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'institution', jsonb_build_object(
      'id', v_institution.id,
      'name', v_institution.name,
      'status', v_institution.status,
      'studentLimit', v_institution.student_limit,
      'staffLimit', v_institution.staff_limit,
      'staffCount', (
        SELECT count(*)
        FROM public.pilot_institution_memberships
        WHERE institution_id = v_institution.id AND status = 'active'
      ),
      'createdAt', v_institution.created_at
    ),
    'membership', jsonb_build_object(
      'memberRef', v_membership.member_ref,
      'role', v_membership.role,
      'joinedAt', v_membership.joined_at
    )
  );
END;
$fn$;

-- A global teacher role is only an application-level entrance gate. Every
-- teacher operation now also requires an active tenant membership.
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
      AND role.slug = 'teacher_pilot'
      AND permission.permission = 'teacher.classrooms.manage'
      AND profile.deleted_at IS NULL
  );
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
  IF NOT public.teacher_classroom_is_teacher(p_user_id) THEN
    RAISE EXCEPTION 'teacher permission and institution membership required'
      USING ERRCODE = '42501';
  END IF;
  v_institution_id := public.institution_pilot_active_institution(p_user_id);
  IF v_institution_id IS NULL THEN
    RAISE EXCEPTION 'active institution membership required' USING ERRCODE = '42501';
  END IF;

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

CREATE OR REPLACE FUNCTION public.get_my_teacher_classrooms(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_institution_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user required' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'classroom actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.teacher_classroom_is_teacher(p_user_id) THEN
    RAISE EXCEPTION 'teacher permission and institution membership required'
      USING ERRCODE = '42501';
  END IF;
  v_institution_id := public.institution_pilot_active_institution(p_user_id);

  RETURN jsonb_build_object(
    'classrooms', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', classroom.id,
        'name', classroom.name,
        'status', classroom.status,
        'activeStudentCount', (
          SELECT count(*)
          FROM public.teacher_classroom_memberships AS membership
          JOIN public.profiles AS profile ON profile.id = membership.student_id
          WHERE membership.classroom_id = classroom.id
            AND membership.status = 'active'
            AND profile.deleted_at IS NULL
            AND NOT public.teacher_classroom_is_blocked(p_user_id, membership.student_id)
        ),
        'assignmentCount', (
          SELECT count(*)
          FROM public.teacher_assignments AS assignment
          WHERE assignment.classroom_id = classroom.id
            AND assignment.teacher_id = p_user_id
        ),
        'createdAt', classroom.created_at
      ) ORDER BY classroom.created_at, classroom.id)
      FROM public.teacher_classrooms AS classroom
      WHERE classroom.teacher_id = p_user_id
        AND classroom.institution_id = v_institution_id
    ), '[]'::jsonb)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION
  public.institution_pilot_payload_hash(jsonb),
  public.institution_pilot_is_platform_admin(uuid),
  public.institution_pilot_has_role(uuid, uuid, text[]),
  public.institution_pilot_active_institution(uuid),
  public.provision_pilot_institution(uuid, text, uuid, uuid),
  public.add_pilot_institution_teacher(uuid, uuid, uuid, uuid),
  public.remove_pilot_institution_teacher(uuid, uuid, text, uuid),
  public.get_my_pilot_institution(uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.provision_pilot_institution(uuid, text, uuid, uuid),
  public.add_pilot_institution_teacher(uuid, uuid, uuid, uuid),
  public.remove_pilot_institution_teacher(uuid, uuid, text, uuid),
  public.get_my_pilot_institution(uuid)
TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
