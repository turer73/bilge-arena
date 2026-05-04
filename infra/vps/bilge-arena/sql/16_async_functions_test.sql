-- =============================================================================
-- Bilge Arena Oda Sistemi: 16_async_functions test (TDD)
-- =============================================================================
-- Hedef: 16_async_functions.sql migration sonucundaki RPC + trigger davranis
--        + error code testleri:
--          - start_room async branch (members.current_round_index=1, started_at)
--          - submit_answer_async happy/wrong/idempotent retry
--          - submit_answer_async sync oda reject (P0003)
--          - advance_round_for_member intermediate/final/once-cevap guard
--          - All-finished trigger (rooms.state='completed' transition)
--          - Sync RPC mode-guard async oda reject (submit_answer/reveal_round/advance_round)
--
-- Plan referansi: C:/Users/sevdi/.claude/plans/wondrous-questing-hedgehog.md
--                 Faz A2
--
-- Kullanim (PANOLA_ADMIN — SECURITY DEFINER + FORCE RLS bypass):
--   docker exec -i panola-postgres psql -U panola_admin -h localhost \
--     -d bilge_arena_dev -v ON_ERROR_STOP=on \
--     -f - < infra/vps/bilge-arena/sql/16_async_functions_test.sql
--
-- Beklenen GREEN state: tum NOTICE 'OK Test X.Y: ...' satirlari, exit 0
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- Setup: questions + 1 async oda + 1 sync oda + 3 async member + 3 sync member
-- =============================================================================
INSERT INTO public.questions (external_id, game, category, difficulty, content, is_active)
VALUES
  ('test-async-q1', 'matematik', 'gometri', 2,
   '{"question":"q1","options":["a","b","c","d"],"answer":"a","explanation":"a dogru cunku..."}'::jsonb, TRUE),
  ('test-async-q2', 'matematik', 'gometri', 2,
   '{"question":"q2","options":["a","b","c","d"],"answer":"b","explanation":"b dogru cunku..."}'::jsonb, TRUE),
  ('test-async-q3', 'matematik', 'gometri', 2,
   '{"question":"q3","options":["a","b","c","d"],"answer":"c","explanation":"c dogru cunku..."}'::jsonb, TRUE),
  ('test-async-q4', 'matematik', 'gometri', 2,
   '{"question":"q4","options":["a","b","c","d"],"answer":"d","explanation":"d dogru..."}'::jsonb, TRUE),
  ('test-async-q5', 'matematik', 'gometri', 2,
   '{"question":"q5","options":["a","b","c","d"],"answer":"a","explanation":"a dogru..."}'::jsonb, TRUE);

-- Async oda (host + 2 player) — question_count=5 (DB CHECK min)
INSERT INTO public.rooms
  (id, code, host_id, title, category, difficulty, question_count,
   max_players, per_question_seconds, mode, state)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'ASYNCH',
   'aaaa1111-1111-1111-1111-111111111111', 'Async Test', 'gometri', 2, 5,
   4, 20, 'async', 'lobby');

INSERT INTO public.room_members (room_id, user_id, role, is_active)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'aaaa1111-1111-1111-1111-111111111111', 'host', TRUE),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'bbbb2222-2222-2222-2222-222222222222', 'player', TRUE),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'cccc3333-3333-3333-3333-333333333333', 'player', TRUE);

-- Sync oda (sync RPC reject test icin)
INSERT INTO public.rooms
  (id, code, host_id, title, category, difficulty, question_count,
   max_players, per_question_seconds, mode, state)
VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'SYNCAB',
   'aaaa1111-1111-1111-1111-111111111111', 'Sync Test', 'gometri', 2, 5,
   4, 20, 'sync', 'lobby');

INSERT INTO public.room_members (room_id, user_id, role, is_active)
VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   'aaaa1111-1111-1111-1111-111111111111', 'host', TRUE),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   'bbbb2222-2222-2222-2222-222222222222', 'player', TRUE);

-- =============================================================================
-- Section 1: start_room async branch
-- =============================================================================

-- Default JWT = host
SELECT set_config('request.jwt.claim.sub',
                  'aaaa1111-1111-1111-1111-111111111111', FALSE);

-- Test 1.1: start_room async basarili
DO $$
BEGIN
  PERFORM public.start_room('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid);
  RAISE NOTICE 'OK Test 1.1: start_room async basarili';
END $$;

-- Test 1.2: 3 member current_round_index=1, started_at NOT NULL
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.room_members
  WHERE room_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    AND current_round_index = 1
    AND current_round_started_at IS NOT NULL
    AND finished_at IS NULL
    AND is_active = TRUE;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'FAIL Test 1.2: % member current_round=1 (3 beklendi)', v_count;
  END IF;
  RAISE NOTICE 'OK Test 1.2: 3 member current_round_index=1 + started_at set';
END $$;

-- Test 1.3: rooms.state='active', current_round_index=1 (sembolik)
DO $$
DECLARE v_state TEXT; v_idx SMALLINT;
BEGIN
  SELECT state, current_round_index INTO v_state, v_idx
  FROM public.rooms WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  IF v_state <> 'active' OR v_idx <> 1 THEN
    RAISE EXCEPTION 'FAIL Test 1.3: state=%, idx=% beklenmiyor', v_state, v_idx;
  END IF;
  RAISE NOTICE 'OK Test 1.3: state=active, current_round_index=1';
END $$;

-- Test 1.4: 5 round pre-create edildi
DO $$
DECLARE v_round_count INT;
BEGIN
  SELECT count(*) INTO v_round_count
  FROM public.room_rounds
  WHERE room_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  IF v_round_count <> 5 THEN
    RAISE EXCEPTION 'FAIL Test 1.4: % round pre-create (5 beklendi)', v_round_count;
  END IF;
  RAISE NOTICE 'OK Test 1.4: 5 round pre-create edildi';
END $$;

-- =============================================================================
-- Section 2: submit_answer_async happy/wrong/idempotent
-- =============================================================================

-- Test 2.1: Host round 1 dogru cevap (correct_answer round'lar random sirayla,
--   her round'in correct'ini RPC return'unden ogrenip dogru cevabi gonderelim)
DO $$
DECLARE
  v_correct TEXT;
  v_result  JSONB;
BEGIN
  -- Once round 1 correct'ini bul (snapshot icinden)
  SELECT question_content_snapshot->>'answer' INTO v_correct
  FROM public.room_rounds
  WHERE room_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND round_index = 1;

  -- Host olarak submit
  v_result := public.submit_answer_async(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
    v_correct
  );

  IF (v_result->>'is_correct')::BOOLEAN <> TRUE THEN
    RAISE EXCEPTION 'FAIL Test 2.1: is_correct=% beklenmiyor', v_result->>'is_correct';
  END IF;
  IF (v_result->>'points_awarded')::INT <= 0 THEN
    RAISE EXCEPTION 'FAIL Test 2.1: points=% > 0 beklendi', v_result->>'points_awarded';
  END IF;
  IF v_result->>'correct_answer' <> v_correct THEN
    RAISE EXCEPTION 'FAIL Test 2.1: correct_answer mismatch';
  END IF;
  IF (v_result->>'idempotent_retry')::BOOLEAN <> FALSE THEN
    RAISE EXCEPTION 'FAIL Test 2.1: idempotent_retry=true beklenmiyor';
  END IF;
  RAISE NOTICE 'OK Test 2.1: host dogru cevap, points=%', v_result->>'points_awarded';
END $$;

-- Test 2.2: Host score guncellendi
DO $$
DECLARE v_score INT;
BEGIN
  SELECT score INTO v_score
  FROM public.room_members
  WHERE room_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    AND user_id = 'aaaa1111-1111-1111-1111-111111111111';
  IF v_score <= 0 THEN
    RAISE EXCEPTION 'FAIL Test 2.2: host score=% > 0 beklendi', v_score;
  END IF;
  RAISE NOTICE 'OK Test 2.2: host score=%', v_score;
END $$;

-- Test 2.3: Player1 round 1 yanlis cevap
SELECT set_config('request.jwt.claim.sub',
                  'bbbb2222-2222-2222-2222-222222222222', FALSE);
DO $$
DECLARE
  v_correct TEXT;
  v_wrong   TEXT;
  v_result  JSONB;
BEGIN
  SELECT question_content_snapshot->>'answer' INTO v_correct
  FROM public.room_rounds
  WHERE room_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND round_index = 1;
  -- Yanlis cevap: a/b/c/d arasindan v_correct disindaki ilki
  v_wrong := CASE WHEN v_correct = 'a' THEN 'b' ELSE 'a' END;

  v_result := public.submit_answer_async(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
    v_wrong
  );

  IF (v_result->>'is_correct')::BOOLEAN <> FALSE THEN
    RAISE EXCEPTION 'FAIL Test 2.3: is_correct=% beklenmiyor', v_result->>'is_correct';
  END IF;
  IF (v_result->>'points_awarded')::INT <> 0 THEN
    RAISE EXCEPTION 'FAIL Test 2.3: points=% (0 beklendi)', v_result->>'points_awarded';
  END IF;
  -- correct_answer yine doner (anti-cheat: submit'ten sonra)
  IF v_result->>'correct_answer' <> v_correct THEN
    RAISE EXCEPTION 'FAIL Test 2.3: correct_answer mismatch';
  END IF;
  RAISE NOTICE 'OK Test 2.3: player1 yanlis cevap, points=0, correct_answer return';
END $$;

-- Test 2.4: Player1 idempotent retry — ayni jsonb (idempotent_retry=true)
DO $$
DECLARE
  v_correct TEXT;
  v_wrong   TEXT;
  v_result  JSONB;
BEGIN
  SELECT question_content_snapshot->>'answer' INTO v_correct
  FROM public.room_rounds
  WHERE room_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND round_index = 1;
  v_wrong := CASE WHEN v_correct = 'a' THEN 'b' ELSE 'a' END;

  v_result := public.submit_answer_async(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
    v_wrong  -- ayni cevap (veya farkli, fark etmez — UNIQUE round_id+user_id)
  );

  IF (v_result->>'idempotent_retry')::BOOLEAN <> TRUE THEN
    RAISE EXCEPTION 'FAIL Test 2.4: idempotent_retry=false (true beklendi)';
  END IF;
  IF (v_result->>'is_correct')::BOOLEAN <> FALSE THEN
    RAISE EXCEPTION 'FAIL Test 2.4: idempotent retry is_correct=% (false beklendi)',
      v_result->>'is_correct';
  END IF;
  RAISE NOTICE 'OK Test 2.4: player1 idempotent retry, ayni jsonb donduldu';
END $$;

-- Test 2.5: Player1 score 1 kez eklendi (idempotent retry score double-count etmedi)
DO $$
DECLARE v_score INT;
BEGIN
  SELECT score INTO v_score
  FROM public.room_members
  WHERE room_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    AND user_id = 'bbbb2222-2222-2222-2222-222222222222';
  IF v_score <> 0 THEN
    RAISE EXCEPTION 'FAIL Test 2.5: player1 score=% (0 beklendi, yanlis cevap)', v_score;
  END IF;
  RAISE NOTICE 'OK Test 2.5: player1 score=0 (yanlis cevap, idempotent retry double-count etmedi)';
END $$;

-- =============================================================================
-- Section 3: submit_answer_async sync oda reject (P0003)
-- =============================================================================

-- Sync oda baslat
SELECT set_config('request.jwt.claim.sub',
                  'aaaa1111-1111-1111-1111-111111111111', FALSE);
SELECT public.start_room('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid);
SELECT public.advance_round('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid);  -- round 1 baslat

-- Test 3.1: Sync oda'da submit_answer_async cagri P0003
DO $$
BEGIN
  PERFORM public.submit_answer_async(
    'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
    'a'::text
  );
  RAISE EXCEPTION 'FAIL Test 3.1: sync oda submit_async basarili';
EXCEPTION
  WHEN sqlstate 'P0003' THEN
    RAISE NOTICE 'OK Test 3.1: sync oda submit_async bloke (P0003)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 3.1: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- =============================================================================
-- Section 4: Sync RPC mode-guard async oda reject (P0003)
-- =============================================================================

-- Test 4.1: submit_answer (sync RPC) async oda P0003
DO $$
BEGIN
  PERFORM public.submit_answer(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
    'a'::text
  );
  RAISE EXCEPTION 'FAIL Test 4.1: async oda sync submit basarili';
EXCEPTION
  WHEN sqlstate 'P0003' THEN
    RAISE NOTICE 'OK Test 4.1: async oda sync submit bloke (P0003)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 4.1: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- Test 4.2: reveal_round (sync RPC) async oda P0003
DO $$
BEGIN
  PERFORM public.reveal_round('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid);
  RAISE EXCEPTION 'FAIL Test 4.2: async oda sync reveal basarili';
EXCEPTION
  WHEN sqlstate 'P0003' THEN
    RAISE NOTICE 'OK Test 4.2: async oda sync reveal bloke (P0003)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 4.2: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- Test 4.3: advance_round (sync RPC) async oda P0003
DO $$
BEGIN
  PERFORM public.advance_round('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid);
  RAISE EXCEPTION 'FAIL Test 4.3: async oda sync advance basarili';
EXCEPTION
  WHEN sqlstate 'P0003' THEN
    RAISE NOTICE 'OK Test 4.3: async oda sync advance bloke (P0003)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 4.3: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- =============================================================================
-- Section 5: advance_round_for_member intermediate/final
-- =============================================================================

-- Test 5.1: Player2 cevap vermeden advance_for_member dene → P0009
SELECT set_config('request.jwt.claim.sub',
                  'cccc3333-3333-3333-3333-333333333333', FALSE);
DO $$
BEGIN
  PERFORM public.advance_round_for_member('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid);
  RAISE EXCEPTION 'FAIL Test 5.1: cevap vermeden advance basarili';
EXCEPTION
  WHEN sqlstate 'P0009' THEN
    RAISE NOTICE 'OK Test 5.1: cevap vermeden advance bloke (P0009)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 5.1: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- Test 5.2: Host advance round 1 -> 2 (intermediate, status='advanced')
SELECT set_config('request.jwt.claim.sub',
                  'aaaa1111-1111-1111-1111-111111111111', FALSE);
DO $$
DECLARE v_result JSONB;
BEGIN
  v_result := public.advance_round_for_member('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid);
  IF v_result->>'status' <> 'advanced' THEN
    RAISE EXCEPTION 'FAIL Test 5.2: status=% (advanced beklendi)', v_result->>'status';
  END IF;
  IF (v_result->>'round_index')::INT <> 2 THEN
    RAISE EXCEPTION 'FAIL Test 5.2: round_index=% (2 beklendi)', v_result->>'round_index';
  END IF;
  RAISE NOTICE 'OK Test 5.2: host advance to round 2 (status=advanced)';
END $$;

-- Test 5.3: Host member.current_round_index=2, started_at update
DO $$
DECLARE
  v_idx SMALLINT;
  v_started TIMESTAMPTZ;
BEGIN
  SELECT current_round_index, current_round_started_at INTO v_idx, v_started
  FROM public.room_members
  WHERE room_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    AND user_id = 'aaaa1111-1111-1111-1111-111111111111';
  IF v_idx <> 2 OR v_started IS NULL THEN
    RAISE EXCEPTION 'FAIL Test 5.3: idx=%, started=% beklenmiyor', v_idx, v_started;
  END IF;
  -- started_at NOW()'a yakin (son 2sn icinde)
  IF EXTRACT(EPOCH FROM (NOW() - v_started)) > 2 THEN
    RAISE EXCEPTION 'FAIL Test 5.3: started_at delta % saniye, ~0 beklendi',
      EXTRACT(EPOCH FROM (NOW() - v_started));
  END IF;
  RAISE NOTICE 'OK Test 5.3: host current_round_index=2, started_at NOW()';
END $$;

-- Test 5.4: Host round 2-5 cevap + advance final → status='finished'
DO $$
DECLARE
  v_correct TEXT;
  v_result  JSONB;
  v_i INT;
BEGIN
  -- Round 2-4 cevap + intermediate advance
  FOR v_i IN 2..4 LOOP
    SELECT question_content_snapshot->>'answer' INTO v_correct
    FROM public.room_rounds
    WHERE room_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND round_index = v_i;
    PERFORM public.submit_answer_async(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
      v_correct
    );
    v_result := public.advance_round_for_member('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid);
    IF v_result->>'status' <> 'advanced' THEN
      RAISE EXCEPTION 'FAIL Test 5.4 (round %): status=% (advanced beklendi)',
        v_i, v_result->>'status';
    END IF;
  END LOOP;
  -- Round 5 cevap + final advance
  SELECT question_content_snapshot->>'answer' INTO v_correct
  FROM public.room_rounds
  WHERE room_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND round_index = 5;
  PERFORM public.submit_answer_async(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
    v_correct
  );
  v_result := public.advance_round_for_member('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid);
  IF v_result->>'status' <> 'finished' THEN
    RAISE EXCEPTION 'FAIL Test 5.4 final: status=% (finished beklendi)', v_result->>'status';
  END IF;
  IF (v_result->>'round_index')::INT <> 6 THEN
    RAISE EXCEPTION 'FAIL Test 5.4 final: round_index=% (6 beklendi - question_count+1)',
      v_result->>'round_index';
  END IF;
  RAISE NOTICE 'OK Test 5.4: host round 2-5 cevap + final advance (finished)';
END $$;

-- Test 5.5: Host finished, status check (5.4 ile birlestirildi, ayri test silindi)

-- Test 5.6: Host finished_at NOT NULL
DO $$
DECLARE v_finished TIMESTAMPTZ;
BEGIN
  SELECT finished_at INTO v_finished
  FROM public.room_members
  WHERE room_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    AND user_id = 'aaaa1111-1111-1111-1111-111111111111';
  IF v_finished IS NULL THEN
    RAISE EXCEPTION 'FAIL Test 5.6: host finished_at NULL';
  END IF;
  RAISE NOTICE 'OK Test 5.6: host finished_at set';
END $$;

-- Test 5.7: Host bitti, tekrar submit_async dene → P0003
DO $$
BEGIN
  PERFORM public.submit_answer_async(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
    'a'::text
  );
  RAISE EXCEPTION 'FAIL Test 5.7: bitmis uye submit basarili';
EXCEPTION
  WHEN sqlstate 'P0003' THEN
    RAISE NOTICE 'OK Test 5.7: bitmis uye submit bloke (P0003)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 5.7: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- =============================================================================
-- Section 6: All-finished trigger (rooms.state='completed' transition)
-- =============================================================================

-- Player1 ve Player2 de tum round'larini bitirsin
SELECT set_config('request.jwt.claim.sub',
                  'bbbb2222-2222-2222-2222-222222222222', FALSE);

-- Player1 round 1'e cevap verdi (Test 2.3'te yanlis), advance ediyor.
-- Sonra round 2-5 cevap + advance, son advance = finished
DO $$
DECLARE
  v_correct TEXT;
  v_i INT;
BEGIN
  -- Round 1 advance (cevap zaten verdi)
  PERFORM public.advance_round_for_member('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid);
  -- Round 2-5 cevap + advance (final round 5 advance = finished)
  FOR v_i IN 2..5 LOOP
    SELECT question_content_snapshot->>'answer' INTO v_correct
    FROM public.room_rounds
    WHERE room_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND round_index = v_i;
    PERFORM public.submit_answer_async(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
      v_correct
    );
    PERFORM public.advance_round_for_member('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid);
  END LOOP;
  RAISE NOTICE 'OK Test 6.1: player1 tum round''lari tamamladi';
END $$;

-- Player2: round 1-5 hepsi cevap + advance, sonuncu advance trigger fire eder
SELECT set_config('request.jwt.claim.sub',
                  'cccc3333-3333-3333-3333-333333333333', FALSE);
DO $$
DECLARE
  v_correct TEXT;
  v_i INT;
BEGIN
  FOR v_i IN 1..5 LOOP
    SELECT question_content_snapshot->>'answer' INTO v_correct
    FROM public.room_rounds
    WHERE room_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND round_index = v_i;
    PERFORM public.submit_answer_async(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
      v_correct
    );
    PERFORM public.advance_round_for_member('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid);
  END LOOP;
  RAISE NOTICE 'OK Test 6.2: player2 tum round''lari tamamladi (sonuncu finish)';
END $$;

-- Test 6.3: All-finished trigger fire etti, rooms.state='completed'
DO $$
DECLARE v_state TEXT; v_ended TIMESTAMPTZ;
BEGIN
  SELECT state, ended_at INTO v_state, v_ended
  FROM public.rooms WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  IF v_state <> 'completed' OR v_ended IS NULL THEN
    RAISE EXCEPTION 'FAIL Test 6.3: state=%, ended=%', v_state, v_ended;
  END IF;
  RAISE NOTICE 'OK Test 6.3: rooms.state=completed, ended_at set (trigger fire etti)';
END $$;

-- Test 6.4: Audit log 'room_completed_async_all_finished' entry
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.room_audit_log
  WHERE room_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    AND action = 'room_completed_async_all_finished';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL Test 6.4: % audit log entry (1 beklendi)', v_count;
  END IF;
  RAISE NOTICE 'OK Test 6.4: audit log all_finished entry exists';
END $$;

ROLLBACK;
