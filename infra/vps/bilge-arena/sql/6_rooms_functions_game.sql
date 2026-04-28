-- =============================================================================
-- Bilge Arena Oda Sistemi: 6_rooms_functions_game migration (Sprint 1 PR2b)
-- =============================================================================
-- Hedef: 3 PL/pgSQL function (game-loop state operations):
--          - submit_answer(p_room_id, p_answer_value) -> oyuncu cevap verir
--          - reveal_round(p_room_id) -> host current round'u acar, points hesapla
--          - advance_round(p_room_id) -> host next round'a gec OR game over
--
-- Plan referansi: docs/plans/2026-04-27-oda-sistemi-implementation.md
--                 Sprint 1 PR2b (Task 2.3 + 2.4 race-critical)
-- Test referansi: 6_rooms_functions_game_test.sql (TDD GREEN target)
--
-- Plan-deviations:
--   #41 (PR2a kalitim): Caller identity = auth.uid() (param yok).
--   #42 (PR2b): Plan'in tek `next_question` yerine reveal_round +
--       advance_round (semantik clarity, two-button UX).
--   #43 (PR2b): Score formula linear decay
--       FLOOR(1000 * (1 - response_ms / (per_question_seconds * 1000)))
--       plan'in `max(0, 1000-ms)` yerine -- 1sn sonrasi 0 verirdi.
--   #45 (PR2b scope): auto_relay_tick + pause/resume/finish/report_member
--       PR2c'ye ertelendi (PR2b 3 race-critical fonksiyon yeterli).
--
-- State machine (PR2a + PR2b):
--   lobby --start_room--> active (current_round_index=0)
--   active(0) --advance_round--> active(1) [round 1 baslar]
--   active(N) --reveal_round--> reveal(N)
--   reveal(N) --advance_round--> active(N+1) [N<question_count]
--   reveal(N) --advance_round--> completed [N=question_count]
--   any --cancel_room--> completed (with audit reason)
--
-- Race-safety:
--   - submit_answer: UNIQUE(round_id, user_id) double-submit blokesi
--   - reveal_round/advance_round: SELECT ... FOR UPDATE rooms lock
--   - reveal_round idempotent (revealed_at IS NOT NULL ise sadece state sync)
--
-- Anti-cheat:
--   - submit_answer'da is_correct=NULL, points_awarded=0 yazilir
--   - Hesaplama reveal_round'da yapilir (correct answer'a erisim olmadan)
--   - room_round_question_view'in revealed_at gate'i (PR1) client-side
--     reveal'dan once correct_answer'a erismeyi engeller
--   - response_ms server-calculated (NOW() - round.started_at), client-supplied
--     degil
--
-- SECURITY DEFINER + 0b fix-up: bilge_arena_app BYPASSRLS attribute set
--   (Sprint 0 fix-up #2 PR2a sirasinda shipped). FORCE RLS tablolari yazma
--   yetkisi function context'inde mevcut.
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/6_rooms_functions_game.sql
--
-- Error codes (yeniler):
--   P0009 - Henuz round basla(ma)di (current_round_index < 1)
--   P0010 - Sure doldu (NOW() > round.ends_at)
--   P0011 - Zaten cevapladin (UNIQUE round_id+user_id)
--   P0012 - Round reveal edildi, late submit reddedildi (Codex P1 race fix)
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- 1) submit_answer: oyuncu cevap verir (auth.uid() = submitter)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.submit_answer(
  p_room_id UUID,
  p_answer_value TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller     UUID;
  v_room       public.rooms%ROWTYPE;
  v_round      public.room_rounds%ROWTYPE;
  v_response_ms INT;
BEGIN
  -- Auth context
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required (auth.uid() NULL)'
      USING ERRCODE = 'P0001';
  END IF;

  -- Room lookup (no FOR UPDATE -- multiple submitters paralel)
  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oda bulunamadi: %', p_room_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Sadece active state'inde submit
  IF v_room.state <> 'active' THEN
    RAISE EXCEPTION 'Submit sadece active state''te (% var)', v_room.state
      USING ERRCODE = 'P0003';
  END IF;

  IF v_room.current_round_index < 1 THEN
    RAISE EXCEPTION 'Henuz round baslamadi (current_round_index=0; advance_round cagrilmali)'
      USING ERRCODE = 'P0009';
  END IF;

  -- Member kontrol
  IF NOT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room_id AND user_id = v_caller AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Aktif uye degilsin'
      USING ERRCODE = 'P0001';
  END IF;

  -- Current round - FOR SHARE lock (Codex P1 race fix):
  --   FOR SHARE multiple submitters paralel (each holds SHARE) ama
  --   reveal_round'un FOR UPDATE'ini BLOCKS. Boylece submit/reveal
  --   serialize olur. Ayrica revealed_at re-check race gap'i yakalar:
  --   reveal_round commit etmis ama submit eski snapshot'tan state=active
  --   okumusa, FOR SHARE altinda revealed_at IS NOT NULL gorur ve reddeder.
  SELECT * INTO v_round
    FROM public.room_rounds
    WHERE room_id = p_room_id AND round_index = v_room.current_round_index
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aktif round bulunamadi (data integrity ihlali)'
      USING ERRCODE = 'P0002';
  END IF;

  -- Race guard: round zaten reveal edilmisse late submit reddedilir.
  -- Aksi takdirde insert edilen row reveal_round'un UPDATE'inden sonra
  -- gelir, is_correct=NULL/points=0 sonsuza kalir (silent corruption).
  IF v_round.revealed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Round zaten reveal edildi, late submit reddedildi (revealed_at: %)', v_round.revealed_at
      USING ERRCODE = 'P0012';
  END IF;

  -- Deadline check
  IF NOW() > v_round.ends_at THEN
    RAISE EXCEPTION 'Sure doldu (deadline: %)', v_round.ends_at
      USING ERRCODE = 'P0010';
  END IF;

  -- Response time (server-calculated, client-supplied degil)
  v_response_ms := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - v_round.started_at)) * 1000)::INT;

  -- INSERT (UNIQUE round_id+user_id ihlal -> P0011)
  BEGIN
    INSERT INTO public.room_answers
      (room_id, round_id, user_id, answer_value, response_ms, points_awarded, is_correct)
    VALUES
      (p_room_id, v_round.id, v_caller, p_answer_value, v_response_ms, 0, NULL);
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'Bu round''a zaten cevap verdin'
        USING ERRCODE = 'P0011';
  END;

  -- Audit (room_answers UNIQUE zaten data integrity, audit log fazla noisy
  -- olur — sadece submit count metric icin, payload bos)
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_answer(UUID, TEXT) TO authenticated;

-- =============================================================================
-- 2) reveal_round: host current round'u acar (active -> reveal)
-- =============================================================================
-- Score formula (plan-deviation #43 linear decay):
--   correct ise: FLOOR(1000 * (1 - response_ms / (per_question_seconds * 1000)))
--   incorrect ise: 0
-- Idempotent: revealed_at IS NOT NULL ise sadece state'i sync eder.
CREATE OR REPLACE FUNCTION public.reveal_round(
  p_room_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller UUID;
  v_room   public.rooms%ROWTYPE;
  v_round  public.room_rounds%ROWTYPE;
  v_correct_answer TEXT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock room
  SELECT * INTO v_room FROM public.rooms
    WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oda bulunamadi: %', p_room_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_room.host_id <> v_caller THEN
    RAISE EXCEPTION 'Sadece host reveal edebilir'
      USING ERRCODE = 'P0001';
  END IF;

  -- State: 'active' veya 'reveal' (idempotent)
  IF v_room.state NOT IN ('active', 'reveal') THEN
    RAISE EXCEPTION 'Reveal yanlis state''te: %', v_room.state
      USING ERRCODE = 'P0003';
  END IF;

  IF v_room.current_round_index < 1 THEN
    RAISE EXCEPTION 'Henuz round baslamadi'
      USING ERRCODE = 'P0009';
  END IF;

  -- Current round (lock)
  SELECT * INTO v_round
    FROM public.room_rounds
    WHERE room_id = p_room_id AND round_index = v_room.current_round_index
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aktif round bulunamadi'
      USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency: zaten revealed ise no-op
  IF v_round.revealed_at IS NOT NULL THEN
    -- State sync (ihtimal: race condition'da state guncellenmedi)
    IF v_room.state = 'active' THEN
      UPDATE public.rooms SET state = 'reveal', updated_at = NOW()
        WHERE id = p_room_id;
    END IF;
    RETURN;
  END IF;

  -- Correct answer'i snapshot'tan oku
  v_correct_answer := v_round.question_content_snapshot->>'answer';

  -- 1) Update answers: is_correct + points_awarded
  --    Score: linear decay 0..1000 over per_question_seconds
  UPDATE public.room_answers ra
    SET is_correct = (ra.answer_value = v_correct_answer),
        points_awarded = CASE
          WHEN ra.answer_value = v_correct_answer THEN
            GREATEST(0,
              FLOOR(1000.0 * (1.0 - ra.response_ms::FLOAT
                              / (v_room.per_question_seconds * 1000.0)))
            )::INT
          ELSE 0
        END
    WHERE ra.round_id = v_round.id;

  -- 2) Update member scores (cumulative)
  UPDATE public.room_members rm
    SET score = rm.score + COALESCE((
      SELECT points_awarded FROM public.room_answers
      WHERE round_id = v_round.id AND user_id = rm.user_id
    ), 0)
    WHERE rm.room_id = p_room_id AND rm.is_active = TRUE;

  -- 3) Round revealed
  UPDATE public.room_rounds
    SET revealed_at = NOW()
    WHERE id = v_round.id;

  -- 4) State transition
  UPDATE public.rooms
    SET state = 'reveal', updated_at = NOW()
    WHERE id = p_room_id;

  -- 5) Audit
  INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
    VALUES (p_room_id, v_caller, 'round_revealed',
            jsonb_build_object(
              'round_index', v_room.current_round_index,
              'correct_answer', v_correct_answer
            ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.reveal_round(UUID) TO authenticated;

-- =============================================================================
-- 3) advance_round: host next round'a gec OR game over
-- =============================================================================
-- State transitions:
--   active(0) -> active(1) [start round 1]
--   reveal(N<question_count) -> active(N+1) [next round]
--   reveal(N=question_count) -> completed [game over]
CREATE OR REPLACE FUNCTION public.advance_round(
  p_room_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller UUID;
  v_room   public.rooms%ROWTYPE;
  v_next_index SMALLINT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_room FROM public.rooms
    WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oda bulunamadi: %', p_room_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_room.host_id <> v_caller THEN
    RAISE EXCEPTION 'Sadece host advance edebilir'
      USING ERRCODE = 'P0001';
  END IF;

  -- Case 1: active(0) -> active(1) (start first round)
  IF v_room.state = 'active' AND v_room.current_round_index = 0 THEN
    UPDATE public.room_rounds
      SET started_at = NOW(),
          ends_at = NOW() + (v_room.per_question_seconds || ' seconds')::INTERVAL
      WHERE room_id = p_room_id AND round_index = 1;

    UPDATE public.rooms
      SET current_round_index = 1, updated_at = NOW()
      WHERE id = p_room_id;

    INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
      VALUES (p_room_id, v_caller, 'round_started',
              jsonb_build_object('round_index', 1));

  -- Case 2 & 3: reveal -> active(next) OR completed
  ELSIF v_room.state = 'reveal' THEN
    v_next_index := v_room.current_round_index + 1;

    IF v_next_index > v_room.question_count THEN
      -- Game over
      UPDATE public.rooms
        SET state = 'completed',
            ended_at = NOW(),
            updated_at = NOW()
        WHERE id = p_room_id;

      INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
        VALUES (p_room_id, v_caller, 'room_completed',
                jsonb_build_object(
                  'final_round', v_room.current_round_index,
                  'question_count', v_room.question_count
                ));
    ELSE
      -- Next round
      UPDATE public.room_rounds
        SET started_at = NOW(),
            ends_at = NOW() + (v_room.per_question_seconds || ' seconds')::INTERVAL
        WHERE room_id = p_room_id AND round_index = v_next_index;

      UPDATE public.rooms
        SET state = 'active',
            current_round_index = v_next_index,
            updated_at = NOW()
        WHERE id = p_room_id;

      INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
        VALUES (p_room_id, v_caller, 'round_started',
                jsonb_build_object('round_index', v_next_index));
    END IF;

  ELSE
    -- State invalid (lobby, completed, archived)
    RAISE EXCEPTION 'Advance yanlis state''te: %', v_room.state
      USING ERRCODE = 'P0003';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.advance_round(UUID) TO authenticated;

COMMIT;
