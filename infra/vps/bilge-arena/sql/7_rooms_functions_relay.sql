-- =============================================================================
-- Bilge Arena Oda Sistemi: 7_rooms_functions_relay migration (Sprint 1 PR2c)
-- =============================================================================
-- Hedef: 1 PL/pgSQL function (auto_relay_tick) - system cron tarafindan
--        cagrilir, stalled rooms'u otomatik ilerletir:
--          - active rooms with expired deadline -> auto-reveal
--          - reveal rooms with expired hold -> auto-advance (or complete)
--
-- Plan referansi: docs/plans/2026-04-27-oda-sistemi-implementation.md
--                 Sprint 1 PR2c (Task 2.5 auto_relay_tick)
-- Test referansi: 7_rooms_functions_relay_test.sql (TDD GREEN target)
--
-- Plan-deviations:
--   #19 (kalitim): pg_cron yok -> system cron + bash script (rooms-relay.sh)
--   #47 (yeni): system cron min granularity 1 dakika. Plan'in 1-saniye
--       interval'i (pg_cron) icin sub-minute granularity gerekli ama MVP'de
--       60sn yeterli. Stalled game UX impact: max ~80sn (round 20sn + relay
--       60sn). Sub-minute icin systemd OnCalendar=*:*:0/5 alternatifi var,
--       PR2c kapsami disinda.
--   #48 (yeni): auto_relay_tick reveal/advance logic'i reveal_round/
--       advance_round'dan DUPLICATE eder. Refactoring sonra (production'da
--       PR2b fonksiyonlarini modify etmek regression riski).
--
-- Anti-cheat: actor_id=NULL audit log (system event). Skor formulu
-- reveal_round ile birebir ayni (linear decay 1000-puan tabanli, plan-deviation
-- #43 kalitim).
--
-- Lock order (Codex P1 PR #39 kalitim): rooms ilk, sonra room_rounds.
-- reveal_round + advance_round + submit_answer tum lock graph'i ayni sirada,
-- deadlock impossible.
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/7_rooms_functions_relay.sql
--
-- Cagri (system cron): bash rooms-relay.sh -> SELECT auto_relay_tick();
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- auto_relay_tick: system cron tarafindan cagrilir
-- =============================================================================
-- Returns: count of operations performed (debug/metric)
-- NO GRANT EXECUTE TO authenticated -- system-only (bilge_arena_app OWNER)
CREATE OR REPLACE FUNCTION public.auto_relay_tick(
  p_reveal_buffer_seconds INT DEFAULT 5,
  p_reveal_hold_seconds INT DEFAULT 8,
  p_batch_limit INT DEFAULT 100
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_candidate    RECORD;
  v_room         public.rooms%ROWTYPE;
  v_round        public.room_rounds%ROWTYPE;
  v_correct_ans  TEXT;
  v_next_index   SMALLINT;
  v_count        INT := 0;
BEGIN
  -- =========================================================================
  -- Phase 1: active rooms with expired deadline -> auto-reveal
  -- =========================================================================
  FOR v_candidate IN
    SELECT r.id AS room_id, rr.id AS round_id
    FROM public.rooms r
    JOIN public.room_rounds rr
      ON rr.room_id = r.id
      AND rr.round_index = r.current_round_index
    WHERE r.state = 'active'
      AND r.current_round_index >= 1
      AND rr.revealed_at IS NULL
      AND NOW() > rr.ends_at + (p_reveal_buffer_seconds || ' seconds')::INTERVAL
    LIMIT p_batch_limit
  LOOP
    -- Lock order match (rooms ilk): reveal_round + submit_answer'la uyumlu
    SELECT * INTO v_room FROM public.rooms
      WHERE id = v_candidate.room_id FOR UPDATE;

    -- Re-verify state under lock (concurrent host action olabilir)
    IF v_room.state <> 'active' THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_round FROM public.room_rounds
      WHERE id = v_candidate.round_id FOR UPDATE;

    -- Re-verify revealed_at under lock
    IF v_round.revealed_at IS NOT NULL THEN
      CONTINUE;
    END IF;

    -- Re-verify deadline expired (clock drift safe)
    IF NOW() <= v_round.ends_at + (p_reveal_buffer_seconds || ' seconds')::INTERVAL THEN
      CONTINUE;
    END IF;

    v_correct_ans := v_round.question_content_snapshot->>'answer';

    -- Score answers (linear decay, plan-deviation #43 kalitim)
    UPDATE public.room_answers ra
      SET is_correct = (ra.answer_value = v_correct_ans),
          points_awarded = CASE
            WHEN ra.answer_value = v_correct_ans THEN
              GREATEST(0,
                FLOOR(1000.0 * (1.0 - ra.response_ms::FLOAT
                                / (v_room.per_question_seconds * 1000.0)))
              )::INT
            ELSE 0
          END
      WHERE ra.round_id = v_round.id;

    -- Cumulative member scores
    UPDATE public.room_members rm
      SET score = rm.score + COALESCE((
        SELECT points_awarded FROM public.room_answers
        WHERE round_id = v_round.id AND user_id = rm.user_id
      ), 0)
      WHERE rm.room_id = v_room.id AND rm.is_active = TRUE;

    -- Mark revealed
    UPDATE public.room_rounds
      SET revealed_at = NOW()
      WHERE id = v_round.id;

    UPDATE public.rooms
      SET state = 'reveal', updated_at = NOW()
      WHERE id = v_room.id;

    -- Audit (actor_id=NULL = system event)
    INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
      VALUES (v_room.id, NULL, 'round_revealed_auto',
              jsonb_build_object(
                'round_index', v_room.current_round_index,
                'correct_answer', v_correct_ans,
                'reason', 'deadline_expired'
              ));

    v_count := v_count + 1;
  END LOOP;

  -- =========================================================================
  -- Phase 2: reveal rooms with expired hold -> auto-advance OR complete
  -- =========================================================================
  FOR v_candidate IN
    SELECT r.id AS room_id, rr.id AS round_id
    FROM public.rooms r
    JOIN public.room_rounds rr
      ON rr.room_id = r.id
      AND rr.round_index = r.current_round_index
    WHERE r.state = 'reveal'
      AND rr.revealed_at IS NOT NULL
      AND NOW() > rr.revealed_at + (p_reveal_hold_seconds || ' seconds')::INTERVAL
    LIMIT p_batch_limit
  LOOP
    SELECT * INTO v_room FROM public.rooms
      WHERE id = v_candidate.room_id FOR UPDATE;

    -- Re-verify state under lock
    IF v_room.state <> 'reveal' THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_round FROM public.room_rounds
      WHERE id = v_candidate.round_id FOR UPDATE;

    -- Re-verify hold expired
    IF v_round.revealed_at IS NULL OR
       NOW() <= v_round.revealed_at + (p_reveal_hold_seconds || ' seconds')::INTERVAL THEN
      CONTINUE;
    END IF;

    v_next_index := v_room.current_round_index + 1;

    IF v_next_index > v_room.question_count THEN
      -- Game over
      UPDATE public.rooms
        SET state = 'completed', ended_at = NOW(), updated_at = NOW()
        WHERE id = v_room.id;

      INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
        VALUES (v_room.id, NULL, 'room_completed_auto',
                jsonb_build_object(
                  'final_round', v_room.current_round_index,
                  'reason', 'auto_relay_last_reveal_hold_expired'
                ));
    ELSE
      -- Advance to next round
      UPDATE public.room_rounds
        SET started_at = NOW(),
            ends_at = NOW() + (v_room.per_question_seconds || ' seconds')::INTERVAL
        WHERE room_id = v_room.id AND round_index = v_next_index;

      UPDATE public.rooms
        SET state = 'active',
            current_round_index = v_next_index,
            updated_at = NOW()
        WHERE id = v_room.id;

      INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
        VALUES (v_room.id, NULL, 'round_started_auto',
                jsonb_build_object(
                  'round_index', v_next_index,
                  'reason', 'reveal_hold_expired'
                ));
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- NOT GRANT EXECUTE TO authenticated -- system-only via OWNER (bilge_arena_app)
COMMIT;
