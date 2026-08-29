-- Migration 199: release the internal Wordquest English skill diagnostic.
--
-- This is not an official YDT-representativeness claim.  The public display
-- label remains YDT for compatibility, while the question storage scope is
-- deliberately the legacy Wordquest NULL exam_ref scope.  No question
-- metadata is rewritten here.  A later, explicitly versioned migration is
-- required if the storage semantics change.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

LOCK TABLE
  public.curriculum_scope_releases,
  public.adaptive_diagnostic_blueprints,
  public.curriculum_nodes,
  public.curriculum_outcomes,
  public.question_content_revisions,
  public.questions,
  public.question_outcomes,
  public.verified_attempts,
  public.verified_attempt_question_revisions,
  public.mastery_materialized_attempts
IN SHARE ROW EXCLUSIVE MODE;

-- Replaying this migration must not undo the documented data-only emergency
-- disable. A released blueprint therefore keeps every proof active while its
-- registry mutation is skipped; the resolver remains NULL while the flag is
-- false, but mapping/revision/storage drift still fails closed.
CREATE TEMP TABLE ydt_english_diagnostic_release_control (
  already_released boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO ydt_english_diagnostic_release_control (already_released)
SELECT EXISTS (
  SELECT 1
  FROM public.adaptive_diagnostic_blueprints AS blueprint
  WHERE blueprint.blueprint_version = 'ba-ydt-eng-diagnostic-v1'
    AND blueprint.game = 'wordquest'
    AND blueprint.display_exam_ref = 'YDT'
    AND blueprint.question_exam_ref IS NULL
    AND blueprint.taxonomy_version = 'ba-ydt-eng-v1'
    AND blueprint.policy_version = 'adaptive-screening-v1'
    AND blueprint.question_count = 10
    AND blueprint.outcome_count = 7
    AND blueprint.max_per_outcome = 2
    AND blueprint.candidate_gate_version = 'exact-single-outcome-v1'
    AND blueprint.requires_revision_snapshot
    AND blueprint.capability_status = 'released'
    AND blueprint.released_at IS NOT NULL
);

-- The existing mastery scope and immutable historical provenance are
-- prerequisites.  This migration never infers an old answer from mutable
-- current question metadata.
DO $precheck$
DECLARE
  v_scope public.curriculum_scope_releases%ROWTYPE;
  v_integrity jsonb;
  v_marker_gap integer;
  v_snapshot_gap integer;
BEGIN
  SELECT * INTO v_scope
  FROM public.curriculum_scope_releases AS scope
  WHERE scope.game = 'wordquest'
    AND scope.display_exam_ref = 'YDT'
    AND scope.question_exam_ref IS NULL
    AND scope.taxonomy_version = 'ba-ydt-eng-v1'
    AND scope.release_status = 'released'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'released internal Wordquest English scope is required'
      USING ERRCODE = 'P0002';
  END IF;

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
    RAISE EXCEPTION 'internal Wordquest English scope integrity is not clean: %', v_integrity
      USING ERRCODE = '23514';
  END IF;

  SELECT count(DISTINCT attempt.id)::integer INTO v_marker_gap
  FROM public.verified_attempts AS attempt
  JOIN public.session_answers AS answer
    ON answer.session_id = attempt.session_id
   AND answer.user_id = attempt.user_id
  JOIN public.questions AS question
    ON question.id = answer.question_id
   AND question.game = 'wordquest'
   AND question.exam_ref IS NULL
   AND question.is_active
  WHERE attempt.game = 'wordquest'
    AND attempt.completed_at IS NOT NULL
    AND attempt.session_id IS NOT NULL
    AND answer.question_id = ANY(attempt.question_ids)
    AND NOT COALESCE(answer.is_skipped, false)
    AND NOT EXISTS (
      SELECT 1
      FROM public.mastery_materialized_attempts AS marker
      WHERE marker.attempt_id = attempt.id
    );

  SELECT count(*)::integer INTO v_snapshot_gap
  FROM public.verified_attempts AS attempt
  JOIN public.mastery_materialized_attempts AS marker
    ON marker.attempt_id = attempt.id
  JOIN public.session_answers AS answer
    ON answer.session_id = attempt.session_id
   AND answer.user_id = attempt.user_id
  JOIN public.questions AS question
    ON question.id = answer.question_id
   AND question.game = 'wordquest'
   AND question.exam_ref IS NULL
   AND question.is_active
  LEFT JOIN public.verified_attempt_question_revisions AS snapshot
    ON snapshot.attempt_id = attempt.id
   AND snapshot.question_id = answer.question_id
  WHERE attempt.game = 'wordquest'
    AND attempt.completed_at IS NOT NULL
    AND attempt.session_id IS NOT NULL
    AND answer.question_id = ANY(attempt.question_ids)
    AND NOT COALESCE(answer.is_skipped, false)
    AND (
      snapshot.question_id IS NULL
      OR answer.question_revision_id IS NULL
      OR snapshot.revision_id IS DISTINCT FROM answer.question_revision_id
      OR snapshot.game IS DISTINCT FROM 'wordquest'
      OR NOT (
        NULLIF(upper(btrim(COALESCE(snapshot.exam_ref, ''))), '') IS NULL
        OR upper(btrim(snapshot.exam_ref)) = 'YDT'
      )
      OR snapshot.category IS DISTINCT FROM question.category::text
    );

  IF v_marker_gap <> 0 OR v_snapshot_gap <> 0 THEN
    RAISE EXCEPTION
      'internal Wordquest English diagnostic blocked by historical provenance: marker gaps %, snapshot gaps %',
      v_marker_gap, v_snapshot_gap USING ERRCODE = '23514';
  END IF;

  -- The displayed YDT scope owns only the legacy NULL storage semantics.  A
  -- mapped target question with a non-NULL exam_ref is a release blocker.
  IF EXISTS (
    SELECT 1
    FROM public.questions AS question
    JOIN public.question_outcomes AS mapping ON mapping.question_id = question.id
    JOIN public.curriculum_outcomes AS outcome ON outcome.id = mapping.outcome_id
    WHERE question.game = 'wordquest'
      AND question.is_active
      AND outcome.game = 'wordquest'
      AND outcome.exam_ref = 'YDT'
      AND outcome.taxonomy_version = 'ba-ydt-eng-v1'
      AND question.exam_ref IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'internal Wordquest English target contains non-NULL question exam_ref'
      USING ERRCODE = '23514';
  END IF;
END;
$precheck$;

-- Seven internal skill categories are required.  Each must have at least two
-- exact published candidates: one initial candidate and one safe replacement.
INSERT INTO public.adaptive_diagnostic_blueprints (
  blueprint_version, game, display_exam_ref, question_exam_ref,
  taxonomy_version, policy_version, question_count, outcome_count,
  max_per_outcome, candidate_gate_version, requires_revision_snapshot,
  capability_status, released_at
)
VALUES (
  'ba-ydt-eng-diagnostic-v1', 'wordquest', 'YDT', NULL,
  'ba-ydt-eng-v1', 'adaptive-screening-v1', 10, 7, 2,
  'exact-single-outcome-v1', true, 'draft', NULL
)
ON CONFLICT (blueprint_version) DO NOTHING;

DO $release$
DECLARE
  v_blueprint public.adaptive_diagnostic_blueprints%ROWTYPE;
  v_integrity jsonb;
  v_outcome_count integer;
  v_unexpected_categories integer;
  v_shortfall_count integer;
  v_scope_updated integer;
BEGIN
  SELECT * INTO v_blueprint
  FROM public.adaptive_diagnostic_blueprints
  WHERE blueprint_version = 'ba-ydt-eng-diagnostic-v1'
  FOR UPDATE;

  IF NOT FOUND
    OR v_blueprint.game <> 'wordquest'
    OR v_blueprint.display_exam_ref <> 'YDT'
    OR v_blueprint.question_exam_ref IS NOT NULL
    OR v_blueprint.taxonomy_version <> 'ba-ydt-eng-v1'
    OR v_blueprint.policy_version <> 'adaptive-screening-v1'
    OR v_blueprint.question_count <> 10
    OR v_blueprint.outcome_count <> 7
    OR v_blueprint.max_per_outcome <> 2
    OR v_blueprint.candidate_gate_version <> 'exact-single-outcome-v1'
    OR NOT v_blueprint.requires_revision_snapshot
    OR v_blueprint.capability_status NOT IN ('draft', 'validating', 'released')
    OR (v_blueprint.capability_status IN ('draft','validating') AND v_blueprint.released_at IS NOT NULL)
    OR (v_blueprint.capability_status = 'released' AND v_blueprint.released_at IS NULL) THEN
    RAISE EXCEPTION 'internal Wordquest English diagnostic blueprint drifted'
      USING ERRCODE = '23514';
  END IF;

  IF v_blueprint.capability_status = 'draft' THEN
    UPDATE public.adaptive_diagnostic_blueprints
    SET capability_status = 'validating', updated_at = clock_timestamp()
    WHERE blueprint_version = v_blueprint.blueprint_version;
    v_blueprint.capability_status := 'validating';
  END IF;

  WITH expected(category) AS (
    VALUES
      ('vocabulary'), ('phrasal_verbs'), ('grammar'),
      ('sentence_completion'), ('cloze_test'), ('restatement'), ('dialogue')
  ), actual AS (
    SELECT lower(outcome.category::text) AS category,
      count(*)::integer AS outcome_count
    FROM public.curriculum_outcomes AS outcome
    JOIN public.curriculum_nodes AS node ON node.id = outcome.node_id
    WHERE outcome.is_active
      AND node.is_active
      AND node.node_type = 'outcome'
      AND outcome.game = 'wordquest'
      AND upper(COALESCE(outcome.exam_ref, '')) = 'YDT'
      AND outcome.taxonomy_version = 'ba-ydt-eng-v1'
      AND node.game IS NOT DISTINCT FROM outcome.game
      AND node.exam_ref IS NOT DISTINCT FROM outcome.exam_ref
      AND node.taxonomy_version IS NOT DISTINCT FROM outcome.taxonomy_version
      AND node.category IS NOT DISTINCT FROM outcome.category
    GROUP BY lower(outcome.category::text)
  )
  SELECT count(*) INTO v_outcome_count
  FROM actual;

  SELECT count(*) INTO v_unexpected_categories
  FROM (
    WITH expected(category) AS (
      VALUES
        ('vocabulary'), ('phrasal_verbs'), ('grammar'),
        ('sentence_completion'), ('cloze_test'), ('restatement'), ('dialogue')
    )
    SELECT actual.category
    FROM (
      SELECT lower(outcome.category::text) AS category
      FROM public.curriculum_outcomes AS outcome
      JOIN public.curriculum_nodes AS node ON node.id = outcome.node_id
      WHERE outcome.is_active
        AND node.is_active
        AND node.node_type = 'outcome'
        AND outcome.game = 'wordquest'
        AND upper(COALESCE(outcome.exam_ref, '')) = 'YDT'
        AND outcome.taxonomy_version = 'ba-ydt-eng-v1'
        AND node.game IS NOT DISTINCT FROM outcome.game
        AND node.exam_ref IS NOT DISTINCT FROM outcome.exam_ref
        AND node.taxonomy_version IS NOT DISTINCT FROM outcome.taxonomy_version
        AND node.category IS NOT DISTINCT FROM outcome.category
      GROUP BY lower(outcome.category::text)
    ) AS actual
    LEFT JOIN expected ON expected.category = actual.category
    WHERE expected.category IS NULL
  ) AS unexpected;

  IF v_outcome_count <> 7 OR v_unexpected_categories <> 0 THEN
    RAISE EXCEPTION
      'internal Wordquest English diagnostic requires exactly seven expected categories: outcomes %, unexpected %',
      v_outcome_count, v_unexpected_categories USING ERRCODE = '23514';
  END IF;

  WITH exact_question AS (
    SELECT question.id,
      min(outcome.id::text)::uuid AS outcome_id
    FROM public.questions AS question
    JOIN public.question_outcomes AS mapping
      ON mapping.question_id = question.id
     AND mapping.is_primary
     AND mapping.mapping_source = 'taxonomy_auto'
    JOIN public.curriculum_outcomes AS outcome ON outcome.id = mapping.outcome_id
    JOIN public.curriculum_nodes AS node ON node.id = outcome.node_id
    JOIN public.question_content_revisions AS revision
      ON revision.id = question.published_revision_id
     AND revision.question_id = question.id
     AND revision.status = 'published'
     AND revision.game IS NOT DISTINCT FROM question.game::text
     AND revision.category IS NOT DISTINCT FROM question.category::text
     AND revision.difficulty IS NOT DISTINCT FROM question.difficulty
     AND (
       NULLIF(upper(btrim(COALESCE(revision.exam_ref, ''))), '') IS NULL
       OR upper(btrim(revision.exam_ref)) = 'YDT'
     )
    WHERE question.is_active
      AND question.game = 'wordquest'
      AND question.exam_ref IS NULL
      AND outcome.is_active
      AND node.is_active
      AND node.node_type = 'outcome'
      AND outcome.game = 'wordquest'
      AND upper(COALESCE(outcome.exam_ref, '')) = 'YDT'
      AND outcome.taxonomy_version = 'ba-ydt-eng-v1'
      AND outcome.category IS NOT DISTINCT FROM question.category::text
      AND node.game IS NOT DISTINCT FROM outcome.game
      AND node.exam_ref IS NOT DISTINCT FROM outcome.exam_ref
      AND node.taxonomy_version IS NOT DISTINCT FROM outcome.taxonomy_version
      AND node.category IS NOT DISTINCT FROM outcome.category
      AND revision.content_sha256 IS NOT NULL
      AND btrim(revision.content_sha256) <> ''
      AND jsonb_typeof(revision.content->'options') = 'array'
      AND jsonb_array_length(revision.content->'options') BETWEEN 2 AND 10
      AND COALESCE(revision.content->>'answer', '') ~ '^[0-9]{1,2}$'
      AND (revision.content->>'answer')::integer BETWEEN 0
        AND jsonb_array_length(revision.content->'options') - 1
    GROUP BY question.id, question.category
    HAVING count(DISTINCT outcome.id) = 1
      AND bool_and(outcome.category IS NOT DISTINCT FROM question.category::text)
  ), coverage AS (
    SELECT outcome.category, count(DISTINCT exact_question.id)::integer AS candidate_count
    FROM public.curriculum_outcomes AS outcome
    JOIN public.curriculum_nodes AS node ON node.id = outcome.node_id
    LEFT JOIN exact_question ON exact_question.outcome_id = outcome.id
    WHERE outcome.is_active
      AND node.is_active
      AND node.node_type = 'outcome'
      AND outcome.game = 'wordquest'
      AND upper(COALESCE(outcome.exam_ref, '')) = 'YDT'
      AND outcome.taxonomy_version = 'ba-ydt-eng-v1'
    GROUP BY outcome.id, outcome.category
  )
  SELECT count(*) FILTER (WHERE candidate_count < 2)::integer
  INTO v_shortfall_count
  FROM coverage;

  IF v_shortfall_count <> 0 THEN
    RAISE EXCEPTION
      'internal Wordquest English diagnostic requires two exact candidates per outcome: shortfalls %',
      v_shortfall_count USING ERRCODE = '23514';
  END IF;

  v_integrity := public.adaptive_diagnostic_scope_integrity(
    'wordquest', 'YDT', 'ba-ydt-eng-diagnostic-v1'
  );
  IF NOT COALESCE((v_integrity->>'clean')::boolean, false)
    OR (v_integrity->>'outcomeCount')::integer <> 7
    OR (v_integrity->>'emptyCandidateOutcome')::integer <> 0
    OR (v_integrity->>'candidateCapacity')::integer < 10 THEN
    RAISE EXCEPTION
      'internal Wordquest English diagnostic candidate integrity is not clean: %',
      v_integrity USING ERRCODE = '23514';
  END IF;

  IF v_blueprint.capability_status = 'validating' THEN
    UPDATE public.adaptive_diagnostic_blueprints
    SET capability_status = 'released',
        released_at = COALESCE(released_at, clock_timestamp()),
        updated_at = clock_timestamp()
    WHERE blueprint_version = v_blueprint.blueprint_version;
  END IF;

  IF NOT (SELECT already_released FROM ydt_english_diagnostic_release_control) THEN
    UPDATE public.curriculum_scope_releases
    SET diagnostic_enabled = true, updated_at = clock_timestamp()
    WHERE game = 'wordquest'
      AND display_exam_ref = 'YDT'
      AND question_exam_ref IS NULL
      AND taxonomy_version = 'ba-ydt-eng-v1'
      AND release_status = 'released';
    GET DIAGNOSTICS v_scope_updated = ROW_COUNT;
    IF v_scope_updated <> 1 THEN
      RAISE EXCEPTION 'internal Wordquest English diagnostic registry flag was not persisted'
        USING ERRCODE = '55000';
    END IF;
  END IF;
END;
$release$;

DO $postcheck$
DECLARE
  v_scope jsonb;
  v_integrity jsonb;
  v_blueprint_count integer;
  v_emergency_disabled boolean;
BEGIN
  v_emergency_disabled := (
    SELECT already_released FROM ydt_english_diagnostic_release_control
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.curriculum_scope_releases AS scope
    WHERE scope.game = 'wordquest'
      AND scope.display_exam_ref = 'YDT'
      AND scope.question_exam_ref IS NULL
      AND scope.taxonomy_version = 'ba-ydt-eng-v1'
      AND scope.release_status = 'released'
      AND scope.diagnostic_enabled
  );

  SELECT public.resolve_released_diagnostic_scope('wordquest', 'YDT') INTO v_scope;
  IF v_emergency_disabled THEN
    IF v_scope IS NOT NULL THEN
      RAISE EXCEPTION 'internal Wordquest English emergency diagnostic disable was not preserved'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF v_scope IS DISTINCT FROM jsonb_build_object(
      'game', 'wordquest',
      'displayExamRef', 'YDT',
      'questionExamRef', NULL,
      'taxonomyVersion', 'ba-ydt-eng-v1',
      'policyVersion', 'adaptive-screening-v1',
      'questionCount', 10,
      'outcomeCount', 7,
      'maxPerOutcome', 2
    ) THEN
      RAISE EXCEPTION 'internal Wordquest English diagnostic resolver postcheck failed: %', v_scope
        USING ERRCODE = '55000';
    END IF;
  END IF;

  SELECT count(*)::integer INTO v_blueprint_count
  FROM public.adaptive_diagnostic_blueprints
  WHERE blueprint_version = 'ba-ydt-eng-diagnostic-v1'
    AND game = 'wordquest'
    AND display_exam_ref = 'YDT'
    AND question_exam_ref IS NULL
    AND taxonomy_version = 'ba-ydt-eng-v1'
    AND capability_status = 'released';
  IF v_blueprint_count <> 1 THEN
    RAISE EXCEPTION 'internal Wordquest English diagnostic blueprint postcheck failed'
      USING ERRCODE = '55000';
  END IF;

  v_integrity := public.adaptive_diagnostic_scope_integrity(
    'wordquest', 'YDT', 'ba-ydt-eng-diagnostic-v1'
  );
  IF NOT COALESCE((v_integrity->>'clean')::boolean, false) THEN
    RAISE EXCEPTION 'internal Wordquest English diagnostic postcheck integrity failed: %', v_integrity
      USING ERRCODE = '55000';
  END IF;

  IF has_table_privilege('service_role', 'public.adaptive_diagnostic_blueprints', 'SELECT')
    OR has_function_privilege('anon', 'public.resolve_released_diagnostic_scope(text,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.resolve_released_diagnostic_scope(text,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.resolve_released_diagnostic_scope(text,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.start_adaptive_diagnostic_v3(uuid,uuid,text,text,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.record_adaptive_diagnostic_answer_v3(uuid,uuid,uuid,smallint,integer,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'internal Wordquest English adaptive diagnostic ACL postcheck failed'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.questions AS question
    JOIN public.question_outcomes AS mapping ON mapping.question_id = question.id
    JOIN public.curriculum_outcomes AS outcome ON outcome.id = mapping.outcome_id
    WHERE outcome.game = 'wordquest'
      AND outcome.exam_ref = 'YDT'
      AND outcome.taxonomy_version = 'ba-ydt-eng-v1'
      AND question.game = 'wordquest'
      AND question.exam_ref IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'internal Wordquest English NULL storage postcheck failed'
      USING ERRCODE = '23514';
  END IF;
END;
$postcheck$;

NOTIFY pgrst, 'reload schema';
COMMIT;
