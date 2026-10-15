DO $$ BEGIN
  IF current_database() <> 'academy_game_test' THEN RAISE EXCEPTION 'Test only'; END IF;
END $$;
-- 046 replaces 044's five-argument function but its unqualified COMMENT is
-- ambiguous if the old overload remains. No existing test attempts use it.
DROP FUNCTION public.select_random_questions(text,integer,text,integer,uuid[]);
-- Supabase installs pgcrypto here; later repository migrations reference it.
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pgcrypto SET SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
