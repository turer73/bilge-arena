-- =============================================================================
-- Bilge Arena Sprint 0 fix-up: bilge_arena_app + authenticator -> auth schema USAGE
-- =============================================================================
-- Hedef: SECURITY DEFINER helper'larin (is_room_member, is_room_host)
--        auth.uid() referansini cozulebilir kilmak. PostgreSQL LANGUAGE sql
--        fonksiyonlarini CREATE zamaninda valide eder; bilge_arena_app rolu
--        auth schema'ya USAGE'a sahip degilse 3_rooms_rls.sql apply
--        "permission denied for schema auth" ile abort eder.
--
-- Plan referansi: docs/plans/2026-04-27-oda-sistemi-implementation.md
--                 Sprint 1 PR1 Task 1.4 (post-deploy fix)
--
-- Plan-deviation #34 (Task 1.4 deploy gap): 0_init_db.sql + 1_realtime_schemas.sql
--   sadece public + realtime schema icin USAGE veriyordu. auth schema GoTrue
--   tarafindan otomatik olusturuluyor (panola_admin owner) ve bilge_arena_app'e
--   default olarak USAGE verilmiyor. Bu dosya Sprint 0 setup'ta atlanan grant'i
--   ekler. Idempotent: PostgreSQL GRANT semantik olarak no-op'tur eger zaten
--   verilmisse.
--
-- Calistirma (panola_admin, superuser olmasi gerekli — auth schema owner'i):
--   docker exec -i panola-postgres psql -U panola_admin -h localhost \
--     -d bilge_arena_dev -v ON_ERROR_STOP=on \
--     -f - < infra/vps/bilge-arena/sql/0a_auth_schema_usage.sql
--
-- Sira: 0_init_db.sql, 1_realtime_schemas.sql sonrasinda; 2_rooms.sql'den ONCE.
-- Production'da bilge_arena_app login kapali oldugu icin (PostgREST
-- authenticator uzerinden), bu grant calistirma anindaki migration role'una
-- yonelik — runtime'da JWT-claimed role (authenticated/anon) zaten USAGE'a
-- sahip oldugu icin app traffic etkilenmiyor.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- bilge_arena_app: migration apply icin (SECURITY DEFINER fonksiyonlar
-- auth.uid() reference'ini compile ederken cozebilsin diye)
GRANT USAGE ON SCHEMA auth TO bilge_arena_app;

-- authenticator: PostgREST connection role; JWT olmadan da bazi sistem
-- query'lerinde auth schema reference'ina ihtiyac duyabilir
GRANT USAGE ON SCHEMA auth TO authenticator;

-- Verification (transaction icinde, ROLLBACK olursa state degismez)
DO $$
BEGIN
  IF NOT has_schema_privilege('bilge_arena_app','auth','USAGE') THEN
    RAISE EXCEPTION 'ASSERT FAILED: bilge_arena_app auth USAGE grant verilmedi';
  END IF;
  IF NOT has_schema_privilege('authenticator','auth','USAGE') THEN
    RAISE EXCEPTION 'ASSERT FAILED: authenticator auth USAGE grant verilmedi';
  END IF;
  RAISE NOTICE 'OK: bilge_arena_app + authenticator -> auth schema USAGE granted';
END $$;

COMMIT;
