-- =============================================================================
-- Bilge Arena Oda Sistemi: 11_rooms_public_discovery test (Sprint 2A Task 3)
-- =============================================================================
-- TDD GREEN dogrulama: 11_rooms_public_discovery.sql migration uygulandiktan sonra.
--
-- 10 Test:
--   T1: rooms.is_public DEFAULT FALSE
--   T2: chk_rooms_public_max_players_cap reddedir is_public=true + max_players=10
--   T3: chk_rooms_public_max_players_cap kabul eder is_public=true + max_players=6
--   T4: idx_rooms_public_lobby partial index var
--   T5: rooms_select_public_lobby policy var (TO anon, authenticated)
--   T6: anon role rooms tablosuna SELECT GRANT'i var
--   T7: create_room imzasi 9 parametre (yeni)
--   T8: rooms.member_count kolonu var (Codex P1 v2)
--   T9: trg_room_members_count_sync trigger var
--   T10: trigger INSERT room_members -> rooms.member_count +1
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- T1: is_public DEFAULT FALSE
-- =============================================================================
DO $$
DECLARE v_default TEXT;
BEGIN
  SELECT column_default INTO v_default
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='rooms' AND column_name='is_public';

  IF v_default IS NULL THEN
    RAISE EXCEPTION 'T1 FAIL: is_public kolonu bulunamadi';
  END IF;
  IF v_default !~ 'false' THEN
    RAISE EXCEPTION 'T1 FAIL: is_public default false degil: %', v_default;
  END IF;

  RAISE NOTICE 'OK: T1 is_public DEFAULT FALSE';
END $$;

-- =============================================================================
-- T2: max_players_cap reddedir 10 (is_public=true)
-- =============================================================================
DO $$
DECLARE v_test_user UUID := gen_random_uuid();
BEGIN
  BEGIN
    INSERT INTO public.rooms
      (code, host_id, title, category, difficulty, question_count,
       max_players, per_question_seconds, mode, state, is_public)
    VALUES
      ('TST10A', v_test_user, 'T2 test', 'matematik', 2, 10,
       10, 20, 'sync', 'lobby', TRUE);
    RAISE EXCEPTION 'T2 FAIL: 10 oyunculu public oda kabul edildi (max 6 olmali)';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK: T2 chk_rooms_public_max_players_cap 10 reddetti';
  END;
END $$;

-- =============================================================================
-- T3: max_players_cap kabul eder 6 (is_public=true)
-- =============================================================================
DO $$
DECLARE v_test_user UUID := gen_random_uuid();
BEGIN
  INSERT INTO public.rooms
    (code, host_id, title, category, difficulty, question_count,
     max_players, per_question_seconds, mode, state, is_public)
  VALUES
    ('TST10B', v_test_user, 'T3 test', 'matematik', 2, 10,
     6, 20, 'sync', 'lobby', TRUE);
  RAISE NOTICE 'OK: T3 chk_rooms_public_max_players_cap 6 kabul etti';
END $$;

-- =============================================================================
-- T4: idx_rooms_public_lobby partial index var
-- =============================================================================
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_indexes
  WHERE tablename='rooms' AND indexname='idx_rooms_public_lobby';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'T4 FAIL: idx_rooms_public_lobby index yok';
  END IF;
  RAISE NOTICE 'OK: T4 idx_rooms_public_lobby partial index var';
END $$;

-- =============================================================================
-- T5: rooms_select_public_lobby policy var
-- =============================================================================
DO $$
DECLARE v_count INT;
DECLARE v_roles TEXT[];
BEGIN
  SELECT COUNT(*), array_agg(roles::TEXT) INTO v_count, v_roles
  FROM pg_policies
  WHERE tablename='rooms' AND policyname='rooms_select_public_lobby';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'T5 FAIL: rooms_select_public_lobby policy yok';
  END IF;
  -- Roles array sutununda anon hem authenticated bulunmali
  IF NOT (v_roles[1] LIKE '%anon%' AND v_roles[1] LIKE '%authenticated%') THEN
    RAISE EXCEPTION 'T5 FAIL: policy roles anon+authenticated olmali, mevcut: %', v_roles;
  END IF;
  RAISE NOTICE 'OK: T5 rooms_select_public_lobby (TO anon, authenticated)';
END $$;

-- =============================================================================
-- T6: anon role rooms SELECT grant
-- =============================================================================
DO $$
DECLARE v_anon_select BOOLEAN;
BEGIN
  SELECT has_table_privilege('anon', 'public.rooms', 'SELECT') INTO v_anon_select;
  IF NOT v_anon_select THEN
    RAISE EXCEPTION 'T6 FAIL: anon role rooms SELECT grant yok';
  END IF;
  RAISE NOTICE 'OK: T6 anon role rooms SELECT grant';
END $$;

-- =============================================================================
-- T7: create_room imzasi 9 parametre
-- =============================================================================
DO $$
DECLARE v_arg_count INT;
BEGIN
  SELECT pronargs INTO v_arg_count
  FROM pg_proc
  WHERE proname = 'create_room' AND pronamespace = 'public'::regnamespace;

  IF v_arg_count IS NULL THEN
    RAISE EXCEPTION 'T7 FAIL: create_room bulunamadi';
  END IF;
  IF v_arg_count <> 9 THEN
    RAISE EXCEPTION 'T7 FAIL: arg sayisi 9 olmali, mevcut: %', v_arg_count;
  END IF;
  RAISE NOTICE 'OK: T7 create_room 9 parametre';
END $$;

-- =============================================================================
-- T8: rooms.member_count kolonu var (Codex P1 v2)
-- =============================================================================
DO $$
DECLARE v_default TEXT;
DECLARE v_nullable TEXT;
BEGIN
  SELECT column_default, is_nullable
  INTO v_default, v_nullable
  FROM information_schema.columns
  WHERE table_schema='public'
    AND table_name='rooms'
    AND column_name='member_count';

  IF v_default IS NULL THEN
    RAISE EXCEPTION 'T8 FAIL: rooms.member_count kolonu yok';
  END IF;
  IF v_default !~ '^0' THEN
    RAISE EXCEPTION 'T8 FAIL: member_count default 0 degil: %', v_default;
  END IF;
  IF v_nullable <> 'NO' THEN
    RAISE EXCEPTION 'T8 FAIL: member_count NOT NULL olmali, mevcut: %', v_nullable;
  END IF;

  RAISE NOTICE 'OK: T8 rooms.member_count NOT NULL DEFAULT 0';
END $$;

-- =============================================================================
-- T9: trg_room_members_count_sync trigger var
-- =============================================================================
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_trigger
  WHERE tgname = 'trg_room_members_count_sync'
    AND tgrelid = 'public.room_members'::regclass;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'T9 FAIL: trg_room_members_count_sync trigger yok';
  END IF;

  RAISE NOTICE 'OK: T9 trg_room_members_count_sync trigger var';
END $$;

-- =============================================================================
-- T10: Trigger uye INSERT/DELETE ile member_count senkron
-- =============================================================================
DO $$
DECLARE
  v_test_user UUID := gen_random_uuid();
  v_test_user2 UUID := gen_random_uuid();
  v_room_id UUID;
  v_count INT;
BEGIN
  -- Test odasi olustur (member_count=0 default)
  INSERT INTO public.rooms
    (code, host_id, title, category, difficulty, question_count,
     max_players, per_question_seconds, mode, state)
  VALUES
    ('TST10C', v_test_user, 'T10 trigger', 'matematik', 2, 10,
     6, 20, 'sync', 'lobby')
  RETURNING id INTO v_room_id;

  -- 1. uye INSERT (host)
  INSERT INTO public.room_members (room_id, user_id, role, is_active)
    VALUES (v_room_id, v_test_user, 'host', TRUE);

  SELECT member_count INTO v_count FROM public.rooms WHERE id = v_room_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T10 FAIL: 1 uye INSERT sonrasi member_count=%, beklenen 1', v_count;
  END IF;

  -- 2. uye INSERT (player)
  INSERT INTO public.room_members (room_id, user_id, role, is_active)
    VALUES (v_room_id, v_test_user2, 'player', TRUE);

  SELECT member_count INTO v_count FROM public.rooms WHERE id = v_room_id;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'T10 FAIL: 2 uye INSERT sonrasi member_count=%, beklenen 2', v_count;
  END IF;

  -- is_active = FALSE update (kick simulation)
  UPDATE public.room_members SET is_active = FALSE
    WHERE room_id = v_room_id AND user_id = v_test_user2;

  SELECT member_count INTO v_count FROM public.rooms WHERE id = v_room_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T10 FAIL: 1 uye kick sonrasi member_count=%, beklenen 1', v_count;
  END IF;

  -- DELETE
  DELETE FROM public.room_members
    WHERE room_id = v_room_id AND user_id = v_test_user;

  SELECT member_count INTO v_count FROM public.rooms WHERE id = v_room_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T10 FAIL: host DELETE sonrasi member_count=%, beklenen 0', v_count;
  END IF;

  RAISE NOTICE 'OK: T10 trigger INSERT/UPDATE/DELETE member_count senkron';
END $$;

ROLLBACK;
