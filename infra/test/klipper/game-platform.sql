-- Compatibility catalog for the private vanilla-Postgres test stack only.
-- This does not install a Storage server or claim Storage/Realtime coverage.
DO $$ BEGIN
  IF current_database() <> 'academy_game_test' THEN
    RAISE EXCEPTION 'Only academy_game_test is allowed';
  END IF;
END $$;
ALTER SCHEMA public RENAME TO academy_fixture_v0;
REVOKE ALL ON SCHEMA academy_fixture_v0 FROM PUBLIC, anon, authenticated, service_role;
CREATE SCHEMA public AUTHORIZATION postgres;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER EXTENSION pgcrypto SET SCHEMA public;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO service_role;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin NOLOGIN;
  END IF;
END $$;
GRANT supabase_auth_admin TO auth_admin;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated, service_role;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY, name text NOT NULL, public boolean DEFAULT false,
  file_size_limit bigint, allowed_mime_types text[]
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id), name text
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA storage FROM PUBLIC, anon, authenticated, service_role;
CREATE SCHEMA academy_test;
REVOKE ALL ON SCHEMA academy_test FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE academy_test.migrations (
  name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz DEFAULT now()
);
