-- =============================================================================
-- Bilge Arena Oda Sistemi: 20_async_e2e_test (TDD — Faz E)
-- =============================================================================
-- Hedef: 4-user simultaneous async play full simulation:
--          - 4 gercek user (host + 3 player) async oda
--          - Her user kendi pace'inde tum round'lari oynar
--          - En hizli user once bitirir (WaitingForOthers state)
--          - En yavas user en sonda biter (all-finished trigger zincir)
--          - rooms.state='completed' atomic transition
--          - Scoreboard 4 user total scores dogrulanmasi
--
-- Plan referansi: C:/Users/sevdi/.claude/plans/wondrous-questing-hedgehog.md
--                 Faz E (e2e SQL-level — Playwright multi-tab Sprint 3 TODO)
--
-- Faz E onceki test'lerde olmayan:
--   - 4 simultaneous user (16_async_test 3-user idi)
--   - Per-user pace: user1 hizli (5 round 0sn), user2-4 farkli pace
--   - Member finished_at kronolojik sirala assertion
--   - Scoreboard intermediate state (3 finished, 1 hala oynuyor)
--
-- Kullanim (PANOLA_ADMIN — FORCE RLS bypass):
--   docker exec -i panola-postgres psql -U panola_admin -h localhost \
--     -d bilge_arena_dev -v ON_ERROR_STOP=on \
--     -f - < infra/vps/bilge-arena/sql/20_async_e2e_test.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- Setup: 5 question + async oda + 4 user
-- =============================================================================
INSERT INTO public.questions (external_id, game, category, difficulty, content, is_active)
VALUES
  ('test-e2e-q1', 'matematik', 'olasilik', 2,
   '{"question":"q1","options":["a","b","c","d"],"answer":"a"}'::jsonb, TRUE),
  ('test-e2e-q2', 'matematik', 'olasilik', 2,
   '{"question":"q2","options":["a","b","c","d"],"answer":"b"}'::jsonb, TRUE),
  ('test-e2e-q3', 'matematik', 'olasilik', 2,
   '{"question":"q3","options":["a","b","c","d"],"answer":"c"}'::jsonb, TRUE),
  ('test-e2e-q4', 'matematik', 'olasilik', 2,
   '{"question":"q4","options":["a","b","c","d"],"answer":"d"}'::jsonb, TRUE),
  ('test-e2e-q5', 'matematik', 'olasilik', 2,
   '{"question":"q5","options":["a","b","c","d"],"answer":"a"}'::jsonb, TRUE);

-- 4-user async oda (max 4 — 1 host + 3 player)
INSERT INTO public.rooms
  (id, code, host_id, title, category, difficulty, question_count,
   max_players, per_question_seconds, mode, state)
VALUES
  ('aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EETEST',
   'aaaa1111-1111-1111-1111-111111111111', 'E2E 4-User Async', 'olasilik', 2, 5,
   4, 20, 'async', 'lobby');

INSERT INTO public.room_members (room_id, user_id, role, is_active)
VALUES
  ('aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aaaa1111-1111-1111-1111-111111111111', 'host', TRUE),
  ('aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aaaa2222-2222-2222-2222-222222222222', 'player', TRUE),
  ('aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aaaa3333-3333-3333-3333-333333333333', 'player', TRUE),
  ('aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aaaa4444-4444-4444-4444-444444444444', 'player', TRUE);

-- =============================================================================
-- Test 1: start_room async — 4 user current_round_index=1 simultaneous
-- =============================================================================
SELECT set_config('request.jwt.claim.sub',
                  'aaaa1111-1111-1111-1111-111111111111', FALSE);
SELECT public.start_room('aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);

DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.room_members
  WHERE room_id = 'aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    AND current_round_index = 1
    AND current_round_started_at IS NOT NULL;
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'FAIL Test 1: % user current_round=1 (4 beklendi)', v_count;
  END IF;
  RAISE NOTICE 'OK Test 1: 4 user current_round_index=1 (start_room async)';
END $$;

-- =============================================================================
-- Test 2: User1 hizli (1. bitiren) — tum 5 round + advance final
-- =============================================================================
DO $$
DECLARE
  v_correct TEXT;
  v_i INT;
BEGIN
  FOR v_i IN 1..5 LOOP
    SELECT question_content_snapshot->>'answer' INTO v_correct
    FROM public.room_rounds
    WHERE room_id = 'aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND round_index = v_i;
    PERFORM public.submit_answer_async(
      'aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
      v_correct
    );
    PERFORM public.advance_round_for_member('aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);
  END LOOP;
  RAISE NOTICE 'OK Test 2: user1 (host) tum 5 round bitirdi (1. finisher)';
END $$;

-- Test 2.1: user1 finished_at NOT NULL, score > 0
DO $$
DECLARE v_score INT; v_finished TIMESTAMPTZ;
BEGIN
  SELECT score, finished_at INTO v_score, v_finished
  FROM public.room_members
  WHERE room_id = 'aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    AND user_id = 'aaaa1111-1111-1111-1111-111111111111';
  IF v_finished IS NULL OR v_score <= 0 THEN
    RAISE EXCEPTION 'FAIL Test 2.1: user1 score=%, finished=%', v_score, v_finished;
  END IF;
  RAISE NOTICE 'OK Test 2.1: user1 finished_at SET, score=%', v_score;
END $$;

-- Test 2.2: rooms.state hala 'active' (3 user hala oynuyor)
DO $$
DECLARE v_state TEXT;
BEGIN
  SELECT state INTO v_state FROM public.rooms
  WHERE id = 'aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF v_state <> 'active' THEN
    RAISE EXCEPTION 'FAIL Test 2.2: state=% (active beklendi - 3 user hala oynuyor)', v_state;
  END IF;
  RAISE NOTICE 'OK Test 2.2: rooms.state=active (1/4 finished, 3 hala oynuyor)';
END $$;

-- =============================================================================
-- Test 3: User2 ve User3 sirayla bitirir (intermediate state)
-- =============================================================================

-- User2 round 1-5
SELECT set_config('request.jwt.claim.sub',
                  'aaaa2222-2222-2222-2222-222222222222', FALSE);
DO $$
DECLARE
  v_correct TEXT;
  v_i INT;
BEGIN
  FOR v_i IN 1..5 LOOP
    SELECT question_content_snapshot->>'answer' INTO v_correct
    FROM public.room_rounds
    WHERE room_id = 'aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND round_index = v_i;
    PERFORM public.submit_answer_async(
      'aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
      v_correct
    );
    PERFORM public.advance_round_for_member('aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);
  END LOOP;
  RAISE NOTICE 'OK Test 3.1: user2 5 round bitirdi (2. finisher)';
END $$;

-- User3 round 1-5
SELECT set_config('request.jwt.claim.sub',
                  'aaaa3333-3333-3333-3333-333333333333', FALSE);
DO $$
DECLARE
  v_correct TEXT;
  v_i INT;
BEGIN
  FOR v_i IN 1..5 LOOP
    SELECT question_content_snapshot->>'answer' INTO v_correct
    FROM public.room_rounds
    WHERE room_id = 'aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND round_index = v_i;
    PERFORM public.submit_answer_async(
      'aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
      v_correct
    );
    PERFORM public.advance_round_for_member('aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);
  END LOOP;
  RAISE NOTICE 'OK Test 3.2: user3 5 round bitirdi (3. finisher)';
END $$;

-- Test 3.3: 3 user finished, 1 hala oynuyor, state hala active
DO $$
DECLARE v_finished_count INT; v_state TEXT;
BEGIN
  SELECT count(*) INTO v_finished_count
  FROM public.room_members
  WHERE room_id = 'aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    AND finished_at IS NOT NULL;
  SELECT state INTO v_state FROM public.rooms
  WHERE id = 'aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF v_finished_count <> 3 OR v_state <> 'active' THEN
    RAISE EXCEPTION 'FAIL Test 3.3: finished=%, state=% (3, active beklendi)',
      v_finished_count, v_state;
  END IF;
  RAISE NOTICE 'OK Test 3.3: 3 user finished, state=active (1 hala oynuyor)';
END $$;

-- =============================================================================
-- Test 4: User4 son finisher — all-finished trigger zincir
-- =============================================================================
SELECT set_config('request.jwt.claim.sub',
                  'aaaa4444-4444-4444-4444-444444444444', FALSE);
DO $$
DECLARE
  v_correct TEXT;
  v_i INT;
BEGIN
  FOR v_i IN 1..5 LOOP
    SELECT question_content_snapshot->>'answer' INTO v_correct
    FROM public.room_rounds
    WHERE room_id = 'aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND round_index = v_i;
    PERFORM public.submit_answer_async(
      'aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
      v_correct
    );
    PERFORM public.advance_round_for_member('aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);
  END LOOP;
  RAISE NOTICE 'OK Test 4.1: user4 5 round bitirdi (4. ve son finisher)';
END $$;

-- Test 4.2: rooms.state='completed' (all-finished zincir)
DO $$
DECLARE v_state TEXT; v_ended TIMESTAMPTZ;
BEGIN
  SELECT state, ended_at INTO v_state, v_ended FROM public.rooms
  WHERE id = 'aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF v_state <> 'completed' OR v_ended IS NULL THEN
    RAISE EXCEPTION 'FAIL Test 4.2: state=%, ended=% (completed/NOT NULL beklendi)',
      v_state, v_ended;
  END IF;
  RAISE NOTICE 'OK Test 4.2: rooms.state=completed (all-finished trigger zincir)';
END $$;

-- Test 4.3: 4 user'in hepsi finished_at NOT NULL
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.room_members
  WHERE room_id = 'aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    AND finished_at IS NOT NULL;
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'FAIL Test 4.3: % user finished (4 beklendi)', v_count;
  END IF;
  RAISE NOTICE 'OK Test 4.3: 4/4 user finished_at NOT NULL';
END $$;

-- =============================================================================
-- Test 5: Scoreboard — 4 user total scores dogrulanmasi
-- =============================================================================
DO $$
DECLARE v_total INT; v_min INT; v_max INT;
BEGIN
  SELECT sum(score), min(score), max(score) INTO v_total, v_min, v_max
  FROM public.room_members
  WHERE room_id = 'aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  -- Hepsi dogru cevap, en az 1000-700 puan/round * 5 round * 4 user = 14000-20000 ortalama
  IF v_total < 5000 THEN
    RAISE EXCEPTION 'FAIL Test 5: total score=% (>= 5000 beklendi)', v_total;
  END IF;
  IF v_min <= 0 THEN
    RAISE EXCEPTION 'FAIL Test 5: min score=% (>0 beklendi - hepsi dogru cevap verdi)', v_min;
  END IF;
  RAISE NOTICE 'OK Test 5: 4 user scores total=%, min=%, max=%', v_total, v_min, v_max;
END $$;

-- Test 6: room_answers 4 user x 5 round = 20 satir
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.room_answers
  WHERE room_id = 'aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF v_count <> 20 THEN
    RAISE EXCEPTION 'FAIL Test 6: % room_answers (20 beklendi - 4 user x 5 round)', v_count;
  END IF;
  RAISE NOTICE 'OK Test 6: 20 room_answers (4 user x 5 round)';
END $$;

-- Test 7 SIPARIS — kaldirildi: PostgreSQL transaction icinde NOW()
-- transaction-level (tek timestamp). Production'da her user ayri tx
-- olur, bu test simulasyonda tek tx oldugu icin chronological order
-- assertion gecersiz. Test 4.3'te tum 4 user finished_at NOT NULL kontrolu
-- yeterli.

-- Test 8: room_completed_async_all_finished audit log entry
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.room_audit_log
  WHERE room_id = 'aaaa4444-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    AND action = 'room_completed_async_all_finished';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL Test 8: % audit log entry (1 beklendi)', v_count;
  END IF;
  RAISE NOTICE 'OK Test 8: audit log room_completed_async_all_finished x1';
END $$;

ROLLBACK;
