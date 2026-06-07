-- ============================================================
-- Migration 061: Sınav türü tercihi (YKS / LGS)
-- profiles.exam_type: kullanıcının hedef sınavı.
--   'yks' = Üniversite (TYT/AYT), 'lgs' = Lise.
--   NULL = belirlenmemiş -> uygulama YKS-default davranır (geriye uyumlu).
-- İçerik (oyun listesi + soru exam_ref default'u) bu tercihe göre filtrelenir.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS exam_type TEXT
  CHECK (exam_type IN ('yks', 'lgs'));

COMMENT ON COLUMN profiles.exam_type IS
  'Hedef sınav türü: yks (üniversite) | lgs (lise). NULL = belirlenmemiş (YKS-default).';
