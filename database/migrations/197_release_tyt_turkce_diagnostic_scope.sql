-- Migration 197: release the proven TYT Turkish adaptive screening scope.
--
-- This is a proof migration, not a generic feature flag.  It publishes the
-- exact v2 Turkish blueprint only after the already-released curriculum,
-- revision-bound candidates, mapping integrity and boundary ACLs are clean.
-- A failed proof aborts the transaction and leaves diagnostic_enabled=false.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

LOCK TABLE
  public.curriculum_scope_releases,
  public.adaptive_diagnostic_blueprints,
  public.curriculum_nodes,
  public.curriculum_outcomes,
  public.question_outcomes,
  public.questions,
  public.question_content_revisions
IN SHARE ROW EXCLUSIVE MODE;

-- Remember whether this exact immutable blueprint was already public before
-- this transaction. A replay must never undo an operator's emergency
-- diagnostic_enabled=false switch; in that case the final resolver postcheck
-- fails closed without rewriting the switch.
CREATE TEMP TABLE tyt_turkce_diagnostic_release_control (
  had_released_blueprint boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO tyt_turkce_diagnostic_release_control(had_released_blueprint)
SELECT EXISTS (
  SELECT 1
  FROM public.adaptive_diagnostic_blueprints AS blueprint
  WHERE blueprint.blueprint_version = 'ba-tyt-turkce-diagnostic-v1'
    AND blueprint.capability_status = 'released'
);

-- The public registry is immutable at the scope/taxonomy level.  Only the
-- exact already-released row may have its diagnostic capability enabled by
-- this migration; a drifted or retired row is a hard stop.
DO $fn$
DECLARE
  v_scope public.curriculum_scope_releases%ROWTYPE;
BEGIN
  SELECT * INTO v_scope
  FROM public.curriculum_scope_releases AS scope
  WHERE scope.game = 'turkce'
    AND scope.display_exam_ref = 'TYT'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TYT Turkish registry scope is missing'
      USING ERRCODE = '55000';
  END IF;

  IF v_scope.question_exam_ref IS DISTINCT FROM 'TYT'
    OR v_scope.taxonomy_version IS DISTINCT FROM 'ba-tyt-turkce-v2'
    OR v_scope.mapping_mode IS DISTINCT FROM 'category_proxy'
    OR v_scope.release_status IS DISTINCT FROM 'released'
    OR v_scope.released_at IS NULL THEN
    RAISE EXCEPTION 'TYT Turkish registry scope drifted: %', to_jsonb(v_scope)
      USING ERRCODE = '23514';
  END IF;
END
$fn$;

-- The blueprint is intentionally tied to exactly the five v2 Turkish
-- categories.  One active outcome per category prevents a broad or duplicate
-- graph from being mistaken for diagnostic coverage.
DO $fn$
DECLARE
  v_outcome_count integer;
  v_distinct_category_count integer;
  v_bad_category_count integer;
BEGIN
  SELECT count(*)::integer, count(DISTINCT outcome.category::text)::integer
  INTO v_outcome_count, v_distinct_category_count
  FROM public.curriculum_outcomes AS outcome
  JOIN public.curriculum_nodes AS node ON node.id = outcome.node_id
  WHERE outcome.game = 'turkce'
    AND outcome.exam_ref = 'TYT'
    AND outcome.taxonomy_version = 'ba-tyt-turkce-v2'
    AND outcome.is_active
    AND node.is_active
    AND node.node_type = 'outcome'
    AND node.game IS NOT DISTINCT FROM outcome.game
    AND node.exam_ref IS NOT DISTINCT FROM outcome.exam_ref
    AND node.taxonomy_version IS NOT DISTINCT FROM outcome.taxonomy_version
    AND node.category IS NOT DISTINCT FROM outcome.category;

  SELECT count(*)::integer INTO v_bad_category_count
  FROM (
    SELECT outcome.category::text
    FROM public.curriculum_outcomes AS outcome
    JOIN public.curriculum_nodes AS node ON node.id = outcome.node_id
    WHERE outcome.game = 'turkce'
      AND outcome.exam_ref = 'TYT'
      AND outcome.taxonomy_version = 'ba-tyt-turkce-v2'
      AND outcome.is_active
      AND node.is_active
      AND node.node_type = 'outcome'
      AND node.game IS NOT DISTINCT FROM outcome.game
      AND node.exam_ref IS NOT DISTINCT FROM outcome.exam_ref
      AND node.taxonomy_version IS NOT DISTINCT FROM outcome.taxonomy_version
      AND node.category IS NOT DISTINCT FROM outcome.category
    GROUP BY outcome.category
    HAVING count(*) <> 1
       OR outcome.category::text NOT IN (
         'paragraf', 'dil_bilgisi', 'sozcuk', 'anlam_bilgisi',
         'yazim_kurallari'
       )
  ) AS invalid_categories;

  IF v_outcome_count <> 5
    OR v_distinct_category_count <> 5
    OR v_bad_category_count <> 0 THEN
    RAISE EXCEPTION
      'TYT Turkish diagnostic requires exactly five canonical outcomes; count %, distinct %, invalid groups %',
      v_outcome_count, v_distinct_category_count, v_bad_category_count
      USING ERRCODE = '23514';
  END IF;
END
$fn$;

-- Insert-only for a fresh install.  A conflicting exact row is examined below;
-- it is never silently overwritten.
INSERT INTO public.adaptive_diagnostic_blueprints (
  blueprint_version, game, display_exam_ref, question_exam_ref,
  taxonomy_version, policy_version, question_count, outcome_count,
  max_per_outcome, candidate_gate_version, requires_revision_snapshot,
  capability_status, released_at
)
SELECT
  'ba-tyt-turkce-diagnostic-v1', 'turkce', 'TYT', 'TYT',
  'ba-tyt-turkce-v2', 'adaptive-screening-v1', 10, 5, 2,
  'exact-single-outcome-v1', true, 'validating', NULL
WHERE EXISTS (
  SELECT 1
  FROM public.curriculum_scope_releases AS scope
  WHERE scope.game = 'turkce'
    AND scope.display_exam_ref = 'TYT'
    AND scope.question_exam_ref = 'TYT'
    AND scope.taxonomy_version = 'ba-tyt-turkce-v2'
    AND scope.release_status = 'released'
)
ON CONFLICT (blueprint_version) DO NOTHING;

DO $fn$
DECLARE
  v_blueprint public.adaptive_diagnostic_blueprints%ROWTYPE;
  v_other_released integer;
BEGIN
  SELECT count(*)::integer INTO v_other_released
  FROM public.adaptive_diagnostic_blueprints AS blueprint
  WHERE blueprint.game = 'turkce'
    AND blueprint.display_exam_ref = 'TYT'
    AND blueprint.capability_status = 'released'
    AND blueprint.blueprint_version <> 'ba-tyt-turkce-diagnostic-v1';
  IF v_other_released <> 0 THEN
    RAISE EXCEPTION 'another released TYT Turkish diagnostic blueprint exists'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_blueprint
  FROM public.adaptive_diagnostic_blueprints AS blueprint
  WHERE blueprint.blueprint_version = 'ba-tyt-turkce-diagnostic-v1'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TYT Turkish diagnostic blueprint insert was not applied'
      USING ERRCODE = '55000';
  END IF;

  IF v_blueprint.game IS DISTINCT FROM 'turkce'
    OR v_blueprint.display_exam_ref IS DISTINCT FROM 'TYT'
    OR v_blueprint.question_exam_ref IS DISTINCT FROM 'TYT'
    OR v_blueprint.taxonomy_version IS DISTINCT FROM 'ba-tyt-turkce-v2'
    OR v_blueprint.policy_version IS DISTINCT FROM 'adaptive-screening-v1'
    OR v_blueprint.question_count IS DISTINCT FROM 10
    OR v_blueprint.outcome_count IS DISTINCT FROM 5
    OR v_blueprint.max_per_outcome IS DISTINCT FROM 2
    OR v_blueprint.candidate_gate_version IS DISTINCT FROM 'exact-single-outcome-v1'
    OR NOT v_blueprint.requires_revision_snapshot
    OR v_blueprint.capability_status = 'retired'
    OR (v_blueprint.capability_status = 'released' AND v_blueprint.released_at IS NULL)
    OR (v_blueprint.capability_status IN ('draft','validating') AND v_blueprint.released_at IS NOT NULL) THEN
    RAISE EXCEPTION 'TYT Turkish diagnostic blueprint drifted: %', to_jsonb(v_blueprint)
      USING ERRCODE = '23514';
  END IF;

  -- A draft may be resumed, but a released row is not rewritten.
  IF v_blueprint.capability_status = 'draft' THEN
    UPDATE public.adaptive_diagnostic_blueprints
    SET capability_status = 'validating', updated_at = clock_timestamp()
    WHERE blueprint_version = v_blueprint.blueprint_version
      AND capability_status = 'draft';
  END IF;
END
$fn$;

-- This shared gate checks published revision hashes, exact one-outcome
-- mappings, clean curriculum integrity, and capacity.  With five outcomes,
-- max_per_outcome=2 and capacity >=10, every outcome necessarily has at least
-- two exact revision-bound candidates.
DO $fn$
DECLARE
  v_integrity jsonb;
  v_blueprint public.adaptive_diagnostic_blueprints%ROWTYPE;
  v_outcome_count integer;
  v_min_candidate_count integer;
  v_candidate_capacity integer;
  v_empty_candidate_outcomes integer;
BEGIN
  SELECT * INTO v_blueprint
  FROM public.adaptive_diagnostic_blueprints
  WHERE blueprint_version = 'ba-tyt-turkce-diagnostic-v1'
  FOR SHARE;

  v_integrity := public.adaptive_diagnostic_scope_integrity(
    v_blueprint.game, v_blueprint.display_exam_ref,
    v_blueprint.blueprint_version
  );

  IF v_blueprint.capability_status <> 'released'
    AND (
      v_integrity IS NULL
      OR jsonb_typeof(v_integrity) <> 'object'
      OR NOT COALESCE((v_integrity->>'clean')::boolean, false)
      OR (v_integrity->>'outcomeCount')::integer <> 5
      OR (v_integrity->>'expectedOutcomeCount')::integer <> 5
      OR (v_integrity->>'emptyCandidateOutcome')::integer <> 0
      OR (v_integrity->>'candidateCapacity')::integer < 10
    ) THEN
    RAISE EXCEPTION 'TYT Turkish diagnostic candidate proof failed: %', v_integrity
      USING ERRCODE = '23514';
  END IF;

  -- The shared integrity function deliberately serves every registered
  -- subject.  This release adds the stricter Turkish proof: only a primary
  -- taxonomy-auto mapping to one exact outcome, backed by the published TYT
  -- revision snapshot, may contribute to the ten-question screen.
  WITH scope_outcomes AS (
    SELECT outcome.id
    FROM public.curriculum_outcomes AS outcome
    JOIN public.curriculum_nodes AS node ON node.id = outcome.node_id
    WHERE outcome.is_active
      AND node.is_active
      AND node.node_type = 'outcome'
      AND outcome.game = 'turkce'
      AND outcome.exam_ref = 'TYT'
      AND outcome.taxonomy_version = 'ba-tyt-turkce-v2'
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
      AND question.game = 'turkce'
      AND upper(btrim(COALESCE(question.exam_ref, ''))) = 'TYT'
      AND outcome.is_active
      AND node.is_active
      AND node.node_type = 'outcome'
      AND outcome.game = 'turkce'
      AND outcome.exam_ref = 'TYT'
      AND outcome.taxonomy_version = 'ba-tyt-turkce-v2'
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
    SELECT outcome.id,
      count(DISTINCT candidate.question_id)::integer AS candidate_count
    FROM scope_outcomes AS outcome
    LEFT JOIN exact_candidates AS candidate ON candidate.outcome_id = outcome.id
    GROUP BY outcome.id
  )
  SELECT count(*)::integer,
    COALESCE(min(candidate_count), 0)::integer,
    COALESCE(sum(least(candidate_count, 2)), 0)::integer,
    count(*) FILTER (WHERE candidate_count = 0)::integer
  INTO v_outcome_count, v_min_candidate_count,
    v_candidate_capacity, v_empty_candidate_outcomes
  FROM coverage;

  IF v_outcome_count <> 5
    OR v_min_candidate_count < 2
    OR v_candidate_capacity < 10
    OR v_empty_candidate_outcomes <> 0 THEN
    RAISE EXCEPTION
      'TYT Turkish diagnostic exact candidate proof failed (outcomes %, min %, capacity %, empty %)',
      v_outcome_count, v_min_candidate_count,
      v_candidate_capacity, v_empty_candidate_outcomes
      USING ERRCODE = '23514';
  END IF;
END
$fn$;

-- Publish the blueprint only from validating.  A replay of an already
-- released blueprint performs no update and therefore preserves its snapshot.
UPDATE public.adaptive_diagnostic_blueprints
SET capability_status = 'released',
    released_at = clock_timestamp(),
    updated_at = clock_timestamp()
WHERE blueprint_version = 'ba-tyt-turkce-diagnostic-v1'
  AND capability_status = 'validating';

-- Enabling the diagnostic is the final capability change, after all proofs.
UPDATE public.curriculum_scope_releases AS scope
SET diagnostic_enabled = true,
    updated_at = clock_timestamp()
WHERE scope.game = 'turkce'
  AND scope.display_exam_ref = 'TYT'
  AND scope.question_exam_ref = 'TYT'
  AND scope.taxonomy_version = 'ba-tyt-turkce-v2'
  AND scope.release_status = 'released'
  AND NOT (SELECT had_released_blueprint FROM tyt_turkce_diagnostic_release_control)
  AND scope.diagnostic_enabled IS DISTINCT FROM true;

DO $fn$
DECLARE
  v_scope jsonb;
  v_integrity jsonb;
  v_emergency_disabled boolean;
BEGIN
  v_emergency_disabled := (
    SELECT had_released_blueprint FROM tyt_turkce_diagnostic_release_control
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.curriculum_scope_releases AS scope
    WHERE scope.game = 'turkce'
      AND scope.display_exam_ref = 'TYT'
      AND scope.question_exam_ref = 'TYT'
      AND scope.taxonomy_version = 'ba-tyt-turkce-v2'
      AND scope.release_status = 'released'
      AND scope.diagnostic_enabled
  );

  v_scope := public.resolve_released_diagnostic_scope('turkce', 'TYT');
  IF v_emergency_disabled THEN
    IF v_scope IS NOT NULL THEN
      RAISE EXCEPTION 'TYT Turkish emergency diagnostic disable was not preserved'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF v_scope IS NULL
      OR v_scope->>'game' IS DISTINCT FROM 'turkce'
      OR v_scope->>'displayExamRef' IS DISTINCT FROM 'TYT'
      OR v_scope->>'questionExamRef' IS DISTINCT FROM 'TYT'
      OR v_scope->>'taxonomyVersion' IS DISTINCT FROM 'ba-tyt-turkce-v2'
      OR v_scope->>'policyVersion' IS DISTINCT FROM 'adaptive-screening-v1'
      OR (v_scope->>'questionCount')::integer <> 10
      OR (v_scope->>'outcomeCount')::integer <> 5
      OR (v_scope->>'maxPerOutcome')::integer <> 2 THEN
      RAISE EXCEPTION 'TYT Turkish diagnostic resolver postcheck failed: %', v_scope
        USING ERRCODE = '23514';
    END IF;
  END IF;

  v_integrity := public.adaptive_diagnostic_scope_integrity(
    'turkce', 'TYT', 'ba-tyt-turkce-diagnostic-v1'
  );
  IF NOT COALESCE((v_integrity->>'clean')::boolean, false)
    OR (v_integrity->>'candidateCapacity')::integer < 10
    OR (v_integrity->>'emptyCandidateOutcome')::integer <> 0 THEN
    RAISE EXCEPTION 'TYT Turkish diagnostic final integrity postcheck failed: %', v_integrity
      USING ERRCODE = '23514';
  END IF;

  IF has_table_privilege('service_role', 'public.adaptive_diagnostic_blueprints', 'SELECT')
    OR has_function_privilege('anon', 'public.resolve_released_diagnostic_scope(text,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.resolve_released_diagnostic_scope(text,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.start_adaptive_diagnostic_v3(uuid,uuid,text,text,uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.start_adaptive_diagnostic_v3(uuid,uuid,text,text,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.resolve_released_diagnostic_scope(text,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.start_adaptive_diagnostic_v3(uuid,uuid,text,text,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.record_adaptive_diagnostic_answer_v3(uuid,uuid,uuid,smallint,integer,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TYT Turkish diagnostic ACL postcheck failed'
      USING ERRCODE = '42501';
  END IF;
END
$fn$;

NOTIFY pgrst, 'reload schema';
COMMIT;
