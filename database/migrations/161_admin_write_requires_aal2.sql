-- Migration 161: admin yazma politikalari MFA (AAL2) sarti da istesin.
--
-- Guvenlik denetimi 2026-08-25 (disc#1638). AAL2 kapisi yalnizca src/proxy.ts
-- icinde yasiyordu; RLS politikalari ise sadece has_permission(auth.uid(), izin)
-- bakiyor, JWT'deki `aal` iddiasina hic bakmiyordu. Dogrudan PostgREST cagrisi
-- proxy'yi tamamen atladigi icin, MFA'sı olmayan ayricalikli bir hesap admin
-- yazmalarini yapabiliyordu.
--
-- Canli kanit (geri alinan islem): request.jwt.claims icinde aal=aal1 ve
-- editor rollu kullanicinin sub'u ile SET ROLE authenticated yapilip
-- public.questions uzerinde UPDATE denendi -> 1 satir yazildi.
--
-- Bu yolla atlanan katmanlar: MFA kapisi, content-governance 409 (dogrudan soru
-- guncellemesi kapali), admin mutation rate limiter ve admin_logs denetim kaydi
-- (denetim satirini route yaziyor, RLS degil — yani iz kalmiyordu).
--
-- Neden mesru yollari kirmaz:
--   * service_role rolbypassrls=true — sunucu-taraflı yazmalar RLS'e hic girmez
--     (roles/user_roles/role_permissions yazmalarinin tamami svc uzerinden).
--   * Cookie client ile yazan admin uclari /api/admin/* altinda; proxy o
--     yuzeyler icin zaten aal2 zorunlu kiliyor.
--   * Tek istisna /api/questions PATCH: /api/admin/* altinda degil, ama cagri
--     admin panelinden geliyor ve /admin kabugunu acabilmek icin oturumun
--     aal2'ye yukselmis olmasi gerekiyor (aal oturum ozelligi, refresh'te korunur).

BEGIN;

-- ---------------------------------------------------------------------------
-- Yardimci: izin + MFA tek yerde. SECURITY INVOKER bilincli — yetki
-- yukseltmesine gerek yok, has_permission zaten definer. Politikalar bu
-- fonksiyonu cagirdigi icin authenticated'a EXECUTE sart.
--
-- coalesce(...,'aal1'): `aal` iddiasi tasimayan bir token aal2 sayilmasin.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_admin_write_access(p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $fn$
  SELECT coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
     AND public.has_permission(auth.uid(), p_permission);
$fn$;

REVOKE ALL ON FUNCTION public.has_admin_write_access(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_admin_write_access(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 20 admin-yazma politikasi. Izin adlari ve kapsamlar AYNEN korunuyor;
-- eklenen tek sey MFA sarti.
-- ---------------------------------------------------------------------------

-- questions: soru bankasi (4409 aktif soru) yazma/silme
DROP POLICY IF EXISTS "questions_update_admin_rbac" ON public.questions;
CREATE POLICY "questions_update_admin_rbac" ON public.questions
  FOR UPDATE
  USING (public.has_admin_write_access('admin.questions.edit'))
  WITH CHECK (public.has_admin_write_access('admin.questions.edit'));

DROP POLICY IF EXISTS "questions_delete_admin_rbac" ON public.questions;
CREATE POLICY "questions_delete_admin_rbac" ON public.questions
  FOR DELETE
  USING (public.has_admin_write_access('admin.questions.edit'));

-- homepage_elements: kamuya acik ana sayfa icerigi (tahrif yuzeyi)
DROP POLICY IF EXISTS "homepage_elements_admin_insert" ON public.homepage_elements;
CREATE POLICY "homepage_elements_admin_insert" ON public.homepage_elements
  FOR INSERT
  WITH CHECK (public.has_admin_write_access('admin.homepage.edit'));

DROP POLICY IF EXISTS "homepage_elements_admin_update" ON public.homepage_elements;
CREATE POLICY "homepage_elements_admin_update" ON public.homepage_elements
  FOR UPDATE
  USING (public.has_admin_write_access('admin.homepage.edit'));

DROP POLICY IF EXISTS "homepage_elements_admin_delete" ON public.homepage_elements;
CREATE POLICY "homepage_elements_admin_delete" ON public.homepage_elements
  FOR DELETE
  USING (public.has_admin_write_access('admin.homepage.edit'));

-- homepage_sections
DROP POLICY IF EXISTS "homepage_sections_admin_insert" ON public.homepage_sections;
CREATE POLICY "homepage_sections_admin_insert" ON public.homepage_sections
  FOR INSERT
  WITH CHECK (public.has_admin_write_access('admin.homepage.edit'));

DROP POLICY IF EXISTS "homepage_sections_admin_update" ON public.homepage_sections;
CREATE POLICY "homepage_sections_admin_update" ON public.homepage_sections
  FOR UPDATE
  USING (public.has_admin_write_access('admin.homepage.edit'));

DROP POLICY IF EXISTS "homepage_sections_admin_delete" ON public.homepage_sections;
CREATE POLICY "homepage_sections_admin_delete" ON public.homepage_sections
  FOR DELETE
  USING (public.has_admin_write_access('admin.homepage.edit'));

-- site_settings
DROP POLICY IF EXISTS "site_settings_insert_rbac" ON public.site_settings;
CREATE POLICY "site_settings_insert_rbac" ON public.site_settings
  FOR INSERT
  WITH CHECK (public.has_admin_write_access('admin.settings.edit'));

DROP POLICY IF EXISTS "site_settings_update_rbac" ON public.site_settings;
CREATE POLICY "site_settings_update_rbac" ON public.site_settings
  FOR UPDATE
  USING (public.has_admin_write_access('admin.settings.edit'));

-- error_reports
DROP POLICY IF EXISTS "error_reports_update_admin_rbac" ON public.error_reports;
CREATE POLICY "error_reports_update_admin_rbac" ON public.error_reports
  FOR UPDATE
  USING (public.has_admin_write_access('admin.reports.manage'));

-- roles / user_roles / role_permissions: yetki matrisi. Uygulama bunlari
-- yalniz service-role ile yaziyor, yani bu politikalar zaten sadece dogrudan
-- API yolunu kapsiyor.
DROP POLICY IF EXISTS "roles_manage_insert" ON public.roles;
CREATE POLICY "roles_manage_insert" ON public.roles
  FOR INSERT
  WITH CHECK (public.has_admin_write_access('admin.roles.manage'));

DROP POLICY IF EXISTS "roles_manage_update" ON public.roles;
CREATE POLICY "roles_manage_update" ON public.roles
  FOR UPDATE
  USING (public.has_admin_write_access('admin.roles.manage'));

DROP POLICY IF EXISTS "roles_manage_delete" ON public.roles;
CREATE POLICY "roles_manage_delete" ON public.roles
  FOR DELETE
  USING (public.has_admin_write_access('admin.roles.manage'));

DROP POLICY IF EXISTS "user_roles_manage_insert" ON public.user_roles;
CREATE POLICY "user_roles_manage_insert" ON public.user_roles
  FOR INSERT
  WITH CHECK (public.has_admin_write_access('admin.roles.manage'));

DROP POLICY IF EXISTS "user_roles_manage_update" ON public.user_roles;
CREATE POLICY "user_roles_manage_update" ON public.user_roles
  FOR UPDATE
  USING (public.has_admin_write_access('admin.roles.manage'));

DROP POLICY IF EXISTS "user_roles_manage_delete" ON public.user_roles;
CREATE POLICY "user_roles_manage_delete" ON public.user_roles
  FOR DELETE
  USING (public.has_admin_write_access('admin.roles.manage'));

DROP POLICY IF EXISTS "role_permissions_manage_insert" ON public.role_permissions;
CREATE POLICY "role_permissions_manage_insert" ON public.role_permissions
  FOR INSERT
  WITH CHECK (public.has_admin_write_access('admin.roles.manage'));

DROP POLICY IF EXISTS "role_permissions_manage_update" ON public.role_permissions;
CREATE POLICY "role_permissions_manage_update" ON public.role_permissions
  FOR UPDATE
  USING (public.has_admin_write_access('admin.roles.manage'));

DROP POLICY IF EXISTS "role_permissions_manage_delete" ON public.role_permissions;
CREATE POLICY "role_permissions_manage_delete" ON public.role_permissions
  FOR DELETE
  USING (public.has_admin_write_access('admin.roles.manage'));

-- ---------------------------------------------------------------------------
-- Dogrulama: migration kendi iddiasini ispatlamadan commit etmesin.
-- Atanmis bir admin varsa iki gercek claim senaryosu da kosulur. Bos/fresh
-- ortamlarda kullanici verisi migration on kosulu degildir; politika yapisi
-- yine deterministik olarak dogrulanir.
-- ---------------------------------------------------------------------------

DO $verify$
DECLARE
  v_admin uuid;
  v_policy_count integer;
BEGIN
  SELECT ur.user_id INTO v_admin
  FROM public.user_roles ur
  JOIN public.role_permissions rp ON rp.role_id = ur.role_id
  WHERE rp.permission = 'admin.questions.edit'
  LIMIT 1;

  IF v_admin IS NULL THEN
    RAISE NOTICE '161 dogrulama: atanmis admin yok; veri-bagimli claim simulasyonu atlandi';
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    IF public.has_admin_write_access('admin.questions.edit') THEN
      RAISE EXCEPTION '161 dogrulama: aal1 oturumu hala admin yazma hakki aliyor';
    END IF;

    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    IF NOT public.has_admin_write_access('admin.questions.edit') THEN
      RAISE EXCEPTION '161 dogrulama: aal2 admini reddedildi (mesru yol kirilirdi)';
    END IF;

    PERFORM set_config('request.jwt.claims', '', true);
  END IF;

  SELECT count(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND coalesce(qual, '') || coalesce(with_check, '') ILIKE '%has_admin_write_access%';
  IF v_policy_count <> 20 THEN
    RAISE EXCEPTION '161 dogrulama: beklenen 20 politika yerine % politika tasindi', v_policy_count;
  END IF;
END
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';
