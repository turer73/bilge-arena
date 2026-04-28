-- =============================================================================
-- Bilge Arena Oda Sistemi: 7_rooms_functions_relay test (TDD)
-- =============================================================================
-- Hedef: auto_relay_tick() Phase 1 (auto-reveal) + Phase 2 (auto-advance)
--        davranislarini synthetic expired-state setup ile dogrula.
--
-- Plan referansi: docs/plans/2026-04-27-oda-sistemi-implementation.md
--                 Sprint 1 PR2c (Task 2.5)
--
-- Plan-deviations:
--   #22 (kalitim): pgTAP yok, plain SQL DO blocks
--   #47 (kalitim): system cron 1-dakika granularity
--   #48 (kalitim): logic duplicate from PR2b reveal_round/advance_round
--
-- Kullanim (PANOLA_ADMIN):
--   docker exec -i panola-postgres psql -U panola_admin -h localhost \
--     -d bilge_arena_dev -v ON_ERROR_STOP=on \
--     -f - < infra/vps/bilge-arena/sql/7_rooms_functions_relay_test.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

SELECT set_config('request.jwt.claim.sub',
                  '22222222-2222-2222-2222-222222222222', FALSE);

-- =============================================================================
-- Setup: 4 farkli room
-- =============================================================================
INSERT INTO public.questions (external_id, game, category, difficulty, content, is_active)
VALUES
  ('test-r-001', 'matematik', 'cebir', 2, '{"question":"q","options":["a","b"],"answer":"a"}'::jsonb, TRUE);

-- Room 1: state=active, deadline EXPIRED 30sn once -> Phase 1 auto-reveal kandidati
INSERT INTO public.rooms
  (id, code, host_id, title, category, difficulty, question_count,
   max_players, per_question_seconds, mode, state, current_round_index)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'RLYAAA',
   '22222222-2222-2222-2222-222222222222', 'Expired Active', 'cebir', 2, 5,
   8, 20, 'sync', 'active', 1);

INSERT INTO public.room_members (room_id, user_id, role)
VALUES
  ('11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', 'host'),
  ('11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333', 'player');

-- Round 1 with EXPIRED ends_at + revealed_at NULL
INSERT INTO public.room_rounds
  (room_id, round_index, question_id, question_content_snapshot,
   started_at, ends_at, revealed_at)
VALUES
  ('11111111-1111-1111-1111-111111111111', 1, gen_random_uuid(),
   '{"question":"q","options":["a","b"],"answer":"a"}'::jsonb,
   NOW() - INTERVAL '50 seconds', NOW() - INTERVAL '30 seconds', NULL);

-- Player 33333 cevabi: 'a' (correct, response 5 saniye)
INSERT INTO public.room_answers
  (room_id, round_id, user_id, answer_value, response_ms, points_awarded, is_correct)
SELECT
  '11111111-1111-1111-1111-111111111111',
  rr.id,
  '33333333-3333-3333-3333-333333333333',
  'a', 5000, 0, NULL
FROM public.room_rounds rr
WHERE rr.room_id = '11111111-1111-1111-1111-111111111111';

-- Room 2: state=reveal, revealed_at 30sn once -> Phase 2 auto-advance kandidati
INSERT INTO public.rooms
  (id, code, host_id, title, category, difficulty, question_count,
   max_players, per_question_seconds, mode, state, current_round_index)
VALUES
  ('22222222-2222-2222-2222-222222222222', 'RLYAAB',
   '22222222-2222-2222-2222-222222222222', 'Expired Reveal', 'cebir', 2, 5,
   8, 20, 'sync', 'reveal', 2);

INSERT INTO public.room_members (room_id, user_id, role)
VALUES
  ('22222222-2222-2222-2222-222222222222',
   '22222222-2222-2222-2222-222222222222', 'host'),
  ('22222222-2222-2222-2222-222222222222',
   '33333333-3333-3333-3333-333333333333', 'player');

-- Round 2 (current) revealed 30sn once
INSERT INTO public.room_rounds
  (room_id, round_index, question_id, question_content_snapshot,
   started_at, ends_at, revealed_at)
VALUES
  ('22222222-2222-2222-2222-222222222222', 2, gen_random_uuid(),
   '{"question":"q","options":["a"],"answer":"a"}'::jsonb,
   NOW() - INTERVAL '60 seconds', NOW() - INTERVAL '40 seconds',
   NOW() - INTERVAL '30 seconds');

-- Round 3 pre-created (next round)
INSERT INTO public.room_rounds
  (room_id, round_index, question_id, question_content_snapshot,
   started_at, ends_at, revealed_at)
VALUES
  ('22222222-2222-2222-2222-222222222222', 3, gen_random_uuid(),
   '{"question":"q","options":["a"],"answer":"a"}'::jsonb,
   NOW(), NOW() + INTERVAL '20 seconds', NULL);

-- Room 3: state=reveal, revealed_at 30sn once, current_round_index=question_count
-- -> Phase 2 game over kandidati
INSERT INTO public.rooms
  (id, code, host_id, title, category, difficulty, question_count,
   max_players, per_question_seconds, mode, state, current_round_index)
VALUES
  ('33333333-3333-3333-3333-333333333333', 'RLYAAC',
   '22222222-2222-2222-2222-222222222222', 'Expired Last Reveal', 'cebir', 2, 5,
   8, 20, 'sync', 'reveal', 5);

INSERT INTO public.room_members (room_id, user_id, role)
VALUES
  ('33333333-3333-3333-3333-333333333333',
   '22222222-2222-2222-2222-222222222222', 'host'),
  ('33333333-3333-3333-3333-333333333333',
   '33333333-3333-3333-3333-333333333333', 'player');

INSERT INTO public.room_rounds
  (room_id, round_index, question_id, question_content_snapshot,
   started_at, ends_at, revealed_at)
VALUES
  ('33333333-3333-3333-3333-333333333333', 5, gen_random_uuid(),
   '{"question":"q","options":["a"],"answer":"a"}'::jsonb,
   NOW() - INTERVAL '60 seconds', NOW() - INTERVAL '40 seconds',
   NOW() - INTERVAL '30 seconds');

-- Room 4: state=active, deadline 5sn ONCESINDE BITTI ama buffer (5sn) icinde
-- -> Phase 1 KANDIDATI DEGIL (henuz buffer dolmadi)
INSERT INTO public.rooms
  (id, code, host_id, title, category, difficulty, question_count,
   max_players, per_question_seconds, mode, state, current_round_index)
VALUES
  ('44444444-4444-4444-4444-444444444444', 'RLYAAD',
   '22222222-2222-2222-2222-222222222222', 'Recent Expiry', 'cebir', 2, 5,
   8, 20, 'sync', 'active', 1);

INSERT INTO public.room_members (room_id, user_id, role)
VALUES
  ('44444444-4444-4444-4444-444444444444',
   '22222222-2222-2222-2222-222222222222', 'host'),
  ('44444444-4444-4444-4444-444444444444',
   '33333333-3333-3333-3333-333333333333', 'player');

INSERT INTO public.room_rounds
  (room_id, round_index, question_id, question_content_snapshot,
   started_at, ends_at, revealed_at)
VALUES
  ('44444444-4444-4444-4444-444444444444', 1, gen_random_uuid(),
   '{"question":"q","options":["a"],"answer":"a"}'::jsonb,
   NOW() - INTERVAL '25 seconds', NOW() - INTERVAL '2 seconds', NULL);

-- =============================================================================
-- Test 1: auto_relay_tick callable + returns count
-- =============================================================================
DO $$
DECLARE v_count INT;
BEGIN
  v_count := public.auto_relay_tick();
  IF v_count IS NULL OR v_count < 0 THEN
    RAISE EXCEPTION 'FAIL Test 1: auto_relay_tick yanlis count: %', v_count;
  END IF;
  RAISE NOTICE 'OK Test 1: auto_relay_tick callable, count=%', v_count;
END $$;

-- =============================================================================
-- Test 2: Phase 1 - Room 1 active->reveal
-- =============================================================================
DO $$
DECLARE v_state TEXT; v_revealed TIMESTAMPTZ;
BEGIN
  SELECT state INTO v_state FROM public.rooms
    WHERE id = '11111111-1111-1111-1111-111111111111';
  IF v_state <> 'reveal' THEN
    RAISE EXCEPTION 'FAIL Test 2: room1 state=%, reveal beklendi', v_state;
  END IF;

  SELECT revealed_at INTO v_revealed FROM public.room_rounds
    WHERE room_id = '11111111-1111-1111-1111-111111111111' AND round_index = 1;
  IF v_revealed IS NULL THEN
    RAISE EXCEPTION 'FAIL Test 2: round revealed_at NULL';
  END IF;
  RAISE NOTICE 'OK Test 2: Phase 1 auto-reveal calisti (room1)';
END $$;

-- =============================================================================
-- Test 3: Score hesaplandi (Phase 1)
-- =============================================================================
DO $$
DECLARE v_correct BOOL; v_points INT; v_score INT;
BEGIN
  SELECT is_correct, points_awarded INTO v_correct, v_points
    FROM public.room_answers
    WHERE room_id = '11111111-1111-1111-1111-111111111111';
  IF v_correct IS NOT TRUE OR v_points <= 0 THEN
    RAISE EXCEPTION 'FAIL Test 3: is_correct=%, points=% (correct ans, response 5sn -> ~750 puan beklendi)',
                    v_correct, v_points;
  END IF;

  SELECT score INTO v_score FROM public.room_members
    WHERE room_id = '11111111-1111-1111-1111-111111111111'
      AND user_id = '33333333-3333-3333-3333-333333333333';
  IF v_score <= 0 THEN
    RAISE EXCEPTION 'FAIL Test 3: member score=%', v_score;
  END IF;
  RAISE NOTICE 'OK Test 3: score hesaplandi (correct, points=%, score=%)', v_points, v_score;
END $$;

-- =============================================================================
-- Test 4: Phase 1 audit log actor_id NULL (system event)
-- =============================================================================
DO $$
DECLARE v_actor UUID;
BEGIN
  SELECT actor_id INTO v_actor FROM public.room_audit_log
    WHERE room_id = '11111111-1111-1111-1111-111111111111'
      AND action = 'round_revealed_auto'
    LIMIT 1;
  IF v_actor IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL Test 4: actor_id=% beklenmiyor (system event NULL)', v_actor;
  END IF;
  RAISE NOTICE 'OK Test 4: actor_id=NULL (system event)';
END $$;

-- =============================================================================
-- Test 5: Phase 2 - Room 2 reveal->active(round 3)
-- =============================================================================
DO $$
DECLARE v_state TEXT; v_idx SMALLINT;
BEGIN
  SELECT state, current_round_index INTO v_state, v_idx FROM public.rooms
    WHERE id = '22222222-2222-2222-2222-222222222222';
  IF v_state <> 'active' OR v_idx <> 3 THEN
    RAISE EXCEPTION 'FAIL Test 5: room2 state=%, idx=% (active+3 beklendi)', v_state, v_idx;
  END IF;
  RAISE NOTICE 'OK Test 5: Phase 2 auto-advance calisti (room2 -> round 3 active)';
END $$;

-- =============================================================================
-- Test 6: Phase 2 - Room 3 reveal(last) -> completed
-- =============================================================================
DO $$
DECLARE v_state TEXT; v_ended TIMESTAMPTZ;
BEGIN
  SELECT state, ended_at INTO v_state, v_ended FROM public.rooms
    WHERE id = '33333333-3333-3333-3333-333333333333';
  IF v_state <> 'completed' OR v_ended IS NULL THEN
    RAISE EXCEPTION 'FAIL Test 6: room3 state=%, ended_at=%', v_state, v_ended;
  END IF;
  RAISE NOTICE 'OK Test 6: Phase 2 game over (room3 last reveal -> completed)';
END $$;

-- =============================================================================
-- Test 7: Room 4 buffer'in icinde, auto-relay DOKUNMADI
-- =============================================================================
DO $$
DECLARE v_state TEXT; v_revealed TIMESTAMPTZ;
BEGIN
  SELECT state INTO v_state FROM public.rooms
    WHERE id = '44444444-4444-4444-4444-444444444444';
  IF v_state <> 'active' THEN
    RAISE EXCEPTION 'FAIL Test 7: room4 state=%, active beklendi (buffer icinde)', v_state;
  END IF;

  SELECT revealed_at INTO v_revealed FROM public.room_rounds
    WHERE room_id = '44444444-4444-4444-4444-444444444444' AND round_index = 1;
  IF v_revealed IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL Test 7: room4 revealed_at SET (buffer icinde olmamali)';
  END IF;
  RAISE NOTICE 'OK Test 7: buffer icindeki room dokunulmadi';
END $$;

-- =============================================================================
-- Test 8: Idempotent re-call (no candidates -> count=0)
-- =============================================================================
DO $$
DECLARE v_count INT;
BEGIN
  v_count := public.auto_relay_tick();
  -- Room 1, 2, 3 zaten ilerletildi. Room 4 buffer'da.
  -- Beklenen: 0 (yeni adim yok)
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL Test 8: re-call count=%, 0 beklendi (idempotent)', v_count;
  END IF;
  RAISE NOTICE 'OK Test 8: idempotent re-call, count=0';
END $$;

ROLLBACK;
