-- =============================================================================
-- Bilge Arena Oda Sistemi: 6_rooms_functions_game test (TDD)
-- =============================================================================
-- Hedef: 6_rooms_functions_game.sql migration'inin sonucunda 3 PL/pgSQL
--        function (submit_answer, reveal_round, advance_round) icin behavior
--        + error code testleri.
--
-- Plan referansi: docs/plans/2026-04-27-oda-sistemi-implementation.md
--                 Sprint 1 PR2b (Task 2.3 + 2.4 race-critical)
--
-- Plan-deviations:
--   #22 pgTAP yok -> plain SQL DO blocks (PR1 pattern)
--   #41 (PR2a kalitim): auth.uid() = caller identity, parametre yerine
--   #42 (PR2b): Plan'in tek `next_question` yerine reveal_round +
--       advance_round (semantik clarity, two-button UX, state geciste
--       ayri assertion'lar test edilebilir)
--   #43 (PR2b): Score formula linear decay
--       FLOOR(1000 * (1 - response_ms / (per_question_seconds * 1000)))
--       plan'in `max(0, 1000 - ms)` yerine -- plan'inki 1sn sonrasi 0,
--       insan oyuncularin makul puan almasi mumkun degil
--   #45 (PR2b scope): auto_relay_tick + pause/resume/finish/report_member
--       PR2c'ye ertelendi (PR2b zaten 3 race-critical function, yeterli)
--
-- Error codes (PR2a kalitim + yeniler):
--   P0001 - Yetki yok            P0007 - Zaten uyesin (PR2a)
--   P0002 - Bulunamadi           P0008 - Oda kodu (PR2a)
--   P0003 - Yanlis state         P0009 - Henuz round basla(ma)di (yeni)
--   P0004 - Yetersiz soru        P0010 - Sure doldu (yeni)
--   P0005 - Yetersiz oyuncu      P0011 - Zaten cevapladin (yeni)
--   P0006 - Oda dolu
--
-- Kullanim (PANOLA_ADMIN):
--   docker exec -i panola-postgres psql -U panola_admin -h localhost \
--     -d bilge_arena_dev -v ON_ERROR_STOP=on \
--     -f - < infra/vps/bilge-arena/sql/6_rooms_functions_game_test.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Default JWT claim (host)
SELECT set_config('request.jwt.claim.sub',
                  '22222222-2222-2222-2222-222222222222', FALSE);

-- =============================================================================
-- Setup: mock questions + room + members + start_room ile active state
-- =============================================================================
INSERT INTO public.questions (external_id, game, category, difficulty, content, is_active)
VALUES
  ('test-q-g01', 'matematik', 'cebir', 2, '{"question":"q1","options":["a","b","c","d"],"answer":"a"}'::jsonb, TRUE),
  ('test-q-g02', 'matematik', 'cebir', 2, '{"question":"q2","options":["a","b","c","d"],"answer":"b"}'::jsonb, TRUE),
  ('test-q-g03', 'matematik', 'cebir', 2, '{"question":"q3","options":["a","b","c","d"],"answer":"c"}'::jsonb, TRUE),
  ('test-q-g04', 'matematik', 'cebir', 2, '{"question":"q4","options":["a","b","c","d"],"answer":"d"}'::jsonb, TRUE),
  ('test-q-g05', 'matematik', 'cebir', 2, '{"question":"q5","options":["a","b","c","d"],"answer":"a"}'::jsonb, TRUE);

INSERT INTO public.rooms
  (id, code, host_id, title, category, difficulty, question_count,
   max_players, per_question_seconds, mode, state)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'GAMEAA',
   '22222222-2222-2222-2222-222222222222', 'Game Test', 'cebir', 2, 5,
   8, 20, 'sync', 'lobby');

INSERT INTO public.room_members (room_id, user_id, role)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '22222222-2222-2222-2222-222222222222', 'host'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '33333333-3333-3333-3333-333333333333', 'player'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '44444444-4444-4444-4444-444444444444', 'player');

-- start_room (PR2a) -> state='active', current_round_index=0, 3 round pre-create
SELECT public.start_room('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);

-- =============================================================================
-- Section 1: advance_round (lobby->active->round1 baslangici)
-- =============================================================================
-- start_room sonrasi current_round_index=0 (no round live yet).
-- advance_round 0->1 yapar.

-- Test 1.1: Non-host advance fail (P0001)
SELECT set_config('request.jwt.claim.sub',
                  '33333333-3333-3333-3333-333333333333', FALSE);
DO $$
BEGIN
  PERFORM public.advance_round('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);
  RAISE EXCEPTION 'FAIL Test 1.1: non-host advance basarili';
EXCEPTION
  WHEN sqlstate 'P0001' THEN
    RAISE NOTICE 'OK Test 1.1: non-host advance bloke (P0001)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 1.1: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- Test 1.2: Host advance basarili (round 1 baslar)
SELECT set_config('request.jwt.claim.sub',
                  '22222222-2222-2222-2222-222222222222', FALSE);
DO $$
BEGIN
  PERFORM public.advance_round('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);
  RAISE NOTICE 'OK Test 1.2: advance round 1 basarili';
END $$;

-- Test 1.3: current_round_index=1 + state='active'
DO $$
DECLARE v_idx SMALLINT; v_state TEXT;
BEGIN
  SELECT current_round_index, state INTO v_idx, v_state
    FROM public.rooms
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF v_idx <> 1 OR v_state <> 'active' THEN
    RAISE EXCEPTION 'FAIL Test 1.3: idx=%, state=% beklenmiyor', v_idx, v_state;
  END IF;
  RAISE NOTICE 'OK Test 1.3: current_round_index=1, state=active';
END $$;

-- Test 1.4: Round 1'in ends_at NOW()'a yakin reset edildi (advance icinde)
DO $$
DECLARE v_diff_seconds NUMERIC;
BEGIN
  SELECT EXTRACT(EPOCH FROM (ends_at - NOW())) INTO v_diff_seconds
    FROM public.room_rounds
    WHERE room_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND round_index = 1;
  -- per_question_seconds=20, son 20sn'ye reset olmus olmali (-1..21 araliginda)
  IF v_diff_seconds < 19 OR v_diff_seconds > 21 THEN
    RAISE EXCEPTION 'FAIL Test 1.4: ends_at delta % saniye, ~20 beklendi', v_diff_seconds;
  END IF;
  RAISE NOTICE 'OK Test 1.4: round 1 ends_at NOW()+~20s';
END $$;

-- =============================================================================
-- Section 2: submit_answer
-- =============================================================================

-- Test 2.1: Auth-yok (auth.uid() NULL) P0001
SELECT set_config('request.jwt.claim.sub', '', FALSE);
DO $$
BEGIN
  PERFORM public.submit_answer(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'a'::text
  );
  RAISE EXCEPTION 'FAIL Test 2.1: auth-yok submit basarili';
EXCEPTION
  WHEN sqlstate 'P0001' THEN
    RAISE NOTICE 'OK Test 2.1: auth-yok submit bloke (P0001)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 2.1: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- Test 2.2: Player2 (33333) cevap verir (correct, instant -> high points)
SELECT set_config('request.jwt.claim.sub',
                  '33333333-3333-3333-3333-333333333333', FALSE);
DO $$
BEGIN
  -- round 1'in answer'i question content'inden — 5 mock'tan random secildi.
  -- Burda 'a' cevabi veriyoruz, %20 ihtimalle correct olur. Test ne olursa
  -- olsun submit basarili olmali (correctness reveal'da hesaplanir).
  PERFORM public.submit_answer(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'a'::text
  );
  RAISE NOTICE 'OK Test 2.2: player2 submit basarili';
END $$;

-- Test 2.3: Submit kaydedildi (is_correct=NULL, points_awarded=0 reveal oncesi)
DO $$
DECLARE v_correct BOOL; v_points INT; v_resp_ms INT;
BEGIN
  SELECT is_correct, points_awarded, response_ms
    INTO v_correct, v_points, v_resp_ms
    FROM public.room_answers
    WHERE room_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND user_id = '33333333-3333-3333-3333-333333333333';
  IF v_correct IS NOT NULL OR v_points <> 0 THEN
    RAISE EXCEPTION 'FAIL Test 2.3: anti-cheat ihlal: is_correct=%, points=%', v_correct, v_points;
  END IF;
  IF v_resp_ms < 0 OR v_resp_ms > 5000 THEN
    RAISE EXCEPTION 'FAIL Test 2.3: response_ms % saniye anormal (instant test)', v_resp_ms;
  END IF;
  RAISE NOTICE 'OK Test 2.3: anti-cheat (is_correct=NULL, points=0), response_ms=%', v_resp_ms;
END $$;

-- Test 2.4: Duplicate submit P0011 (UNIQUE round_id+user_id)
DO $$
BEGIN
  PERFORM public.submit_answer(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'b'::text
  );
  RAISE EXCEPTION 'FAIL Test 2.4: duplicate submit basarili';
EXCEPTION
  WHEN sqlstate 'P0011' THEN
    RAISE NOTICE 'OK Test 2.4: duplicate submit bloke (P0011)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 2.4: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- Test 2.5: Non-member submit P0001 (cccc... oda uyesi degil)
SELECT set_config('request.jwt.claim.sub',
                  'cccccccc-cccc-cccc-cccc-cccccccccccc', FALSE);
DO $$
BEGIN
  PERFORM public.submit_answer(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'a'::text
  );
  RAISE EXCEPTION 'FAIL Test 2.5: non-member submit basarili';
EXCEPTION
  WHEN sqlstate 'P0001' THEN
    RAISE NOTICE 'OK Test 2.5: non-member bloke (P0001)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 2.5: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- Test 2.6: Player3 (44444) cevap verir
SELECT set_config('request.jwt.claim.sub',
                  '44444444-4444-4444-4444-444444444444', FALSE);
DO $$
BEGIN
  PERFORM public.submit_answer(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'b'::text
  );
  RAISE NOTICE 'OK Test 2.6: player3 submit basarili';
END $$;

-- =============================================================================
-- Section 3: reveal_round
-- =============================================================================

-- Test 3.1: Non-host reveal fail (P0001)
SELECT set_config('request.jwt.claim.sub',
                  '33333333-3333-3333-3333-333333333333', FALSE);
DO $$
BEGIN
  PERFORM public.reveal_round('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);
  RAISE EXCEPTION 'FAIL Test 3.1: non-host reveal basarili';
EXCEPTION
  WHEN sqlstate 'P0001' THEN
    RAISE NOTICE 'OK Test 3.1: non-host reveal bloke (P0001)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 3.1: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- Test 3.2: Host reveal basarili
SELECT set_config('request.jwt.claim.sub',
                  '22222222-2222-2222-2222-222222222222', FALSE);
DO $$
BEGIN
  PERFORM public.reveal_round('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);
  RAISE NOTICE 'OK Test 3.2: host reveal basarili';
END $$;

-- Test 3.3: state='reveal' + round.revealed_at dolu
DO $$
DECLARE v_state TEXT; v_revealed TIMESTAMPTZ;
BEGIN
  SELECT state INTO v_state FROM public.rooms
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF v_state <> 'reveal' THEN
    RAISE EXCEPTION 'FAIL Test 3.3: state=reveal beklendi, %', v_state;
  END IF;

  SELECT revealed_at INTO v_revealed FROM public.room_rounds
    WHERE room_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND round_index = 1;
  IF v_revealed IS NULL THEN
    RAISE EXCEPTION 'FAIL Test 3.3: revealed_at NULL';
  END IF;
  RAISE NOTICE 'OK Test 3.3: state=reveal, round.revealed_at dolu';
END $$;

-- Test 3.4: is_correct + points_awarded hesaplandi
DO $$
DECLARE v_total_calculated INT;
BEGIN
  -- Tum answer'larin is_correct dolu olmali (correct/incorrect bilinmiyor ama NULL yok)
  SELECT count(*) INTO v_total_calculated
    FROM public.room_answers
    WHERE room_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND is_correct IS NULL;
  IF v_total_calculated <> 0 THEN
    RAISE EXCEPTION 'FAIL Test 3.4: % answer NULL is_correct kalmis', v_total_calculated;
  END IF;
  RAISE NOTICE 'OK Test 3.4: tum answer is_correct hesaplandi';
END $$;

-- Test 3.5: Score formulu (linear decay, instant cevap ~1000)
DO $$
DECLARE v_max_points INT; v_correct_count INT;
BEGIN
  -- Cevap dogru olanlardan en yuksek points
  SELECT COALESCE(MAX(points_awarded), 0), count(*) FILTER (WHERE is_correct = TRUE)
    INTO v_max_points, v_correct_count
    FROM public.room_answers
    WHERE room_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND is_correct = TRUE;

  -- Eger en az 1 dogru cevap varsa: instant cevap ~1000 points (response_ms<1000ms)
  -- Yanlissa: 0 points
  IF v_correct_count > 0 AND v_max_points < 900 THEN
    RAISE EXCEPTION 'FAIL Test 3.5: max points % beklenmiyor (instant ~1000)', v_max_points;
  END IF;
  RAISE NOTICE 'OK Test 3.5: % dogru cevap, max points = %', v_correct_count, v_max_points;
END $$;

-- Test 3.6: room_members.score guncellendi (sum of points)
DO $$
DECLARE v_player_score INT;
BEGIN
  SELECT score INTO v_player_score FROM public.room_members
    WHERE room_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND user_id = '33333333-3333-3333-3333-333333333333';
  -- Player2'nin score'u >= 0 (correct ise high, incorrect ise 0)
  IF v_player_score IS NULL OR v_player_score < 0 THEN
    RAISE EXCEPTION 'FAIL Test 3.6: player score % anormal', v_player_score;
  END IF;
  RAISE NOTICE 'OK Test 3.6: player2 score = %', v_player_score;
END $$;

-- Test 3.7: Idempotent re-reveal (zaten reveal'da, no-op)
DO $$
BEGIN
  PERFORM public.reveal_round('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);
  RAISE NOTICE 'OK Test 3.7: re-reveal idempotent (no error)';
END $$;

-- Test 3.8: Submit blocked during reveal state (P0003)
SELECT set_config('request.jwt.claim.sub',
                  '33333333-3333-3333-3333-333333333333', FALSE);
DO $$
BEGIN
  PERFORM public.submit_answer(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'c'::text
  );
  RAISE EXCEPTION 'FAIL Test 3.8: reveal state submit basarili';
EXCEPTION
  WHEN sqlstate 'P0003' THEN
    RAISE NOTICE 'OK Test 3.8: reveal state submit bloke (P0003)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 3.8: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- =============================================================================
-- Section 4: advance_round (reveal -> next active OR -> completed)
-- =============================================================================

-- Test 4.1: Non-host advance fail
SELECT set_config('request.jwt.claim.sub',
                  '33333333-3333-3333-3333-333333333333', FALSE);
DO $$
BEGIN
  PERFORM public.advance_round('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);
  RAISE EXCEPTION 'FAIL Test 4.1: non-host advance basarili';
EXCEPTION
  WHEN sqlstate 'P0001' THEN
    RAISE NOTICE 'OK Test 4.1: non-host advance bloke (P0001)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 4.1: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- Test 4.2: Host advance reveal -> active (round 2 baslar)
SELECT set_config('request.jwt.claim.sub',
                  '22222222-2222-2222-2222-222222222222', FALSE);
DO $$
BEGIN
  PERFORM public.advance_round('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);
  RAISE NOTICE 'OK Test 4.2: advance reveal->active (round 2)';
END $$;

-- Test 4.3: current_round_index=2 + state='active'
DO $$
DECLARE v_idx SMALLINT; v_state TEXT;
BEGIN
  SELECT current_round_index, state INTO v_idx, v_state
    FROM public.rooms
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF v_idx <> 2 OR v_state <> 'active' THEN
    RAISE EXCEPTION 'FAIL Test 4.3: idx=%, state=% beklenmiyor', v_idx, v_state;
  END IF;
  RAISE NOTICE 'OK Test 4.3: round 2 active';
END $$;

-- Test 4.4: Round 2, 3, 4'u reveal+advance ile gec (round 5 = last)
DO $$
BEGIN
  PERFORM public.reveal_round('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);
  PERFORM public.advance_round('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);
  PERFORM public.reveal_round('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);
  PERFORM public.advance_round('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);
  PERFORM public.reveal_round('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);
  PERFORM public.advance_round('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);
  RAISE NOTICE 'OK Test 4.4: round 2-3-4 reveal+advance';
END $$;

-- Test 4.5: round 5 active (last round)
DO $$
DECLARE v_idx SMALLINT; v_state TEXT;
BEGIN
  SELECT current_round_index, state INTO v_idx, v_state
    FROM public.rooms
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF v_idx <> 5 OR v_state <> 'active' THEN
    RAISE EXCEPTION 'FAIL Test 4.5: idx=%, state=% beklenmiyor', v_idx, v_state;
  END IF;
  RAISE NOTICE 'OK Test 4.5: round 5 (last) active';
END $$;

-- Test 4.6: reveal + advance round 5 -> state='completed'
DO $$
BEGIN
  PERFORM public.reveal_round('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);
  PERFORM public.advance_round('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);
  RAISE NOTICE 'OK Test 4.6: last round reveal+advance';
END $$;

DO $$
DECLARE v_state TEXT; v_ended TIMESTAMPTZ;
BEGIN
  SELECT state, ended_at INTO v_state, v_ended
    FROM public.rooms
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF v_state <> 'completed' OR v_ended IS NULL THEN
    RAISE EXCEPTION 'FAIL Test 4.6 verify: state=%, ended=%', v_state, v_ended;
  END IF;
  RAISE NOTICE 'OK Test 4.6 verify: state=completed, ended_at dolu';
END $$;

-- Test 4.7: completed state'inde advance fail (P0003)
DO $$
BEGIN
  PERFORM public.advance_round('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid);
  RAISE EXCEPTION 'FAIL Test 4.7: completed state advance basarili';
EXCEPTION
  WHEN sqlstate 'P0003' THEN
    RAISE NOTICE 'OK Test 4.7: completed advance bloke (P0003)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 4.7: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- =============================================================================
-- Section 4-extra: Codex P1 race fix regression guard (Test 4.9)
-- =============================================================================
-- Race scenario (Codex PR #38 P1):
--   submit reads state='active' (eski snapshot) → reveal_round commit eder
--   → submit INSERT happens AFTER reveal'in UPDATE'i → row is_correct=NULL
--   sonsuza kalir (silent corruption).
-- Fix: submit_answer'da FOR SHARE on round + revealed_at IS NOT NULL check.
-- Test: synthetic setup ile revealed_at SET olan bir round olustur, state
-- 'active' goster, submit_answer P0012 atmali.

-- Synthetic: yeni room, round revealed_at SET, state='active' (race outcome simule)
INSERT INTO public.rooms
  (id, code, host_id, title, category, difficulty, question_count,
   max_players, per_question_seconds, mode, state, current_round_index)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'RACEAA',
   '22222222-2222-2222-2222-222222222222', 'Race Test', 'cebir', 2, 5,
   8, 20, 'sync', 'active', 1);

INSERT INTO public.room_members (room_id, user_id, role)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '22222222-2222-2222-2222-222222222222', 'host'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '55555555-5555-5555-5555-555555555555', 'player');

-- round_index=1 with revealed_at SET (race outcome simule eden state)
INSERT INTO public.room_rounds
  (room_id, round_index, question_id, question_content_snapshot,
   started_at, ends_at, revealed_at)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, gen_random_uuid(),
   '{"question":"q","options":["a","b"],"answer":"a"}'::jsonb,
   NOW() - INTERVAL '5 seconds', NOW() + INTERVAL '30 seconds',
   NOW() - INTERVAL '1 second');  -- revealed_at SET = race fix tetikleyici

-- Test 4.9: late submitter P0012 alir
SELECT set_config('request.jwt.claim.sub',
                  '55555555-5555-5555-5555-555555555555', FALSE);
DO $$
BEGIN
  PERFORM public.submit_answer(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
    'a'::text
  );
  RAISE EXCEPTION 'FAIL Test 4.9: race-fix bypass — late submit basarili';
EXCEPTION
  WHEN sqlstate 'P0012' THEN
    RAISE NOTICE 'OK Test 4.9: revealed_at gate aktif, late submit bloke (P0012)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 4.9: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- Reset: ana test odasina don audit count icin
SELECT set_config('request.jwt.claim.sub',
                  '22222222-2222-2222-2222-222222222222', FALSE);

-- Test 4.8: Audit log entry'leri
DO $$
DECLARE v_round_started INT; v_round_revealed INT; v_room_completed INT;
BEGIN
  SELECT
    count(*) FILTER (WHERE action = 'round_started'),
    count(*) FILTER (WHERE action = 'round_revealed'),
    count(*) FILTER (WHERE action = 'room_completed')
    INTO v_round_started, v_round_revealed, v_room_completed
    FROM public.room_audit_log
    WHERE room_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  -- 5 round_started (1..5) + 5 round_revealed + 1 room_completed
  IF v_round_started <> 5 OR v_round_revealed <> 5 OR v_room_completed <> 1 THEN
    RAISE EXCEPTION 'FAIL Test 4.8: audit count: started=% revealed=% completed=%',
                    v_round_started, v_round_revealed, v_room_completed;
  END IF;
  RAISE NOTICE 'OK Test 4.8: audit log 5+5+1 entries';
END $$;

ROLLBACK;
