-- The Supabase database migrations endpoint owns the outer transaction and
-- records this bundle in supabase_migrations.schema_migrations.
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '12min';
SET LOCAL idle_in_transaction_session_timeout = '15min';

SELECT pg_advisory_xact_lock(hashtextextended('bilge-arena-roadmap-close-091-107', 0));

-- Keep the question corpus stable while the canonical legacy repair and
-- question-governance migration are installed.
LOCK TABLE public.questions IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP VIEW roadmap_close_question_integrity AS
WITH normalized AS (
  SELECT
    q.id,
    q.game,
    q.category,
    q.source,
    q.exam_ref,
    q.is_active,
    q.content,
    jsonb_typeof(q.content->'options') AS options_type,
    CASE
      WHEN jsonb_typeof(q.content->'options') = 'array'
      THEN jsonb_array_length(q.content->'options')
    END AS option_count,
    jsonb_typeof(q.content->'answer') AS answer_type,
    CASE
      WHEN jsonb_typeof(q.content->'answer') = 'number'
       AND (q.content->>'answer') ~ '^[0-9]+$'
      THEN (q.content->>'answer')::integer
    END AS answer_index
  FROM public.questions q
)
SELECT
  n.*,
  (
    n.options_type IS DISTINCT FROM 'array'
    OR n.option_count NOT BETWEEN 2 AND 5
    OR n.answer_type IS DISTINCT FROM 'number'
    OR n.answer_index IS NULL
    OR n.answer_index NOT BETWEEN 0 AND 4
    OR n.answer_index >= n.option_count
  ) AS invalid,
  (
    n.game = 'wordquest'
    AND n.category = 'vocabulary'
    AND n.source = 'original'
    AND n.is_active = true
    AND (
      n.content->'answer' IS NULL
      OR n.content->'answer' = 'null'::jsonb
    )
    AND (
      n.content->'question' IS NULL
      OR n.content->'question' = 'null'::jsonb
    )
    AND jsonb_typeof(n.content->'options') = 'array'
    AND jsonb_array_length(n.content->'options') = 5
    AND jsonb_typeof(n.content->'correct') = 'number'
    AND (n.content->>'correct') ~ '^[0-9]+$'
    AND (n.content->>'correct')::integer BETWEEN 0
        AND jsonb_array_length(n.content->'options') - 1
    AND NULLIF(btrim(n.content->>'sentence'), '') IS NOT NULL
  ) AS legacy_repair_candidate
FROM normalized n;

DO $roadmap_preflight$
DECLARE
  v_present integer;
  v_invalid integer;
  v_candidates integer;
  v_gemini_total integer;
  v_gemini_tyt integer;
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

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE exam_ref = 'TYT')::integer
  INTO v_gemini_total, v_gemini_tyt
  FROM public.questions
  WHERE source = 'ai_gemini_tyt';

  IF v_present <> 0 THEN
    RAISE EXCEPTION
      'roadmap preflight expected 0 present fingerprints, found %',
      v_present
      USING ERRCODE = '55000';
  END IF;

  IF v_invalid <> 22 OR v_candidates <> 22 THEN
    RAISE EXCEPTION
      'roadmap preflight expected invalid=22 and candidates=22, found invalid=% candidates=%',
      v_invalid, v_candidates
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.roadmap_close_question_integrity
    WHERE invalid
      AND NOT legacy_repair_candidate
  ) THEN
    RAISE EXCEPTION
      'roadmap preflight found an invalid question outside the approved repair set'
      USING ERRCODE = '22023';
  END IF;

  IF v_gemini_total <> 296 OR v_gemini_tyt <> 296 THEN
    RAISE EXCEPTION
      'roadmap preflight expected 296/296 ai_gemini_tyt rows scoped to TYT, found %/%',
      v_gemini_tyt, v_gemini_total
      USING ERRCODE = '22023';
  END IF;
END;
$roadmap_preflight$;

DO $roadmap_repair$
DECLARE
  v_repaired integer;
BEGIN
  WITH repaired AS (
    UPDATE public.questions q
    SET content = q.content || jsonb_build_object(
      'question', q.content->>'sentence',
      'answer', (q.content->>'correct')::integer
    )
    FROM pg_temp.roadmap_close_question_integrity i
    WHERE q.id = i.id
      AND i.legacy_repair_candidate
    RETURNING q.id
  )
  SELECT count(*)::integer
  INTO v_repaired
  FROM repaired;

  IF v_repaired <> 22 THEN
    RAISE EXCEPTION
      'roadmap repair expected 22 rows, updated %',
      v_repaired
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.roadmap_close_question_integrity
    WHERE invalid OR legacy_repair_candidate
  ) THEN
    RAISE EXCEPTION
      'roadmap repair did not produce a canonical question corpus'
      USING ERRCODE = '22023';
  END IF;
END;
$roadmap_repair$;
