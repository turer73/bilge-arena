-- =============================================================================
-- Bilge Arena Oda Sistemi: 21_async_bot_user_paced test (TDD)
-- =============================================================================
-- Hedef: User-paced bot trigger:
--          - 19_async_bot.sql trigger DROP (eski recursive)
--          - start_room async branch bot.current_round_index=0 birakir
--          - User advance ettiginde bot catch up eder (en hizli user pace'i)
--          - Bot user'dan once bitirmez (user finished'dan once bot finished olmaz)
--          - Multi-user: bot en hizli user'i takip eder
--          - User finished -> bot da finished
--
-- Plan referansi: Faz D2 redesign (DB-instant -> user-paced)
--
-- Kullanim (PANOLA_ADMIN — FORCE RLS bypass):
--   docker exec -i panola-postgres psql -U panola_admin -h localhost \
--     -d bilge_arena_dev -v ON_ERROR_STOP=on \
--     -f - < infra/vps/bilge-arena/sql/21_async_bot_user_paced_test.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- Setup: 5 question + async oda + 1 user + 2 bot
-- =============================================================================
INSERT INTO public.questions (external_id, game, category, difficulty, content, is_active)
VALUES
  ('test-paced-q1', 'matematik', 'pacedtest', 2,
   '{"question":"q1","options":["a","b","c","d"],"answer":"a"}'::jsonb, TRUE),
  ('test-paced-q2', 'matematik', 'pacedtest', 2,
   '{"question":"q2","options":["a","b","c","d"],"answer":"b"}'::jsonb, TRUE),
  ('test-paced-q3', 'matematik', 'pacedtest', 2,
   '{"question":"q3","options":["a","b","c","d"],"answer":"c"}'::jsonb, TRUE),
  ('test-paced-q4', 'matematik', 'pacedtest', 2,
   '{"question":"q4","options":["a","b","c","d"],"answer":"d"}'::jsonb, TRUE),
  ('test-paced-q5', 'matematik', 'pacedtest', 2,
   '{"question":"q5","options":["a","b","c","d"],"answer":"a"}'::jsonb, TRUE);

-- Async oda 1 user + 2 bot
INSERT INTO public.rooms
  (id, code, host_id, title, category, difficulty, question_count,
   max_players, per_question_seconds, mode, state)
VALUES
  ('cccc1111-cccc-cccc-cccc-cccccccccccc', 'PACEAS',
   'aaaa5555-5555-5555-5555-555555555555', 'Paced Test', 'pacedtest', 2, 5,
   4, 20, 'async', 'lobby');

INSERT INTO public.room_members (room_id, user_id, role, is_bot, is_active)
VALUES
  ('cccc1111-cccc-cccc-cccc-cccccccccccc',
   'aaaa5555-5555-5555-5555-555555555555', 'host', FALSE, TRUE),
  ('cccc1111-cccc-cccc-cccc-cccccccccccc',
   'bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'player', TRUE, TRUE),
  ('cccc1111-cccc-cccc-cccc-cccccccccccc',
   'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'player', TRUE, TRUE);

-- =============================================================================
-- Test 1: start_room async — user.idx=1, bot.idx=0 (yeni paterni)
-- =============================================================================
SELECT set_config('request.jwt.claim.sub',
                  'aaaa5555-5555-5555-5555-555555555555', FALSE);
SELECT public.start_room('cccc1111-cccc-cccc-cccc-cccccccccccc'::uuid);

-- Test 1.1: User.idx=1 (start_room async branch is_bot=FALSE update)
-- Wait — start_room async branch user.idx=1 set ediyor, AMA o sirada trigger
-- fire eder ve bot 0->1 catch up yapar. Yani trigger sonrasi bot.idx=1.
DO $$
DECLARE v_user_idx SMALLINT; v_bot1_idx SMALLINT; v_bot2_idx SMALLINT;
BEGIN
  SELECT current_round_index INTO v_user_idx
  FROM public.room_members
  WHERE room_id = 'cccc1111-cccc-cccc-cccc-cccccccccccc'
    AND user_id = 'aaaa5555-5555-5555-5555-555555555555';
  SELECT current_round_index INTO v_bot1_idx
  FROM public.room_members
  WHERE room_id = 'cccc1111-cccc-cccc-cccc-cccccccccccc'
    AND user_id = 'bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  SELECT current_round_index INTO v_bot2_idx
  FROM public.room_members
  WHERE room_id = 'cccc1111-cccc-cccc-cccc-cccccccccccc'
    AND user_id = 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  IF v_user_idx <> 1 THEN
    RAISE EXCEPTION 'FAIL Test 1.1: user.idx=% (1 beklendi)', v_user_idx;
  END IF;
  -- Bot start_room sonrasi trigger user 0->1 advance'inde fire eder, bot 0->1 catch up
  IF v_bot1_idx <> 1 OR v_bot2_idx <> 1 THEN
    RAISE EXCEPTION 'FAIL Test 1.1: bot1.idx=%, bot2.idx=% (her ikisi 1 beklendi)',
      v_bot1_idx, v_bot2_idx;
  END IF;
  RAISE NOTICE 'OK Test 1.1: user.idx=1, bot1.idx=1, bot2.idx=1 (user-paced trigger ilk fire)';
END $$;

-- Test 1.2: Bot'lar round 1 cevap verdi (start_room trigger ilk fire'i)
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.room_answers
  WHERE room_id = 'cccc1111-cccc-cccc-cccc-cccccccccccc'
    AND user_id IN ('bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
                    'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'FAIL Test 1.2: % bot answers (2 beklendi - 2 bot x round 1)', v_count;
  END IF;
  RAISE NOTICE 'OK Test 1.2: 2 bot round 1 cevap verdi (trigger ilk fire)';
END $$;

-- Test 1.3: User henuz round 1 cevap vermedi (bot'lar 1 round onde)
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.room_answers
  WHERE room_id = 'cccc1111-cccc-cccc-cccc-cccccccccccc'
    AND user_id = 'aaaa5555-5555-5555-5555-555555555555';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL Test 1.3: user % cevap (0 beklendi - henuz cevap vermedi)', v_count;
  END IF;
  RAISE NOTICE 'OK Test 1.3: user 0 cevap (bot user-paced ama biraz onde)';
END $$;

-- =============================================================================
-- Test 2: User round 1 cevap + advance → bot 1→2 catch up + round 2 cevap
-- =============================================================================
DO $$
DECLARE v_correct TEXT;
BEGIN
  SELECT question_content_snapshot->>'answer' INTO v_correct
  FROM public.room_rounds
  WHERE room_id = 'cccc1111-cccc-cccc-cccc-cccccccccccc' AND round_index = 1;
  PERFORM public.submit_answer_async(
    'cccc1111-cccc-cccc-cccc-cccccccccccc'::uuid, v_correct);
  PERFORM public.advance_round_for_member(
    'cccc1111-cccc-cccc-cccc-cccccccccccc'::uuid);
  RAISE NOTICE 'OK Test 2: user round 1 cevap + advance';
END $$;

-- Test 2.1: User.idx=2, bot.idx=2 (catch up)
DO $$
DECLARE v_user_idx SMALLINT; v_bot1_idx SMALLINT; v_bot2_idx SMALLINT;
BEGIN
  SELECT current_round_index INTO v_user_idx FROM public.room_members
  WHERE room_id = 'cccc1111-cccc-cccc-cccc-cccccccccccc'
    AND user_id = 'aaaa5555-5555-5555-5555-555555555555';
  SELECT current_round_index INTO v_bot1_idx FROM public.room_members
  WHERE room_id = 'cccc1111-cccc-cccc-cccc-cccccccccccc'
    AND user_id = 'bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  SELECT current_round_index INTO v_bot2_idx FROM public.room_members
  WHERE room_id = 'cccc1111-cccc-cccc-cccc-cccccccccccc'
    AND user_id = 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  IF v_user_idx <> 2 OR v_bot1_idx <> 2 OR v_bot2_idx <> 2 THEN
    RAISE EXCEPTION 'FAIL Test 2.1: user=%, bot1=%, bot2=% (hepsi 2 beklendi)',
      v_user_idx, v_bot1_idx, v_bot2_idx;
  END IF;
  RAISE NOTICE 'OK Test 2.1: user=2, bot1=2, bot2=2 (catch up trigger)';
END $$;

-- Test 2.2: 4 bot answer (2 bot x 2 round) + 1 user answer (round 1)
DO $$
DECLARE v_bot_answers INT; v_user_answers INT;
BEGIN
  SELECT count(*) INTO v_bot_answers FROM public.room_answers
  WHERE room_id = 'cccc1111-cccc-cccc-cccc-cccccccccccc'
    AND user_id IN ('bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
                    'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  SELECT count(*) INTO v_user_answers FROM public.room_answers
  WHERE room_id = 'cccc1111-cccc-cccc-cccc-cccccccccccc'
    AND user_id = 'aaaa5555-5555-5555-5555-555555555555';
  IF v_bot_answers <> 4 OR v_user_answers <> 1 THEN
    RAISE EXCEPTION 'FAIL Test 2.2: bot=%, user=% (4, 1 beklendi)',
      v_bot_answers, v_user_answers;
  END IF;
  RAISE NOTICE 'OK Test 2.2: bot=4 user=1 answers';
END $$;

-- =============================================================================
-- Test 3: User round 2-5 cevap + advance final → bot 2→6 (sembolik finished)
-- =============================================================================
DO $$
DECLARE
  v_correct TEXT;
  v_i INT;
BEGIN
  FOR v_i IN 2..5 LOOP
    SELECT question_content_snapshot->>'answer' INTO v_correct
    FROM public.room_rounds
    WHERE room_id = 'cccc1111-cccc-cccc-cccc-cccccccccccc' AND round_index = v_i;
    PERFORM public.submit_answer_async(
      'cccc1111-cccc-cccc-cccc-cccccccccccc'::uuid, v_correct);
    PERFORM public.advance_round_for_member(
      'cccc1111-cccc-cccc-cccc-cccccccccccc'::uuid);
  END LOOP;
  RAISE NOTICE 'OK Test 3: user round 2-5 cevap + final advance';
END $$;

-- Test 3.1: User finished_at NOT NULL, bot finished_at NOT NULL (paced)
DO $$
DECLARE v_user_f TIMESTAMPTZ; v_bot1_f TIMESTAMPTZ; v_bot2_f TIMESTAMPTZ;
BEGIN
  SELECT finished_at INTO v_user_f FROM public.room_members
  WHERE room_id = 'cccc1111-cccc-cccc-cccc-cccccccccccc'
    AND user_id = 'aaaa5555-5555-5555-5555-555555555555';
  SELECT finished_at INTO v_bot1_f FROM public.room_members
  WHERE room_id = 'cccc1111-cccc-cccc-cccc-cccccccccccc'
    AND user_id = 'bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  SELECT finished_at INTO v_bot2_f FROM public.room_members
  WHERE room_id = 'cccc1111-cccc-cccc-cccc-cccccccccccc'
    AND user_id = 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  IF v_user_f IS NULL OR v_bot1_f IS NULL OR v_bot2_f IS NULL THEN
    RAISE EXCEPTION 'FAIL Test 3.1: finished_at NULL (user=%, bot1=%, bot2=%)',
      v_user_f, v_bot1_f, v_bot2_f;
  END IF;
  RAISE NOTICE 'OK Test 3.1: user + 2 bot finished_at NOT NULL';
END $$;

-- Test 3.2: Total room_answers 15 (1 user x 5 + 2 bot x 5)
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM public.room_answers
  WHERE room_id = 'cccc1111-cccc-cccc-cccc-cccccccccccc';
  IF v_count <> 15 THEN
    RAISE EXCEPTION 'FAIL Test 3.2: % answers (15 beklendi - 1 user + 2 bot x 5 round)', v_count;
  END IF;
  RAISE NOTICE 'OK Test 3.2: 15 room_answers (1 user + 2 bot x 5 round)';
END $$;

-- Test 3.3: rooms.state='completed' (all-finished trigger zincir)
DO $$
DECLARE v_state TEXT;
BEGIN
  SELECT state INTO v_state FROM public.rooms
  WHERE id = 'cccc1111-cccc-cccc-cccc-cccccccccccc';
  IF v_state <> 'completed' THEN
    RAISE EXCEPTION 'FAIL Test 3.3: state=% (completed beklendi)', v_state;
  END IF;
  RAISE NOTICE 'OK Test 3.3: rooms.state=completed (all-finished trigger zincir)';
END $$;

-- Test 3.4: Bot scores >0 (accuracy 0.8 ile yaklasik 4/5 dogru)
DO $$
DECLARE v_bot_total INT;
BEGIN
  SELECT sum(score) INTO v_bot_total FROM public.room_members
  WHERE room_id = 'cccc1111-cccc-cccc-cccc-cccccccccccc' AND is_bot = TRUE;
  IF v_bot_total <= 0 THEN
    RAISE EXCEPTION 'FAIL Test 3.4: bot total score=% (>0 beklendi)', v_bot_total;
  END IF;
  RAISE NOTICE 'OK Test 3.4: bot total score=%', v_bot_total;
END $$;

-- =============================================================================
-- Test 4: Eski 19 trigger ve fn DROP edildi (regression)
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_bot_async_round_advance'
  ) THEN
    RAISE EXCEPTION 'FAIL Test 4: trg_bot_async_round_advance hala mevcut (DROP edilmedi)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = '_bot_async_round_handler'
  ) THEN
    RAISE EXCEPTION 'FAIL Test 4: _bot_async_round_handler hala mevcut (DROP edilmedi)';
  END IF;
  RAISE NOTICE 'OK Test 4: 19 eski trigger + fn DROP edildi (regression)';
END $$;

-- =============================================================================
-- Test 5: Yeni trigger + fn mevcut
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_bot_async_pace_with_user'
  ) THEN
    RAISE EXCEPTION 'FAIL Test 5: trg_bot_async_pace_with_user yok';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = '_bot_async_pace_with_user'
  ) THEN
    RAISE EXCEPTION 'FAIL Test 5: _bot_async_pace_with_user yok';
  END IF;
  RAISE NOTICE 'OK Test 5: yeni user-paced trigger + fn mevcut';
END $$;

ROLLBACK;
