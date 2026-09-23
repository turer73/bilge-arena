DO $$ BEGIN
  IF current_database() <> 'academy_game_test' THEN RAISE EXCEPTION 'Test only'; END IF;
END $$;
UPDATE public.profiles p SET
  exam_type = old.exam_type, grade = old.grade,
  onboarding_completed = old.onboarding_completed,
  preferred_theme = old.preferred_theme,
  is_discoverable = old.is_discoverable, profile_visibility = old.profile_visibility,
  leaderboard_opt_in = old.leaderboard_opt_in
FROM academy_fixture_v0.profiles old WHERE p.id=old.id;
-- This fixture verifies gameplay, not curriculum coverage or pilot readiness.
UPDATE public.curriculum_scope_releases SET release_status='draft', diagnostic_enabled=false;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.questions WHERE source='isolated-test' AND is_active) <> 1600 THEN
    RAISE EXCEPTION 'Expected 1600 active synthetic gameplay questions';
  END IF;
  IF EXISTS (SELECT 1 FROM public.questions WHERE source='isolated-test' AND published_revision_id IS NULL) THEN
    RAISE EXCEPTION 'Missing real immutable published revisions';
  END IF;
  IF has_table_privilege('authenticated','public.questions','UPDATE')
     OR has_table_privilege('anon','public.questions','SELECT')
     OR has_table_privilege('authenticated','public.profiles','SELECT')
     OR has_function_privilege('authenticated','public.issue_verified_attempt(uuid,text,text,uuid[],integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Gameplay access boundary is unsafe';
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
