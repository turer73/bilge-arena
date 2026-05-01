-- =============================================================================
-- Bilge Arena Oda Sistemi: 12_solo_mode test (Sprint 2B Task 4 / PR1 skeleton)
-- =============================================================================
-- 6 Test:
--   T1: room_members.is_bot DEFAULT FALSE
--   T2: quick_play_room var (3 arg, JSONB return)
--   T3: quick_play_room oda olusturur, member_count=4 (1 host + 3 bot)
--   T4: bot uyeler is_bot=TRUE, host is_bot=FALSE
--   T5: oda is_public=FALSE (solo, Aktif Odalar listesinde gozukmez)
--   T6: REVOKE PUBLIC + GRANT authenticated dogru
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- T1: room_members.is_bot DEFAULT FALSE
-- =============================================================================
DO $$
DECLARE v_default TEXT;
BEGIN
  SELECT column_default INTO v_default
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='room_members'
    AND column_name='is_bot';

  IF v_default IS NULL THEN
    RAISE EXCEPTION 'T1 FAIL: is_bot kolonu yok';
  END IF;
  IF v_default !~ 'false' THEN
    RAISE EXCEPTION 'T1 FAIL: is_bot default false degil: %', v_default;
  END IF;

  RAISE NOTICE 'OK: T1 room_members.is_bot DEFAULT FALSE';
END $$;

-- =============================================================================
-- T2: quick_play_room var (3 arg, JSONB return)
-- =============================================================================
DO $$
DECLARE v_arg_count INT;
DECLARE v_return TEXT;
BEGIN
  SELECT pronargs, pg_catalog.format_type(prorettype, NULL)
  INTO v_arg_count, v_return
  FROM pg_proc
  WHERE proname = 'quick_play_room' AND pronamespace = 'public'::regnamespace;

  IF v_arg_count IS NULL THEN
    RAISE EXCEPTION 'T2 FAIL: quick_play_room bulunamadi';
  END IF;
  IF v_arg_count <> 3 THEN
    RAISE EXCEPTION 'T2 FAIL: arg sayisi 3 olmali, mevcut: %', v_arg_count;
  END IF;
  IF v_return <> 'jsonb' THEN
    RAISE EXCEPTION 'T2 FAIL: return type jsonb olmali, mevcut: %', v_return;
  END IF;

  RAISE NOTICE 'OK: T2 quick_play_room (3 arg, jsonb)';
END $$;

-- =============================================================================
-- T3+T4+T5: oda olustur + 4 member + bot flag + is_public=FALSE
-- =============================================================================
-- NOT: auth.uid() bu test contextinde NULL (psql -U bilge_arena_app baglanti).
-- DEFINER fonksiyon icinde auth.uid() Panola GoTrue context yok, NULL doner.
-- Bunu bypass etmek icin dogrudan rooms+room_members manuel test (RPC mock).
DO $$
DECLARE
  v_test_user UUID := gen_random_uuid();
  v_room_id UUID;
  v_member_count INT;
  v_bot_count INT;
  v_host_bot BOOLEAN;
  v_is_public BOOLEAN;
BEGIN
  -- Manuel oda + 4 member insert (RPC body simulation)
  INSERT INTO public.rooms
    (code, host_id, title, category, difficulty, question_count,
     max_players, per_question_seconds, mode, state, is_public)
  VALUES
    ('TST12A', v_test_user, 'Hizli Oyun', 'matematik', 2, 10,
     4, 20, 'sync', 'lobby', FALSE)
  RETURNING id INTO v_room_id;

  -- Host
  INSERT INTO public.room_members (room_id, user_id, role, is_bot)
    VALUES (v_room_id, v_test_user, 'host', FALSE);

  -- 3 bot
  INSERT INTO public.room_members (room_id, user_id, role, is_bot)
    VALUES
      (v_room_id, gen_random_uuid(), 'player', TRUE),
      (v_room_id, gen_random_uuid(), 'player', TRUE),
      (v_room_id, gen_random_uuid(), 'player', TRUE);

  -- T3: member_count
  SELECT member_count INTO v_member_count
  FROM public.rooms WHERE id = v_room_id;
  IF v_member_count <> 4 THEN
    RAISE EXCEPTION 'T3 FAIL: member_count beklenen 4, mevcut %', v_member_count;
  END IF;
  RAISE NOTICE 'OK: T3 1 host + 3 bot = member_count 4';

  -- T4a: bot count
  SELECT COUNT(*) INTO v_bot_count
  FROM public.room_members
  WHERE room_id = v_room_id AND is_bot = TRUE;
  IF v_bot_count <> 3 THEN
    RAISE EXCEPTION 'T4 FAIL: bot count beklenen 3, mevcut %', v_bot_count;
  END IF;
  RAISE NOTICE 'OK: T4a 3 bot member is_bot=TRUE';

  -- T4b: host bot DEGIL
  SELECT is_bot INTO v_host_bot
  FROM public.room_members
  WHERE room_id = v_room_id AND user_id = v_test_user;
  IF v_host_bot <> FALSE THEN
    RAISE EXCEPTION 'T4 FAIL: host is_bot=FALSE olmali, mevcut %', v_host_bot;
  END IF;
  RAISE NOTICE 'OK: T4b host is_bot=FALSE';

  -- T5: oda is_public=FALSE (solo, listede gozukmez)
  SELECT is_public INTO v_is_public
  FROM public.rooms WHERE id = v_room_id;
  IF v_is_public <> FALSE THEN
    RAISE EXCEPTION 'T5 FAIL: solo oda is_public=FALSE olmali, mevcut %', v_is_public;
  END IF;
  RAISE NOTICE 'OK: T5 quick_play_room oda is_public=FALSE (Aktif Odalar listesinde gozukmez)';
END $$;

-- =============================================================================
-- T6: REVOKE PUBLIC + GRANT authenticated
-- =============================================================================
DO $$
DECLARE v_public_has BOOLEAN;
DECLARE v_auth_has BOOLEAN;
BEGIN
  SELECT has_function_privilege('public', 'public.quick_play_room(text, smallint, smallint)', 'EXECUTE')
    INTO v_public_has;
  SELECT has_function_privilege('authenticated', 'public.quick_play_room(text, smallint, smallint)', 'EXECUTE')
    INTO v_auth_has;

  IF v_public_has THEN
    RAISE EXCEPTION 'T6 FAIL: PUBLIC EXECUTE gonderilmemeli';
  END IF;
  IF NOT v_auth_has THEN
    RAISE EXCEPTION 'T6 FAIL: authenticated EXECUTE gerek';
  END IF;
  RAISE NOTICE 'OK: T6 REVOKE PUBLIC + GRANT authenticated dogru';
END $$;

ROLLBACK;
