-- =============================================================================
-- Bilge Arena Oda Sistemi: Realtime tenant schemas + grants
-- =============================================================================
-- Hedef: bilge_arena_dev DB icinde supabase/realtime icin _realtime ve
--        realtime schemalari + bilge_arena_authenticator GRANT'leri.
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U panola_admin -d bilge_arena_dev \
--     -f /opt/bilge-arena/sql/1_realtime_schemas.sql
--
-- Plan referansi: docs/plans/2026-04-27-oda-sistemi-implementation.md Task 0.3
--
-- Plan-deviations:
--   #12 wal_level=logical degistirilmedi (cluster-wide restart koordinasyonu
--       gerekli). Bu nedenle postgres_changes ozelligi Sprint 1+'a ertelendi.
--       CREATE PUBLICATION supabase_realtime ifadesi de bu nedenle
--       kaldirildi (logical decoding olmadan publication anlamsiz).
--   #13 API_JWT_SECRET = bilge-arena-internal HS256 (Realtime JWKS yok).
--       Channel-auth yolu: client login -> Next.js /api/realtime/token
--       endpoint -> HS256 imzali kisa-omurlu JWT -> Realtime channels.
--   #14 GRANT setinde service_role'e USAGE/ALL verildi (Realtime
--       SEED_SELF_HOST=true aciliyorsa _realtime.tenants tablosunu service_role
--       yetkisi ile tohumluyor).
-- =============================================================================

\set ON_ERROR_STOP on

-- 1) Schemalar (idempotent)
CREATE SCHEMA IF NOT EXISTS _realtime;
CREATE SCHEMA IF NOT EXISTS realtime;

-- 2) GRANTS - bilge_arena_authenticator
-- Realtime container DB_USER=bilge_arena_authenticator ile baglanir,
-- DB_AFTER_CONNECT_QUERY=SET search_path TO _realtime ayarlar.
-- Schemalar uzerinde tam yetki: tablo/seq/fonksiyon olusturabilmeli (migrasyon).
GRANT USAGE, CREATE ON SCHEMA _realtime TO bilge_arena_authenticator;
GRANT USAGE, CREATE ON SCHEMA realtime TO bilge_arena_authenticator;

-- Mevcut nesneler uzerinde (varsa) tam yetki
GRANT ALL ON ALL TABLES IN SCHEMA _realtime TO bilge_arena_authenticator;
GRANT ALL ON ALL SEQUENCES IN SCHEMA _realtime TO bilge_arena_authenticator;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA _realtime TO bilge_arena_authenticator;
GRANT ALL ON ALL TABLES IN SCHEMA realtime TO bilge_arena_authenticator;
GRANT ALL ON ALL SEQUENCES IN SCHEMA realtime TO bilge_arena_authenticator;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA realtime TO bilge_arena_authenticator;

-- Default privileges - bundan sonra olusturulan nesnelere de yetki
ALTER DEFAULT PRIVILEGES IN SCHEMA _realtime
  GRANT ALL ON TABLES TO bilge_arena_authenticator;
ALTER DEFAULT PRIVILEGES IN SCHEMA _realtime
  GRANT ALL ON SEQUENCES TO bilge_arena_authenticator;
ALTER DEFAULT PRIVILEGES IN SCHEMA _realtime
  GRANT ALL ON FUNCTIONS TO bilge_arena_authenticator;
ALTER DEFAULT PRIVILEGES IN SCHEMA realtime
  GRANT ALL ON TABLES TO bilge_arena_authenticator;
ALTER DEFAULT PRIVILEGES IN SCHEMA realtime
  GRANT ALL ON SEQUENCES TO bilge_arena_authenticator;
ALTER DEFAULT PRIVILEGES IN SCHEMA realtime
  GRANT ALL ON FUNCTIONS TO bilge_arena_authenticator;

-- 3) authenticated/anon/service_role grants (Sprint 1 RLS hazirligi)
GRANT USAGE ON SCHEMA realtime TO authenticated, anon, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA realtime
  GRANT SELECT ON TABLES TO authenticated, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA realtime
  GRANT ALL ON TABLES TO service_role;

-- 4) Plan-deviation #12 dokumantasyonu (sql comment olarak schema'ya yazi)
COMMENT ON SCHEMA _realtime IS 'Supabase Realtime tenant config schema. SEED_SELF_HOST=true Realtime container ilk acilista tenant kaydini buraya tohumlar. Plan-deviation #12: postgres_changes ozelligi henuz aktif degil (wal_level=replica).';
COMMENT ON SCHEMA realtime IS 'Supabase Realtime broadcast/presence schema. Sprint 0: Broadcast + Presence channels aktif. postgres_changes Sprint 1+''e ertelendi (wal_level=logical bekleniyor).';
