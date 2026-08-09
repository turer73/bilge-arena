-- Migration 107: TYT soru kapsamı bütünlüğü
--
-- 05/08/2026 kullanıcı geri bildirimi: "TYT Biyoloji seçiyorum, AYT geliyor".
-- 046, migration anındaki NULL exam_ref satırlarını TYT olarak backfill etti;
-- ancak daha sonra çalışan ai_gemini_tyt üreticileri exam_ref yazmadığı için yeni
-- NULL kayıtlar oluşabildi. Yalnız kaynağı açıkça TYT olan satırlar güvenle
-- onarılır; bilinmeyen kaynaklara kör NULL -> TYT dönüşümü yapılmaz.

BEGIN;

UPDATE public.questions
SET exam_ref = 'TYT'
WHERE exam_ref IS NULL
  AND source = 'ai_gemini_tyt';

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.questions'::regclass
      AND conname = 'questions_ai_gemini_tyt_exam_ref_check'
  ) THEN
    ALTER TABLE public.questions
      ADD CONSTRAINT questions_ai_gemini_tyt_exam_ref_check
      CHECK (
        source IS DISTINCT FROM 'ai_gemini_tyt'
        OR exam_ref IS NOT DISTINCT FROM 'TYT'
      )
      NOT VALID;
  END IF;
END;
$migration$;

ALTER TABLE public.questions
  VALIDATE CONSTRAINT questions_ai_gemini_tyt_exam_ref_check;

COMMIT;
