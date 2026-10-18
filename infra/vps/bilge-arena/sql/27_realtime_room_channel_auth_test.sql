-- =============================================================================
-- Bilge Arena Oda Sistemi: 27_realtime_room_channel_auth test (TDD)
-- =============================================================================
-- Hedef: 27 sonrasi realtime.messages politikalari Realtime'in private kanal
--        yetki sorgusunu oda uyeligine baglar:
--          - aktif uye (host/player) room-<uuid> broadcast+presence satirlarini
--            gorur ve INSERT edebilir
--          - atilan uye (is_active=false), uye olmayan, baska odanin uyesi ve
--            anon gormez / yazamaz (42501)
--          - bicimsiz topic hata vermeden reddedilir
--
-- Realtime'in yaptigi (v2.140.7, Authorization): mesajlari kendi rolüyle
-- ekler, sonra set_config('role'), 'request.jwt.claims', 'request.jwt.claim.sub',
-- 'realtime.topic' ile JWT rolune gecip SELECT eder; yazma icin ayni rolle
-- INSERT dener. Bu test ayni adimlari SET LOCAL ROLE ile taklit eder.
--
-- Kullanim (SUPERUSER; her sey ROLLBACK edilir):
--   docker exec -i bilge-arena-db psql -U ba_admin -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/27_realtime_room_channel_auth_test.sql
--
-- Beklenen RED (27 uygulanmadan): Test 1.1'de politika yok diye abort.
-- Beklenen GREEN: tum NOTICE 'OK Test X.Y' satirlari, exit 0.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'Bu test superuser ile calismali (SET ROLE authenticated/anon)';
  END IF;
END $$;

-- =============================================================================
-- Section 1: Katalog
-- =============================================================================

-- Test 1.1: iki politika var, yalniz authenticated, RLS acik
DO $$
DECLARE
  v_n INT;
  v_rls BOOLEAN;
BEGIN
  SELECT count(*) INTO v_n FROM pg_policies
  WHERE schemaname = 'realtime' AND tablename = 'messages'
    AND policyname IN ('room_channel_select_members', 'room_channel_insert_members')
    AND roles = '{authenticated}';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 1.1: oda kanali politikalari eksik (% / 2)', v_n;
  END IF;
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'realtime.messages'::regclass;
  IF NOT v_rls THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 1.1: realtime.messages RLS kapali';
  END IF;
  SELECT count(*) INTO v_n FROM pg_policies
  WHERE schemaname = 'realtime' AND tablename = 'messages'
    AND ('anon' = ANY(roles) OR 'public' = ANY(roles));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 1.1: anon/public icin realtime.messages politikasi var';
  END IF;
  RAISE NOTICE 'OK Test 1.1: realtime.messages RLS + 2 authenticated politikasi';
END $$;

-- =============================================================================
-- Fixture: oda R (host A, oyuncu B, atilan K), oda S (yalniz C)
-- =============================================================================
INSERT INTO public.rooms
  (id, code, host_id, title, category, difficulty, question_count,
   max_players, per_question_seconds, mode, state)
VALUES
  ('27000000-0000-4000-8000-000000000051', 'Z27RTA',
   '27000000-0000-4000-8000-00000000000a', 'T27 Kanal', 't27-rt', 2, 5, 4, 20, 'sync', 'lobby'),
  ('27000000-0000-4000-8000-000000000052', 'Z27RTB',
   '27000000-0000-4000-8000-00000000000c', 'T27 Diger', 't27-rt', 2, 5, 4, 20, 'sync', 'lobby');

INSERT INTO public.room_members (room_id, user_id, role, is_active, left_at)
VALUES
  ('27000000-0000-4000-8000-000000000051', '27000000-0000-4000-8000-00000000000a', 'host', TRUE, NULL),
  ('27000000-0000-4000-8000-000000000051', '27000000-0000-4000-8000-00000000000b', 'player', TRUE, NULL),
  ('27000000-0000-4000-8000-000000000051', '27000000-0000-4000-8000-00000000000d', 'player', FALSE, NOW()),
  ('27000000-0000-4000-8000-000000000052', '27000000-0000-4000-8000-00000000000c', 'host', TRUE, NULL);

-- Realtime'in okuma kontrolunden once ekledigi satirlar (kendi rolüyle).
INSERT INTO realtime.messages (topic, extension, private)
VALUES
  ('room-27000000-0000-4000-8000-000000000051', 'broadcast', TRUE),
  ('room-27000000-0000-4000-8000-000000000051', 'presence', TRUE),
  ('room-not-a-uuid', 'broadcast', TRUE),
  ('lobby-27000000-0000-4000-8000-000000000051', 'broadcast', TRUE);

CREATE TEMP TABLE t27_cases (
  label TEXT, sub UUID, topic TEXT, expect_read INT, expect_write BOOLEAN
) ON COMMIT DROP;
INSERT INTO t27_cases VALUES
  ('host A',            '27000000-0000-4000-8000-00000000000a', 'room-27000000-0000-4000-8000-000000000051', 2, TRUE),
  ('oyuncu B',          '27000000-0000-4000-8000-00000000000b', 'room-27000000-0000-4000-8000-000000000051', 2, TRUE),
  ('buyuk harf topic',  '27000000-0000-4000-8000-00000000000b', 'room-27000000-0000-4000-8000-000000000051', 2, TRUE),
  ('atilan K',          '27000000-0000-4000-8000-00000000000d', 'room-27000000-0000-4000-8000-000000000051', 0, FALSE),
  ('baska oda uyesi C', '27000000-0000-4000-8000-00000000000c', 'room-27000000-0000-4000-8000-000000000051', 0, FALSE),
  ('yabanci E',         '27000000-0000-4000-8000-00000000000e', 'room-27000000-0000-4000-8000-000000000051', 0, FALSE),
  ('bicimsiz topic',    '27000000-0000-4000-8000-00000000000a', 'room-not-a-uuid', 0, FALSE),
  ('baska onek',        '27000000-0000-4000-8000-00000000000a', 'lobby-27000000-0000-4000-8000-000000000051', 0, FALSE);
UPDATE t27_cases SET topic = upper(topic) WHERE label = 'buyuk harf topic';
GRANT SELECT ON t27_cases TO authenticated, anon;

-- =============================================================================
-- Section 2: Davranis (authenticated + JWT claim'leri, Realtime gibi)
-- =============================================================================

-- Test 2.1: okuma (presence/broadcast dinleme)
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  c RECORD;
  v_n INT;
BEGIN
  FOR c IN SELECT * FROM t27_cases LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('role', 'authenticated', 'sub', c.sub, 'aud', 'bilge-arena-realtime')::text, true);
    PERFORM set_config('request.jwt.claim.sub', c.sub::text, true);
    PERFORM set_config('realtime.topic', c.topic, true);
    SELECT count(*) INTO v_n FROM realtime.messages
      WHERE topic = c.topic AND extension IN ('broadcast', 'presence');
    -- Buyuk harf topic tabloda yok (Realtime satiri kendi topic'iyle ekler);
    -- burada yalniz politika ifadesinin buyuk harfte hata vermedigi sinanir.
    IF c.label = 'buyuk harf topic' THEN
      IF v_n <> 0 THEN
        RAISE EXCEPTION 'ASSERT FAILED Test 2.1 (%): beklenmeyen satir %', c.label, v_n;
      END IF;
      CONTINUE;
    END IF;
    IF v_n <> c.expect_read THEN
      RAISE EXCEPTION 'ASSERT FAILED Test 2.1 (%): % satir gordu, % bekleniyordu',
        c.label, v_n, c.expect_read;
    END IF;
  END LOOP;
  RAISE NOTICE 'OK Test 2.1: yalniz aktif uyeler oda kanalini dinleyebilir';
END $$;

-- Test 2.2: yazma (broadcast yayin + presence track)
DO $$
DECLARE
  c RECORD;
  v_ext TEXT;
  v_ok BOOLEAN;
BEGIN
  FOR c IN SELECT * FROM t27_cases LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('role', 'authenticated', 'sub', c.sub)::text, true);
    PERFORM set_config('request.jwt.claim.sub', c.sub::text, true);
    PERFORM set_config('realtime.topic', c.topic, true);
    FOREACH v_ext IN ARRAY ARRAY['broadcast', 'presence'] LOOP
      BEGIN
        INSERT INTO realtime.messages (topic, extension, private) VALUES (c.topic, v_ext, TRUE);
        v_ok := TRUE;
      EXCEPTION WHEN insufficient_privilege THEN
        v_ok := FALSE;
      END;
      IF v_ok <> c.expect_write THEN
        RAISE EXCEPTION 'ASSERT FAILED Test 2.2 (% / %): yazma % beklenen %',
          c.label, v_ext, v_ok, c.expect_write;
      END IF;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'OK Test 2.2: yalniz aktif uyeler oda kanalina yayin/track yapabilir';
END $$;

-- Test 2.3: uye extension disi satir (postgres_changes vb.) yazamaz
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '27000000-0000-4000-8000-00000000000a', true);
  BEGIN
    INSERT INTO realtime.messages (topic, extension, private)
      VALUES ('room-27000000-0000-4000-8000-000000000051', 'postgres_changes', TRUE);
    RAISE EXCEPTION 'ASSERT FAILED Test 2.3: extension=postgres_changes kabul edildi';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RAISE NOTICE 'OK Test 2.3: broadcast/presence disi extension reddedilir';
END $$;
RESET ROLE;

-- Test 2.4: anon hicbir sey gormez / yazamaz
SET LOCAL ROLE anon;
DO $$
DECLARE v_n INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT count(*) INTO v_n FROM realtime.messages;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 2.4: anon % satir gordu', v_n;
  END IF;
  BEGIN
    INSERT INTO realtime.messages (topic, extension, private)
      VALUES ('room-27000000-0000-4000-8000-000000000051', 'broadcast', TRUE);
    RAISE EXCEPTION 'ASSERT FAILED Test 2.4: anon yayin yapabildi';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RAISE NOTICE 'OK Test 2.4: anon oda kanalina erisemez';
END $$;
RESET ROLE;

ROLLBACK;
