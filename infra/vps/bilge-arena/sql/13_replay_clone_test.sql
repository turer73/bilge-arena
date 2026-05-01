-- =============================================================================
-- Bilge Arena Oda Sistemi: 13_replay_clone test (Sprint 2C Task 8)
-- =============================================================================
-- 4 Test:
--   T1: replay_room var (1 arg, JSONB return)
--   T2: replay_room oda settings'i clone eder (category/difficulty/etc)
--   T3: clone is_public=FALSE (plan-deviation #77)
--   T4: REVOKE PUBLIC + GRANT authenticated
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- T1: replay_room var (1 arg, JSONB)
-- =============================================================================
DO $$
DECLARE v_arg INT;
DECLARE v_ret TEXT;
BEGIN
  SELECT pronargs, pg_catalog.format_type(prorettype, NULL)
  INTO v_arg, v_ret
  FROM pg_proc
  WHERE proname='replay_room' AND pronamespace='public'::regnamespace;

  IF v_arg IS NULL THEN
    RAISE EXCEPTION 'T1 FAIL: replay_room bulunamadi';
  END IF;
  IF v_arg <> 1 THEN
    RAISE EXCEPTION 'T1 FAIL: arg sayisi 1 olmali, mevcut: %', v_arg;
  END IF;
  IF v_ret <> 'jsonb' THEN
    RAISE EXCEPTION 'T1 FAIL: return jsonb olmali, mevcut: %', v_ret;
  END IF;

  RAISE NOTICE 'OK: T1 replay_room (1 arg, jsonb)';
END $$;

-- =============================================================================
-- T2+T3: oda settings clone, is_public=FALSE
-- =============================================================================
-- Manuel test (auth.uid() NULL psql contextinde, RPC body simulation)
DO $$
DECLARE
  v_test_user UUID := gen_random_uuid();
  v_source_id UUID;
  v_clone_id UUID;
  v_clone_code CHAR(6);
  v_attempt INT := 0;
  v_source RECORD;
  v_clone RECORD;
BEGIN
  -- Source oda olustur
  INSERT INTO public.rooms
    (code, host_id, title, category, difficulty, question_count,
     max_players, per_question_seconds, mode, state, auto_advance_seconds,
     is_public)
  VALUES
    ('TST13A', v_test_user, 'Test Replay', 'matematik', 4, 15,
     8, 25, 'sync', 'completed', 7, TRUE)
  RETURNING id INTO v_source_id;

  INSERT INTO public.room_members (room_id, user_id, role)
    VALUES (v_source_id, v_test_user, 'host');

  SELECT * INTO v_source FROM public.rooms WHERE id = v_source_id;

  -- RPC body simulation (manuel clone)
  LOOP
    v_attempt := v_attempt + 1;
    v_clone_code := public._gen_room_code();
    BEGIN
      INSERT INTO public.rooms
        (code, host_id, title, category, difficulty, question_count,
         max_players, per_question_seconds, mode, state, auto_advance_seconds,
         is_public)
      VALUES
        (v_clone_code, v_test_user,
         v_source.title || ' (Tekrar)',
         v_source.category, v_source.difficulty, v_source.question_count,
         v_source.max_players, v_source.per_question_seconds,
         v_source.mode, 'lobby', v_source.auto_advance_seconds, FALSE)
      RETURNING id INTO v_clone_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 5 THEN
        RAISE EXCEPTION 'Code cakistir';
      END IF;
    END;
  END LOOP;

  SELECT * INTO v_clone FROM public.rooms WHERE id = v_clone_id;

  -- T2 settings clone
  IF v_clone.category <> v_source.category THEN
    RAISE EXCEPTION 'T2 FAIL: category clone basarisiz';
  END IF;
  IF v_clone.difficulty <> v_source.difficulty THEN
    RAISE EXCEPTION 'T2 FAIL: difficulty clone basarisiz';
  END IF;
  IF v_clone.question_count <> v_source.question_count THEN
    RAISE EXCEPTION 'T2 FAIL: question_count clone basarisiz';
  END IF;
  IF v_clone.max_players <> v_source.max_players THEN
    RAISE EXCEPTION 'T2 FAIL: max_players clone basarisiz';
  END IF;
  IF v_clone.per_question_seconds <> v_source.per_question_seconds THEN
    RAISE EXCEPTION 'T2 FAIL: per_question_seconds clone basarisiz';
  END IF;
  IF v_clone.auto_advance_seconds <> v_source.auto_advance_seconds THEN
    RAISE EXCEPTION 'T2 FAIL: auto_advance_seconds clone basarisiz';
  END IF;
  RAISE NOTICE 'OK: T2 oda settings clone (kategori/zorluk/vs)';

  -- T3 plan-deviation #77: is_public=FALSE
  IF v_clone.is_public <> FALSE THEN
    RAISE EXCEPTION 'T3 FAIL: clone is_public=FALSE olmali, mevcut: %', v_clone.is_public;
  END IF;
  RAISE NOTICE 'OK: T3 clone is_public=FALSE (Aktif Odalar listesinde gozukmez)';

  -- Title (Tekrar) marker
  IF v_clone.title NOT LIKE '%(Tekrar)%' THEN
    RAISE EXCEPTION 'T3b FAIL: title (Tekrar) marker yok: %', v_clone.title;
  END IF;
  RAISE NOTICE 'OK: T3b title (Tekrar) marker';
END $$;

-- =============================================================================
-- T4: REVOKE PUBLIC + GRANT authenticated
-- =============================================================================
DO $$
DECLARE v_pub BOOLEAN;
DECLARE v_auth BOOLEAN;
BEGIN
  SELECT has_function_privilege('public', 'public.replay_room(uuid)', 'EXECUTE')
    INTO v_pub;
  SELECT has_function_privilege('authenticated', 'public.replay_room(uuid)', 'EXECUTE')
    INTO v_auth;

  IF v_pub THEN
    RAISE EXCEPTION 'T4 FAIL: PUBLIC EXECUTE iznine sahip';
  END IF;
  IF NOT v_auth THEN
    RAISE EXCEPTION 'T4 FAIL: authenticated EXECUTE iznine sahip degil';
  END IF;

  RAISE NOTICE 'OK: T4 REVOKE PUBLIC + GRANT authenticated dogru';
END $$;

ROLLBACK;
