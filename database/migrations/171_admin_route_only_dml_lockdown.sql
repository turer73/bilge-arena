-- Migration 171: platform admin tablolarinda dogrudan PostgREST DML'ini kapat.
--
-- 161/162, admin yazmasini AAL2 + RBAC ile sinirlamisti; bu yine de bir AAL2
-- JWT'sinin route rate-limit ve audit kodunu atlayarak tabloya yazabilmesi
-- anlamina geliyordu. 169/170 homepage ve platform RBAC mutasyonlarini atomik
-- service-role RPC'lerine tasidi. Bu migration kalan ACL/policy artigini da
-- temizler ve admin_logs'u append-only yapar.

BEGIN;

-- Tarihsel isimlerin hepsini acikca kaldir. Eski bir policy geri yuklense bile
-- ACL kapisi tek basina browser DML'ini engeller; yeni policy'ler de asagidaki
-- self-check tarafindan yakalanir.
DROP POLICY IF EXISTS "roles_manage" ON public.roles;
DROP POLICY IF EXISTS "roles_manage_insert" ON public.roles;
DROP POLICY IF EXISTS "roles_manage_update" ON public.roles;
DROP POLICY IF EXISTS "roles_manage_delete" ON public.roles;
DROP POLICY IF EXISTS "role_permissions_manage" ON public.role_permissions;
DROP POLICY IF EXISTS "role_permissions_manage_insert" ON public.role_permissions;
DROP POLICY IF EXISTS "role_permissions_manage_update" ON public.role_permissions;
DROP POLICY IF EXISTS "role_permissions_manage_delete" ON public.role_permissions;
DROP POLICY IF EXISTS "user_roles_manage" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_manage_insert" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_manage_update" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_manage_delete" ON public.user_roles;
DROP POLICY IF EXISTS "homepage_sections_admin_manage" ON public.homepage_sections;
DROP POLICY IF EXISTS "homepage_sections_admin_insert" ON public.homepage_sections;
DROP POLICY IF EXISTS "homepage_sections_admin_update" ON public.homepage_sections;
DROP POLICY IF EXISTS "homepage_sections_admin_delete" ON public.homepage_sections;
DROP POLICY IF EXISTS "homepage_elements_admin_manage" ON public.homepage_elements;
DROP POLICY IF EXISTS "homepage_elements_admin_insert" ON public.homepage_elements;
DROP POLICY IF EXISTS "homepage_elements_admin_update" ON public.homepage_elements;
DROP POLICY IF EXISTS "homepage_elements_admin_delete" ON public.homepage_elements;
DROP POLICY IF EXISTS "site_settings_update" ON public.site_settings;
DROP POLICY IF EXISTS "site_settings_insert" ON public.site_settings;
DROP POLICY IF EXISTS "site_settings_update_rbac" ON public.site_settings;
DROP POLICY IF EXISTS "site_settings_insert_rbac" ON public.site_settings;
DROP POLICY IF EXISTS "error_reports_update_admin" ON public.error_reports;
DROP POLICY IF EXISTS "error_reports_update_admin_rbac" ON public.error_reports;
DROP POLICY IF EXISTS "admin_logs_insert" ON public.admin_logs;
DROP POLICY IF EXISTS "admin_logs_insert_rbac" ON public.admin_logs;

-- DML yetkisi olan bir policy'nin yanlislikla gelecekte eklenmesini migration
-- sonrasi self-check yakalar; burada tarihsel policy adlari deterministik olarak
-- drop edildi. SELECT policy'leri bilerek korunur.

-- Browser rollerinin tablo ve olasi sutun bazli miras grantlerini kapat.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.roles,
  public.role_permissions,
  public.user_roles,
  public.homepage_sections,
  public.homepage_elements,
  public.site_settings,
  public.admin_logs,
  public.error_reports
FROM PUBLIC, anon, authenticated, service_role;

DO $revoke_columns$
DECLARE
  v_column record;
BEGIN
  FOR v_column IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (
        'roles', 'role_permissions', 'user_roles', 'homepage_sections',
        'homepage_elements', 'site_settings', 'admin_logs', 'error_reports'
      )
  LOOP
    EXECUTE format(
      'REVOKE INSERT (%I), UPDATE (%I) ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role',
      v_column.column_name, v_column.column_name, v_column.table_name
    );
  END LOOP;
END
$revoke_columns$;

-- Mesru server yollarinin minimum ACL'leri. RBAC/homepage writer RPC'leri
-- service_role tablo DML'i kullanmadan owner olarak calisir; burada yeniden
-- grant edilmez. error_reports ise rollback/legacy rapor akisi icin auth INSERT
-- korur. RLS yine auth.uid() = user_id kosulunu uygular.
GRANT SELECT, INSERT, UPDATE ON TABLE public.site_settings TO service_role;
GRANT SELECT, UPDATE ON TABLE public.error_reports TO service_role;
GRANT INSERT (user_id, question_id, report_type, description)
  ON TABLE public.error_reports TO authenticated;
GRANT SELECT, INSERT ON TABLE public.admin_logs TO service_role;

-- admin_logs denetimi geriye donuk olarak degistirilemez ve DELETE edilemez.
CREATE OR REPLACE FUNCTION public.prevent_admin_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  RAISE EXCEPTION 'admin_logs is append-only' USING ERRCODE = '55000';
END
$fn$;

REVOKE ALL ON FUNCTION public.prevent_admin_log_mutation() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_admin_logs_append_only ON public.admin_logs;
CREATE TRIGGER trg_admin_logs_append_only
  BEFORE UPDATE OR DELETE ON public.admin_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_admin_log_mutation();

-- 161/162 yardimcisi artik policy tarafindan kullanilmiyorsa tamamen kaldirilir.
-- pg_depend kontrolu, bilinmeyen bir view/function policy bagimliligi varsa
-- migration'i kirmaz; bu durumda helper korunur fakat execute kapisi kapanir.
DO $helper$
DECLARE
  v_oid oid := to_regprocedure('public.has_admin_write_access(text)');
  v_policy_refs integer := 0;
  v_dependents integer := 0;
BEGIN
  IF v_oid IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_policy_refs
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (coalesce(qual, '') || coalesce(with_check, '')) ILIKE '%has_admin_write_access%';

  SELECT count(*) INTO v_dependents
  FROM pg_depend
  WHERE refobjid = v_oid
    AND deptype NOT IN ('i', 'a');

  EXECUTE 'REVOKE ALL ON FUNCTION public.has_admin_write_access(text) FROM PUBLIC, anon, authenticated, service_role';
  IF v_policy_refs = 0 AND v_dependents = 0 THEN
    EXECUTE 'DROP FUNCTION public.has_admin_write_access(text)';
  ELSE
    RAISE NOTICE '171: has_admin_write_access korunuyor; policy_refs=%, dependents=%', v_policy_refs, v_dependents;
  END IF;
END
$helper$;

DO $verify$
DECLARE
  v_table text;
  v_role text;
  v_nonselect integer;
  v_unexpected text;
  v_helper oid;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'public.roles', 'public.role_permissions', 'public.user_roles',
    'public.homepage_sections', 'public.homepage_elements'
  ] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF has_table_privilege(v_role, v_table, 'INSERT')
         OR has_table_privilege(v_role, v_table, 'UPDATE')
         OR has_table_privilege(v_role, v_table, 'DELETE')
         OR has_table_privilege(v_role, v_table, 'TRUNCATE')
         OR has_table_privilege(v_role, v_table, 'REFERENCES')
         OR has_table_privilege(v_role, v_table, 'TRIGGER')
         OR has_any_column_privilege(v_role, v_table, 'INSERT')
         OR has_any_column_privilege(v_role, v_table, 'UPDATE') THEN
        RAISE EXCEPTION '171 verification: % direct DML remains for %', v_table, v_role;
      END IF;
    END LOOP;
  END LOOP;

  -- site_settings/admin_logs retain a deliberately narrow service_role path,
  -- but browser roles must still have no table- or column-level DML at all.
  FOREACH v_table IN ARRAY ARRAY['public.site_settings', 'public.admin_logs'] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_table_privilege(v_role, v_table, 'INSERT')
         OR has_table_privilege(v_role, v_table, 'UPDATE')
         OR has_table_privilege(v_role, v_table, 'DELETE')
         OR has_table_privilege(v_role, v_table, 'TRUNCATE')
         OR has_table_privilege(v_role, v_table, 'REFERENCES')
         OR has_table_privilege(v_role, v_table, 'TRIGGER')
         OR has_any_column_privilege(v_role, v_table, 'INSERT')
         OR has_any_column_privilege(v_role, v_table, 'UPDATE') THEN
        RAISE EXCEPTION '171 verification: % browser DML remains for %', v_table, v_role;
      END IF;
    END LOOP;
  END LOOP;

  IF has_table_privilege('anon', 'public.error_reports', 'INSERT')
     OR has_table_privilege('anon', 'public.error_reports', 'UPDATE')
     OR has_table_privilege('anon', 'public.error_reports', 'DELETE')
     OR has_table_privilege('anon', 'public.error_reports', 'TRUNCATE')
     OR has_table_privilege('anon', 'public.error_reports', 'REFERENCES')
     OR has_table_privilege('anon', 'public.error_reports', 'TRIGGER')
     OR has_any_column_privilege('anon', 'public.error_reports', 'INSERT')
     OR has_any_column_privilege('anon', 'public.error_reports', 'UPDATE') THEN
    RAISE EXCEPTION '171 verification: anon error_reports DML remains';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.site_settings', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.site_settings', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.site_settings', 'INSERT')
     OR has_table_privilege('service_role', 'public.site_settings', 'DELETE')
     OR has_table_privilege('service_role', 'public.site_settings', 'TRUNCATE')
     OR has_table_privilege('service_role', 'public.site_settings', 'REFERENCES')
     OR has_table_privilege('service_role', 'public.site_settings', 'TRIGGER')
     OR NOT has_table_privilege('service_role', 'public.error_reports', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.error_reports', 'UPDATE')
     OR has_table_privilege('service_role', 'public.error_reports', 'INSERT')
     OR has_table_privilege('service_role', 'public.error_reports', 'DELETE')
     OR has_table_privilege('service_role', 'public.error_reports', 'TRUNCATE')
     OR has_table_privilege('service_role', 'public.error_reports', 'REFERENCES')
     OR has_table_privilege('service_role', 'public.error_reports', 'TRIGGER')
     OR NOT has_column_privilege('authenticated', 'public.error_reports', 'user_id', 'INSERT')
     OR NOT has_column_privilege('authenticated', 'public.error_reports', 'question_id', 'INSERT')
     OR NOT has_column_privilege('authenticated', 'public.error_reports', 'report_type', 'INSERT')
     OR NOT has_column_privilege('authenticated', 'public.error_reports', 'description', 'INSERT')
     OR has_column_privilege('authenticated', 'public.error_reports', 'status', 'INSERT')
     OR has_column_privilege('authenticated', 'public.error_reports', 'admin_note', 'INSERT')
     OR has_column_privilege('authenticated', 'public.error_reports', 'resolved_by', 'INSERT')
     OR has_table_privilege('authenticated', 'public.error_reports', 'INSERT')
     OR has_table_privilege('authenticated', 'public.error_reports', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.error_reports', 'DELETE')
     OR has_table_privilege('authenticated', 'public.error_reports', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.error_reports', 'REFERENCES')
     OR has_table_privilege('authenticated', 'public.error_reports', 'TRIGGER')
     OR NOT has_table_privilege('service_role', 'public.admin_logs', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.admin_logs', 'INSERT')
     OR has_table_privilege('service_role', 'public.admin_logs', 'UPDATE')
     OR has_table_privilege('service_role', 'public.admin_logs', 'DELETE')
     OR has_table_privilege('service_role', 'public.admin_logs', 'TRUNCATE')
     OR has_table_privilege('service_role', 'public.admin_logs', 'REFERENCES')
     OR has_table_privilege('service_role', 'public.admin_logs', 'TRIGGER')
     OR has_table_privilege('authenticated', 'public.admin_logs', 'INSERT') THEN
    RAISE EXCEPTION '171 verification: server/legacy minimum ACL contract is invalid';
  END IF;

  SELECT count(*) INTO v_nonselect
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'roles', 'role_permissions', 'user_roles', 'homepage_sections',
      'homepage_elements', 'site_settings', 'admin_logs'
    )
    AND cmd <> 'SELECT';
  IF v_nonselect <> 0 THEN
    RAISE EXCEPTION '171 verification: % non-SELECT policies remain on route-only tables', v_nonselect;
  END IF;

  SELECT count(*) INTO v_nonselect
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'error_reports'
    AND cmd <> 'SELECT';
  IF v_nonselect <> 1 THEN
    RAISE EXCEPTION '171 verification: error_reports must retain exactly one INSERT policy, found %', v_nonselect;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.admin_logs'::regclass
      AND tgname = 'trg_admin_logs_append_only'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION '171 verification: admin_logs append-only trigger missing';
  END IF;

  v_helper := to_regprocedure('public.has_admin_write_access(text)');
  IF v_helper IS NOT NULL AND EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') || coalesce(with_check, '')) ILIKE '%has_admin_write_access%'
  ) THEN
    RAISE EXCEPTION '171 verification: has_admin_write_access still has policy consumers';
  END IF;

  SELECT string_agg(grantee, ',' ORDER BY grantee) INTO v_unexpected
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN (
      'roles', 'role_permissions', 'user_roles', 'homepage_sections',
      'homepage_elements'
    )
    AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
    AND grantee IN ('anon', 'authenticated', 'service_role');
  IF v_unexpected IS NOT NULL THEN
    RAISE EXCEPTION '171 verification: unexpected browser/server DML grants: %', v_unexpected;
  END IF;

  SELECT string_agg(column_name || ':' || privilege_type, ',' ORDER BY column_name, privilege_type)
  INTO v_unexpected
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND table_name = 'error_reports'
    AND grantee = 'authenticated'
    AND privilege_type IN ('INSERT', 'UPDATE')
    AND NOT (
      privilege_type = 'INSERT'
      AND column_name IN ('user_id', 'question_id', 'report_type', 'description')
    );
  IF v_unexpected IS NOT NULL THEN
    RAISE EXCEPTION '171 verification: unexpected authenticated error_reports column DML: %', v_unexpected;
  END IF;
END
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';
