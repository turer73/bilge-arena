-- Migration 066: Video arka plan magazasi (Faz-2)
--
-- 063 CSS-tabanli magazanin video uzantisi. CSS temalar kodda statik kalir
-- (PROFILE_BACKGROUNDS); video temalar BURADA dinamik katalog (background_assets).
-- Sahiplik AYNI: profiles.owned_backgrounds text[] + purchase_background RPC
-- (generic id+cost) — RPC DEGISMEZ. Coin_cost API'de DB'den okunur.
--
-- LISANS NOTU: video icerigi YUKLEYENIN sorumlulugunda. Yalnizca lisansli /
-- CC0 / kendi-AI uretimi yuklenmeli (3.sahis Drive MP4'leri krediyle satis =
-- telif riski). Admin upload UI bu uyariyi gosterir.

BEGIN;

-- ── Dinamik video tema katalogu ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.background_assets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- magaza secim id'si + owned_backgrounds uyesi; CSS slug'lariyla cakismamali
  slug         text NOT NULL UNIQUE,
  name         text NOT NULL,
  description  text,
  -- magaza kategori chip'i (CSS kategorilerinden ayri 'video' grubu)
  category     text NOT NULL DEFAULT 'video',
  rarity       text NOT NULL DEFAULT 'epic',
  coin_cost    integer NOT NULL CHECK (coin_cost >= 0),
  -- {"hd": url, "k2": url, "k4": url} — yalnizca yuklenen varyantlar dolu
  variants     jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- reduced-motion + yukleme-oncesi poster (fallback; zorunlu degil ama onerilir)
  poster_url   text,
  is_published boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_background_assets_published
  ON public.background_assets (is_published, created_at DESC);

ALTER TABLE public.background_assets ENABLE ROW LEVEL SECURITY;

-- Yayinda olanlari herkes (anon + authenticated) gorebilir; yazma service-role.
-- (API yine de service-role ile okur + is_published filtreler; bu policy
--  defense-in-depth — dogrudan PostgREST erisiminde de yalniz yayinda olanlar.)
DROP POLICY IF EXISTS background_assets_select_published ON public.background_assets;
CREATE POLICY background_assets_select_published
  ON public.background_assets FOR SELECT
  USING (is_published = true);

-- Yazma (INSERT/UPDATE/DELETE) icin client policy YOK → yalniz service_role.
REVOKE ALL ON public.background_assets FROM anon;
REVOKE ALL ON public.background_assets FROM authenticated;
GRANT SELECT ON public.background_assets TO anon, authenticated;

-- ── Storage bucket: video-backgrounds (idempotent) ─────────────
-- avatars/homepage-assets panelde manuel olusturulmustu; bunu migration'a
-- alarak operator-bekleyen adimi kaldiriyoruz (re-run guvenli).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'video-backgrounds', 'video-backgrounds', true,
  8388608,  -- 8 MB cap
  ARRAY['video/mp4', 'video/webm', 'image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public okuma (getPublicUrl ile <video>/poster servisi); yazma/silme yalniz
-- service_role (RLS'i bypass eder — authenticated/anon icin write policy YOK).
DROP POLICY IF EXISTS "video_backgrounds_public_read" ON storage.objects;
CREATE POLICY "video_backgrounds_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'video-backgrounds');

-- ── RBAC izinleri (016 deseni) ─────────────────────────────────
-- super_admin (tum yetki) + editor (icerik yonetimi) video tema yonetir.
-- Bu satirlar olmadan checkPermission daima 403 doner → admin sayfa erisilemez.
INSERT INTO role_permissions (role_id, permission)
SELECT r.id, p.permission
FROM roles r
CROSS JOIN (VALUES
  ('admin.backgrounds.view'),
  ('admin.backgrounds.manage')
) AS p(permission)
WHERE r.slug IN ('super_admin', 'editor')
ON CONFLICT (role_id, permission) DO NOTHING;

COMMIT;
