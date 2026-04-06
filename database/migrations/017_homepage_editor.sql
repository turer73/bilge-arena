-- ============================================================
-- Migration 017: Homepage Editor
-- Tarih: 2026-04-05
-- Aciklama: Anasayfa bolumlerinin icerigini admin panelden
--   duzenleme altyapisi. Bolum konfigurasyonlari (JSONB) ve
--   ek ogeler (logo, slogan) tablolari.
-- ============================================================

BEGIN;

-- ─── 1. Bölüm yapılandırmaları ─────────────────────────────
CREATE TABLE IF NOT EXISTS homepage_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key TEXT UNIQUE NOT NULL
    CHECK (section_key IN ('hero', 'stats', 'games', 'how_it_works', 'cta', 'leaderboard', 'footer')),
  config JSONB NOT NULL DEFAULT '{}',
  is_published BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. Ek öğeler (logolar, sloganlar) ─────────────────────
CREATE TABLE IF NOT EXISTS homepage_elements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key TEXT NOT NULL
    CHECK (section_key IN ('hero', 'stats', 'games', 'how_it_works', 'cta', 'leaderboard', 'footer')),
  element_type TEXT NOT NULL CHECK (element_type IN ('logo', 'slogan', 'banner')),
  content TEXT,                        -- Slogan/banner metni
  image_url TEXT,                      -- Supabase Storage URL (logolar icin)
  alt_text TEXT NOT NULL DEFAULT '',
  placement TEXT NOT NULL DEFAULT 'below'
    CHECK (placement IN ('above', 'below', 'inline')),
  alignment TEXT NOT NULL DEFAULT 'center'
    CHECK (alignment IN ('left', 'center', 'right')),
  size TEXT NOT NULL DEFAULT 'md'
    CHECK (size IN ('xs', 'sm', 'md', 'lg', 'xl')),
  styles JSONB NOT NULL DEFAULT '{}',  -- fontSize, color, opacity, maxWidth vb.
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 3. Indexler ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_homepage_elements_section ON homepage_elements(section_key);
CREATE INDEX IF NOT EXISTS idx_homepage_elements_published ON homepage_elements(is_published) WHERE is_published = true;

-- ─── 4. updated_at trigger ──────────────────────────────────
CREATE OR REPLACE FUNCTION update_homepage_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_homepage_sections_updated_at
  BEFORE UPDATE ON homepage_sections
  FOR EACH ROW EXECUTE FUNCTION update_homepage_updated_at();

CREATE TRIGGER trg_homepage_elements_updated_at
  BEFORE UPDATE ON homepage_elements
  FOR EACH ROW EXECUTE FUNCTION update_homepage_updated_at();

-- ─── 5. RLS ─────────────────────────────────────────────────
ALTER TABLE homepage_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE homepage_elements ENABLE ROW LEVEL SECURITY;

-- Herkes yayinlanan icerigi okuyabilir
CREATE POLICY "homepage_sections_public_read" ON homepage_sections
  FOR SELECT USING (is_published = true);

CREATE POLICY "homepage_elements_public_read" ON homepage_elements
  FOR SELECT USING (is_published = true);

-- Admin: homepage.view izni olanlar tum kayitlari gorebilir
CREATE POLICY "homepage_sections_admin_read" ON homepage_sections
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = auth.uid() AND rp.permission = 'admin.homepage.view'
  ));

CREATE POLICY "homepage_elements_admin_read" ON homepage_elements
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = auth.uid() AND rp.permission = 'admin.homepage.view'
  ));

-- Admin: homepage.edit izni olanlar CUD yapabilir
CREATE POLICY "homepage_sections_admin_manage" ON homepage_sections
  FOR ALL USING (EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = auth.uid() AND rp.permission = 'admin.homepage.edit'
  ));

CREATE POLICY "homepage_elements_admin_manage" ON homepage_elements
  FOR ALL USING (EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = auth.uid() AND rp.permission = 'admin.homepage.edit'
  ));

-- ─── 6. Varsayilan bölüm seed'leri (boş config) ────────────
INSERT INTO homepage_sections (section_key, config, is_published) VALUES
  ('hero', '{}', false),
  ('stats', '{}', false),
  ('games', '{}', false),
  ('how_it_works', '{}', false),
  ('cta', '{}', false),
  ('leaderboard', '{}', false),
  ('footer', '{}', false)
ON CONFLICT (section_key) DO NOTHING;

COMMIT;
