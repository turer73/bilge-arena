-- ============================================================
-- 015: Referral System (Davet Sistemi)
-- Her kullaniciya benzersiz davet kodu. Davet edilen kayit olunca
-- her iki tarafa XP odulu.
-- ============================================================

-- Profiles tablosuna referral_code kolonu ekle
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS referral_code VARCHAR(8) UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES profiles(id);

-- Referral log tablosu
CREATE TABLE IF NOT EXISTS referral_rewards (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  xp_awarded    SMALLINT NOT NULL DEFAULT 100,
  created_at    TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(referrer_id, referred_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_referrer ON referral_rewards(referrer_id);

-- RLS
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referral_own" ON referral_rewards;
CREATE POLICY "referral_own" ON referral_rewards
  FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- Mevcut kullanicilara referral_code ata (8 karakter alfanumerik)
-- Bu bir kerelik migration — yeni kullanicilar icin trigger oluturacagiz
UPDATE profiles
SET referral_code = UPPER(SUBSTR(MD5(RANDOM()::TEXT || id::TEXT), 1, 8))
WHERE referral_code IS NULL;

-- Yeni kullanicilara otomatik referral_code ata
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := UPPER(SUBSTR(MD5(RANDOM()::TEXT || NEW.id::TEXT), 1, 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_referral_code ON profiles;
CREATE TRIGGER trg_referral_code
  BEFORE INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION generate_referral_code();
