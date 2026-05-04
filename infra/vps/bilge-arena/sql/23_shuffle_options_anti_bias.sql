-- =============================================================================
-- Bilge Arena Oda Sistemi: 23_shuffle_options_anti_bias (KRITIK BUG FIX 2)
-- =============================================================================
-- Hedef: questions.content.answer field bias'i (paragraf %1 A vs %44 C) icin
--        per-round options array shuffle + answer index update.
--
-- Kullanici raporu: "hep bc sikki dogru olabilir mi" — paragraf kategorisinde
-- A sikki sadece %1, B %40, C %44, D %12. Soru kalitesi problemi (AI seed
-- bias'i muhtemelen). Sorularin orijinal options sirasi DB'de boyle import
-- edilmis.
--
-- ROOT CAUSE: questions tablosunda her kategoride answer dagilimi dengesiz:
--   paragraf:   3 A (%1)  / 128 B (%40) / 140 C (%44) / 39 D (%12) / 10 diger
--   geometri:  29 A (%10) /  64 B (%23) / 144 C (%51) / 43 D (%15) /  3 diger
--   problemler:19 A (%7)  /  65 B (%23) / 157 C (%56) / 40 D (%14) /  0 diger
--   ...tum kategoriler benzer: hep B/C agirlikli
--
-- ANLIK COZUM: _pre_create_rounds'da her soru icin question_content_snapshot
-- olarak kopyalanmadan ONCE options[] array shuffle, answer index yeni
-- pozisyona update. Snapshot frozen olur, bot+user ayni shuffled veriyi
-- gorur (anti-cheat korunur).
--
-- LONG-TERM TODO: questions tablosundaki orijinal options dagilimini
-- duzelt (manuel review veya AI re-generation). Bu fix anlik UX duzeltmesi.
--
-- Plan-deviations:
--   #122 (yeni): _shuffle_question_options(content) IMMUTABLE helper fn —
--       AMA NOT IMMUTABLE because random() VOLATILE. STABLE bile degil.
--       VOLATILE marker (default).
--   #123 (yeni): Shuffle = unnest + array_agg ORDER BY random() pattern.
--       options[] -> array_agg(... ORDER BY random()).
--   #124 (yeni): Answer index migration: orijinal answer text bul, shuffled
--       array'da yeni position'i hesapla, content.answer guncelle.
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/23_shuffle_options_anti_bias.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- 1) Helper: _shuffle_question_options
-- =============================================================================
-- Input:  content JSONB {question, options:[a,b,c,d], answer:"1", ...}
-- Output: shuffled JSONB {question, options:[shuffled], answer:"new_idx", ...}
-- Other content fields (explanation, etc) korunur.
--
-- Anti-cheat: snapshot frozen at round_start, bot ve user ayni shuffled seti
-- gorur. Match.
CREATE OR REPLACE FUNCTION public._shuffle_question_options(
  p_content JSONB
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE  -- random() volatile, fn de volatile
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_options       TEXT[];
  v_options_count INT;
  v_answer_idx    INT;
  v_correct_text  TEXT;
  v_shuffled      TEXT[];
  v_new_idx       INT;
BEGIN
  -- options[] tekstini array'e cevir
  SELECT array_agg(elem) INTO v_options
  FROM jsonb_array_elements_text(p_content->'options') AS elem;

  v_options_count := array_length(v_options, 1);

  -- Eski answer index (0-based string)
  v_answer_idx := (p_content->>'answer')::INT;

  -- Bound check (corrupt data guard)
  IF v_answer_idx < 0 OR v_answer_idx >= v_options_count THEN
    -- Shuffle yapilamaz, original return
    RETURN p_content;
  END IF;

  -- Dogru cevabin TEXT'i (orijinal pozisyonda)
  v_correct_text := v_options[v_answer_idx + 1];  -- PG array 1-based

  -- Shuffle
  SELECT array_agg(elem ORDER BY random()) INTO v_shuffled
  FROM unnest(v_options) AS elem;

  -- Yeni answer index (shuffled array'da correct_text'in pozisyonu)
  SELECT (i - 1) INTO v_new_idx
  FROM generate_subscripts(v_shuffled, 1) AS i
  WHERE v_shuffled[i] = v_correct_text
  LIMIT 1;

  -- Defensive: index bulunamadiysa orijinal return
  IF v_new_idx IS NULL THEN
    RETURN p_content;
  END IF;

  -- Yeni content (options shuffled + answer index updated)
  RETURN jsonb_set(
    jsonb_set(p_content, '{options}', to_jsonb(v_shuffled)),
    '{answer}',
    to_jsonb(v_new_idx::TEXT)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public._shuffle_question_options(JSONB) FROM PUBLIC;

-- =============================================================================
-- 2) _pre_create_rounds CREATE OR REPLACE — shuffle entegrasyonu
-- =============================================================================
-- 22'deki DISTINCT ON content->>'question' fix'i KORUNUR (duplicate engeli).
-- Yeni: _shuffle_question_options(content) ile per-round random A/B/C/D dagilimi.
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

  WITH uniq AS (
    SELECT DISTINCT ON (content->>'question') id, content
    FROM public.questions
    WHERE category = v_room.category
      AND difficulty = v_room.difficulty
      AND is_active = TRUE
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
    -- KRITIK FIX 2: per-round shuffle, A/B/C/D bias engeli
    public._shuffle_question_options(content),
    p_started_at,
    p_started_at + (v_room.per_question_seconds || ' seconds')::INTERVAL
  FROM ordered
  WHERE pos <= v_room.question_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._pre_create_rounds(UUID, TIMESTAMPTZ) FROM PUBLIC;

COMMIT;
