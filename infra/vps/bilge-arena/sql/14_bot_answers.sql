-- =============================================================================
-- Bilge Arena Oda Sistemi: 14_bot_answers migration (Sprint 2B Task 4 PR2)
-- =============================================================================
-- Hedef: Solo mode bot rakipleri AKTIF cevap versin (Sprint 2A T4 PR1
-- skeleton'i canlandirir). Trigger + helper RPC + RLS policy paterni.
--
--          - room_answers_insert_bot RLS policy (RLS bypass alternatif yerine
--             policy ekleyerek)
--          - _submit_bot_answers_for_round(p_room_id, p_round_index) helper
--             SECURITY DEFINER + OWNER bilge_arena_app
--          - trg_bot_answers_on_round_start AFTER UPDATE OF started_at
--             yeni round basladiginda bot answers otomatik insert
--
-- Plan referansi: docs/plans/2026-05-01-sprint2-dwell-time-improvements.md
--                 Task 4 (Solo mode dwell 0:45 -> 4:30, bot cevap logic)
--
-- Bot AI (MVP)
-- - Difficulty-based accuracy:
--     1-2: %80 dogru
--     3:   %70 dogru
--     4-5: %60 dogru
-- - response_ms: 5000-15000 random (humanlike, bir saniye gec/erken)
-- - Yanlis cevap: options array'inden random non-correct sec
--
-- Plan-deviations:
--   #86 (yeni): RLS policy yaklasimi (BYPASSRLS gerekmez). Trigger DEFINER
--       + OWNER bilge_arena_app FORCE RLS aciksa bypass etmez. Yeni policy
--       room_answers_insert_bot WITH CHECK EXISTS room_members is_bot=TRUE.
--       Trigger içinden auth.uid()=host iken bot user_id satiri insert eder,
--       policy bot member dogrular.
--   #87 (yeni): Bot answer logic basit MVP — questions difficulty kullanir
--       ama daha gelismis (kategori-spesifik, soru-spesifik) ileride.
--   #88 (yeni): Yanlis cevap rastgele options'dan secim — duplicate'siz.
--       Eger options 2 elemanli ve bot yanlis cevap secse hep ayni wrong
--       (50% case). Daha cok options ile dagilim adil.
--   #89 (yeni): Trigger AFTER UPDATE OF started_at — round basladiktan sonra.
--       Onceki started_at NULL'dan NOT NULL'a gectiginde tetikle.
--       advance_round modify edilmez (mevcut RPC dokunulmaz, plan-deviation
--       #88 kalitim).
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/14_bot_answers.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- 1) RLS policy: room_answers_insert_bot (#86 plan-deviation)
-- =============================================================================
-- Mevcut room_answers_insert_self_active policy: WITH CHECK (user_id=auth.uid())
-- Bot satirlari user_id=auth.uid() degil — yeni policy gerek.
DROP POLICY IF EXISTS room_answers_insert_bot ON public.room_answers;
CREATE POLICY room_answers_insert_bot
  ON public.room_answers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = room_answers.room_id
        AND rm.user_id = room_answers.user_id
        AND rm.is_bot = TRUE
        AND rm.is_active = TRUE
    )
    AND points_awarded = 0
    AND is_correct IS NULL
  );

-- =============================================================================
-- 2) Helper function: _submit_bot_answers_for_round
-- =============================================================================
-- Trigger tarafindan cagrilir. Loop bot members + random answer + INSERT.
-- Anti-cheat: points_awarded=0, is_correct=NULL — reveal_round/auto_relay_tick
-- reveal sirasinda compute eder (gercek user paterni).
CREATE OR REPLACE FUNCTION public._submit_bot_answers_for_round(
  p_room_id UUID,
  p_round_index SMALLINT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_round    public.room_rounds%ROWTYPE;
  v_room     public.rooms%ROWTYPE;
  v_bot      RECORD;
  v_options  JSONB;
  v_correct  TEXT;
  v_options_count INT;
  v_answer   TEXT;
  v_accuracy NUMERIC;
  v_response_ms INT;
  v_wrong_idx INT;
BEGIN
  -- Round + Room fetch
  SELECT * INTO v_round
  FROM public.room_rounds
  WHERE room_id = p_room_id AND round_index = p_round_index;
  IF NOT FOUND OR v_round.started_at IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Question content snapshot'tan correct + options al
  v_correct := v_round.question_content_snapshot->>'answer';
  v_options := v_round.question_content_snapshot->'options';

  IF v_correct IS NULL OR v_options IS NULL OR jsonb_typeof(v_options) <> 'array' THEN
    -- Question content corrupted, bot atla
    RETURN;
  END IF;

  v_options_count := jsonb_array_length(v_options);
  IF v_options_count < 2 THEN
    RETURN;
  END IF;

  -- Difficulty-based accuracy (#87 plan-deviation)
  v_accuracy := CASE
    WHEN v_room.difficulty <= 2 THEN 0.80
    WHEN v_room.difficulty = 3 THEN 0.70
    ELSE 0.60
  END;

  -- Loop active bot members (skip if zaten cevap vermisse — UNIQUE constraint)
  FOR v_bot IN
    SELECT rm.user_id
    FROM public.room_members rm
    WHERE rm.room_id = p_room_id
      AND rm.is_bot = TRUE
      AND rm.is_active = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM public.room_answers ra
        WHERE ra.round_id = v_round.id
          AND ra.user_id = rm.user_id
      )
  LOOP
    -- Random correct or incorrect (#87)
    IF random() < v_accuracy THEN
      v_answer := v_correct
    ELSE
      -- Pick random wrong option (#88)
      LOOP
        v_wrong_idx := floor(random() * v_options_count)::INT;
        v_answer := v_options->>v_wrong_idx;
        EXIT WHEN v_answer IS NOT NULL AND v_answer <> v_correct;
      END LOOP;
    END IF;

    -- response_ms: 5000-15000 random (humanlike)
    v_response_ms := 5000 + floor(random() * 10001)::INT;

    -- INSERT (RLS policy room_answers_insert_bot uygulanir)
    INSERT INTO public.room_answers
      (room_id, round_id, user_id, answer_value, response_ms,
       is_correct, points_awarded)
    VALUES
      (p_room_id, v_round.id, v_bot.user_id, v_answer, v_response_ms,
       NULL, 0);
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._submit_bot_answers_for_round(UUID, SMALLINT) FROM PUBLIC;
-- Trigger sadece authenticated cagrisindan tetiklenir, GRANT yok (helper).

-- =============================================================================
-- 3) Trigger: AFTER UPDATE OF started_at ON room_rounds (#89 plan-deviation)
-- =============================================================================
-- Yeni round started — bot answers otomatik insert
CREATE OR REPLACE FUNCTION public._bot_answers_round_start_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Sadece started_at NULL'dan NOT NULL'a gectiginde tetikle
  -- (advance_round bootstrap veya next round)
  IF (OLD.started_at IS NULL OR OLD.started_at <> NEW.started_at)
     AND NEW.started_at IS NOT NULL
     AND NEW.revealed_at IS NULL THEN
    PERFORM public._submit_bot_answers_for_round(NEW.room_id, NEW.round_index);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bot_answers_on_round_start ON public.room_rounds;
CREATE TRIGGER trg_bot_answers_on_round_start
  AFTER UPDATE OF started_at ON public.room_rounds
  FOR EACH ROW
  EXECUTE FUNCTION public._bot_answers_round_start_trigger();

COMMIT;
