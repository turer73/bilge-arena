-- =============================================================================
-- Bilge Arena Oda Sistemi: 12_solo_mode test (Sprint 2B Task 4 + Codex fix)
-- =============================================================================
-- 11 Test (Codex P1+P3 fix v2 — gercek RPC cagri):
--   T1: room_members.is_bot DEFAULT FALSE
--   T2: room_members.display_name kolonu (Codex P1 #80, nullable)
--   T3: room_members.user_id FK YOK regression (Codex P1 #1)
--   T4: quick_play_room var (3 arg, JSONB return)
--   T5: GERCEK RPC cagri — oda + 4 member + bot count + host is_bot=FALSE
--   T6: Bot display_name "Bot 1/2/3" set edildi (Codex P1 #2)
--   T7: oda is_public=FALSE (solo, listede degil)
--   T8: oda title 'Hızlı Oyun' (Codex P3 #9, TR diakritik)
--   T9: auth.uid() NULL P0001 reddi (Codex P3 #4)
--   T10: audit_log 'quick_play_created' marker yazilir (Codex P3 #4)
--   T11: REVOKE PUBLIC + GRANT authenticated
--
-- Auth simulation: SET LOCAL request.jwt.claim.sub TO '<uuid>'.
-- auth.uid() bu GUC'tan okur (0_init_db.sql:64-74).
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
-- T2: room_members.display_name kolonu (Codex P1 #80)
-- =============================================================================
DO $$
DECLARE v_nullable TEXT;
DECLARE v_data_type TEXT;
BEGIN
  SELECT is_nullable, data_type INTO v_nullable, v_data_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='room_members'
    AND column_name='display_name';

  IF v_data_type IS NULL THEN
    RAISE EXCEPTION 'T2 FAIL: display_name kolonu yok';
  END IF;
  IF v_nullable <> 'YES' THEN
    RAISE EXCEPTION 'T2 FAIL: display_name nullable olmali, mevcut: %', v_nullable;
  END IF;

  RAISE NOTICE 'OK: T2 room_members.display_name nullable kolon';
END $$;

-- =============================================================================
-- T3: room_members.user_id FK YOK regression (Codex P1 #1)
-- =============================================================================
DO $$
DECLARE v_fk_count INT;
BEGIN
  SELECT COUNT(*) INTO v_fk_count
  FROM pg_constraint
  WHERE conrelid = 'public.room_members'::regclass
    AND contype = 'f'
    AND pg_get_constraintdef(oid) LIKE '%user_id%';

  IF v_fk_count > 0 THEN
    RAISE EXCEPTION 'T3 FAIL: user_id FK var (% adet) bot insert kirar', v_fk_count;
  END IF;

  RAISE NOTICE 'OK: T3 room_members.user_id FK YOK (bot rastgele UUID guvenli)';
END $$;

-- =============================================================================
-- T4: quick_play_room var (3 arg, JSONB)
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
    RAISE EXCEPTION 'T4 FAIL: quick_play_room bulunamadi';
  END IF;
  IF v_arg_count <> 3 THEN
    RAISE EXCEPTION 'T4 FAIL: arg sayisi 3 olmali, mevcut: %', v_arg_count;
  END IF;
  IF v_return <> 'jsonb' THEN
    RAISE EXCEPTION 'T4 FAIL: return jsonb olmali, mevcut: %', v_return;
  END IF;

  RAISE NOTICE 'OK: T4 quick_play_room (3 arg, jsonb)';
END $$;

-- =============================================================================
-- T5+T6+T7+T8: GERCEK RPC cagri (Codex P3 #4 fix)
-- =============================================================================
DO $$
DECLARE
  v_test_user UUID := gen_random_uuid();
  v_result JSONB;
  v_room_id UUID;
  v_room_code CHAR(6);
  v_member_count INT;
  v_bot_count INT;
  v_host_bot BOOLEAN;
  v_room RECORD;
  v_bot_names TEXT[];
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_test_user::TEXT, TRUE);

  v_result := public.quick_play_room('matematik', 2::SMALLINT, 10::SMALLINT);
  v_room_id := (v_result->>'id')::UUID;
  v_room_code := (v_result->>'code')::CHAR(6);

  IF v_room_id IS NULL THEN
    RAISE EXCEPTION 'T5 FAIL: result.id NULL';
  END IF;
  IF v_room_code IS NULL OR length(v_room_code) <> 6 THEN
    RAISE EXCEPTION 'T5 FAIL: result.code gecersiz: %', v_room_code;
  END IF;

  SELECT member_count INTO v_member_count
  FROM public.rooms WHERE id = v_room_id;
  IF v_member_count <> 4 THEN
    RAISE EXCEPTION 'T5 FAIL: member_count beklenen 4, mevcut %', v_member_count;
  END IF;
  RAISE NOTICE 'OK: T5 RPC ile 4 member (1 host + 3 bot, trigger sync)';

  SELECT COUNT(*) INTO v_bot_count
  FROM public.room_members
  WHERE room_id = v_room_id AND is_bot = TRUE;
  IF v_bot_count <> 3 THEN
    RAISE EXCEPTION 'T6 FAIL: bot count beklenen 3, mevcut %', v_bot_count;
  END IF;

  SELECT is_bot INTO v_host_bot
  FROM public.room_members
  WHERE room_id = v_room_id AND user_id = v_test_user;
  IF v_host_bot <> FALSE THEN
    RAISE EXCEPTION 'T6 FAIL: host is_bot=FALSE olmali, mevcut %', v_host_bot;
  END IF;

  SELECT array_agg(display_name ORDER BY display_name) INTO v_bot_names
  FROM public.room_members
  WHERE room_id = v_room_id AND is_bot = TRUE;
  IF v_bot_names <> ARRAY['Bot 1', 'Bot 2', 'Bot 3'] THEN
    RAISE EXCEPTION 'T6 FAIL: bot display_name beklenen [Bot 1, Bot 2, Bot 3], mevcut %', v_bot_names;
  END IF;
  RAISE NOTICE 'OK: T6 3 bot is_bot=TRUE display_name Bot 1/2/3, host is_bot=FALSE';

  SELECT * INTO v_room FROM public.rooms WHERE id = v_room_id;
  IF v_room.is_public <> FALSE THEN
    RAISE EXCEPTION 'T7 FAIL: oda is_public=FALSE olmali, mevcut %', v_room.is_public;
  END IF;
  RAISE NOTICE 'OK: T7 oda is_public=FALSE';

  IF v_room.title <> 'Hızlı Oyun' THEN
    RAISE EXCEPTION 'T8 FAIL: title beklenen Hızlı Oyun, mevcut %', v_room.title;
  END IF;
  RAISE NOTICE 'OK: T8 oda title Hızlı Oyun (TR diakritik)';

  PERFORM set_config('request.jwt.claim.sub', '', TRUE);
END $$;

-- =============================================================================
-- T9: auth.uid() NULL reddi (Codex P3 #4)
-- =============================================================================
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', TRUE);

  BEGIN
    PERFORM public.quick_play_room('matematik', 2::SMALLINT, 10::SMALLINT);
    RAISE EXCEPTION 'T9 FAIL: auth.uid() NULL ile cagri kabul edildi';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    RAISE NOTICE 'OK: T9 auth.uid() NULL P0001 reddetti';
  END;
END $$;

-- =============================================================================
-- T10: audit_log 'quick_play_created' marker (Codex P3 #4)
-- =============================================================================
DO $$
DECLARE
  v_test_user UUID := gen_random_uuid();
  v_result JSONB;
  v_room_id UUID;
  v_audit_count INT;
  v_payload JSONB;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_test_user::TEXT, TRUE);
  v_result := public.quick_play_room('tarih', 3::SMALLINT, 15::SMALLINT);
  v_room_id := (v_result->>'id')::UUID;

  SELECT COUNT(*), MIN(payload) INTO v_audit_count, v_payload
  FROM public.room_audit_log
  WHERE room_id = v_room_id
    AND actor_id = v_test_user
    AND action = 'quick_play_created';

  IF v_audit_count <> 1 THEN
    RAISE EXCEPTION 'T10 FAIL: audit_log row sayisi % (1 beklenir)', v_audit_count;
  END IF;
  IF (v_payload->>'bot_count')::INT <> 3 THEN
    RAISE EXCEPTION 'T10 FAIL: audit payload bot_count beklenen 3';
  END IF;
  IF v_payload->>'category' <> 'tarih' THEN
    RAISE EXCEPTION 'T10 FAIL: audit payload category beklenen tarih';
  END IF;
  RAISE NOTICE 'OK: T10 audit_log quick_play_created marker (bot_count=3, category=tarih)';

  PERFORM set_config('request.jwt.claim.sub', '', TRUE);
END $$;

-- =============================================================================
-- T11: REVOKE PUBLIC + GRANT authenticated
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
    RAISE EXCEPTION 'T11 FAIL: PUBLIC EXECUTE gonderilmemeli';
  END IF;
  IF NOT v_auth_has THEN
    RAISE EXCEPTION 'T11 FAIL: authenticated EXECUTE gerek';
  END IF;
  RAISE NOTICE 'OK: T11 REVOKE PUBLIC + GRANT authenticated dogru';
END $$;

ROLLBACK;
