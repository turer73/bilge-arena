-- ============================================================
-- Migration 025: error_reports RLS RBAC migration
-- Sorun: Migration 003'te yazilan error_reports_select_admin/update_admin
--        policy'leri hala eski profiles.role = 'admin' kriterine bagli.
--        016/016b RBAC'a gecerken admin_logs, site_settings, homepage_*,
--        roles, user_roles, role_permissions guncellendi — error_reports
--        unutuldu. Sonuc: sadece user_roles tablosuyla admin yapilmis
--        kullanicilar (profiles.role = 'admin' set edilmemis) RLS'te
--        admin policy'sine giremiyor, error_reports_select_own'a dusuyor
--        ve sadece kendi raporlarini goruyor.
-- Cozum: 016b'deki pattern'in aynisi — has_permission() tabanli policy.
-- ============================================================

BEGIN;

-- Eski profiles.role tabanli policy'leri kaldir
DROP POLICY IF EXISTS "error_reports_select_admin" ON public.error_reports;
DROP POLICY IF EXISTS "error_reports_update_admin" ON public.error_reports;

-- Yeni RBAC-aware policy'ler
-- admin.reports.view izni olan herkes TUM raporlari okuyabilir
CREATE POLICY "error_reports_select_admin_rbac" ON public.error_reports
  FOR SELECT
  USING (public.has_permission(auth.uid(), 'admin.reports.view'));

-- admin.reports.manage izni olan herkes durum guncelleyebilir
CREATE POLICY "error_reports_update_admin_rbac" ON public.error_reports
  FOR UPDATE
  USING (public.has_permission(auth.uid(), 'admin.reports.manage'));

-- Not: error_reports_select_own ve error_reports_insert policy'leri
--      korundu — kullanici hala kendi raporlarini gorebilir ve
--      yeni rapor olusturabilir (permission kontrolu olmadan).

COMMIT;
