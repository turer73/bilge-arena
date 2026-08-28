-- Migration 188: Backfill historical verified YDT English mastery evidence.
--
-- Migration 187 creates taxonomy-owned mappings after historical Wordquest
-- attempts have already been marked as materialized. Those markers make the
-- normal materializer correctly return early, so this migration repairs only
-- the missing pre-release evidence and its additive aggregate contribution.

BEGIN;

-- Keep every writer used by the evidence calculation behind one stable proof.
LOCK TABLE
  public.curriculum_scope_releases,
  public.curriculum_nodes,
  public.curriculum_outcomes,
  public.question_revision_outcomes,
  public.session_answers,
  public.questions,
  public.question_outcomes,
  public.verified_attempts,
  public.verified_attempt_question_revisions,
  public.verified_attempt_hint_events,
  public.review_logs,
  public.review_error_annotations,
  public.mastery_materialized_attempts,
  public.mastery_outcome_evidence,
  public.user_outcome_state,
  public.curriculum_scope_evidence_repair_runs
IN SHARE ROW EXCLUSIVE MODE;

DO $fn$
DECLARE
  v_integrity jsonb;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.curriculum_scope_releases
    WHERE game = 'wordquest'
      AND display_exam_ref = 'YDT'
      AND question_exam_ref IS NULL
      AND taxonomy_version = 'ba-ydt-eng-v1'
      AND release_status = 'released'
  ) THEN
    v_integrity := public.curriculum_scope_integrity(
      'wordquest', 'YDT', 'ba-ydt-eng-v1'
    );
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
      RAISE EXCEPTION 'YDT English evidence repair requires clean scope integrity: %', v_integrity
        USING ERRCODE = '23514';
    END IF;
  END IF;
END $fn$;

CREATE TEMP TABLE ydt_english_evidence_candidates ON COMMIT DROP AS
SELECT
  answer.id AS answer_id,
  mapping.outcome_id,
  answer.user_id,
  answer.question_id,
  answer.session_id,
  attempt.id AS attempt_id,
  answer.is_correct,
  mapping.weight AS mapping_weight,
  mapping.mapping_source,
  mapping.created_at > answer.answered_at AS mapping_after_answer,
  COALESCE(snapshot.difficulty, question.difficulty)::smallint AS difficulty,
  CASE WHEN answer.is_correct
    THEN mapping.weight * COALESCE(snapshot.difficulty, question.difficulty)
    ELSE 0
  END AS difficulty_weighted_earned,
  mapping.weight * COALESCE(snapshot.difficulty, question.difficulty)
    AS difficulty_weighted_possible,
  answer.time_taken_sec,
  COALESCE(NOT answer.is_correct AND answer.is_fast, false) AS fast_wrong,
  COALESCE((
    SELECT max(hint.stage)
    FROM public.verified_attempt_hint_events AS hint
    WHERE hint.attempt_id = attempt.id
      AND hint.question_id = answer.question_id
  ), 0)::smallint AS max_hint_stage,
  answer.is_correct AND EXISTS (
    SELECT 1
    FROM public.session_answers AS previous
    WHERE previous.user_id = answer.user_id
      AND previous.question_id = answer.question_id
      AND previous.id <> answer.id
      AND previous.answered_at <= answer.answered_at - interval '24 hours'
  ) AS delayed_correct,
  false AS base_already_recorded
FROM public.verified_attempts AS attempt
JOIN public.mastery_materialized_attempts AS marker ON marker.attempt_id = attempt.id
JOIN public.curriculum_scope_releases AS release
  ON release.game = 'wordquest'
 AND release.display_exam_ref = 'YDT'
 AND release.question_exam_ref IS NULL
 AND release.taxonomy_version = 'ba-ydt-eng-v1'
 AND release.release_status = 'released'
JOIN public.session_answers AS answer
  ON answer.session_id = attempt.session_id
 AND answer.user_id = attempt.user_id
JOIN public.questions AS question ON question.id = answer.question_id
LEFT JOIN public.verified_attempt_question_revisions AS snapshot
  ON snapshot.attempt_id = attempt.id
 AND snapshot.question_id = answer.question_id
JOIN public.question_outcomes AS mapping
  ON mapping.question_id = question.id
JOIN public.curriculum_outcomes AS outcome
  ON outcome.id = mapping.outcome_id
 AND outcome.is_active
 AND outcome.game = 'wordquest'
 AND outcome.exam_ref = 'YDT'
 AND outcome.taxonomy_version = 'ba-ydt-eng-v1'
JOIN public.curriculum_nodes AS node
  ON node.id = outcome.node_id
 AND node.is_active
 AND node.node_type = 'outcome'
 AND node.game IS NOT DISTINCT FROM outcome.game
 AND node.exam_ref IS NOT DISTINCT FROM outcome.exam_ref
 AND node.taxonomy_version IS NOT DISTINCT FROM outcome.taxonomy_version
 AND node.category IS NOT DISTINCT FROM outcome.category
WHERE attempt.game = 'wordquest'
  AND attempt.completed_at IS NOT NULL
  AND attempt.session_id IS NOT NULL
  AND answer.question_id = ANY(attempt.question_ids)
  AND NOT COALESCE(answer.is_skipped, false)
  AND question.game = 'wordquest'
  AND NULLIF(upper(btrim(COALESCE(question.exam_ref, ''))), '') IS NULL
  AND question.is_active
  AND outcome.category IS NOT DISTINCT FROM question.category
  -- This release owns only answers completed before the released scope became
  -- visible. Repair every missing current mapping independently: a governed
  -- manual mapping must not be skipped, and question_outcomes.created_at uses
  -- transaction-start NOW(), so it cannot safely order an in-flight answer
  -- against migration 187.
  AND answer.answered_at < release.released_at
  AND NOT EXISTS (
    SELECT 1
    FROM public.mastery_outcome_evidence AS existing
    WHERE existing.answer_id = answer.id
      AND existing.outcome_id = mapping.outcome_id
  )
  -- Fail closed if a superseded mapping already counted the same historical
  -- answer in this taxonomy. The immutable revision lineage is required before
  -- a secondary replacement can be repaired.
  AND NOT EXISTS (
    SELECT 1
    FROM public.mastery_outcome_evidence AS existing
    JOIN public.curriculum_outcomes AS existing_outcome
      ON existing_outcome.id = existing.outcome_id
    LEFT JOIN public.question_outcomes AS current_mapping
      ON current_mapping.question_id = answer.question_id
     AND current_mapping.outcome_id = existing.outcome_id
    WHERE existing.answer_id = answer.id
      AND existing.question_id = answer.question_id
      AND existing_outcome.game = 'wordquest'
      AND upper(COALESCE(existing_outcome.exam_ref, '')) = 'YDT'
      AND existing_outcome.taxonomy_version = 'ba-ydt-eng-v1'
      AND current_mapping.outcome_id IS NULL
      AND (
        mapping.is_primary
        OR snapshot.revision_id IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM public.question_revision_outcomes AS historical_mapping
          WHERE historical_mapping.revision_id = snapshot.revision_id
            AND historical_mapping.outcome_id = existing.outcome_id
            AND historical_mapping.is_primary
        )
      )
  );

CREATE TEMP TABLE ydt_english_inserted_evidence ON COMMIT DROP AS
WITH inserted AS (
  INSERT INTO public.mastery_outcome_evidence (
    answer_id, outcome_id, user_id, question_id, session_id, attempt_id,
    is_correct, mapping_weight, difficulty, difficulty_weighted_earned,
    difficulty_weighted_possible, time_taken_sec, fast_wrong, max_hint_stage,
    delayed_correct, base_already_recorded
  )
  SELECT
    answer_id, outcome_id, user_id, question_id, session_id, attempt_id,
    is_correct, mapping_weight, difficulty, difficulty_weighted_earned,
    difficulty_weighted_possible, time_taken_sec, fast_wrong, max_hint_stage,
    delayed_correct, base_already_recorded
  FROM ydt_english_evidence_candidates
  ON CONFLICT (answer_id, outcome_id) DO NOTHING
  RETURNING *
)
SELECT * FROM inserted;

INSERT INTO public.user_outcome_state (
  user_id, outcome_id, attempts, correct_attempts, weighted_earned,
  weighted_possible, delayed_correct, last_answered_at, updated_at,
  v2_attempts, difficulty_weighted_earned, difficulty_weighted_possible,
  timed_attempts, total_time_sec, fast_wrong, hinted_attempts, hint_stage_sum,
  guess_annotations, careless_annotations
)
SELECT
  evidence.user_id,
  evidence.outcome_id,
  count(*)::integer,
  count(*) FILTER (WHERE evidence.is_correct)::integer,
  sum(CASE WHEN evidence.is_correct THEN evidence.mapping_weight ELSE 0 END),
  sum(evidence.mapping_weight),
  count(*) FILTER (WHERE evidence.delayed_correct)::integer,
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
FROM ydt_english_inserted_evidence AS evidence
JOIN public.session_answers AS answer ON answer.id = evidence.answer_id
GROUP BY evidence.user_id, evidence.outcome_id
ON CONFLICT (user_id, outcome_id) DO UPDATE SET
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

CREATE TEMP TABLE ydt_english_repair_run ON COMMIT DROP AS
WITH inserted_run AS (
  INSERT INTO public.curriculum_scope_evidence_repair_runs (
    repair_key, game, display_exam_ref, taxonomy_version,
    candidate_attempts, candidate_answers, candidate_evidence_rows,
    inserted_evidence_rows, affected_users, manual_mapping_rows,
    mapping_at_or_before_answer_rows, mapping_after_answer_rows
  )
  SELECT
    '188_ydt_english_complete_mappings_v1',
    'wordquest',
    'YDT',
    'ba-ydt-eng-v1',
    count(DISTINCT attempt_id)::integer,
    count(DISTINCT answer_id)::integer,
    count(*)::integer,
    (SELECT count(*)::integer FROM ydt_english_inserted_evidence),
    count(DISTINCT user_id)::integer,
    count(*) FILTER (WHERE mapping_source = 'manual')::integer,
    count(*) FILTER (WHERE NOT mapping_after_answer)::integer,
    count(*) FILTER (WHERE mapping_after_answer)::integer
  FROM ydt_english_evidence_candidates
  HAVING EXISTS (
    SELECT 1
    FROM public.curriculum_scope_releases
    WHERE game = 'wordquest'
      AND display_exam_ref = 'YDT'
      AND question_exam_ref IS NULL
      AND taxonomy_version = 'ba-ydt-eng-v1'
      AND release_status = 'released'
  )
  RETURNING *
)
SELECT * FROM inserted_run;

DO $fn$
DECLARE
  v_candidates integer;
  v_inserted integer;
  v_runs integer;
  v_scope_released boolean;
BEGIN
  SELECT count(*)::integer INTO v_candidates
  FROM ydt_english_evidence_candidates;
  SELECT count(*)::integer INTO v_inserted
  FROM ydt_english_inserted_evidence;
  SELECT count(*)::integer INTO v_runs
  FROM ydt_english_repair_run;
  SELECT EXISTS (
    SELECT 1
    FROM public.curriculum_scope_releases
    WHERE game = 'wordquest'
      AND display_exam_ref = 'YDT'
      AND question_exam_ref IS NULL
      AND taxonomy_version = 'ba-ydt-eng-v1'
      AND release_status = 'released'
  ) INTO v_scope_released;

  IF NOT v_scope_released THEN
    IF v_candidates <> 0 OR v_inserted <> 0 OR v_runs <> 0 THEN
      RAISE EXCEPTION 'obsolete YDT English v1 repair mutated rows'
        USING ERRCODE = '23514';
    END IF;
    RETURN;
  END IF;

  IF v_candidates <> v_inserted THEN
    RAISE EXCEPTION 'YDT English evidence repair lost rows: candidates %, inserted %',
      v_candidates, v_inserted USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM ydt_english_evidence_candidates AS candidate
    LEFT JOIN public.mastery_outcome_evidence AS evidence
      ON evidence.answer_id = candidate.answer_id
     AND evidence.outcome_id = candidate.outcome_id
    WHERE evidence.answer_id IS NULL
  ) THEN
    RAISE EXCEPTION 'YDT English evidence repair left missing rows'
      USING ERRCODE = '23514';
  END IF;

  IF v_runs <> 1 OR NOT EXISTS (
    SELECT 1
    FROM ydt_english_repair_run
    WHERE repair_key = '188_ydt_english_complete_mappings_v1'
      AND inserted_evidence_rows = v_inserted
  ) THEN
    RAISE EXCEPTION 'YDT English evidence repair ledger was not persisted'
      USING ERRCODE = '55000';
  END IF;
END $fn$;

NOTIFY pgrst, 'reload schema';
COMMIT;
