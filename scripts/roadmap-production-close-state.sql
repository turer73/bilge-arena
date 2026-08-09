WITH normalized AS (
  SELECT
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
),
question_stats AS (
  SELECT
    count(*)::integer AS total_questions,
    count(*) FILTER (
      WHERE options_type IS DISTINCT FROM 'array'
         OR option_count NOT BETWEEN 2 AND 5
         OR answer_type IS DISTINCT FROM 'number'
         OR answer_index IS NULL
         OR answer_index NOT BETWEEN 0 AND 4
         OR answer_index >= option_count
    )::integer AS invalid_total,
    count(*) FILTER (
      WHERE game = 'wordquest'
        AND category = 'vocabulary'
        AND source = 'original'
        AND is_active = true
        AND (
          content->'answer' IS NULL
          OR content->'answer' = 'null'::jsonb
        )
        AND (
          content->'question' IS NULL
          OR content->'question' = 'null'::jsonb
        )
        AND jsonb_typeof(content->'options') = 'array'
        AND jsonb_array_length(content->'options') = 5
        AND jsonb_typeof(content->'correct') = 'number'
        AND (content->>'correct') ~ '^[0-9]+$'
        AND (content->>'correct')::integer BETWEEN 0
            AND jsonb_array_length(content->'options') - 1
        AND NULLIF(btrim(content->>'sentence'), '') IS NOT NULL
    )::integer AS repair_candidates
  FROM normalized
),
gemini_stats AS (
  SELECT
    count(*)::integer AS gemini_total,
    count(*) FILTER (WHERE exam_ref = 'TYT')::integer AS gemini_tyt
  FROM public.questions
  WHERE source = 'ai_gemini_tyt'
),
fingerprints(migration, present) AS (
  VALUES
    ('091', to_regclass('public.verified_attempts') IS NOT NULL),
    ('092', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'complete_verified_game_session'
    )),
    ('093', to_regclass('public.reward_ledger') IS NOT NULL),
    ('094', to_regclass('public.review_cards') IS NOT NULL),
    ('095', to_regclass('public.daily_plan_items') IS NOT NULL),
    ('096', to_regclass('public.curriculum_nodes') IS NOT NULL),
    ('097', to_regclass('public.mastery_outcome_evidence') IS NOT NULL),
    ('098', to_regclass('public.adaptive_diagnostic_sessions') IS NOT NULL),
    ('099', to_regclass('public.verified_coach_sessions') IS NOT NULL),
    ('100', to_regclass('public.verified_exam_attempts') IS NOT NULL),
    ('101', to_regclass('public.weekly_learning_league_preferences') IS NOT NULL),
    ('102', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'get_my_weekly_learning_spotlights'
    )),
    ('103', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'get_my_weekly_team_boss'
    )),
    ('104', to_regclass('public.paper_study_packs') IS NOT NULL),
    ('105', to_regclass('public.teacher_classrooms') IS NOT NULL),
    ('106',
      to_regclass('public.question_content_revisions') IS NOT NULL
      AND to_regclass('public.verified_attempt_question_revisions') IS NOT NULL
    ),
    ('107', EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.questions'::regclass
        AND conname = 'questions_ai_gemini_tyt_exam_ref_check'
    ))
),
fingerprint_stats AS (
  SELECT
    count(*) FILTER (WHERE present)::integer AS present_count,
    jsonb_object_agg(migration, present ORDER BY migration) AS fingerprints
  FROM fingerprints
)
SELECT
  q.total_questions,
  q.invalid_total,
  q.repair_candidates,
  g.gemini_total,
  g.gemini_tyt,
  f.present_count,
  f.fingerprints,
  COALESCE((
    SELECT c.convalidated
    FROM pg_constraint c
    WHERE c.conrelid = 'public.questions'::regclass
      AND c.conname = 'questions_ai_gemini_tyt_exam_ref_check'
  ), false) AS constraint_validated
FROM question_stats q
CROSS JOIN gemini_stats g
CROSS JOIN fingerprint_stats f;
