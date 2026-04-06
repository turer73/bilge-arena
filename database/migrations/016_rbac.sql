-- ============================================================
-- Migration 016: Role-Based Access Control (RBAC)
-- Tarih: 2026-04-05
-- Aciklama: Basit user/admin ikili sistemden granular RBAC'e gecis.
--   - roles, role_permissions, user_roles tablolari
--   - 4 varsayilan rol: super_admin, editor, moderator, viewer
--   - 15 izin string'i
--   - Mevcut admin kullanicilari SuperAdmin'e migrate
--   - profiles.role kaldirilmaz (rollback guvenligi)
-- ============================================================

BEGIN;

-- ─── 1. Roller tablosu ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. Rol izinleri ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role_id, permission)
);

-- ─── 3. Kullanici-rol atamalari ─────────────────────────────
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role_id)
);

-- ─── 4. Indexler ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_perm ON role_permissions(permission);

-- ─── 5. Varsayilan rolleri seed'le ──────────────────────────

-- SuperAdmin
INSERT INTO roles (slug, name, description, is_system) VALUES
  ('super_admin', 'Süper Admin', 'Tüm yetkilere sahip yönetici', true),
  ('editor', 'Editör', 'Anasayfa düzenleme ve soru yönetimi', true),
  ('moderator', 'Moderatör', 'Raporlar ve kullanıcı yönetimi', true),
  ('viewer', 'Görüntüleyici', 'Sadece okuma yetkisi', true)
ON CONFLICT (slug) DO NOTHING;

-- ─── 6. Izin atamalari ──────────────────────────────────────

-- SuperAdmin — tum izinler
INSERT INTO role_permissions (role_id, permission)
SELECT r.id, p.permission
FROM roles r
CROSS JOIN (VALUES
  ('admin.dashboard.view'),
  ('admin.questions.view'),
  ('admin.questions.edit'),
  ('admin.questions.generate'),
  ('admin.users.view'),
  ('admin.users.manage'),
  ('admin.reports.view'),
  ('admin.reports.manage'),
  ('admin.logs.view'),
  ('admin.settings.view'),
  ('admin.settings.edit'),
  ('admin.roles.view'),
  ('admin.roles.manage'),
  ('admin.homepage.view'),
  ('admin.homepage.edit')
) AS p(permission)
WHERE r.slug = 'super_admin'
ON CONFLICT (role_id, permission) DO NOTHING;

-- Editor — anasayfa, sorular, dashboard, loglar
INSERT INTO role_permissions (role_id, permission)
SELECT r.id, p.permission
FROM roles r
CROSS JOIN (VALUES
  ('admin.dashboard.view'),
  ('admin.questions.view'),
  ('admin.questions.edit'),
  ('admin.questions.generate'),
  ('admin.homepage.view'),
  ('admin.homepage.edit'),
  ('admin.logs.view')
) AS p(permission)
WHERE r.slug = 'editor'
ON CONFLICT (role_id, permission) DO NOTHING;

-- Moderator — kullanicilar, raporlar, dashboard, loglar
INSERT INTO role_permissions (role_id, permission)
SELECT r.id, p.permission
FROM roles r
CROSS JOIN (VALUES
  ('admin.dashboard.view'),
  ('admin.users.view'),
  ('admin.users.manage'),
  ('admin.reports.view'),
  ('admin.reports.manage'),
  ('admin.logs.view')
) AS p(permission)
WHERE r.slug = 'moderator'
ON CONFLICT (role_id, permission) DO NOTHING;

-- Viewer — sadece goruntuleyici
INSERT INTO role_permissions (role_id, permission)
SELECT r.id, p.permission
FROM roles r
CROSS JOIN (VALUES
  ('admin.dashboard.view'),
  ('admin.questions.view'),
  ('admin.users.view'),
  ('admin.reports.view'),
  ('admin.logs.view'),
  ('admin.settings.view'),
  ('admin.homepage.view')
) AS p(permission)
WHERE r.slug = 'viewer'
ON CONFLICT (role_id, permission) DO NOTHING;

-- ─── 7. Mevcut adminleri SuperAdmin rolune migrate et ──────
INSERT INTO user_roles (user_id, role_id)
SELECT p.id, r.id
FROM profiles p
CROSS JOIN roles r
WHERE p.role = 'admin' AND r.slug = 'super_admin'
ON CONFLICT (user_id, role_id) DO NOTHING;

-- ─── 8. RLS Politikalari ────────────────────────────────────

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- roles: Herkes okuyabilir (sidebar filtreleme icin)
CREATE POLICY "roles_select_all" ON roles FOR SELECT USING (true);
-- roles: Sadece super_admin insert/update/delete
CREATE POLICY "roles_manage" ON roles FOR ALL
  USING (EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = auth.uid() AND rp.permission = 'admin.roles.manage'
  ));

-- role_permissions: Herkes okuyabilir
CREATE POLICY "role_permissions_select_all" ON role_permissions FOR SELECT USING (true);
-- role_permissions: Sadece roles.manage izni olan yonetir
CREATE POLICY "role_permissions_manage" ON role_permissions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN role_permissions rp2 ON rp2.role_id = ur.role_id
    WHERE ur.user_id = auth.uid() AND rp2.permission = 'admin.roles.manage'
  ));

-- user_roles: Herkes kendi rollerini gorebilir
CREATE POLICY "user_roles_select_own" ON user_roles FOR SELECT
  USING (user_id = auth.uid());
-- user_roles: Admin olanlar herkesinkini gorebilir
CREATE POLICY "user_roles_select_admin" ON user_roles FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = auth.uid() AND rp.permission = 'admin.roles.view'
  ));
-- user_roles: Sadece roles.manage izni olan yonetir
CREATE POLICY "user_roles_manage" ON user_roles FOR ALL
  USING (EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = auth.uid() AND rp.permission = 'admin.roles.manage'
  ));

-- ─── 9. Mevcut admin_logs ve site_settings RLS guncelle ────
-- Eski policies'i kaldir, yenilerini ekle

-- admin_logs
DROP POLICY IF EXISTS "admin_logs_select" ON admin_logs;
DROP POLICY IF EXISTS "admin_logs_insert" ON admin_logs;

CREATE POLICY "admin_logs_select_rbac" ON admin_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = auth.uid() AND rp.permission = 'admin.logs.view'
  ));

CREATE POLICY "admin_logs_insert_rbac" ON admin_logs FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
  ));

-- site_settings
DROP POLICY IF EXISTS "site_settings_select" ON site_settings;
DROP POLICY IF EXISTS "site_settings_update" ON site_settings;
DROP POLICY IF EXISTS "site_settings_insert" ON site_settings;

CREATE POLICY "site_settings_select_rbac" ON site_settings FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = auth.uid() AND rp.permission = 'admin.settings.view'
  ));

CREATE POLICY "site_settings_update_rbac" ON site_settings FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = auth.uid() AND rp.permission = 'admin.settings.edit'
  ));

CREATE POLICY "site_settings_insert_rbac" ON site_settings FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = auth.uid() AND rp.permission = 'admin.settings.edit'
  ));

COMMIT;
