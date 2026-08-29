-- Migration 173: prepare the server-owned SECURITY DEFINER RPC cutover.
--
-- Both public consumers are already server-rendered/server-routed:
--   * /api/questions applies validation, rate limits and public projection parsing.
--   * /u/[username] calls get_public_profile with the server-only client.
-- This compatibility migration runs before the application deploy. It adds the
-- server role grants without revoking existing callers, avoiding a release gap.
-- Migration 174 performs the revocation after the new application is healthy.

BEGIN;

ALTER FUNCTION public.get_public_profile(text)
  SET search_path = pg_catalog, public;

GRANT EXECUTE ON FUNCTION public.get_public_profile(text)
  TO service_role;

GRANT EXECUTE ON FUNCTION public.search_questions(text,text,text,integer,boolean,boolean,integer,integer)
  TO service_role;

DO $verify$
BEGIN
  IF NOT has_function_privilege('service_role','public.get_public_profile(text)','EXECUTE') THEN
    RAISE EXCEPTION '173 verification: get_public_profile service grant missing';
  END IF;

  IF NOT has_function_privilege('service_role',
       'public.search_questions(text,text,text,integer,boolean,boolean,integer,integer)','EXECUTE') THEN
    RAISE EXCEPTION '173 verification: search_questions service grant missing';
  END IF;
END
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';
