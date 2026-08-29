-- Migration 192: Backfill historical verified TYT Social evidence.
--
-- Migration 191 creates category-proxy mappings after historical attempts may
-- already have received immutable materialization markers. Repair every missing
-- current v1 mapping additively; never infer order from transaction-start NOW().

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

LOCK TABLE
  public.curriculum_scope_releases,
  public.curriculum_scope_source_policy_evidence,
  public.curriculum_nodes,
  public.curriculum_outcomes,
  public.question_content_revisions,
  public.question_revision_sources,
  public.question_revision_approvals,
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

-- A released v1 scope is repaired. Draft/validating Social scopes deliberately
-- produce an empty target set and a mutation-free no-op so the migration chain
-- can advance while incomplete content stays invisible. Later taxonomies and
-- operator-retired scopes are preserved for the same reason.

CREATE TEMP TABLE tyt_humanities_repair_targets ON COMMIT DROP AS
SELECT scope.game::text AS game,
  scope.display_exam_ref::text AS display_exam_ref,
  scope.question_exam_ref::text AS question_exam_ref,
  scope.taxonomy_version::text AS taxonomy_version,
  '192_tyt_sosyal_complete_mappings_v1'::text AS repair_key
FROM public.curriculum_scope_releases AS scope
JOIN (VALUES
  ('sosyal','TYT','TYT','ba-tyt-sosyal-v1')
) AS expected(game,display_exam_ref,question_exam_ref,taxonomy_version)
  ON scope.game = expected.game
 AND scope.display_exam_ref = expected.display_exam_ref
 AND scope.question_exam_ref IS NOT DISTINCT FROM expected.question_exam_ref
 AND scope.taxonomy_version = expected.taxonomy_version
CROSS JOIN LATERAL (
  SELECT public.tyt_social_source_policy_integrity(
    scope.game, scope.display_exam_ref, scope.taxonomy_version
  ) AS evidence
) AS source_policy
WHERE scope.release_status = 'released'
  AND COALESCE((source_policy.evidence->>'ready')::boolean, false)
  AND EXISTS (
    SELECT 1
    FROM public.curriculum_scope_source_policy_evidence AS recorded
    WHERE recorded.game = scope.game
      AND recorded.display_exam_ref = scope.display_exam_ref
      AND recorded.taxonomy_version = scope.taxonomy_version
      AND recorded.source_policy_version = source_policy.evidence->>'policyVersion'
      AND recorded.evidence_sha256 = source_policy.evidence->>'evidenceSha256'
  );

DO $fn$
DECLARE
  v_target record;
  v_integrity jsonb;
BEGIN
  FOR v_target IN SELECT * FROM tyt_humanities_repair_targets ORDER BY game
  LOOP
    v_integrity := public.curriculum_scope_integrity(
      v_target.game, v_target.display_exam_ref, v_target.taxonomy_version
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
      RAISE EXCEPTION '%/% evidence repair requires clean scope integrity: %',
        v_target.game, v_target.display_exam_ref, v_integrity
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
END
$fn$;

-- Historical attribution is immutable. A completed target-scope answer may be
-- repaired only when the normal materialization marker exists and its captured
-- question scope still exactly matches the current category-proxy scope.
DO $fn$
DECLARE
  v_marker_gap integer;
  v_snapshot_gap integer;
BEGIN
  SELECT count(DISTINCT attempt.id)::integer INTO v_marker_gap
  FROM tyt_humanities_repair_targets AS target
  JOIN public.verified_attempts AS attempt
    ON attempt.game = target.game
   AND attempt.completed_at IS NOT NULL
   AND attempt.session_id IS NOT NULL
  JOIN public.session_answers AS answer
    ON answer.session_id = attempt.session_id
   AND answer.user_id = attempt.user_id
  JOIN public.questions AS question
    ON question.id = answer.question_id
   AND question.game::text = target.game
   AND upper(btrim(COALESCE(question.exam_ref::text, ''))) = target.question_exam_ref
   AND question.is_active
  WHERE answer.question_id = ANY(attempt.question_ids)
    AND NOT COALESCE(answer.is_skipped, false)
    AND NOT EXISTS (
      SELECT 1 FROM public.mastery_materialized_attempts AS marker
      WHERE marker.attempt_id = attempt.id
    );

  SELECT count(*)::integer INTO v_snapshot_gap
  FROM tyt_humanities_repair_targets AS target
  JOIN public.verified_attempts AS attempt
    ON attempt.game = target.game
   AND attempt.completed_at IS NOT NULL
   AND attempt.session_id IS NOT NULL
  JOIN public.mastery_materialized_attempts AS marker
    ON marker.attempt_id = attempt.id
  JOIN public.session_answers AS answer
    ON answer.session_id = attempt.session_id
   AND answer.user_id = attempt.user_id
  JOIN public.questions AS question
    ON question.id = answer.question_id
   AND question.game::text = target.game
   AND upper(btrim(COALESCE(question.exam_ref::text, ''))) = target.question_exam_ref
   AND question.is_active
  LEFT JOIN public.verified_attempt_question_revisions AS snapshot
    ON snapshot.attempt_id = attempt.id
   AND snapshot.question_id = answer.question_id
  WHERE answer.question_id = ANY(attempt.question_ids)
    AND NOT COALESCE(answer.is_skipped, false)
    AND (
      snapshot.question_id IS NULL
      OR answer.question_revision_id IS NULL
      OR snapshot.revision_id IS DISTINCT FROM answer.question_revision_id
      OR snapshot.game IS DISTINCT FROM target.game
      OR upper(btrim(COALESCE(snapshot.exam_ref, ''))) IS DISTINCT FROM target.question_exam_ref
      OR snapshot.category IS DISTINCT FROM question.category::text
    );

  IF v_marker_gap <> 0 OR v_snapshot_gap <> 0 THEN
    RAISE EXCEPTION 'TYT Social historical mastery provenance is incomplete: marker gaps %, snapshot gaps %',
      v_marker_gap, v_snapshot_gap USING ERRCODE = '23514';
  END IF;
END
$fn$;

CREATE TEMP TABLE tyt_humanities_evidence_candidates ON COMMIT DROP AS
SELECT
  target.game,
  target.display_exam_ref,
  target.taxonomy_version,
  target.repair_key,
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
  snapshot.difficulty::smallint AS difficulty,
  CASE WHEN answer.is_correct
    THEN mapping.weight * snapshot.difficulty
    ELSE 0
  END AS difficulty_weighted_earned,
  mapping.weight * snapshot.difficulty
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
FROM tyt_humanities_repair_targets AS target
JOIN public.verified_attempts AS attempt
  ON attempt.game = target.game
 AND attempt.completed_at IS NOT NULL
 AND attempt.session_id IS NOT NULL
JOIN public.mastery_materialized_attempts AS marker
  ON marker.attempt_id = attempt.id
JOIN public.session_answers AS answer
  ON answer.session_id = attempt.session_id
 AND answer.user_id = attempt.user_id
JOIN public.questions AS question
  ON question.id = answer.question_id
 AND question.game::text = target.game
 AND upper(btrim(COALESCE(question.exam_ref::text, ''))) = target.question_exam_ref
 AND question.is_active
JOIN public.verified_attempt_question_revisions AS snapshot
 ON snapshot.attempt_id = attempt.id
 AND snapshot.question_id = answer.question_id
 AND snapshot.revision_id = answer.question_revision_id
 AND snapshot.game = target.game
 AND upper(btrim(COALESCE(snapshot.exam_ref, ''))) = target.question_exam_ref
 AND snapshot.category IS NOT DISTINCT FROM question.category::text
JOIN public.question_outcomes AS mapping
  ON mapping.question_id = question.id
JOIN public.curriculum_outcomes AS outcome
  ON outcome.id = mapping.outcome_id
 AND outcome.is_active
 AND outcome.game = target.game
 AND upper(COALESCE(outcome.exam_ref, '')) = target.display_exam_ref
 AND outcome.taxonomy_version = target.taxonomy_version
JOIN public.curriculum_nodes AS node
  ON node.id = outcome.node_id
 AND node.is_active
 AND node.node_type = 'outcome'
 AND node.game IS NOT DISTINCT FROM outcome.game
 AND node.exam_ref IS NOT DISTINCT FROM outcome.exam_ref
 AND node.taxonomy_version IS NOT DISTINCT FROM outcome.taxonomy_version
 AND node.category IS NOT DISTINCT FROM outcome.category
WHERE answer.question_id = ANY(attempt.question_ids)
  AND NOT COALESCE(answer.is_skipped, false)
  AND outcome.category IS NOT DISTINCT FROM question.category::text
  AND NOT EXISTS (
    SELECT 1
    FROM public.mastery_outcome_evidence AS existing
    WHERE existing.answer_id = answer.id
      AND existing.outcome_id = mapping.outcome_id
  )
  -- Do not double-count a superseded primary mapping from the same immutable
  -- taxonomy unless the attempt snapshot proves the older primary lineage.
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
      AND existing_outcome.game = target.game
      AND upper(COALESCE(existing_outcome.exam_ref, '')) = target.display_exam_ref
      AND existing_outcome.taxonomy_version = target.taxonomy_version
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

CREATE TEMP TABLE tyt_humanities_inserted_evidence ON COMMIT DROP AS
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
  FROM tyt_humanities_evidence_candidates
  ON CONFLICT (answer_id, outcome_id) DO NOTHING
  RETURNING *
)
SELECT candidate.game, candidate.display_exam_ref, candidate.taxonomy_version,
  candidate.repair_key, inserted.*
FROM inserted
JOIN tyt_humanities_evidence_candidates AS candidate
  ON candidate.answer_id = inserted.answer_id
 AND candidate.outcome_id = inserted.outcome_id;

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
FROM tyt_humanities_inserted_evidence AS evidence
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

CREATE TEMP TABLE tyt_humanities_repair_run ON COMMIT DROP AS
WITH inserted_run AS (
  INSERT INTO public.curriculum_scope_evidence_repair_runs (
    repair_key, game, display_exam_ref, taxonomy_version,
    candidate_attempts, candidate_answers, candidate_evidence_rows,
    inserted_evidence_rows, affected_users, manual_mapping_rows,
    mapping_at_or_before_answer_rows, mapping_after_answer_rows
  )
  SELECT
    target.repair_key,
    target.game,
    target.display_exam_ref,
    target.taxonomy_version,
    (SELECT count(DISTINCT candidate.attempt_id)::integer
      FROM tyt_humanities_evidence_candidates AS candidate
      WHERE candidate.game = target.game),
    (SELECT count(DISTINCT candidate.answer_id)::integer
      FROM tyt_humanities_evidence_candidates AS candidate
      WHERE candidate.game = target.game),
    (SELECT count(*)::integer
      FROM tyt_humanities_evidence_candidates AS candidate
      WHERE candidate.game = target.game),
    (SELECT count(*)::integer
      FROM tyt_humanities_inserted_evidence AS inserted
      WHERE inserted.game = target.game),
    (SELECT count(DISTINCT candidate.user_id)::integer
      FROM tyt_humanities_evidence_candidates AS candidate
      WHERE candidate.game = target.game),
    (SELECT count(*)::integer
      FROM tyt_humanities_evidence_candidates AS candidate
      WHERE candidate.game = target.game AND candidate.mapping_source = 'manual'),
    (SELECT count(*)::integer
      FROM tyt_humanities_evidence_candidates AS candidate
      WHERE candidate.game = target.game AND NOT candidate.mapping_after_answer),
    (SELECT count(*)::integer
      FROM tyt_humanities_evidence_candidates AS candidate
      WHERE candidate.game = target.game AND candidate.mapping_after_answer)
  FROM tyt_humanities_repair_targets AS target
  ORDER BY target.game
  RETURNING *
)
SELECT * FROM inserted_run;

DO $fn$
DECLARE
  v_target record;
  v_target_count integer;
  v_run_count integer;
  v_candidates integer;
  v_inserted integer;
BEGIN
  SELECT count(*)::integer INTO v_target_count
  FROM tyt_humanities_repair_targets;
  SELECT count(*)::integer INTO v_run_count
  FROM tyt_humanities_repair_run;

  IF v_run_count <> v_target_count THEN
    RAISE EXCEPTION 'TYT Social evidence repair ledger count mismatch'
      USING ERRCODE = '55000';
  END IF;

  FOR v_target IN SELECT * FROM tyt_humanities_repair_targets ORDER BY game
  LOOP
    SELECT count(*)::integer INTO v_candidates
    FROM tyt_humanities_evidence_candidates
    WHERE game = v_target.game;
    SELECT count(*)::integer INTO v_inserted
    FROM tyt_humanities_inserted_evidence
    WHERE game = v_target.game;

    IF v_candidates <> v_inserted THEN
      RAISE EXCEPTION '% evidence repair lost rows: candidates %, inserted %',
        v_target.game, v_candidates, v_inserted USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM tyt_humanities_evidence_candidates AS candidate
      LEFT JOIN public.mastery_outcome_evidence AS evidence
        ON evidence.answer_id = candidate.answer_id
       AND evidence.outcome_id = candidate.outcome_id
      WHERE candidate.game = v_target.game
        AND evidence.answer_id IS NULL
    ) THEN
      RAISE EXCEPTION '% evidence repair left missing rows', v_target.game
        USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM tyt_humanities_repair_run
      WHERE repair_key = v_target.repair_key
        AND game = v_target.game
        AND display_exam_ref = v_target.display_exam_ref
        AND taxonomy_version = v_target.taxonomy_version
        AND inserted_evidence_rows = v_inserted
    ) THEN
      RAISE EXCEPTION '% evidence repair ledger was not persisted', v_target.game
        USING ERRCODE = '55000';
    END IF;
  END LOOP;

  IF v_target_count = 0 AND (
    EXISTS (SELECT 1 FROM tyt_humanities_evidence_candidates)
    OR EXISTS (SELECT 1 FROM tyt_humanities_inserted_evidence)
    OR EXISTS (SELECT 1 FROM tyt_humanities_repair_run)
  ) THEN
    RAISE EXCEPTION 'obsolete TYT Social v1 repair mutated rows'
      USING ERRCODE = '23514';
  END IF;
END
$fn$;

NOTIFY pgrst, 'reload schema';
COMMIT;
