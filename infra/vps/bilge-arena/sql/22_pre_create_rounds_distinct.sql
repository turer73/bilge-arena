-- =============================================================================
-- Bilge Arena Oda Sistemi: 22_pre_create_rounds_distinct (KRITIK BUG FIX)
-- =============================================================================
-- Hedef: _pre_create_rounds fonksiyonunu DISTINCT ON (content->>'question')
--        ile guncelle. questions tablosunda her kategoride duplicate content
--        var (paragraf 320 satir / 120 essiz / 200 duplicate). random() ile
--        cekilen N soru ayni icerikten birden fazla satir alabiliyordu —
--        ayni oda'da ayni soru iki round'da gozukurdu.
--
-- Kullanici raporu: "bir soru iki sefer cikti" + "her girdiğimde ayni sorular"
--
-- ROOT CAUSE: questions tablosundaki duplicate content (kategoriye gore
-- 35-200 duplicate). Mevcut _pre_create_rounds:
--   SELECT id, content, ROW_NUMBER() OVER (ORDER BY random()) AS pos
--   FROM questions WHERE category=X AND difficulty=Y AND is_active=TRUE
-- Pool 320 satir (paragraf) ama sadece 120 essiz; random selection ayni
-- content'ten 2 farkli id secip ayni soruyu 2 round'da yerlestiriyor.
--
-- COZUM: DISTINCT ON (content->>'question') pre-filter ile her essiz soru
-- icin SADECE 1 satir secilir, sonra random siralama. Duplicate engellenmis.
--
-- LONG-TERM TODO: questions tablosundaki duplicate'leri DELETE + UNIQUE
-- constraint (UNIQUE(game, category, content->>'question')) — ayri PR.
-- Bu fix anlik UX duzeltmesi.
--
-- Plan-deviations:
--   #120 (yeni): DISTINCT ON content->>'question' ile pre-filter.
--       JSONB extraction her satira IMMUTABLE, planner index kullanmaz
--       ama 1000 satir scope'unda kabul edilebilir performance.
--   #121 (yeni): Random selection sirasinda ORDER BY random() oncesi
--       DISTINCT ON ile uniqueness saglanir. Pool=120 essiz, question_count=5
--       icin 120/5 farkli kombinasyon, "her seferinde ayni" hissi azalir.
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/22_pre_create_rounds_distinct.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION public._pre_create_rounds(
  p_room_id UUID,
  p_started_at TIMESTAMPTZ
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
BEGIN
  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oda bulunamadi: %', p_room_id USING ERRCODE = 'P0002';
  END IF;

  -- Bug fix #120: DISTINCT ON (content->>'question') pre-filter ile her
  -- essiz soru icin SADECE 1 satir. CTE 2 asamali:
  --   1. uniq: distinct content->>'question' uzerinden ilk match (id, content)
  --   2. ordered: uniq icinden ROW_NUMBER OVER (ORDER BY random())
  WITH uniq AS (
    SELECT DISTINCT ON (content->>'question') id, content
    FROM public.questions
    WHERE category = v_room.category
      AND difficulty = v_room.difficulty
      AND is_active = TRUE
    -- DISTINCT ON tie-breaker: id ASC (deterministik, ama essiz icerik
    -- birden fazla id'den herhangi birini secmek mantikli)
    ORDER BY content->>'question', id
  ),
  ordered AS (
    SELECT id, content,
           ROW_NUMBER() OVER (ORDER BY random())::SMALLINT AS pos
    FROM uniq
  )
  INSERT INTO public.room_rounds
    (room_id, round_index, question_id, question_content_snapshot,
     started_at, ends_at)
  SELECT
    p_room_id,
    pos,
    id,
    content,
    p_started_at,
    p_started_at + (v_room.per_question_seconds || ' seconds')::INTERVAL
  FROM ordered
  WHERE pos <= v_room.question_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._pre_create_rounds(UUID, TIMESTAMPTZ) FROM PUBLIC;

COMMIT;
