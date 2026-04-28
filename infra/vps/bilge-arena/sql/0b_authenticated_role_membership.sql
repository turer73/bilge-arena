-- =============================================================================
-- Bilge Arena Sprint 0 fix-up #2: bilge_arena_app -> authenticated + BYPASSRLS
-- =============================================================================
-- Hedef: SECURITY DEFINER fonksiyonlari (start_room, join_room, leave_room,
--        kick_member, cancel_room ve gelecek PR2b/PR3 fonksiyonlari) FORCE RLS
--        aktif tablolardan (rooms, room_rounds, room_answers, room_reactions,
--        room_audit_log) okuyabilsin.
--
-- Plan referansi: docs/plans/2026-04-27-oda-sistemi-implementation.md
--                 Sprint 1 PR2a (Task 2.1 implementation gap)
--
-- Plan-deviation #40 (PR2a apply gap): SECURITY DEFINER function'lar
--   current_user'i function OWNER'a (bilge_arena_app) cevirir. RLS policy'leri
--   `TO authenticated` only -- pg_auth_members uzerinden membership check
--   yapilir. bilge_arena_app authenticated rolune uye olmadigindan policy
--   uygulanmiyor; FORCE RLS aciksa OWNER auto-bypass devre disi -> deny.
--
--   Sprint 0 0_init_db.sql:47 sadece bilge_arena_authenticator'a
--   authenticated/anon/service_role veriyor. bilge_arena_app icin gerekli
--   uyelik atlanmis.
--
-- Cozum:
--   1) GRANT authenticated TO bilge_arena_app
--      - Privilege inheritance + RLS policy `TO authenticated` applicability
--   2) ALTER ROLE bilge_arena_app BYPASSRLS
--      - Function INSERT'leri room_rounds/room_audit_log gibi tablolara
--        (FORCE RLS aktif, INSERT policy'si `TO authenticated` icin YOK
--        - anti-cheat design intentional). BYPASSRLS attribute (1) GRANT ile
--        gecmez (role attribute, inheritance disi); ayrica ALTER ROLE gerekli
--      - service_role pattern'inin esi: NOLOGIN olmadigi icin login etkisi
--        yok ama RLS bypass capability paylasilir
--
-- Production runtime etkisi: SIFIR.
--   - PostgREST connection role = bilge_arena_authenticator (login)
--   - bilge_arena_app login uzerinden production traffic YOK (sadece SECURITY
--     DEFINER function execution context)
--   - Authenticated grant'i sadece RLS policy applicability'sini cozer
--
-- Calistirma (panola_admin gerekli, authenticated rolun owner'i):
--   docker exec -i panola-postgres psql -U panola_admin -h localhost \
--     -d bilge_arena_dev -v ON_ERROR_STOP=on \
--     -f - < infra/vps/bilge-arena/sql/0b_authenticated_role_membership.sql
--
-- Sira: 0_init_db.sql, 1_realtime_schemas.sql, 0a_auth_schema_usage.sql
--       sonrasinda; 2_rooms.sql'den ONCE (veya hemen sonrasinda da OK).
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- 1) bilge_arena_app -> authenticated role membership (idempotent)
GRANT authenticated TO bilge_arena_app;

-- 2) BYPASSRLS attribute (ALTER ROLE outside transaction'a bagli degil ama
--    BEGIN/COMMIT icinde de gecerli). Idempotent (mevcut state ayni ise no-op).
ALTER ROLE bilge_arena_app BYPASSRLS;

-- Verification: hem membership hem BYPASSRLS aktif mi?
DO $$
DECLARE v_is_member BOOLEAN; v_bypass BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_auth_members am
    JOIN pg_roles r1 ON am.member = r1.oid
    JOIN pg_roles r2 ON am.roleid = r2.oid
    WHERE r1.rolname = 'bilge_arena_app'
      AND r2.rolname = 'authenticated'
  ) INTO v_is_member;

  SELECT rolbypassrls INTO v_bypass
    FROM pg_roles WHERE rolname = 'bilge_arena_app';

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'ASSERT FAILED: bilge_arena_app authenticated rolune uye degil';
  END IF;
  IF NOT v_bypass THEN
    RAISE EXCEPTION 'ASSERT FAILED: bilge_arena_app BYPASSRLS attribute set degil';
  END IF;
  RAISE NOTICE 'OK: bilge_arena_app authenticated member + BYPASSRLS aktif';
END $$;

COMMIT;
