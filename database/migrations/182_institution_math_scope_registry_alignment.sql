-- Migration 182: Keep institution Mathematics analysis on the released scope.
--
-- Migration 178 made the Mathematics compatibility integrity function follow
-- the release registry. Migration 159 wrapped the original institution
-- projection with the free-pilot operational/AAL2 guard and renamed that
-- implementation private. Update only the private implementation so the guard
-- remains the sole public entry point while the projection uses the same scope
-- row for its proof, outcome filter and response metadata.

BEGIN;

CREATE OR REPLACE FUNCTION public.free_pilot_legacy_learning_analysis(
  p_user_id uuid,
  p_classroom_id uuid,
  p_member_ref text,
  p_game text,
  p_exam_ref text,
  p_window_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_membership public.teacher_classroom_memberships%ROWTYPE;
  v_scope public.curriculum_scope_releases%ROWTYPE;
  v_staff_role text;
  v_integrity jsonb;
  v_total integer;
  v_mapped integer;
  v_outcomes jsonb;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_window_end IS NULL
    OR p_member_ref IS NULL OR p_member_ref !~ '^[0-9a-f]{32}$'
    OR p_game IS DISTINCT FROM 'matematik' OR p_exam_ref IS DISTINCT FROM 'TYT' THEN
    RAISE EXCEPTION 'invalid institution learning analysis scope' USING ERRCODE = '22023';
  END IF;
  IF p_window_end > clock_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION 'analysis window cannot be in the future' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution analysis actor mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_classroom
  FROM public.teacher_classrooms
  WHERE id = p_classroom_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'classroom not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT membership.role INTO v_staff_role
  FROM public.pilot_institution_memberships AS membership
  JOIN public.pilot_institutions AS institution
    ON institution.id = membership.institution_id
    AND institution.status IN ('pilot', 'active')
  JOIN public.profiles AS profile
    ON profile.id = membership.user_id AND profile.deleted_at IS NULL
  WHERE membership.user_id = p_user_id
    AND membership.institution_id = v_classroom.institution_id
    AND membership.status = 'active'
    AND membership.role IN ('manager', 'teacher');
  IF v_staff_role IS NULL OR (v_staff_role = 'teacher' AND v_classroom.teacher_id <> p_user_id) THEN
    RAISE EXCEPTION 'institution classroom access required' USING ERRCODE = '42501';
  END IF;

  SELECT membership.* INTO v_membership
  FROM public.teacher_classroom_memberships AS membership
  JOIN public.profiles AS profile
    ON profile.id = membership.student_id AND profile.deleted_at IS NULL
  WHERE membership.classroom_id = p_classroom_id
    AND membership.member_ref = p_member_ref
    AND membership.status = 'active'
    AND NOT public.teacher_classroom_is_blocked(v_classroom.teacher_id, membership.student_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active classroom member not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_window_end <= v_membership.accepted_at THEN
    RAISE EXCEPTION 'analysis window must follow membership acceptance' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_scope
  FROM public.curriculum_scope_releases AS scope
  WHERE scope.game = p_game
    AND scope.display_exam_ref = p_exam_ref
    AND scope.release_status = 'released';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'released institution curriculum scope is required' USING ERRCODE = 'P0002';
  END IF;

  v_integrity := public.curriculum_scope_integrity(
    v_scope.game,
    v_scope.display_exam_ref,
    v_scope.taxonomy_version
  );
  IF v_integrity IS NULL
    OR jsonb_typeof(v_integrity) <> 'object'
    OR NOT (v_integrity ?& ARRAY[
      'total', 'mapped', 'unmapped', 'scopeMismatch', 'nodeOrphan',
      'outcomeOrphan', 'primaryMismatch', 'emptyOutcome'
    ])
    OR (v_integrity->>'total') !~ '^\d+$'
    OR (v_integrity->>'mapped') !~ '^\d+$'
    OR (v_integrity->>'unmapped') !~ '^\d+$'
    OR (v_integrity->>'scopeMismatch') !~ '^\d+$'
    OR (v_integrity->>'nodeOrphan') !~ '^\d+$'
    OR (v_integrity->>'outcomeOrphan') !~ '^\d+$'
    OR (v_integrity->>'primaryMismatch') !~ '^\d+$'
    OR (v_integrity->>'emptyOutcome') !~ '^\d+$'
    OR (v_integrity->>'unmapped')::integer <> 0
    OR (v_integrity->>'scopeMismatch')::integer <> 0
    OR (v_integrity->>'nodeOrphan')::integer <> 0
    OR (v_integrity->>'outcomeOrphan')::integer <> 0
    OR (v_integrity->>'primaryMismatch')::integer <> 0
    OR (v_integrity->>'emptyOutcome')::integer <> 0 THEN
    RAISE EXCEPTION 'curriculum coverage is not decision-safe' USING ERRCODE = '23514';
  END IF;
  v_total := (v_integrity->>'total')::integer;
  v_mapped := (v_integrity->>'mapped')::integer;
  IF v_total <= 0 OR v_mapped <> v_total THEN
    RAISE EXCEPTION 'curriculum coverage is incomplete' USING ERRCODE = '23514';
  END IF;

  WITH scoped_outcomes AS (
    SELECT
      outcome.id,
      outcome.code,
      outcome.title,
      outcome.category,
      outcome.sort_order,
      outcome_node.code AS node_code,
      jsonb_build_array(course_node.title, unit_node.title, topic_node.title, outcome_node.title) AS path
    FROM public.curriculum_outcomes AS outcome
    JOIN public.curriculum_nodes AS outcome_node
      ON outcome_node.id = outcome.node_id
      AND outcome_node.node_type = 'outcome'
      AND outcome_node.is_active
    JOIN public.curriculum_nodes AS topic_node
      ON topic_node.id = outcome_node.parent_id
      AND topic_node.node_type = 'topic'
      AND topic_node.is_active
    JOIN public.curriculum_nodes AS unit_node
      ON unit_node.id = topic_node.parent_id
      AND unit_node.node_type = 'unit'
      AND unit_node.is_active
    JOIN public.curriculum_nodes AS course_node
      ON course_node.id = unit_node.parent_id
      AND course_node.node_type = 'course'
      AND course_node.is_active
    WHERE outcome.game = v_scope.game
      AND outcome.exam_ref = v_scope.display_exam_ref
      AND outcome.taxonomy_version = v_scope.taxonomy_version
      AND outcome.is_active
  ), eligible_evidence AS (
    SELECT mastered.*, answer.answered_at
    FROM public.mastery_outcome_evidence AS mastered
    JOIN public.session_answers AS answer ON answer.id = mastered.answer_id
    WHERE mastered.user_id = v_membership.student_id
      AND answer.answered_at >= v_membership.accepted_at
      AND answer.answered_at < p_window_end
  ), evidence AS (
    SELECT
      scoped.id AS outcome_id,
      count(eligible.answer_id)::integer AS attempts,
      count(eligible.answer_id) FILTER (WHERE eligible.is_correct)::integer AS correct_attempts,
      count(DISTINCT eligible.attempt_id)::integer AS independent_attempts,
      COALESCE(sum(CASE WHEN eligible.is_correct THEN eligible.mapping_weight ELSE 0 END), 0) AS weighted_earned,
      COALESCE(sum(eligible.mapping_weight), 0) AS weighted_possible,
      count(eligible.answer_id) FILTER (WHERE eligible.delayed_correct)::integer AS delayed_correct,
      COALESCE(sum(eligible.difficulty_weighted_earned), 0) AS difficulty_weighted_earned,
      COALESCE(sum(eligible.difficulty_weighted_possible), 0) AS difficulty_weighted_possible,
      count(eligible.answer_id) FILTER (WHERE eligible.time_taken_sec IS NOT NULL)::integer AS timed_attempts,
      COALESCE(sum(eligible.time_taken_sec), 0) AS total_time_sec,
      count(eligible.answer_id) FILTER (WHERE eligible.fast_wrong)::integer AS fast_wrong,
      count(eligible.answer_id) FILTER (WHERE eligible.max_hint_stage > 0)::integer AS hinted_attempts,
      COALESCE(sum(eligible.max_hint_stage), 0)::integer AS hint_stage_sum,
      count(eligible.answer_id) FILTER (WHERE EXISTS (
        SELECT 1 FROM public.review_logs AS review_log
        JOIN public.review_error_annotations AS annotation
          ON annotation.review_log_id = review_log.id AND annotation.reason_code = 'guess'
        WHERE review_log.answer_id = eligible.answer_id
      ))::integer AS guess_annotations,
      count(eligible.answer_id) FILTER (WHERE EXISTS (
        SELECT 1 FROM public.review_logs AS review_log
        JOIN public.review_error_annotations AS annotation
          ON annotation.review_log_id = review_log.id AND annotation.reason_code = 'careless'
        WHERE review_log.answer_id = eligible.answer_id
      ))::integer AS careless_annotations,
      min(eligible.answered_at) AS first_evidence_at,
      max(eligible.answered_at) AS last_evidence_at
    FROM scoped_outcomes AS scoped
    LEFT JOIN eligible_evidence AS eligible ON eligible.outcome_id = scoped.id
    GROUP BY scoped.id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'code', scoped.code,
    'nodeCode', scoped.node_code,
    'path', scoped.path,
    'title', scoped.title,
    'category', scoped.category,
    'attempts', evidence.attempts,
    'correctAttempts', evidence.correct_attempts,
    'independentAttempts', evidence.independent_attempts,
    'weightedEarned', evidence.weighted_earned,
    'weightedPossible', evidence.weighted_possible,
    'delayedCorrect', evidence.delayed_correct,
    'difficultyWeightedEarned', evidence.difficulty_weighted_earned,
    'difficultyWeightedPossible', evidence.difficulty_weighted_possible,
    'timedAttempts', evidence.timed_attempts,
    'totalTimeSec', evidence.total_time_sec,
    'fastWrong', evidence.fast_wrong,
    'hintedAttempts', evidence.hinted_attempts,
    'hintStageSum', evidence.hint_stage_sum,
    'guessAnnotations', evidence.guess_annotations,
    'carelessAnnotations', evidence.careless_annotations,
    'firstEvidenceAt', evidence.first_evidence_at,
    'lastEvidenceAt', evidence.last_evidence_at
  ) ORDER BY scoped.sort_order, scoped.code), '[]'::jsonb)
  INTO v_outcomes
  FROM scoped_outcomes AS scoped
  JOIN evidence ON evidence.outcome_id = scoped.id;

  RETURN jsonb_build_object(
    'classroom', jsonb_build_object(
      'id', v_classroom.id,
      'name', v_classroom.name
    ),
    'student', jsonb_build_object(
      'memberRef', v_membership.member_ref,
      'alias', public.teacher_classroom_safe_alias(v_membership.student_id),
      'joinedAt', v_membership.accepted_at
    ),
    'scope', jsonb_build_object(
      'game', v_scope.game,
      'examRef', v_scope.display_exam_ref,
      'questionExamRef', v_scope.question_exam_ref,
      'taxonomyVersion', v_scope.taxonomy_version,
      'diagnosticEnabled', v_scope.diagnostic_enabled,
      'modelVersion', 'institution-evidence-v1',
      'windowStart', v_membership.accepted_at,
      'windowEnd', p_window_end
    ),
    'coverage', jsonb_build_object(
      'supported', true,
      'totalQuestions', v_total,
      'mappedQuestions', v_mapped,
      'percentage', round(100.0 * v_mapped / v_total)::integer
    ),
    'outcomes', v_outcomes
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.free_pilot_legacy_learning_analysis(
  uuid, uuid, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;

-- Do not let a replay accidentally install the projection without migration
-- 159's public AAL2 + operational-tenant wrapper in front of it.
DO $block$
DECLARE
  v_wrapper regprocedure := to_regprocedure(
    'public.get_institution_student_learning_analysis(uuid,uuid,text,text,text,timestamptz)'
  );
  v_definition text;
BEGIN
  IF v_wrapper IS NULL THEN
    RAISE EXCEPTION 'guarded institution learning analysis wrapper is required'
      USING ERRCODE = 'P0002';
  END IF;
  v_definition := pg_get_functiondef(v_wrapper);
  IF position('institution_pilot_assert_operational_actor' IN v_definition) = 0
    OR position('free_pilot_legacy_learning_analysis' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'institution learning analysis wrapper guard drift detected'
      USING ERRCODE = '23514';
  END IF;
END;
$block$;

NOTIFY pgrst, 'reload schema';
COMMIT;
