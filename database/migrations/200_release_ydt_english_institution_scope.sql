-- Migration 200: release institution analysis for the internal Wordquest
-- English skill scope only.
--
-- This capability is intentionally narrower than the diagnostic release:
-- student and cohort analysis are enabled, while durable reports and study
-- programs remain disabled until their app consumers have their own proof.
-- The scope is an internal skill taxonomy, not an official YDT blueprint.

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

-- Capture every already-known non-target capability row.  This migration is
-- allowed to add exactly one Wordquest row and must leave all other game
-- scopes byte-for-byte unchanged.
CREATE TEMP TABLE ydt_english_institution_non_target_snapshot
ON COMMIT DROP AS
SELECT *
FROM public.institution_scope_capabilities
WHERE game <> 'wordquest';

CREATE TEMP TABLE ydt_english_institution_release_control (
  already_released boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO ydt_english_institution_release_control(already_released)
SELECT EXISTS (
  SELECT 1
  FROM public.institution_scope_capabilities AS capability
  WHERE capability.game = 'wordquest'
    AND capability.display_exam_ref = 'YDT'
    AND capability.question_exam_ref IS NULL
    AND capability.taxonomy_version = 'ba-ydt-eng-v1'
    AND capability.scope_policy_version = 'institution-scope-v1'
    AND capability.capability_status = 'released'
    AND capability.student_analysis_enabled
    AND capability.aggregate_enabled
    AND NOT capability.report_enabled
    AND NOT capability.program_enabled
    AND capability.released_at IS NOT NULL
);

DO $precheck$
DECLARE
  v_scope public.curriculum_scope_releases%ROWTYPE;
  v_integrity jsonb;
  v_diagnostic_integrity jsonb;
  v_diagnostic_scope jsonb;
  v_already_released boolean;
BEGIN
  SELECT already_released INTO v_already_released
  FROM ydt_english_institution_release_control;

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

  IF NOT v_scope.diagnostic_enabled AND NOT v_already_released THEN
    RAISE EXCEPTION 'first internal Wordquest institution release requires diagnostic_enabled=true'
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
    RAISE EXCEPTION 'internal Wordquest English institution scope integrity is not clean: %', v_integrity
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
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
  ) THEN
    RAISE EXCEPTION 'internal Wordquest institution release requires its immutable diagnostic blueprint'
      USING ERRCODE = '23514';
  END IF;

  v_diagnostic_integrity := public.adaptive_diagnostic_scope_integrity(
    'wordquest', 'YDT', 'ba-ydt-eng-diagnostic-v1'
  );
  IF NOT COALESCE((v_diagnostic_integrity->>'clean')::boolean, false)
    OR COALESCE((v_diagnostic_integrity->>'outcomeCount')::integer, -1) <> 7
    OR COALESCE((v_diagnostic_integrity->>'candidateCapacity')::integer, -1) < 10
    OR COALESCE((v_diagnostic_integrity->>'emptyCandidateOutcome')::integer, -1) <> 0 THEN
    RAISE EXCEPTION 'internal Wordquest institution diagnostic integrity failed: %', v_diagnostic_integrity
      USING ERRCODE = '23514';
  END IF;

  v_diagnostic_scope := public.resolve_released_diagnostic_scope('wordquest', 'YDT');
  IF v_scope.diagnostic_enabled THEN
    IF v_diagnostic_scope IS NULL
      OR v_diagnostic_scope->>'game' IS DISTINCT FROM 'wordquest'
      OR v_diagnostic_scope->>'displayExamRef' IS DISTINCT FROM 'YDT'
      OR v_diagnostic_scope->'questionExamRef' IS DISTINCT FROM 'null'::jsonb
      OR v_diagnostic_scope->>'taxonomyVersion' IS DISTINCT FROM 'ba-ydt-eng-v1'
      OR v_diagnostic_scope->>'policyVersion' IS DISTINCT FROM 'adaptive-screening-v1'
      OR (v_diagnostic_scope->>'questionCount')::integer <> 10
      OR (v_diagnostic_scope->>'outcomeCount')::integer <> 7
      OR (v_diagnostic_scope->>'maxPerOutcome')::integer <> 2 THEN
      RAISE EXCEPTION 'internal Wordquest institution release requires its exact diagnostic proof'
        USING ERRCODE = '23514';
    END IF;
  ELSIF v_diagnostic_scope IS NOT NULL THEN
    RAISE EXCEPTION 'internal Wordquest emergency diagnostic disable was not preserved during institution replay'
      USING ERRCODE = '23514';
  END IF;
END;
$precheck$;

INSERT INTO public.institution_scope_capabilities (
  game, display_exam_ref, question_exam_ref, taxonomy_version,
  capability_status, scope_policy_version,
  student_analysis_enabled, aggregate_enabled, report_enabled,
  program_enabled, released_at
)
VALUES (
  'wordquest', 'YDT', NULL, 'ba-ydt-eng-v1',
  'draft', 'institution-scope-v1',
  true, true, false, false, NULL
)
ON CONFLICT (game, display_exam_ref) DO NOTHING;

DO $release$
DECLARE
  v_capability public.institution_scope_capabilities%ROWTYPE;
  v_updated integer;
BEGIN
  SELECT * INTO v_capability
  FROM public.institution_scope_capabilities AS capability
  WHERE capability.game = 'wordquest'
    AND capability.display_exam_ref = 'YDT'
  FOR UPDATE;

  IF NOT FOUND
    OR v_capability.question_exam_ref IS NOT NULL
    OR v_capability.taxonomy_version <> 'ba-ydt-eng-v1'
    OR v_capability.scope_policy_version <> 'institution-scope-v1'
    OR NOT v_capability.student_analysis_enabled
    OR NOT v_capability.aggregate_enabled
    OR v_capability.report_enabled
    OR v_capability.program_enabled
    OR v_capability.capability_status NOT IN ('draft', 'validating', 'released')
    OR (v_capability.capability_status IN ('draft','validating') AND v_capability.released_at IS NOT NULL)
    OR (v_capability.capability_status = 'released' AND v_capability.released_at IS NULL) THEN
    RAISE EXCEPTION 'internal Wordquest English institution capability drifted'
      USING ERRCODE = '23514';
  END IF;

  IF v_capability.capability_status = 'draft' THEN
    UPDATE public.institution_scope_capabilities
    SET capability_status = 'validating', updated_at = clock_timestamp()
    WHERE game = 'wordquest' AND display_exam_ref = 'YDT';
  END IF;

  IF v_capability.capability_status = 'released' THEN
    RETURN;
  END IF;

  UPDATE public.institution_scope_capabilities
  SET capability_status = 'released',
      released_at = COALESCE(released_at, clock_timestamp()),
      updated_at = clock_timestamp()
  WHERE game = 'wordquest'
    AND display_exam_ref = 'YDT'
    AND question_exam_ref IS NULL
    AND taxonomy_version = 'ba-ydt-eng-v1'
    AND scope_policy_version = 'institution-scope-v1'
    AND capability_status = 'validating'
    AND student_analysis_enabled
    AND aggregate_enabled
    AND NOT report_enabled
    AND NOT program_enabled;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'internal Wordquest English institution capability was not released'
      USING ERRCODE = '55000';
  END IF;
END;
$release$;

DO $postcheck$
DECLARE
  v_scope jsonb;
  v_aggregate_scope jsonb;
  v_capability public.institution_scope_capabilities%ROWTYPE;
  v_program_members_definition text;
BEGIN
  IF (SELECT count(*) FROM ydt_english_institution_non_target_snapshot)
      <> (SELECT count(*) FROM public.institution_scope_capabilities WHERE game <> 'wordquest')
    OR EXISTS (
      SELECT * FROM ydt_english_institution_non_target_snapshot
      EXCEPT
      SELECT * FROM public.institution_scope_capabilities WHERE game <> 'wordquest'
    )
    OR EXISTS (
      SELECT * FROM public.institution_scope_capabilities WHERE game <> 'wordquest'
      EXCEPT
      SELECT * FROM ydt_english_institution_non_target_snapshot
    ) THEN
    RAISE EXCEPTION 'non-target institution capability snapshot changed'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_capability
  FROM public.institution_scope_capabilities AS capability
  WHERE capability.game = 'wordquest'
    AND capability.display_exam_ref = 'YDT'
    AND capability.capability_status = 'released';

  IF NOT FOUND
    OR v_capability.question_exam_ref IS NOT NULL
    OR v_capability.taxonomy_version <> 'ba-ydt-eng-v1'
    OR v_capability.scope_policy_version <> 'institution-scope-v1'
    OR NOT v_capability.student_analysis_enabled
    OR NOT v_capability.aggregate_enabled
    OR v_capability.report_enabled
    OR v_capability.program_enabled THEN
    RAISE EXCEPTION 'internal Wordquest English institution capability postcheck failed'
      USING ERRCODE = '55000';
  END IF;

  v_scope := public.resolve_released_institution_scope('wordquest', 'YDT');
  IF v_scope IS NULL
    OR v_scope->>'game' <> 'wordquest'
    OR v_scope->>'displayExamRef' <> 'YDT'
    OR v_scope->'questionExamRef' IS DISTINCT FROM 'null'::jsonb
    OR v_scope->>'taxonomyVersion' <> 'ba-ydt-eng-v1'
    OR v_scope->>'scopePolicyVersion' <> 'institution-scope-v1' THEN
    RAISE EXCEPTION 'internal Wordquest English institution resolver postcheck failed: %', v_scope
      USING ERRCODE = '55000';
  END IF;

  v_aggregate_scope := public.institution_scope_capability_snapshot(
    'wordquest', 'YDT', 'aggregate'
  );
  IF v_aggregate_scope IS NULL
    OR v_aggregate_scope->>'taxonomyVersion' <> 'ba-ydt-eng-v1'
    OR v_aggregate_scope->>'scopePolicyVersion' <> 'institution-scope-v1' THEN
    RAISE EXCEPTION 'internal Wordquest English aggregate capability postcheck failed'
      USING ERRCODE = '55000';
  END IF;

  v_program_members_definition := pg_get_functiondef(
    'public.get_institution_classroom_published_program_members_v2(uuid,uuid,text,text,timestamptz,timestamptz)'::regprocedure
  );
  IF position('institution_scope_capability_snapshot' IN v_program_members_definition) = 0
    OR position('''aggregate''' IN v_program_members_definition) = 0
    OR position('''program''' IN v_program_members_definition) > 0 THEN
    RAISE EXCEPTION 'internal Wordquest aggregate read capability contract drifted'
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
    OR NOT has_function_privilege('service_role', 'public.list_released_institution_scopes()', 'EXECUTE')
    OR has_function_privilege(
      'anon',
      'public.get_institution_student_learning_analysis_v2(uuid,uuid,text,text,text,timestamptz)',
      'EXECUTE'
    ) OR NOT has_function_privilege(
      'authenticated',
      'public.get_institution_student_learning_analysis_v2(uuid,uuid,text,text,text,timestamptz)',
      'EXECUTE'
    ) OR NOT has_function_privilege(
      'service_role',
      'public.get_institution_student_learning_analysis_v2(uuid,uuid,text,text,text,timestamptz)',
      'EXECUTE'
    ) THEN
    RAISE EXCEPTION 'internal Wordquest English institution ACL postcheck failed'
      USING ERRCODE = '42501';
  END IF;
END;
$postcheck$;

NOTIFY pgrst, 'reload schema';
COMMIT;
