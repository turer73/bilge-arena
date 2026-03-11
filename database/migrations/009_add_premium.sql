-- Migration 009: Premium abonelik altyapisi
-- Profil tablosuna premium alanlari ekle

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS premium_until TIMESTAMPTZ DEFAULT NULL;

-- Premium kontrol fonksiyonu: suresi dolmussa otomatik false yap
CREATE OR REPLACE FUNCTION check_premium_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.premium_until IS NOT NULL AND NEW.premium_until < NOW() THEN
    NEW.is_premium := false;
    NEW.premium_until := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_premium ON profiles;
CREATE TRIGGER trg_check_premium
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION check_premium_status();

-- Index: premium kullanicilari hizli sorgula
CREATE INDEX IF NOT EXISTS idx_profiles_premium ON profiles(is_premium) WHERE is_premium = true;
