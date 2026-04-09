-- Migration 019: Onboarding sistemi
-- Yeni kullanicilar icin ilk giris rehberi.

-- Mevcut kullanicilari etkilememesi icin DEFAULT false
-- ama migration sonunda mevcut kullanicilar TRUE yapilacak
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- Mevcut kullanicilar zaten onboarding gormus sayilir
UPDATE profiles SET onboarding_completed = true WHERE onboarding_completed IS NULL OR onboarding_completed = false;

-- Bundan sonra yeni kayitlar false ile baslar (DEFAULT)
-- Onboarding tamamlaninca API ile true yapilir
