-- Migration 089: Fix auth.admin.createUser failures for long email local-parts.
--
-- The old trigger assigned the complete local-part to VARCHAR(32) before it
-- truncated it. PostgreSQL raised 22001 before LEFT() could run, which GoTrue
-- surfaced as unexpected_failure. Keep the existing auth.users trigger and
-- replace only its function body.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_email_local_part TEXT;
  v_username_base TEXT;
  v_username TEXT;
  v_display_name TEXT;
  v_attempt INTEGER;
BEGIN
  -- This assignment deliberately targets TEXT. Do not assign the raw email
  -- local-part to a VARCHAR(32) variable before shortening it.
  v_email_local_part := pg_catalog.lower(
    pg_catalog.split_part(COALESCE(NEW.email, ''), '@', 1)
  );
  v_username_base := pg_catalog.regexp_replace(
    v_email_local_part,
    '[^a-z0-9_]+',
    '_',
    'g'
  );
  v_username_base := COALESCE(NULLIF(v_username_base, ''), 'user');
  v_display_name := pg_catalog.left(
    COALESCE(
      NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
      NULLIF(NEW.raw_user_meta_data ->> 'name', ''),
      v_username_base
    ),
    64
  );

  -- Retry both username and referral-code unique collisions. The referral
  -- trigger runs for every INSERT attempt. Attempts 9-12 use a UUID-derived
  -- username fallback while still respecting the VARCHAR(32) limit.
  FOR v_attempt IN 1..12 LOOP
    IF v_attempt <= 8 THEN
      v_username := pg_catalog.left(v_username_base, 21)
        || '_'
        || pg_catalog.substr(
          pg_catalog.md5(pg_catalog.random()::TEXT || NEW.id::TEXT || v_attempt::TEXT),
          1,
          10
        );
    ELSE
      v_username := pg_catalog.left(
        pg_catalog.replace(NEW.id::TEXT, '-', ''),
        30
      ) || pg_catalog.lpad(v_attempt::TEXT, 2, '0');
    END IF;

    BEGIN
      INSERT INTO public.profiles (id, username, display_name, avatar_url)
      VALUES (
        NEW.id,
        v_username,
        v_display_name,
        COALESCE(
          NULLIF(NEW.raw_user_meta_data ->> 'avatar_url', ''),
          NULLIF(NEW.raw_user_meta_data ->> 'picture', '')
        )
      );
      RETURN NEW;
    EXCEPTION WHEN unique_violation THEN
      -- A collision can be username or the referral trigger's referral_code.
      -- The exception subtransaction also rolls back that trigger attempt.
      IF v_attempt = 12 THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  RAISE EXCEPTION 'Could not create profile for auth user %', NEW.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

COMMIT;
