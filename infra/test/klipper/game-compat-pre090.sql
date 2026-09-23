DO $$ BEGIN
  IF current_database() <> 'academy_game_test' THEN RAISE EXCEPTION 'Test only'; END IF;
END $$;
-- 048 uses singular; 090 expects production's plural name. Renaming keeps
-- the actual trigger function and its OID/dependencies, not a dummy stub.
ALTER FUNCTION public.block_disposable_email() RENAME TO block_disposable_emails;
