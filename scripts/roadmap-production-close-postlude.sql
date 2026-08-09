DO $roadmap_postflight$
DECLARE
  v_present integer;
  v_invalid integer;
  v_candidates integer;
  v_constraint_validated boolean;
BEGIN
  SELECT count(*)::integer
  INTO v_present
  FROM (VALUES
    (to_regclass('public.verified_attempts') IS NOT NULL),
    (EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'complete_verified_game_session'
    )),
    (to_regclass('public.reward_ledger') IS NOT NULL),
    (to_regclass('public.review_cards') IS NOT NULL),
    (to_regclass('public.daily_plan_items') IS NOT NULL),
    (to_regclass('public.curriculum_nodes') IS NOT NULL),
    (to_regclass('public.mastery_outcome_evidence') IS NOT NULL),
    (to_regclass('public.adaptive_diagnostic_sessions') IS NOT NULL),
    (to_regclass('public.verified_coach_sessions') IS NOT NULL),
    (to_regclass('public.verified_exam_attempts') IS NOT NULL),
    (to_regclass('public.weekly_learning_league_preferences') IS NOT NULL),
    (EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'get_my_weekly_learning_spotlights'
    )),
    (EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'get_my_weekly_team_boss'
    )),
    (to_regclass('public.paper_study_packs') IS NOT NULL),
    (to_regclass('public.teacher_classrooms') IS NOT NULL),
    (
      to_regclass('public.question_content_revisions') IS NOT NULL
      AND to_regclass('public.verified_attempt_question_revisions') IS NOT NULL
    ),
    (EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.questions'::regclass
        AND conname = 'questions_ai_gemini_tyt_exam_ref_check'
    ))
  ) AS fingerprints(present)
  WHERE present;

  SELECT
    count(*) FILTER (WHERE invalid)::integer,
    count(*) FILTER (WHERE legacy_repair_candidate)::integer
  INTO v_invalid, v_candidates
  FROM pg_temp.roadmap_close_question_integrity;

  SELECT c.convalidated
  INTO v_constraint_validated
  FROM pg_constraint c
  WHERE c.conrelid = 'public.questions'::regclass
    AND c.conname = 'questions_ai_gemini_tyt_exam_ref_check';

  IF v_present <> 17 THEN
    RAISE EXCEPTION
      'roadmap postflight expected 17 present fingerprints, found %',
      v_present
      USING ERRCODE = '55000';
  END IF;

  IF v_invalid <> 0 OR v_candidates <> 0 THEN
    RAISE EXCEPTION
      'roadmap postflight expected invalid=0 and candidates=0, found invalid=% candidates=%',
      v_invalid, v_candidates
      USING ERRCODE = '22023';
  END IF;

  IF v_constraint_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'roadmap postflight expected the TYT source constraint to be validated'
      USING ERRCODE = '55000';
  END IF;
END;
$roadmap_postflight$;

DROP VIEW pg_temp.roadmap_close_question_integrity;
