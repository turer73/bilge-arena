-- ============================================================
-- Migration 038: wordquest level_tag temizligi + C2 drift cleanup
-- ============================================================
-- 2026-04-26 (Tier C+) durust kapanis: iki kucuk veri tutarsizligi
-- gideriliyor.
--
-- 1) BACKFILL: wordquest'in 5 satirinda level_tag NULL.
--    - Tier B (2026-04-25) /api/admin/generate-questions route'una
--      level_tag form alanini eklerken, mevcut satirlardaki NULL'lar
--      backfill edilmedi. is_active=true wordquest 640 satirinin
--      635'inde tag var (B2:364, B1:85, C1:186); 5'i NULL.
--    - B2 default seciliyor cunku route da default'u B2 (mevcut 364
--      satirin orani %57); en istatistiksel guvenli atama.
--
-- 2) DELETE: 5 C2 EN-solution drift satiri kaldiriliyor.
--    - 2026-04-26T08:17:04 batch'inde Gemini Tier C oncesi prompt
--      etkisinde tum 5 vocabulary C2 sorusu icin "Undaunted, meaning
--      not intimidated...", "Veiled means not expressed directly..."
--      gibi tamamen Ingilizce solution uretti (drift gozlemi).
--    - Manuel TR cevirisi mevcut bir paterne hizmet etmiyor; Tier C
--      prompt fix'i sonrasi yeni C2 batch dogru solution ureticek.
--    - Sunk-cost fallacy'den kacinma karari.
--
-- Idempotent: bu migration tekrar tekrar uygulanabilir (sadece ilk
-- calismada etki eder, sonrasinda WHERE filtreleri 0 satir doner).
--
-- Tek surum hakikat: Bu migration, route.ts'in level_tag default
-- davranisi (B2 wordquest icin) ve Tier C drift fix'i ile uyumludur.
-- ============================================================

-- 1) NULL level_tag backfill (sadece wordquest, sadece NULL)
UPDATE questions
SET    level_tag = 'B2',
       updated_at = NOW()
WHERE  game = 'wordquest'
  AND  level_tag IS NULL;

-- 2) C2 EN-solution drift cleanup
-- KRITIK FILTRELER: hata payi olmamasi icin uc tum kosul birlikte:
--   - game='wordquest' AND level_tag='C2': sadece C2 wordquest
--   - is_active=false: aktif sorular (manuel review gecmis) korunur
--   - source='ai_generated': sadece AI uretimi, manuel girilenler korunur
--   - created_at: 2026-04-26 batch'i hedeflemek icin tarih sinirlamasi
DELETE FROM questions
WHERE  game = 'wordquest'
  AND  level_tag = 'C2'
  AND  is_active = false
  AND  source = 'ai_generated'
  AND  created_at >= '2026-04-26 08:00:00+00'
  AND  created_at <  '2026-04-26 09:00:00+00';

-- ============================================================
-- Beklenen etki (uygulamadan onceki snapshot 2026-04-26T08:18):
--   UPDATE: 5 satir (wordquest level_tag NULL -> B2)
--   DELETE: 5 satir (wordquest C2 inactive ai_generated 2026-04-26)
-- ============================================================
