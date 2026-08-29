-- Migration 196: release the exact TYT Fen institution analysis/aggregate scope.
--
-- Reports and program generation intentionally remain unavailable.  The
-- classroom overview reads published-program coverage through the aggregate
-- capability in migration 194, so an analysis/aggregate-only scope remains
-- usable without silently granting program creation.

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
  public.adaptive_diagnostic_blueprints,
  public.institution_scope_capabilities
IN SHARE ROW EXCLUSIVE MODE;

-- Capture all out-of-scope rows under the writer lock.  Replays are allowed
-- after later releases, but this migration itself must never rewrite another
-- subject's scope state.
CREATE TEMP TABLE fen_institution_other_scope_snapshot ON COMMIT DROP AS
SELECT
  scope.game, scope.display_exam_ref, scope.question_exam_ref,
  scope.taxonomy_version, scope.release_status, scope.mapping_mode,
  scope.diagnostic_enabled, scope.released_at, scope.created_at, scope.updated_at
FROM public.curriculum_scope_releases AS scope
WHERE scope.game <> 'fen';

CREATE TEMP TABLE fen_institution_other_capability_snapshot ON COMMIT DROP AS
SELECT
  capability.game, capability.display_exam_ref, capability.question_exam_ref,
  capability.taxonomy_version, capability.capability_status,
  capability.scope_policy_version, capability.student_analysis_enabled,
  capability.aggregate_enabled, capability.report_enabled, capability.program_enabled,
  capability.released_at, capability.created_at, capability.updated_at
FROM public.institution_scope_capabilities AS capability
WHERE capability.game <> 'fen';

CREATE TEMP TABLE fen_institution_release_control (
  already_released boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO fen_institution_release_control(already_released)
SELECT EXISTS (
  SELECT 1
  FROM public.institution_scope_capabilities AS capability
  WHERE capability.game = 'fen'
    AND capability.display_exam_ref = 'TYT'
    AND capability.question_exam_ref = 'TYT'
    AND capability.taxonomy_version = 'ba-tyt-fen-v1'
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
  v_capability public.institution_scope_capabilities%ROWTYPE;
  v_integrity jsonb;
  v_diagnostic_integrity jsonb;
  v_diagnostic_scope jsonb;
  v_already_released boolean;
BEGIN
  SELECT already_released INTO v_already_released
  FROM fen_institution_release_control;

  SELECT * INTO v_scope
  FROM public.curriculum_scope_releases AS scope
  WHERE scope.game = 'fen'
    AND scope.display_exam_ref = 'TYT'
    AND scope.question_exam_ref = 'TYT'
    AND scope.taxonomy_version = 'ba-tyt-fen-v1'
    AND scope.release_status = 'released'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'released TYT Fen scope is required for institution release'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_scope.diagnostic_enabled AND NOT v_already_released THEN
    RAISE EXCEPTION 'first TYT Fen institution release requires diagnostic_enabled=true'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.adaptive_diagnostic_blueprints AS blueprint
    WHERE blueprint.blueprint_version = 'ba-tyt-fen-diagnostic-v1'
      AND blueprint.game = 'fen'
      AND blueprint.display_exam_ref = 'TYT'
      AND blueprint.question_exam_ref = 'TYT'
      AND blueprint.taxonomy_version = 'ba-tyt-fen-v1'
      AND blueprint.policy_version = 'adaptive-screening-v1'
      AND blueprint.question_count = 10
      AND blueprint.outcome_count = 3
      AND blueprint.max_per_outcome = 4
      AND blueprint.candidate_gate_version = 'exact-single-outcome-v1'
      AND blueprint.requires_revision_snapshot
      AND blueprint.capability_status = 'released'
      AND blueprint.released_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'TYT Fen institution release requires its immutable diagnostic blueprint'
      USING ERRCODE = '23514';
  END IF;

  v_diagnostic_integrity := public.adaptive_diagnostic_scope_integrity(
    'fen', 'TYT', 'ba-tyt-fen-diagnostic-v1'
  );
  IF NOT COALESCE((v_diagnostic_integrity ->> 'clean')::boolean, false)
    OR COALESCE((v_diagnostic_integrity ->> 'outcomeCount')::integer, -1) <> 3
    OR COALESCE((v_diagnostic_integrity ->> 'candidateCapacity')::integer, -1) < 10
    OR COALESCE((v_diagnostic_integrity ->> 'emptyCandidateOutcome')::integer, -1) <> 0 THEN
    RAISE EXCEPTION 'TYT Fen institution diagnostic integrity failed: %', v_diagnostic_integrity
      USING ERRCODE = '23514';
  END IF;

  v_diagnostic_scope := public.resolve_released_diagnostic_scope('fen', 'TYT');
  IF v_scope.diagnostic_enabled THEN
    IF v_diagnostic_scope IS NULL
      OR v_diagnostic_scope ->> 'questionExamRef' IS DISTINCT FROM 'TYT'
      OR v_diagnostic_scope ->> 'taxonomyVersion' IS DISTINCT FROM 'ba-tyt-fen-v1'
      OR v_diagnostic_scope ->> 'policyVersion' IS DISTINCT FROM 'adaptive-screening-v1'
      OR COALESCE((v_diagnostic_scope ->> 'questionCount')::integer, -1) <> 10
      OR COALESCE((v_diagnostic_scope ->> 'outcomeCount')::integer, -1) <> 3
      OR COALESCE((v_diagnostic_scope ->> 'maxPerOutcome')::integer, -1) <> 4 THEN
      RAISE EXCEPTION 'TYT Fen institution release requires its exact diagnostic proof'
        USING ERRCODE = '23514';
    END IF;
  ELSIF v_diagnostic_scope IS NOT NULL THEN
    RAISE EXCEPTION 'TYT Fen emergency diagnostic disable was not preserved during institution replay'
      USING ERRCODE = '23514';
  END IF;

  v_integrity := public.curriculum_scope_integrity(
    v_scope.game, v_scope.display_exam_ref, v_scope.taxonomy_version
  );
  IF NOT public.institution_scope_integrity_is_clean(v_integrity) THEN
    RAISE EXCEPTION 'TYT Fen institution scope failed curriculum integrity proof: %', v_integrity
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.institution_scope_capabilities (
    game, display_exam_ref, question_exam_ref, taxonomy_version,
    capability_status, scope_policy_version,
    student_analysis_enabled, aggregate_enabled, report_enabled,
    program_enabled, released_at
  ) VALUES (
    'fen', 'TYT', 'TYT', 'ba-tyt-fen-v1',
    'validating', 'institution-scope-v1',
    true, true, false, false, NULL
  ) ON CONFLICT (game, display_exam_ref) DO NOTHING;

  SELECT * INTO v_capability
  FROM public.institution_scope_capabilities AS capability
  WHERE capability.game = 'fen'
    AND capability.display_exam_ref = 'TYT'
  FOR UPDATE;
  IF NOT FOUND
    OR v_capability.question_exam_ref IS DISTINCT FROM 'TYT'
    OR v_capability.taxonomy_version <> 'ba-tyt-fen-v1'
    OR v_capability.scope_policy_version <> 'institution-scope-v1'
    OR NOT v_capability.student_analysis_enabled
    OR NOT v_capability.aggregate_enabled
    OR v_capability.report_enabled
    OR v_capability.program_enabled
    OR v_capability.capability_status NOT IN ('validating', 'released')
    OR (v_capability.capability_status = 'validating' AND v_capability.released_at IS NOT NULL)
    OR (v_capability.capability_status = 'released' AND v_capability.released_at IS NULL) THEN
    RAISE EXCEPTION 'TYT Fen institution capability drifted from its release proof'
      USING ERRCODE = '23514';
  END IF;

  IF v_capability.capability_status = 'validating' THEN
    UPDATE public.institution_scope_capabilities
    SET capability_status = 'released',
        released_at = clock_timestamp(),
        updated_at = clock_timestamp()
    WHERE game = 'fen'
      AND display_exam_ref = 'TYT'
      AND capability_status = 'validating';
  END IF;
END;
$fn$;

DO $fn$
DECLARE
  v_scope jsonb;
  v_scopes jsonb;
  v_program_members_definition text;
  v_report_unavailable boolean := false;
  v_program_unavailable boolean := false;
  v_expected_diagnostic_enabled boolean;
BEGIN
  SELECT scope.diagnostic_enabled INTO v_expected_diagnostic_enabled
  FROM public.curriculum_scope_releases AS scope
  WHERE scope.game = 'fen'
    AND scope.display_exam_ref = 'TYT'
    AND scope.question_exam_ref = 'TYT'
    AND scope.taxonomy_version = 'ba-tyt-fen-v1'
    AND scope.release_status = 'released';

  v_scope := public.institution_scope_capability_snapshot('fen', 'TYT', 'analysis');
  IF v_scope ->> 'game' IS DISTINCT FROM 'fen'
    OR v_scope ->> 'displayExamRef' IS DISTINCT FROM 'TYT'
    OR v_scope ->> 'questionExamRef' IS DISTINCT FROM 'TYT'
    OR v_scope ->> 'taxonomyVersion' IS DISTINCT FROM 'ba-tyt-fen-v1'
    OR v_scope ->> 'scopePolicyVersion' IS DISTINCT FROM 'institution-scope-v1'
    OR v_scope ->> 'diagnosticEnabled' IS DISTINCT FROM v_expected_diagnostic_enabled::text THEN
    RAISE EXCEPTION 'TYT Fen institution resolver postcheck failed'
      USING ERRCODE = '23514';
  END IF;

  PERFORM public.institution_scope_capability_snapshot('fen', 'TYT', 'aggregate');
  BEGIN
    PERFORM public.institution_scope_capability_snapshot('fen', 'TYT', 'report');
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    v_report_unavailable := true;
  END;
  IF NOT v_report_unavailable THEN
    RAISE EXCEPTION 'TYT Fen report capability must remain disabled'
      USING ERRCODE = '23514';
  END IF;
  BEGIN
    PERFORM public.institution_scope_capability_snapshot('fen', 'TYT', 'program');
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    v_program_unavailable := true;
  END;
  IF NOT v_program_unavailable THEN
    RAISE EXCEPTION 'TYT Fen program capability must remain disabled'
      USING ERRCODE = '23514';
  END IF;

  v_scopes := public.list_released_institution_scopes();
  IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_scopes) AS listed(scope)
      WHERE listed.scope ->> 'game' = 'fen'
        AND listed.scope ->> 'displayExamRef' = 'TYT'
        AND listed.scope ->> 'questionExamRef' = 'TYT'
        AND listed.scope ->> 'taxonomyVersion' = 'ba-tyt-fen-v1'
        AND listed.scope ->> 'scopePolicyVersion' = 'institution-scope-v1'
    ) THEN
    RAISE EXCEPTION 'TYT Fen institution scope list postcheck failed'
      USING ERRCODE = '23514';
  END IF;

  -- Program coverage is a read-side aggregate used by overview.  Confirm the
  -- base V2 function still asks for aggregate, never program, before exposing
  -- a capability with program_enabled=false.
  v_program_members_definition := pg_get_functiondef(
    'public.get_institution_classroom_published_program_members_v2(uuid,uuid,text,text,timestamptz,timestamptz)'::regprocedure
  );
  IF position('institution_scope_capability_snapshot' IN v_program_members_definition) = 0
    OR position('''aggregate''' IN v_program_members_definition) = 0
    OR position('''program''' IN v_program_members_definition) > 0 THEN
    RAISE EXCEPTION 'institution overview program-members capability contract drifted'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
      (SELECT * FROM fen_institution_other_scope_snapshot)
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
      (SELECT * FROM fen_institution_other_scope_snapshot)
    ) OR EXISTS (
      (SELECT * FROM fen_institution_other_capability_snapshot)
      EXCEPT
      (SELECT capability.game, capability.display_exam_ref, capability.question_exam_ref,
        capability.taxonomy_version, capability.capability_status,
        capability.scope_policy_version, capability.student_analysis_enabled,
        capability.aggregate_enabled, capability.report_enabled, capability.program_enabled,
        capability.released_at, capability.created_at, capability.updated_at
       FROM public.institution_scope_capabilities AS capability
       WHERE capability.game <> 'fen')
    ) OR EXISTS (
      (SELECT capability.game, capability.display_exam_ref, capability.question_exam_ref,
        capability.taxonomy_version, capability.capability_status,
        capability.scope_policy_version, capability.student_analysis_enabled,
        capability.aggregate_enabled, capability.report_enabled, capability.program_enabled,
        capability.released_at, capability.created_at, capability.updated_at
       FROM public.institution_scope_capabilities AS capability
       WHERE capability.game <> 'fen')
      EXCEPT
      (SELECT * FROM fen_institution_other_capability_snapshot)
    ) THEN
    RAISE EXCEPTION 'TYT Fen institution release changed another subject scope state'
      USING ERRCODE = '23514';
  END IF;

  IF has_table_privilege('service_role', 'public.institution_scope_capabilities', 'SELECT')
    OR has_function_privilege('anon',
      'public.resolve_released_institution_scope(text,text)', 'EXECUTE')
    OR has_function_privilege('anon',
      'public.list_released_institution_scopes()', 'EXECUTE')
    OR NOT has_function_privilege('authenticated',
      'public.resolve_released_institution_scope(text,text)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated',
      'public.list_released_institution_scopes()', 'EXECUTE')
    OR NOT has_function_privilege('authenticated',
      'public.get_institution_classroom_published_program_members_v2(uuid,uuid,text,text,timestamptz,timestamptz)',
      'EXECUTE') THEN
    RAISE EXCEPTION 'TYT Fen institution ACL postcheck failed'
      USING ERRCODE = '42501';
  END IF;
END;
$fn$;

NOTIFY pgrst, 'reload schema';
COMMIT;
