-- =============================================================================
-- Bilge Arena Oda Sistemi: 9_rooms_auto_advance migration (Sprint 2A Task 1)
-- =============================================================================
-- Hedef: Reveal sonrasi otomatik advance suresi room-specific yap.
--          - rooms.auto_advance_seconds INT (0-30, 0=manuel mode, default 5)
--          - create_room RPC: p_auto_advance_seconds parametresi ekle
--          - auto_relay_tick Phase 2: r.auto_advance_seconds kullan
--             (auto_advance_seconds=0 ise auto-advance atla, manuel beklenir)
--
-- Plan referansi: docs/plans/2026-05-01-sprint2-dwell-time-improvements.md
--                 Task 1 (Reveal auto-advance, +90sn/session quick win)
--
-- Plan-deviations:
--   #58 (yeni): auto_relay_tick imzasi degismedi (geriye uyum). p_reveal_hold_seconds
--       parametresi DEPRECATED ama kabul edilir; gercek hold suresi her oda icin
--       r.auto_advance_seconds'tan okunur. system cron `SELECT auto_relay_tick();`
--       cagrisi (default 8 hold) artik bypass — odanin kendi degeri kullanilir.
--   #59 (yeni): auto_advance_seconds=0 -> auto-advance Phase 2 atla. Phase 1
--       (active->reveal) yine 5sn buffer ile calisir (host hareketsiz cevap goster).
--   #60 (yeni): Migration'da rooms ALTER NOT NULL DEFAULT 5 — mevcut tum odalar 5
--       degeri ile dolar (backwards-compat). CHECK constraint geriye dogru gecerli.
--
-- Kalitim plan-deviations:
--   #41: Caller identity = auth.uid()
--   #43: Linear decay score (auto_relay_tick'te kalitim)
--   #47: System cron min granularity 60sn
--   #53: REVOKE PUBLIC + GRANT authenticated (privilege hardening)
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/9_rooms_auto_advance.sql
--
-- Test (apply sonrasi):
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/9_rooms_auto_advance_test.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- 1) rooms.auto_advance_seconds kolonu
-- =============================================================================
-- 0 = manuel mode (auto-advance disabled, host beklemeli)
-- 1-30 = saniye sayisi (reveal sonrasi otomatik advance)
-- Default 5 = MVP: kisa surede UX akisini bozmadan dwell time iyilesir
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS auto_advance_seconds INT NOT NULL DEFAULT 5;

ALTER TABLE public.rooms
  DROP CONSTRAINT IF EXISTS chk_rooms_auto_advance_range;

ALTER TABLE public.rooms
  ADD CONSTRAINT chk_rooms_auto_advance_range
    CHECK (auto_advance_seconds BETWEEN 0 AND 30);

-- =============================================================================
-- 2) create_room RPC: p_auto_advance_seconds parametre ekleme
-- =============================================================================
-- Yeni imza: 8 parametre (7 eski + 1 yeni). Default 5 ile backwards-compat
-- (eski kullanicilar parametresiz cagri yapsa da default ile dolar).
CREATE OR REPLACE FUNCTION public.create_room(
  p_title TEXT,
  p_category TEXT,
  p_difficulty SMALLINT DEFAULT 2,
  p_question_count SMALLINT DEFAULT 10,
  p_max_players SMALLINT DEFAULT 8,
  p_per_question_seconds SMALLINT DEFAULT 20,
  p_mode TEXT DEFAULT 'sync',
  p_auto_advance_seconds INT DEFAULT 5
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller   UUID;
  v_room_id  UUID;
  v_code     CHAR(6);
  v_attempt  INT := 0;
  v_max_retry CONSTANT INT := 5;
BEGIN
  -- Auth context
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required (auth.uid() NULL)'
      USING ERRCODE = 'P0001';
  END IF;

  -- Belt-and-suspenders: Zod onceden 0-30 dogrular, DB CHECK ikinci kat
  -- (RPC'den dogrudan psql cagriligi senaryosu icin)
  IF p_auto_advance_seconds < 0 OR p_auto_advance_seconds > 30 THEN
    RAISE EXCEPTION 'auto_advance_seconds 0-30 araligi disinda: %', p_auto_advance_seconds
      USING ERRCODE = 'P0001';
  END IF;

  -- Code generation with collision retry
  LOOP
    v_attempt := v_attempt + 1;
    v_code := public._gen_room_code();

    BEGIN
      INSERT INTO public.rooms
        (code, host_id, title, category, difficulty, question_count,
         max_players, per_question_seconds, mode, state, auto_advance_seconds)
      VALUES
        (v_code, v_caller, p_title, p_category, p_difficulty, p_question_count,
         p_max_players, p_per_question_seconds, p_mode, 'lobby',
         p_auto_advance_seconds)
      RETURNING id INTO v_room_id;

      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        IF v_attempt >= v_max_retry THEN
          RAISE EXCEPTION 'Code generation 5 retry sonrasi cakistir, sasirtici dolu'
            USING ERRCODE = 'P0013';
        END IF;
    END;
  END LOOP;

  -- INSERT first room_member as host
  INSERT INTO public.room_members (room_id, user_id, role)
    VALUES (v_room_id, v_caller, 'host');

  -- Audit
  INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
    VALUES (v_room_id, v_caller, 'room_created',
            jsonb_build_object(
              'code', v_code,
              'category', p_category,
              'difficulty', p_difficulty,
              'question_count', p_question_count,
              'max_players', p_max_players,
              'per_question_seconds', p_per_question_seconds,
              'mode', p_mode,
              'auto_advance_seconds', p_auto_advance_seconds,
              'attempts', v_attempt
            ));

  RETURN jsonb_build_object(
    'id', v_room_id,
    'code', v_code
  );
END;
$$;

-- Eski 7-parametreli imzayi DROP et (yeni 8-parametreli ile cakisma onlem)
DROP FUNCTION IF EXISTS public.create_room(TEXT, TEXT, SMALLINT, SMALLINT,
                                            SMALLINT, SMALLINT, TEXT);

-- Privilege: REVOKE PUBLIC + GRANT authenticated (Codex P1 #40 kalitim)
REVOKE EXECUTE ON FUNCTION public.create_room(TEXT, TEXT, SMALLINT, SMALLINT,
                                                SMALLINT, SMALLINT, TEXT, INT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_room(TEXT, TEXT, SMALLINT, SMALLINT,
                                              SMALLINT, SMALLINT, TEXT, INT)
  TO authenticated;

-- =============================================================================
-- 3) auto_relay_tick: Phase 2 hold suresini room-specific yap
-- =============================================================================
-- Eski mantik: r.state='reveal' + NOW() > revealed_at + p_reveal_hold_seconds
-- Yeni mantik: r.state='reveal' + r.auto_advance_seconds > 0 +
--              NOW() > revealed_at + r.auto_advance_seconds saniye
--
-- p_reveal_hold_seconds parametresi imzada kalir (geriye uyum, system cron
-- cagri sablonu degismez) ama Phase 2 mantiginda KULLANILMAZ.
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
  -- Phase 1: active rooms with expired deadline -> auto-reveal (DEGISMEDI)
  -- =========================================================================
  FOR v_candidate IN
    SELECT r.id AS room_id
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
    SELECT * INTO v_room FROM public.rooms
      WHERE id = v_candidate.room_id FOR UPDATE;

    IF v_room.state <> 'active' OR v_room.current_round_index < 1 THEN
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
  -- Phase 2: reveal rooms with expired hold -> auto-advance OR complete
  -- DEGISIM: r.auto_advance_seconds kullanilir (0=skip, manuel mode)
  -- =========================================================================
  FOR v_candidate IN
    SELECT r.id AS room_id
    FROM public.rooms r
    JOIN public.room_rounds rr
      ON rr.room_id = r.id
      AND rr.round_index = r.current_round_index
    WHERE r.state = 'reveal'
      AND rr.revealed_at IS NOT NULL
      AND r.auto_advance_seconds > 0  -- 0 = manuel mode, atla
      AND NOW() > rr.revealed_at + (r.auto_advance_seconds || ' seconds')::INTERVAL
    LIMIT p_batch_limit
  LOOP
    SELECT * INTO v_room FROM public.rooms
      WHERE id = v_candidate.room_id FOR UPDATE;

    IF v_room.state <> 'reveal' THEN
      CONTINUE;
    END IF;

    -- Re-verify auto_advance_seconds under lock (host degistirebilir)
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

    -- Re-verify hold expired (room-specific sure)
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
