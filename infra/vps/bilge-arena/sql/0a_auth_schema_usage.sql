-- =============================================================================
-- Bilge Arena Sprint 0 fix-up: bilge_arena_app + bilge_arena_authenticator
--                              -> auth schema USAGE
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
-- Plan-deviation #35 (Codex P1 PR #36 fix): Bu dosyanin ilk versiyonu
--   yanlislikla `authenticator` rolune (Panola PostgREST cluster-wide rolu)
--   GRANT veriyordu. 0_init_db.sql:44 bilge-arena icin AYRI bir rol kuruyor:
--   `bilge_arena_authenticator`, ve generate-postgrest-env.sh:47 PostgREST
--   bunu connection role olarak kullaniyor. Dogru hedef bu role. VPS'te
--   `authenticator` rolu Panola coexistence sebebiyle var oldugundan ilk
--   GRANT silently dogru rol yerine paylasilana gitti (fresh env'de fail
--   ederdi). Bu fix:
--     1) `authenticator` (yanlis hedef) USAGE'i temizler — defensive
--        IF EXISTS, fresh env'de (Panola yokken) atlanir.
--     2) `bilge_arena_authenticator` (dogru hedef) USAGE verir.
--
-- Calistirma (panola_admin, superuser olmasi gerekli — auth schema owner'i):
--   docker exec -i panola-postgres psql -U panola_admin -h localhost \
--     -d bilge_arena_dev -v ON_ERROR_STOP=on \
--     -f - < infra/vps/bilge-arena/sql/0a_auth_schema_usage.sql
--
-- Sira: 0_init_db.sql, 1_realtime_schemas.sql sonrasinda; 2_rooms.sql'den ONCE.
-- Production runtime etkisi sifir: PostgREST SET LOCAL ROLE ile JWT-claimed
-- authenticated/anon'a switch eder, bu rollerin auth schema USAGE'i 0_init_db.sql
-- ile zaten verilmis. Bu fix migration apply ve future-proofing icin.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- 1) bilge_arena_app: migration apply icin (SECURITY DEFINER fonksiyonlar
--    auth.uid() reference'ini compile ederken cozebilsin diye)
GRANT USAGE ON SCHEMA auth TO bilge_arena_app;

-- 2) bilge_arena_authenticator: PostgREST connection role (0_init_db.sql:44).
--    JWT validation/claim parsing PostgREST tarafinda; SET LOCAL ROLE oncesi
--    auth schema reference'i gerekirse diye defensive grant.
GRANT USAGE ON SCHEMA auth TO bilge_arena_authenticator;

-- 3) Cleanup: ilk versiyonun hatali GRANT'i (authenticator = Panola PostgREST
--    rolu, bilge-arena DB'sinde yanlis hedef). REVOKE rolu yoksa
--    "role does not exist" verir, bu sebeple existence guard.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    REVOKE USAGE ON SCHEMA auth FROM authenticator;
    RAISE NOTICE 'OK: stale authenticator grant cleaned up (was applied by 0a_ v1)';
  ELSE
    RAISE NOTICE 'OK: authenticator role mevcut degil, cleanup atlandi (fresh env)';
  END IF;
END $$;

-- 4) Verification (transaction icinde, ROLLBACK olursa state degismez)
DO $$
BEGIN
  IF NOT has_schema_privilege('bilge_arena_app','auth','USAGE') THEN
    RAISE EXCEPTION 'ASSERT FAILED: bilge_arena_app auth USAGE grant verilmedi';
  END IF;
  IF NOT has_schema_privilege('bilge_arena_authenticator','auth','USAGE') THEN
    RAISE EXCEPTION 'ASSERT FAILED: bilge_arena_authenticator auth USAGE grant verilmedi';
  END IF;
  -- Negative assert: authenticator rolune (Panola) bilge_arena_dev.auth.USAGE
  -- KALMADI. Fresh env'de role yok, true; existing env'de cleanup sonrasi false.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator')
     AND has_schema_privilege('authenticator','auth','USAGE') THEN
    RAISE EXCEPTION 'ASSERT FAILED: authenticator hala auth USAGE sahibi (cleanup calismadi)';
  END IF;
  RAISE NOTICE 'OK: bilge_arena_app + bilge_arena_authenticator -> auth schema USAGE granted';
END $$;

COMMIT;
