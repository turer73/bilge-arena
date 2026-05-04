-- =============================================================================
-- Bilge Arena Oda Sistemi: 18_auto_advance_async_filter (Async PR1, Faz A4)
-- =============================================================================
-- Hedef: auto_relay_tick'i CREATE OR REPLACE — Phase 1 + Phase 2 query'lerine
--        `AND r.mode = 'sync'` filter ekle. Async odalarda yanlis reveal/advance
--        yapmasin (rooms.current_round_index sembolik kalir, member-level ground truth).
--
-- Sorun: 9_rooms_auto_advance.sql Phase 1 query `JOIN room_rounds rr ON
--        rr.round_index = r.current_round_index` ve `r.state='active'` filter.
--        Async odalarda r.current_round_index=1 sabit kalir (sembolik), Phase 1
--        yanlislikla async odanin round 1'ine "deadline expired" check'i yapar
--        ve reveal_round paterni ile member.score'u kirar (cunku async submit
--        member.score'u zaten arttirdi).
--
-- Cozum: `AND r.mode = 'sync'` filter Phase 1 + Phase 2 her iki query'ye eklenir.
--        Sync caller'lar etkilenmez.
--
-- Plan referansi: C:/Users/sevdi/.claude/plans/wondrous-questing-hedgehog.md
--                 Faz A4
--
-- Plan-deviations:
--   #103 (yeni): Mevcut 9_rooms_auto_advance.sql edit yerine yeni 18 migration —
--       production deployment history immutable, sequential apply guvenligi.
--       CREATE OR REPLACE FUNCTION idempotent, mevcut signature korunur.
--
-- Kalitim plan-deviations (9_rooms_auto_advance.sql'den):
--   #58: auto_relay_tick imzasi degismedi
--   #59: auto_advance_seconds=0 manuel mode
--   #60: rooms ALTER NOT NULL DEFAULT 5
--   #41: Caller identity = auth.uid()
--   #43: Linear decay score
--   #47: System cron min granularity 60sn
--   #53: REVOKE PUBLIC + GRANT authenticated
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/18_auto_advance_async_filter.sql
--
-- Test (apply sonrasi):
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/18_auto_advance_async_filter_test.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- 1) auto_relay_tick — Phase 1 + Phase 2 mode='sync' filter
-- =============================================================================
CREATE OR REPLACE FUNCTION public.auto_relay_tick(
  p_reveal_buffer_seconds INT DEFAULT 5,
  p_reveal_hold_seconds INT DEFAULT 8,  -- DEPRECATED: room-specific kullanilir
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
  -- Phase 1: active SYNC rooms with expired deadline -> auto-reveal
  -- DEGISIM: AND r.mode = 'sync' filter — async odalar (member-level reveal)
  -- bu phase'i atlar.
  -- =========================================================================
  FOR v_candidate IN
    SELECT r.id AS room_id
    FROM public.rooms r
    JOIN public.room_rounds rr
      ON rr.room_id = r.id
      AND rr.round_index = r.current_round_index
    WHERE r.state = 'active'
      AND r.mode = 'sync'  -- ASYNC FILTER (PR1 Faz A4)
      AND r.current_round_index >= 1
      AND rr.revealed_at IS NULL
      AND NOW() > rr.ends_at + (p_reveal_buffer_seconds || ' seconds')::INTERVAL
    LIMIT p_batch_limit
  LOOP
    SELECT * INTO v_room FROM public.rooms
      WHERE id = v_candidate.room_id FOR UPDATE;

    IF v_room.state <> 'active' OR v_room.current_round_index < 1 OR v_room.mode <> 'sync' THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_round FROM public.room_rounds
      WHERE room_id = v_room.id
        AND round_index = v_room.current_round_index
      FOR UPDATE;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF v_round.revealed_at IS NOT NULL THEN
      CONTINUE;
    END IF;

    IF NOW() <= v_round.ends_at + (p_reveal_buffer_seconds || ' seconds')::INTERVAL THEN
      CONTINUE;
    END IF;

    v_correct_ans := v_round.question_content_snapshot->>'answer';

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

    UPDATE public.room_members rm
      SET score = rm.score + COALESCE((
        SELECT points_awarded FROM public.room_answers
        WHERE round_id = v_round.id AND user_id = rm.user_id
      ), 0)
      WHERE rm.room_id = v_room.id AND rm.is_active = TRUE;

    UPDATE public.room_rounds
      SET revealed_at = NOW()
      WHERE id = v_round.id;

    UPDATE public.rooms
      SET state = 'reveal', updated_at = NOW()
      WHERE id = v_room.id;

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
  -- Phase 2: reveal SYNC rooms with expired hold -> auto-advance OR complete
  -- DEGISIM: AND r.mode = 'sync' filter
  -- =========================================================================
  FOR v_candidate IN
    SELECT r.id AS room_id
    FROM public.rooms r
    JOIN public.room_rounds rr
      ON rr.room_id = r.id
      AND rr.round_index = r.current_round_index
    WHERE r.state = 'reveal'
      AND r.mode = 'sync'  -- ASYNC FILTER (PR1 Faz A4)
      AND rr.revealed_at IS NOT NULL
      AND r.auto_advance_seconds > 0
      AND NOW() > rr.revealed_at + (r.auto_advance_seconds || ' seconds')::INTERVAL
    LIMIT p_batch_limit
  LOOP
    SELECT * INTO v_room FROM public.rooms
      WHERE id = v_candidate.room_id FOR UPDATE;

    IF v_room.state <> 'reveal' OR v_room.mode <> 'sync' THEN
      CONTINUE;
    END IF;

    IF v_room.auto_advance_seconds <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_round FROM public.room_rounds
      WHERE room_id = v_room.id
        AND round_index = v_room.current_round_index
      FOR UPDATE;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF v_round.revealed_at IS NULL OR
       NOW() <= v_round.revealed_at + (v_room.auto_advance_seconds || ' seconds')::INTERVAL THEN
      CONTINUE;
    END IF;

    v_next_index := v_room.current_round_index + 1;

    IF v_next_index > v_room.question_count THEN
      UPDATE public.rooms
        SET state = 'completed', ended_at = NOW(), updated_at = NOW()
        WHERE id = v_room.id;

      INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
        VALUES (v_room.id, NULL, 'room_completed_auto',
                jsonb_build_object(
                  'final_round', v_room.current_round_index,
                  'reason', 'auto_advance_last_reveal_hold_expired'
                ));
    ELSE
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
                  'reason', 'reveal_hold_expired',
                  'auto_advance_seconds', v_room.auto_advance_seconds
                ));
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_relay_tick(INT, INT, INT) FROM PUBLIC;

COMMIT;
