-- =============================================================================
-- Bilge Arena Oda Sistemi: 10_lobby_preview_question migration (Sprint 2A Task 2)
-- =============================================================================
-- Hedef: Lobby beklerken host engage edici "Aklinda Tut" widget icin
--        random 1 soru cek (anti-cheat: correct_answer DONDURULMEZ).
--          - get_lobby_preview_question(p_category) RPC
--          - SECURITY INVOKER (kullanicinin authenticated rolu yetisir)
--          - REVOKE PUBLIC + GRANT authenticated
--
-- Plan referansi: docs/plans/2026-05-01-sprint2-dwell-time-improvements.md
--                 Task 2 (Lobby auto-question widget, +40sn dwell)
--
-- Plan-deviations:
--   #62 (yeni): Anti-cheat tradeoff. Plan "ayri preview pool" diyordu ama
--       gercek questions havuzu MVP kabul (daha az seeding cabasi). Risk:
--       preview sorusu sonradan oyunda cikabilir (~%1-5, havuz 3719 soru).
--       Cozum yetersizse Sprint 2D'de questions.is_lobby_only kolonu eklenir.
--   #63 (yeni): RPC SECURITY INVOKER (auth.uid() not used). questions tablosu
--       RLS yok (read-only, anti-cheat view ile korunur). Bu RPC anti-cheat
--       view'a paralel calisir — sadece question + options doner.
--   #64 (yeni): ORDER BY RANDOM() LIMIT 1 query plan icin OK (3719 satir
--       seq scan ~5ms). Buyuk havuzda (>100K) tablesample veya offset-random
--       gerekebilir, MVP'de yeterli.
--
-- Kalitim plan-deviations:
--   #43 (PR2b): Question content JSONB sema {question, options, answer}
--       chk_content_required_fields zorunlu kilar. answer alani DONDURULMEZ
--       (anti-cheat sift), sadece question + options.
--   #53: REVOKE PUBLIC + GRANT authenticated (privilege hardening)
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/10_lobby_preview_question.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- get_lobby_preview_question: rastgele soru (anti-cheat: answer haric)
-- =============================================================================
-- Returns: JSONB {question: text, options: text[]} VEYA NULL (kategori bos ise)
-- Caller authenticated, anti-cheat sift correct_answer dondurmez.
CREATE OR REPLACE FUNCTION public.get_lobby_preview_question(p_category TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  SELECT jsonb_build_object(
    'question', q.content->>'question',
    'options', q.content->'options'
  )
  FROM public.questions q
  WHERE q.is_active = TRUE
    AND q.category = p_category
  ORDER BY RANDOM()
  LIMIT 1;
$$;

-- Privilege hardening (#53 kalitim)
REVOKE EXECUTE ON FUNCTION public.get_lobby_preview_question(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lobby_preview_question(TEXT) TO authenticated;

COMMIT;
