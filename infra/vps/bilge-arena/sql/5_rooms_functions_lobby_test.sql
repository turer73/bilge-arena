-- =============================================================================
-- Bilge Arena Oda Sistemi: 5_rooms_functions_lobby test (TDD)
-- =============================================================================
-- Hedef: 5_rooms_functions_lobby.sql migration'inin sonucunda var olmasi
--        gereken 5 PL/pgSQL function (start_room, join_room, leave_room,
--        kick_member, cancel_room) icin behavior + error code testleri.
--
-- Plan referansi: docs/plans/2026-04-27-oda-sistemi-implementation.md
--                 Sprint 1 PR2a (Task 2.1 + Task 2.6 lobby/setup parcasi)
--
-- Plan-deviations:
--   #22 pgTAP yok -> plain SQL DO + RAISE NOTICE/EXCEPTION (PR1 ile uyumlu).
--   #36 (PR2a kapsam): pause/resume/finish PR2b'ye ertelendi.
--   #37 (Karar 1A): question_pool storage = pre-create rounds in room_rounds.
--   #38 (Karar 2A): "draft"/"waiting" eklenmedi, lobby->active direkt.
--   #39 (cancel state): cancel_room state='completed' + audit_log marker.
--   #41 (Codex P1 PR #37): Caller identity = auth.uid() (param degil).
--       Test'ler her PERFORM oncesi set_config('request.jwt.claim.sub', ...)
--       ile JWT claim mock'lar -- production PostgREST flow ile birebir.
--
-- Kullanim (PANOLA_ADMIN, superuser; FORCE RLS bypass icin):
--   docker exec -i panola-postgres psql -U panola_admin -h localhost \
--     -d bilge_arena_dev -v ON_ERROR_STOP=on \
--     -f - < infra/vps/bilge-arena/sql/5_rooms_functions_lobby_test.sql
--
-- NOT: bilge_arena_app ile calistirilamaz: rooms/room_members FORCE RLS
-- aktif, INSERT policy'leri `TO authenticated` only. Test setup INSERT'leri
-- icin superuser BYPASSRLS gerekli. Function'lar SECURITY DEFINER
-- (bilge_arena_app context, BYPASSRLS attribute set 0b fix-up sayesinde) --
-- production runtime'da bu test'in setup'i kullanici tarafindan /api/rooms
-- (PR3) ile yapilacak.
--
-- Beklenen RED state (5_rooms_functions_lobby.sql apply edilmeden once):
--   Test 1.1 -> "function start_room does not exist" -> abort
-- Beklenen GREEN state (apply sonrasi):
--   Tum NOTICE 'OK: ...', exit 0
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Default JWT claim (host identity); test'ler kendi context'lerini set ederek
-- override eder.
SELECT set_config('request.jwt.claim.sub',
                  '22222222-2222-2222-2222-222222222222', FALSE);

-- =============================================================================
-- Setup: mock questions + test users + test rooms
-- =============================================================================
INSERT INTO public.questions (external_id, game, category, difficulty, content, is_active)
VALUES
  ('test-q-001', 'matematik', 'cebir', 2, '{"question":"2+2=?","options":["3","4","5","6"],"answer":"4"}'::jsonb, TRUE),
  ('test-q-002', 'matematik', 'cebir', 2, '{"question":"3*3=?","options":["6","8","9","12"],"answer":"9"}'::jsonb, TRUE),
  ('test-q-003', 'matematik', 'cebir', 2, '{"question":"10/2=?","options":["3","4","5","6"],"answer":"5"}'::jsonb, TRUE),
  ('test-q-004', 'matematik', 'cebir', 2, '{"question":"5-3=?","options":["1","2","3","4"],"answer":"2"}'::jsonb, TRUE),
  ('test-q-005', 'matematik', 'cebir', 2, '{"question":"7+1=?","options":["6","7","8","9"],"answer":"8"}'::jsonb, TRUE);

-- =============================================================================
-- Section 1: start_room (auth.uid() = host kontrol)
-- =============================================================================
INSERT INTO public.rooms
  (id, code, host_id, title, category, difficulty, question_count,
   max_players, per_question_seconds, mode, state)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'TESTAA',
   '22222222-2222-2222-2222-222222222222', 'Test Oda', 'cebir', 2, 5,
   8, 20, 'sync', 'lobby');

INSERT INTO public.room_members (room_id, user_id, role)
VALUES
  ('11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', 'host'),
  ('11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333', 'player');

-- Test 1.0: auth.uid() NULL ise P0001 (defensive check)
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', FALSE);
  PERFORM public.start_room(
    '11111111-1111-1111-1111-111111111111'::uuid
  );
  RAISE EXCEPTION 'FAIL Test 1.0: auth-yok start basarili';
EXCEPTION
  WHEN sqlstate 'P0001' THEN
    RAISE NOTICE 'OK Test 1.0: auth.uid() NULL bloke (P0001)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 1.0: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- Test 1.1: Non-host (auth.uid() != host_id) yetki red (P0001)
SELECT set_config('request.jwt.claim.sub',
                  '99999999-9999-9999-9999-999999999999', FALSE);
DO $$
BEGIN
  PERFORM public.start_room(
    '11111111-1111-1111-1111-111111111111'::uuid
  );
  RAISE EXCEPTION 'FAIL Test 1.1: non-host start basarili';
EXCEPTION
  WHEN sqlstate 'P0001' THEN
    RAISE NOTICE 'OK Test 1.1: non-host bloke (P0001)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 1.1: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- Test 1.2: Happy path - host start (auth.uid() = host_id)
SELECT set_config('request.jwt.claim.sub',
                  '22222222-2222-2222-2222-222222222222', FALSE);
DO $$
BEGIN
  PERFORM public.start_room(
    '11111111-1111-1111-1111-111111111111'::uuid
  );
  RAISE NOTICE 'OK Test 1.2: host start basarili';
END $$;

-- Test 1.3: State 'active' oldu
DO $$
DECLARE v_state TEXT;
BEGIN
  SELECT state INTO v_state FROM public.rooms
    WHERE id = '11111111-1111-1111-1111-111111111111';
  IF v_state <> 'active' THEN
    RAISE EXCEPTION 'FAIL Test 1.3: state=active beklendi, % var', v_state;
  END IF;
  RAISE NOTICE 'OK Test 1.3: state=active';
END $$;

-- Test 1.4: 5 round pre-create edildi
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM public.room_rounds
    WHERE room_id = '11111111-1111-1111-1111-111111111111';
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'FAIL Test 1.4: 5 round beklendi, % var', v_count;
  END IF;
  RAISE NOTICE 'OK Test 1.4: 5 round pre-created';
END $$;

-- Test 1.5: Round index 1..5 ardisik
DO $$
DECLARE v_bad SMALLINT;
BEGIN
  SELECT round_index INTO v_bad
  FROM (
    SELECT round_index,
           ROW_NUMBER() OVER (ORDER BY round_index)::SMALLINT AS rn
    FROM public.room_rounds
    WHERE room_id = '11111111-1111-1111-1111-111111111111'
  ) sub
  WHERE round_index <> rn
  LIMIT 1;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL Test 1.5: round_index sirasiz, ilk hatali %', v_bad;
  END IF;
  RAISE NOTICE 'OK Test 1.5: round_index 1..5 ardisik';
END $$;

-- Test 1.6: question_content_snapshot dolu
DO $$
DECLARE v_null_count INT;
BEGIN
  SELECT count(*) INTO v_null_count
  FROM public.room_rounds
  WHERE room_id = '11111111-1111-1111-1111-111111111111'
    AND (question_content_snapshot IS NULL
         OR question_content_snapshot->>'question' IS NULL);
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'FAIL Test 1.6: % round eksik snapshot', v_null_count;
  END IF;
  RAISE NOTICE 'OK Test 1.6: tum round snapshot dolu';
END $$;

-- Test 1.7: Audit log 'room_started' entry, actor_id = auth.uid()
DO $$
DECLARE v_count INT; v_actor UUID;
BEGIN
  SELECT count(*) INTO v_count FROM public.room_audit_log
    WHERE room_id = '11111111-1111-1111-1111-111111111111'
      AND action = 'room_started';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL Test 1.7: 1 audit entry beklendi, % var', v_count;
  END IF;

  SELECT actor_id INTO v_actor FROM public.room_audit_log
    WHERE room_id = '11111111-1111-1111-1111-111111111111'
      AND action = 'room_started'
    LIMIT 1;
  IF v_actor <> '22222222-2222-2222-2222-222222222222'::uuid THEN
    RAISE EXCEPTION 'FAIL Test 1.7: actor_id=auth.uid() beklendi, % var', v_actor;
  END IF;
  RAISE NOTICE 'OK Test 1.7: audit log room_started entry, actor=auth.uid()';
END $$;

-- Test 1.8: Re-start blokeli (state zaten active)
DO $$
BEGIN
  PERFORM public.start_room(
    '11111111-1111-1111-1111-111111111111'::uuid
  );
  RAISE EXCEPTION 'FAIL Test 1.8: re-start basarisiz olmadi';
EXCEPTION
  WHEN sqlstate 'P0003' THEN
    RAISE NOTICE 'OK Test 1.8: re-start bloke (P0003)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 1.8: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- Test 1.9: Tek uyeli oda start edemez (P0005)
INSERT INTO public.rooms
  (id, code, host_id, title, category, difficulty, question_count,
   max_players, per_question_seconds, mode, state)
VALUES
  ('44444444-4444-4444-4444-444444444444', 'TESTAB',
   '22222222-2222-2222-2222-222222222222', 'Yalniz Oda', 'cebir', 2, 5,
   8, 20, 'sync', 'lobby');

INSERT INTO public.room_members (room_id, user_id, role)
VALUES
  ('44444444-4444-4444-4444-444444444444',
   '22222222-2222-2222-2222-222222222222', 'host');

DO $$
BEGIN
  PERFORM public.start_room(
    '44444444-4444-4444-4444-444444444444'::uuid
  );
  RAISE EXCEPTION 'FAIL Test 1.9: tek uyeli start basarisiz olmadi';
EXCEPTION
  WHEN sqlstate 'P0005' THEN
    RAISE NOTICE 'OK Test 1.9: tek uye bloke (P0005)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 1.9: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- Test 1.10: Yetersiz soru (category='YOKKAT') P0004
INSERT INTO public.rooms
  (id, code, host_id, title, category, difficulty, question_count,
   max_players, per_question_seconds, mode, state)
VALUES
  ('55555555-5555-5555-5555-555555555555', 'TESTAC',
   '22222222-2222-2222-2222-222222222222', 'Yok Oda', 'YOKKAT', 2, 10,
   8, 20, 'sync', 'lobby');

INSERT INTO public.room_members (room_id, user_id, role)
VALUES
  ('55555555-5555-5555-5555-555555555555',
   '22222222-2222-2222-2222-222222222222', 'host'),
  ('55555555-5555-5555-5555-555555555555',
   '33333333-3333-3333-3333-333333333333', 'player');

DO $$
BEGIN
  PERFORM public.start_room(
    '55555555-5555-5555-5555-555555555555'::uuid
  );
  RAISE EXCEPTION 'FAIL Test 1.10: soru yokken start basarili';
EXCEPTION
  WHEN sqlstate 'P0004' THEN
    RAISE NOTICE 'OK Test 1.10: yetersiz soru bloke (P0004)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 1.10: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- =============================================================================
-- Section 2: join_room (joiner = auth.uid())
-- =============================================================================
INSERT INTO public.rooms
  (id, code, host_id, title, category, difficulty, question_count,
   max_players, per_question_seconds, mode, state)
VALUES
  ('66666666-6666-6666-6666-666666666666', 'JKKAAA',
   '22222222-2222-2222-2222-222222222222', 'Join Oda', 'cebir', 2, 5,
   3, 20, 'sync', 'lobby');

INSERT INTO public.room_members (room_id, user_id, role)
VALUES
  ('66666666-6666-6666-6666-666666666666',
   '22222222-2222-2222-2222-222222222222', 'host');

-- Test 2.1: Happy path - kullanici 77777... join (auth.uid()=joiner)
SELECT set_config('request.jwt.claim.sub',
                  '77777777-7777-7777-7777-777777777777', FALSE);
DO $$
DECLARE v_room_id UUID;
BEGIN
  v_room_id := public.join_room('JKKAAA'::char(6));
  IF v_room_id <> '66666666-6666-6666-6666-666666666666'::uuid THEN
    RAISE EXCEPTION 'FAIL Test 2.1: join_room yanlis room_id dondu: %', v_room_id;
  END IF;
  RAISE NOTICE 'OK Test 2.1: join basarili, room_id dondu';
END $$;

-- Test 2.2: Member kaydedildi (user_id = auth.uid())
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM public.room_members
    WHERE room_id = '66666666-6666-6666-6666-666666666666'
      AND user_id = '77777777-7777-7777-7777-777777777777'
      AND is_active = TRUE;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL Test 2.2: member entry beklendi, % var', v_count;
  END IF;
  RAISE NOTICE 'OK Test 2.2: member kaydedildi (auth.uid() = user_id)';
END $$;

-- Test 2.3: Yanlis kod P0008
DO $$
BEGIN
  PERFORM public.join_room('YKKAAB'::char(6));
  RAISE EXCEPTION 'FAIL Test 2.3: yanlis kod basarili';
EXCEPTION
  WHEN sqlstate 'P0008' THEN
    RAISE NOTICE 'OK Test 2.3: yanlis kod bloke (P0008)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 2.3: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- Test 2.4: Duplicate join P0007 (auth.uid() = 77777... hala set)
DO $$
BEGIN
  PERFORM public.join_room('JKKAAA'::char(6));
  RAISE EXCEPTION 'FAIL Test 2.4: duplicate join basarili';
EXCEPTION
  WHEN sqlstate 'P0007' THEN
    RAISE NOTICE 'OK Test 2.4: duplicate bloke (P0007)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 2.4: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- Test 2.5a: 3. uye (auth.uid()=88888...) join (max=3 sinirinda OK)
SELECT set_config('request.jwt.claim.sub',
                  '88888888-8888-8888-8888-888888888888', FALSE);
DO $$
BEGIN
  PERFORM public.join_room('JKKAAA'::char(6));
  RAISE NOTICE 'OK Test 2.5a: 3. uye join (max sinirinda)';
END $$;

-- Test 2.5b: 4. uye dolu odaya (auth.uid()=99999...) P0006
SELECT set_config('request.jwt.claim.sub',
                  '99999999-9999-9999-9999-999999999999', FALSE);
DO $$
BEGIN
  PERFORM public.join_room('JKKAAA'::char(6));
  RAISE EXCEPTION 'FAIL Test 2.5b: dolu odaya join basarili';
EXCEPTION
  WHEN sqlstate 'P0006' THEN
    RAISE NOTICE 'OK Test 2.5b: dolu oda bloke (P0006)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 2.5b: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- Test 2.6: state=active'te join blokeli (TESTAA active state'inde)
SELECT set_config('request.jwt.claim.sub',
                  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', FALSE);
DO $$
BEGIN
  PERFORM public.join_room('TESTAA'::char(6));
  RAISE EXCEPTION 'FAIL Test 2.6: active oda join basarili';
EXCEPTION
  WHEN sqlstate 'P0003' THEN
    RAISE NOTICE 'OK Test 2.6: non-lobby join bloke (P0003)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 2.6: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- =============================================================================
-- Section 3: leave_room (leaver = auth.uid())
-- =============================================================================
-- (room=66666... JKKAAA: host + player1 (77777) + player2 (88888) = 3 active)
-- Test 3.1: 88888... kendi membership'ini birakir
SELECT set_config('request.jwt.claim.sub',
                  '88888888-8888-8888-8888-888888888888', FALSE);
DO $$
BEGIN
  PERFORM public.leave_room(
    '66666666-6666-6666-6666-666666666666'::uuid
  );
  RAISE NOTICE 'OK Test 3.1: leave_room basarili';
END $$;

-- Test 3.2: is_active=FALSE + left_at dolu
DO $$
DECLARE v_active BOOL; v_left TIMESTAMPTZ;
BEGIN
  SELECT is_active, left_at INTO v_active, v_left
    FROM public.room_members
    WHERE room_id = '66666666-6666-6666-6666-666666666666'
      AND user_id = '88888888-8888-8888-8888-888888888888';
  IF v_active OR v_left IS NULL THEN
    RAISE EXCEPTION 'FAIL Test 3.2: is_active=%, left_at=% beklenmiyor', v_active, v_left;
  END IF;
  RAISE NOTICE 'OK Test 3.2: is_active=FALSE, left_at dolu';
END $$;

-- Test 3.3: cccc... (uye degil) leave attempt -> P0002
SELECT set_config('request.jwt.claim.sub',
                  'cccccccc-cccc-cccc-cccc-cccccccccccc', FALSE);
DO $$
BEGIN
  PERFORM public.leave_room(
    '66666666-6666-6666-6666-666666666666'::uuid
  );
  RAISE EXCEPTION 'FAIL Test 3.3: olmayan member leave basarili';
EXCEPTION
  WHEN sqlstate 'P0002' THEN
    RAISE NOTICE 'OK Test 3.3: olmayan member bloke (P0002)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 3.3: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- Test 3.4: Audit log 'member_left' entry (actor_id = leaver = auth.uid())
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM public.room_audit_log
    WHERE room_id = '66666666-6666-6666-6666-666666666666'
      AND action = 'member_left'
      AND actor_id = '88888888-8888-8888-8888-888888888888';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL Test 3.4: 1 audit entry beklendi, % var', v_count;
  END IF;
  RAISE NOTICE 'OK Test 3.4: audit log member_left entry';
END $$;

-- =============================================================================
-- Section 4: kick_member (host = auth.uid())
-- =============================================================================
-- (room=66666... JKKAAA: host + player1 (77777) active = 2)
-- Test 4.1: Host (auth.uid()=22222...) player1'i kick eder
SELECT set_config('request.jwt.claim.sub',
                  '22222222-2222-2222-2222-222222222222', FALSE);
DO $$
BEGIN
  PERFORM public.kick_member(
    '66666666-6666-6666-6666-666666666666'::uuid,
    '77777777-7777-7777-7777-777777777777'::uuid
  );
  RAISE NOTICE 'OK Test 4.1: kick_member basarili';
END $$;

-- Test 4.2: Kicked member is_active=FALSE
DO $$
DECLARE v_active BOOL;
BEGIN
  SELECT is_active INTO v_active FROM public.room_members
    WHERE room_id = '66666666-6666-6666-6666-666666666666'
      AND user_id = '77777777-7777-7777-7777-777777777777';
  IF v_active THEN
    RAISE EXCEPTION 'FAIL Test 4.2: is_active hala TRUE';
  END IF;
  RAISE NOTICE 'OK Test 4.2: kicked member is_active=FALSE';
END $$;

-- Test 4.3: Non-host (auth.uid()=99999...) kick attempt P0001
SELECT set_config('request.jwt.claim.sub',
                  '99999999-9999-9999-9999-999999999999', FALSE);
DO $$
BEGIN
  PERFORM public.kick_member(
    '66666666-6666-6666-6666-666666666666'::uuid,
    '22222222-2222-2222-2222-222222222222'::uuid
  );
  RAISE EXCEPTION 'FAIL Test 4.3: non-host kick basarili';
EXCEPTION
  WHEN sqlstate 'P0001' THEN
    RAISE NOTICE 'OK Test 4.3: non-host kick bloke (P0001)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 4.3: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- Test 4.4: Audit log 'member_kicked' (actor_id = host = auth.uid())
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM public.room_audit_log
    WHERE room_id = '66666666-6666-6666-6666-666666666666'
      AND action = 'member_kicked'
      AND actor_id = '22222222-2222-2222-2222-222222222222';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL Test 4.4: 1 audit entry beklendi, % var', v_count;
  END IF;
  RAISE NOTICE 'OK Test 4.4: audit log member_kicked entry (actor=host)';
END $$;

-- =============================================================================
-- Section 5: cancel_room (canceller = auth.uid())
-- =============================================================================
INSERT INTO public.rooms
  (id, code, host_id, title, category, difficulty, question_count,
   max_players, per_question_seconds, mode, state)
VALUES
  ('77777777-7777-7777-7777-777777777777', 'CNCLAA',
   '22222222-2222-2222-2222-222222222222', 'Cancel Oda', 'cebir', 2, 5,
   8, 20, 'sync', 'lobby');

INSERT INTO public.room_members (room_id, user_id, role)
VALUES
  ('77777777-7777-7777-7777-777777777777',
   '22222222-2222-2222-2222-222222222222', 'host'),
  ('77777777-7777-7777-7777-777777777777',
   '33333333-3333-3333-3333-333333333333', 'player');

-- Test 5.1: Non-host (player auth.uid()=33333...) cancel attempt P0001
SELECT set_config('request.jwt.claim.sub',
                  '33333333-3333-3333-3333-333333333333', FALSE);
DO $$
BEGIN
  PERFORM public.cancel_room(
    '77777777-7777-7777-7777-777777777777'::uuid,
    'test'::text
  );
  RAISE EXCEPTION 'FAIL Test 5.1: non-host cancel basarili';
EXCEPTION
  WHEN sqlstate 'P0001' THEN
    RAISE NOTICE 'OK Test 5.1: non-host cancel bloke (P0001)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 5.1: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- Test 5.2: Host (auth.uid()=22222...) cancel basarili
SELECT set_config('request.jwt.claim.sub',
                  '22222222-2222-2222-2222-222222222222', FALSE);
DO $$
BEGIN
  PERFORM public.cancel_room(
    '77777777-7777-7777-7777-777777777777'::uuid,
    'host_canceled'::text
  );
  RAISE NOTICE 'OK Test 5.2: host cancel basarili';
END $$;

-- Test 5.3: state='completed' + ended_at dolu
DO $$
DECLARE v_state TEXT; v_ended TIMESTAMPTZ;
BEGIN
  SELECT state, ended_at INTO v_state, v_ended
    FROM public.rooms
    WHERE id = '77777777-7777-7777-7777-777777777777';
  IF v_state <> 'completed' OR v_ended IS NULL THEN
    RAISE EXCEPTION 'FAIL Test 5.3: state=%, ended_at=% beklenmiyor', v_state, v_ended;
  END IF;
  RAISE NOTICE 'OK Test 5.3: state=completed, ended_at dolu';
END $$;

-- Test 5.4: Audit log 'room_canceled' + reason + actor=host
DO $$
DECLARE v_count INT; v_payload JSONB; v_actor UUID;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.room_audit_log
    WHERE room_id = '77777777-7777-7777-7777-777777777777'
      AND action = 'room_canceled';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL Test 5.4: 1 audit entry beklendi, % var', v_count;
  END IF;

  SELECT payload, actor_id INTO v_payload, v_actor
    FROM public.room_audit_log
    WHERE room_id = '77777777-7777-7777-7777-777777777777'
      AND action = 'room_canceled'
    LIMIT 1;
  IF v_payload->>'reason' <> 'host_canceled' THEN
    RAISE EXCEPTION 'FAIL Test 5.4: reason=host_canceled beklendi, % var', v_payload->>'reason';
  END IF;
  IF v_actor <> '22222222-2222-2222-2222-222222222222'::uuid THEN
    RAISE EXCEPTION 'FAIL Test 5.4: actor_id=host beklendi, % var', v_actor;
  END IF;
  RAISE NOTICE 'OK Test 5.4: audit log room_canceled + reason + actor=host';
END $$;

-- Test 5.5: Re-cancel fail (state zaten completed, P0003)
DO $$
BEGIN
  PERFORM public.cancel_room(
    '77777777-7777-7777-7777-777777777777'::uuid,
    'test'::text
  );
  RAISE EXCEPTION 'FAIL Test 5.5: re-cancel basarili';
EXCEPTION
  WHEN sqlstate 'P0003' THEN
    RAISE NOTICE 'OK Test 5.5: re-cancel bloke (P0003)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 5.5: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

ROLLBACK;
