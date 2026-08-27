-- Migration 170: RBAC mutations are route-only, atomic, idempotent and audited.
--
-- Before this migration the admin routes used service-role table DML directly.
-- Role permission replacement was a DELETE followed by an INSERT, while the
-- admin log was a third independent statement. A failure between statements
-- could leave a role without permissions or mutate authorization without an
-- audit event. This migration makes the database transaction the boundary.

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_rbac_mutation_requests (
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  operation text NOT NULL CHECK (operation IN (
    'create_role', 'update_role', 'delete_role', 'assign_role', 'revoke_role'
  )),
  request_id uuid NOT NULL,
  payload_hash text NOT NULL CHECK (char_length(payload_hash) = 64),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (actor_id, operation, request_id)
);

ALTER TABLE public.admin_rbac_mutation_requests ENABLE ROW LEVEL SECURITY;

-- The replay ledger is an implementation detail. Even service_role reaches it
-- only through the SECURITY DEFINER mutation functions below.
REVOKE ALL ON TABLE public.admin_rbac_mutation_requests
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_rbac_payload_hash(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $fn$
  SELECT encode(extensions.digest(COALESCE(p_payload, 'null'::jsonb)::text, 'sha256'), 'hex');
$fn$;

CREATE OR REPLACE FUNCTION public.admin_rbac_lock_request(
  p_actor_id uuid,
  p_operation text,
  p_request_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF p_actor_id IS NULL OR p_request_id IS NULL
     OR p_operation NOT IN (
       'create_role', 'update_role', 'delete_role', 'assign_role', 'revoke_role'
     ) THEN
    RAISE EXCEPTION 'invalid RBAC request identity' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'admin-rbac:' || p_actor_id::text || ':' || p_operation || ':' || p_request_id::text,
    170
  ));
END
$fn$;

CREATE OR REPLACE FUNCTION public.admin_rbac_require_service_actor(p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  -- Client JWTs cannot call these functions. The trusted route supplies the
  -- actor after its cookie/AAL2 and rate-limit checks.
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'service route required' USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'role management actor required' USING ERRCODE = '42501';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.admin_rbac_require_actor_permission(p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF NOT public.has_permission(p_actor_id, 'admin.roles.manage') THEN
    RAISE EXCEPTION 'role management permission required' USING ERRCODE = '42501';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.admin_rbac_permissions_valid(p_permissions jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $fn$
  SELECT COALESCE(
    jsonb_typeof(p_permissions) = 'array'
    AND jsonb_array_length(p_permissions) <= 100
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_permissions) AS item(value)
      WHERE jsonb_typeof(item.value) <> 'string'
        OR char_length(item.value #>> '{}') NOT BETWEEN 1 AND 100
        OR (item.value #>> '{}') !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$'
    )
    AND (
      SELECT count(*) = count(DISTINCT item.value #>> '{}')
      FROM jsonb_array_elements(p_permissions) AS item(value)
    ),
    false
  );
$fn$;

CREATE OR REPLACE FUNCTION public.admin_create_role(
  p_actor_id uuid,
  p_request_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_hash text;
  v_prior public.admin_rbac_mutation_requests%ROWTYPE;
  v_role public.roles%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM public.admin_rbac_require_service_actor(p_actor_id);

  IF jsonb_typeof(p_payload) <> 'object'
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_payload) AS key
       WHERE key NOT IN ('name', 'slug', 'description', 'permissions')
     )
     OR jsonb_typeof(p_payload -> 'name') <> 'string'
     OR char_length(btrim(p_payload ->> 'name')) NOT BETWEEN 1 AND 100
     OR jsonb_typeof(p_payload -> 'slug') <> 'string'
     OR (p_payload ->> 'slug') !~ '^[a-z0-9_]{1,80}$'
     OR NOT (p_payload ? 'description')
     OR jsonb_typeof(p_payload -> 'description') NOT IN ('string', 'null')
     OR char_length(COALESCE(p_payload ->> 'description', '')) > 500
     OR NOT (p_payload ? 'permissions')
     OR NOT public.admin_rbac_permissions_valid(p_payload -> 'permissions') THEN
    RAISE EXCEPTION 'invalid create role payload' USING ERRCODE = '22023';
  END IF;

  PERFORM public.admin_rbac_lock_request(p_actor_id, 'create_role', p_request_id);
  v_hash := public.admin_rbac_payload_hash(p_payload);

  SELECT * INTO v_prior
  FROM public.admin_rbac_mutation_requests request
  WHERE request.actor_id = p_actor_id
    AND request.operation = 'create_role'
    AND request.request_id = p_request_id;
  IF FOUND THEN
    IF v_prior.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'RBAC request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_prior.result || jsonb_build_object('replayed', true);
  END IF;

  PERFORM public.admin_rbac_require_actor_permission(p_actor_id);

  INSERT INTO public.roles(slug, name, description, is_system)
  VALUES (
    p_payload ->> 'slug',
    btrim(p_payload ->> 'name'),
    CASE WHEN jsonb_typeof(p_payload -> 'description') = 'null'
      THEN NULL ELSE btrim(p_payload ->> 'description') END,
    false
  )
  RETURNING * INTO v_role;

  INSERT INTO public.role_permissions(role_id, permission)
  SELECT v_role.id, item.value
  FROM jsonb_array_elements_text(p_payload -> 'permissions') AS item(value);

  INSERT INTO public.admin_logs(admin_id, action, target_type, target_id, details)
  VALUES (
    p_actor_id, 'create_role', 'role', v_role.id::text,
    jsonb_build_object(
      'request_id', p_request_id,
      'name', v_role.name,
      'slug', v_role.slug,
      'permissions', p_payload -> 'permissions'
    )
  );

  v_result := jsonb_build_object(
    'role', jsonb_build_object(
      'id', v_role.id,
      'name', v_role.name,
      'slug', v_role.slug,
      'description', v_role.description,
      'is_system', v_role.is_system,
      'created_at', v_role.created_at
    ),
    'replayed', false
  );
  INSERT INTO public.admin_rbac_mutation_requests(
    actor_id, operation, request_id, payload_hash, result
  ) VALUES (p_actor_id, 'create_role', p_request_id, v_hash, v_result);
  RETURN v_result;
END
$fn$;

CREATE OR REPLACE FUNCTION public.admin_update_role(
  p_actor_id uuid,
  p_role_id uuid,
  p_request_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_hash text;
  v_prior public.admin_rbac_mutation_requests%ROWTYPE;
  v_role public.roles%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM public.admin_rbac_require_service_actor(p_actor_id);

  IF p_role_id IS NULL
     OR jsonb_typeof(p_payload) <> 'object'
     OR p_payload = '{}'::jsonb
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_payload) AS key
       WHERE key NOT IN ('name', 'description', 'permissions')
     )
     OR (
       p_payload ? 'name'
       AND (jsonb_typeof(p_payload -> 'name') <> 'string'
         OR char_length(btrim(p_payload ->> 'name')) NOT BETWEEN 1 AND 100)
     )
     OR (
       p_payload ? 'description'
       AND (jsonb_typeof(p_payload -> 'description') NOT IN ('string', 'null')
         OR char_length(COALESCE(p_payload ->> 'description', '')) > 500)
     )
     OR (
       p_payload ? 'permissions'
       AND NOT public.admin_rbac_permissions_valid(p_payload -> 'permissions')
     ) THEN
    RAISE EXCEPTION 'invalid update role payload' USING ERRCODE = '22023';
  END IF;

  PERFORM public.admin_rbac_lock_request(p_actor_id, 'update_role', p_request_id);
  v_hash := public.admin_rbac_payload_hash(jsonb_build_object(
    'roleId', p_role_id, 'payload', p_payload
  ));

  SELECT * INTO v_prior
  FROM public.admin_rbac_mutation_requests request
  WHERE request.actor_id = p_actor_id
    AND request.operation = 'update_role'
    AND request.request_id = p_request_id;
  IF FOUND THEN
    IF v_prior.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'RBAC request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_prior.result || jsonb_build_object('replayed', true);
  END IF;

  PERFORM public.admin_rbac_require_actor_permission(p_actor_id);

  SELECT * INTO v_role FROM public.roles WHERE id = p_role_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'role not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.roles role
  SET name = CASE WHEN p_payload ? 'name'
        THEN btrim(p_payload ->> 'name') ELSE role.name END,
      description = CASE WHEN p_payload ? 'description'
        THEN CASE WHEN jsonb_typeof(p_payload -> 'description') = 'null'
          THEN NULL ELSE btrim(p_payload ->> 'description') END
        ELSE role.description END
  WHERE role.id = p_role_id
  RETURNING * INTO v_role;

  IF p_payload ? 'permissions' THEN
    -- Permission replacement on different roles must still serialize around
    -- the global recovery invariant; per-role row locks are not sufficient.
    PERFORM pg_advisory_xact_lock(hashtextextended('admin-rbac-manager-recovery', 170));
    DELETE FROM public.role_permissions WHERE role_id = p_role_id;
    INSERT INTO public.role_permissions(role_id, permission)
    SELECT p_role_id, item.value
    FROM jsonb_array_elements_text(p_payload -> 'permissions') AS item(value);

    -- Never commit a permission replacement that removes every recovery path.
    IF NOT EXISTS (
      SELECT 1
      FROM public.user_roles assignment
      JOIN public.role_permissions permission ON permission.role_id = assignment.role_id
      WHERE permission.permission = 'admin.roles.manage'
    ) THEN
      RAISE EXCEPTION 'at least one role manager must remain' USING ERRCODE = '23514';
    END IF;
  END IF;

  INSERT INTO public.admin_logs(admin_id, action, target_type, target_id, details)
  VALUES (
    p_actor_id, 'update_role', 'role', p_role_id::text,
    jsonb_build_object(
      'request_id', p_request_id,
      'name', CASE WHEN p_payload ? 'name' THEN to_jsonb(v_role.name) ELSE 'null'::jsonb END,
      'description_changed', p_payload ? 'description',
      'permissions', CASE WHEN p_payload ? 'permissions'
        THEN p_payload -> 'permissions' ELSE 'null'::jsonb END
    )
  );

  v_result := jsonb_build_object('success', true, 'roleId', p_role_id, 'replayed', false);
  INSERT INTO public.admin_rbac_mutation_requests(
    actor_id, operation, request_id, payload_hash, result
  ) VALUES (p_actor_id, 'update_role', p_request_id, v_hash, v_result);
  RETURN v_result;
END
$fn$;

CREATE OR REPLACE FUNCTION public.admin_delete_role(
  p_actor_id uuid,
  p_role_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_hash text;
  v_prior public.admin_rbac_mutation_requests%ROWTYPE;
  v_role public.roles%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM public.admin_rbac_require_service_actor(p_actor_id);
  IF p_role_id IS NULL THEN
    RAISE EXCEPTION 'invalid delete role payload' USING ERRCODE = '22023';
  END IF;
  PERFORM public.admin_rbac_lock_request(p_actor_id, 'delete_role', p_request_id);
  v_hash := public.admin_rbac_payload_hash(jsonb_build_object('roleId', p_role_id));

  SELECT * INTO v_prior
  FROM public.admin_rbac_mutation_requests request
  WHERE request.actor_id = p_actor_id
    AND request.operation = 'delete_role'
    AND request.request_id = p_request_id;
  IF FOUND THEN
    IF v_prior.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'RBAC request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_prior.result || jsonb_build_object('replayed', true);
  END IF;

  PERFORM public.admin_rbac_require_actor_permission(p_actor_id);

  SELECT * INTO v_role FROM public.roles WHERE id = p_role_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'role not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_role.is_system THEN
    RAISE EXCEPTION 'system roles cannot be deleted' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role_id = p_role_id) THEN
    RAISE EXCEPTION 'assigned role cannot be deleted' USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.roles WHERE id = p_role_id;
  INSERT INTO public.admin_logs(admin_id, action, target_type, target_id, details)
  VALUES (
    p_actor_id, 'delete_role', 'role', p_role_id::text,
    jsonb_build_object(
      'request_id', p_request_id, 'slug', v_role.slug, 'name', v_role.name
    )
  );
  v_result := jsonb_build_object('success', true, 'roleId', p_role_id, 'replayed', false);
  INSERT INTO public.admin_rbac_mutation_requests(
    actor_id, operation, request_id, payload_hash, result
  ) VALUES (p_actor_id, 'delete_role', p_request_id, v_hash, v_result);
  RETURN v_result;
END
$fn$;

CREATE OR REPLACE FUNCTION public.admin_assign_role(
  p_actor_id uuid,
  p_user_id uuid,
  p_role_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_hash text;
  v_prior public.admin_rbac_mutation_requests%ROWTYPE;
  v_role public.roles%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM public.admin_rbac_require_service_actor(p_actor_id);
  IF p_user_id IS NULL OR p_role_id IS NULL THEN
    RAISE EXCEPTION 'invalid assign role payload' USING ERRCODE = '22023';
  END IF;
  PERFORM public.admin_rbac_lock_request(p_actor_id, 'assign_role', p_request_id);
  v_hash := public.admin_rbac_payload_hash(jsonb_build_object(
    'userId', p_user_id, 'roleId', p_role_id
  ));

  SELECT * INTO v_prior
  FROM public.admin_rbac_mutation_requests request
  WHERE request.actor_id = p_actor_id
    AND request.operation = 'assign_role'
    AND request.request_id = p_request_id;
  IF FOUND THEN
    IF v_prior.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'RBAC request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_prior.result || jsonb_build_object('replayed', true);
  END IF;

  PERFORM public.admin_rbac_require_actor_permission(p_actor_id);

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_role FROM public.roles WHERE id = p_role_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'role not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.user_roles(user_id, role_id, assigned_by)
  VALUES (p_user_id, p_role_id, p_actor_id);
  INSERT INTO public.admin_logs(admin_id, action, target_type, target_id, details)
  VALUES (
    p_actor_id, 'assign_role', 'user', p_user_id::text,
    jsonb_build_object(
      'request_id', p_request_id,
      'role_id', p_role_id,
      'role_slug', v_role.slug,
      'role_name', v_role.name
    )
  );
  v_result := jsonb_build_object(
    'success', true, 'userId', p_user_id, 'roleId', p_role_id, 'replayed', false
  );
  INSERT INTO public.admin_rbac_mutation_requests(
    actor_id, operation, request_id, payload_hash, result
  ) VALUES (p_actor_id, 'assign_role', p_request_id, v_hash, v_result);
  RETURN v_result;
END
$fn$;

CREATE OR REPLACE FUNCTION public.admin_revoke_role(
  p_actor_id uuid,
  p_user_id uuid,
  p_role_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_hash text;
  v_prior public.admin_rbac_mutation_requests%ROWTYPE;
  v_role public.roles%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM public.admin_rbac_require_service_actor(p_actor_id);
  IF p_user_id IS NULL OR p_role_id IS NULL THEN
    RAISE EXCEPTION 'invalid revoke role payload' USING ERRCODE = '22023';
  END IF;
  PERFORM public.admin_rbac_lock_request(p_actor_id, 'revoke_role', p_request_id);
  v_hash := public.admin_rbac_payload_hash(jsonb_build_object(
    'userId', p_user_id, 'roleId', p_role_id
  ));

  SELECT * INTO v_prior
  FROM public.admin_rbac_mutation_requests request
  WHERE request.actor_id = p_actor_id
    AND request.operation = 'revoke_role'
    AND request.request_id = p_request_id;
  IF FOUND THEN
    IF v_prior.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'RBAC request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_prior.result || jsonb_build_object('replayed', true);
  END IF;

  PERFORM public.admin_rbac_require_actor_permission(p_actor_id);

  SELECT * INTO v_role FROM public.roles WHERE id = p_role_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'role not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_user_id = p_actor_id AND v_role.slug = 'super_admin' THEN
    RAISE EXCEPTION 'own super admin role cannot be revoked' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.user_roles
  WHERE user_id = p_user_id AND role_id = p_role_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'role assignment not found' USING ERRCODE = 'P0002';
  END IF;

  -- Concurrent revocations on two different manager assignments could each
  -- otherwise observe the other uncommitted assignment and both commit.
  PERFORM pg_advisory_xact_lock(hashtextextended('admin-rbac-manager-recovery', 170));
  DELETE FROM public.user_roles WHERE user_id = p_user_id AND role_id = p_role_id;

  -- A custom role can also be the actor's only recovery path. Protect the
  -- invariant generically instead of relying only on the super_admin slug.
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles assignment
    JOIN public.role_permissions permission ON permission.role_id = assignment.role_id
    WHERE permission.permission = 'admin.roles.manage'
  ) THEN
    RAISE EXCEPTION 'at least one role manager must remain' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.admin_logs(admin_id, action, target_type, target_id, details)
  VALUES (
    p_actor_id, 'remove_role', 'user', p_user_id::text,
    jsonb_build_object(
      'request_id', p_request_id,
      'role_id', p_role_id,
      'role_slug', v_role.slug,
      'role_name', v_role.name
    )
  );
  v_result := jsonb_build_object(
    'success', true, 'userId', p_user_id, 'roleId', p_role_id, 'replayed', false
  );
  INSERT INTO public.admin_rbac_mutation_requests(
    actor_id, operation, request_id, payload_hash, result
  ) VALUES (p_actor_id, 'revoke_role', p_request_id, v_hash, v_result);
  RETURN v_result;
END
$fn$;

-- No REST/JWT role is a direct writer anymore. SECURITY DEFINER functions keep
-- working as the owning database role and are the only mutation entry points.
REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.roles, public.role_permissions, public.user_roles
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.admin_rbac_payload_hash(jsonb),
  public.admin_rbac_permissions_valid(jsonb),
  public.admin_rbac_lock_request(uuid,text,uuid),
  public.admin_rbac_require_service_actor(uuid),
  public.admin_rbac_require_actor_permission(uuid),
  public.admin_create_role(uuid,uuid,jsonb),
  public.admin_update_role(uuid,uuid,uuid,jsonb),
  public.admin_delete_role(uuid,uuid,uuid),
  public.admin_assign_role(uuid,uuid,uuid,uuid),
  public.admin_revoke_role(uuid,uuid,uuid,uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.admin_create_role(uuid,uuid,jsonb),
  public.admin_update_role(uuid,uuid,uuid,jsonb),
  public.admin_delete_role(uuid,uuid,uuid),
  public.admin_assign_role(uuid,uuid,uuid,uuid),
  public.admin_revoke_role(uuid,uuid,uuid,uuid)
TO service_role;

DO $verify$
BEGIN
  IF has_table_privilege('authenticated', 'public.roles', 'INSERT')
     OR has_table_privilege('authenticated', 'public.role_permissions', 'DELETE')
     OR has_table_privilege('authenticated', 'public.user_roles', 'INSERT')
     OR has_table_privilege('service_role', 'public.roles', 'UPDATE')
     OR has_table_privilege('service_role', 'public.role_permissions', 'INSERT')
     OR has_table_privilege('service_role', 'public.user_roles', 'DELETE') THEN
    RAISE EXCEPTION '170 verification: direct RBAC table mutation remains open';
  END IF;
  IF has_table_privilege('service_role', 'public.admin_rbac_mutation_requests', 'SELECT')
     OR has_table_privilege('authenticated', 'public.admin_rbac_mutation_requests', 'SELECT') THEN
    RAISE EXCEPTION '170 verification: replay ledger is readable';
  END IF;
  IF NOT has_function_privilege(
       'service_role', 'public.admin_create_role(uuid,uuid,jsonb)', 'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role', 'public.admin_update_role(uuid,uuid,uuid,jsonb)', 'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role', 'public.admin_assign_role(uuid,uuid,uuid,uuid)', 'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated', 'public.admin_assign_role(uuid,uuid,uuid,uuid)', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION '170 verification: RBAC RPC grants are invalid';
  END IF;
END
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';
