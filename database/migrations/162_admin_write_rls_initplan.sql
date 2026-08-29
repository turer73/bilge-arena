-- Migration 162: migration 161'in admin-yazma RLS yardimcisini statement
-- basina tek initplan olarak degerlendir.
--
-- Migration 161 production'a uygulanmis oldugu icin geriye donuk degistirilmez.
-- Ilk hali `public.has_admin_write_access(...)` yardimcisini politika ifadesine
-- dogrudan koyuyordu. PostgreSQL bunu satir basina tekrar degerlendirebilir ve
-- migration 035'te kapatilan auth_rls_initplan performans regresyonunu yeniden
-- acabilirdi. `(SELECT ...)` sarmali sonucu statement basina initplan'a tasir;
-- izin ve AAL2 davranisi degismez.

BEGIN;

DROP POLICY IF EXISTS "questions_update_admin_rbac" ON public.questions;
CREATE POLICY "questions_update_admin_rbac" ON public.questions
  FOR UPDATE
  USING ((SELECT public.has_admin_write_access('admin.questions.edit')))
  WITH CHECK ((SELECT public.has_admin_write_access('admin.questions.edit')));

DROP POLICY IF EXISTS "questions_delete_admin_rbac" ON public.questions;
CREATE POLICY "questions_delete_admin_rbac" ON public.questions
  FOR DELETE
  USING ((SELECT public.has_admin_write_access('admin.questions.edit')));

DROP POLICY IF EXISTS "homepage_elements_admin_insert" ON public.homepage_elements;
CREATE POLICY "homepage_elements_admin_insert" ON public.homepage_elements
  FOR INSERT
  WITH CHECK ((SELECT public.has_admin_write_access('admin.homepage.edit')));

DROP POLICY IF EXISTS "homepage_elements_admin_update" ON public.homepage_elements;
CREATE POLICY "homepage_elements_admin_update" ON public.homepage_elements
  FOR UPDATE
  USING ((SELECT public.has_admin_write_access('admin.homepage.edit')));

DROP POLICY IF EXISTS "homepage_elements_admin_delete" ON public.homepage_elements;
CREATE POLICY "homepage_elements_admin_delete" ON public.homepage_elements
  FOR DELETE
  USING ((SELECT public.has_admin_write_access('admin.homepage.edit')));

DROP POLICY IF EXISTS "homepage_sections_admin_insert" ON public.homepage_sections;
CREATE POLICY "homepage_sections_admin_insert" ON public.homepage_sections
  FOR INSERT
  WITH CHECK ((SELECT public.has_admin_write_access('admin.homepage.edit')));

DROP POLICY IF EXISTS "homepage_sections_admin_update" ON public.homepage_sections;
CREATE POLICY "homepage_sections_admin_update" ON public.homepage_sections
  FOR UPDATE
  USING ((SELECT public.has_admin_write_access('admin.homepage.edit')));

DROP POLICY IF EXISTS "homepage_sections_admin_delete" ON public.homepage_sections;
CREATE POLICY "homepage_sections_admin_delete" ON public.homepage_sections
  FOR DELETE
  USING ((SELECT public.has_admin_write_access('admin.homepage.edit')));

DROP POLICY IF EXISTS "site_settings_insert_rbac" ON public.site_settings;
CREATE POLICY "site_settings_insert_rbac" ON public.site_settings
  FOR INSERT
  WITH CHECK ((SELECT public.has_admin_write_access('admin.settings.edit')));

DROP POLICY IF EXISTS "site_settings_update_rbac" ON public.site_settings;
CREATE POLICY "site_settings_update_rbac" ON public.site_settings
  FOR UPDATE
  USING ((SELECT public.has_admin_write_access('admin.settings.edit')));

DROP POLICY IF EXISTS "error_reports_update_admin_rbac" ON public.error_reports;
CREATE POLICY "error_reports_update_admin_rbac" ON public.error_reports
  FOR UPDATE
  USING ((SELECT public.has_admin_write_access('admin.reports.manage')));

DROP POLICY IF EXISTS "roles_manage_insert" ON public.roles;
CREATE POLICY "roles_manage_insert" ON public.roles
  FOR INSERT
  WITH CHECK ((SELECT public.has_admin_write_access('admin.roles.manage')));

DROP POLICY IF EXISTS "roles_manage_update" ON public.roles;
CREATE POLICY "roles_manage_update" ON public.roles
  FOR UPDATE
  USING ((SELECT public.has_admin_write_access('admin.roles.manage')));

DROP POLICY IF EXISTS "roles_manage_delete" ON public.roles;
CREATE POLICY "roles_manage_delete" ON public.roles
  FOR DELETE
  USING ((SELECT public.has_admin_write_access('admin.roles.manage')));

DROP POLICY IF EXISTS "user_roles_manage_insert" ON public.user_roles;
CREATE POLICY "user_roles_manage_insert" ON public.user_roles
  FOR INSERT
  WITH CHECK ((SELECT public.has_admin_write_access('admin.roles.manage')));

DROP POLICY IF EXISTS "user_roles_manage_update" ON public.user_roles;
CREATE POLICY "user_roles_manage_update" ON public.user_roles
  FOR UPDATE
  USING ((SELECT public.has_admin_write_access('admin.roles.manage')));

DROP POLICY IF EXISTS "user_roles_manage_delete" ON public.user_roles;
CREATE POLICY "user_roles_manage_delete" ON public.user_roles
  FOR DELETE
  USING ((SELECT public.has_admin_write_access('admin.roles.manage')));

DROP POLICY IF EXISTS "role_permissions_manage_insert" ON public.role_permissions;
CREATE POLICY "role_permissions_manage_insert" ON public.role_permissions
  FOR INSERT
  WITH CHECK ((SELECT public.has_admin_write_access('admin.roles.manage')));

DROP POLICY IF EXISTS "role_permissions_manage_update" ON public.role_permissions;
CREATE POLICY "role_permissions_manage_update" ON public.role_permissions
  FOR UPDATE
  USING ((SELECT public.has_admin_write_access('admin.roles.manage')));

DROP POLICY IF EXISTS "role_permissions_manage_delete" ON public.role_permissions;
CREATE POLICY "role_permissions_manage_delete" ON public.role_permissions
  FOR DELETE
  USING ((SELECT public.has_admin_write_access('admin.roles.manage')));

DO $verify$
DECLARE
  v_policy_count integer;
  v_unwrapped_count integer;
BEGIN
  SELECT count(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND coalesce(qual, '') || coalesce(with_check, '')
      ILIKE '%has_admin_write_access%';

  IF v_policy_count <> 20 THEN
    RAISE EXCEPTION
      '162 dogrulama: beklenen 20 politika yerine % politika bulundu',
      v_policy_count;
  END IF;

  SELECT count(*) INTO v_unwrapped_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      (coalesce(qual, '') ILIKE '%has_admin_write_access%'
        AND coalesce(qual, '') NOT ILIKE '%SELECT%has_admin_write_access%')
      OR
      (coalesce(with_check, '') ILIKE '%has_admin_write_access%'
        AND coalesce(with_check, '') NOT ILIKE '%SELECT%has_admin_write_access%')
    );

  IF v_unwrapped_count <> 0 THEN
    RAISE EXCEPTION
      '162 dogrulama: % politika ifadesi initplan sarmali olmadan kaldi',
      v_unwrapped_count;
  END IF;
END
$verify$;

COMMIT;

