-- ============================================================
-- Migration 056: preferred_theme check constraint genişletme
-- 4 yeni koyu tema: okyanus, orman, gunbatimi, mor-gece
-- ============================================================

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_preferred_theme_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_preferred_theme_check
  CHECK (preferred_theme IN ('dark', 'light', 'okyanus', 'orman', 'gunbatimi', 'mor-gece'));
