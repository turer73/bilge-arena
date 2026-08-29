-- Migration 198: release TYT Turkish institution analysis/aggregate scope.
--
-- Institution evidence is a separate capability from learner mastery.  This
-- migration enables only analysis and privacy-safe aggregate reads. Reports
-- and study programs remain disabled until their own proof migrations exist.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

LOCK TABLE
  public.curriculum_scope_releases,
  public.institution_scope_capabilities,
  public.curriculum_nodes,
  public.curriculum_outcomes,
  public.questions,
  public.question_outcomes,
  public.question_content_revisions,
  public.adaptive_diagnostic_blueprints
IN SHARE ROW EXCLUSIVE MODE;

-- Keep a transaction-local snapshot of every other institution capability. A
-- later proof migration must not accidentally rewrite an existing scope.
CREATE TEMP TABLE institution_scope_capability_other_snapshot ON COMMIT DROP AS
SELECT game, display_exam_ref, question_exam_ref, taxonomy_version,
  capability_status, scope_policy_version, student_analysis_enabled,
  aggregate_enabled, report_enabled, program_enabled, released_at,
  created_at, updated_at
FROM public.institution_scope_capabilities
WHERE NOT (game = 'turkce' AND display_exam_ref = 'TYT');

CREATE TEMP TABLE tyt_turkce_institution_release_control (
  already_released boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO tyt_turkce_institution_release_control(already_released)
SELECT EXISTS (
  SELECT 1
  FROM public.institution_scope_capabilities AS capability
  WHERE capability.game = 'turkce'
    AND capability.display_exam_ref = 'TYT'
    AND capability.question_exam_ref = 'TYT'
    AND capability.taxonomy_version = 'ba-tyt-turkce-v2'
    AND capability.scope_policy_version = 'institution-scope-v1'
    AND capability.capability_status = 'released'
    AND capability.student_analysis_enabled
    AND capability.aggregate_enabled
    AND NOT capability.report_enabled
    AND NOT capability.program_enabled
    AND capability.released_at IS NOT NULL
);

DO $fn$
DECLARE
  v_scope public.curriculum_scope_releases%ROWTYPE;
  v_integrity jsonb;
  v_diagnostic_integrity jsonb;
  v_diagnostic_scope jsonb;
  v_already_released boolean;
BEGIN
  SELECT already_released INTO v_already_released
  FROM tyt_turkce_institution_release_control;

  SELECT * INTO v_scope
  FROM public.curriculum_scope_releases AS scope
  WHERE scope.game = 'turkce'
    AND scope.display_exam_ref = 'TYT'
  FOR SHARE;

  IF NOT FOUND
    OR v_scope.question_exam_ref IS DISTINCT FROM 'TYT'
    OR v_scope.taxonomy_version IS DISTINCT FROM 'ba-tyt-turkce-v2'
    OR v_scope.mapping_mode IS DISTINCT FROM 'category_proxy'
    OR v_scope.release_status IS DISTINCT FROM 'released'
    OR v_scope.released_at IS NULL THEN
    RAISE EXCEPTION 'released TYT Turkish mastery scope is required for institution proof'
      USING ERRCODE = '55000';
  END IF;

  IF NOT v_scope.diagnostic_enabled AND NOT v_already_released THEN
    RAISE EXCEPTION 'first TYT Turkish institution release requires diagnostic_enabled=true'
      USING ERRCODE = '55000';
  END IF;

  v_integrity := public.curriculum_scope_integrity(
    v_scope.game, v_scope.display_exam_ref, v_scope.taxonomy_version
  );
  IF NOT public.institution_scope_integrity_is_clean(v_integrity) THEN
    RAISE EXCEPTION 'TYT Turkish institution scope failed curriculum integrity: %', v_integrity
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.adaptive_diagnostic_blueprints AS blueprint
    WHERE blueprint.blueprint_version = 'ba-tyt-turkce-diagnostic-v1'
      AND blueprint.game = 'turkce'
      AND blueprint.display_exam_ref = 'TYT'
      AND blueprint.question_exam_ref = 'TYT'
      AND blueprint.taxonomy_version = 'ba-tyt-turkce-v2'
      AND blueprint.policy_version = 'adaptive-screening-v1'
      AND blueprint.question_count = 10
      AND blueprint.outcome_count = 5
      AND blueprint.max_per_outcome = 2
      AND blueprint.candidate_gate_version = 'exact-single-outcome-v1'
      AND blueprint.requires_revision_snapshot
      AND blueprint.capability_status = 'released'
      AND blueprint.released_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'TYT Turkish institution release requires its immutable diagnostic blueprint'
      USING ERRCODE = '23514';
  END IF;

  v_diagnostic_integrity := public.adaptive_diagnostic_scope_integrity(
    'turkce', 'TYT', 'ba-tyt-turkce-diagnostic-v1'
  );
  IF NOT COALESCE((v_diagnostic_integrity->>'clean')::boolean, false)
    OR COALESCE((v_diagnostic_integrity->>'outcomeCount')::integer, -1) <> 5
    OR COALESCE((v_diagnostic_integrity->>'candidateCapacity')::integer, -1) < 10
    OR COALESCE((v_diagnostic_integrity->>'emptyCandidateOutcome')::integer, -1) <> 0 THEN
    RAISE EXCEPTION 'TYT Turkish institution diagnostic integrity failed: %', v_diagnostic_integrity
      USING ERRCODE = '23514';
  END IF;

  v_diagnostic_scope := public.resolve_released_diagnostic_scope('turkce', 'TYT');
  IF v_scope.diagnostic_enabled THEN
    IF v_diagnostic_scope IS NULL
      OR v_diagnostic_scope->>'questionExamRef' IS DISTINCT FROM 'TYT'
      OR v_diagnostic_scope->>'taxonomyVersion' IS DISTINCT FROM 'ba-tyt-turkce-v2'
      OR v_diagnostic_scope->>'policyVersion' IS DISTINCT FROM 'adaptive-screening-v1'
      OR (v_diagnostic_scope->>'questionCount')::integer <> 10
      OR (v_diagnostic_scope->>'outcomeCount')::integer <> 5
      OR (v_diagnostic_scope->>'maxPerOutcome')::integer <> 2 THEN
      RAISE EXCEPTION 'TYT Turkish institution release requires its exact diagnostic proof'
        USING ERRCODE = '23514';
    END IF;
  ELSIF v_diagnostic_scope IS NOT NULL THEN
    RAISE EXCEPTION 'TYT Turkish emergency diagnostic disable was not preserved during institution replay'
      USING ERRCODE = '23514';
  END IF;
END
$fn$;

DO $fn$
DECLARE
  v_capability public.institution_scope_capabilities%ROWTYPE;
BEGIN
  SELECT * INTO v_capability
  FROM public.institution_scope_capabilities AS capability
  WHERE capability.game = 'turkce'
    AND capability.display_exam_ref = 'TYT'
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.institution_scope_capabilities (
      game, display_exam_ref, question_exam_ref, taxonomy_version,
      capability_status, scope_policy_version,
      student_analysis_enabled, aggregate_enabled, report_enabled,
      program_enabled, released_at
    ) VALUES (
      'turkce', 'TYT', 'TYT', 'ba-tyt-turkce-v2',
      'validating', 'institution-scope-v1',
      true, true, false, false, NULL
    );
  ELSE
    IF v_capability.question_exam_ref IS DISTINCT FROM 'TYT'
      OR v_capability.taxonomy_version IS DISTINCT FROM 'ba-tyt-turkce-v2'
      OR v_capability.scope_policy_version IS DISTINCT FROM 'institution-scope-v1'
      OR NOT v_capability.student_analysis_enabled
      OR NOT v_capability.aggregate_enabled
      OR v_capability.report_enabled
      OR v_capability.program_enabled
      OR v_capability.capability_status = 'retired'
      OR (v_capability.capability_status = 'released' AND v_capability.released_at IS NULL)
      OR (v_capability.capability_status IN ('draft','validating') AND v_capability.released_at IS NOT NULL) THEN
      RAISE EXCEPTION 'TYT Turkish institution capability drifted: %', to_jsonb(v_capability)
        USING ERRCODE = '23514';
    END IF;

    -- Resume an interrupted proof without touching a released capability.
    IF v_capability.capability_status = 'draft' THEN
      UPDATE public.institution_scope_capabilities
      SET capability_status = 'validating', updated_at = clock_timestamp()
      WHERE game = 'turkce' AND display_exam_ref = 'TYT'
        AND capability_status = 'draft';
    END IF;
  END IF;
END
$fn$;

-- The aggregate read contract intentionally uses the aggregate capability;
-- this allows the overview surface to work while report/program capabilities
-- remain false.  Verify the RPC exists and keeps the established ACL boundary.
DO $fn$
DECLARE
  v_program_members_definition text;
BEGIN
  IF to_regprocedure('public.get_institution_classroom_published_program_members_v2(uuid,uuid,text,text,timestamptz,timestamptz)') IS NULL
    OR NOT has_function_privilege(
      'authenticated',
      'public.get_institution_classroom_published_program_members_v2(uuid,uuid,text,text,timestamptz,timestamptz)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role',
      'public.get_institution_classroom_published_program_members_v2(uuid,uuid,text,text,timestamptz,timestamptz)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'public.get_institution_classroom_published_program_members_v2(uuid,uuid,text,text,timestamptz,timestamptz)',
      'EXECUTE'
    ) THEN
    RAISE EXCEPTION 'institution aggregate read contract is missing or has unsafe ACL'
      USING ERRCODE = '42501';
  END IF;

  v_program_members_definition := pg_get_functiondef(
    'public.get_institution_classroom_published_program_members_v2(uuid,uuid,text,text,timestamptz,timestamptz)'::regprocedure
  );
  IF position('institution_scope_capability_snapshot' IN v_program_members_definition) = 0
    OR position('''aggregate''' IN v_program_members_definition) = 0
    OR position('''program''' IN v_program_members_definition) > 0 THEN
    RAISE EXCEPTION 'institution aggregate read capability contract drifted'
      USING ERRCODE = '23514';
  END IF;
END
$fn$;

UPDATE public.institution_scope_capabilities
SET capability_status = 'released',
    released_at = clock_timestamp(),
    updated_at = clock_timestamp()
WHERE game = 'turkce'
  AND display_exam_ref = 'TYT'
  AND capability_status = 'validating';

DO $fn$
DECLARE
  v_scope jsonb;
  v_list jsonb;
BEGIN
  v_scope := public.institution_scope_capability_snapshot(
    'turkce', 'TYT', 'analysis'
  );
  IF v_scope IS NULL
    OR v_scope->>'game' IS DISTINCT FROM 'turkce'
    OR v_scope->>'displayExamRef' IS DISTINCT FROM 'TYT'
    OR v_scope->>'questionExamRef' IS DISTINCT FROM 'TYT'
    OR v_scope->>'taxonomyVersion' IS DISTINCT FROM 'ba-tyt-turkce-v2'
    OR v_scope->>'scopePolicyVersion' IS DISTINCT FROM 'institution-scope-v1' THEN
    RAISE EXCEPTION 'TYT Turkish institution scope snapshot postcheck failed: %', v_scope
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.institution_scope_capabilities AS capability
    WHERE capability.game = 'turkce'
      AND capability.display_exam_ref = 'TYT'
      AND (NOT capability.student_analysis_enabled
        OR NOT capability.aggregate_enabled
        OR capability.report_enabled
        OR capability.program_enabled
        OR capability.capability_status <> 'released')
  ) THEN
    RAISE EXCEPTION 'TYT Turkish institution capability flags postcheck failed'
      USING ERRCODE = '23514';
  END IF;

  v_scope := public.resolve_released_institution_scope('turkce', 'TYT');
  IF v_scope IS NULL
    OR v_scope->>'taxonomyVersion' IS DISTINCT FROM 'ba-tyt-turkce-v2'
    OR v_scope->>'scopePolicyVersion' IS DISTINCT FROM 'institution-scope-v1' THEN
    RAISE EXCEPTION 'TYT Turkish institution resolver postcheck failed: %', v_scope
      USING ERRCODE = '23514';
  END IF;

  v_list := public.list_released_institution_scopes();
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_list) AS listed(scope)
    WHERE listed.scope->>'game' = 'turkce'
      AND listed.scope->>'displayExamRef' = 'TYT'
      AND listed.scope->>'taxonomyVersion' = 'ba-tyt-turkce-v2'
  ) THEN
    RAISE EXCEPTION 'TYT Turkish institution scope list postcheck failed: %', v_list
      USING ERRCODE = '23514';
  END IF;

  IF has_table_privilege('anon', 'public.institution_scope_capabilities', 'SELECT')
    OR has_table_privilege('authenticated', 'public.institution_scope_capabilities', 'SELECT')
    OR has_table_privilege('service_role', 'public.institution_scope_capabilities', 'SELECT')
    OR has_function_privilege('anon', 'public.resolve_released_institution_scope(text,text)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.resolve_released_institution_scope(text,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.resolve_released_institution_scope(text,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.list_released_institution_scopes()', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.list_released_institution_scopes()', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.list_released_institution_scopes()', 'EXECUTE') THEN
    RAISE EXCEPTION 'TYT Turkish institution scope ACL postcheck failed'
      USING ERRCODE = '42501';
  END IF;

  -- EXCEPT is NULL-safe and compares every persisted field of all other
  -- capabilities in both directions.
  IF EXISTS (
    SELECT game, display_exam_ref, question_exam_ref, taxonomy_version,
      capability_status, scope_policy_version, student_analysis_enabled,
      aggregate_enabled, report_enabled, program_enabled, released_at,
      created_at, updated_at
    FROM public.institution_scope_capabilities
    WHERE NOT (game = 'turkce' AND display_exam_ref = 'TYT')
    EXCEPT
    SELECT game, display_exam_ref, question_exam_ref, taxonomy_version,
      capability_status, scope_policy_version, student_analysis_enabled,
      aggregate_enabled, report_enabled, program_enabled, released_at,
      created_at, updated_at
    FROM institution_scope_capability_other_snapshot
  ) OR EXISTS (
    SELECT game, display_exam_ref, question_exam_ref, taxonomy_version,
      capability_status, scope_policy_version, student_analysis_enabled,
      aggregate_enabled, report_enabled, program_enabled, released_at,
      created_at, updated_at
    FROM institution_scope_capability_other_snapshot
    EXCEPT
    SELECT game, display_exam_ref, question_exam_ref, taxonomy_version,
      capability_status, scope_policy_version, student_analysis_enabled,
      aggregate_enabled, report_enabled, program_enabled, released_at,
      created_at, updated_at
    FROM public.institution_scope_capabilities
    WHERE NOT (game = 'turkce' AND display_exam_ref = 'TYT')
  ) THEN
    RAISE EXCEPTION 'other institution capability rows changed during TYT Turkish release'
      USING ERRCODE = '23514';
  END IF;
END
$fn$;

NOTIFY pgrst, 'reload schema';
COMMIT;
