-- =============================================================================
-- Bilge Arena Oda Sistemi: bilge_arena_dev DB + role olusturma
-- =============================================================================
-- Hedef: Mevcut panola-postgres container'inda yeni bir DB + role seti.
--        Panola DB'sinden tamamen ayri (data isolation).
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U panola_admin -d postgres \
--     -v app_password="<APP_PWD>" -v auth_password="<AUTH_PWD>" \
--     -f /opt/bilge-arena/sql/0_init_db.sql
--
-- Plan referansi: docs/plans/2026-04-27-oda-sistemi-implementation.md Task 0.1
--
-- Plan-deviation:
--   - LC_COLLATE/LC_CTYPE 'tr_TR.UTF-8' KALDIRILDI: postgres:17-alpine
--     glibc-light, Turkish locale yok. Cluster default (genelde C.UTF-8 veya
--     en_US.UTF-8) kullanilir. Turkce collation query-level COLLATE ile
--     eklenebilir, design etkisi yok (UTF-8 storage zaten sagliyor).
--   - pg_cron extension KALDIRILDI: panola-postgres container'da
--     shared_preload_libraries bos + pg_cron pg_available_extensions'da yok.
--     Plan'daki cron isleri (auto_relay_tick, KVKK cleanup, questions-sync)
--     system cron + REST call ile yapilir. Sprint 0 Task 0.5'te zaten host
--     cron tanimli; design etkisi yok (cron tetigi sadece VPS host'unda
--     tasinir, mantik PL/pgSQL fonksiyonlarinda kalir).
--   - Connection user 'panola' DEGIL 'panola_admin': panola-postgres container
--     POSTGRES_USER=panola_admin (Docker postgres image konvansiyonu, env
--     ile belirlenen kullanici otomatik superuser).
--   - authenticated/anon/service_role rolleri panola-postgres cluster'da
--     Panola GoTrue'dan ZATEN var (paylasilan cluster-wide roller). CREATE
--     ROLE statements kaldirildi. Property'leri zaten uyumlu:
--       authenticated  NOLOGIN, no BYPASSRLS  ✓
--       anon           NOLOGIN, no BYPASSRLS  ✓
--       service_role   NOLOGIN, BYPASSRLS=t   ✓
--     Tradeoff: Bilge Arena + Panola 'authenticated' kimligini paylasir;
--     izolasyon DB ayrimiyla saglanir (RLS + GRANT ON bilge_arena_dev.<tablo>
--     TO authenticated sadece bu DB'deki tabloyu acar, Panola DB'yi acmaz).
-- =============================================================================

\set ON_ERROR_STOP on

-- 1) Roller (cluster-wide, postgres DB'sinde olusturulur)
-- Bilge-arena'ya ozgu yeni roller:
CREATE ROLE bilge_arena_app LOGIN PASSWORD :'app_password';
CREATE ROLE bilge_arena_authenticator LOGIN PASSWORD :'auth_password';

-- authenticated, anon, service_role: Panola GoTrue'dan zaten var, sadece grant.
GRANT authenticated, anon, service_role TO bilge_arena_authenticator;

-- 2) Yeni DB (cluster default locale, UTF8 encoding, temiz template0)
CREATE DATABASE bilge_arena_dev OWNER bilge_arena_app
  ENCODING 'UTF8'
  TEMPLATE template0;

-- 3) Yeni DB'ye baglan ve schema/extension setup
\c bilge_arena_dev

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS unaccent;
-- pg_cron: container'da yuklu degil, system cron + REST kullanilacak (bkz. header).

-- 4) auth schema (Supabase JWT aud=authenticated icin gerekli)
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$
    SELECT NULLIF(
      coalesce(
        current_setting('request.jwt.claim.sub', TRUE),
        current_setting('request.jwt.claims', TRUE)::jsonb->>'sub'
      ),
      ''
    )::uuid
  $$;

GRANT USAGE ON SCHEMA auth TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;

-- 5) public schema'da default privileges (gelecek migrasyon icin)
GRANT USAGE ON SCHEMA public TO authenticated, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO authenticated;
