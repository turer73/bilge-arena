-- Migration 068: Satın-alınabilir kozmetik rozet — Faz-3 kozmetik genişleme
--
-- Mevcut KAZANILAN achievement sistemi (badges.ts / user_achievements, XP ödüllü)
-- DEĞİŞMEZ. Bu AYRI bir sistem: coin'le satın-alınan, görsel-tabanlı prestij/
-- sezon rozetleri (Discord "Orbs Apprentice" analoğu; Ensar "12 Takım rozetleri").
--
-- 066 (background_assets) deseninin görsel uyarlaması: admin katalog tablosu +
-- badge-assets storage bucket (PNG) + owned_cosmetic_badges + purchase RPC.
-- LİSANS: rozet görselleri yükleyenin sorumluluğunda (admin UI uyarısı).

BEGIN;

-- ── Dinamik kozmetik rozet katalogu ────────────────────────────
CREATE TABLE IF NOT EXISTS public.cosmetic_badges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE,
  name         text NOT NULL,
  description  text,
  category     text NOT NULL DEFAULT 'genel',
  rarity       text NOT NULL DEFAULT 'epic',
  coin_cost    integer NOT NULL CHECK (coin_cost >= 0),
  -- badge-assets bucket'taki PNG public URL
  icon_url     text,
  is_published boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cosmetic_badges_published
  ON public.cosmetic_badges (is_published, created_at DESC);

ALTER TABLE public.cosmetic_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cosmetic_badges_select_published ON public.cosmetic_badges;
CREATE POLICY cosmetic_badges_select_published
  ON public.cosmetic_badges FOR SELECT
  USING (is_published = true);

REVOKE ALL ON public.cosmetic_badges FROM anon;
REVOKE ALL ON public.cosmetic_badges FROM authenticated;
GRANT SELECT ON public.cosmetic_badges TO anon, authenticated;

-- ── Sahiplik ───────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS owned_cosmetic_badges text[] NOT NULL DEFAULT ARRAY[]::text[];

-- ── Atomik satın alma (063/067 deseni, service-role only) ───────
CREATE OR REPLACE FUNCTION purchase_cosmetic_badge(p_user_id uuid, p_badge_id text, p_cost integer)
RETURNS TABLE (new_balance integer, new_owned text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_cost < 0 THEN
    RAISE EXCEPTION 'Gecersiz fiyat: %', p_cost;
  END IF;

  RETURN QUERY
  UPDATE profiles
  SET coin_balance = coin_balance - p_cost,
      owned_cosmetic_badges = array_append(owned_cosmetic_badges, p_badge_id)
  WHERE id = p_user_id
    AND NOT (p_badge_id = ANY(owned_cosmetic_badges))
    AND coin_balance >= p_cost
  RETURNING coin_balance, owned_cosmetic_badges;
END;
$$;

REVOKE ALL ON FUNCTION purchase_cosmetic_badge(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION purchase_cosmetic_badge(uuid, text, integer) FROM anon;
REVOKE ALL ON FUNCTION purchase_cosmetic_badge(uuid, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION purchase_cosmetic_badge(uuid, text, integer) TO service_role;

-- ── Storage bucket: badge-assets (PNG/JPEG/WebP, küçük) ─────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'badge-assets', 'badge-assets', true,
  2097152,  -- 2 MB cap (rozet görseli küçük)
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "badge_assets_public_read" ON storage.objects;
CREATE POLICY "badge_assets_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'badge-assets');

-- ── RBAC (016 deseni) ──────────────────────────────────────────
INSERT INTO role_permissions (role_id, permission)
SELECT r.id, p.permission
FROM roles r
CROSS JOIN (VALUES
  ('admin.badges.view'),
  ('admin.badges.manage')
) AS p(permission)
WHERE r.slug IN ('super_admin', 'editor')
ON CONFLICT (role_id, permission) DO NOTHING;

COMMIT;
