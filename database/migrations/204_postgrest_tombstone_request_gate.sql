-- Migration 204: reject tombstoned accounts at the Data API boundary.
--
-- The Next proxy protects Bilge Arena routes, but a valid Supabase JWT can be
-- sent directly to PostgREST.  This request-level gate closes that bypass for
-- every Data API table/view/RPC without weakening service-role maintenance.
-- Supabase documents pgrst.db_pre_request as Data-API-only; Realtime, Storage,
-- Auth-principal erasure and processor retention remain separate controls.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_active_profile_data_api_request()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_claims jsonb := '{}'::jsonb;
  v_claim_role text;
  v_subject text;
  v_user_id uuid;
  v_deleted_at timestamptz;
BEGIN
  -- PostgREST exposes the verified JWT through request.jwt.claims. Keep the
  -- legacy request.jwt fallback only when the canonical setting is absent;
  -- never let an empty legacy object shadow authenticated canonical claims.
  BEGIN
    v_claims := COALESCE(
      NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
      NULLIF(pg_catalog.current_setting('request.jwt', true), '')::jsonb,
      '{}'::jsonb
    );
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE SQLSTATE 'PGRST' USING
      MESSAGE = pg_catalog.jsonb_build_object(
        'code', 'account_claims_invalid',
        'message', 'Authentication claims are invalid',
        'details', NULL,
        'hint', NULL
      )::text,
      DETAIL = pg_catalog.jsonb_build_object('status', 401)::text;
  END;

  v_claim_role := v_claims ->> 'role';
  IF v_claim_role IS DISTINCT FROM 'authenticated' THEN
    RETURN;
  END IF;

  v_subject := v_claims ->> 'sub';
  IF v_subject IS NULL
     OR v_subject !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE SQLSTATE 'PGRST' USING
      MESSAGE = pg_catalog.jsonb_build_object(
        'code', 'account_subject_invalid',
        'message', 'Authentication subject is invalid',
        'details', NULL,
        'hint', NULL
      )::text,
      DETAIL = pg_catalog.jsonb_build_object('status', 401)::text;
  END IF;
  v_user_id := v_subject::uuid;

  SELECT profile_row.deleted_at
    INTO v_deleted_at
    FROM public.profiles AS profile_row
   WHERE profile_row.id = v_user_id;

  IF NOT FOUND THEN
    RAISE SQLSTATE 'PGRST' USING
      MESSAGE = pg_catalog.jsonb_build_object(
        'code', 'account_profile_unavailable',
        'message', 'Account profile is unavailable',
        'details', NULL,
        'hint', NULL
      )::text,
      DETAIL = pg_catalog.jsonb_build_object('status', 403)::text;
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE SQLSTATE 'PGRST' USING
      MESSAGE = pg_catalog.jsonb_build_object(
        'code', 'account_deleted',
        'message', 'Account is no longer active',
        'details', NULL,
        'hint', NULL
      )::text,
      DETAIL = pg_catalog.jsonb_build_object(
        'status', 410,
        'headers', pg_catalog.jsonb_build_object('Cache-Control', 'private, no-store')
      )::text;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.enforce_active_profile_data_api_request() IS
  'PostgREST pre-request gate: authenticated JWTs require an existing non-tombstoned profile. This does not cover Realtime, Storage or Auth endpoints.';

REVOKE ALL ON FUNCTION public.enforce_active_profile_data_api_request()
  FROM PUBLIC, anon, authenticated, service_role, authenticator;
GRANT EXECUTE ON FUNCTION public.enforce_active_profile_data_api_request()
  TO anon, authenticated, service_role, authenticator;

DO $preflight$
DECLARE
  v_existing text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticator') THEN
    RAISE EXCEPTION 'authenticator role is required for the Data API tombstone gate'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.btrim(pg_catalog.split_part(role_config, '=', 2), '"')
    INTO v_existing
    FROM pg_catalog.pg_roles AS role_row,
         LATERAL pg_catalog.unnest(COALESCE(role_row.rolconfig, ARRAY[]::text[])) AS role_config
   WHERE role_row.rolname = 'authenticator'
     AND role_config LIKE 'pgrst.db_pre_request=%'
   LIMIT 1;

  IF v_existing IS NOT NULL
     AND v_existing <> ''
     AND v_existing <> 'public.enforce_active_profile_data_api_request' THEN
    RAISE EXCEPTION 'existing pgrst.db_pre_request must be reviewed before installing the tombstone gate: %', v_existing
      USING ERRCODE = '55000';
  END IF;
END;
$preflight$;

ALTER ROLE authenticator
  SET pgrst.db_pre_request = 'public.enforce_active_profile_data_api_request';

DO $postcheck$
DECLARE
  v_config text;
  v_function_config text[];
BEGIN
  SELECT pg_catalog.btrim(pg_catalog.split_part(role_config, '=', 2), '"')
    INTO v_config
    FROM pg_catalog.pg_roles AS role_row,
         LATERAL pg_catalog.unnest(COALESCE(role_row.rolconfig, ARRAY[]::text[])) AS role_config
   WHERE role_row.rolname = 'authenticator'
     AND role_config LIKE 'pgrst.db_pre_request=%'
   LIMIT 1;

  SELECT procedure_row.proconfig
    INTO v_function_config
    FROM pg_catalog.pg_proc AS procedure_row
   WHERE procedure_row.oid = 'public.enforce_active_profile_data_api_request()'::pg_catalog.regprocedure;

  IF v_config IS DISTINCT FROM 'public.enforce_active_profile_data_api_request'
     OR NOT ('search_path=pg_catalog' = ANY(COALESCE(v_function_config, ARRAY[]::text[])))
     OR NOT pg_catalog.has_function_privilege(
       'authenticated',
       'public.enforce_active_profile_data_api_request()',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Data API tombstone request gate postcheck failed';
  END IF;
END;
$postcheck$;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

COMMIT;
