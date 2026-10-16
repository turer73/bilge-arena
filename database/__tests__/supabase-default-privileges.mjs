// Supabase grants every new table, sequence and function in public to its API
// roles through default privileges (measured on production, see migration 060).
// The migrations' REVOKEs exist to undo exactly that. A plain PostgreSQL fixture
// has no such defaults, so a test asserting "authenticated cannot X" would still
// pass with the migration's REVOKE deleted (disc #2570).
//
// Run this after the fixture that stands in for earlier migrations and before
// the migrations under test, so only the objects they create get the defaults.
// It needs the anon, authenticated and service_role roles; dropping the public
// schema removes these entries again.
export const SUPABASE_DEFAULT_PRIVILEGES_SQL = `
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
`

// For a suite that keeps the public schema between runs (drops tables only):
// clear the defaults before rebuilding its fixture, so fixture objects are
// never created under them. A fresh cluster may not have the roles yet.
export const SUPABASE_DEFAULT_PRIVILEGES_RESET_SQL = `
  DO $reset$ BEGIN
    IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')) = 3 THEN
      ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;
    END IF;
  END $reset$;
`
