-- =============================================================================
-- Bilge Arena Oda Sistemi: 14_bot_answers test (Sprint 2B Task 4 PR2)
-- =============================================================================
-- TDD GREEN dogrulama: 14_bot_answers.sql migration uygulandiktan sonra.
--
-- 11 Test:
--   T1: _submit_bot_answers_for_round helper var (2 arg, VOID, SECURITY DEFINER)
--   T2: _bot_answers_round_start_trigger function var (SECURITY DEFINER)
--   T3: trg_bot_answers_on_round_start trigger var (AFTER UPDATE OF started_at)
--   T4: REVOKE PUBLIC on _submit_bot_answers_for_round (sadece trigger cagiri)
--   T5: Trigger integration: oda + 3 bot member + UPDATE started_at -> 3 bot answer
--   T6: Bot answer fields: points_awarded=0, is_correct=NULL (gercek user paterni)
--   T7: response_ms range 5000-15000 (humanlike)
--   T8: Bot answer.user_id = bot member.user_id (gercek user'a bulasmaz)
--   T9: Trigger guard — revealed_at NOT NULL ise atla (idempotent)
--   T10: UNIQUE(round_id, user_id) — UPDATE started_at again no duplicate insert
--   T11: Bot accuracy difficulty 2 (%80 hedef +/- %15) — 50 round random smoke
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/14_bot_answers_test.sql
--
-- Beklenen: tum NOTICE 'OK: ...', exit 0
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- T1: _submit_bot_answers_for_round helper var
-- =============================================================================
DO $$
DECLARE
  v_arg_count INT;
  v_return TEXT;
  v_security TEXT;
BEGIN
  SELECT pronargs,
         pg_catalog.format_type(prorettype, NULL),
         CASE WHEN prosecdef THEN 'DEFINER' ELSE 'INVOKER' END
  INTO v_arg_count, v_return, v_security
  FROM pg_proc
  WHERE proname = '_submit_bot_answers_for_round'
    AND pronamespace = 'public'::regnamespace;

  IF v_arg_count IS NULL THEN
    RAISE EXCEPTION 'T1 FAIL: _submit_bot_answers_for_round bulunamadi';
  END IF;
  IF v_arg_count <> 2 THEN
    RAISE EXCEPTION 'T1 FAIL: arg sayisi 2 olmali, mevcut: %', v_arg_count;
  END IF;
  IF v_return <> 'void' THEN
    RAISE EXCEPTION 'T1 FAIL: return void olmali, mevcut: %', v_return;
  END IF;
  IF v_security <> 'DEFINER' THEN
    RAISE EXCEPTION 'T1 FAIL: SECURITY DEFINER olmali, mevcut: %', v_security;
  END IF;

  RAISE NOTICE 'OK: T1 _submit_bot_answers_for_round (2 arg, VOID, SECURITY DEFINER)';
END $$;

-- =============================================================================
-- T2: _bot_answers_round_start_trigger function var (SECURITY DEFINER)
-- =============================================================================
DO $$
DECLARE
  v_return TEXT;
  v_security TEXT;
BEGIN
  SELECT pg_catalog.format_type(prorettype, NULL),
         CASE WHEN prosecdef THEN 'DEFINER' ELSE 'INVOKER' END
  INTO v_return, v_security
  FROM pg_proc
  WHERE proname = '_bot_answers_round_start_trigger'
    AND pronamespace = 'public'::regnamespace;

  IF v_return IS NULL THEN
    RAISE EXCEPTION 'T2 FAIL: _bot_answers_round_start_trigger bulunamadi';
  END IF;
  IF v_return <> 'trigger' THEN
    RAISE EXCEPTION 'T2 FAIL: return trigger olmali, mevcut: %', v_return;
  END IF;
  IF v_security <> 'DEFINER' THEN
    RAISE EXCEPTION 'T2 FAIL: SECURITY DEFINER olmali, mevcut: %', v_security;
  END IF;

  RAISE NOTICE 'OK: T2 _bot_answers_round_start_trigger (TRIGGER, SECURITY DEFINER)';
END $$;

-- =============================================================================
-- T3: trg_bot_answers_on_round_start trigger var
-- =============================================================================
DO $$
DECLARE
  v_timing TEXT;
  v_event TEXT;
  v_orientation TEXT;
BEGIN
  SELECT action_timing, event_manipulation, action_orientation
  INTO v_timing, v_event, v_orientation
  FROM information_schema.triggers
  WHERE trigger_name = 'trg_bot_answers_on_round_start'
    AND event_object_table = 'room_rounds'
    AND event_object_schema = 'public'
  LIMIT 1;

  IF v_timing IS NULL THEN
    RAISE EXCEPTION 'T3 FAIL: trg_bot_answers_on_round_start trigger bulunamadi';
  END IF;
  IF v_timing <> 'AFTER' THEN
    RAISE EXCEPTION 'T3 FAIL: timing AFTER olmali, mevcut: %', v_timing;
  END IF;
  IF v_event <> 'UPDATE' THEN
    RAISE EXCEPTION 'T3 FAIL: event UPDATE olmali, mevcut: %', v_event;
  END IF;
  IF v_orientation <> 'ROW' THEN
    RAISE EXCEPTION 'T3 FAIL: orientation ROW olmali, mevcut: %', v_orientation;
  END IF;

  RAISE NOTICE 'OK: T3 trg_bot_answers_on_round_start (AFTER UPDATE FOR EACH ROW)';
END $$;

-- =============================================================================
-- T4: REVOKE PUBLIC on _submit_bot_answers_for_round
-- =============================================================================
DO $$
DECLARE
  v_public_has BOOLEAN;
  v_authenticated_has BOOLEAN;
BEGIN
  SELECT has_function_privilege('public',
    'public._submit_bot_answers_for_round(uuid, smallint)', 'EXECUTE')
    INTO v_public_has;
  SELECT has_function_privilege('authenticated',
    'public._submit_bot_answers_for_round(uuid, smallint)', 'EXECUTE')
    INTO v_authenticated_has;

  IF v_public_has THEN
    RAISE EXCEPTION 'T4 FAIL: PUBLIC EXECUTE gonderilmemeli (helper)';
  END IF;
  IF v_authenticated_has THEN
    RAISE EXCEPTION 'T4 FAIL: authenticated EXECUTE gonderilmemeli (sadece trigger cagiri)';
  END IF;

  RAISE NOTICE 'OK: T4 _submit_bot_answers_for_round REVOKE PUBLIC + no GRANT';
END $$;

-- =============================================================================
-- T5: Trigger integration — UPDATE started_at -> 3 bot answer insert
-- =============================================================================
DO $$
DECLARE
  v_host_user UUID := gen_random_uuid();
  v_bot1 UUID := gen_random_uuid();
  v_bot2 UUID := gen_random_uuid();
  v_bot3 UUID := gen_random_uuid();
  v_room_id UUID;
  v_round_id UUID;
  v_answer_count INT;
BEGIN
  -- Setup: oda + 1 host + 3 bot
  INSERT INTO public.rooms
    (code, host_id, title, category, difficulty, question_count,
     max_players, per_question_seconds, mode, state, current_round_index,
     is_public, auto_advance_seconds)
  VALUES
    ('BTAR55', v_host_user, 'T5 bot trigger', 'matematik', 2::SMALLINT, 10::SMALLINT,
     4::SMALLINT, 20::SMALLINT, 'sync', 'active', 1::SMALLINT, FALSE, 5)
  RETURNING id INTO v_room_id;

  INSERT INTO public.room_members (room_id, user_id, role, is_bot, display_name)
    VALUES
      (v_room_id, v_host_user, 'host', FALSE, NULL),
      (v_room_id, v_bot1, 'player', TRUE, 'Bot 1'),
      (v_room_id, v_bot2, 'player', TRUE, 'Bot 2'),
      (v_room_id, v_bot3, 'player', TRUE, 'Bot 3');

  -- Round insert (started_at deger var, ama sonra UPDATE ile trigger ateslenir)
  INSERT INTO public.room_rounds
    (room_id, round_index, question_id, question_content_snapshot,
     started_at, ends_at)
  VALUES
    (v_room_id, 1::SMALLINT, gen_random_uuid(),
     '{"question":"2+2","options":["3","4","5","6"],"answer":"4"}'::jsonb,
     NOW() - INTERVAL '1 minute', NOW() + INTERVAL '20 seconds')
  RETURNING id INTO v_round_id;

  -- INSERT'te trigger atesleNMEZ (AFTER UPDATE OF started_at) — bot answer yok
  SELECT COUNT(*) INTO v_answer_count
  FROM public.room_answers WHERE round_id = v_round_id;
  IF v_answer_count <> 0 THEN
    RAISE EXCEPTION 'T5 FAIL: INSERT trigger atesledi (% answer var)', v_answer_count;
  END IF;

  -- Trigger ates: UPDATE started_at = NOW()
  UPDATE public.room_rounds
    SET started_at = NOW()
    WHERE id = v_round_id;

  -- 3 bot answer insert edilmeli
  SELECT COUNT(*) INTO v_answer_count
  FROM public.room_answers WHERE round_id = v_round_id;
  IF v_answer_count <> 3 THEN
    RAISE EXCEPTION 'T5 FAIL: UPDATE sonrasi 3 bot answer beklenir, mevcut: %', v_answer_count;
  END IF;

  RAISE NOTICE 'OK: T5 trigger UPDATE started_at -> 3 bot answer';
END $$;

-- =============================================================================
-- T6: Bot answer fields paterni (points_awarded=0, is_correct=NULL)
-- =============================================================================
DO $$
DECLARE
  v_host_user UUID := gen_random_uuid();
  v_bot1 UUID := gen_random_uuid();
  v_room_id UUID;
  v_round_id UUID;
  v_points INT;
  v_is_correct BOOLEAN;
BEGIN
  INSERT INTO public.rooms
    (code, host_id, title, category, difficulty, question_count,
     max_players, per_question_seconds, mode, state, current_round_index,
     is_public, auto_advance_seconds)
  VALUES
    ('BTAR66', v_host_user, 'T6 fields', 'matematik', 2::SMALLINT, 10::SMALLINT,
     4::SMALLINT, 20::SMALLINT, 'sync', 'active', 1::SMALLINT, FALSE, 5)
  RETURNING id INTO v_room_id;

  INSERT INTO public.room_members (room_id, user_id, role, is_bot)
    VALUES
      (v_room_id, v_host_user, 'host', FALSE),
      (v_room_id, v_bot1, 'player', TRUE);

  INSERT INTO public.room_rounds
    (room_id, round_index, question_id, question_content_snapshot,
     started_at, ends_at)
  VALUES
    (v_room_id, 1::SMALLINT, gen_random_uuid(),
     '{"question":"x","options":["a","b","c","d"],"answer":"a"}'::jsonb,
     NOW() - INTERVAL '1 minute', NOW() + INTERVAL '20 seconds')
  RETURNING id INTO v_round_id;

  UPDATE public.room_rounds SET started_at = NOW() WHERE id = v_round_id;

  SELECT points_awarded, is_correct INTO v_points, v_is_correct
  FROM public.room_answers
  WHERE round_id = v_round_id AND user_id = v_bot1;

  IF v_points <> 0 THEN
    RAISE EXCEPTION 'T6 FAIL: points_awarded 0 olmali, mevcut: %', v_points;
  END IF;
  IF v_is_correct IS NOT NULL THEN
    RAISE EXCEPTION 'T6 FAIL: is_correct NULL olmali, mevcut: %', v_is_correct;
  END IF;

  RAISE NOTICE 'OK: T6 bot answer points_awarded=0, is_correct=NULL (reveal_round paterni)';
END $$;

-- =============================================================================
-- T7: response_ms range 5000-15000 (humanlike)
-- =============================================================================
DO $$
DECLARE
  v_host_user UUID := gen_random_uuid();
  v_bot1 UUID := gen_random_uuid();
  v_bot2 UUID := gen_random_uuid();
  v_bot3 UUID := gen_random_uuid();
  v_room_id UUID;
  v_round_id UUID;
  v_min_ms INT;
  v_max_ms INT;
  v_count INT;
BEGIN
  INSERT INTO public.rooms
    (code, host_id, title, category, difficulty, question_count,
     max_players, per_question_seconds, mode, state, current_round_index,
     is_public, auto_advance_seconds)
  VALUES
    ('BTAR77', v_host_user, 'T7 response_ms', 'matematik', 2::SMALLINT, 10::SMALLINT,
     4::SMALLINT, 20::SMALLINT, 'sync', 'active', 1::SMALLINT, FALSE, 5)
  RETURNING id INTO v_room_id;

  INSERT INTO public.room_members (room_id, user_id, role, is_bot)
    VALUES
      (v_room_id, v_host_user, 'host', FALSE),
      (v_room_id, v_bot1, 'player', TRUE),
      (v_room_id, v_bot2, 'player', TRUE),
      (v_room_id, v_bot3, 'player', TRUE);

  INSERT INTO public.room_rounds
    (room_id, round_index, question_id, question_content_snapshot,
     started_at, ends_at)
  VALUES
    (v_room_id, 1::SMALLINT, gen_random_uuid(),
     '{"question":"x","options":["a","b","c","d"],"answer":"a"}'::jsonb,
     NOW() - INTERVAL '1 minute', NOW() + INTERVAL '20 seconds')
  RETURNING id INTO v_round_id;

  UPDATE public.room_rounds SET started_at = NOW() WHERE id = v_round_id;

  SELECT MIN(response_ms), MAX(response_ms), COUNT(*)
  INTO v_min_ms, v_max_ms, v_count
  FROM public.room_answers WHERE round_id = v_round_id;

  IF v_count <> 3 THEN
    RAISE EXCEPTION 'T7 FAIL: 3 bot answer beklenir, mevcut: %', v_count;
  END IF;
  IF v_min_ms < 5000 THEN
    RAISE EXCEPTION 'T7 FAIL: response_ms minimum 5000 olmali, mevcut: %', v_min_ms;
  END IF;
  IF v_max_ms > 15000 THEN
    RAISE EXCEPTION 'T7 FAIL: response_ms maksimum 15000 olmali, mevcut: %', v_max_ms;
  END IF;

  RAISE NOTICE 'OK: T7 response_ms range [%, %] within [5000, 15000]', v_min_ms, v_max_ms;
END $$;

-- =============================================================================
-- T8: Bot answer.user_id = bot member.user_id (gercek host'a bulasmaz)
-- =============================================================================
DO $$
DECLARE
  v_host_user UUID := gen_random_uuid();
  v_bot1 UUID := gen_random_uuid();
  v_bot2 UUID := gen_random_uuid();
  v_bot3 UUID := gen_random_uuid();
  v_room_id UUID;
  v_round_id UUID;
  v_host_count INT;
  v_bot_count INT;
BEGIN
  INSERT INTO public.rooms
    (code, host_id, title, category, difficulty, question_count,
     max_players, per_question_seconds, mode, state, current_round_index,
     is_public, auto_advance_seconds)
  VALUES
    ('BTAR88', v_host_user, 'T8 host bypass', 'matematik', 2::SMALLINT, 10::SMALLINT,
     4::SMALLINT, 20::SMALLINT, 'sync', 'active', 1::SMALLINT, FALSE, 5)
  RETURNING id INTO v_room_id;

  INSERT INTO public.room_members (room_id, user_id, role, is_bot)
    VALUES
      (v_room_id, v_host_user, 'host', FALSE),
      (v_room_id, v_bot1, 'player', TRUE),
      (v_room_id, v_bot2, 'player', TRUE),
      (v_room_id, v_bot3, 'player', TRUE);

  INSERT INTO public.room_rounds
    (room_id, round_index, question_id, question_content_snapshot,
     started_at, ends_at)
  VALUES
    (v_room_id, 1::SMALLINT, gen_random_uuid(),
     '{"question":"x","options":["a","b","c","d"],"answer":"a"}'::jsonb,
     NOW() - INTERVAL '1 minute', NOW() + INTERVAL '20 seconds')
  RETURNING id INTO v_round_id;

  UPDATE public.room_rounds SET started_at = NOW() WHERE id = v_round_id;

  SELECT COUNT(*) INTO v_host_count
  FROM public.room_answers
  WHERE round_id = v_round_id AND user_id = v_host_user;
  IF v_host_count <> 0 THEN
    RAISE EXCEPTION 'T8 FAIL: Host icin trigger answer eklemis (% adet)', v_host_count;
  END IF;

  SELECT COUNT(*) INTO v_bot_count
  FROM public.room_answers ra
  JOIN public.room_members rm
    ON rm.room_id = ra.room_id AND rm.user_id = ra.user_id
  WHERE ra.round_id = v_round_id AND rm.is_bot = TRUE;
  IF v_bot_count <> 3 THEN
    RAISE EXCEPTION 'T8 FAIL: Bot answer count 3 olmali, mevcut: %', v_bot_count;
  END IF;

  RAISE NOTICE 'OK: T8 bot answer sadece is_bot=TRUE uyeler icin';
END $$;

-- =============================================================================
-- T9: Trigger guard — revealed_at NOT NULL ise atla (idempotent)
-- =============================================================================
DO $$
DECLARE
  v_host_user UUID := gen_random_uuid();
  v_bot1 UUID := gen_random_uuid();
  v_room_id UUID;
  v_round_id UUID;
  v_answer_count INT;
BEGIN
  INSERT INTO public.rooms
    (code, host_id, title, category, difficulty, question_count,
     max_players, per_question_seconds, mode, state, current_round_index,
     is_public, auto_advance_seconds)
  VALUES
    ('BTAR99', v_host_user, 'T9 revealed guard', 'matematik', 2::SMALLINT, 10::SMALLINT,
     4::SMALLINT, 20::SMALLINT, 'sync', 'reveal', 1::SMALLINT, FALSE, 5)
  RETURNING id INTO v_room_id;

  INSERT INTO public.room_members (room_id, user_id, role, is_bot)
    VALUES
      (v_room_id, v_host_user, 'host', FALSE),
      (v_room_id, v_bot1, 'player', TRUE);

  -- revealed_at zaten NOT NULL (round bitmis)
  INSERT INTO public.room_rounds
    (room_id, round_index, question_id, question_content_snapshot,
     started_at, ends_at, revealed_at)
  VALUES
    (v_room_id, 1::SMALLINT, gen_random_uuid(),
     '{"question":"x","options":["a","b"],"answer":"a"}'::jsonb,
     NOW() - INTERVAL '1 minute', NOW() - INTERVAL '30 seconds',
     NOW() - INTERVAL '20 seconds')
  RETURNING id INTO v_round_id;

  -- Trigger ates: UPDATE started_at — ama revealed_at NOT NULL, atla
  UPDATE public.room_rounds SET started_at = NOW() WHERE id = v_round_id;

  SELECT COUNT(*) INTO v_answer_count
  FROM public.room_answers WHERE round_id = v_round_id;

  IF v_answer_count <> 0 THEN
    RAISE EXCEPTION 'T9 FAIL: revealed_at NOT NULL trigger atesledi (% answer)', v_answer_count;
  END IF;

  RAISE NOTICE 'OK: T9 revealed_at NOT NULL trigger atladi (idempotent guard)';
END $$;

-- =============================================================================
-- T10: UNIQUE(round_id, user_id) — UPDATE started_at again no duplicate
-- =============================================================================
DO $$
DECLARE
  v_host_user UUID := gen_random_uuid();
  v_bot1 UUID := gen_random_uuid();
  v_room_id UUID;
  v_round_id UUID;
  v_answer_count INT;
BEGIN
  INSERT INTO public.rooms
    (code, host_id, title, category, difficulty, question_count,
     max_players, per_question_seconds, mode, state, current_round_index,
     is_public, auto_advance_seconds)
  VALUES
    ('BTAA22', v_host_user, 'T10 unique', 'matematik', 2::SMALLINT, 10::SMALLINT,
     4::SMALLINT, 20::SMALLINT, 'sync', 'active', 1::SMALLINT, FALSE, 5)
  RETURNING id INTO v_room_id;

  INSERT INTO public.room_members (room_id, user_id, role, is_bot)
    VALUES
      (v_room_id, v_host_user, 'host', FALSE),
      (v_room_id, v_bot1, 'player', TRUE);

  INSERT INTO public.room_rounds
    (room_id, round_index, question_id, question_content_snapshot,
     started_at, ends_at)
  VALUES
    (v_room_id, 1::SMALLINT, gen_random_uuid(),
     '{"question":"x","options":["a","b","c","d"],"answer":"a"}'::jsonb,
     NOW() - INTERVAL '1 minute', NOW() + INTERVAL '20 seconds')
  RETURNING id INTO v_round_id;

  -- Ilk trigger: bot answer insert
  UPDATE public.room_rounds SET started_at = NOW() WHERE id = v_round_id;

  SELECT COUNT(*) INTO v_answer_count
  FROM public.room_answers WHERE round_id = v_round_id;
  IF v_answer_count <> 1 THEN
    RAISE EXCEPTION 'T10 FAIL: ilk update sonrasi 1 answer beklenir, mevcut: %', v_answer_count;
  END IF;

  -- Ikinci trigger: NOT EXISTS guard ile duplicate atlanir
  UPDATE public.room_rounds SET started_at = NOW() + INTERVAL '1 second'
    WHERE id = v_round_id;

  SELECT COUNT(*) INTO v_answer_count
  FROM public.room_answers WHERE round_id = v_round_id;
  IF v_answer_count <> 1 THEN
    RAISE EXCEPTION 'T10 FAIL: ikinci update sonrasi hala 1 answer beklenir (NOT EXISTS guard), mevcut: %', v_answer_count;
  END IF;

  RAISE NOTICE 'OK: T10 NOT EXISTS guard duplicate insert engelledi';
END $$;

-- =============================================================================
-- T11: Bot accuracy difficulty 2 (%80 hedef +/- %15) smoke
-- =============================================================================
-- 50 round, her birinde 1 bot. difficulty=2 -> %80 dogru. Statistical
-- confidence: 50 sample, p=0.80, std-dev = sqrt(0.80*0.20/50) ~= 5.6%.
-- 95% CI ~= [69%, 91%]. Tolerans %15 = [65%, 95%] guvenli.
DO $$
DECLARE
  v_host_user UUID := gen_random_uuid();
  v_room_id UUID;
  v_round_id UUID;
  v_correct_count INT := 0;
  v_total INT := 50;
  v_i INT;
  v_bot_id UUID;
  v_answer TEXT;
  v_correct_answer TEXT := 'a';
  v_accuracy NUMERIC;
BEGIN
  -- Sabit oda + question
  INSERT INTO public.rooms
    (code, host_id, title, category, difficulty, question_count,
     max_players, per_question_seconds, mode, state, current_round_index,
     is_public, auto_advance_seconds)
  VALUES
    ('BTAA33', v_host_user, 'T11 accuracy', 'matematik', 2::SMALLINT, 10::SMALLINT,
     4::SMALLINT, 20::SMALLINT, 'sync', 'active', 1::SMALLINT, FALSE, 5)
  RETURNING id INTO v_room_id;

  INSERT INTO public.room_members (room_id, user_id, role, is_bot)
    VALUES (v_room_id, v_host_user, 'host', FALSE);

  -- 50 farkli bot member + round + UPDATE -> 50 bot answer
  FOR v_i IN 1..v_total LOOP
    v_bot_id := gen_random_uuid();
    INSERT INTO public.room_members (room_id, user_id, role, is_bot)
      VALUES (v_room_id, v_bot_id, 'player', TRUE);

    INSERT INTO public.room_rounds
      (room_id, round_index, question_id, question_content_snapshot,
       started_at, ends_at)
    VALUES
      (v_room_id, (v_i + 1)::SMALLINT, gen_random_uuid(),
       '{"question":"x","options":["a","b","c","d"],"answer":"a"}'::jsonb,
       NOW() - INTERVAL '1 minute', NOW() + INTERVAL '20 seconds')
    RETURNING id INTO v_round_id;

    -- Bu round'da sadece bu bot member var (digerleri farkli round_id'de)
    -- ama NOT EXISTS check round_id bazli, bu yuzden her round bot'unu
    -- icermeli. Ama biz farkli room_members eklediysek tum botlar her
    -- round'a cevap verir. Cozum: deactivate diger botlari.
    UPDATE public.room_members SET is_active = FALSE
      WHERE room_id = v_room_id AND user_id <> v_host_user AND user_id <> v_bot_id;

    -- Trigger ates
    UPDATE public.room_rounds SET started_at = NOW() WHERE id = v_round_id;

    -- Active bot'u tekrar aktif et (sonraki iterasyon icin temiz state)
    UPDATE public.room_members SET is_active = TRUE
      WHERE room_id = v_room_id AND user_id = v_bot_id;

    -- Cevap dogru mu?
    SELECT answer_value INTO v_answer
    FROM public.room_answers
    WHERE round_id = v_round_id AND user_id = v_bot_id;

    IF v_answer = v_correct_answer THEN
      v_correct_count := v_correct_count + 1;
    END IF;
  END LOOP;

  v_accuracy := v_correct_count::NUMERIC / v_total;

  -- Tolerans: %65 - %95 (hedef %80, +/- %15)
  IF v_accuracy < 0.65 OR v_accuracy > 0.95 THEN
    RAISE EXCEPTION 'T11 FAIL: difficulty=2 accuracy [%, %] araligi disinda: %',
                    0.65, 0.95, v_accuracy;
  END IF;

  RAISE NOTICE 'OK: T11 difficulty=2 bot accuracy: % / % rounds correct (target 0.80)',
               v_correct_count, v_total;
END $$;

ROLLBACK;
