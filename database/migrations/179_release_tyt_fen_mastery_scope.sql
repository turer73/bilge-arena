-- Migration 179: Release TYT Fen mastery after a full category-proxy mapping.
--
-- This migration is deliberately separate from the registry foundation. It
-- maps only the reviewed TYT Fen scope and releases it atomically only when all
-- active questions and all three active leaves pass the generic integrity gate.

BEGIN;

-- Completion can resume immediately after this transaction commits. Use the
-- scope release timestamp (not only mapping.created_at, which is the mapping
-- transaction start) to decide whether the legacy/base trigger could actually
-- have seen a taxonomy-owned mapping. Also preserve the attempt's immutable
-- question difficulty when governance publishes a later revision.
CREATE OR REPLACE FUNCTION public.materialize_verified_attempt_mastery(p_attempt_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_attempt record;
  v_new boolean;
BEGIN
  SELECT * INTO v_attempt
  FROM public.verified_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;
  IF NOT FOUND OR v_attempt.completed_at IS NULL OR v_attempt.session_id IS NULL THEN
    RAISE EXCEPTION 'completed verified attempt required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.mastery_materialized_attempts(attempt_id)
  VALUES(p_attempt_id)
  ON CONFLICT(attempt_id) DO NOTHING
  RETURNING true INTO v_new;
  IF NOT COALESCE(v_new, false) THEN
    RETURN;
  END IF;

  INSERT INTO public.mastery_outcome_evidence(
    answer_id, outcome_id, user_id, question_id, session_id, attempt_id,
    is_correct, mapping_weight, difficulty, difficulty_weighted_earned,
    difficulty_weighted_possible, time_taken_sec, fast_wrong, max_hint_stage,
    delayed_correct, base_already_recorded
  )
  SELECT
    answer.id,
    mapping.outcome_id,
    answer.user_id,
    answer.question_id,
    answer.session_id,
    p_attempt_id,
    answer.is_correct,
    mapping.weight,
    COALESCE(snapshot.difficulty, question.difficulty)::smallint,
    CASE WHEN answer.is_correct
      THEN mapping.weight * COALESCE(snapshot.difficulty, question.difficulty)
      ELSE 0
    END,
    mapping.weight * COALESCE(snapshot.difficulty, question.difficulty),
    answer.time_taken_sec,
    COALESCE(NOT answer.is_correct AND answer.is_fast, false),
    COALESCE((
      SELECT max(hint.stage)
      FROM public.verified_attempt_hint_events AS hint
      WHERE hint.attempt_id = p_attempt_id
        AND hint.question_id = answer.question_id
    ), 0),
    answer.is_correct AND EXISTS (
      SELECT 1
      FROM public.session_answers AS previous
      WHERE previous.user_id = answer.user_id
        AND previous.question_id = answer.question_id
        AND previous.id <> answer.id
        AND previous.answered_at <= answer.answered_at - interval '24 hours'
    ),
    CASE
      WHEN mapping.mapping_source = 'taxonomy_auto'
        AND scope.released_at IS NOT NULL
      THEN answer.answered_at >= GREATEST(mapping.created_at, scope.released_at)
      ELSE mapping.created_at <= answer.answered_at
    END
  FROM public.session_answers AS answer
  JOIN public.questions AS question ON question.id = answer.question_id
  LEFT JOIN public.verified_attempt_question_revisions AS snapshot
    ON snapshot.attempt_id = p_attempt_id
   AND snapshot.question_id = answer.question_id
  JOIN public.question_outcomes AS mapping ON mapping.question_id = answer.question_id
  JOIN public.curriculum_outcomes AS outcome
    ON outcome.id = mapping.outcome_id
   AND outcome.is_active
  LEFT JOIN public.curriculum_scope_releases AS scope
    ON scope.game = outcome.game
   AND scope.display_exam_ref = upper(COALESCE(outcome.exam_ref, ''))
   AND scope.taxonomy_version = outcome.taxonomy_version
  WHERE answer.session_id = v_attempt.session_id
    AND answer.user_id = v_attempt.user_id
    AND NOT COALESCE(answer.is_skipped, false)
  ON CONFLICT(answer_id, outcome_id) DO NOTHING;

  INSERT INTO public.user_outcome_state(
    user_id, outcome_id, attempts, correct_attempts, weighted_earned,
    weighted_possible, delayed_correct, last_answered_at, updated_at,
    v2_attempts, difficulty_weighted_earned, difficulty_weighted_possible,
    timed_attempts, total_time_sec, fast_wrong, hinted_attempts, hint_stage_sum,
    guess_annotations, careless_annotations
  )
  SELECT
    evidence.user_id,
    evidence.outcome_id,
    sum(CASE WHEN evidence.base_already_recorded THEN 0 ELSE 1 END)::integer,
    sum(CASE WHEN NOT evidence.base_already_recorded AND evidence.is_correct THEN 1 ELSE 0 END)::integer,
    sum(CASE WHEN NOT evidence.base_already_recorded AND evidence.is_correct
      THEN evidence.mapping_weight ELSE 0 END),
    sum(CASE WHEN evidence.base_already_recorded THEN 0 ELSE evidence.mapping_weight END),
    sum(CASE WHEN NOT evidence.base_already_recorded AND evidence.delayed_correct THEN 1 ELSE 0 END)::integer,
    max(answer.answered_at),
    clock_timestamp(),
    count(*)::integer,
    sum(evidence.difficulty_weighted_earned),
    sum(evidence.difficulty_weighted_possible),
    count(*) FILTER (WHERE evidence.time_taken_sec IS NOT NULL)::integer,
    sum(COALESCE(evidence.time_taken_sec, 0)),
    count(*) FILTER (WHERE evidence.fast_wrong)::integer,
    count(*) FILTER (WHERE evidence.max_hint_stage > 0)::integer,
    sum(evidence.max_hint_stage)::integer,
    count(*) FILTER (WHERE EXISTS (
      SELECT 1
      FROM public.review_logs AS log
      JOIN public.review_error_annotations AS annotation
        ON annotation.review_log_id = log.id
      WHERE log.answer_id = evidence.answer_id
        AND annotation.reason_code = 'guess'
    ))::integer,
    count(*) FILTER (WHERE EXISTS (
      SELECT 1
      FROM public.review_logs AS log
      JOIN public.review_error_annotations AS annotation
        ON annotation.review_log_id = log.id
      WHERE log.answer_id = evidence.answer_id
        AND annotation.reason_code = 'careless'
    ))::integer
  FROM public.mastery_outcome_evidence AS evidence
  JOIN public.session_answers AS answer ON answer.id = evidence.answer_id
  WHERE evidence.attempt_id = p_attempt_id
  GROUP BY evidence.user_id, evidence.outcome_id
  ON CONFLICT(user_id, outcome_id) DO UPDATE SET
    attempts = public.user_outcome_state.attempts + EXCLUDED.attempts,
    correct_attempts = public.user_outcome_state.correct_attempts + EXCLUDED.correct_attempts,
    weighted_earned = public.user_outcome_state.weighted_earned + EXCLUDED.weighted_earned,
    weighted_possible = public.user_outcome_state.weighted_possible + EXCLUDED.weighted_possible,
    delayed_correct = public.user_outcome_state.delayed_correct + EXCLUDED.delayed_correct,
    last_answered_at = GREATEST(public.user_outcome_state.last_answered_at, EXCLUDED.last_answered_at),
    updated_at = clock_timestamp(),
    v2_attempts = public.user_outcome_state.v2_attempts + EXCLUDED.v2_attempts,
    difficulty_weighted_earned = public.user_outcome_state.difficulty_weighted_earned
      + EXCLUDED.difficulty_weighted_earned,
    difficulty_weighted_possible = public.user_outcome_state.difficulty_weighted_possible
      + EXCLUDED.difficulty_weighted_possible,
    timed_attempts = public.user_outcome_state.timed_attempts + EXCLUDED.timed_attempts,
    total_time_sec = public.user_outcome_state.total_time_sec + EXCLUDED.total_time_sec,
    fast_wrong = public.user_outcome_state.fast_wrong + EXCLUDED.fast_wrong,
    hinted_attempts = public.user_outcome_state.hinted_attempts + EXCLUDED.hinted_attempts,
    hint_stage_sum = public.user_outcome_state.hint_stage_sum + EXCLUDED.hint_stage_sum,
    guess_annotations = public.user_outcome_state.guess_annotations + EXCLUDED.guess_annotations,
    careless_annotations = public.user_outcome_state.careless_annotations + EXCLUDED.careless_annotations;
END $fn$;

REVOKE ALL ON FUNCTION public.materialize_verified_attempt_mastery(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Freeze both question/mapping writers and verified-attempt completions for the
-- whole release proof. SHARE ROW EXCLUSIVE waits for in-flight writers and
-- prevents a stale snapshot from committing an unmapped question or an empty
-- mastery marker after the proof has started.
LOCK TABLE
  public.curriculum_nodes,
  public.curriculum_outcomes,
  public.questions,
  public.question_outcomes,
  public.session_answers,
  public.verified_attempts
IN SHARE ROW EXCLUSIVE MODE;

DO $fn$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.curriculum_scope_releases
  SET release_status = CASE WHEN release_status = 'released' THEN 'released' ELSE 'validating' END,
      updated_at = clock_timestamp()
  WHERE game = 'fen'
    AND display_exam_ref = 'TYT'
    AND taxonomy_version = 'ba-tyt-fen-v1'
    AND release_status IN ('draft', 'validating', 'released');
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'TYT Fen curriculum scope is not releasable' USING ERRCODE = '55000';
  END IF;
END $fn$;

DO $fn$
DECLARE
  v_question record;
BEGIN
  FOR v_question IN
    SELECT id, game::text AS game, exam_ref::text AS exam_ref,
      category::text AS category, is_active
    FROM public.questions
    WHERE game = 'fen'
      AND upper(COALESCE(exam_ref, '')) = 'TYT'
      AND is_active
    ORDER BY id
  LOOP
    PERFORM public.sync_taxonomy_auto_question_outcomes(
      v_question.id,
      v_question.game,
      v_question.exam_ref,
      v_question.category,
      v_question.is_active
    );
  END LOOP;
END $fn$;

DO $fn$
DECLARE
  v_integrity jsonb;
BEGIN
  v_integrity := public.curriculum_scope_integrity('fen', 'TYT', 'ba-tyt-fen-v1');
  IF v_integrity IS NULL
    OR jsonb_typeof(v_integrity) <> 'object'
    OR COALESCE((v_integrity->>'total')::integer, 0) <= 0
    OR COALESCE((v_integrity->>'mapped')::integer, -1) <> (v_integrity->>'total')::integer
    OR COALESCE((v_integrity->>'unmapped')::integer, -1) <> 0
    OR COALESCE((v_integrity->>'scopeMismatch')::integer, -1) <> 0
    OR COALESCE((v_integrity->>'nodeOrphan')::integer, -1) <> 0
    OR COALESCE((v_integrity->>'outcomeOrphan')::integer, -1) <> 0
    OR COALESCE((v_integrity->>'primaryMismatch')::integer, -1) <> 0
    OR COALESCE((v_integrity->>'emptyOutcome')::integer, -1) <> 0 THEN
    RAISE EXCEPTION 'TYT Fen curriculum scope failed release integrity: %', v_integrity
      USING ERRCODE = '23514';
  END IF;
END $fn$;

UPDATE public.curriculum_scope_releases
SET release_status = 'released',
    released_at = COALESCE(released_at, clock_timestamp()),
    updated_at = clock_timestamp()
WHERE game = 'fen'
  AND display_exam_ref = 'TYT'
  AND taxonomy_version = 'ba-tyt-fen-v1'
  AND release_status IN ('validating', 'released');

DO $fn$
BEGIN
  IF public.resolve_released_curriculum_scope('fen', 'TYT') IS NULL THEN
    RAISE EXCEPTION 'TYT Fen curriculum scope release was not persisted' USING ERRCODE = '55000';
  END IF;
END $fn$;

NOTIFY pgrst, 'reload schema';
COMMIT;
