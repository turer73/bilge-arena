-- =============================================================================
-- Bilge Arena Oda Sistemi: 10_lobby_preview_question test (Sprint 2A Task 2)
-- =============================================================================
-- TDD GREEN dogrulama: 10_lobby_preview_question.sql migration uygulandiktan sonra.
--
-- 4 Test:
--   T1: get_lobby_preview_question fonksiyon var, JSONB doner
--   T2: Anti-cheat: response 'answer' alani ICERMEZ
--   T3: Bos kategori (eslesmesyen) -> NULL doner
--   T4: REVOKE PUBLIC + GRANT authenticated dogru ayarli
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/10_lobby_preview_question_test.sql
--
-- Beklenen: tum NOTICE 'OK: ...', exit 0
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- T1: Fonksiyon var, JSONB doner
-- =============================================================================
DO $$
DECLARE v_arg_count INT;
DECLARE v_return_type TEXT;
BEGIN
  SELECT pronargs, pg_catalog.format_type(prorettype, NULL)
  INTO v_arg_count, v_return_type
  FROM pg_proc
  WHERE proname = 'get_lobby_preview_question'
    AND pronamespace = 'public'::regnamespace;

  IF v_arg_count IS NULL THEN
    RAISE EXCEPTION 'T1 FAIL: get_lobby_preview_question bulunamadi';
  END IF;
  IF v_arg_count <> 1 THEN
    RAISE EXCEPTION 'T1 FAIL: arg sayisi 1 olmali, mevcut: %', v_arg_count;
  END IF;
  IF v_return_type <> 'jsonb' THEN
    RAISE EXCEPTION 'T1 FAIL: return type jsonb olmali, mevcut: %', v_return_type;
  END IF;

  RAISE NOTICE 'OK: T1 get_lobby_preview_question fonksiyon var (1 arg, jsonb)';
END $$;

-- =============================================================================
-- T2: Anti-cheat - response 'answer' alani icermez
-- =============================================================================
-- Test sorusu insert et, RPC cagri dogrula
DO $$
DECLARE
  v_test_id UUID;
  v_result JSONB;
BEGIN
  -- Test sorusu insert (game zorunlu, category test_category)
  INSERT INTO public.questions
    (game, category, content, is_active, difficulty)
  VALUES
    ('matematik',
     'test_lobby_preview',
     '{"question":"Test soru?","options":["a","b","c","d"],"answer":"a"}'::jsonb,
     TRUE,
     2)
  RETURNING id INTO v_test_id;

  -- RPC cagri
  SELECT public.get_lobby_preview_question('test_lobby_preview') INTO v_result;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'T2 FAIL: RPC NULL dondurdu, soru bulamadi';
  END IF;

  -- 'answer' alani DONMEMELI
  IF v_result ? 'answer' THEN
    RAISE EXCEPTION 'T2 FAIL: anti-cheat ihlali - response answer iceriyor: %', v_result;
  END IF;

  -- 'question' ve 'options' DONMELI
  IF NOT (v_result ? 'question') THEN
    RAISE EXCEPTION 'T2 FAIL: response question icermiyor: %', v_result;
  END IF;
  IF NOT (v_result ? 'options') THEN
    RAISE EXCEPTION 'T2 FAIL: response options icermiyor: %', v_result;
  END IF;

  RAISE NOTICE 'OK: T2 anti-cheat: response answer icermez (sadece question+options)';
END $$;

-- =============================================================================
-- T3: Bos kategori (eslesmesyen) -> NULL doner
-- =============================================================================
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT public.get_lobby_preview_question('xx_nonexistent_yy_zz') INTO v_result;

  IF v_result IS NOT NULL THEN
    RAISE EXCEPTION 'T3 FAIL: bos kategoride NULL beklendi, doner: %', v_result;
  END IF;

  RAISE NOTICE 'OK: T3 bos kategori NULL doner';
END $$;

-- =============================================================================
-- T4: REVOKE PUBLIC + GRANT authenticated
-- =============================================================================
DO $$
DECLARE v_public_has BOOLEAN;
DECLARE v_auth_has BOOLEAN;
BEGIN
  SELECT has_function_privilege('public', 'public.get_lobby_preview_question(text)', 'EXECUTE')
    INTO v_public_has;
  SELECT has_function_privilege('authenticated', 'public.get_lobby_preview_question(text)', 'EXECUTE')
    INTO v_auth_has;

  IF v_public_has THEN
    RAISE EXCEPTION 'T4 FAIL: PUBLIC EXECUTE iznine sahip (REVOKE eksik)';
  END IF;
  IF NOT v_auth_has THEN
    RAISE EXCEPTION 'T4 FAIL: authenticated EXECUTE iznine sahip degil (GRANT eksik)';
  END IF;

  RAISE NOTICE 'OK: T4 REVOKE PUBLIC + GRANT authenticated dogru';
END $$;

ROLLBACK;
