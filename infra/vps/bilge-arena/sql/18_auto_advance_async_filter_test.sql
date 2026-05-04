-- =============================================================================
-- Bilge Arena Oda Sistemi: 18_auto_advance_async_filter test (TDD)
-- =============================================================================
-- Hedef: auto_relay_tick'in async odalari atladigini dogrula. Sync oda davranisi
--        degismedi (regression).
--
-- Test scenarios:
--   1. Sync oda + deadline expired -> Phase 1 reveal eder (regression)
--   2. Async oda + deadline expired -> Phase 1 atlar (mode='sync' filter)
--
-- Plan referansi: C:/Users/sevdi/.claude/plans/wondrous-questing-hedgehog.md
--                 Faz A4
--
-- Kullanim (PANOLA_ADMIN — auto_relay_tick FORCE RLS bypass):
--   docker exec -i panola-postgres psql -U panola_admin -h localhost \
--     -d bilge_arena_dev -v ON_ERROR_STOP=on \
--     -f - < infra/vps/bilge-arena/sql/18_auto_advance_async_filter_test.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- Setup: 1 sync oda + 1 async oda, ikisi de active state, deadline expired
-- =============================================================================
INSERT INTO public.questions (external_id, game, category, difficulty, content, is_active)
VALUES
  ('test-tick-q1', 'matematik', 'turev', 2,
   '{"question":"q1","options":["a","b","c","d"],"answer":"a"}'::jsonb, TRUE),
  ('test-tick-q2', 'matematik', 'turev', 2,
   '{"question":"q2","options":["a","b","c","d"],"answer":"b"}'::jsonb, TRUE),
  ('test-tick-q3', 'matematik', 'turev', 2,
   '{"question":"q3","options":["a","b","c","d"],"answer":"c"}'::jsonb, TRUE),
  ('test-tick-q4', 'matematik', 'turev', 2,
   '{"question":"q4","options":["a","b","c","d"],"answer":"d"}'::jsonb, TRUE),
  ('test-tick-q5', 'matematik', 'turev', 2,
   '{"question":"q5","options":["a","b","c","d"],"answer":"a"}'::jsonb, TRUE);

-- Sync oda: state=active, current_round_index=1, round 1 deadline expired
INSERT INTO public.rooms
  (id, code, host_id, title, category, difficulty, question_count,
   max_players, per_question_seconds, mode, state, current_round_index,
   started_at, auto_advance_seconds)
VALUES
  ('dddd1111-dddd-dddd-dddd-dddddddddddd', 'TJCKAB',
   'eeee1111-eeee-eeee-eeee-eeeeeeeeeeee', 'Sync Tick', 'turev', 2, 5,
   4, 20, 'sync', 'active', 1, NOW() - INTERVAL '60 seconds', 5);

-- Async oda: state=active, current_round_index=1 (sembolik), round 1 deadline expired
INSERT INTO public.rooms
  (id, code, host_id, title, category, difficulty, question_count,
   max_players, per_question_seconds, mode, state, current_round_index,
   started_at, auto_advance_seconds)
VALUES
  ('dddd2222-dddd-dddd-dddd-dddddddddddd', 'TJCKBC',
   'eeee1111-eeee-eeee-eeee-eeeeeeeeeeee', 'Async Tick', 'turev', 2, 5,
   4, 20, 'async', 'active', 1, NOW() - INTERVAL '60 seconds', 5);

-- Members (2 her oda icin)
INSERT INTO public.room_members (room_id, user_id, role, is_active)
VALUES
  ('dddd1111-dddd-dddd-dddd-dddddddddddd', 'eeee1111-eeee-eeee-eeee-eeeeeeeeeeee', 'host', TRUE),
  ('dddd1111-dddd-dddd-dddd-dddddddddddd', 'eeee2222-eeee-eeee-eeee-eeeeeeeeeeee', 'player', TRUE),
  ('dddd2222-dddd-dddd-dddd-dddddddddddd', 'eeee1111-eeee-eeee-eeee-eeeeeeeeeeee', 'host', TRUE),
  ('dddd2222-dddd-dddd-dddd-dddddddddddd', 'eeee2222-eeee-eeee-eeee-eeeeeeeeeeee', 'player', TRUE);

-- Async member async kolonlar (start_room async paterni)
UPDATE public.room_members
  SET current_round_index = 1,
      current_round_started_at = NOW() - INTERVAL '60 seconds'
  WHERE room_id = 'dddd2222-dddd-dddd-dddd-dddddddddddd';

-- Round'lar (sync ve async oda icin manuel insert; start_room cagrilmadi)
INSERT INTO public.room_rounds
  (room_id, round_index, question_id, question_content_snapshot, started_at, ends_at)
SELECT
  'dddd1111-dddd-dddd-dddd-dddddddddddd',
  generate_series,
  (SELECT id FROM public.questions WHERE external_id = 'test-tick-q' || generate_series),
  (SELECT content FROM public.questions WHERE external_id = 'test-tick-q' || generate_series),
  NOW() - INTERVAL '60 seconds',
  NOW() - INTERVAL '40 seconds'  -- expired
FROM generate_series(1, 5);

INSERT INTO public.room_rounds
  (room_id, round_index, question_id, question_content_snapshot, started_at, ends_at)
SELECT
  'dddd2222-dddd-dddd-dddd-dddddddddddd',
  generate_series,
  (SELECT id FROM public.questions WHERE external_id = 'test-tick-q' || generate_series),
  (SELECT content FROM public.questions WHERE external_id = 'test-tick-q' || generate_series),
  NOW() - INTERVAL '60 seconds',
  NOW() - INTERVAL '40 seconds'
FROM generate_series(1, 5);

-- =============================================================================
-- Test 1: auto_relay_tick — sync oda reveal, async oda skip
-- =============================================================================
DO $$
DECLARE
  v_count INT;
BEGIN
  -- buffer=5sn, hold=8sn, batch=100
  v_count := public.auto_relay_tick(5, 8, 100);
  -- Sadece 1 sync oda Phase 1 reveal eder (1 count). Async oda atlandi.
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL Test 1: auto_relay_tick count=% (1 beklendi - sync oda)', v_count;
  END IF;
  RAISE NOTICE 'OK Test 1: auto_relay_tick count=1 (sync oda reveal, async skip)';
END $$;

-- Test 2: Sync oda state='reveal' (Phase 1 calisti)
DO $$
DECLARE v_state TEXT;
BEGIN
  SELECT state INTO v_state FROM public.rooms WHERE id = 'dddd1111-dddd-dddd-dddd-dddddddddddd';
  IF v_state <> 'reveal' THEN
    RAISE EXCEPTION 'FAIL Test 2: sync oda state=% (reveal beklendi)', v_state;
  END IF;
  RAISE NOTICE 'OK Test 2: sync oda state=reveal (Phase 1 fired)';
END $$;

-- Test 3: Async oda state='active' (Phase 1 atlandi)
DO $$
DECLARE v_state TEXT;
BEGIN
  SELECT state INTO v_state FROM public.rooms WHERE id = 'dddd2222-dddd-dddd-dddd-dddddddddddd';
  IF v_state <> 'active' THEN
    RAISE EXCEPTION 'FAIL Test 3: async oda state=% (active beklendi - Phase 1 skip)', v_state;
  END IF;
  RAISE NOTICE 'OK Test 3: async oda state=active (Phase 1 mode filter atladi)';
END $$;

-- Test 4: Async oda round 1 revealed_at NULL (atlanmis dogru)
DO $$
DECLARE v_revealed TIMESTAMPTZ;
BEGIN
  SELECT revealed_at INTO v_revealed
  FROM public.room_rounds
  WHERE room_id = 'dddd2222-dddd-dddd-dddd-dddddddddddd' AND round_index = 1;
  IF v_revealed IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL Test 4: async round revealed_at set (NULL beklendi)';
  END IF;
  RAISE NOTICE 'OK Test 4: async oda round revealed_at NULL (skip dogrulandi)';
END $$;

ROLLBACK;
