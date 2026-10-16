-- =============================================================================
-- Bilge Arena Oda Sistemi: 9_rooms_auto_advance test (Sprint 2A Task 1)
-- =============================================================================
-- TDD GREEN dogrulama: 9_rooms_auto_advance.sql migration uygulandiktan sonra.
--
-- 5 Test:
--   T1: rooms.auto_advance_seconds default 5
--   T2: chk_rooms_auto_advance_range CHECK reddedir 31
--   T3: chk_rooms_auto_advance_range CHECK reddedir -1
--   T4: create_room imzasi 8 parametre (yeni)
--   T5: auto_relay_tick auto_advance_seconds=0 olan odayi atlar
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/9_rooms_auto_advance_test.sql
--
-- Beklenen: tum NOTICE 'OK: ...', exit 0
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- T1: auto_advance_seconds DEFAULT 5
-- =============================================================================
DO $$
DECLARE v_default TEXT;
BEGIN
  SELECT column_default INTO v_default
  FROM information_schema.columns
  WHERE table_schema='public'
    AND table_name='rooms'
    AND column_name='auto_advance_seconds';

  IF v_default IS NULL THEN
    RAISE EXCEPTION 'T1 FAIL: auto_advance_seconds kolonu bulunamadi veya default yok';
  END IF;

  IF v_default !~ '^5' THEN
    RAISE EXCEPTION 'T1 FAIL: auto_advance_seconds default 5 degil: %', v_default;
  END IF;

  RAISE NOTICE 'OK: T1 auto_advance_seconds DEFAULT 5';
END $$;

-- =============================================================================
-- T2: CHECK reddedir 31 (max 30)
-- =============================================================================
-- Kod chk_rooms_code_format'a (Crockford-32: 0/1/I/O yok) uymali; yoksa
-- check_violation yanlis kisittan gelir ve test yanlis sebeple gecer.
DO $$
DECLARE v_test_user UUID := gen_random_uuid(); v_constraint TEXT;
BEGIN
  BEGIN
    INSERT INTO public.rooms
      (code, host_id, title, category, difficulty, question_count,
       max_players, per_question_seconds, mode, state, auto_advance_seconds)
    VALUES
      ('TSTZZL', v_test_user, 'T2 test', 'matematik', 2, 10,
       8, 20, 'sync', 'lobby', 31);

    RAISE EXCEPTION 'T2 FAIL: 31 sn auto_advance_seconds kabul edildi (max 30 olmali)';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint <> 'chk_rooms_auto_advance_range' THEN
      RAISE EXCEPTION 'T2 FAIL: yanlis kisit reddetti: %', v_constraint;
    END IF;
    RAISE NOTICE 'OK: T2 chk_rooms_auto_advance_range 31 reddetti';
  END;
END $$;

-- =============================================================================
-- T3: CHECK reddedir -1 (min 0)
-- =============================================================================
DO $$
DECLARE v_test_user UUID := gen_random_uuid(); v_constraint TEXT;
BEGIN
  BEGIN
    INSERT INTO public.rooms
      (code, host_id, title, category, difficulty, question_count,
       max_players, per_question_seconds, mode, state, auto_advance_seconds)
    VALUES
      ('TSTZZ2', v_test_user, 'T3 test', 'matematik', 2, 10,
       8, 20, 'sync', 'lobby', -1);

    RAISE EXCEPTION 'T3 FAIL: -1 auto_advance_seconds kabul edildi (min 0 olmali)';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint <> 'chk_rooms_auto_advance_range' THEN
      RAISE EXCEPTION 'T3 FAIL: yanlis kisit reddetti: %', v_constraint;
    END IF;
    RAISE NOTICE 'OK: T3 chk_rooms_auto_advance_range -1 reddetti';
  END;
END $$;

-- =============================================================================
-- T4: create_room p_auto_advance_seconds parametresini tasir (tek overload)
-- =============================================================================
-- 9 imzayi 8 parametreye cikardi; 11_rooms_public_discovery p_is_public ile
-- 9'a cikardi. Sabit sayi yerine bu migration'in ekledigi parametre olculur.
DO $$
DECLARE
  v_overloads INT;
  v_has_param BOOLEAN;
BEGIN
  SELECT count(*), bool_or('p_auto_advance_seconds' = ANY (proargnames))
    INTO v_overloads, v_has_param
  FROM pg_proc
  WHERE proname = 'create_room'
    AND pronamespace = 'public'::regnamespace;

  IF v_overloads = 0 THEN
    RAISE EXCEPTION 'T4 FAIL: create_room fonksiyonu bulunamadi';
  END IF;

  IF v_overloads <> 1 THEN
    RAISE EXCEPTION 'T4 FAIL: create_room tek overload olmali, mevcut: %', v_overloads;
  END IF;

  IF NOT v_has_param THEN
    RAISE EXCEPTION 'T4 FAIL: create_room p_auto_advance_seconds parametresi yok';
  END IF;

  RAISE NOTICE 'OK: T4 create_room p_auto_advance_seconds parametresi var';
END $$;

-- =============================================================================
-- T5: auto_relay_tick auto_advance_seconds=0 olan odayi atlar
-- =============================================================================
-- Senaryo: reveal state'inde, revealed_at 60sn once, auto_advance_seconds=0.
-- auto_relay_tick cagrildiginda Phase 2 atlar, oda reveal'da kalir.
DO $$
DECLARE
  v_test_user UUID := gen_random_uuid();
  v_room_id UUID;
  v_round_id UUID;
  v_relay_count INT;
  v_state_after TEXT;
BEGIN
  -- Test odasi olustur (auto_advance_seconds=0, manuel mode)
  INSERT INTO public.rooms
    (code, host_id, title, category, difficulty, question_count,
     max_players, per_question_seconds, mode, state, current_round_index,
     auto_advance_seconds)
  VALUES
    ('TSTZZ5', v_test_user, 'T5 manual', 'matematik', 2, 10,
     8, 20, 'sync', 'reveal', 1, 0)
  RETURNING id INTO v_room_id;

  -- Round revealed 60sn once
  INSERT INTO public.room_rounds
    (room_id, round_index, question_id, question_content_snapshot,
     started_at, ends_at, revealed_at)
  VALUES
    (v_room_id, 1, gen_random_uuid(),
     '{"question":"x","options":["a","b"],"answer":"a"}'::jsonb,
     NOW() - INTERVAL '120 seconds',
     NOW() - INTERVAL '100 seconds',
     NOW() - INTERVAL '60 seconds')
  RETURNING id INTO v_round_id;

  -- auto_relay_tick cagri
  SELECT public.auto_relay_tick(5, 8, 100) INTO v_relay_count;

  -- Reveal'da kalmis olmali (manuel mode)
  SELECT state INTO v_state_after FROM public.rooms WHERE id = v_room_id;

  IF v_state_after <> 'reveal' THEN
    RAISE EXCEPTION 'T5 FAIL: auto_advance=0 oda relay sonrasi state=%, reveal olmaliydi', v_state_after;
  END IF;

  RAISE NOTICE 'OK: T5 auto_relay_tick auto_advance_seconds=0 odayi atladi (state=reveal)';
END $$;

ROLLBACK;
