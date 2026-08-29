-- Migration 195: release the independently proven TYT Fen adaptive screening.
--
-- This is a data/capability release, not a curriculum repair.  It may only
-- enable the exact released Fen/TYT registry row after the immutable V3
-- blueprint, complete taxonomy mapping, exact revision-bound candidates and
-- taxonomy-auto primary mapping provenance all agree.  Any drift aborts the
-- transaction; a replay validates the released proof without rewriting it.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

LOCK TABLE
  public.curriculum_scope_releases,
  public.curriculum_nodes,
  public.curriculum_outcomes,
  public.questions,
  public.question_outcomes,
  public.question_content_revisions,
  public.adaptive_diagnostic_blueprints
IN SHARE ROW EXCLUSIVE MODE;

-- This migration must not change any other subject's public diagnostic state.
CREATE TEMP TABLE fen_diagnostic_non_fen_scope_snapshot ON COMMIT DROP AS
SELECT
  scope.game, scope.display_exam_ref, scope.question_exam_ref,
  scope.taxonomy_version, scope.release_status, scope.mapping_mode,
  scope.diagnostic_enabled, scope.released_at, scope.created_at, scope.updated_at
FROM public.curriculum_scope_releases AS scope
WHERE scope.game <> 'fen';

CREATE TEMP TABLE fen_diagnostic_non_fen_blueprint_snapshot ON COMMIT DROP AS
SELECT
  blueprint.blueprint_version, blueprint.game, blueprint.display_exam_ref,
  blueprint.question_exam_ref, blueprint.taxonomy_version, blueprint.policy_version,
  blueprint.question_count, blueprint.outcome_count, blueprint.max_per_outcome,
  blueprint.candidate_gate_version, blueprint.requires_revision_snapshot,
  blueprint.capability_status, blueprint.released_at, blueprint.created_at,
  blueprint.updated_at
FROM public.adaptive_diagnostic_blueprints AS blueprint
WHERE blueprint.game <> 'fen';

CREATE TEMP TABLE fen_diagnostic_release_control (
  already_released boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO fen_diagnostic_release_control(already_released)
SELECT EXISTS (
  SELECT 1
  FROM public.adaptive_diagnostic_blueprints AS blueprint
  WHERE blueprint.blueprint_version = 'ba-tyt-fen-diagnostic-v1'
    AND blueprint.capability_status = 'released'
);

DO $fn$
DECLARE
  v_scope public.curriculum_scope_releases%ROWTYPE;
  v_blueprint public.adaptive_diagnostic_blueprints%ROWTYPE;
  v_integrity jsonb;
  v_outcome_count integer;
  v_distinct_category_count integer;
  v_unexpected_category_count integer;
  v_min_candidate_count integer;
  v_candidate_capacity integer;
  v_empty_candidate_outcomes integer;
  v_existing_released boolean := false;
BEGIN
  v_existing_released := (
    SELECT already_released FROM fen_diagnostic_release_control
  );

  SELECT * INTO v_scope
  FROM public.curriculum_scope_releases AS scope
  WHERE scope.game = 'fen'
    AND scope.display_exam_ref = 'TYT'
    AND scope.question_exam_ref = 'TYT'
    AND scope.taxonomy_version = 'ba-tyt-fen-v1'
    AND scope.release_status = 'released'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'released TYT Fen scope is required for diagnostic release'
      USING ERRCODE = 'P0002';
  END IF;

  -- Do not let a migration replay reverse an emergency data-only disable.
  -- A released blueprint must therefore see the registry still enabled; only
  -- the first publication (or an uncommitted validating proof) can enable it.
  SELECT * INTO v_blueprint
  FROM public.adaptive_diagnostic_blueprints AS blueprint
  WHERE blueprint.blueprint_version = 'ba-tyt-fen-diagnostic-v1'
  FOR UPDATE;
  IF FOUND THEN
    IF v_blueprint.game <> 'fen'
      OR v_blueprint.display_exam_ref <> 'TYT'
      OR v_blueprint.question_exam_ref IS DISTINCT FROM 'TYT'
      OR v_blueprint.taxonomy_version <> 'ba-tyt-fen-v1'
      OR v_blueprint.policy_version <> 'adaptive-screening-v1'
      OR v_blueprint.question_count <> 10
      OR v_blueprint.outcome_count <> 3
      OR v_blueprint.max_per_outcome <> 4
      OR v_blueprint.candidate_gate_version <> 'exact-single-outcome-v1'
      OR NOT v_blueprint.requires_revision_snapshot
      OR v_blueprint.capability_status NOT IN ('validating', 'released')
      OR (v_blueprint.capability_status = 'validating' AND v_blueprint.released_at IS NOT NULL)
      OR (v_blueprint.capability_status = 'released' AND v_blueprint.released_at IS NULL) THEN
      RAISE EXCEPTION 'TYT Fen diagnostic blueprint drifted from its release proof'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NOT v_existing_released THEN
    -- This is the sole registry mutation in this migration.
    UPDATE public.curriculum_scope_releases
    SET diagnostic_enabled = true,
        updated_at = clock_timestamp()
    WHERE game = 'fen'
      AND display_exam_ref = 'TYT'
      AND question_exam_ref = 'TYT'
      AND taxonomy_version = 'ba-tyt-fen-v1'
      AND release_status = 'released'
      AND NOT diagnostic_enabled;
  END IF;

  INSERT INTO public.adaptive_diagnostic_blueprints (
    blueprint_version, game, display_exam_ref, question_exam_ref,
    taxonomy_version, policy_version, question_count, outcome_count,
    max_per_outcome, candidate_gate_version, requires_revision_snapshot,
    capability_status, released_at
  ) VALUES (
    'ba-tyt-fen-diagnostic-v1', 'fen', 'TYT', 'TYT',
    'ba-tyt-fen-v1', 'adaptive-screening-v1', 10, 3, 4,
    'exact-single-outcome-v1', true, 'validating', NULL
  ) ON CONFLICT (blueprint_version) DO NOTHING;

  SELECT * INTO v_blueprint
  FROM public.adaptive_diagnostic_blueprints AS blueprint
  WHERE blueprint.blueprint_version = 'ba-tyt-fen-diagnostic-v1'
  FOR UPDATE;
  IF NOT FOUND
    OR v_blueprint.game <> 'fen'
    OR v_blueprint.display_exam_ref <> 'TYT'
    OR v_blueprint.question_exam_ref IS DISTINCT FROM 'TYT'
    OR v_blueprint.taxonomy_version <> 'ba-tyt-fen-v1'
    OR v_blueprint.policy_version <> 'adaptive-screening-v1'
    OR v_blueprint.question_count <> 10
    OR v_blueprint.outcome_count <> 3
    OR v_blueprint.max_per_outcome <> 4
    OR v_blueprint.candidate_gate_version <> 'exact-single-outcome-v1'
    OR NOT v_blueprint.requires_revision_snapshot
    OR v_blueprint.capability_status NOT IN ('validating', 'released')
    OR (v_blueprint.capability_status = 'validating' AND v_blueprint.released_at IS NOT NULL)
    OR (v_blueprint.capability_status = 'released' AND v_blueprint.released_at IS NULL) THEN
    RAISE EXCEPTION 'TYT Fen diagnostic blueprint drifted from its release proof'
      USING ERRCODE = '23514';
  END IF;

  -- The generic gate proves globally clean mapping and the capped candidate
  -- capacity.  The explicit query below additionally makes the per-outcome
  -- two-question minimum and taxonomy-auto provenance part of this release.
  v_integrity := public.adaptive_diagnostic_scope_integrity(
    'fen', 'TYT', 'ba-tyt-fen-diagnostic-v1'
  );
  IF NOT COALESCE((v_integrity ->> 'clean')::boolean, false)
    OR COALESCE((v_integrity ->> 'outcomeCount')::integer, -1) <> 3
    OR COALESCE((v_integrity ->> 'expectedOutcomeCount')::integer, -1) <> 3
    OR COALESCE((v_integrity ->> 'candidateCapacity')::integer, -1) < 10
    OR COALESCE((v_integrity ->> 'emptyCandidateOutcome')::integer, -1) <> 0 THEN
    RAISE EXCEPTION 'TYT Fen diagnostic candidate integrity is not clean: %', v_integrity
      USING ERRCODE = '23514';
  END IF;

  WITH scope_outcomes AS (
    SELECT outcome.id, outcome.category::text AS category
    FROM public.curriculum_outcomes AS outcome
    JOIN public.curriculum_nodes AS node ON node.id = outcome.node_id
    WHERE outcome.is_active
      AND node.is_active
      AND node.node_type = 'outcome'
      AND outcome.game = 'fen'
      AND outcome.exam_ref = 'TYT'
      AND outcome.taxonomy_version = 'ba-tyt-fen-v1'
      AND node.game IS NOT DISTINCT FROM outcome.game
      AND node.exam_ref IS NOT DISTINCT FROM outcome.exam_ref
      AND node.taxonomy_version IS NOT DISTINCT FROM outcome.taxonomy_version
      AND node.category IS NOT DISTINCT FROM outcome.category
  ), exact_candidates AS (
    SELECT question.id AS question_id, min(outcome.id::text)::uuid AS outcome_id
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
     AND upper(btrim(COALESCE(revision.exam_ref, ''))) = 'TYT'
    WHERE question.is_active
      AND question.game = 'fen'
      AND upper(COALESCE(question.exam_ref, '')) = 'TYT'
      AND outcome.is_active
      AND node.is_active
      AND node.node_type = 'outcome'
      AND outcome.game = 'fen'
      AND outcome.exam_ref = 'TYT'
      AND outcome.taxonomy_version = 'ba-tyt-fen-v1'
      AND outcome.category IS NOT DISTINCT FROM question.category::text
      AND node.game IS NOT DISTINCT FROM outcome.game
      AND node.exam_ref IS NOT DISTINCT FROM outcome.exam_ref
      AND node.taxonomy_version IS NOT DISTINCT FROM outcome.taxonomy_version
      AND node.category IS NOT DISTINCT FROM outcome.category
      AND btrim(COALESCE(revision.content_sha256, '')) <> ''
      AND jsonb_typeof(revision.content -> 'options') = 'array'
      AND jsonb_array_length(revision.content -> 'options') BETWEEN 2 AND 10
      AND COALESCE(revision.content ->> 'answer', '') ~ '^[0-9]{1,2}$'
      AND (revision.content ->> 'answer')::integer BETWEEN 0
        AND jsonb_array_length(revision.content -> 'options') - 1
    GROUP BY question.id, question.category
    HAVING count(DISTINCT outcome.id) = 1
      AND bool_and(outcome.category IS NOT DISTINCT FROM question.category::text)
  ), coverage AS (
    SELECT outcome.id, outcome.category,
      count(DISTINCT candidate.question_id)::integer AS candidate_count
    FROM scope_outcomes AS outcome
    LEFT JOIN exact_candidates AS candidate ON candidate.outcome_id = outcome.id
    GROUP BY outcome.id, outcome.category
  )
  SELECT
    count(*)::integer,
    count(DISTINCT lower(category))::integer,
    count(*) FILTER (
      WHERE lower(category) NOT IN ('fizik', 'kimya', 'biyoloji')
    )::integer,
    COALESCE(min(candidate_count), 0)::integer,
    COALESCE(sum(least(candidate_count, 4)), 0)::integer,
    count(*) FILTER (WHERE candidate_count = 0)::integer
  INTO v_outcome_count, v_distinct_category_count, v_unexpected_category_count,
    v_min_candidate_count, v_candidate_capacity, v_empty_candidate_outcomes
  FROM coverage;

  IF v_outcome_count <> 3
    OR v_distinct_category_count <> 3
    OR v_unexpected_category_count <> 0
    OR v_min_candidate_count < 2
    OR v_candidate_capacity < 10
    OR v_empty_candidate_outcomes <> 0 THEN
    RAISE EXCEPTION
      'TYT Fen diagnostic exact candidate proof failed (outcomes %, categories %, unexpected %, min %, capacity %, empty %)',
      v_outcome_count, v_distinct_category_count, v_unexpected_category_count,
      v_min_candidate_count, v_candidate_capacity, v_empty_candidate_outcomes
      USING ERRCODE = '23514';
  END IF;

  IF v_blueprint.capability_status = 'validating' THEN
    UPDATE public.adaptive_diagnostic_blueprints
    SET capability_status = 'released',
        released_at = clock_timestamp(),
        updated_at = clock_timestamp()
    WHERE blueprint_version = v_blueprint.blueprint_version
      AND capability_status = 'validating';
  END IF;
END;
$fn$;

DO $fn$
DECLARE
  v_scope jsonb;
  v_emergency_disabled boolean;
BEGIN
  v_emergency_disabled := (
    SELECT already_released FROM fen_diagnostic_release_control
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.curriculum_scope_releases AS scope
    WHERE scope.game = 'fen'
      AND scope.display_exam_ref = 'TYT'
      AND scope.question_exam_ref = 'TYT'
      AND scope.taxonomy_version = 'ba-tyt-fen-v1'
      AND scope.release_status = 'released'
      AND scope.diagnostic_enabled
  );

  v_scope := public.resolve_released_diagnostic_scope('fen', 'TYT');
  IF v_emergency_disabled THEN
    IF v_scope IS NOT NULL THEN
      RAISE EXCEPTION 'TYT Fen emergency diagnostic disable was not preserved'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF v_scope IS NULL
      OR v_scope ->> 'game' IS DISTINCT FROM 'fen'
      OR v_scope ->> 'displayExamRef' IS DISTINCT FROM 'TYT'
      OR v_scope ->> 'questionExamRef' IS DISTINCT FROM 'TYT'
      OR v_scope ->> 'taxonomyVersion' IS DISTINCT FROM 'ba-tyt-fen-v1'
      OR v_scope ->> 'policyVersion' IS DISTINCT FROM 'adaptive-screening-v1'
      OR COALESCE((v_scope ->> 'questionCount')::integer, -1) <> 10
      OR COALESCE((v_scope ->> 'outcomeCount')::integer, -1) <> 3
      OR COALESCE((v_scope ->> 'maxPerOutcome')::integer, -1) <> 4 THEN
      RAISE EXCEPTION 'TYT Fen diagnostic resolver postcheck failed'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NOT v_emergency_disabled AND NOT EXISTS (
      SELECT 1
      FROM public.curriculum_scope_releases AS scope
      WHERE scope.game = 'fen'
        AND scope.display_exam_ref = 'TYT'
        AND scope.question_exam_ref = 'TYT'
        AND scope.taxonomy_version = 'ba-tyt-fen-v1'
        AND scope.release_status = 'released'
        AND scope.diagnostic_enabled
    ) THEN
    RAISE EXCEPTION 'TYT Fen diagnostic registry postcheck failed'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
      (SELECT * FROM fen_diagnostic_non_fen_scope_snapshot)
      EXCEPT
      (SELECT scope.game, scope.display_exam_ref, scope.question_exam_ref,
        scope.taxonomy_version, scope.release_status, scope.mapping_mode,
        scope.diagnostic_enabled, scope.released_at, scope.created_at, scope.updated_at
       FROM public.curriculum_scope_releases AS scope
       WHERE scope.game <> 'fen')
    ) OR EXISTS (
      (SELECT scope.game, scope.display_exam_ref, scope.question_exam_ref,
        scope.taxonomy_version, scope.release_status, scope.mapping_mode,
        scope.diagnostic_enabled, scope.released_at, scope.created_at, scope.updated_at
       FROM public.curriculum_scope_releases AS scope
       WHERE scope.game <> 'fen')
      EXCEPT
      (SELECT * FROM fen_diagnostic_non_fen_scope_snapshot)
    ) OR EXISTS (
      (SELECT * FROM fen_diagnostic_non_fen_blueprint_snapshot)
      EXCEPT
      (SELECT blueprint.blueprint_version, blueprint.game, blueprint.display_exam_ref,
        blueprint.question_exam_ref, blueprint.taxonomy_version, blueprint.policy_version,
        blueprint.question_count, blueprint.outcome_count, blueprint.max_per_outcome,
        blueprint.candidate_gate_version, blueprint.requires_revision_snapshot,
        blueprint.capability_status, blueprint.released_at, blueprint.created_at,
        blueprint.updated_at
       FROM public.adaptive_diagnostic_blueprints AS blueprint
       WHERE blueprint.game <> 'fen')
    ) OR EXISTS (
      (SELECT blueprint.blueprint_version, blueprint.game, blueprint.display_exam_ref,
        blueprint.question_exam_ref, blueprint.taxonomy_version, blueprint.policy_version,
        blueprint.question_count, blueprint.outcome_count, blueprint.max_per_outcome,
        blueprint.candidate_gate_version, blueprint.requires_revision_snapshot,
        blueprint.capability_status, blueprint.released_at, blueprint.created_at,
        blueprint.updated_at
       FROM public.adaptive_diagnostic_blueprints AS blueprint
       WHERE blueprint.game <> 'fen')
      EXCEPT
      (SELECT * FROM fen_diagnostic_non_fen_blueprint_snapshot)
    ) THEN
    RAISE EXCEPTION 'TYT Fen diagnostic release changed another subject scope'
      USING ERRCODE = '23514';
  END IF;

  IF has_table_privilege('service_role', 'public.adaptive_diagnostic_blueprints', 'SELECT')
    OR has_function_privilege('anon',
      'public.resolve_released_diagnostic_scope(text,text)', 'EXECUTE')
    OR has_function_privilege('authenticated',
      'public.resolve_released_diagnostic_scope(text,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.resolve_released_diagnostic_scope(text,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.start_adaptive_diagnostic_v3(uuid,uuid,text,text,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.record_adaptive_diagnostic_answer_v3(uuid,uuid,uuid,smallint,integer,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TYT Fen diagnostic ACL postcheck failed'
      USING ERRCODE = '42501';
  END IF;
END;
$fn$;

NOTIFY pgrst, 'reload schema';
COMMIT;
