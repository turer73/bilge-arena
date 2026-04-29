-- =============================================================================
-- Bilge Arena Oda Sistemi: 8_rooms_functions_create migration (Sprint 1 PR3)
-- =============================================================================
-- Hedef: 1 PL/pgSQL function (create_room) - kullanici yeni oda olusturur:
--          - Crockford-32 6-char code uretir, UNIQUE collision'da 5 retry
--          - rooms INSERT (auth.uid() = host_id)
--          - room_members INSERT (host olarak)
--          - audit_log entry (room_created)
--          - Returns: oda UUID + code (icin client kodu kullanicilara sunabilir)
--
-- Plan referansi: docs/plans/2026-04-27-oda-sistemi-implementation.md
--                 Sprint 1 PR3 (Task 3.2 prerequisite)
-- Test referansi: 8_rooms_functions_create_test.sql (TDD GREEN target)
--
-- Plan-deviations:
--   #41 (kalitim): Caller identity = auth.uid() (parametre yerine).
--   #43 (kalitim): Linear decay score formula (PR2b).
--   #51 (kalitim): wordquest sync filter (questions-sync.sh awk).
--   #52 (PR3): .gitattributes ile CRLF root-cause fix.
--   #53 (yeni, Codex P1 #40 onlemi): REVOKE EXECUTE FROM PUBLIC + GRANT
--       EXECUTE TO authenticated. Default PUBLIC GRANT vulnerability'sini
--       en bastan engelle.
--
-- Crockford-32 alphabet: A-H, J-N, P-Z, 2-9 (32 chars). 0/I/O/L/1 excluded
-- (visual ambiguity). 6-char: 32^6 = 1.07 billion kombinasyon, SMS-friendly.
-- chk_rooms_code_format CHECK constraint regex: ^[A-HJ-NP-Z2-9]{6}$
--
-- UNIQUE collision retry: 5 deneme. Dogum gunu paradoksu sonu sasacak orana
-- vurmadan 1B kombinasyon icinden cakisma cok dusuk. 5 deneme yeterli.
--
-- Lock order (Codex P1 PR #39 kalitim): rooms ilk, sonra room_members.
-- Submit_answer + reveal_round + advance_round + auto_relay_tick ile uyumlu.
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/8_rooms_functions_create.sql
--
-- Yeni error codes:
--   P0013 - Code generation 5 retry sonrasi UNIQUE collision (cluster sasirtici dolu)
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- Crockford-32 code generator (private helper)
-- =============================================================================
-- 6-char string: A-H + J-N + P-Z + 2-9 (excluding 0/I/O/L/1)
-- pgcrypto gen_random_bytes ile cryptographic random source
-- VOLATILE (default) ZORUNLU: IMMUTABLE/STABLE PG'ye "ayni input ayni output"
-- bildirir, planner cache eder, ardisik cagri AYNI code donerlir. Random
-- function her zaman VOLATILE olmali.
CREATE OR REPLACE FUNCTION public._gen_room_code()
RETURNS CHAR(6)
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_catalog
AS $$
DECLARE
  -- Crockford-32 (32 char): chk_rooms_code_format ile %100 uyumlu
  v_alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code     TEXT := '';
  v_i        INT;
  v_byte     INT;
BEGIN
  FOR v_i IN 1..6 LOOP
    -- gen_random_bytes uses pgcrypto extension (PR1'de yuklu)
    v_byte := get_byte(gen_random_bytes(1), 0);
    -- Modulo 32 reduce (alphabet length)
    v_code := v_code || substr(v_alphabet, (v_byte % 32) + 1, 1);
  END LOOP;
  RETURN v_code;
END;
$$;

-- Helper'i tag'le sadece create_room callable yapsin
REVOKE EXECUTE ON FUNCTION public._gen_room_code() FROM PUBLIC;

-- =============================================================================
-- create_room: yeni oda olustur (auth.uid() = host)
-- =============================================================================
-- Validation:
--   - p_title: 3-80 char (CHECK ile zorunlu)
--   - p_category: TEXT (NOT NULL)
--   - p_difficulty: 1-5 (CHECK)
--   - p_question_count: 5-30 (CHECK)
--   - p_max_players: 2-20 (CHECK)
--   - p_per_question_seconds: 10-60 (CHECK)
-- Returns: jsonb {id, code} -- client kodu kullaniciya gosterir
CREATE OR REPLACE FUNCTION public.create_room(
  p_title TEXT,
  p_category TEXT,
  p_difficulty SMALLINT DEFAULT 2,
  p_question_count SMALLINT DEFAULT 10,
  p_max_players SMALLINT DEFAULT 8,
  p_per_question_seconds SMALLINT DEFAULT 20,
  p_mode TEXT DEFAULT 'sync'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller   UUID;
  v_room_id  UUID;
  v_code     CHAR(6);
  v_attempt  INT := 0;
  v_max_retry CONSTANT INT := 5;
BEGIN
  -- Auth context
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required (auth.uid() NULL)'
      USING ERRCODE = 'P0001';
  END IF;

  -- Code generation with collision retry (UNIQUE rooms_code_idx)
  LOOP
    v_attempt := v_attempt + 1;
    v_code := public._gen_room_code();

    BEGIN
      INSERT INTO public.rooms
        (code, host_id, title, category, difficulty, question_count,
         max_players, per_question_seconds, mode, state)
      VALUES
        (v_code, v_caller, p_title, p_category, p_difficulty, p_question_count,
         p_max_players, p_per_question_seconds, p_mode, 'lobby')
      RETURNING id INTO v_room_id;

      EXIT;  -- success, loop'tan cik
    EXCEPTION
      WHEN unique_violation THEN
        -- code UNIQUE collision, retry
        IF v_attempt >= v_max_retry THEN
          RAISE EXCEPTION 'Code generation 5 retry sonrasi cakistir, sasirtici dolu'
            USING ERRCODE = 'P0013';
        END IF;
        -- continue loop (next iteration generates new code)
    END;
  END LOOP;

  -- INSERT first room_member as host
  INSERT INTO public.room_members (room_id, user_id, role)
    VALUES (v_room_id, v_caller, 'host');

  -- Audit
  INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
    VALUES (v_room_id, v_caller, 'room_created',
            jsonb_build_object(
              'code', v_code,
              'category', p_category,
              'difficulty', p_difficulty,
              'question_count', p_question_count,
              'max_players', p_max_players,
              'per_question_seconds', p_per_question_seconds,
              'mode', p_mode,
              'attempts', v_attempt
            ));

  RETURN jsonb_build_object(
    'id', v_room_id,
    'code', v_code
  );
END;
$$;

-- Privilege: REVOKE PUBLIC + GRANT authenticated (Codex P1 #40 kalitim)
REVOKE EXECUTE ON FUNCTION public.create_room(TEXT, TEXT, SMALLINT, SMALLINT,
                                                SMALLINT, SMALLINT, TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_room(TEXT, TEXT, SMALLINT, SMALLINT,
                                              SMALLINT, SMALLINT, TEXT)
  TO authenticated;

COMMIT;
