-- ============================================================
-- Migration 016b: RLS Recursion Fix
-- Sorun: user_roles RLS politikası kendi tablosunu kontrol ediyor → sonsuz döngü
-- Çözüm: SECURITY DEFINER fonksiyon ile izin kontrolü yaparak RLS'i bypass et
-- ============================================================

BEGIN;

-- ─── 1. Helper fonksiyon: Kullanıcının belirli izne sahip olup olmadığını kontrol eder
-- SECURITY DEFINER → RLS'i bypass eder, sonsuz döngüyü kırar
CREATE OR REPLACE FUNCTION public.has_permission(p_user_id UUID, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = p_user_id AND rp.permission = p_permission
  );
$$;

-- ─── 2. Helper fonksiyon: Kullanıcının herhangi bir rolü var mı
CREATE OR REPLACE FUNCTION public.has_any_role(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = p_user_id
  );
$$;

-- ─── 3. user_roles RLS'i düzelt ─────────────────────────────
-- Mevcut politikaları kaldır
DROP POLICY IF EXISTS "user_roles_select_own" ON user_roles;
DROP POLICY IF EXISTS "user_roles_select_admin" ON user_roles;
DROP POLICY IF EXISTS "user_roles_manage" ON user_roles;

-- Herkes kendi rollerini görebilir
CREATE POLICY "user_roles_select_own" ON user_roles FOR SELECT
  USING (user_id = auth.uid());

-- Rol yönetim izni olanlar herkesinkini görebilir (SECURITY DEFINER ile)
CREATE POLICY "user_roles_select_admin" ON user_roles FOR SELECT
  USING (public.has_permission(auth.uid(), 'admin.roles.view'));

-- Rol yönetim izni olanlar CUD yapabilir
CREATE POLICY "user_roles_manage_insert" ON user_roles FOR INSERT
  WITH CHECK (public.has_permission(auth.uid(), 'admin.roles.manage'));
CREATE POLICY "user_roles_manage_update" ON user_roles FOR UPDATE
  USING (public.has_permission(auth.uid(), 'admin.roles.manage'));
CREATE POLICY "user_roles_manage_delete" ON user_roles FOR DELETE
  USING (public.has_permission(auth.uid(), 'admin.roles.manage'));

-- ─── 4. role_permissions RLS'i düzelt ───────────────────────
DROP POLICY IF EXISTS "role_permissions_select_all" ON role_permissions;
DROP POLICY IF EXISTS "role_permissions_manage" ON role_permissions;

CREATE POLICY "role_permissions_select_all" ON role_permissions FOR SELECT
  USING (true);

CREATE POLICY "role_permissions_manage_insert" ON role_permissions FOR INSERT
  WITH CHECK (public.has_permission(auth.uid(), 'admin.roles.manage'));
CREATE POLICY "role_permissions_manage_update" ON role_permissions FOR UPDATE
  USING (public.has_permission(auth.uid(), 'admin.roles.manage'));
CREATE POLICY "role_permissions_manage_delete" ON role_permissions FOR DELETE
  USING (public.has_permission(auth.uid(), 'admin.roles.manage'));

-- ─── 5. roles RLS'i düzelt ──────────────────────────────────
DROP POLICY IF EXISTS "roles_select_all" ON roles;
DROP POLICY IF EXISTS "roles_manage" ON roles;

CREATE POLICY "roles_select_all" ON roles FOR SELECT
  USING (true);

CREATE POLICY "roles_manage_insert" ON roles FOR INSERT
  WITH CHECK (public.has_permission(auth.uid(), 'admin.roles.manage'));
CREATE POLICY "roles_manage_update" ON roles FOR UPDATE
  USING (public.has_permission(auth.uid(), 'admin.roles.manage'));
CREATE POLICY "roles_manage_delete" ON roles FOR DELETE
  USING (public.has_permission(auth.uid(), 'admin.roles.manage'));

-- ─── 6. admin_logs RLS'i düzelt ─────────────────────────────
DROP POLICY IF EXISTS "admin_logs_select_rbac" ON admin_logs;
DROP POLICY IF EXISTS "admin_logs_insert_rbac" ON admin_logs;

CREATE POLICY "admin_logs_select_rbac" ON admin_logs FOR SELECT
  USING (public.has_permission(auth.uid(), 'admin.logs.view'));

CREATE POLICY "admin_logs_insert_rbac" ON admin_logs FOR INSERT
  WITH CHECK (public.has_any_role(auth.uid()));

-- ─── 7. site_settings RLS'i düzelt ──────────────────────────
DROP POLICY IF EXISTS "site_settings_select_rbac" ON site_settings;
DROP POLICY IF EXISTS "site_settings_update_rbac" ON site_settings;
DROP POLICY IF EXISTS "site_settings_insert_rbac" ON site_settings;

CREATE POLICY "site_settings_select_rbac" ON site_settings FOR SELECT
  USING (public.has_permission(auth.uid(), 'admin.settings.view'));

CREATE POLICY "site_settings_update_rbac" ON site_settings FOR UPDATE
  USING (public.has_permission(auth.uid(), 'admin.settings.edit'));

CREATE POLICY "site_settings_insert_rbac" ON site_settings FOR INSERT
  WITH CHECK (public.has_permission(auth.uid(), 'admin.settings.edit'));

-- ─── 8. homepage tabloları RLS'i düzelt ─────────────────────
DROP POLICY IF EXISTS "homepage_sections_public_read" ON homepage_sections;
DROP POLICY IF EXISTS "homepage_sections_admin_read" ON homepage_sections;
DROP POLICY IF EXISTS "homepage_sections_admin_manage" ON homepage_sections;
DROP POLICY IF EXISTS "homepage_elements_public_read" ON homepage_elements;
DROP POLICY IF EXISTS "homepage_elements_admin_read" ON homepage_elements;
DROP POLICY IF EXISTS "homepage_elements_admin_manage" ON homepage_elements;

-- Public: yayınlanan içerik herkes tarafından okunabilir
CREATE POLICY "homepage_sections_public_read" ON homepage_sections FOR SELECT
  USING (is_published = true);
CREATE POLICY "homepage_elements_public_read" ON homepage_elements FOR SELECT
  USING (is_published = true);

-- Admin: tüm kayıtları okuyabilir
CREATE POLICY "homepage_sections_admin_read" ON homepage_sections FOR SELECT
  USING (public.has_permission(auth.uid(), 'admin.homepage.view'));
CREATE POLICY "homepage_elements_admin_read" ON homepage_elements FOR SELECT
  USING (public.has_permission(auth.uid(), 'admin.homepage.view'));

-- Admin: CUD yapabilir
CREATE POLICY "homepage_sections_admin_insert" ON homepage_sections FOR INSERT
  WITH CHECK (public.has_permission(auth.uid(), 'admin.homepage.edit'));
CREATE POLICY "homepage_sections_admin_update" ON homepage_sections FOR UPDATE
  USING (public.has_permission(auth.uid(), 'admin.homepage.edit'));
CREATE POLICY "homepage_sections_admin_delete" ON homepage_sections FOR DELETE
  USING (public.has_permission(auth.uid(), 'admin.homepage.edit'));

CREATE POLICY "homepage_elements_admin_insert" ON homepage_elements FOR INSERT
  WITH CHECK (public.has_permission(auth.uid(), 'admin.homepage.edit'));
CREATE POLICY "homepage_elements_admin_update" ON homepage_elements FOR UPDATE
  USING (public.has_permission(auth.uid(), 'admin.homepage.edit'));
CREATE POLICY "homepage_elements_admin_delete" ON homepage_elements FOR DELETE
  USING (public.has_permission(auth.uid(), 'admin.homepage.edit'));

COMMIT;
