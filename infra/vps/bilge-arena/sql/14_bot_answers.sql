-- =============================================================================
-- Bilge Arena Oda Sistemi: 14_bot_answers migration (Sprint 2B Task 4 PR2)
-- =============================================================================
-- Hedef: Solo mode bot rakipleri AKTIF cevap versin (Sprint 2A T4 PR1
-- skeleton'i canlandirir). Trigger + helper RPC paterni.
--
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
--   #86 (yeni): Bot insert RLS bypass — bilge_arena_app BYPASSRLS attribute
--       (0b_authenticated_role_membership.sql:57). SECURITY DEFINER trigger
--       FORCE RLS tablosuna policy mate-eden olmadan insert eder. Yeni RLS
--       policy gerekmez (auto_relay_tick reveal/score updateleri ayni paterni
--       kullanir, room_audit_log inserti da ayni). Anti-cheat: helper sadece
--       bot members (is_bot=TRUE) icin INSERT eder, gercek user user_id'leri
--       kullanmaz. Defense-in-depth: function REVOKE'lu, sadece trigger
--       icinden cagrilir.
--   #87 (yeni): Bot answer logic basit MVP — questions difficulty kullanir
--       ama daha gelismis (kategori-spesifik, soru-spesifik) ileride.
--   #88 (yeni): Yanlis cevap rastgele options'dan secim — duplicate'siz.
--       Eger options 2 elemanli ve bot yanlis cevap secse hep ayni wrong
--       (50% case). Daha cok options ile dagilim adil.
--   #89 (yeni): Trigger AFTER UPDATE OF started_at — round basladiktan sonra.
--       started_at NOT NULL kolonu (2_rooms.sql:163), start_room INSERT'te
--       deger atar. Trigger sadece UPDATE'te tetikler — INSERT cagrilmaz.
--       advance_round Case 1 (active(0)->active(1)) ve Case 2 (reveal->next)
--       started_at = NOW() UPDATE'i tetikleyici. advance_round modify edilmez
--       (mevcut RPC dokunulmaz, plan-deviation #88 kalitim).
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/14_bot_answers.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- 1) Helper function: _submit_bot_answers_for_round
-- =============================================================================
-- Trigger tarafindan cagrilir. Loop bot members + random answer + INSERT.
-- Anti-cheat: points_awarded=0, is_correct=NULL — reveal_round/auto_relay_tick
-- reveal sirasinda compute eder (gercek user paterni — submit_answer satiri
-- 161 ile birebir uyumlu).
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
  v_attempt INT;
BEGIN
  -- Round + Room fetch
  SELECT * INTO v_round
  FROM public.room_rounds
  WHERE room_id = p_room_id AND round_index = p_round_index;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Defensive: revealed_at NOT NULL ise atla (trigger zaten guard ediyor ama
  -- direct cagri korumasi).
  IF v_round.revealed_at IS NOT NULL THEN
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

  -- Loop active bot members (skip if zaten cevap vermisse — UNIQUE constraint
  -- room_answers (round_id, user_id))
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
      v_answer := v_correct;
    ELSE
      -- Pick random wrong option (#88) — bounded retry to avoid hot loop
      v_attempt := 0;
      v_answer := NULL;
      WHILE v_attempt < 10 LOOP
        v_wrong_idx := floor(random() * v_options_count)::INT;
        v_answer := v_options->>v_wrong_idx;
        EXIT WHEN v_answer IS NOT NULL AND v_answer <> v_correct;
        v_attempt := v_attempt + 1;
      END LOOP;
      -- Fallback: tum options correct ile esit ise (corrupt data)
      IF v_answer IS NULL OR v_answer = v_correct THEN
        v_answer := v_correct;
      END IF;
    END IF;

    -- response_ms: 5000-15000 random (humanlike)
    v_response_ms := 5000 + floor(random() * 10001)::INT;

    -- INSERT (FORCE RLS bilge_arena_app BYPASSRLS ile bypass — #86)
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
-- 2) Trigger: AFTER UPDATE OF started_at ON room_rounds (#89 plan-deviation)
-- =============================================================================
-- Yeni round started — bot answers otomatik insert.
-- started_at NOT NULL (2_rooms.sql:163) — INSERT'te value var, sadece UPDATE'te
-- degisir. AFTER UPDATE OF zaten INSERT'i atlar.
CREATE OR REPLACE FUNCTION public._bot_answers_round_start_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Sadece started_at gercekten degistiyse + revealed_at NULL ise tetikle.
  -- IS DISTINCT FROM NULL-safe equality (started_at NOT NULL kolonu olsa bile
  -- defensive).
  IF OLD.started_at IS DISTINCT FROM NEW.started_at
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
