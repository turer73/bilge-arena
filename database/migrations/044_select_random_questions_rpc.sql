-- Migration 044: select_random_questions RPC (gercek random fetch)
--
-- Sorun:
--   src/lib/supabase/questions.ts:83 .limit(150) PostgREST default order'la
--   (deterministic, index siralamasi) hep ayni ilk 150 sorunlugu cekiyor.
--   2697 aktif soru havuzunda 1513 (yuzde 56) hic oyunda gosterilmedi.
--
-- Gecici fix (PR #ayni branch):
--   Random offset penceresi — count al, rand(0..max_offset) ile range cek.
--   Pool yavasca rotate eder ama yine pencere icindeyiz; tam random degil.
--
-- Kalici cozum (bu migration):
--   SECURITY DEFINER RPC select_random_questions(...) — server-side ORDER BY random()
--   + RLS bypass icin definer (function owner postgres), authenticated EXECUTE.
--   Anon EXECUTE REVOKE'lu (migration 041 pattern).
--
-- Performans notu:
--   ORDER BY random() seq-scan'li ama 2697 row icin <50ms (Supabase free tier
--   PG instance). 10K+ scale icin TABLESAMPLE BERNOULLI gerekebilir, su an
--   problem degil.

BEGIN;

CREATE OR REPLACE FUNCTION public.select_random_questions(
  p_game         text,
  p_limit        int  DEFAULT 10,
  p_category     text DEFAULT NULL,
  p_difficulty   int  DEFAULT NULL,
  p_exclude_ids  uuid[] DEFAULT NULL
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
    AND (p_category IS NULL OR category = p_category)
    AND (p_difficulty IS NULL OR difficulty = p_difficulty)
    AND (p_exclude_ids IS NULL OR id <> ALL(p_exclude_ids))
  ORDER BY random()
  LIMIT GREATEST(1, LEAST(p_limit, 100));
$$;

COMMENT ON FUNCTION public.select_random_questions IS
  'Gercek server-side random soru cekme. ORDER BY random() ile tum aktif havuzdan ucretsiz tier 100 limit.';

-- Authenticated kullanici EXECUTE (RLS bypass: SECURITY DEFINER + is_active filter ic kontrol)
REVOKE ALL ON FUNCTION public.select_random_questions(text, int, text, int, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.select_random_questions(text, int, text, int, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.select_random_questions(text, int, text, int, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.select_random_questions(text, int, text, int, uuid[]) TO service_role;

COMMIT;
