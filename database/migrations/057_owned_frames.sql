-- ============================================================
-- Migration 057: Profil çerçeve sahipliği
-- owned_frames: kullanıcının coin harcayarak satın aldığı çerçeve ID'leri
-- Herkes 'none' ve 'mavi' ile başlar (ücretsiz başlangıç çerçeveleri)
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS owned_frames TEXT[] NOT NULL DEFAULT ARRAY['none', 'mavi']::TEXT[];

-- Mevcut profiller için varsayılan değeri uygula
UPDATE profiles
  SET owned_frames = ARRAY['none', 'mavi']::TEXT[]
  WHERE owned_frames = ARRAY[]::TEXT[]
     OR array_length(owned_frames, 1) IS NULL;

-- İndeks: array içerik araması için GIN
CREATE INDEX IF NOT EXISTS profiles_owned_frames_gin
  ON profiles USING GIN (owned_frames);
