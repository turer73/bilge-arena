-- =============================================================================
-- Bilge Arena Oda Sistemi: 17_async_rls test (TDD)
-- =============================================================================
-- Hedef: room_answers_insert_self_active policy mode-aware behavior:
--          - Policy DROP + CREATE basarili
--          - Policy definition'inda mode='sync' ve mode='async' branch'leri var
--          - room_members_update_self policy mevcut (regression check)
--
-- Plan referansi: C:/Users/sevdi/.claude/plans/wondrous-questing-hedgehog.md
--                 Faz A3
--
-- Kullanim:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/17_async_rls_test.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- 0) 26_rooms_acl_hardening sonrasi: bu iki politika bilerek kaldirilir.
-- =============================================================================
-- Async cevap ve ilerleme yalniz submit_answer_async / advance_round_for_member
-- RPC'leriyle yazilir. 26 uygulanmissa (isaret: can_view_room_round) asagidaki
-- eski varlik kontrolleri yerine yokluk + yetki yoklugu dogrulanir ve test
-- burada biter.
DO $$
BEGIN
  IF to_regprocedure('public.can_view_room_round(uuid,smallint)') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy
             WHERE polrelid = 'public.room_answers'::regclass
               AND polname = 'room_answers_insert_self_active')
     OR has_any_column_privilege('authenticated', 'public.room_answers', 'INSERT') THEN
    RAISE EXCEPTION 'ASSERT FAILED: 26 sonrasi room_answers dogrudan INSERT acik';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy
             WHERE polrelid = 'public.room_members'::regclass
               AND polname = 'room_members_update_self')
     OR has_any_column_privilege('authenticated', 'public.room_members', 'UPDATE') THEN
    RAISE EXCEPTION 'ASSERT FAILED: 26 sonrasi room_members dogrudan UPDATE acik';
  END IF;
  RAISE NOTICE 'OK 0.1: 26 uygulanmis; async yazma politikalari kaldirilmis, yalniz RPC';
END $$;

SELECT to_regprocedure('public.can_view_room_round(uuid,smallint)') IS NOT NULL AS t17_hardened \gset
\if :t17_hardened
ROLLBACK;
\quit
\endif

-- =============================================================================
-- 1) Policy varligi
-- =============================================================================
DO $$
DECLARE
  v_policy_def TEXT;
BEGIN
  SELECT pg_get_expr(polqual, polrelid)
         || ' WITH CHECK ' || pg_get_expr(polwithcheck, polrelid)
  INTO v_policy_def
  FROM pg_policy
  WHERE polrelid = 'public.room_answers'::regclass
    AND polname = 'room_answers_insert_self_active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSERT FAILED: room_answers_insert_self_active policy missing';
  END IF;
  RAISE NOTICE 'OK 1.1: room_answers_insert_self_active policy exists';
END $$;

-- =============================================================================
-- 2) Policy WITH CHECK clause async branch icermeli
-- =============================================================================
DO $$
DECLARE v_check_def TEXT;
BEGIN
  SELECT pg_get_expr(polwithcheck, polrelid) INTO v_check_def
  FROM pg_policy
  WHERE polrelid = 'public.room_answers'::regclass
    AND polname = 'room_answers_insert_self_active';

  IF v_check_def NOT LIKE '%mode%' OR v_check_def NOT LIKE '%async%' THEN
    RAISE EXCEPTION 'ASSERT FAILED: WITH CHECK lacks async branch (def: %)', v_check_def;
  END IF;
  IF v_check_def NOT LIKE '%sync%' THEN
    RAISE EXCEPTION 'ASSERT FAILED: WITH CHECK lacks sync branch (def: %)', v_check_def;
  END IF;
  RAISE NOTICE 'OK 2.1: WITH CHECK has both sync + async branches';
END $$;

-- =============================================================================
-- 3) room_members_update_self policy mevcut (regression check)
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.room_members'::regclass
      AND polname = 'room_members_update_self'
  ) THEN
    RAISE EXCEPTION 'ASSERT FAILED: room_members_update_self policy missing (regression)';
  END IF;
  RAISE NOTICE 'OK 3.1: room_members_update_self policy exists (async kolonlar UPDATE icin)';
END $$;

ROLLBACK;
