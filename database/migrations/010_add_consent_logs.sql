-- ============================================================
-- Migration 010: Consent / KVKK riza kayit tablosu
-- ============================================================
-- KVKK m.5 geregi acik riza kaniti saklamak icin audit log.
-- Her onay degisikligi yeni bir satir INSERT eder (UPDATE yok).
-- ============================================================

CREATE TABLE IF NOT EXISTS consent_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  consent_type text NOT NULL CHECK (consent_type IN ('cookie', 'terms', 'kvkk')),
  consent_value jsonb NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Index: kullaniciya gore sorgulama
CREATE INDEX IF NOT EXISTS idx_consent_logs_user_id ON consent_logs(user_id);

-- Index: tipe gore filtreleme
CREATE INDEX IF NOT EXISTS idx_consent_logs_type ON consent_logs(consent_type);

-- RLS: Kullanici sadece kendi kayitlarini gorebilir
ALTER TABLE consent_logs ENABLE ROW LEVEL SECURITY;

-- Herkes INSERT yapabilir (anonim cerez onaylari icin de)
CREATE POLICY "Anyone can insert consent logs"
  ON consent_logs FOR INSERT
  WITH CHECK (true);

-- Kullanici sadece kendi kayitlarini okuyabilir
CREATE POLICY "Users can read own consent logs"
  ON consent_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Admin tum kayitlari gorebilir (KVKK denetimi icin)
-- Not: Bu policy'yi admin role'unuze gore ayarlayin
-- CREATE POLICY "Admins can read all consent logs"
--   ON consent_logs FOR SELECT
--   USING (
--     EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
--   );
