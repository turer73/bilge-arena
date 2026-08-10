-- Migration 108: geçersiz exam_ref ve diakritikli kategori normalizasyonu
--
-- Keşif #1515 iki kusur bildirdi, ancak exam_ref tarafını eksik ölçtü: yalnızca
-- kategorisi DE kanonik-dışı olan 19 satırı saydı. Gerçek kapsam 130 aktif satır.
-- Kalan 111 satırın kategorisi zaten kanonik (fizik, paragraf, tarih, ...);
-- görünmez olmalarının tek sebebi exam_ref = 'YKS-TYT'. Geçerli exam_ref
-- değerleri: TYT, LGS, AYT-SAY, AYT-EA, AYT-SOZ, YDT (wordquest NULL kullanır,
-- level_tag modeline dayanır).
--
-- Bu migration YALNIZ ürün kararı içermeyen iki düzeltmeyi yapar:
--   1. exam_ref 'YKS-TYT' -> 'TYT'      (130 satır; YKS-TYT tanım gereği TYT'dir)
--   2. sosyal 'coğrafya' -> 'cografya'  (11 satır; kanonik liste ASCII slug)
--
-- BİLEREK KAPSAM DIŞI: cebir (53), veri (28), din_kulturu (13), inkılap_tarihi
-- (12), vatandaşlık (8) = 114 satır. Bunlar taksonomi kararı gerektiriyor
-- (hangi kanonik kategoriye katlanacak / hangisi listeye eklenecek) ve ayrı
-- PR'da ele alınacak. Bu dosya çalıştıktan sonra da kanonik-dışı kalırlar.

BEGIN;

-- Geri alınabilirlik: eski değerler kalıcı olarak kayda geçer. Yalnızca bu
-- migration'ın dokunduğu satırlar yazılır (2 UPDATE'in WHERE'i ile aynı küme).
CREATE TABLE IF NOT EXISTS public._backup_questions_taxonomy_20260810 (
  id           uuid PRIMARY KEY,
  old_exam_ref varchar(20),
  old_category varchar(50),
  backed_up_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

REVOKE ALL ON public._backup_questions_taxonomy_20260810 FROM PUBLIC, anon, authenticated;

INSERT INTO public._backup_questions_taxonomy_20260810 (id, old_exam_ref, old_category)
SELECT id, exam_ref, category
FROM public.questions
WHERE exam_ref = 'YKS-TYT'
   OR (game = 'sosyal' AND category = 'coğrafya')
ON CONFLICT (id) DO NOTHING;

-- 1) YKS-TYT -> TYT
UPDATE public.questions
SET exam_ref = 'TYT'
WHERE exam_ref = 'YKS-TYT';

-- 2) Diakritikli sosyal kategori -> kanonik ASCII slug
UPDATE public.questions
SET category = 'cografya'
WHERE game = 'sosyal' AND category = 'coğrafya';

-- Doğrulama: her iki kusur da sıfırlanmış olmalı, aksi halde migration geri alınır.
DO $migration$
DECLARE
  bad_exam_ref  integer;
  bad_category  integer;
  restored      integer;
BEGIN
  SELECT count(*) INTO bad_exam_ref
  FROM public.questions WHERE exam_ref = 'YKS-TYT';

  SELECT count(*) INTO bad_category
  FROM public.questions WHERE game = 'sosyal' AND category = 'coğrafya';

  SELECT count(*) INTO restored
  FROM public._backup_questions_taxonomy_20260810;

  IF bad_exam_ref <> 0 OR bad_category <> 0 THEN
    RAISE EXCEPTION 'Migration 108 dogrulama basarisiz: exam_ref=%, category=%',
      bad_exam_ref, bad_category;
  END IF;

  RAISE NOTICE 'Migration 108: % satir yedeklendi ve normalize edildi', restored;
END;
$migration$;

-- Tekrarı önle: exam_ref serbest metin olduğu için üreticiler (repo dışı
-- ai_sonnet_v1 partisi ve insert-new-questions.mjs pass-through'u) geçersiz
-- değer yazabiliyor ve sonuç sessizce görünmez soru oluyor. Kısıt, hatayı
-- insert anında yüksek sesle verir. 107'deki NOT VALID + VALIDATE deseni.
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.questions'::regclass
      AND conname = 'questions_exam_ref_allowed_check'
  ) THEN
    ALTER TABLE public.questions
      ADD CONSTRAINT questions_exam_ref_allowed_check
      CHECK (
        exam_ref IS NULL
        OR exam_ref IN ('TYT', 'LGS', 'AYT-SAY', 'AYT-EA', 'AYT-SOZ', 'YDT')
      )
      NOT VALID;
  END IF;
END;
$migration$;

ALTER TABLE public.questions
  VALIDATE CONSTRAINT questions_exam_ref_allowed_check;

COMMIT;

-- PostgREST şema önbelleği: kısıt eklendiği için tazelenmeli.
NOTIFY pgrst, 'reload schema';
