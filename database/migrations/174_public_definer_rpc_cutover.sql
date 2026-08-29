-- Migration 174: complete the server-owned public RPC cutover after deploy.
-- Direct anonymous PostgREST execution adds bypass surface without a product
-- requirement. Authenticated search_questions remains intentional: admin_view
-- binds the caller JWT to AAL2 + admin permission in migration 165.

BEGIN;

REVOKE ALL ON FUNCTION public.get_public_profile(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_profile(text)
  TO service_role;

REVOKE ALL ON FUNCTION public.search_questions(text,text,text,integer,boolean,boolean,integer,integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_questions(text,text,text,integer,boolean,boolean,integer,integer)
  TO authenticated, service_role;

DO $verify$
BEGIN
  IF has_function_privilege('anon','public.get_public_profile(text)','EXECUTE')
    OR has_function_privilege('authenticated','public.get_public_profile(text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.get_public_profile(text)','EXECUTE') THEN
    RAISE EXCEPTION '174 verification: get_public_profile grants invalid';
  END IF;

  IF has_function_privilege('anon',
       'public.search_questions(text,text,text,integer,boolean,boolean,integer,integer)','EXECUTE')
    OR NOT has_function_privilege('authenticated',
       'public.search_questions(text,text,text,integer,boolean,boolean,integer,integer)','EXECUTE')
    OR NOT has_function_privilege('service_role',
       'public.search_questions(text,text,text,integer,boolean,boolean,integer,integer)','EXECUTE') THEN
    RAISE EXCEPTION '174 verification: search_questions grants invalid';
  END IF;
END
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';
