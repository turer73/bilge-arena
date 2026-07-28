-- Migration 090: Sensitive SECURITY DEFINER execute-grant hardening
--
-- Live production audit (2026-07-28) found that every public table has RLS
-- enabled, but several legacy SECURITY DEFINER functions still had broader
-- EXECUTE grants than their current call graph requires:
--
--   * increment_question_stats / batch_increment_question_stats can mutate
--     global question counters. Since migration 081, the only supported write
--     path is service-role-only complete_game_session().
--   * update_streak can mutate an arbitrary profile and is only called from the
--     update_weekly_leaderboard trigger chain.
--   * trigger-only functions cannot be called meaningfully through PostgREST,
--     so PUBLIC/anon/authenticated EXECUTE grants are unnecessary.
--   * search_profiles_admin performs its own permission check, but a live ACL
--     drift had re-added anon EXECUTE. Keep only the roles the application uses.
--
-- The production-only question-stat repair backup table is also denied to
-- client roles when it exists. RLS already blocks it (zero policies); removing
-- table grants makes that invariant explicit and survives future policy drift.

BEGIN;

-- Counter mutators: only the trusted server-side completion RPC may reach them.
REVOKE ALL ON FUNCTION public.increment_question_stats(uuid, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_question_stats(uuid, integer, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.batch_increment_question_stats(uuid[], boolean[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.batch_increment_question_stats(uuid[], boolean[])
  TO service_role;

-- Called internally by the session-complete trigger chain; no client role needs
-- direct EXECUTE. The postgres owner retains its implicit privilege.
REVOKE ALL ON FUNCTION public.update_streak(uuid)
  FROM PUBLIC, anon, authenticated;

-- Trigger functions are invoked by PostgreSQL triggers, never as public RPCs.
REVOKE ALL ON FUNCTION public.update_question_stats()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_weekly_leaderboard()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.block_disposable_emails()
  FROM PUBLIC, anon, authenticated;

-- Admin RPC remains callable by authenticated users because its body enforces
-- admin.users.view. Remove the unexpected anonymous grant observed in prod.
REVOKE ALL ON FUNCTION public.search_profiles_admin(text, integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_profiles_admin(text, integer, integer)
  TO authenticated, service_role;

-- Operational repair artifact: not present in clean installs, so harden it only
-- when the production table exists.
DO $migration$
BEGIN
  IF to_regclass('public._backup_question_stats_20260712') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public._backup_question_stats_20260712 FROM PUBLIC, anon, authenticated';
  END IF;
END
$migration$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verification after apply:
--   SELECT p.proname, pg_get_function_identity_arguments(p.oid), p.proacl
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN (
--       'increment_question_stats', 'batch_increment_question_stats',
--       'update_streak', 'update_question_stats',
--       'update_weekly_leaderboard', 'block_disposable_emails',
--       'search_profiles_admin'
--     )
--   ORDER BY p.proname;
