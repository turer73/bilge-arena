-- =============================================================================
-- Bilge Arena Oda Sistemi: 19_async_bot test (TDD)
-- =============================================================================
-- Hedef: Bot async trigger DB-instant ilerlemesi:
--          - start_room async + bot members -> bot'lar tum round'lari bitirir
--          - bot.finished_at NOT NULL, score > 0 (accuracy 0.6-0.8 yuksek
--            ihtimalle bazi cevaplar dogru)
--          - room_answers her round x her bot icin 1 satir
--          - room.state='active' (gerçek user hala oynuyor)
--          - Sync oda + bot: trigger fire ETMEZ
--          - All-finished zincir: gercek user bitince rooms.state='completed'
--
-- Plan referansi: C:/Users/sevdi/.claude/plans/wondrous-questing-hedgehog.md
--                 Faz D
--
-- Kullanim (PANOLA_ADMIN — FORCE RLS bypass):
--   docker exec -i panola-postgres psql -U panola_admin -h localhost \
--     -d bilge_arena_dev -v ON_ERROR_STOP=on \
--     -f - < infra/vps/bilge-arena/sql/19_async_bot_test.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- Setup: 5 question + 1 async oda + 1 sync oda + bot members
-- =============================================================================
INSERT INTO public.questions (external_id, game, category, difficulty, content, is_active)
VALUES
  ('test-bot-q1', 'matematik', 'integraltest', 2,
   '{"question":"q1","options":["a","b","c","d"],"answer":"a"}'::jsonb, TRUE),
  ('test-bot-q2', 'matematik', 'integraltest', 2,
   '{"question":"q2","options":["a","b","c","d"],"answer":"b"}'::jsonb, TRUE),
  ('test-bot-q3', 'matematik', 'integraltest', 2,
   '{"question":"q3","options":["a","b","c","d"],"answer":"c"}'::jsonb, TRUE),
  ('test-bot-q4', 'matematik', 'integraltest', 2,
   '{"question":"q4","options":["a","b","c","d"],"answer":"d"}'::jsonb, TRUE),
  ('test-bot-q5', 'matematik', 'integraltest', 2,
   '{"question":"q5","options":["a","b","c","d"],"answer":"a"}'::jsonb, TRUE);

-- Async oda: 1 host (gercek user) + 2 bot
INSERT INTO public.rooms
  (id, code, host_id, title, category, difficulty, question_count,
   max_players, per_question_seconds, mode, state)
VALUES
  ('eeee1111-eeee-eeee-eeee-eeeeeeeeeeee', 'BASYNC',
   'aaaa9999-9999-9999-9999-999999999999', 'Bot Async', 'integraltest', 2, 5,
   4, 20, 'async', 'lobby');

INSERT INTO public.room_members (room_id, user_id, role, is_bot, display_name, is_active)
VALUES
  ('eeee1111-eeee-eeee-eeee-eeeeeeeeeeee',
   'aaaa9999-9999-9999-9999-999999999999', 'host', FALSE, NULL, TRUE),
  ('eeee1111-eeee-eeee-eeee-eeeeeeeeeeee',
   'bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'player', TRUE, 'Bot 1', TRUE),
  ('eeee1111-eeee-eeee-eeee-eeeeeeeeeeee',
   'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'player', TRUE, 'Bot 2', TRUE);

-- Sync oda: 1 host + 1 bot (sync trigger fire ETMEZ kontrol icin)
INSERT INTO public.rooms
  (id, code, host_id, title, category, difficulty, question_count,
   max_players, per_question_seconds, mode, state)
VALUES
  ('eeee2222-eeee-eeee-eeee-eeeeeeeeeeee', 'BTSYNC',
   'aaaa9999-9999-9999-9999-999999999999', 'Bot Sync', 'integraltest', 2, 5,
   4, 20, 'sync', 'lobby');

INSERT INTO public.room_members (room_id, user_id, role, is_bot, display_name, is_active)
VALUES
  ('eeee2222-eeee-eeee-eeee-eeeeeeeeeeee',
   'aaaa9999-9999-9999-9999-999999999999', 'host', FALSE, NULL, TRUE),
  ('eeee2222-eeee-eeee-eeee-eeeeeeeeeeee',
   'bbbb3333-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'player', TRUE, 'Bot Sync', TRUE);

-- =============================================================================
-- Test 1: Async start_room -> bot'lar tum round'lari DB-instant bitirir
-- =============================================================================
SELECT set_config('request.jwt.claim.sub',
                  'aaaa9999-9999-9999-9999-999999999999', FALSE);

SELECT public.start_room('eeee1111-eeee-eeee-eeee-eeeeeeeeeeee'::uuid);

-- Test 1.1: 2 bot finished_at NOT NULL
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.room_members
  WHERE room_id = 'eeee1111-eeee-eeee-eeee-eeeeeeeeeeee'
    AND is_bot = TRUE
    AND finished_at IS NOT NULL;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'FAIL Test 1.1: % bot finished (2 beklendi)', v_count;
  END IF;
  RAISE NOTICE 'OK Test 1.1: 2 bot finished_at NOT NULL';
END $$;

-- Test 1.2: 2 bot current_round_index = 6 (question_count+1 sembolik)
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.room_members
  WHERE room_id = 'eeee1111-eeee-eeee-eeee-eeeeeeeeeeee'
    AND is_bot = TRUE
    AND current_round_index = 6;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'FAIL Test 1.2: % bot current_round=6 (2 beklendi)', v_count;
  END IF;
  RAISE NOTICE 'OK Test 1.2: 2 bot current_round_index=6 (question_count+1)';
END $$;

-- Test 1.3: 2 bot * 5 round = 10 room_answers satiri
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.room_answers
  WHERE room_id = 'eeee1111-eeee-eeee-eeee-eeeeeeeeeeee'
    AND user_id IN (
      'bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    );
  IF v_count <> 10 THEN
    RAISE EXCEPTION 'FAIL Test 1.3: % room_answers (10 beklendi - 2 bot * 5 round)', v_count;
  END IF;
  RAISE NOTICE 'OK Test 1.3: 10 room_answers (2 bot x 5 round)';
END $$;

-- Test 1.4: Bot scores > 0 (accuracy 0.8 ile yaklasik 4/5 dogru)
DO $$
DECLARE v_score_total INT;
BEGIN
  SELECT sum(score) INTO v_score_total
  FROM public.room_members
  WHERE room_id = 'eeee1111-eeee-eeee-eeee-eeeeeeeeeeee'
    AND is_bot = TRUE;
  -- 2 bot * 5 round * accuracy 0.8 * ~700 puan ~= 5600 expected
  -- Cok dusuk olsa bile en az 100 puan olmasi accuracy=0.8 ile olasilikli
  IF v_score_total < 100 THEN
    RAISE EXCEPTION 'FAIL Test 1.4: bot total score=% (>=100 beklendi)', v_score_total;
  END IF;
  RAISE NOTICE 'OK Test 1.4: 2 bot total score=%', v_score_total;
END $$;

-- Test 1.5: Host hala oynuyor (current_round_index=1, finished_at NULL)
DO $$
DECLARE v_idx SMALLINT; v_finished TIMESTAMPTZ;
BEGIN
  SELECT current_round_index, finished_at INTO v_idx, v_finished
  FROM public.room_members
  WHERE room_id = 'eeee1111-eeee-eeee-eeee-eeeeeeeeeeee'
    AND user_id = 'aaaa9999-9999-9999-9999-999999999999';
  IF v_idx <> 1 OR v_finished IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL Test 1.5: host idx=%, finished=% (1, NULL beklendi)', v_idx, v_finished;
  END IF;
  RAISE NOTICE 'OK Test 1.5: host hala round 1, finished_at NULL';
END $$;

-- Test 1.6: room.state hala 'active' (host bitirmedi, all-finished henuz tetiklemedi)
DO $$
DECLARE v_state TEXT;
BEGIN
  SELECT state INTO v_state FROM public.rooms
  WHERE id = 'eeee1111-eeee-eeee-eeee-eeeeeeeeeeee';
  IF v_state <> 'active' THEN
    RAISE EXCEPTION 'FAIL Test 1.6: state=% (active beklendi)', v_state;
  END IF;
  RAISE NOTICE 'OK Test 1.6: room.state=active (host hala oynuyor)';
END $$;

-- Test 1.7: bot answers submitted_at = current_round_started_at + response_ms
-- (pretend-delay verification — frontend animation icin sahte timing)
DO $$
DECLARE v_max_diff_ms INT;
BEGIN
  -- En fazla 16sn (5000+10000=15000 + buffer) submitted_at - started_at delta beklenir
  SELECT max(EXTRACT(EPOCH FROM (ra.submitted_at - rr.started_at)) * 1000)::INT
  INTO v_max_diff_ms
  FROM public.room_answers ra
  JOIN public.room_rounds rr ON rr.id = ra.round_id
  WHERE ra.room_id = 'eeee1111-eeee-eeee-eeee-eeeeeeeeeeee';
  -- Bot started_at = pre-create rounds time (start_room v_started_at), bot member
  -- current_round_started_at her advance icin NOW(). Pretend-delay 5-15sn.
  -- Test'in calistigi T zamanindan bagimsiz, max delta 15-20sn aralikta olmali.
  IF v_max_diff_ms < 0 OR v_max_diff_ms > 60000 THEN
    RAISE EXCEPTION 'FAIL Test 1.7: max submitted_at delta=%ms (0-60000 beklendi)', v_max_diff_ms;
  END IF;
  RAISE NOTICE 'OK Test 1.7: bot submitted_at pretend-delay <=60sn (max=%ms)', v_max_diff_ms;
END $$;

-- =============================================================================
-- Test 2: Sync oda + bot start_room -> async trigger fire ETMEZ
-- =============================================================================
-- Sync test sadece async kolonlarin touch edilmedigini dogrula. 14_bot_answers
-- davranisi bu PR scope'unda degil (sync mod paterni mevcut PR'lerde kanitli).
SELECT public.start_room('eeee2222-eeee-eeee-eeee-eeeeeeeeeeee'::uuid);

-- Test 2.1: Sync oda bot member async kolonlar touch edilmedi (current_round=0,
-- finished_at=NULL — start_room sync branch'i async kolonlar dokunmaz)
DO $$
DECLARE v_idx SMALLINT; v_finished TIMESTAMPTZ;
BEGIN
  SELECT current_round_index, finished_at INTO v_idx, v_finished
  FROM public.room_members
  WHERE room_id = 'eeee2222-eeee-eeee-eeee-eeeeeeeeeeee'
    AND is_bot = TRUE;
  -- Sync mod async kolonlari touch etmez, default 0 / NULL
  IF v_idx <> 0 OR v_finished IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL Test 2.1: sync bot idx=%, finished=% (0, NULL beklendi)', v_idx, v_finished;
  END IF;
  RAISE NOTICE 'OK Test 2.1: sync oda bot async kolonlari touch edilmedi';
END $$;

-- =============================================================================
-- Test 3: Async all-finished zincir — gercek user bitince rooms.state='completed'
-- =============================================================================
-- Host (gercek user) async oda'da tum round'lari oyna
DO $$
DECLARE
  v_correct TEXT;
  v_i INT;
BEGIN
  FOR v_i IN 1..5 LOOP
    SELECT question_content_snapshot->>'answer' INTO v_correct
    FROM public.room_rounds
    WHERE room_id = 'eeee1111-eeee-eeee-eeee-eeeeeeeeeeee' AND round_index = v_i;
    PERFORM public.submit_answer_async(
      'eeee1111-eeee-eeee-eeee-eeeeeeeeeeee'::uuid,
      v_correct
    );
    PERFORM public.advance_round_for_member('eeee1111-eeee-eeee-eeee-eeeeeeeeeeee'::uuid);
  END LOOP;
  RAISE NOTICE 'OK Test 3: host async oda tum round''lari tamamladi';
END $$;

-- Test 3.1: rooms.state='completed' (all-finished trigger zincir)
DO $$
DECLARE v_state TEXT;
BEGIN
  SELECT state INTO v_state FROM public.rooms
  WHERE id = 'eeee1111-eeee-eeee-eeee-eeeeeeeeeeee';
  IF v_state <> 'completed' THEN
    RAISE EXCEPTION 'FAIL Test 3.1: state=% (completed beklendi - all-finished zincir)', v_state;
  END IF;
  RAISE NOTICE 'OK Test 3.1: rooms.state=completed (all-finished zincir tetiklendi)';
END $$;

-- Test 3.2: Audit log 'bot_finished_async' her bot icin
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.room_audit_log
  WHERE room_id = 'eeee1111-eeee-eeee-eeee-eeeeeeeeeeee'
    AND action = 'bot_finished_async';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'FAIL Test 3.2: % audit log entry (2 beklendi - 2 bot)', v_count;
  END IF;
  RAISE NOTICE 'OK Test 3.2: audit log bot_finished_async x2';
END $$;

ROLLBACK;
