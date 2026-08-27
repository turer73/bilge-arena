-- Migration 181: Close released-scope repair races and parent-category drift.
--
-- Migration 180 repaired the production rows that were known to predate the
-- TYT Fen taxonomy. This follow-up covers two edge classes without rewriting
-- that immutable ledger:
--   1. a reviewed/manual primary mapping added after an attempt was marked;
--   2. an attempt completed while migration 179's mappings were uncommitted,
--      where the mapping timestamp can be earlier than the answer timestamp.
-- It also makes outcome -> topic category equality both a write-time invariant
-- and part of the fail-closed released-scope integrity proof.

BEGIN;

-- Drain writers that can change the released graph or materialize an attempt,
-- then keep them behind the final evidence scan until COMMIT. This closes both
-- the release-time stale-snapshot window and mapping changes during repair.
LOCK TABLE
  public.curriculum_scope_releases,
  public.curriculum_nodes,
  public.curriculum_outcomes,
  public.questions,
  public.question_outcomes,
  public.verified_attempts,
  public.verified_attempt_question_revisions,
  public.session_answers,
  public.mastery_materialized_attempts,
  public.mastery_outcome_evidence,
  public.user_outcome_state
IN SHARE ROW EXCLUSIVE MODE;

-- Production may already have run the earlier form of migration 179. Repeat
-- the release-safe materializer definition here so pre-release answers cannot
-- violate the base/v2 invariant when their completion resumes after release.
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

CREATE OR REPLACE FUNCTION public.curriculum_node_parent_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_parent public.curriculum_nodes%ROWTYPE;
  v_expected_parent_type text;
BEGIN
  IF NEW.node_type = 'course' THEN
    IF NEW.parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'course nodes cannot have a parent' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_expected_parent_type := CASE NEW.node_type
      WHEN 'unit' THEN 'course'
      WHEN 'topic' THEN 'unit'
      WHEN 'outcome' THEN 'topic'
    END;
    IF NEW.parent_id IS NULL THEN
      RAISE EXCEPTION '% nodes require a % parent', NEW.node_type, v_expected_parent_type
        USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_parent
    FROM public.curriculum_nodes
    WHERE id = NEW.parent_id
    FOR UPDATE;
    IF NOT FOUND
      OR v_parent.node_type IS DISTINCT FROM v_expected_parent_type
      OR v_parent.game IS DISTINCT FROM NEW.game
      OR v_parent.exam_ref IS DISTINCT FROM NEW.exam_ref
      OR v_parent.taxonomy_version IS DISTINCT FROM NEW.taxonomy_version
      OR (
        NEW.node_type = 'outcome'
        AND v_parent.category IS DISTINCT FROM NEW.category
      ) THEN
      RAISE EXCEPTION 'curriculum node parent must be the preceding level in the same scope and category'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.curriculum_nodes AS child
    WHERE child.parent_id = NEW.id
      AND (
        NEW.node_type IS DISTINCT FROM CASE child.node_type
          WHEN 'unit' THEN 'course'
          WHEN 'topic' THEN 'unit'
          WHEN 'outcome' THEN 'topic'
        END
        OR child.game IS DISTINCT FROM NEW.game
        OR child.exam_ref IS DISTINCT FROM NEW.exam_ref
        OR child.taxonomy_version IS DISTINCT FROM NEW.taxonomy_version
        OR (
          child.node_type = 'outcome'
          AND child.category IS DISTINCT FROM NEW.category
        )
      )
  ) THEN
    RAISE EXCEPTION 'curriculum node update would invalidate an existing child scope or category'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.curriculum_outcomes AS outcome
    WHERE outcome.node_id = NEW.id
      AND (
        NEW.node_type <> 'outcome'
        OR outcome.game IS DISTINCT FROM NEW.game
        OR outcome.exam_ref IS DISTINCT FROM NEW.exam_ref
        OR outcome.taxonomy_version IS DISTINCT FROM NEW.taxonomy_version
        OR outcome.category IS DISTINCT FROM NEW.category
      )
  ) THEN
    RAISE EXCEPTION 'curriculum node update would invalidate an existing outcome scope or category'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_curriculum_node_parent_guard ON public.curriculum_nodes;
CREATE TRIGGER trg_curriculum_node_parent_guard
  BEFORE INSERT OR UPDATE OF node_type, parent_id, game, exam_ref, taxonomy_version, category
  ON public.curriculum_nodes
  FOR EACH ROW EXECUTE FUNCTION public.curriculum_node_parent_guard();

CREATE OR REPLACE FUNCTION public.curriculum_outcome_node_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_node public.curriculum_nodes%ROWTYPE;
BEGIN
  IF (NEW.node_id IS NULL) <> (NEW.taxonomy_version IS NULL) THEN
    RAISE EXCEPTION 'outcome node and taxonomy version must be set together'
      USING ERRCODE = '22023';
  END IF;
  IF NEW.node_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_node
  FROM public.curriculum_nodes
  WHERE id = NEW.node_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_node.node_type <> 'outcome'
    OR v_node.game IS DISTINCT FROM NEW.game
    OR v_node.exam_ref IS DISTINCT FROM NEW.exam_ref
    OR v_node.taxonomy_version IS DISTINCT FROM NEW.taxonomy_version
    OR v_node.category IS DISTINCT FROM NEW.category THEN
    RAISE EXCEPTION 'curriculum outcome must reference an outcome leaf in the same scope and category'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_curriculum_outcome_node_guard ON public.curriculum_outcomes;
CREATE TRIGGER trg_curriculum_outcome_node_guard
  BEFORE INSERT OR UPDATE OF node_id, taxonomy_version, game, exam_ref, category
  ON public.curriculum_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.curriculum_outcome_node_guard();

REVOKE ALL ON FUNCTION public.curriculum_node_parent_guard(),
  public.curriculum_outcome_node_guard()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.curriculum_scope_integrity(
  p_game text,
  p_display_exam_ref text,
  p_taxonomy_version text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_scope public.curriculum_scope_releases%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_scope
  FROM public.curriculum_scope_releases AS scope
  WHERE scope.game = lower(btrim(p_game))
    AND scope.display_exam_ref = upper(btrim(p_display_exam_ref))
    AND scope.taxonomy_version = btrim(p_taxonomy_version);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'curriculum scope is not registered' USING ERRCODE = 'P0002';
  END IF;

  WITH scope_questions AS (
    SELECT question.id, question.game::text AS game,
      NULLIF(upper(btrim(COALESCE(question.exam_ref, ''))), '') AS question_exam_ref,
      question.category::text AS category
    FROM public.questions AS question
    WHERE question.is_active
      AND question.game = v_scope.game
      AND NULLIF(upper(btrim(COALESCE(question.exam_ref, ''))), '')
        IS NOT DISTINCT FROM v_scope.question_exam_ref
  ),
  valid_mapping_rows AS (
    SELECT question.id AS question_id, mapping.outcome_id, mapping.is_primary
    FROM scope_questions AS question
    JOIN public.question_outcomes AS mapping ON mapping.question_id = question.id
    JOIN public.curriculum_outcomes AS outcome ON outcome.id = mapping.outcome_id
    JOIN public.curriculum_nodes AS node ON node.id = outcome.node_id
    WHERE outcome.is_active
      AND node.is_active
      AND node.node_type = 'outcome'
      AND outcome.game IS NOT DISTINCT FROM question.game
      AND upper(COALESCE(outcome.exam_ref, '')) = v_scope.display_exam_ref
      AND outcome.taxonomy_version = v_scope.taxonomy_version
      AND outcome.category IS NOT DISTINCT FROM question.category
      AND node.game IS NOT DISTINCT FROM outcome.game
      AND node.exam_ref IS NOT DISTINCT FROM outcome.exam_ref
      AND node.taxonomy_version IS NOT DISTINCT FROM outcome.taxonomy_version
      AND node.category IS NOT DISTINCT FROM outcome.category
  ),
  mapped_questions AS (
    SELECT DISTINCT question_id FROM valid_mapping_rows
  ),
  scope_mismatch AS (
    SELECT count(*)::integer AS count
    FROM scope_questions AS question
    JOIN public.question_outcomes AS mapping ON mapping.question_id = question.id
    LEFT JOIN public.curriculum_outcomes AS outcome ON outcome.id = mapping.outcome_id
    LEFT JOIN public.curriculum_nodes AS node ON node.id = outcome.node_id
    WHERE outcome.id IS NULL
      OR NOT outcome.is_active
      OR outcome.game IS DISTINCT FROM question.game
      OR upper(COALESCE(outcome.exam_ref, '')) <> v_scope.display_exam_ref
      OR outcome.taxonomy_version IS DISTINCT FROM v_scope.taxonomy_version
      OR outcome.category IS DISTINCT FROM question.category
      OR node.id IS NULL
      OR NOT node.is_active
      OR node.node_type <> 'outcome'
      OR node.game IS DISTINCT FROM outcome.game
      OR node.exam_ref IS DISTINCT FROM outcome.exam_ref
      OR node.taxonomy_version IS DISTINCT FROM outcome.taxonomy_version
      OR node.category IS DISTINCT FROM outcome.category
  ),
  primary_mismatch_count AS (
    SELECT count(*)::integer AS count
    FROM (
      SELECT question.id
      FROM scope_questions AS question
      LEFT JOIN valid_mapping_rows AS mapping ON mapping.question_id = question.id
      GROUP BY question.id
      HAVING count(*) FILTER (WHERE mapping.is_primary) <> 1
    ) AS invalid_question
  ),
  node_orphan AS (
    SELECT count(*)::integer AS count
    FROM public.curriculum_nodes AS child
    LEFT JOIN public.curriculum_nodes AS parent ON parent.id = child.parent_id
    WHERE child.taxonomy_version = v_scope.taxonomy_version
      AND child.is_active
      AND (
        (child.node_type = 'course' AND child.parent_id IS NOT NULL)
        OR (child.node_type <> 'course' AND (
          parent.id IS NULL
          OR NOT parent.is_active
          OR parent.game IS DISTINCT FROM child.game
          OR parent.exam_ref IS DISTINCT FROM child.exam_ref
          OR parent.taxonomy_version IS DISTINCT FROM child.taxonomy_version
          OR parent.node_type IS DISTINCT FROM CASE child.node_type
            WHEN 'unit' THEN 'course'
            WHEN 'topic' THEN 'unit'
            WHEN 'outcome' THEN 'topic'
          END
          OR (
            child.node_type = 'outcome'
            AND parent.category IS DISTINCT FROM child.category
          )
        ))
      )
  ),
  outcome_orphan AS (
    SELECT count(*)::integer AS count
    FROM public.curriculum_outcomes AS outcome
    LEFT JOIN public.curriculum_nodes AS node ON node.id = outcome.node_id
    WHERE outcome.is_active
      AND outcome.game = v_scope.game
      AND upper(COALESCE(outcome.exam_ref, '')) = v_scope.display_exam_ref
      AND outcome.taxonomy_version = v_scope.taxonomy_version
      AND (
        node.id IS NULL
        OR NOT node.is_active
        OR node.node_type <> 'outcome'
        OR node.game IS DISTINCT FROM outcome.game
        OR node.exam_ref IS DISTINCT FROM outcome.exam_ref
        OR node.taxonomy_version IS DISTINCT FROM outcome.taxonomy_version
        OR node.category IS DISTINCT FROM outcome.category
      )
  ),
  empty_outcome AS (
    SELECT count(*)::integer AS count
    FROM public.curriculum_outcomes AS outcome
    WHERE outcome.is_active
      AND outcome.game = v_scope.game
      AND upper(COALESCE(outcome.exam_ref, '')) = v_scope.display_exam_ref
      AND outcome.taxonomy_version = v_scope.taxonomy_version
      AND NOT EXISTS (
        SELECT 1
        FROM valid_mapping_rows AS mapping
        WHERE mapping.outcome_id = outcome.id
      )
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*)::integer FROM scope_questions),
    'mapped', (SELECT count(*)::integer FROM mapped_questions),
    'unmapped', (SELECT count(*)::integer FROM scope_questions) - (SELECT count(*)::integer FROM mapped_questions),
    'scopeMismatch', (SELECT count FROM scope_mismatch),
    'nodeOrphan', (SELECT count FROM node_orphan),
    'outcomeOrphan', (SELECT count FROM outcome_orphan),
    'primaryMismatch', (SELECT count FROM primary_mismatch_count),
    'emptyOutcome', (SELECT count FROM empty_outcome)
  ) INTO v_result;

  RETURN v_result;
END $fn$;

REVOKE ALL ON FUNCTION public.curriculum_scope_integrity(text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.curriculum_scope_integrity(text,text,text)
  TO service_role;

DO $fn$
DECLARE
  v_integrity jsonb;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.curriculum_scope_releases
    WHERE game = 'fen'
      AND display_exam_ref = 'TYT'
      AND taxonomy_version = 'ba-tyt-fen-v1'
      AND release_status = 'released'
  ) THEN
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
      RAISE EXCEPTION 'TYT Fen complete evidence repair requires clean scope integrity: %', v_integrity
        USING ERRCODE = '23514';
    END IF;
  END IF;
END $fn$;

CREATE TABLE IF NOT EXISTS public.curriculum_scope_evidence_repair_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_key text NOT NULL CHECK (char_length(repair_key) BETWEEN 1 AND 120),
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
  manual_mapping_rows integer NOT NULL CHECK (
    manual_mapping_rows >= 0 AND manual_mapping_rows <= candidate_evidence_rows
  ),
  mapping_at_or_before_answer_rows integer NOT NULL CHECK (mapping_at_or_before_answer_rows >= 0),
  mapping_after_answer_rows integer NOT NULL CHECK (mapping_after_answer_rows >= 0),
  repaired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (mapping_at_or_before_answer_rows + mapping_after_answer_rows = candidate_evidence_rows)
);

CREATE INDEX IF NOT EXISTS idx_curriculum_scope_evidence_repair_runs_key
  ON public.curriculum_scope_evidence_repair_runs(repair_key, repaired_at DESC);

ALTER TABLE public.curriculum_scope_evidence_repair_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.curriculum_scope_evidence_repair_runs
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TEMP TABLE fen_scope_complete_evidence_candidates ON COMMIT DROP AS
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
JOIN public.mastery_materialized_attempts AS marker ON marker.attempt_id = attempt.id
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
 AND node.game IS NOT DISTINCT FROM outcome.game
 AND node.exam_ref IS NOT DISTINCT FROM outcome.exam_ref
 AND node.taxonomy_version IS NOT DISTINCT FROM outcome.taxonomy_version
 AND node.category IS NOT DISTINCT FROM outcome.category
WHERE attempt.game = 'fen'
  AND attempt.completed_at IS NOT NULL
  AND attempt.session_id IS NOT NULL
  AND answer.question_id = ANY(attempt.question_ids)
  AND NOT COALESCE(answer.is_skipped, false)
  AND question.game = 'fen'
  AND upper(COALESCE(question.exam_ref, '')) = 'TYT'
  AND question.is_active
  AND outcome.category IS NOT DISTINCT FROM question.category
  -- A governed mapping replacement must not make one historical answer count
  -- toward both the superseded and current primary outcome.
  AND NOT EXISTS (
    SELECT 1
    FROM public.mastery_outcome_evidence AS existing
    JOIN public.curriculum_outcomes AS existing_outcome
      ON existing_outcome.id = existing.outcome_id
    WHERE existing.answer_id = answer.id
      AND existing.question_id = answer.question_id
      AND existing_outcome.game = 'fen'
      AND upper(COALESCE(existing_outcome.exam_ref, '')) = 'TYT'
      AND existing_outcome.taxonomy_version = 'ba-tyt-fen-v1'
  );

CREATE TEMP TABLE fen_scope_complete_inserted_evidence ON COMMIT DROP AS
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
  FROM fen_scope_complete_evidence_candidates
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
FROM fen_scope_complete_inserted_evidence AS evidence
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

CREATE TEMP TABLE fen_scope_complete_repair_run ON COMMIT DROP AS
WITH inserted_run AS (
  INSERT INTO public.curriculum_scope_evidence_repair_runs (
    repair_key, game, display_exam_ref, taxonomy_version,
    candidate_attempts, candidate_answers, candidate_evidence_rows,
    inserted_evidence_rows, affected_users, manual_mapping_rows,
    mapping_at_or_before_answer_rows, mapping_after_answer_rows
  )
  SELECT
    '181_tyt_fen_complete_primary_mappings_v1',
    'fen',
    'TYT',
    'ba-tyt-fen-v1',
    count(DISTINCT attempt_id)::integer,
    count(DISTINCT answer_id)::integer,
    count(*)::integer,
    (SELECT count(*)::integer FROM fen_scope_complete_inserted_evidence),
    count(DISTINCT user_id)::integer,
    count(*) FILTER (WHERE mapping_source = 'manual')::integer,
    count(*) FILTER (WHERE NOT mapping_after_answer)::integer,
    count(*) FILTER (WHERE mapping_after_answer)::integer
  FROM fen_scope_complete_evidence_candidates
  HAVING EXISTS (
    SELECT 1
    FROM public.curriculum_scope_releases
    WHERE game = 'fen'
      AND display_exam_ref = 'TYT'
      AND taxonomy_version = 'ba-tyt-fen-v1'
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
  FROM fen_scope_complete_evidence_candidates;
  SELECT count(*)::integer INTO v_inserted
  FROM fen_scope_complete_inserted_evidence;
  SELECT count(*)::integer INTO v_runs
  FROM fen_scope_complete_repair_run;
  SELECT EXISTS (
    SELECT 1
    FROM public.curriculum_scope_releases
    WHERE game = 'fen'
      AND display_exam_ref = 'TYT'
      AND taxonomy_version = 'ba-tyt-fen-v1'
      AND release_status = 'released'
  ) INTO v_scope_released;

  IF NOT v_scope_released THEN
    IF v_candidates <> 0 OR v_inserted <> 0 OR v_runs <> 0 THEN
      RAISE EXCEPTION 'obsolete TYT Fen v1 repair mutated rows'
        USING ERRCODE = '23514';
    END IF;
    RETURN;
  END IF;

  IF v_candidates <> v_inserted THEN
    RAISE EXCEPTION 'TYT Fen complete evidence repair lost rows: candidates %, inserted %',
      v_candidates, v_inserted USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fen_scope_complete_evidence_candidates AS candidate
    LEFT JOIN public.mastery_outcome_evidence AS evidence
      ON evidence.answer_id = candidate.answer_id
     AND evidence.outcome_id = candidate.outcome_id
    WHERE evidence.answer_id IS NULL
  ) THEN
    RAISE EXCEPTION 'TYT Fen complete evidence repair left missing rows'
      USING ERRCODE = '23514';
  END IF;

  IF v_runs <> 1 OR NOT EXISTS (
    SELECT 1
    FROM fen_scope_complete_repair_run
    WHERE repair_key = '181_tyt_fen_complete_primary_mappings_v1'
      AND inserted_evidence_rows = v_inserted
  ) THEN
    RAISE EXCEPTION 'TYT Fen complete evidence repair ledger was not persisted'
      USING ERRCODE = '55000';
  END IF;
END $fn$;

NOTIFY pgrst, 'reload schema';
COMMIT;
