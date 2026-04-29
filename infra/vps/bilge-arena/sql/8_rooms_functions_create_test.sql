-- =============================================================================
-- Bilge Arena Oda Sistemi: 8_rooms_functions_create test (TDD)
-- =============================================================================
-- Hedef: create_room() davranisini dogrula:
--          - Code Crockford-32 format
--          - room INSERT host_id = auth.uid()
--          - host room_members entry
--          - audit_log room_created
--          - Auth-yok P0001
--          - Privilege: authenticated EXECUTE OK, anon DENIED
--
-- Plan referansi: docs/plans/2026-04-27-oda-sistemi-implementation.md PR3
--
-- Plan-deviations: #41 (kalitim auth.uid()), #52 (.gitattributes), #53 (REVOKE PUBLIC)
--
-- Kullanim (PANOLA_ADMIN):
--   docker exec -i panola-postgres psql -U panola_admin -h localhost \
--     -d bilge_arena_dev -v ON_ERROR_STOP=on \
--     -f - < infra/vps/bilge-arena/sql/8_rooms_functions_create_test.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

SELECT set_config('request.jwt.claim.sub',
                  '22222222-2222-2222-2222-222222222222', FALSE);

-- =============================================================================
-- Test 1: Auth-yok P0001
-- =============================================================================
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', FALSE);
  PERFORM public.create_room(
    'Test Oda'::text,
    'sayilar'::text,
    2::smallint, 10::smallint, 8::smallint, 20::smallint, 'sync'::text
  );
  RAISE EXCEPTION 'FAIL Test 1: auth-yok create basarili';
EXCEPTION
  WHEN sqlstate 'P0001' THEN
    RAISE NOTICE 'OK Test 1: auth-yok create bloke (P0001)';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL Test 1: yanlis hata: % (%)', SQLERRM, SQLSTATE;
END $$;

-- =============================================================================
-- Test 2: Happy path - host create basarili (return id+code)
-- =============================================================================
SELECT set_config('request.jwt.claim.sub',
                  '22222222-2222-2222-2222-222222222222', FALSE);
DO $$
DECLARE
  v_result JSONB;
  v_room_id UUID;
  v_code TEXT;
BEGIN
  v_result := public.create_room(
    'Test Oda'::text,
    'sayilar'::text,
    2::smallint, 10::smallint, 8::smallint, 20::smallint, 'sync'::text
  );

  v_room_id := (v_result->>'id')::UUID;
  v_code := v_result->>'code';

  IF v_room_id IS NULL THEN
    RAISE EXCEPTION 'FAIL Test 2: id NULL';
  END IF;
  IF v_code IS NULL OR length(v_code) <> 6 THEN
    RAISE EXCEPTION 'FAIL Test 2: code 6-char olmamali, %', v_code;
  END IF;
  IF v_code !~ '^[A-HJ-NP-Z2-9]{6}$' THEN
    RAISE EXCEPTION 'FAIL Test 2: code Crockford-32 format ihlali, %', v_code;
  END IF;

  RAISE NOTICE 'OK Test 2: create_room basarili, code=%', v_code;
END $$;

-- =============================================================================
-- Test 3: room.host_id = auth.uid()
-- =============================================================================
DO $$
DECLARE v_host UUID; v_state TEXT;
BEGIN
  SELECT host_id, state INTO v_host, v_state
    FROM public.rooms
    WHERE host_id = '22222222-2222-2222-2222-222222222222'
    ORDER BY created_at DESC LIMIT 1;

  IF v_host <> '22222222-2222-2222-2222-222222222222'::uuid THEN
    RAISE EXCEPTION 'FAIL Test 3: host_id mismatch';
  END IF;
  IF v_state <> 'lobby' THEN
    RAISE EXCEPTION 'FAIL Test 3: state=lobby beklendi, %', v_state;
  END IF;
  RAISE NOTICE 'OK Test 3: host_id=auth.uid(), state=lobby';
END $$;

-- =============================================================================
-- Test 4: ilk room_member otomatik olustu (host olarak)
-- =============================================================================
DO $$
DECLARE v_count INT; v_role TEXT;
BEGIN
  SELECT count(*), MAX(role) INTO v_count, v_role
    FROM public.room_members rm
    JOIN public.rooms r ON r.id = rm.room_id
    WHERE r.host_id = '22222222-2222-2222-2222-222222222222'
      AND rm.user_id = '22222222-2222-2222-2222-222222222222';

  IF v_count <> 1 OR v_role <> 'host' THEN
    RAISE EXCEPTION 'FAIL Test 4: count=%, role=%', v_count, v_role;
  END IF;
  RAISE NOTICE 'OK Test 4: ilk room_member host olarak';
END $$;

-- =============================================================================
-- Test 5: Audit log room_created entry
-- =============================================================================
DO $$
DECLARE v_count INT; v_payload JSONB;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.room_audit_log al
    JOIN public.rooms r ON r.id = al.room_id
    WHERE r.host_id = '22222222-2222-2222-2222-222222222222'
      AND al.action = 'room_created';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL Test 5: 1 audit entry beklendi, %', v_count;
  END IF;

  SELECT al.payload INTO v_payload
    FROM public.room_audit_log al
    JOIN public.rooms r ON r.id = al.room_id
    WHERE r.host_id = '22222222-2222-2222-2222-222222222222'
      AND al.action = 'room_created'
    LIMIT 1;

  IF v_payload->>'category' <> 'sayilar' THEN
    RAISE EXCEPTION 'FAIL Test 5: audit payload category mismatch';
  END IF;
  RAISE NOTICE 'OK Test 5: audit log room_created entry + payload';
END $$;

-- =============================================================================
-- Test 6: 5 ardisik create -> 5 unique code
-- =============================================================================
DO $$
DECLARE v_codes TEXT[]; v_unique INT;
BEGIN
  v_codes := ARRAY[]::TEXT[];
  FOR i IN 1..5 LOOP
    v_codes := array_append(v_codes,
      (public.create_room(
        'Test ' || i, 'sayilar', 2::smallint, 10::smallint, 8::smallint,
        20::smallint, 'sync'::text)->>'code')::TEXT);
  END LOOP;

  SELECT count(DISTINCT c) INTO v_unique FROM unnest(v_codes) AS c;

  IF v_unique <> 5 THEN
    RAISE EXCEPTION 'FAIL Test 6: 5 random code arasinda % unique', v_unique;
  END IF;
  RAISE NOTICE 'OK Test 6: 5 ardisik unique code (random distribution OK)';
END $$;

-- =============================================================================
-- Test 7: Privilege - authenticated EXECUTE OK, anon DENIED
-- =============================================================================
DO $$
BEGIN
  IF NOT has_function_privilege('authenticated',
      'public.create_room(text,text,smallint,smallint,smallint,smallint,text)',
      'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL Test 7: authenticated EXECUTE missing';
  END IF;
  IF has_function_privilege('anon',
      'public.create_room(text,text,smallint,smallint,smallint,smallint,text)',
      'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL Test 7: anon EXECUTE granted (PUBLIC GRANT vulnerability)';
  END IF;
  RAISE NOTICE 'OK Test 7: authenticated=t, anon=f (REVOKE PUBLIC + GRANT auth)';
END $$;

-- =============================================================================
-- Test 8: Yanlis kategori (questions yok) - create_room basarili olmali
--          (start_room'da P0004 atilir, create asamasinda check yok)
-- =============================================================================
DO $$
DECLARE v_result JSONB;
BEGIN
  v_result := public.create_room(
    'Bos Kat Oda'::text,
    'YOKKAT'::text,
    2::smallint, 10::smallint, 8::smallint, 20::smallint, 'sync'::text
  );
  IF (v_result->>'id') IS NULL THEN
    RAISE EXCEPTION 'FAIL Test 8: create yanlis kategori icin de basarili olmali';
  END IF;
  RAISE NOTICE 'OK Test 8: create kategori dogrulamasi yapmaz (start_room sirasinda)';
END $$;

ROLLBACK;
