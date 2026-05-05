-- =============================================================================
-- Bilge Arena: 24_questions_duplicate_cleanup (KALICI DATA QUALITY FIX)
-- =============================================================================
-- Hedef: questions tablosundaki duplicate content cleanup + UNIQUE constraint.
--        PR #105'te anlik fix (DISTINCT ON + shuffle) yapildi ama duplicate'ler
--        DB'de kalmaya devam etti. Bu migration kalici cozum:
--          - Duplicate row'lari DELETE (master row korunur)
--          - times_answered + times_correct stat'lar master row'a SUM merge
--          - Partial UNIQUE INDEX (is_active=TRUE) -> gelecek duplicate engel
--
-- Production durum (cleanup oncesi):
--   17/18 kategoride %50-64 duplicate (sosyoloji haric)
--   Toplam ~3145 satir, ~1268 essiz, ~1877 silinecek
--
-- Master row stratejisi: PARTITION BY (game, category, content->>'question')
-- ORDER BY id ASC, ROW_NUMBER()=1 master. Diger ROW_NUMBER>1 silinir.
--
-- Stat preservation: master row'un times_answered + times_correct'i
-- duplicate'lerin SUM'i ile update.
--
-- Plan referansi: PR #105 long-term TODO ('questions tablosundan duplicate
-- DELETE + UNIQUE constraint' — anlik DISTINCT ON + shuffle yerine kalici).
--
-- Plan-deviations:
--   #130 (yeni): Master row MIN(id) — deterministik. Stat aggregation SUM
--       (basit toplam, weighted average degil).
--   #131 (yeni): Partial UNIQUE INDEX is_active=TRUE filter. Inactive row'lar
--       UNIQUE'ten muaf (geri yuklenebilir/disable edilmis duplicate'ler dert
--       degil, sadece aktif soru havuzu temiz).
--   #132 (yeni): UNIQUE INDEX on (game, category, content->>'question'). Game
--       acidan ayni soru farkli kategoride olabilir (theoric); UNIQUE 3-tuple
--       generic.
--
-- Calistirma:
--   ssh root@100.126.113.23 'docker exec panola-postgres pg_dump -U bilge_arena_app
--     -d bilge_arena_dev -t public.questions --data-only > /root/backups/...'
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/24_questions_duplicate_cleanup.sql
--
-- Test: 24_questions_duplicate_cleanup_test.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- 1) Stat merge: master row'un stat'larini duplicate'lerin SUM'iyle update
-- =============================================================================
-- Master = MIN(id) per (game, category, content->>'question') aktif duplicate.
-- Stat aggregation sum: master.times_answered = SUM(all duplicates incl master).
WITH duplicate_groups AS (
  SELECT
    game,
    category,
    content->>'question' AS qtext,
    -- PG'de MIN(uuid) yok — array_agg ORDER BY ile deterministik master id
    (ARRAY_AGG(id ORDER BY id))[1] AS master_id,
    SUM(times_answered) AS sum_answered,
    SUM(times_correct) AS sum_correct,
    count(*) AS dup_count
  FROM public.questions
  WHERE is_active = TRUE
  GROUP BY game, category, content->>'question'
  HAVING count(*) > 1
)
UPDATE public.questions q
SET
  times_answered = dg.sum_answered,
  times_correct = dg.sum_correct,
  updated_at = NOW()
FROM duplicate_groups dg
WHERE q.id = dg.master_id;

-- =============================================================================
-- 2) Duplicate row'lari DELETE (master OLMAYAN aktif row'lar)
-- =============================================================================
-- ROW_NUMBER ile master = 1, diger > 1 duplicates.
-- Inactive row'lar dokunulmaz (is_active=FALSE filter).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY game, category, content->>'question'
      ORDER BY id
    ) AS rn
  FROM public.questions
  WHERE is_active = TRUE
)
DELETE FROM public.questions
WHERE id IN (
  SELECT id FROM ranked WHERE rn > 1
);

-- =============================================================================
-- 3) Partial UNIQUE INDEX: gelecek duplicate engel
-- =============================================================================
-- (game, category, content->>'question') tuple UNIQUE — sadece is_active=TRUE
-- row'lar arasinda. Inactive row'lar (geri yuklenebilir/disable) UNIQUE'ten
-- muaf, sadece aktif soru havuzu duplicate-free.
DROP INDEX IF EXISTS public.uniq_questions_active_content_idx;
CREATE UNIQUE INDEX uniq_questions_active_content_idx
  ON public.questions (game, category, (content->>'question'))
  WHERE is_active = TRUE;

COMMIT;

-- =============================================================================
-- Post-cleanup verify (manuel run)
-- =============================================================================
-- SELECT category, count(*) as toplam, count(DISTINCT content->>'question') as essiz
-- FROM public.questions WHERE is_active=TRUE GROUP BY category;
--
-- Beklenen: toplam == essiz (her kategoride duplicate=0)
-- =============================================================================
