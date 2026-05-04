-- =============================================================================
-- Bilge Arena Oda Sistemi: 19_async_bot migration (Async PR3 Faz D)
-- =============================================================================
-- Hedef: Async oda + bot member kombinasyonu icin per-bot otomatik cevap +
--        round advance. Trigger AFTER UPDATE OF current_round_index ON
--        room_members WHEN is_bot=TRUE: bot answer DB-instant insert,
--        member.score += points, advance to next round OR finished_at set.
--
-- DURUST UX RISKI (Faz D2'ye ertelendi): Trigger recursive ilerler — bot tum
-- round'lari TEK TRANSACTION'DA bitirir (DB'de instant). Frontend pretend-delay
-- UI animation gerekli ki kullanici "yarisi" hissedebilsin. Bu PR'da SADECE
-- DB-level trigger; frontend bot timing animation Faz D2 ayri is.
--
-- Faz A bilinen kisitlama (PR #99) bu trigger ile cozulur:
--   "Async oda + bot member = asla complete olmaz" → bot finished_at set ediyor,
--   all-finished trigger zincir tetikleyebilir.
--
-- Plan referansi: C:/Users/sevdi/.claude/plans/wondrous-questing-hedgehog.md
--                 Faz D
--
-- Plan-deviations:
--   #110 (yeni): Bot pretend-delay submitted_at = current_round_started_at +
--       response_ms. DB'de submitted_at sahte timing (instant insert, future
--       submitted_at). Frontend UI animation Faz D2'de bu submitted_at'i
--       kullanip "düşünüyor X sn..." gosterir.
--   #111 (yeni): Trigger recursive — bot tek transaction'da tum round'lari
--       bitirir. PostgreSQL default trigger recursion enabled (16 level limit),
--       max 30 round (chk_rooms_question_count) yeterli, stack overflow riski yok.
--   #112 (yeni): UNIQUE catch idempotent — bot zaten cevap verdiyse atla
--       (start_room async + 14_bot_answers eski trigger ile race ihtimali, ama
--       async oda'da 14 trigger AFTER UPDATE OF started_at ON room_rounds,
--       bu trigger AFTER UPDATE OF current_round_index ON room_members ile
--       cakismaz farkli table). Defensive guard.
--   #113 (yeni): Sync mod bot'lar 14_bot_answers (mevcut paterni) kullanir.
--       Bu trigger sadece async modda fire eder (room.mode check).
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/19_async_bot.sql
--
-- Test (apply sonrasi):
--   docker exec -i panola-postgres psql -U panola_admin -h localhost \
--     -d bilge_arena_dev -v ON_ERROR_STOP=on \
--     -f - < infra/vps/bilge-arena/sql/19_async_bot_test.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- 1) Bot async round handler trigger function
-- =============================================================================
-- Bot member.current_round_index UPDATE'inde fire — async modda otomatik
-- cevap + advance. Recursive: kendi UPDATE'i tekrar trigger fire eder, bot
-- final round'a kadar atlar (DB-instant). Final round'da finished_at set,
-- all-finished trigger (16_async_functions.sql) zincir tetikler.
CREATE OR REPLACE FUNCTION public._bot_async_round_handler()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_room          public.rooms%ROWTYPE;
  v_round         public.room_rounds%ROWTYPE;
  v_options       JSONB;
  v_correct       TEXT;
  v_answer        TEXT;
  v_options_count INT;
  v_wrong_idx     INT;
  v_attempt       INT;
  v_accuracy      NUMERIC;
  v_response_ms   INT;
  v_is_correct    BOOLEAN;
  v_points        INT;
  v_next          SMALLINT;
BEGIN
  -- Sadece bot members + round transition
  IF NEW.is_bot IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  -- Bot zaten finished_at set ise atla (zincir koruyucu)
  IF NEW.finished_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- Round 0 (lobby) -> 1 transition'da fire OK; round 1->2 vs.
  IF NEW.current_round_index < 1 THEN
    RETURN NEW;
  END IF;

  -- Room async mod check
  SELECT * INTO v_room FROM public.rooms WHERE id = NEW.room_id;
  IF NOT FOUND OR v_room.mode <> 'async' THEN
    RETURN NEW;
  END IF;

  -- Bot question_count + 1 sembolik aralikta — herhangi bir cevap insert atla
  IF NEW.current_round_index > v_room.question_count THEN
    RETURN NEW;
  END IF;

  -- Round lookup
  SELECT * INTO v_round FROM public.room_rounds
    WHERE room_id = NEW.room_id AND round_index = NEW.current_round_index;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_correct := v_round.question_content_snapshot->>'answer';
  v_options := v_round.question_content_snapshot->'options';
  IF v_correct IS NULL OR v_options IS NULL OR jsonb_typeof(v_options) <> 'array' THEN
    -- Corrupted question content, skip this bot
    RETURN NEW;
  END IF;
  v_options_count := jsonb_array_length(v_options);
  IF v_options_count < 2 THEN
    RETURN NEW;
  END IF;

  -- Difficulty-based accuracy (14_bot_answers paterni)
  v_accuracy := CASE
    WHEN v_room.difficulty <= 2 THEN 0.80
    WHEN v_room.difficulty = 3 THEN 0.70
    ELSE 0.60
  END;

  -- Random correct or incorrect
  IF random() < v_accuracy THEN
    v_answer := v_correct;
    v_is_correct := TRUE;
  ELSE
    -- Pick random wrong option
    v_attempt := 0;
    v_answer := NULL;
    WHILE v_attempt < 10 LOOP
      v_wrong_idx := floor(random() * v_options_count)::INT;
      v_answer := v_options->>v_wrong_idx;
      EXIT WHEN v_answer IS NOT NULL AND v_answer <> v_correct;
      v_attempt := v_attempt + 1;
    END LOOP;
    -- Fallback (corrupt data — tum options correct ile esit)
    IF v_answer IS NULL OR v_answer = v_correct THEN
      v_answer := v_correct;
      v_is_correct := TRUE;
    ELSE
      v_is_correct := FALSE;
    END IF;
  END IF;

  -- response_ms 5000-15000 random (humanlike, frontend pretend-delay UI)
  v_response_ms := 5000 + floor(random() * 10001)::INT;

  -- Score: linear decay (sync paterni 16 submit_answer_async ile uyumlu)
  v_points := CASE
    WHEN v_is_correct THEN
      GREATEST(0,
        FLOOR(1000.0 * (1.0 - v_response_ms::FLOAT
                        / (v_room.per_question_seconds * 1000.0)))
      )::INT
    ELSE 0
  END;

  -- Insert answer (idempotent — UNIQUE round_id+user_id catch)
  -- submitted_at = current_round_started_at + response_ms (pretend-delay,
  -- frontend UI animation icin). DB instant insert ama submitted_at sahte
  -- "future" zaman.
  BEGIN
    INSERT INTO public.room_answers
      (room_id, round_id, user_id, answer_value, response_ms,
       is_correct, points_awarded, submitted_at)
    VALUES
      (NEW.room_id, v_round.id, NEW.user_id, v_answer, v_response_ms,
       v_is_correct, v_points,
       NEW.current_round_started_at + (v_response_ms || ' milliseconds')::INTERVAL);
  EXCEPTION WHEN unique_violation THEN
    -- Bot bu round'a zaten cevap vermis (defensive — start_room sirasinda
    -- 14_bot_answers eski trigger paterni ile cakisma onlem). Skip.
    RETURN NEW;
  END;

  -- Member score update
  UPDATE public.room_members
    SET score = score + v_points
    WHERE id = NEW.id;

  -- Advance: next round or finish
  v_next := NEW.current_round_index + 1;

  IF v_next > v_room.question_count THEN
    -- Final: bot tum sorulari bitirdi, finished_at set, all-finished trigger
    -- (16_async_functions.sql) atomic check rooms.state='completed'.
    UPDATE public.room_members
      SET finished_at = NOW(),
          current_round_index = v_next  -- sembolik (question_count + 1)
      WHERE id = NEW.id;

    INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
      VALUES (NEW.room_id, NULL, 'bot_finished_async',
              jsonb_build_object(
                'bot_user_id', NEW.user_id,
                'final_round', NEW.current_round_index,
                'total_score', (
                  SELECT score FROM public.room_members WHERE id = NEW.id
                )
              ));
  ELSE
    -- Intermediate: bir sonraki round'a gec. Bu UPDATE recursive trigger
    -- fire eder, bot final round'a kadar atlar (max 30 round, 16-level
    -- recursion limit'i guvenli aralikta).
    UPDATE public.room_members
      SET current_round_index = v_next,
          current_round_started_at = NOW()
      WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._bot_async_round_handler() FROM PUBLIC;

-- Trigger sadece async odaki bot uyeler icin fire (WHEN clause OLD/NEW row-level)
DROP TRIGGER IF EXISTS trg_bot_async_round_advance ON public.room_members;
CREATE TRIGGER trg_bot_async_round_advance
  AFTER UPDATE OF current_round_index ON public.room_members
  FOR EACH ROW
  WHEN (
    NEW.is_bot = TRUE
    AND NEW.current_round_index >= 1
    AND OLD.current_round_index IS DISTINCT FROM NEW.current_round_index
  )
  EXECUTE FUNCTION public._bot_async_round_handler();

COMMIT;
