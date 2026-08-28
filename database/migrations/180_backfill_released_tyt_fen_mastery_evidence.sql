-- Migration 180: Repair verified TYT Fen mastery evidence after scope release.
--
-- Migration 097 deliberately ignored mappings created after an answer. That is
-- the safe general rule, but migration 179 introduced a reviewed category
-- proxy for an entire released scope. Completed verified Fen attempts had
-- already received a materialization marker while no mapping existed, so this
-- one-time scoped repair inserts only the missing post-release evidence and
-- records an observable, replay-safe ledger row.

BEGIN;

CREATE TABLE IF NOT EXISTS public.curriculum_scope_evidence_repairs (
  game varchar(20) NOT NULL,
  display_exam_ref varchar(20) NOT NULL,
  taxonomy_version text NOT NULL,
  candidate_attempts integer NOT NULL CHECK (candidate_attempts >= 0),
  candidate_answers integer NOT NULL CHECK (candidate_answers >= 0),
  candidate_evidence_rows integer NOT NULL CHECK (candidate_evidence_rows >= 0),
  inserted_evidence_rows integer NOT NULL CHECK (
    inserted_evidence_rows >= 0 AND inserted_evidence_rows <= candidate_evidence_rows
  ),
  affected_users integer NOT NULL CHECK (affected_users >= 0),
  repaired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (game, display_exam_ref, taxonomy_version)
);

ALTER TABLE public.curriculum_scope_evidence_repairs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.curriculum_scope_evidence_repairs
  FROM PUBLIC, anon, authenticated, service_role;

-- Drain all writers whose snapshots can affect the repair or its rebuilt
-- aggregates. Replays after a retired/upgraded Fen scope remain no-ops.
LOCK TABLE
  public.curriculum_scope_releases,
  public.curriculum_nodes,
  public.curriculum_outcomes,
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
  public.user_outcome_state
IN SHARE ROW EXCLUSIVE MODE;

DO $fn$
DECLARE
  v_integrity jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.curriculum_scope_releases
    WHERE game = 'fen'
      AND display_exam_ref = 'TYT'
      AND taxonomy_version = 'ba-tyt-fen-v1'
      AND release_status = 'released'
  ) THEN
    RETURN;
  END IF;

  v_integrity := public.curriculum_scope_integrity('fen', 'TYT', 'ba-tyt-fen-v1');
  IF v_integrity IS NULL
    OR COALESCE((v_integrity->>'total')::integer, 0) <= 0
    OR COALESCE((v_integrity->>'mapped')::integer, -1) <> (v_integrity->>'total')::integer
    OR COALESCE((v_integrity->>'unmapped')::integer, -1) <> 0
    OR COALESCE((v_integrity->>'scopeMismatch')::integer, -1) <> 0
    OR COALESCE((v_integrity->>'nodeOrphan')::integer, -1) <> 0
    OR COALESCE((v_integrity->>'outcomeOrphan')::integer, -1) <> 0
    OR COALESCE((v_integrity->>'primaryMismatch')::integer, -1) <> 0
    OR COALESCE((v_integrity->>'emptyOutcome')::integer, -1) <> 0 THEN
    RAISE EXCEPTION 'TYT Fen evidence repair requires clean scope integrity: %', v_integrity
      USING ERRCODE = '23514';
  END IF;
END $fn$;

CREATE TEMP TABLE fen_scope_evidence_candidates ON COMMIT DROP AS
SELECT
  answer.id AS answer_id,
  mapping.outcome_id,
  answer.user_id,
  answer.question_id,
  answer.session_id,
  attempt.id AS attempt_id,
  answer.is_correct,
  mapping.weight AS mapping_weight,
  COALESCE(snapshot.difficulty, question.difficulty)::smallint AS difficulty,
  CASE WHEN answer.is_correct
    THEN mapping.weight * COALESCE(snapshot.difficulty, question.difficulty)
    ELSE 0
  END
    AS difficulty_weighted_earned,
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
JOIN public.curriculum_scope_releases AS release
  ON release.game = 'fen'
 AND release.display_exam_ref = 'TYT'
 AND release.taxonomy_version = 'ba-tyt-fen-v1'
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
 AND mapping.mapping_source = 'taxonomy_auto'
 AND mapping.is_primary
JOIN public.curriculum_outcomes AS outcome
  ON outcome.id = mapping.outcome_id
 AND outcome.is_active
 AND outcome.game = 'fen'
 AND outcome.exam_ref = 'TYT'
 AND outcome.taxonomy_version = 'ba-tyt-fen-v1'
JOIN public.curriculum_nodes AS node
  ON node.id = outcome.node_id
 AND node.is_active
 AND node.node_type = 'outcome'
LEFT JOIN public.mastery_outcome_evidence AS existing
  ON existing.answer_id = answer.id
 AND existing.outcome_id = mapping.outcome_id
WHERE attempt.game = 'fen'
  AND attempt.completed_at IS NOT NULL
  AND attempt.session_id IS NOT NULL
  AND answer.question_id = ANY(attempt.question_ids)
  AND NOT COALESCE(answer.is_skipped, false)
  AND question.game = 'fen'
  AND upper(COALESCE(question.exam_ref, '')) = 'TYT'
  AND question.is_active
  AND mapping.created_at > answer.answered_at
  AND existing.answer_id IS NULL;

CREATE TEMP TABLE fen_scope_inserted_evidence ON COMMIT DROP AS
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
  FROM fen_scope_evidence_candidates
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
FROM fen_scope_inserted_evidence AS evidence
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

INSERT INTO public.mastery_materialized_attempts (attempt_id)
SELECT DISTINCT attempt_id
FROM fen_scope_evidence_candidates
ON CONFLICT (attempt_id) DO NOTHING;

INSERT INTO public.curriculum_scope_evidence_repairs (
  game, display_exam_ref, taxonomy_version, candidate_attempts,
  candidate_answers, candidate_evidence_rows, inserted_evidence_rows,
  affected_users
)
SELECT
  'fen',
  'TYT',
  'ba-tyt-fen-v1',
  count(DISTINCT attempt_id)::integer,
  count(DISTINCT answer_id)::integer,
  count(*)::integer,
  (SELECT count(*)::integer FROM fen_scope_inserted_evidence),
  count(DISTINCT user_id)::integer
FROM fen_scope_evidence_candidates
HAVING EXISTS (
  SELECT 1
  FROM public.curriculum_scope_releases
  WHERE game = 'fen'
    AND display_exam_ref = 'TYT'
    AND taxonomy_version = 'ba-tyt-fen-v1'
    AND release_status = 'released'
)
ON CONFLICT (game, display_exam_ref, taxonomy_version) DO NOTHING;

DO $fn$
DECLARE
  v_candidates integer;
  v_inserted integer;
  v_scope_released boolean;
BEGIN
  SELECT count(*)::integer INTO v_candidates FROM fen_scope_evidence_candidates;
  SELECT count(*)::integer INTO v_inserted FROM fen_scope_inserted_evidence;
  SELECT EXISTS (
    SELECT 1
    FROM public.curriculum_scope_releases
    WHERE game = 'fen'
      AND display_exam_ref = 'TYT'
      AND taxonomy_version = 'ba-tyt-fen-v1'
      AND release_status = 'released'
  ) INTO v_scope_released;

  IF NOT v_scope_released THEN
    IF v_candidates <> 0 OR v_inserted <> 0 THEN
      RAISE EXCEPTION 'obsolete TYT Fen v1 legacy repair mutated rows'
        USING ERRCODE = '23514';
    END IF;
    RETURN;
  END IF;

  IF v_candidates <> v_inserted THEN
    RAISE EXCEPTION 'TYT Fen evidence repair lost rows: candidates %, inserted %',
      v_candidates, v_inserted USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fen_scope_evidence_candidates AS candidate
    LEFT JOIN public.mastery_outcome_evidence AS evidence
      ON evidence.answer_id = candidate.answer_id
     AND evidence.outcome_id = candidate.outcome_id
    WHERE evidence.answer_id IS NULL
  ) THEN
    RAISE EXCEPTION 'TYT Fen evidence repair left missing rows' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.curriculum_scope_evidence_repairs
    WHERE game = 'fen'
      AND display_exam_ref = 'TYT'
      AND taxonomy_version = 'ba-tyt-fen-v1'
  ) THEN
    RAISE EXCEPTION 'TYT Fen evidence repair ledger was not persisted' USING ERRCODE = '55000';
  END IF;
END $fn$;

NOTIFY pgrst, 'reload schema';
COMMIT;
