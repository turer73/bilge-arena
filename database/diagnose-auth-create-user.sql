-- Safe production diagnostic for GoTrue "Database error creating new user".
--
-- This creates only session-local objects. The auth.users INSERT runs inside a
-- PL/pgSQL exception subtransaction and is always rolled back, including when
-- every trigger succeeds. The final SELECT returns the original SQLSTATE,
-- detail, hint and PL/pgSQL context without leaving an auth/profile row.

CREATE TEMP TABLE IF NOT EXISTS _auth_create_diag_bootstrap (id integer) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.diagnose_auth_create_user()
RETURNS TABLE (
  sqlstate text,
  message text,
  detail text,
  hint text,
  context text
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid := pg_catalog.gen_random_uuid();
  v_state text;
  v_message text;
  v_detail text;
  v_hint text;
  v_context text;
BEGIN
  BEGIN
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data
    ) VALUES (
      v_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'auth-create-diagnostic+' || v_id::text || '@example.com',
      'DIAGNOSTIC_NO_LOGIN',
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"diagnostic":true}'::jsonb
    );

    -- Deliberately force the successful path to roll back too.
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DIAGNOSTIC_INSERT_SUCCEEDED_AND_WAS_ROLLED_BACK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_state = RETURNED_SQLSTATE,
      v_message = MESSAGE_TEXT,
      v_detail = PG_EXCEPTION_DETAIL,
      v_hint = PG_EXCEPTION_HINT,
      v_context = PG_EXCEPTION_CONTEXT;
  END;

  RETURN QUERY SELECT v_state, v_message, v_detail, v_hint, v_context;
END;
$$;

SELECT * FROM pg_temp.diagnose_auth_create_user();
