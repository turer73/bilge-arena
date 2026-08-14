-- Migration 126: tenant-scoped institution roles and permissions.
-- Platform roles remain global; institution roles are owned and managed only
-- inside one active pilot institution. System roles are immutable.
BEGIN;

CREATE TABLE IF NOT EXISTS public.institution_permission_catalog (
  permission text PRIMARY KEY CHECK (permission ~ '^institution\.[a-z0-9_.]+$'),
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 2 AND 80),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 10 AND 240),
  delegable boolean NOT NULL DEFAULT false
);

INSERT INTO public.institution_permission_catalog(permission, label, description, delegable)
VALUES
  ('institution.workspace.view', 'Kurum alanını görüntüleme', 'Kurum çalışma alanına ve kişinin kendi sınıflarına erişir.', false),
  ('institution.classrooms.view_all', 'Tüm sınıfları görüntüleme', 'Kurumdaki bütün aktif sınıfları ve öğrenci dizinini görüntüler.', true),
  ('institution.staff.manage', 'Personel yönetimi', 'Kurum personelini ekler veya kurumdan çıkarır.', false),
  ('institution.roles.manage', 'Rol ve yetki yönetimi', 'Kurum rollerini oluşturur ve personele atar.', false),
  ('institution.support.manage', 'Destek erişimi yönetimi', 'Bilge Arena için süreli salt okunur destek erişimini yönetir.', false)
ON CONFLICT (permission) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  delegable = EXCLUDED.delegable;

CREATE TABLE IF NOT EXISTS public.institution_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_ref text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(16), 'hex')
    CHECK (role_ref ~ '^[0-9a-f]{32}$'),
  institution_id uuid NOT NULL REFERENCES public.pilot_institutions(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 50),
  description text CHECK (description IS NULL OR char_length(btrim(description)) BETWEEN 2 AND 200),
  role_key text CHECK (role_key IS NULL OR role_key IN ('manager', 'teacher')),
  is_system boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((is_system AND role_key IS NOT NULL) OR (NOT is_system AND role_key IS NULL)),
  UNIQUE (id, institution_id),
  UNIQUE (institution_id, role_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS institution_roles_tenant_name_unique
  ON public.institution_roles (institution_id, lower(name));

CREATE TABLE IF NOT EXISTS public.institution_role_permissions (
  role_id uuid NOT NULL,
  institution_id uuid NOT NULL,
  permission text NOT NULL REFERENCES public.institution_permission_catalog(permission) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (role_id, permission),
  FOREIGN KEY (role_id, institution_id)
    REFERENCES public.institution_roles(id, institution_id) ON DELETE CASCADE
);

ALTER TABLE public.pilot_institution_memberships
  ADD CONSTRAINT pilot_institution_memberships_id_tenant_unique
  UNIQUE (id, institution_id);

CREATE TABLE IF NOT EXISTS public.institution_membership_roles (
  membership_id uuid NOT NULL,
  role_id uuid NOT NULL,
  institution_id uuid NOT NULL,
  assigned_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (membership_id, role_id),
  FOREIGN KEY (membership_id, institution_id)
    REFERENCES public.pilot_institution_memberships(id, institution_id) ON DELETE CASCADE,
  FOREIGN KEY (role_id, institution_id)
    REFERENCES public.institution_roles(id, institution_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS institution_membership_roles_tenant_member
  ON public.institution_membership_roles (institution_id, membership_id);

ALTER TABLE public.institution_permission_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institution_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institution_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institution_membership_roles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.institution_permission_catalog,
  public.institution_roles,
  public.institution_role_permissions,
  public.institution_membership_roles
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.institution_seed_system_roles_for_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_manager_role_id uuid;
  v_teacher_role_id uuid;
  v_role_id uuid;
BEGIN
  INSERT INTO public.institution_roles(
    institution_id, name, description, role_key, is_system, created_by
  ) VALUES
    (NEW.institution_id, 'Kurum Yöneticisi', 'Kurumun değiştirilemeyen tam yetkili sistem rolü.', 'manager', true, NEW.assigned_by),
    (NEW.institution_id, 'Öğretmen', 'Öğretmenin kendi sınıflarıyla sınırlı temel sistem rolü.', 'teacher', true, NEW.assigned_by)
  ON CONFLICT (institution_id, role_key) DO NOTHING;

  SELECT id INTO v_manager_role_id FROM public.institution_roles
  WHERE institution_id = NEW.institution_id AND role_key = 'manager';
  SELECT id INTO v_teacher_role_id FROM public.institution_roles
  WHERE institution_id = NEW.institution_id AND role_key = 'teacher';

  INSERT INTO public.institution_role_permissions(role_id, institution_id, permission)
  SELECT v_manager_role_id, NEW.institution_id, catalog.permission
  FROM public.institution_permission_catalog AS catalog
  ON CONFLICT (role_id, permission) DO NOTHING;

  INSERT INTO public.institution_role_permissions(role_id, institution_id, permission)
  VALUES (v_teacher_role_id, NEW.institution_id, 'institution.workspace.view')
  ON CONFLICT (role_id, permission) DO NOTHING;

  v_role_id := CASE WHEN NEW.role = 'manager' THEN v_manager_role_id ELSE v_teacher_role_id END;
  INSERT INTO public.institution_membership_roles(
    membership_id, role_id, institution_id, assigned_by
  ) VALUES (NEW.id, v_role_id, NEW.institution_id, NEW.assigned_by)
  ON CONFLICT (membership_id, role_id) DO NOTHING;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS institution_membership_seed_system_roles
  ON public.pilot_institution_memberships;
CREATE TRIGGER institution_membership_seed_system_roles
AFTER INSERT ON public.pilot_institution_memberships
FOR EACH ROW EXECUTE FUNCTION public.institution_seed_system_roles_for_membership();

INSERT INTO public.institution_roles(
  institution_id, name, description, role_key, is_system, created_by
)
SELECT institution.id, seed.name, seed.description, seed.role_key, true, institution.created_by
FROM public.pilot_institutions AS institution
CROSS JOIN (VALUES
  ('Kurum Yöneticisi', 'Kurumun değiştirilemeyen tam yetkili sistem rolü.', 'manager'),
  ('Öğretmen', 'Öğretmenin kendi sınıflarıyla sınırlı temel sistem rolü.', 'teacher')
) AS seed(name, description, role_key)
ON CONFLICT (institution_id, role_key) DO NOTHING;

INSERT INTO public.institution_role_permissions(role_id, institution_id, permission)
SELECT role.id, role.institution_id, catalog.permission
FROM public.institution_roles AS role
CROSS JOIN public.institution_permission_catalog AS catalog
WHERE role.is_system AND role.role_key = 'manager'
ON CONFLICT (role_id, permission) DO NOTHING;

INSERT INTO public.institution_role_permissions(role_id, institution_id, permission)
SELECT role.id, role.institution_id, 'institution.workspace.view'
FROM public.institution_roles AS role
WHERE role.is_system AND role.role_key = 'teacher'
ON CONFLICT (role_id, permission) DO NOTHING;

INSERT INTO public.institution_membership_roles(
  membership_id, role_id, institution_id, assigned_by
)
SELECT membership.id, role.id, membership.institution_id, membership.assigned_by
FROM public.pilot_institution_memberships AS membership
JOIN public.institution_roles AS role
  ON role.institution_id = membership.institution_id
  AND role.role_key = membership.role
  AND role.is_system
WHERE membership.status = 'active'
ON CONFLICT (membership_id, role_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.institution_member_has_permission(
  p_user_id uuid,
  p_institution_id uuid,
  p_permission text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.pilot_institution_memberships AS membership
    JOIN public.pilot_institutions AS institution
      ON institution.id = membership.institution_id
      AND institution.status IN ('pilot', 'active')
    JOIN public.profiles AS profile
      ON profile.id = membership.user_id AND profile.deleted_at IS NULL
    JOIN public.institution_membership_roles AS membership_role
      ON membership_role.membership_id = membership.id
      AND membership_role.institution_id = membership.institution_id
    JOIN public.institution_role_permissions AS role_permission
      ON role_permission.role_id = membership_role.role_id
      AND role_permission.institution_id = membership.institution_id
    WHERE membership.user_id = p_user_id
      AND membership.institution_id = p_institution_id
      AND membership.status = 'active'
      AND role_permission.permission = p_permission
  );
$fn$;

CREATE OR REPLACE FUNCTION public.get_my_institution_role_directory(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_institution_id uuid;
  v_roles jsonb;
  v_members jsonb;
  v_permissions jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'institution role actor required' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution role actor mismatch' USING ERRCODE = '42501';
  END IF;
  SELECT membership.institution_id INTO v_institution_id
  FROM public.pilot_institution_memberships AS membership
  JOIN public.pilot_institutions AS institution
    ON institution.id = membership.institution_id AND institution.status IN ('pilot', 'active')
  JOIN public.profiles AS profile
    ON profile.id = membership.user_id AND profile.deleted_at IS NULL
  WHERE membership.user_id = p_user_id
    AND membership.status = 'active'
    AND membership.role = 'manager';
  IF NOT FOUND OR NOT public.institution_member_has_permission(
    p_user_id, v_institution_id, 'institution.roles.manage'
  ) THEN
    RAISE EXCEPTION 'institution role manager required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'permission', catalog.permission,
    'label', catalog.label,
    'description', catalog.description,
    'delegable', catalog.delegable
  ) ORDER BY catalog.permission), '[]'::jsonb)
  INTO v_permissions
  FROM public.institution_permission_catalog AS catalog;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'roleRef', role.role_ref,
    'name', role.name,
    'description', role.description,
    'system', role.is_system,
    'roleKey', role.role_key,
    'permissions', COALESCE((
      SELECT jsonb_agg(permission.permission ORDER BY permission.permission)
      FROM public.institution_role_permissions AS permission
      WHERE permission.role_id = role.id
    ), '[]'::jsonb),
    'memberCount', (
      SELECT count(*)::integer FROM public.institution_membership_roles AS assignment
      JOIN public.pilot_institution_memberships AS membership ON membership.id = assignment.membership_id
      WHERE assignment.role_id = role.id AND membership.status = 'active'
    )
  ) ORDER BY role.is_system DESC, role.role_key NULLS LAST, lower(role.name)), '[]'::jsonb)
  INTO v_roles
  FROM public.institution_roles AS role
  WHERE role.institution_id = v_institution_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'memberRef', membership.member_ref,
    'alias', public.teacher_classroom_safe_alias(membership.user_id),
    'membershipRole', membership.role,
    'roleRefs', COALESCE((
      SELECT jsonb_agg(role.role_ref ORDER BY role.is_system DESC, lower(role.name))
      FROM public.institution_membership_roles AS assignment
      JOIN public.institution_roles AS role ON role.id = assignment.role_id
      WHERE assignment.membership_id = membership.id
    ), '[]'::jsonb)
  ) ORDER BY (membership.role = 'manager') DESC, membership.joined_at, membership.member_ref), '[]'::jsonb)
  INTO v_members
  FROM public.pilot_institution_memberships AS membership
  JOIN public.profiles AS profile ON profile.id = membership.user_id AND profile.deleted_at IS NULL
  WHERE membership.institution_id = v_institution_id AND membership.status = 'active';

  RETURN jsonb_build_object(
    'permissions', v_permissions,
    'roles', v_roles,
    'members', v_members
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_my_institution_role(
  p_user_id uuid,
  p_name text,
  p_description text,
  p_permissions text[],
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_institution_id uuid;
  v_name text := btrim(p_name);
  v_description text := nullif(btrim(p_description), '');
  v_permissions text[] := ARRAY(SELECT DISTINCT value FROM unnest(COALESCE(p_permissions, ARRAY[]::text[])) AS value ORDER BY value);
  v_hash text;
  v_request public.pilot_institution_requests%ROWTYPE;
  v_role public.institution_roles%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR v_name IS NULL
    OR char_length(v_name) NOT BETWEEN 2 AND 50
    OR (v_description IS NOT NULL AND char_length(v_description) NOT BETWEEN 2 AND 200) THEN
    RAISE EXCEPTION 'invalid institution role request' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution role actor mismatch' USING ERRCODE = '42501';
  END IF;
  SELECT institution_id INTO v_institution_id FROM public.pilot_institution_memberships
  WHERE user_id = p_user_id AND status = 'active' AND role = 'manager';
  IF NOT FOUND OR NOT public.institution_member_has_permission(p_user_id, v_institution_id, 'institution.roles.manage') THEN
    RAISE EXCEPTION 'institution role manager required' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_permissions) AS requested(permission)
    LEFT JOIN public.institution_permission_catalog AS catalog
      ON catalog.permission = requested.permission AND catalog.delegable
    WHERE catalog.permission IS NULL
  ) THEN
    RAISE EXCEPTION 'non-delegable institution permission' USING ERRCODE = '42501';
  END IF;
  v_hash := public.institution_pilot_payload_hash(jsonb_build_object(
    'name', v_name, 'description', v_description, 'permissions', to_jsonb(v_permissions)
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':create-institution-role:' || p_request_id::text, 0));
  SELECT * INTO v_request FROM public.pilot_institution_requests
  WHERE user_id = p_user_id AND operation = 'create_institution_role' AND request_id = p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN RAISE EXCEPTION 'institution role payload mismatch' USING ERRCODE = '22023'; END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;
  IF (SELECT count(*) FROM public.institution_roles WHERE institution_id = v_institution_id AND NOT is_system) >= 12 THEN
    RAISE EXCEPTION 'institution custom role capacity reached' USING ERRCODE = 'P0003';
  END IF;

  INSERT INTO public.institution_roles(institution_id, name, description, created_by)
  VALUES (v_institution_id, v_name, v_description, p_user_id)
  RETURNING * INTO v_role;
  INSERT INTO public.institution_role_permissions(role_id, institution_id, permission)
  SELECT v_role.id, v_institution_id, permission FROM unnest(v_permissions) AS permission;
  v_result := jsonb_build_object('roleRef', v_role.role_ref, 'replayed', false);
  INSERT INTO public.pilot_institution_requests(user_id, operation, request_id, payload_hash, result)
  VALUES (p_user_id, 'create_institution_role', p_request_id, v_hash, v_result);
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.update_my_institution_role(
  p_user_id uuid,
  p_role_ref text,
  p_name text,
  p_description text,
  p_permissions text[],
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_institution_id uuid;
  v_role public.institution_roles%ROWTYPE;
  v_name text := btrim(p_name);
  v_description text := nullif(btrim(p_description), '');
  v_permissions text[] := ARRAY(SELECT DISTINCT value FROM unnest(COALESCE(p_permissions, ARRAY[]::text[])) AS value ORDER BY value);
  v_hash text;
  v_request public.pilot_institution_requests%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_role_ref IS NULL
    OR p_role_ref !~ '^[0-9a-f]{32}$' OR v_name IS NULL
    OR char_length(v_name) NOT BETWEEN 2 AND 50
    OR (v_description IS NOT NULL AND char_length(v_description) NOT BETWEEN 2 AND 200) THEN
    RAISE EXCEPTION 'invalid institution role request' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'institution role actor mismatch' USING ERRCODE = '42501'; END IF;
  SELECT institution_id INTO v_institution_id FROM public.pilot_institution_memberships
  WHERE user_id = p_user_id AND status = 'active' AND role = 'manager';
  IF NOT FOUND OR NOT public.institution_member_has_permission(p_user_id, v_institution_id, 'institution.roles.manage') THEN
    RAISE EXCEPTION 'institution role manager required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_role FROM public.institution_roles
  WHERE institution_id = v_institution_id AND role_ref = p_role_ref AND NOT is_system FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'custom institution role not found' USING ERRCODE = 'P0002'; END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_permissions) AS requested(permission)
    LEFT JOIN public.institution_permission_catalog AS catalog ON catalog.permission = requested.permission AND catalog.delegable
    WHERE catalog.permission IS NULL
  ) THEN RAISE EXCEPTION 'non-delegable institution permission' USING ERRCODE = '42501'; END IF;

  v_hash := public.institution_pilot_payload_hash(jsonb_build_object(
    'roleRef', p_role_ref, 'name', v_name, 'description', v_description, 'permissions', to_jsonb(v_permissions)
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':update-institution-role:' || p_request_id::text, 0));
  SELECT * INTO v_request FROM public.pilot_institution_requests
  WHERE user_id = p_user_id AND operation = 'update_institution_role' AND request_id = p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN RAISE EXCEPTION 'institution role payload mismatch' USING ERRCODE = '22023'; END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;
  UPDATE public.institution_roles SET name = v_name, description = v_description, updated_at = clock_timestamp()
  WHERE id = v_role.id;
  DELETE FROM public.institution_role_permissions WHERE role_id = v_role.id;
  INSERT INTO public.institution_role_permissions(role_id, institution_id, permission)
  SELECT v_role.id, v_institution_id, permission FROM unnest(v_permissions) AS permission;
  v_result := jsonb_build_object('roleRef', p_role_ref, 'replayed', false);
  INSERT INTO public.pilot_institution_requests(user_id, operation, request_id, payload_hash, result)
  VALUES (p_user_id, 'update_institution_role', p_request_id, v_hash, v_result);
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.delete_my_institution_role(
  p_user_id uuid,
  p_role_ref text,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_institution_id uuid;
  v_role public.institution_roles%ROWTYPE;
  v_hash text;
  v_request public.pilot_institution_requests%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_role_ref IS NULL
    OR p_role_ref !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'invalid institution role request' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'institution role actor mismatch' USING ERRCODE = '42501'; END IF;
  SELECT institution_id INTO v_institution_id FROM public.pilot_institution_memberships
  WHERE user_id = p_user_id AND status = 'active' AND role = 'manager';
  IF NOT FOUND OR NOT public.institution_member_has_permission(p_user_id, v_institution_id, 'institution.roles.manage') THEN
    RAISE EXCEPTION 'institution role manager required' USING ERRCODE = '42501';
  END IF;
  v_hash := public.institution_pilot_payload_hash(jsonb_build_object('roleRef', p_role_ref));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':delete-institution-role:' || p_request_id::text, 0));
  SELECT * INTO v_request FROM public.pilot_institution_requests
  WHERE user_id = p_user_id AND operation = 'delete_institution_role' AND request_id = p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN RAISE EXCEPTION 'institution role payload mismatch' USING ERRCODE = '22023'; END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;
  SELECT * INTO v_role FROM public.institution_roles
  WHERE institution_id = v_institution_id AND role_ref = p_role_ref AND NOT is_system FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'custom institution role not found' USING ERRCODE = 'P0002'; END IF;
  DELETE FROM public.institution_roles WHERE id = v_role.id;
  v_result := jsonb_build_object('roleRef', p_role_ref, 'deleted', true, 'replayed', false);
  INSERT INTO public.pilot_institution_requests(user_id, operation, request_id, payload_hash, result)
  VALUES (p_user_id, 'delete_institution_role', p_request_id, v_hash, v_result);
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.set_my_institution_role_assignment(
  p_user_id uuid,
  p_role_ref text,
  p_member_ref text,
  p_assigned boolean,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_institution_id uuid;
  v_role public.institution_roles%ROWTYPE;
  v_membership public.pilot_institution_memberships%ROWTYPE;
  v_hash text;
  v_request public.pilot_institution_requests%ROWTYPE;
  v_operation text := CASE WHEN p_assigned THEN 'assign_institution_role' ELSE 'revoke_institution_role' END;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_assigned IS NULL
    OR p_role_ref IS NULL OR p_member_ref IS NULL
    OR p_role_ref !~ '^[0-9a-f]{32}$' OR p_member_ref !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'invalid institution role assignment' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'institution role actor mismatch' USING ERRCODE = '42501'; END IF;
  SELECT institution_id INTO v_institution_id FROM public.pilot_institution_memberships
  WHERE user_id = p_user_id AND status = 'active' AND role = 'manager';
  IF NOT FOUND OR NOT public.institution_member_has_permission(p_user_id, v_institution_id, 'institution.roles.manage') THEN
    RAISE EXCEPTION 'institution role manager required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_role FROM public.institution_roles
  WHERE institution_id = v_institution_id AND role_ref = p_role_ref AND NOT is_system;
  IF NOT FOUND THEN RAISE EXCEPTION 'custom institution role not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_membership FROM public.pilot_institution_memberships
  WHERE institution_id = v_institution_id AND member_ref = p_member_ref AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'institution member not found' USING ERRCODE = 'P0002'; END IF;

  v_hash := public.institution_pilot_payload_hash(jsonb_build_object(
    'roleRef', p_role_ref, 'memberRef', p_member_ref, 'assigned', p_assigned
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || v_operation || ':' || p_request_id::text, 0));
  SELECT * INTO v_request FROM public.pilot_institution_requests
  WHERE user_id = p_user_id AND operation = v_operation AND request_id = p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN RAISE EXCEPTION 'institution role payload mismatch' USING ERRCODE = '22023'; END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;
  IF p_assigned THEN
    INSERT INTO public.institution_membership_roles(membership_id, role_id, institution_id, assigned_by)
    VALUES (v_membership.id, v_role.id, v_institution_id, p_user_id)
    ON CONFLICT (membership_id, role_id) DO NOTHING;
  ELSE
    DELETE FROM public.institution_membership_roles
    WHERE membership_id = v_membership.id AND role_id = v_role.id;
  END IF;
  v_result := jsonb_build_object(
    'roleRef', p_role_ref, 'memberRef', p_member_ref, 'assigned', p_assigned, 'replayed', false
  );
  INSERT INTO public.pilot_institution_requests(user_id, operation, request_id, payload_hash, result)
  VALUES (p_user_id, v_operation, p_request_id, v_hash, v_result);
  RETURN v_result;
END;
$fn$;

-- Managers and staff with the delegable view-all permission see all tenant
-- classrooms. Other teachers retain the existing own-classroom boundary.
CREATE OR REPLACE FUNCTION public.get_institution_tracking_directory(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_institution_id uuid;
  v_membership_role text;
  v_institution_name text;
  v_institution_status text;
  v_can_view_all boolean;
  v_classrooms jsonb;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'institution tracking actor required' USING ERRCODE = '22023'; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'institution tracking actor mismatch' USING ERRCODE = '42501'; END IF;
  SELECT membership.institution_id, membership.role, institution.name, institution.status
  INTO v_institution_id, v_membership_role, v_institution_name, v_institution_status
  FROM public.pilot_institution_memberships AS membership
  JOIN public.pilot_institutions AS institution ON institution.id = membership.institution_id AND institution.status IN ('pilot', 'active')
  JOIN public.profiles AS profile ON profile.id = membership.user_id AND profile.deleted_at IS NULL
  WHERE membership.user_id = p_user_id AND membership.status = 'active' AND membership.role IN ('manager', 'teacher');
  IF NOT FOUND THEN RAISE EXCEPTION 'active institution membership required' USING ERRCODE = '42501'; END IF;
  v_can_view_all := public.institution_member_has_permission(p_user_id, v_institution_id, 'institution.classrooms.view_all');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', classroom.id,
    'name', classroom.name,
    'teacherAlias', public.teacher_classroom_safe_alias(classroom.teacher_id),
    'canAnalyze', (v_membership_role = 'manager' OR classroom.teacher_id = p_user_id),
    'activeStudentCount', (
      SELECT count(*) FROM public.teacher_classroom_memberships AS student_membership
      JOIN public.profiles AS student_profile ON student_profile.id = student_membership.student_id AND student_profile.deleted_at IS NULL
      WHERE student_membership.classroom_id = classroom.id AND student_membership.status = 'active'
        AND NOT public.teacher_classroom_is_blocked(classroom.teacher_id, student_membership.student_id)
    ),
    'students', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'memberRef', student_membership.member_ref,
        'alias', public.teacher_classroom_safe_alias(student_membership.student_id),
        'joinedAt', student_membership.accepted_at
      ) ORDER BY student_membership.accepted_at, student_membership.member_ref)
      FROM public.teacher_classroom_memberships AS student_membership
      JOIN public.profiles AS student_profile ON student_profile.id = student_membership.student_id AND student_profile.deleted_at IS NULL
      WHERE student_membership.classroom_id = classroom.id AND student_membership.status = 'active'
        AND NOT public.teacher_classroom_is_blocked(classroom.teacher_id, student_membership.student_id)
    ), '[]'::jsonb)
  ) ORDER BY classroom.created_at, classroom.id), '[]'::jsonb)
  INTO v_classrooms
  FROM public.teacher_classrooms AS classroom
  WHERE classroom.institution_id = v_institution_id AND classroom.status = 'active'
    AND (v_can_view_all OR classroom.teacher_id = p_user_id);
  RETURN jsonb_build_object(
    'institution', jsonb_build_object('name', v_institution_name, 'status', v_institution_status),
    'membership', jsonb_build_object('role', v_membership_role),
    'classrooms', v_classrooms
  );
END;
$fn$;

REVOKE ALL ON FUNCTION
  public.institution_seed_system_roles_for_membership(),
  public.institution_member_has_permission(uuid, uuid, text),
  public.get_my_institution_role_directory(uuid),
  public.create_my_institution_role(uuid, text, text, text[], uuid),
  public.update_my_institution_role(uuid, text, text, text, text[], uuid),
  public.delete_my_institution_role(uuid, text, uuid),
  public.set_my_institution_role_assignment(uuid, text, text, boolean, uuid),
  public.get_institution_tracking_directory(uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.institution_member_has_permission(uuid, uuid, text),
  public.get_my_institution_role_directory(uuid),
  public.create_my_institution_role(uuid, text, text, text[], uuid),
  public.update_my_institution_role(uuid, text, text, text, text[], uuid),
  public.delete_my_institution_role(uuid, text, uuid),
  public.set_my_institution_role_assignment(uuid, text, text, boolean, uuid),
  public.get_institution_tracking_directory(uuid)
TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
