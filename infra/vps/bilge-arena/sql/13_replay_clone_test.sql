-- =============================================================================
-- Bilge Arena Oda Sistemi: 13_replay_clone test (Sprint 2C Task 8)
-- =============================================================================
-- 10 Test (Codex P3 fix v2 — gercek RPC cagri, manuel kopya degil):
--   T1: replay_room var (1 arg, JSONB return)
--   T2: replay_room oda settings'i clone eder (RPC cagri ile)
--   T3: clone is_public=FALSE
--   T4: REVOKE PUBLIC + GRANT authenticated
--   T5: auth.uid() NULL reddi (P0001)
--   T6: Member-degil reddi (P0001) [Codex P3 #4]
--   T7: Source-bulunamadi reddi (P0002) [Codex P3 #4]
--   T8: Source state completed/archived disinda reddi (P0003) [Codex P3 #6]
--   T9: Title overflow handling — (Tekrar) marker zaten varsa eklenmez
--      ve 80 char cap calisir [Codex P3 #7]
--   T10: audit_log row'u yazilir (room_replay_created marker)
--
-- Auth simulation: SET LOCAL request.jwt.claim.sub TO '<uuid>' kullanilir.
-- auth.uid() bu GUC'tan okur (0_init_db.sql:64-74).
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
-- T2 + T3: gercek RPC cagri — settings clone + is_public=FALSE
-- =============================================================================
DO $$
DECLARE
  v_test_user UUID := gen_random_uuid();
  v_source_id UUID;
  v_clone_result JSONB;
  v_clone_id UUID;
  v_source RECORD;
  v_clone RECORD;
BEGIN
  -- Source oda olustur (state=completed, replay edilebilir)
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

  -- Auth simulation: caller = v_test_user
  PERFORM set_config('request.jwt.claim.sub', v_test_user::TEXT, TRUE);

  -- Gercek RPC cagri
  v_clone_result := public.replay_room(v_source_id);
  v_clone_id := (v_clone_result->>'id')::UUID;

  IF v_clone_id IS NULL THEN
    RAISE EXCEPTION 'T2 FAIL: clone id NULL';
  END IF;

  SELECT * INTO v_clone FROM public.rooms WHERE id = v_clone_id;

  -- T2 settings clone
  IF v_clone.category <> v_source.category THEN
    RAISE EXCEPTION 'T2 FAIL: category clone basarisiz: % <> %', v_clone.category, v_source.category;
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
  RAISE NOTICE 'OK: T2 settings clone (RPC cagri ile)';

  -- T3 is_public=FALSE
  IF v_clone.is_public <> FALSE THEN
    RAISE EXCEPTION 'T3 FAIL: clone is_public=FALSE olmali, mevcut: %', v_clone.is_public;
  END IF;
  RAISE NOTICE 'OK: T3 clone is_public=FALSE';

  -- (Tekrar) marker title'da
  IF v_clone.title NOT LIKE '%(Tekrar)%' THEN
    RAISE EXCEPTION 'T3b FAIL: title (Tekrar) marker yok: %', v_clone.title;
  END IF;
  RAISE NOTICE 'OK: T3b title (Tekrar) marker';

  -- Host member otomatik insert?
  IF NOT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = v_clone_id AND user_id = v_test_user AND role = 'host'
  ) THEN
    RAISE EXCEPTION 'T3c FAIL: host member otomatik insert edilmedi';
  END IF;
  RAISE NOTICE 'OK: T3c host member otomatik insert';

  PERFORM set_config('request.jwt.claim.sub', '', TRUE);
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

-- =============================================================================
-- T5: auth.uid() NULL reddi (Codex P3 #4)
-- =============================================================================
DO $$
DECLARE
  v_test_user UUID := gen_random_uuid();
  v_source_id UUID;
BEGIN
  INSERT INTO public.rooms
    (code, host_id, title, category, difficulty, question_count,
     max_players, per_question_seconds, mode, state)
  VALUES
    ('TST13B', v_test_user, 'Anon Test', 'matematik', 2, 10,
     8, 20, 'sync', 'completed')
  RETURNING id INTO v_source_id;

  -- auth.uid() NULL bagli
  PERFORM set_config('request.jwt.claim.sub', '', TRUE);

  BEGIN
    PERFORM public.replay_room(v_source_id);
    RAISE EXCEPTION 'T5 FAIL: auth.uid() NULL ile cagri kabul edildi';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    RAISE NOTICE 'OK: T5 auth.uid() NULL P0001 reddetti';
  END;
END $$;

-- =============================================================================
-- T6: Member-degil reddi (Codex P3 #4)
-- =============================================================================
DO $$
DECLARE
  v_host UUID := gen_random_uuid();
  v_stranger UUID := gen_random_uuid();
  v_source_id UUID;
BEGIN
  INSERT INTO public.rooms
    (code, host_id, title, category, difficulty, question_count,
     max_players, per_question_seconds, mode, state)
  VALUES
    ('TST13C', v_host, 'Member Test', 'matematik', 2, 10,
     8, 20, 'sync', 'completed')
  RETURNING id INTO v_source_id;

  INSERT INTO public.room_members (room_id, user_id, role)
    VALUES (v_source_id, v_host, 'host');

  -- Stranger (member degil) cagri yapsin
  PERFORM set_config('request.jwt.claim.sub', v_stranger::TEXT, TRUE);

  BEGIN
    PERFORM public.replay_room(v_source_id);
    RAISE EXCEPTION 'T6 FAIL: stranger replay yapabildi';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    RAISE NOTICE 'OK: T6 member-degil P0001 reddetti';
  END;

  PERFORM set_config('request.jwt.claim.sub', '', TRUE);
END $$;

-- =============================================================================
-- T7: Source-bulunamadi reddi (Codex P3 #4)
-- =============================================================================
DO $$
DECLARE
  v_user UUID := gen_random_uuid();
  v_fake_id UUID := gen_random_uuid();
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_user::TEXT, TRUE);

  BEGIN
    PERFORM public.replay_room(v_fake_id);
    RAISE EXCEPTION 'T7 FAIL: olmayan oda cagrildi, kabul edildi';
  EXCEPTION WHEN sqlstate 'P0002' THEN
    RAISE NOTICE 'OK: T7 source-bulunamadi P0002 reddetti';
  END;

  PERFORM set_config('request.jwt.claim.sub', '', TRUE);
END $$;

-- =============================================================================
-- T8: Source state lobby/active reddi (plan-deviation #78, Codex P3 #6)
-- =============================================================================
DO $$
DECLARE
  v_user UUID := gen_random_uuid();
  v_source_id UUID;
BEGIN
  INSERT INTO public.rooms
    (code, host_id, title, category, difficulty, question_count,
     max_players, per_question_seconds, mode, state)
  VALUES
    ('TST13D', v_user, 'Lobby Test', 'matematik', 2, 10,
     8, 20, 'sync', 'lobby')
  RETURNING id INTO v_source_id;

  INSERT INTO public.room_members (room_id, user_id, role)
    VALUES (v_source_id, v_user, 'host');

  PERFORM set_config('request.jwt.claim.sub', v_user::TEXT, TRUE);

  BEGIN
    PERFORM public.replay_room(v_source_id);
    RAISE EXCEPTION 'T8 FAIL: lobby state oda replay edildi';
  EXCEPTION WHEN sqlstate 'P0003' THEN
    RAISE NOTICE 'OK: T8 source state=lobby P0003 reddetti (sadece completed/archived)';
  END;

  PERFORM set_config('request.jwt.claim.sub', '', TRUE);
END $$;

-- =============================================================================
-- T9: Title overflow handling (plan-deviation #79, Codex P3 #7)
-- =============================================================================
DO $$
DECLARE
  v_user UUID := gen_random_uuid();
  v_source_id UUID;
  v_clone_result JSONB;
  v_clone_id UUID;
  v_clone_title TEXT;
  v_long_title TEXT := repeat('A', 75);  -- 75 char (75+10=85 overflow)
BEGIN
  INSERT INTO public.rooms
    (code, host_id, title, category, difficulty, question_count,
     max_players, per_question_seconds, mode, state)
  VALUES
    ('TST13E', v_user, v_long_title, 'matematik', 2, 10,
     8, 20, 'sync', 'completed')
  RETURNING id INTO v_source_id;

  INSERT INTO public.room_members (room_id, user_id, role)
    VALUES (v_source_id, v_user, 'host');

  PERFORM set_config('request.jwt.claim.sub', v_user::TEXT, TRUE);

  v_clone_result := public.replay_room(v_source_id);
  v_clone_id := (v_clone_result->>'id')::UUID;

  SELECT title INTO v_clone_title FROM public.rooms WHERE id = v_clone_id;

  IF char_length(v_clone_title) > 80 THEN
    RAISE EXCEPTION 'T9 FAIL: clone title overflow %, %', char_length(v_clone_title), v_clone_title;
  END IF;
  IF v_clone_title NOT LIKE '%(Tekrar)' THEN
    RAISE EXCEPTION 'T9 FAIL: clone title (Tekrar) marker yok: %', v_clone_title;
  END IF;
  RAISE NOTICE 'OK: T9 title overflow handle (% chars, marker dahil)', char_length(v_clone_title);

  -- T9b: Yeniden replay et — (Tekrar) zaten var, tekrar eklenmemeli
  v_clone_result := public.replay_room(v_clone_id);
  v_clone_id := (v_clone_result->>'id')::UUID;
  SELECT title INTO v_clone_title FROM public.rooms WHERE id = v_clone_id;

  IF v_clone_title NOT LIKE '%(Tekrar)' THEN
    RAISE EXCEPTION 'T9b FAIL: yeniden replay title (Tekrar) marker yok: %', v_clone_title;
  END IF;
  -- (Tekrar) sayisi 1 olmali (artmamali — sadece bir tane)
  IF v_clone_title LIKE '%(Tekrar)%(Tekrar)%' THEN
    RAISE EXCEPTION 'T9b FAIL: birden fazla (Tekrar) marker eklendi: %', v_clone_title;
  END IF;
  RAISE NOTICE 'OK: T9b yeniden replay (Tekrar) tek kalir (idempotent marker)';

  PERFORM set_config('request.jwt.claim.sub', '', TRUE);
END $$;

-- =============================================================================
-- T10: audit_log row insertion
-- =============================================================================
DO $$
DECLARE
  v_user UUID := gen_random_uuid();
  v_source_id UUID;
  v_clone_result JSONB;
  v_clone_id UUID;
  v_audit_count INT;
BEGIN
  INSERT INTO public.rooms
    (code, host_id, title, category, difficulty, question_count,
     max_players, per_question_seconds, mode, state)
  VALUES
    ('TST13F', v_user, 'Audit Test', 'matematik', 2, 10,
     8, 20, 'sync', 'completed')
  RETURNING id INTO v_source_id;

  INSERT INTO public.room_members (room_id, user_id, role)
    VALUES (v_source_id, v_user, 'host');

  PERFORM set_config('request.jwt.claim.sub', v_user::TEXT, TRUE);
  v_clone_result := public.replay_room(v_source_id);
  v_clone_id := (v_clone_result->>'id')::UUID;

  SELECT COUNT(*) INTO v_audit_count
  FROM public.room_audit_log
  WHERE room_id = v_clone_id
    AND action = 'room_replay_created'
    AND actor_id = v_user;

  IF v_audit_count <> 1 THEN
    RAISE EXCEPTION 'T10 FAIL: audit_log row sayisi % (1 beklenir)', v_audit_count;
  END IF;
  RAISE NOTICE 'OK: T10 audit_log row_replay_created marker yazildi';

  PERFORM set_config('request.jwt.claim.sub', '', TRUE);
END $$;

ROLLBACK;
