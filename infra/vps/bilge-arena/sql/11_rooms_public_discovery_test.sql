-- =============================================================================
-- Bilge Arena Oda Sistemi: 11_rooms_public_discovery test (Sprint 2A Task 3)
-- =============================================================================
-- TDD GREEN dogrulama: 11_rooms_public_discovery.sql migration uygulandiktan sonra.
--
-- 7 Test:
--   T1: rooms.is_public DEFAULT FALSE
--   T2: chk_rooms_public_max_players_cap reddedir is_public=true + max_players=10
--   T3: chk_rooms_public_max_players_cap kabul eder is_public=true + max_players=6
--   T4: idx_rooms_public_lobby partial index var
--   T5: rooms_select_public_lobby policy var (TO anon, authenticated)
--   T6: anon role rooms tablosuna SELECT GRANT'i var
--   T7: create_room imzasi 9 parametre (yeni)
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

ROLLBACK;
