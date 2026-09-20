DO $$ BEGIN
  IF current_database() <> 'academy_game_test' THEN RAISE EXCEPTION 'Test only'; END IF;
END $$;
-- GoTrue's user scanner requires empty strings rather than NULL for legacy
-- token columns on SQL-seeded service identities. No credential is assigned.
UPDATE auth.users SET confirmation_token='', recovery_token='',
  email_change_token_new='', email_change_token_current='', email_change='',
  reauthentication_token='', encrypted_password=''
WHERE id='aca00000-0000-4000-8000-000000000148';
