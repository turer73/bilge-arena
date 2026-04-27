-- =============================================================================
-- Bilge Arena Oda Sistemi: 3_rooms_rls migration test (TDD)
-- =============================================================================
-- Hedef: 3_rooms_rls.sql migration'inin sonucunda var olmasi gereken tum
--        artifact'leri (FORCE RLS, policy isimleri, policy operation
--        coverage) dogrula.
--
-- Plan referansi: docs/plans/2026-04-27-oda-sistemi-implementation.md
--                 Sprint 1 PR1 Task 1.2
--
-- Plan-deviations:
--   #22 pgTAP yok -> plain SQL DO + RAISE EXCEPTION (Task 1.1 ile ayni).
--
-- Kullanim:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/3_rooms_rls_test.sql
--
-- Beklenen RED state (3_rooms_rls.sql apply edilmeden once):
--   ASSERT FAILED: rooms FORCE RLS not enabled -> ilk DO block'ta abort
-- Beklenen GREEN state (3_rooms_rls.sql apply sonrasi):
--   Tum NOTICE 'OK: ...' satirlari, exit 0
-- =============================================================================

BEGIN;

-- 1) FORCE RLS aktif (6 oda tablosunda)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'rooms', 'room_members', 'room_rounds',
    'room_answers', 'room_reactions', 'room_audit_log'
  ])
  LOOP
    IF NOT (SELECT relforcerowsecurity FROM pg_class
            WHERE oid = ('public.' || tbl)::regclass) THEN
      RAISE EXCEPTION 'ASSERT FAILED: FORCE RLS not enabled on public.% (owner bypass risk)', tbl;
    END IF;
    RAISE NOTICE 'OK: FORCE RLS enabled on public.%', tbl;
  END LOOP;
END $$;

-- 2) Policy varligi (her oda tablosunda en az 1 SELECT policy)
DO $$
DECLARE
  tbl TEXT;
  pol_count INT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'rooms', 'room_members', 'room_rounds',
    'room_answers', 'room_reactions'
  ])
  LOOP
    SELECT count(*) INTO pol_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = tbl
      AND cmd IN ('SELECT', 'ALL');
    IF pol_count = 0 THEN
      RAISE EXCEPTION 'ASSERT FAILED: no SELECT policy on public.%', tbl;
    END IF;
    RAISE NOTICE 'OK: public.% has % SELECT policy', tbl, pol_count;
  END LOOP;
END $$;

-- 3) Toplam policy sayisi >=12 (6 tablo, ortalama 2 policy/tablo)
DO $$
DECLARE
  total_policies INT;
BEGIN
  SELECT count(*) INTO total_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'rooms', 'room_members', 'room_rounds',
      'room_answers', 'room_reactions', 'room_audit_log'
    );
  IF total_policies < 12 THEN
    RAISE EXCEPTION 'ASSERT FAILED: only % policies on oda tables, expected >=12', total_policies;
  END IF;
  RAISE NOTICE 'OK: % total policies on oda tables', total_policies;
END $$;

-- 4) Critical anti-cheat policy: room_answers SELECT predicate icinde
-- "revealed_at" olmali (reveal sonrasi tum members goruyor pattern)
DO $$
DECLARE
  qual_text TEXT;
BEGIN
  SELECT qual INTO qual_text
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'room_answers'
    AND cmd = 'SELECT'
  LIMIT 1;
  IF qual_text IS NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED: room_answers SELECT policy not found';
  END IF;
  IF qual_text NOT LIKE '%revealed_at%' THEN
    RAISE EXCEPTION 'ASSERT FAILED: room_answers SELECT policy missing revealed_at gate (anti-cheat broken). qual: %', qual_text;
  END IF;
  RAISE NOTICE 'OK: room_answers SELECT policy contains revealed_at anti-cheat gate';
END $$;

-- 5) INSERT policies user_id = auth.uid() pattern'i (kullanici kendi adina
-- yazabilir, baskasi adina yazamaz)
DO $$
DECLARE
  tbl TEXT;
  has_insert_policy BOOLEAN;
  with_check_text TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'room_members', 'room_answers', 'room_reactions'
  ])
  LOOP
    SELECT count(*) > 0, MAX(with_check) INTO has_insert_policy, with_check_text
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = tbl
      AND cmd IN ('INSERT', 'ALL');
    IF NOT has_insert_policy THEN
      RAISE EXCEPTION 'ASSERT FAILED: no INSERT policy on public.%', tbl;
    END IF;
    IF with_check_text IS NULL OR with_check_text NOT LIKE '%auth.uid()%' THEN
      RAISE EXCEPTION 'ASSERT FAILED: public.% INSERT policy WITH CHECK missing auth.uid() (impersonation risk). with_check: %', tbl, with_check_text;
    END IF;
    RAISE NOTICE 'OK: public.% INSERT policy uses auth.uid() in WITH CHECK', tbl;
  END LOOP;
END $$;

-- 6) Audit log: authenticated/anon SELECT yapamamali (sadece service_role
-- BYPASSRLS ile gorur). authenticated SELECT policy'si varsa abort.
DO $$
DECLARE
  authenticated_select_policy_count INT;
BEGIN
  SELECT count(*) INTO authenticated_select_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'room_audit_log'
    AND cmd IN ('SELECT', 'ALL')
    AND ('authenticated' = ANY(roles) OR 'public' = ANY(roles));
  IF authenticated_select_policy_count > 0 THEN
    RAISE EXCEPTION 'ASSERT FAILED: room_audit_log has authenticated/public SELECT policy (KVKK leak)';
  END IF;
  RAISE NOTICE 'OK: room_audit_log has no authenticated/public SELECT policy (service_role only)';
END $$;

ROLLBACK;
