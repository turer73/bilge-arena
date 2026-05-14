-- Migration 046: select_random_questions RPC'ye p_exam_ref filtresi ekle
--
-- Motivasyon:
--   LGS ve AYT soru havuzları ekleniyor. Mevcut sorular exam_ref=NULL
--   (TYT varsayılan). Yeni LGS soruları exam_ref='LGS', AYT soruları
--   exam_ref='AYT-SAY' / 'AYT-EA' / 'AYT-SOZ' olarak eklenecek.
--
--   select_random_questions şu an exam_ref filtresi desteklemiyor;
--   NULL kontrolü olmadan LGS/TYT soruları birbirine karışır.
--
-- Değişiklik:
--   p_exam_ref TEXT DEFAULT NULL parametresi eklendi.
--   NULL → filtre yok (mevcut davranış korunur, geriye dönük uyumlu).
--   'LGS' → sadece LGS soruları.
--   'TYT' → sadece TYT (mevcut null + explicit TYT) soruları.
--
-- Geriye uyumluluk:
--   Mevcut çağrılar p_exam_ref vermez → NULL → tüm havuz (mevcut davranış).
--   TYT modunda p_exam_ref='TYT' gönderilirse yalnızca exam_ref='TYT'
--   olan sorular gelir. Mevcut NULL'lar dahil edilmez — bu kasıtlı:
--   yeni sorular explicit exam_ref ile eklenir, eski TYT soruları için
--   aşağıdaki BACKFILL çalıştırılır.
--
-- Backfill:
--   Mevcut tüm NULL exam_ref kayıtlar 'TYT' olarak işaretlenir.
--   (wordquest hariç — wordquest level_tag ile filtreleniyor, exam_ref gerekmez)

BEGIN;

-- 1) Mevcut TYT sorularını backfill (wordquest hariç)
UPDATE public.questions
SET    exam_ref = 'TYT'
WHERE  exam_ref IS NULL
  AND  game <> 'wordquest';

-- 2) RPC güncelle — p_exam_ref parametresi eklendi
CREATE OR REPLACE FUNCTION public.select_random_questions(
  p_game         text,
  p_limit        int     DEFAULT 10,
  p_category     text    DEFAULT NULL,
  p_difficulty   int     DEFAULT NULL,
  p_exclude_ids  uuid[]  DEFAULT NULL,
  p_exam_ref     text    DEFAULT NULL
)
RETURNS SETOF public.questions
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT *
  FROM public.questions
  WHERE is_active = TRUE
    AND game = p_game
    AND (p_category    IS NULL OR category  = p_category)
    AND (p_difficulty  IS NULL OR difficulty = p_difficulty)
    AND (p_exclude_ids IS NULL OR id <> ALL(p_exclude_ids))
    AND (p_exam_ref    IS NULL OR exam_ref   = p_exam_ref)
  ORDER BY random()
  LIMIT GREATEST(1, LEAST(p_limit, 100));
$$;

COMMENT ON FUNCTION public.select_random_questions IS
  'Gercek server-side random soru cekme. p_exam_ref ile TYT/LGS/AYT ayrisimi. Migration 046.';

-- Grant'lar aynı (migration 044 pattern)
REVOKE ALL ON FUNCTION public.select_random_questions(text, int, text, int, uuid[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.select_random_questions(text, int, text, int, uuid[], text) FROM anon;
GRANT EXECUTE ON FUNCTION public.select_random_questions(text, int, text, int, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.select_random_questions(text, int, text, int, uuid[], text) TO service_role;

COMMIT;
