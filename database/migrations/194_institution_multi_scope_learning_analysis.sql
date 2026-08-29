-- Migration 194: fail-closed, immutable institution curriculum scopes.
--
-- A public mastery release is not by itself permission to expose student
-- evidence to an institution. This migration adds a second, operation-aware
-- capability gate, snapshots the exact scope on durable reports/programs, and
-- introduces multi-scope analysis/aggregate RPCs. Only the already-supported
-- TYT Mathematics institution scope is released here. Every other subject
-- requires a later proof migration.

BEGIN;

CREATE TABLE IF NOT EXISTS public.institution_scope_capabilities (
  game varchar(20) NOT NULL,
  display_exam_ref varchar(20) NOT NULL,
  question_exam_ref varchar(20),
  taxonomy_version text NOT NULL,
  capability_status text NOT NULL DEFAULT 'draft'
    CHECK (capability_status IN ('draft', 'validating', 'released', 'retired')),
  scope_policy_version text NOT NULL
    CHECK (scope_policy_version ~ '^institution-scope-v[0-9]+$'),
  student_analysis_enabled boolean NOT NULL DEFAULT false,
  aggregate_enabled boolean NOT NULL DEFAULT false,
  report_enabled boolean NOT NULL DEFAULT false,
  program_enabled boolean NOT NULL DEFAULT false,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (game, display_exam_ref),
  FOREIGN KEY (game, display_exam_ref)
    REFERENCES public.curriculum_scope_releases(game, display_exam_ref)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK (game = lower(btrim(game)) AND game ~ '^[a-z][a-z0-9_]{1,19}$'),
  CHECK (display_exam_ref = upper(btrim(display_exam_ref))
    AND display_exam_ref ~ '^[A-Z0-9-]{2,10}$'),
  CHECK (question_exam_ref IS NULL OR (
    question_exam_ref = upper(btrim(question_exam_ref))
    AND question_exam_ref ~ '^[A-Z0-9-]{2,10}$'
  )),
  CHECK (taxonomy_version ~ '^ba-[a-z0-9-]+-v[0-9]+$'),
  CHECK (capability_status <> 'released' OR (
    released_at IS NOT NULL
    AND student_analysis_enabled
  ))
);

ALTER TABLE public.institution_scope_capabilities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.institution_scope_capabilities
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_guard_institution_scope_capability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'institution scope capability history is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.capability_status IN ('released', 'retired') AND (
    NEW.game IS DISTINCT FROM OLD.game
    OR NEW.display_exam_ref IS DISTINCT FROM OLD.display_exam_ref
    OR NEW.question_exam_ref IS DISTINCT FROM OLD.question_exam_ref
    OR NEW.taxonomy_version IS DISTINCT FROM OLD.taxonomy_version
    OR NEW.scope_policy_version IS DISTINCT FROM OLD.scope_policy_version
    OR NEW.student_analysis_enabled IS DISTINCT FROM OLD.student_analysis_enabled
    OR NEW.aggregate_enabled IS DISTINCT FROM OLD.aggregate_enabled
    OR NEW.report_enabled IS DISTINCT FROM OLD.report_enabled
    OR NEW.program_enabled IS DISTINCT FROM OLD.program_enabled
    OR NEW.released_at IS DISTINCT FROM OLD.released_at
  ) THEN
    RAISE EXCEPTION 'released institution scope proof is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NOT (
    NEW.capability_status = OLD.capability_status
    OR (OLD.capability_status = 'draft'
      AND NEW.capability_status IN ('validating', 'retired'))
    OR (OLD.capability_status = 'validating'
      AND NEW.capability_status IN ('released', 'retired'))
    OR (OLD.capability_status = 'released'
      AND NEW.capability_status = 'retired')
  ) THEN
    RAISE EXCEPTION 'invalid institution scope capability transition'
      USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS institution_scope_capability_guard
  ON public.institution_scope_capabilities;
CREATE TRIGGER institution_scope_capability_guard
BEFORE UPDATE OR DELETE ON public.institution_scope_capabilities
FOR EACH ROW EXECUTE FUNCTION public.tg_guard_institution_scope_capability();

CREATE OR REPLACE FUNCTION public.institution_scope_integrity_is_clean(
  p_integrity jsonb
) RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF p_integrity IS NULL
    OR jsonb_typeof(p_integrity) <> 'object'
    OR NOT (p_integrity ?& ARRAY[
      'total', 'mapped', 'unmapped', 'scopeMismatch', 'nodeOrphan',
      'outcomeOrphan', 'primaryMismatch', 'emptyOutcome'
    ])
    OR (p_integrity->>'total') !~ '^\d+$'
    OR (p_integrity->>'mapped') !~ '^\d+$'
    OR (p_integrity->>'unmapped') !~ '^\d+$'
    OR (p_integrity->>'scopeMismatch') !~ '^\d+$'
    OR (p_integrity->>'nodeOrphan') !~ '^\d+$'
    OR (p_integrity->>'outcomeOrphan') !~ '^\d+$'
    OR (p_integrity->>'primaryMismatch') !~ '^\d+$'
    OR (p_integrity->>'emptyOutcome') !~ '^\d+$' THEN
    RETURN false;
  END IF;

  RETURN (p_integrity->>'total')::integer > 0
    AND (p_integrity->>'mapped')::integer = (p_integrity->>'total')::integer
    AND (p_integrity->>'unmapped')::integer = 0
    AND (p_integrity->>'scopeMismatch')::integer = 0
    AND (p_integrity->>'nodeOrphan')::integer = 0
    AND (p_integrity->>'outcomeOrphan')::integer = 0
    AND (p_integrity->>'primaryMismatch')::integer = 0
    AND (p_integrity->>'emptyOutcome')::integer = 0;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.institution_scope_capability_snapshot(
  p_game text,
  p_display_exam_ref text,
  p_required_capability text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_scope public.curriculum_scope_releases%ROWTYPE;
  v_capability public.institution_scope_capabilities%ROWTYPE;
  v_integrity jsonb;
BEGIN
  IF p_game IS NULL OR p_display_exam_ref IS NULL
    OR p_game IS DISTINCT FROM btrim(p_game)
    OR p_game IS DISTINCT FROM lower(p_game)
    OR p_game !~ '^[a-z][a-z0-9_]{1,19}$'
    OR p_display_exam_ref IS DISTINCT FROM btrim(p_display_exam_ref)
    OR p_display_exam_ref IS DISTINCT FROM upper(p_display_exam_ref)
    OR p_display_exam_ref !~ '^[A-Z0-9-]{2,10}$'
    OR p_required_capability NOT IN ('analysis', 'aggregate', 'report', 'program') THEN
    RAISE EXCEPTION 'invalid institution curriculum scope'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_capability
  FROM public.institution_scope_capabilities AS capability
  WHERE capability.game = p_game
    AND capability.display_exam_ref = p_display_exam_ref
    AND capability.capability_status = 'released'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'released institution curriculum scope is required'
      USING ERRCODE = 'P0002';
  END IF;

  IF (p_required_capability = 'analysis' AND NOT v_capability.student_analysis_enabled)
    OR (p_required_capability = 'aggregate' AND NOT v_capability.aggregate_enabled)
    OR (p_required_capability = 'report' AND NOT v_capability.report_enabled)
    OR (p_required_capability = 'program' AND NOT v_capability.program_enabled) THEN
    RAISE EXCEPTION 'institution curriculum capability is unavailable'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_scope
  FROM public.curriculum_scope_releases AS scope
  WHERE scope.game = p_game
    AND scope.display_exam_ref = p_display_exam_ref
    AND scope.release_status = 'released'
  FOR SHARE;
  IF NOT FOUND
    OR v_scope.question_exam_ref IS DISTINCT FROM v_capability.question_exam_ref
    OR v_scope.taxonomy_version IS DISTINCT FROM v_capability.taxonomy_version THEN
    RAISE EXCEPTION 'institution curriculum release drift detected'
      USING ERRCODE = '23514';
  END IF;

  v_integrity := public.curriculum_scope_integrity(
    v_scope.game,
    v_scope.display_exam_ref,
    v_scope.taxonomy_version
  );
  IF NOT public.institution_scope_integrity_is_clean(v_integrity) THEN
    RAISE EXCEPTION 'institution curriculum coverage is not decision-safe'
      USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object(
    'game', v_scope.game,
    'displayExamRef', v_scope.display_exam_ref,
    'questionExamRef', v_scope.question_exam_ref,
    'taxonomyVersion', v_scope.taxonomy_version,
    'scopePolicyVersion', v_capability.scope_policy_version,
    'diagnosticEnabled', v_scope.diagnostic_enabled
  );
END;
$fn$;

-- Re-prove the only institution reporting scope owned by this migration before
-- publishing it in the independent capability registry.
DO $fn$
DECLARE
  v_scope public.curriculum_scope_releases%ROWTYPE;
  v_integrity jsonb;
BEGIN
  SELECT * INTO v_scope
  FROM public.curriculum_scope_releases AS scope
  WHERE scope.game = 'matematik'
    AND scope.display_exam_ref = 'TYT'
    AND scope.question_exam_ref = 'TYT'
    AND scope.taxonomy_version = 'ba-tyt-math-v1'
    AND scope.release_status = 'released'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'released TYT Mathematics scope is required for institution backfill'
      USING ERRCODE = 'P0002';
  END IF;
  v_integrity := public.curriculum_scope_integrity(
    v_scope.game, v_scope.display_exam_ref, v_scope.taxonomy_version
  );
  IF NOT public.institution_scope_integrity_is_clean(v_integrity) THEN
    RAISE EXCEPTION 'TYT Mathematics institution scope failed integrity proof'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.institution_scope_capabilities (
    game, display_exam_ref, question_exam_ref, taxonomy_version,
    capability_status, scope_policy_version,
    student_analysis_enabled, aggregate_enabled, report_enabled,
    program_enabled, released_at
  ) VALUES (
    'matematik', 'TYT', 'TYT', 'ba-tyt-math-v1',
    'released', 'institution-scope-v1',
    true, true, true, true, clock_timestamp()
  ) ON CONFLICT (game, display_exam_ref) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1
    FROM public.institution_scope_capabilities AS capability
    WHERE capability.game = 'matematik'
      AND capability.display_exam_ref = 'TYT'
      AND capability.question_exam_ref = 'TYT'
      AND capability.taxonomy_version = 'ba-tyt-math-v1'
      AND capability.capability_status = 'released'
      AND capability.scope_policy_version = 'institution-scope-v1'
      AND capability.student_analysis_enabled
      AND capability.aggregate_enabled
      AND capability.report_enabled
      AND capability.program_enabled
  ) THEN
    RAISE EXCEPTION 'TYT Mathematics institution capability drift detected'
      USING ERRCODE = '23514';
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.resolve_released_institution_scope(
  p_game text,
  p_display_exam_ref text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    PERFORM public.institution_pilot_assert_operational_actor(auth.uid());
  END IF;
  RETURN public.institution_scope_capability_snapshot(
    p_game, p_display_exam_ref, 'analysis'
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.list_released_institution_scopes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_capability record;
  v_scope jsonb;
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    PERFORM public.institution_pilot_assert_operational_actor(auth.uid());
  END IF;
  FOR v_capability IN
    SELECT capability.game, capability.display_exam_ref
    FROM public.institution_scope_capabilities AS capability
    WHERE capability.capability_status = 'released'
      AND capability.student_analysis_enabled
    ORDER BY capability.game, capability.display_exam_ref
  LOOP
    v_scope := public.institution_scope_capability_snapshot(
      v_capability.game, v_capability.display_exam_ref, 'analysis'
    );
    v_result := v_result || jsonb_build_array(v_scope);
  END LOOP;
  RETURN v_result;
END;
$fn$;

-- Immutable scope snapshots for durable institution artifacts. Existing rows
-- were created only by the Math/TYT v1 RPCs; contradictory legacy snapshots
-- stop the migration instead of being silently relabelled.
ALTER TABLE public.institution_study_programs
  ADD COLUMN IF NOT EXISTS game text,
  ADD COLUMN IF NOT EXISTS display_exam_ref text,
  ADD COLUMN IF NOT EXISTS question_exam_ref text,
  ADD COLUMN IF NOT EXISTS scope_policy_version text;

DO $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.institution_study_programs AS program
    WHERE (program.game IS NULL OR program.display_exam_ref IS NULL
      OR program.scope_policy_version IS NULL)
      AND program.taxonomy_version IS DISTINCT FROM 'ba-tyt-math-v1'
  ) THEN
    RAISE EXCEPTION 'institution program scope backfill is ambiguous'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.institution_study_programs AS program
    WHERE (program.game IS NULL OR program.display_exam_ref IS NULL
      OR program.scope_policy_version IS NULL)
      AND (program.game IS NOT NULL OR program.display_exam_ref IS NOT NULL
        OR program.question_exam_ref IS NOT NULL OR program.scope_policy_version IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'institution program has a partial scope snapshot'
      USING ERRCODE = '23514';
  END IF;
END;
$fn$;

UPDATE public.institution_study_programs
SET game = 'matematik',
    display_exam_ref = 'TYT',
    question_exam_ref = 'TYT',
    scope_policy_version = 'institution-scope-v1'
WHERE game IS NULL
  AND display_exam_ref IS NULL
  AND question_exam_ref IS NULL
  AND scope_policy_version IS NULL;

ALTER TABLE public.institution_study_programs
  ALTER COLUMN game SET NOT NULL,
  ALTER COLUMN display_exam_ref SET NOT NULL,
  ALTER COLUMN scope_policy_version SET NOT NULL;

ALTER TABLE public.institution_student_reports
  ADD COLUMN IF NOT EXISTS game text,
  ADD COLUMN IF NOT EXISTS display_exam_ref text,
  ADD COLUMN IF NOT EXISTS question_exam_ref text,
  ADD COLUMN IF NOT EXISTS taxonomy_version text,
  ADD COLUMN IF NOT EXISTS scope_policy_version text;

DO $fn$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.institution_student_reports AS report
    WHERE (report.game IS NULL OR report.display_exam_ref IS NULL
      OR report.taxonomy_version IS NULL OR report.scope_policy_version IS NULL)
      AND (
        (report.snapshot#>>'{scope,game}') IS NOT NULL
          AND (report.snapshot#>>'{scope,game}') <> 'matematik'
        OR (report.snapshot#>>'{scope,examRef}') IS NOT NULL
          AND (report.snapshot#>>'{scope,examRef}') <> 'TYT'
        OR (report.snapshot#>>'{scope,taxonomyVersion}') IS NOT NULL
          AND (report.snapshot#>>'{scope,taxonomyVersion}') <> 'ba-tyt-math-v1'
      )
  ) THEN
    RAISE EXCEPTION 'institution report scope backfill is ambiguous'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.institution_student_reports AS report
    WHERE (report.game IS NULL OR report.display_exam_ref IS NULL
      OR report.taxonomy_version IS NULL OR report.scope_policy_version IS NULL)
      AND (report.game IS NOT NULL OR report.display_exam_ref IS NOT NULL
        OR report.question_exam_ref IS NOT NULL OR report.taxonomy_version IS NOT NULL
        OR report.scope_policy_version IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'institution report has a partial scope snapshot'
      USING ERRCODE = '23514';
  END IF;
END;
$fn$;

UPDATE public.institution_student_reports
SET game = 'matematik',
    display_exam_ref = 'TYT',
    question_exam_ref = 'TYT',
    taxonomy_version = 'ba-tyt-math-v1',
    scope_policy_version = 'institution-scope-v1'
WHERE game IS NULL
  AND display_exam_ref IS NULL
  AND question_exam_ref IS NULL
  AND taxonomy_version IS NULL
  AND scope_policy_version IS NULL;

ALTER TABLE public.institution_student_reports
  ALTER COLUMN game SET NOT NULL,
  ALTER COLUMN display_exam_ref SET NOT NULL,
  ALTER COLUMN taxonomy_version SET NOT NULL,
  ALTER COLUMN scope_policy_version SET NOT NULL;

ALTER TABLE public.institution_student_followups
  ADD COLUMN IF NOT EXISTS game text,
  ADD COLUMN IF NOT EXISTS display_exam_ref text,
  ADD COLUMN IF NOT EXISTS question_exam_ref text,
  ADD COLUMN IF NOT EXISTS taxonomy_version text,
  ADD COLUMN IF NOT EXISTS scope_policy_version text;

DO $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.institution_student_followups AS followup
    WHERE (followup.game IS NULL OR followup.display_exam_ref IS NULL
      OR followup.taxonomy_version IS NULL OR followup.scope_policy_version IS NULL)
      AND (followup.game IS NOT NULL OR followup.display_exam_ref IS NOT NULL
        OR followup.question_exam_ref IS NOT NULL OR followup.taxonomy_version IS NOT NULL
        OR followup.scope_policy_version IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'institution follow-up has a partial scope snapshot'
      USING ERRCODE = '23514';
  END IF;
END;
$fn$;

UPDATE public.institution_student_followups
SET game = 'matematik',
    display_exam_ref = 'TYT',
    question_exam_ref = 'TYT',
    taxonomy_version = 'ba-tyt-math-v1',
    scope_policy_version = 'institution-scope-v1'
WHERE game IS NULL
  AND display_exam_ref IS NULL
  AND question_exam_ref IS NULL
  AND taxonomy_version IS NULL
  AND scope_policy_version IS NULL;

-- The migration-159 legacy writer has no scope parameters. Defaults keep that
-- compatibility path explicitly Math/TYT; all v2 writes must provide their
-- exact scope and may override question_exam_ref with NULL (for example YDT).
ALTER TABLE public.institution_student_followups
  ALTER COLUMN game SET DEFAULT 'matematik',
  ALTER COLUMN game SET NOT NULL,
  ALTER COLUMN display_exam_ref SET DEFAULT 'TYT',
  ALTER COLUMN display_exam_ref SET NOT NULL,
  ALTER COLUMN question_exam_ref SET DEFAULT 'TYT',
  ALTER COLUMN taxonomy_version SET DEFAULT 'ba-tyt-math-v1',
  ALTER COLUMN taxonomy_version SET NOT NULL,
  ALTER COLUMN scope_policy_version SET DEFAULT 'institution-scope-v1',
  ALTER COLUMN scope_policy_version SET NOT NULL;

DO $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.institution_study_programs'::regclass
      AND conname = 'institution_study_programs_scope_snapshot_check'
  ) THEN
    ALTER TABLE public.institution_study_programs
      ADD CONSTRAINT institution_study_programs_scope_snapshot_check CHECK (
        game = lower(btrim(game))
        AND display_exam_ref = upper(btrim(display_exam_ref))
        AND (question_exam_ref IS NULL OR question_exam_ref = upper(btrim(question_exam_ref)))
        AND taxonomy_version ~ '^ba-[a-z0-9-]+-v[0-9]+$'
        AND scope_policy_version ~ '^institution-scope-v[0-9]+$'
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.institution_student_reports'::regclass
      AND conname = 'institution_student_reports_scope_snapshot_check'
  ) THEN
    ALTER TABLE public.institution_student_reports
      ADD CONSTRAINT institution_student_reports_scope_snapshot_check CHECK (
        game = lower(btrim(game))
        AND display_exam_ref = upper(btrim(display_exam_ref))
        AND (question_exam_ref IS NULL OR question_exam_ref = upper(btrim(question_exam_ref)))
        AND taxonomy_version ~ '^ba-[a-z0-9-]+-v[0-9]+$'
        AND scope_policy_version ~ '^institution-scope-v[0-9]+$'
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.institution_student_followups'::regclass
      AND conname = 'institution_student_followups_scope_snapshot_check'
  ) THEN
    ALTER TABLE public.institution_student_followups
      ADD CONSTRAINT institution_student_followups_scope_snapshot_check CHECK (
        game = lower(btrim(game))
        AND display_exam_ref = upper(btrim(display_exam_ref))
        AND (question_exam_ref IS NULL OR question_exam_ref = upper(btrim(question_exam_ref)))
        AND taxonomy_version ~ '^ba-[a-z0-9-]+-v[0-9]+$'
        AND scope_policy_version ~ '^institution-scope-v[0-9]+$'
      );
  END IF;
END;
$fn$;

CREATE INDEX IF NOT EXISTS institution_study_programs_scope_week_idx
  ON public.institution_study_programs(
    classroom_id, game, display_exam_ref, taxonomy_version, week_start DESC
  );
CREATE INDEX IF NOT EXISTS institution_student_reports_scope_created_idx
  ON public.institution_student_reports(
    classroom_id, game, display_exam_ref, taxonomy_version, created_at DESC
  );
CREATE INDEX IF NOT EXISTS institution_student_followups_scope_window_idx
  ON public.institution_student_followups(
    classroom_id, game, display_exam_ref, taxonomy_version, opened_at DESC
  );

CREATE OR REPLACE FUNCTION public.get_institution_student_learning_analysis_v2(
  p_user_id uuid,
  p_classroom_id uuid,
  p_member_ref text,
  p_game text,
  p_display_exam_ref text,
  p_window_end timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_membership public.teacher_classroom_memberships%ROWTYPE;
  v_scope jsonb;
  v_staff_role text;
  v_integrity jsonb;
  v_total integer;
  v_mapped integer;
  v_outcomes jsonb;
  v_taxonomy_version text;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_window_end IS NULL
    OR p_member_ref IS NULL OR p_member_ref !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'invalid institution learning analysis request'
      USING ERRCODE = '22023';
  END IF;
  IF p_window_end > clock_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION 'analysis window cannot be in the future'
      USING ERRCODE = '22023';
  END IF;
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  v_scope := public.institution_scope_capability_snapshot(
    p_game, p_display_exam_ref, 'analysis'
  );
  v_taxonomy_version := v_scope->>'taxonomyVersion';

  SELECT * INTO v_classroom
  FROM public.teacher_classrooms
  WHERE id = p_classroom_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'classroom not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT membership.role INTO v_staff_role
  FROM public.pilot_institution_memberships AS membership
  JOIN public.pilot_institutions AS institution
    ON institution.id = membership.institution_id
    AND institution.status IN ('pilot', 'active')
  JOIN public.profiles AS profile
    ON profile.id = membership.user_id AND profile.deleted_at IS NULL
  WHERE membership.user_id = p_user_id
    AND membership.institution_id = v_classroom.institution_id
    AND membership.status = 'active'
    AND membership.role IN ('manager', 'teacher');
  IF v_staff_role IS NULL
    OR (v_staff_role = 'teacher' AND v_classroom.teacher_id <> p_user_id) THEN
    RAISE EXCEPTION 'institution classroom access required'
      USING ERRCODE = '42501';
  END IF;

  SELECT membership.* INTO v_membership
  FROM public.teacher_classroom_memberships AS membership
  JOIN public.profiles AS profile
    ON profile.id = membership.student_id AND profile.deleted_at IS NULL
  WHERE membership.classroom_id = p_classroom_id
    AND membership.member_ref = p_member_ref
    AND membership.status = 'active'
    AND NOT public.teacher_classroom_is_blocked(
      v_classroom.teacher_id, membership.student_id
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active classroom member not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_window_end <= v_membership.accepted_at THEN
    RAISE EXCEPTION 'analysis window must follow membership acceptance'
      USING ERRCODE = '22023';
  END IF;

  v_integrity := public.curriculum_scope_integrity(
    v_scope->>'game', v_scope->>'displayExamRef', v_taxonomy_version
  );
  IF NOT public.institution_scope_integrity_is_clean(v_integrity) THEN
    RAISE EXCEPTION 'institution curriculum coverage is not decision-safe'
      USING ERRCODE = '23514';
  END IF;
  v_total := (v_integrity->>'total')::integer;
  v_mapped := (v_integrity->>'mapped')::integer;

  WITH scoped_outcomes AS (
    SELECT
      outcome.id,
      outcome.code,
      outcome.title,
      outcome.category,
      outcome.sort_order,
      outcome_node.code AS node_code,
      jsonb_build_array(
        course_node.title, unit_node.title, topic_node.title, outcome_node.title
      ) AS path
    FROM public.curriculum_outcomes AS outcome
    JOIN public.curriculum_nodes AS outcome_node
      ON outcome_node.id = outcome.node_id
      AND outcome_node.node_type = 'outcome'
      AND outcome_node.is_active
    JOIN public.curriculum_nodes AS topic_node
      ON topic_node.id = outcome_node.parent_id
      AND topic_node.node_type = 'topic'
      AND topic_node.is_active
    JOIN public.curriculum_nodes AS unit_node
      ON unit_node.id = topic_node.parent_id
      AND unit_node.node_type = 'unit'
      AND unit_node.is_active
    JOIN public.curriculum_nodes AS course_node
      ON course_node.id = unit_node.parent_id
      AND course_node.node_type = 'course'
      AND course_node.is_active
    WHERE outcome.game = v_scope->>'game'
      AND outcome.exam_ref = v_scope->>'displayExamRef'
      AND outcome.taxonomy_version = v_taxonomy_version
      AND outcome.is_active
  ), eligible_evidence AS (
    SELECT mastered.*, answer.answered_at
    FROM public.mastery_outcome_evidence AS mastered
    JOIN public.session_answers AS answer ON answer.id = mastered.answer_id
    WHERE mastered.user_id = v_membership.student_id
      AND answer.answered_at >= v_membership.accepted_at
      AND answer.answered_at < p_window_end
  ), evidence AS (
    SELECT
      scoped.id AS outcome_id,
      count(eligible.answer_id)::integer AS attempts,
      count(eligible.answer_id) FILTER (WHERE eligible.is_correct)::integer AS correct_attempts,
      count(DISTINCT eligible.attempt_id)::integer AS independent_attempts,
      COALESCE(sum(CASE WHEN eligible.is_correct THEN eligible.mapping_weight ELSE 0 END), 0) AS weighted_earned,
      COALESCE(sum(eligible.mapping_weight), 0) AS weighted_possible,
      count(eligible.answer_id) FILTER (WHERE eligible.delayed_correct)::integer AS delayed_correct,
      COALESCE(sum(eligible.difficulty_weighted_earned), 0) AS difficulty_weighted_earned,
      COALESCE(sum(eligible.difficulty_weighted_possible), 0) AS difficulty_weighted_possible,
      count(eligible.answer_id) FILTER (WHERE eligible.time_taken_sec IS NOT NULL)::integer AS timed_attempts,
      COALESCE(sum(eligible.time_taken_sec), 0) AS total_time_sec,
      count(eligible.answer_id) FILTER (WHERE eligible.fast_wrong)::integer AS fast_wrong,
      count(eligible.answer_id) FILTER (WHERE eligible.max_hint_stage > 0)::integer AS hinted_attempts,
      COALESCE(sum(eligible.max_hint_stage), 0)::integer AS hint_stage_sum,
      count(eligible.answer_id) FILTER (WHERE EXISTS (
        SELECT 1
        FROM public.review_logs AS review_log
        JOIN public.review_error_annotations AS annotation
          ON annotation.review_log_id = review_log.id
          AND annotation.reason_code = 'guess'
        WHERE review_log.answer_id = eligible.answer_id
      ))::integer AS guess_annotations,
      count(eligible.answer_id) FILTER (WHERE EXISTS (
        SELECT 1
        FROM public.review_logs AS review_log
        JOIN public.review_error_annotations AS annotation
          ON annotation.review_log_id = review_log.id
          AND annotation.reason_code = 'careless'
        WHERE review_log.answer_id = eligible.answer_id
      ))::integer AS careless_annotations,
      min(eligible.answered_at) AS first_evidence_at,
      max(eligible.answered_at) AS last_evidence_at
    FROM scoped_outcomes AS scoped
    LEFT JOIN eligible_evidence AS eligible ON eligible.outcome_id = scoped.id
    GROUP BY scoped.id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'code', scoped.code,
    'nodeCode', scoped.node_code,
    'path', scoped.path,
    'title', scoped.title,
    'category', scoped.category,
    'attempts', evidence.attempts,
    'correctAttempts', evidence.correct_attempts,
    'independentAttempts', evidence.independent_attempts,
    'weightedEarned', evidence.weighted_earned,
    'weightedPossible', evidence.weighted_possible,
    'delayedCorrect', evidence.delayed_correct,
    'difficultyWeightedEarned', evidence.difficulty_weighted_earned,
    'difficultyWeightedPossible', evidence.difficulty_weighted_possible,
    'timedAttempts', evidence.timed_attempts,
    'totalTimeSec', evidence.total_time_sec,
    'fastWrong', evidence.fast_wrong,
    'hintedAttempts', evidence.hinted_attempts,
    'hintStageSum', evidence.hint_stage_sum,
    'guessAnnotations', evidence.guess_annotations,
    'carelessAnnotations', evidence.careless_annotations,
    'firstEvidenceAt', evidence.first_evidence_at,
    'lastEvidenceAt', evidence.last_evidence_at
  ) ORDER BY scoped.sort_order, scoped.code), '[]'::jsonb)
  INTO v_outcomes
  FROM scoped_outcomes AS scoped
  JOIN evidence ON evidence.outcome_id = scoped.id;

  RETURN jsonb_build_object(
    'classroom', jsonb_build_object(
      'id', v_classroom.id,
      'name', v_classroom.name
    ),
    'student', jsonb_build_object(
      'memberRef', v_membership.member_ref,
      'alias', public.teacher_classroom_safe_alias(v_membership.student_id),
      'joinedAt', v_membership.accepted_at
    ),
    'scope', jsonb_build_object(
      'game', v_scope->>'game',
      'examRef', v_scope->>'displayExamRef',
      'questionExamRef', v_scope->'questionExamRef',
      'taxonomyVersion', v_taxonomy_version,
      'diagnosticEnabled', (v_scope->>'diagnosticEnabled')::boolean,
      'institutionReportingEnabled', true,
      'scopePolicyVersion', v_scope->>'scopePolicyVersion',
      'modelVersion', 'institution-evidence-v2',
      'windowStart', v_membership.accepted_at,
      'windowEnd', p_window_end
    ),
    'coverage', jsonb_build_object(
      'supported', true,
      'totalQuestions', v_total,
      'mappedQuestions', v_mapped,
      'percentage', round(100.0 * v_mapped / v_total)::integer
    ),
    'outcomes', v_outcomes
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_institution_student_learning_analysis(
  p_user_id uuid,
  p_classroom_id uuid,
  p_member_ref text,
  p_game text,
  p_exam_ref text,
  p_window_end timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF p_game IS DISTINCT FROM 'matematik' OR p_exam_ref IS DISTINCT FROM 'TYT' THEN
    RAISE EXCEPTION 'legacy institution analysis supports only TYT Mathematics'
      USING ERRCODE = '22023';
  END IF;
  RETURN public.get_institution_student_learning_analysis_v2(
    p_user_id, p_classroom_id, p_member_ref, 'matematik', 'TYT', p_window_end
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_institution_classroom_growth_metrics_v2(
  p_user_id uuid,
  p_classroom_id uuid,
  p_game text,
  p_display_exam_ref text,
  p_window_end timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_role text;
  v_scope jsonb;
  v_active_count integer;
  v_eligible_count integer;
  v_positive_count integer;
  v_baseline_start timestamptz := p_window_end - interval '56 days';
  v_baseline_end timestamptz := p_window_end - interval '28 days';
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_window_end IS NULL
    OR p_window_end > clock_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION 'invalid classroom growth window' USING ERRCODE = '22023';
  END IF;
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  v_scope := public.institution_scope_capability_snapshot(
    p_game, p_display_exam_ref, 'aggregate'
  );

  SELECT * INTO v_classroom
  FROM public.teacher_classrooms
  WHERE id = p_classroom_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'classroom not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT membership.role INTO v_role
  FROM public.pilot_institution_memberships AS membership
  JOIN public.pilot_institutions AS institution
    ON institution.id = membership.institution_id
    AND institution.status IN ('pilot', 'active')
  JOIN public.profiles AS profile
    ON profile.id = membership.user_id AND profile.deleted_at IS NULL
  WHERE membership.user_id = p_user_id
    AND membership.institution_id = v_classroom.institution_id
    AND membership.status = 'active'
    AND membership.role IN ('manager', 'teacher');
  IF v_role IS NULL OR (v_role = 'teacher' AND v_classroom.teacher_id <> p_user_id) THEN
    RAISE EXCEPTION 'institution classroom access required' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer INTO v_active_count
  FROM public.teacher_classroom_memberships AS membership
  JOIN public.profiles AS profile
    ON profile.id = membership.student_id AND profile.deleted_at IS NULL
  WHERE membership.classroom_id = p_classroom_id
    AND membership.status = 'active'
    AND NOT public.teacher_classroom_is_blocked(
      v_classroom.teacher_id, membership.student_id
    );

  IF v_active_count < 3 THEN
    RETURN jsonb_build_object(
      'supported', false,
      'reason', 'insufficient_group',
      'modelVersion', 'institution-growth-v2',
      'scope', jsonb_build_object(
        'game', v_scope->>'game',
        'examRef', v_scope->>'displayExamRef',
        'questionExamRef', v_scope->'questionExamRef',
        'taxonomyVersion', v_scope->>'taxonomyVersion',
        'scopePolicyVersion', v_scope->>'scopePolicyVersion'
      )
    );
  END IF;

  WITH roster AS (
    SELECT membership.id AS membership_id, membership.student_id
    FROM public.teacher_classroom_memberships AS membership
    JOIN public.profiles AS profile
      ON profile.id = membership.student_id AND profile.deleted_at IS NULL
    WHERE membership.classroom_id = p_classroom_id
      AND membership.status = 'active'
      AND membership.accepted_at <= v_baseline_start
      AND NOT public.teacher_classroom_is_blocked(
        v_classroom.teacher_id, membership.student_id
      )
  ), evidence AS (
    SELECT roster.membership_id, mastered.answer_id, mastered.attempt_id,
      mastered.difficulty_weighted_earned,
      mastered.difficulty_weighted_possible,
      answer.answered_at
    FROM roster
    JOIN public.mastery_outcome_evidence AS mastered
      ON mastered.user_id = roster.student_id
    JOIN public.session_answers AS answer ON answer.id = mastered.answer_id
    JOIN public.curriculum_outcomes AS outcome
      ON outcome.id = mastered.outcome_id
      AND outcome.game = v_scope->>'game'
      AND outcome.exam_ref = v_scope->>'displayExamRef'
      AND outcome.taxonomy_version = v_scope->>'taxonomyVersion'
      AND outcome.is_active
    WHERE answer.answered_at >= v_baseline_start
      AND answer.answered_at < p_window_end
  ), student_windows AS (
    SELECT membership_id,
      count(DISTINCT answer_id) FILTER (
        WHERE answered_at >= v_baseline_start AND answered_at < v_baseline_end
      )::integer AS baseline_evidence_count,
      count(DISTINCT attempt_id) FILTER (
        WHERE answered_at >= v_baseline_start AND answered_at < v_baseline_end
      )::integer AS baseline_attempt_count,
      sum(difficulty_weighted_earned) FILTER (
        WHERE answered_at >= v_baseline_start AND answered_at < v_baseline_end
      ) AS baseline_earned,
      sum(difficulty_weighted_possible) FILTER (
        WHERE answered_at >= v_baseline_start AND answered_at < v_baseline_end
      ) AS baseline_possible,
      count(DISTINCT answer_id) FILTER (
        WHERE answered_at >= v_baseline_end AND answered_at < p_window_end
      )::integer AS current_evidence_count,
      count(DISTINCT attempt_id) FILTER (
        WHERE answered_at >= v_baseline_end AND answered_at < p_window_end
      )::integer AS current_attempt_count,
      sum(difficulty_weighted_earned) FILTER (
        WHERE answered_at >= v_baseline_end AND answered_at < p_window_end
      ) AS current_earned,
      sum(difficulty_weighted_possible) FILTER (
        WHERE answered_at >= v_baseline_end AND answered_at < p_window_end
      ) AS current_possible
    FROM evidence
    GROUP BY membership_id
  ), eligible AS (
    SELECT membership_id,
      100.0 * baseline_earned / baseline_possible AS baseline_score,
      100.0 * current_earned / current_possible AS current_score
    FROM student_windows
    WHERE baseline_evidence_count >= 6 AND baseline_attempt_count >= 3
      AND current_evidence_count >= 6 AND current_attempt_count >= 3
      AND baseline_possible > 0 AND current_possible > 0
  )
  SELECT count(*)::integer,
    count(*) FILTER (
      WHERE current_score >= baseline_score + 5
        OR (baseline_score >= 80 AND current_score >= 80)
    )::integer
  INTO v_eligible_count, v_positive_count
  FROM eligible;

  RETURN jsonb_build_object(
    'supported', true,
    'modelVersion', 'institution-growth-v2',
    'scope', jsonb_build_object(
      'game', v_scope->>'game',
      'examRef', v_scope->>'displayExamRef',
      'questionExamRef', v_scope->'questionExamRef',
      'taxonomyVersion', v_scope->>'taxonomyVersion',
      'scopePolicyVersion', v_scope->>'scopePolicyVersion'
    ),
    'baselineWindowStart', v_baseline_start,
    'baselineWindowEnd', v_baseline_end,
    'currentWindowStart', v_baseline_end,
    'currentWindowEnd', p_window_end,
    'eligibleStudentCount', v_eligible_count,
    'positiveGrowthStudentCount', v_positive_count,
    'excludedInsufficientCount', v_active_count - v_eligible_count
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_institution_classroom_growth_metrics(
  p_user_id uuid,
  p_classroom_id uuid,
  p_window_end timestamptz,
  p_taxonomy_version text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_scope jsonb;
BEGIN
  v_scope := public.institution_scope_capability_snapshot(
    'matematik', 'TYT', 'aggregate'
  );
  IF p_taxonomy_version IS DISTINCT FROM v_scope->>'taxonomyVersion' THEN
    RAISE EXCEPTION 'released institution curriculum scope is required'
      USING ERRCODE = 'P0002';
  END IF;
  RETURN public.get_institution_classroom_growth_metrics_v2(
    p_user_id, p_classroom_id, 'matematik', 'TYT', p_window_end
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_institution_classroom_growth_metrics(
  p_user_id uuid,
  p_classroom_id uuid,
  p_window_end timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  RETURN public.get_institution_classroom_growth_metrics_v2(
    p_user_id, p_classroom_id, 'matematik', 'TYT', p_window_end
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_institution_classroom_published_program_members_v2(
  p_user_id uuid,
  p_classroom_id uuid,
  p_game text,
  p_display_exam_ref text,
  p_window_start timestamptz,
  p_window_end timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_role text;
  v_scope jsonb;
  v_refs jsonb;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL
    OR p_window_start IS NULL OR p_window_end IS NULL
    OR p_window_end <= p_window_start
    OR p_window_end > clock_timestamp() + interval '5 minutes'
    OR p_window_end - p_window_start > interval '5 years' THEN
    RAISE EXCEPTION 'invalid classroom program coverage window'
      USING ERRCODE = '22023';
  END IF;
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  v_scope := public.institution_scope_capability_snapshot(
    p_game, p_display_exam_ref, 'aggregate'
  );

  SELECT * INTO v_classroom FROM public.teacher_classrooms
  WHERE id = p_classroom_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'classroom not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT membership.role INTO v_role
  FROM public.pilot_institution_memberships AS membership
  JOIN public.pilot_institutions AS institution
    ON institution.id = membership.institution_id
    AND institution.status IN ('pilot', 'active')
  JOIN public.profiles AS profile
    ON profile.id = membership.user_id AND profile.deleted_at IS NULL
  WHERE membership.user_id = p_user_id
    AND membership.institution_id = v_classroom.institution_id
    AND membership.status = 'active'
    AND membership.role IN ('manager', 'teacher');
  IF v_role IS NULL OR (v_role = 'teacher' AND v_classroom.teacher_id <> p_user_id) THEN
    RAISE EXCEPTION 'institution classroom access required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(program_member.member_ref ORDER BY program_member.member_ref),
    '[]'::jsonb
  ) INTO v_refs
  FROM (
    SELECT DISTINCT membership.member_ref
    FROM public.institution_study_programs AS program
    JOIN public.teacher_classroom_memberships AS membership
      ON membership.id = program.membership_id
      AND membership.classroom_id = program.classroom_id
      AND membership.student_id = program.student_id
      AND membership.status = 'active'
    JOIN public.profiles AS profile
      ON profile.id = membership.student_id AND profile.deleted_at IS NULL
    WHERE program.classroom_id = p_classroom_id
      AND program.game = v_scope->>'game'
      AND program.display_exam_ref = v_scope->>'displayExamRef'
      AND program.question_exam_ref IS NOT DISTINCT FROM
        NULLIF(v_scope->>'questionExamRef', '')
      AND program.taxonomy_version = v_scope->>'taxonomyVersion'
      AND program.scope_policy_version = v_scope->>'scopePolicyVersion'
      AND program.status IN ('published', 'completed')
      AND program.published_at >= p_window_start
      AND program.published_at < p_window_end
      AND NOT public.teacher_classroom_is_blocked(
        v_classroom.teacher_id, membership.student_id
      )
  ) AS program_member;

  RETURN jsonb_build_object(
    'scope', jsonb_build_object(
      'game', v_scope->>'game',
      'examRef', v_scope->>'displayExamRef',
      'questionExamRef', v_scope->'questionExamRef',
      'taxonomyVersion', v_scope->>'taxonomyVersion',
      'scopePolicyVersion', v_scope->>'scopePolicyVersion'
    ),
    'memberRefs', v_refs
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_institution_classroom_published_program_members(
  p_user_id uuid,
  p_classroom_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  RETURN public.get_institution_classroom_published_program_members_v2(
    p_user_id, p_classroom_id, 'matematik', 'TYT', p_window_start, p_window_end
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_institution_classroom_followup_metrics_v2(
  p_user_id uuid,
  p_classroom_id uuid,
  p_game text,
  p_display_exam_ref text,
  p_window_start timestamptz,
  p_window_end timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_role text;
  v_scope jsonb;
  v_followed_refs jsonb;
  v_eligible_count integer;
  v_timely_count integer;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL
    OR p_window_start IS NULL OR p_window_end IS NULL
    OR p_window_end <= p_window_start
    OR p_window_end > clock_timestamp() + interval '5 minutes'
    OR p_window_end - p_window_start > interval '366 days' THEN
    RAISE EXCEPTION 'invalid classroom follow-up metrics window'
      USING ERRCODE = '22023';
  END IF;
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  v_scope := public.institution_scope_capability_snapshot(
    p_game, p_display_exam_ref, 'aggregate'
  );

  SELECT * INTO v_classroom
  FROM public.teacher_classrooms
  WHERE id = p_classroom_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'classroom not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT membership.role INTO v_role
  FROM public.pilot_institution_memberships AS membership
  JOIN public.pilot_institutions AS institution
    ON institution.id = membership.institution_id
    AND institution.status IN ('pilot', 'active')
  JOIN public.profiles AS profile
    ON profile.id = membership.user_id AND profile.deleted_at IS NULL
  WHERE membership.user_id = p_user_id
    AND membership.institution_id = v_classroom.institution_id
    AND membership.status = 'active'
    AND membership.role IN ('manager', 'teacher');
  IF v_role IS NULL OR (v_role = 'teacher' AND v_classroom.teacher_id <> p_user_id) THEN
    RAISE EXCEPTION 'institution classroom access required' USING ERRCODE = '42501';
  END IF;

  WITH scoped_followups AS (
    SELECT membership.member_ref, min(followup.opened_at) AS first_opened_at
    FROM public.institution_student_followups AS followup
    JOIN public.teacher_classroom_memberships AS membership
      ON membership.id = followup.membership_id
      AND membership.classroom_id = followup.classroom_id
      AND membership.student_id = followup.student_id
      AND membership.status = 'active'
    JOIN public.profiles AS profile
      ON profile.id = membership.student_id AND profile.deleted_at IS NULL
    WHERE followup.classroom_id = p_classroom_id
      AND followup.institution_id = v_classroom.institution_id
      AND followup.game = v_scope->>'game'
      AND followup.display_exam_ref = v_scope->>'displayExamRef'
      AND followup.question_exam_ref IS NOT DISTINCT FROM
        NULLIF(v_scope->>'questionExamRef', '')
      AND followup.taxonomy_version = v_scope->>'taxonomyVersion'
      AND followup.scope_policy_version = v_scope->>'scopePolicyVersion'
      AND followup.opened_at >= p_window_start
      AND followup.opened_at < p_window_end
      AND NOT public.teacher_classroom_is_blocked(
        v_classroom.teacher_id, membership.student_id
      )
    GROUP BY followup.membership_id, membership.member_ref
  )
  SELECT COALESCE(jsonb_agg(member_ref ORDER BY member_ref), '[]'::jsonb)
  INTO v_followed_refs
  FROM scoped_followups;

  WITH eligible_followups AS (
    SELECT followup.membership_id, min(followup.opened_at) AS first_opened_at
    FROM public.institution_student_followups AS followup
    JOIN public.teacher_classroom_memberships AS membership
      ON membership.id = followup.membership_id
      AND membership.classroom_id = followup.classroom_id
      AND membership.student_id = followup.student_id
      AND membership.status = 'active'
    JOIN public.profiles AS profile
      ON profile.id = membership.student_id AND profile.deleted_at IS NULL
    WHERE followup.classroom_id = p_classroom_id
      AND followup.institution_id = v_classroom.institution_id
      AND followup.game = v_scope->>'game'
      AND followup.display_exam_ref = v_scope->>'displayExamRef'
      AND followup.question_exam_ref IS NOT DISTINCT FROM
        NULLIF(v_scope->>'questionExamRef', '')
      AND followup.taxonomy_version = v_scope->>'taxonomyVersion'
      AND followup.scope_policy_version = v_scope->>'scopePolicyVersion'
      AND followup.opened_at >= p_window_start
      AND followup.opened_at < p_window_end - interval '14 days'
      AND NOT public.teacher_classroom_is_blocked(
        v_classroom.teacher_id, membership.student_id
      )
    GROUP BY followup.membership_id
  )
  SELECT count(*)::integer,
    count(*) FILTER (WHERE EXISTS (
      SELECT 1
      FROM public.institution_study_programs AS program
      WHERE program.membership_id = eligible_followups.membership_id
        AND program.classroom_id = p_classroom_id
        AND program.game = v_scope->>'game'
        AND program.display_exam_ref = v_scope->>'displayExamRef'
        AND program.question_exam_ref IS NOT DISTINCT FROM
          NULLIF(v_scope->>'questionExamRef', '')
        AND program.taxonomy_version = v_scope->>'taxonomyVersion'
        AND program.scope_policy_version = v_scope->>'scopePolicyVersion'
        AND program.status IN ('published', 'completed')
        AND program.published_at >= eligible_followups.first_opened_at
        AND program.published_at <=
          eligible_followups.first_opened_at + interval '14 days'
    ))::integer
  INTO v_eligible_count, v_timely_count
  FROM eligible_followups;

  RETURN jsonb_build_object(
    'scope', jsonb_build_object(
      'game', v_scope->>'game',
      'examRef', v_scope->>'displayExamRef',
      'questionExamRef', v_scope->'questionExamRef',
      'taxonomyVersion', v_scope->>'taxonomyVersion',
      'scopePolicyVersion', v_scope->>'scopePolicyVersion'
    ),
    'followedMemberRefs', v_followed_refs,
    'interventionEligibleCount', v_eligible_count,
    'timelyInterventionCount', v_timely_count,
    'interventionStudentCount', v_eligible_count
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_institution_classroom_followup_metrics(
  p_user_id uuid,
  p_classroom_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  RETURN public.get_institution_classroom_followup_metrics_v2(
    p_user_id, p_classroom_id, 'matematik', 'TYT', p_window_start, p_window_end
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_institution_student_report_v2(
  p_user_id uuid,
  p_classroom_id uuid,
  p_member_ref text,
  p_game text,
  p_display_exam_ref text,
  p_snapshot jsonb,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_membership public.teacher_classroom_memberships%ROWTYPE;
  v_report public.institution_student_reports%ROWTYPE;
  v_request public.pilot_institution_requests%ROWTYPE;
  v_scope jsonb;
  v_hash text;
  v_legacy_hash text;
  v_legacy_snapshot jsonb;
  v_result jsonb;
  v_period_start timestamptz;
  v_period_end timestamptz;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_request_id IS NULL
    OR p_member_ref IS NULL OR p_member_ref !~ '^[0-9a-f]{32}$'
    OR p_snapshot IS NULL OR jsonb_typeof(p_snapshot) <> 'object'
    OR pg_column_size(p_snapshot) > 100000
    OR p_snapshot->>'modelVersion' IS DISTINCT FROM 'institution-student-report-v1'
    OR NOT (p_snapshot ?& ARRAY[
      'generatedAt', 'periodStart', 'periodEnd', 'institutionName',
      'classroomName', 'teacherAlias', 'studentAlias', 'scope', 'summary', 'outcomes'
    ])
    OR jsonb_typeof(p_snapshot->'scope') <> 'object'
    OR p_snapshot::text ~ '"(studentId|userId|memberRef|email|phone|note|followupRef|programRef|questionId|answerId)"[[:space:]]*:' THEN
    RAISE EXCEPTION 'invalid institution student report snapshot'
      USING ERRCODE = '22023';
  END IF;
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  v_scope := public.institution_scope_capability_snapshot(
    p_game, p_display_exam_ref, 'report'
  );
  IF (p_snapshot#>>'{scope,game}') IS DISTINCT FROM v_scope->>'game'
    OR (p_snapshot#>>'{scope,examRef}') IS DISTINCT FROM v_scope->>'displayExamRef'
    OR (p_snapshot#>>'{scope,questionExamRef}') IS DISTINCT FROM
      NULLIF(v_scope->>'questionExamRef', '')
    OR (p_snapshot#>>'{scope,taxonomyVersion}') IS DISTINCT FROM v_scope->>'taxonomyVersion'
    OR (p_snapshot#>>'{scope,scopePolicyVersion}') IS DISTINCT FROM v_scope->>'scopePolicyVersion' THEN
    RAISE EXCEPTION 'institution report curriculum scope mismatch'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_classroom FROM public.teacher_classrooms
  WHERE id = p_classroom_id AND teacher_id = p_user_id AND status = 'active';
  IF NOT FOUND OR NOT public.institution_pilot_has_role(
    p_user_id, v_classroom.institution_id, ARRAY['manager','teacher']::text[]
  ) THEN
    RAISE EXCEPTION 'assigned institution teacher required' USING ERRCODE = '42501';
  END IF;
  SELECT membership.* INTO v_membership
  FROM public.teacher_classroom_memberships AS membership
  JOIN public.profiles AS profile
    ON profile.id = membership.student_id AND profile.deleted_at IS NULL
  WHERE membership.classroom_id = p_classroom_id
    AND membership.member_ref = p_member_ref
    AND membership.status = 'active';
  IF NOT FOUND OR public.teacher_classroom_is_blocked(
    p_user_id, v_membership.student_id
  ) THEN
    RAISE EXCEPTION 'active classroom member not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_snapshot->>'classroomName' IS DISTINCT FROM v_classroom.name
    OR p_snapshot->>'studentAlias' IS DISTINCT FROM
      public.teacher_classroom_safe_alias(v_membership.student_id)
    OR p_snapshot->>'teacherAlias' IS DISTINCT FROM
      public.teacher_classroom_safe_alias(p_user_id) THEN
    RAISE EXCEPTION 'institution report identity mismatch' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_period_start := (p_snapshot->>'periodStart')::timestamptz;
    v_period_end := (p_snapshot->>'periodEnd')::timestamptz;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'invalid institution report period' USING ERRCODE = '22023';
  END;
  IF v_period_end <= v_period_start
    OR v_period_end > clock_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION 'invalid institution report period' USING ERRCODE = '22023';
  END IF;

  v_hash := public.institution_pilot_payload_hash(jsonb_build_object(
    'classroomId', p_classroom_id,
    'memberRef', p_member_ref,
    'game', v_scope->>'game',
    'displayExamRef', v_scope->>'displayExamRef',
    'questionExamRef', v_scope->'questionExamRef',
    'taxonomyVersion', v_scope->>'taxonomyVersion',
    'scopePolicyVersion', v_scope->>'scopePolicyVersion',
    'snapshot', p_snapshot
  ));
  -- The legacy Math snapshot already carried game/exam/taxonomy. The wrapper
  -- adds only these two new immutable fields before delegating, so remove them
  -- solely for replaying a pre-194 request ledger entry.
  v_legacy_snapshot := jsonb_set(
    p_snapshot,
    '{scope}',
    (p_snapshot->'scope') - 'questionExamRef' - 'scopePolicyVersion',
    true
  );
  v_legacy_hash := public.institution_pilot_payload_hash(jsonb_build_object(
    'classroomId', p_classroom_id,
    'memberRef', p_member_ref,
    'snapshot', v_legacy_snapshot
  ));
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':student-report:' || p_request_id::text, 0)
  );
  SELECT * INTO v_request
  FROM public.pilot_institution_requests
  WHERE user_id = p_user_id
    AND operation = 'create_student_report'
    AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash IS DISTINCT FROM v_hash
      AND v_request.payload_hash IS DISTINCT FROM v_legacy_hash THEN
      RAISE EXCEPTION 'student report payload mismatch' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_report
    FROM public.institution_student_reports AS report
    WHERE report.report_ref = v_request.result->>'reportRef'
      AND report.institution_id = v_classroom.institution_id
      AND report.classroom_id = p_classroom_id
      AND report.membership_id = v_membership.id
      AND report.student_id = v_membership.student_id
      AND report.teacher_id = p_user_id
      AND report.game = v_scope->>'game'
      AND report.display_exam_ref = v_scope->>'displayExamRef'
      AND report.question_exam_ref IS NOT DISTINCT FROM
        NULLIF(v_scope->>'questionExamRef', '')
      AND report.taxonomy_version = v_scope->>'taxonomyVersion'
      AND report.scope_policy_version = v_scope->>'scopePolicyVersion';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'student report request scope mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object(
      'scope', jsonb_build_object(
        'game', v_scope->>'game',
        'examRef', v_scope->>'displayExamRef',
        'questionExamRef', v_scope->'questionExamRef',
        'taxonomyVersion', v_scope->>'taxonomyVersion',
        'scopePolicyVersion', v_scope->>'scopePolicyVersion'
      ),
      'replayed', true
    );
  END IF;

  INSERT INTO public.institution_student_reports(
    institution_id, classroom_id, membership_id, student_id, teacher_id,
    model_version, period_start, period_end, snapshot,
    game, display_exam_ref, question_exam_ref, taxonomy_version,
    scope_policy_version
  ) VALUES (
    v_classroom.institution_id, p_classroom_id, v_membership.id,
    v_membership.student_id, p_user_id, 'institution-student-report-v1',
    v_period_start, v_period_end, p_snapshot,
    v_scope->>'game', v_scope->>'displayExamRef',
    NULLIF(v_scope->>'questionExamRef', ''), v_scope->>'taxonomyVersion',
    v_scope->>'scopePolicyVersion'
  ) RETURNING * INTO v_report;
  v_result := jsonb_build_object(
    'reportRef', v_report.report_ref,
    'scope', jsonb_build_object(
      'game', v_scope->>'game',
      'examRef', v_scope->>'displayExamRef',
      'questionExamRef', v_scope->'questionExamRef',
      'taxonomyVersion', v_scope->>'taxonomyVersion',
      'scopePolicyVersion', v_scope->>'scopePolicyVersion'
    ),
    'snapshot', v_report.snapshot,
    'createdAt', v_report.created_at,
    'replayed', false
  );
  INSERT INTO public.pilot_institution_requests(
    user_id, operation, request_id, payload_hash, result
  ) VALUES (
    p_user_id, 'create_student_report', p_request_id, v_hash, v_result
  );
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_institution_student_report(
  p_user_id uuid,
  p_classroom_id uuid,
  p_member_ref text,
  p_snapshot jsonb,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_scope jsonb;
  v_snapshot jsonb;
BEGIN
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  v_scope := public.institution_scope_capability_snapshot(
    'matematik', 'TYT', 'report'
  );
  IF jsonb_typeof(p_snapshot->'scope') IS DISTINCT FROM 'object'
    OR ((p_snapshot#>>'{scope,game}') IS NOT NULL
      AND (p_snapshot#>>'{scope,game}') <> 'matematik')
    OR ((p_snapshot#>>'{scope,examRef}') IS NOT NULL
      AND (p_snapshot#>>'{scope,examRef}') <> 'TYT') THEN
    RAISE EXCEPTION 'legacy institution report supports only TYT Mathematics'
      USING ERRCODE = '22023';
  END IF;

  v_snapshot := jsonb_set(
    p_snapshot,
    '{scope}',
    p_snapshot->'scope' || jsonb_build_object(
      'game', v_scope->>'game',
      'examRef', v_scope->>'displayExamRef',
      'questionExamRef', v_scope->'questionExamRef',
      'taxonomyVersion', v_scope->>'taxonomyVersion',
      'scopePolicyVersion', v_scope->>'scopePolicyVersion'
    ),
    true
  );
  RETURN public.create_institution_student_report_v2(
    p_user_id, p_classroom_id, p_member_ref,
    'matematik', 'TYT', v_snapshot, p_request_id
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_institution_student_reports_v2(
  p_user_id uuid,
  p_classroom_id uuid,
  p_member_ref text,
  p_game text,
  p_display_exam_ref text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_membership public.teacher_classroom_memberships%ROWTYPE;
  v_scope jsonb;
  v_reports jsonb;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL
    OR p_member_ref IS NULL OR p_member_ref !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'invalid institution report scope' USING ERRCODE = '22023';
  END IF;
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  v_scope := public.institution_scope_capability_snapshot(
    p_game, p_display_exam_ref, 'report'
  );
  SELECT * INTO v_classroom FROM public.teacher_classrooms
  WHERE id = p_classroom_id AND teacher_id = p_user_id AND status = 'active';
  IF NOT FOUND OR NOT public.institution_pilot_has_role(
    p_user_id, v_classroom.institution_id, ARRAY['manager','teacher']::text[]
  ) THEN
    RAISE EXCEPTION 'assigned institution teacher required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_membership
  FROM public.teacher_classroom_memberships
  WHERE classroom_id = p_classroom_id
    AND member_ref = p_member_ref
    AND status = 'active';
  IF NOT FOUND OR public.teacher_classroom_is_blocked(
    p_user_id, v_membership.student_id
  ) THEN
    RAISE EXCEPTION 'active classroom member not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'reportRef', report.report_ref,
    'scope', jsonb_build_object(
      'game', report.game,
      'examRef', report.display_exam_ref,
      'questionExamRef', report.question_exam_ref,
      'taxonomyVersion', report.taxonomy_version,
      'scopePolicyVersion', report.scope_policy_version
    ),
    'snapshot', report.snapshot,
    'createdAt', report.created_at
  ) ORDER BY report.created_at DESC), '[]'::jsonb)
  INTO v_reports
  FROM (
    SELECT *
    FROM public.institution_student_reports AS stored
    WHERE stored.institution_id = v_classroom.institution_id
      AND stored.classroom_id = p_classroom_id
      AND stored.membership_id = v_membership.id
      AND stored.student_id = v_membership.student_id
      AND stored.teacher_id = p_user_id
      AND stored.game = v_scope->>'game'
      AND stored.display_exam_ref = v_scope->>'displayExamRef'
      AND stored.question_exam_ref IS NOT DISTINCT FROM
        NULLIF(v_scope->>'questionExamRef', '')
      AND stored.taxonomy_version = v_scope->>'taxonomyVersion'
      AND stored.scope_policy_version = v_scope->>'scopePolicyVersion'
    ORDER BY stored.created_at DESC
    LIMIT 10
  ) AS report;
  RETURN jsonb_build_object(
    'scope', jsonb_build_object(
      'game', v_scope->>'game',
      'examRef', v_scope->>'displayExamRef',
      'questionExamRef', v_scope->'questionExamRef',
      'taxonomyVersion', v_scope->>'taxonomyVersion',
      'scopePolicyVersion', v_scope->>'scopePolicyVersion'
    ),
    'reports', v_reports
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_institution_student_reports(
  p_user_id uuid,
  p_classroom_id uuid,
  p_member_ref text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  RETURN public.get_institution_student_reports_v2(
    p_user_id, p_classroom_id, p_member_ref, 'matematik', 'TYT'
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_institution_study_program_draft_v2(
  p_user_id uuid,
  p_classroom_id uuid,
  p_member_ref text,
  p_game text,
  p_display_exam_ref text,
  p_week_start date,
  p_daily_minute_limit integer,
  p_model_version text,
  p_items jsonb,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_membership public.teacher_classroom_memberships%ROWTYPE;
  v_program public.institution_study_programs%ROWTYPE;
  v_request public.pilot_institution_requests%ROWTYPE;
  v_scope jsonb;
  v_hash text;
  v_legacy_hash text;
  v_result jsonb;
  v_count integer;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_request_id IS NULL
    OR p_member_ref IS NULL OR p_member_ref !~ '^[0-9a-f]{32}$'
    OR p_week_start IS NULL OR extract(isodow FROM p_week_start) <> 1
    OR p_week_start < current_date - 7 OR p_week_start > current_date + 42
    OR p_daily_minute_limit NOT BETWEEN 20 AND 120
    OR p_model_version IS DISTINCT FROM 'institution-program-v1'
    OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
    OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 21 THEN
    RAISE EXCEPTION 'invalid institution study program draft'
      USING ERRCODE = '22023';
  END IF;
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  v_scope := public.institution_scope_capability_snapshot(
    p_game, p_display_exam_ref, 'program'
  );

  SELECT * INTO v_classroom FROM public.teacher_classrooms
  WHERE id = p_classroom_id AND teacher_id = p_user_id AND status = 'active';
  IF NOT FOUND OR NOT public.institution_pilot_has_role(
    p_user_id, v_classroom.institution_id, ARRAY['manager','teacher']::text[]
  ) THEN
    RAISE EXCEPTION 'assigned institution teacher required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_membership FROM public.teacher_classroom_memberships
  WHERE classroom_id = p_classroom_id
    AND member_ref = p_member_ref
    AND status = 'active';
  IF NOT FOUND OR public.teacher_classroom_is_blocked(
    p_user_id, v_membership.student_id
  ) THEN
    RAISE EXCEPTION 'active classroom member not found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS item(value, ordinal)
    WHERE jsonb_typeof(value) <> 'object'
      OR (value->>'position') !~ '^(?:[1-9]|1[0-9]|2[01])$'
      OR (value->>'position')::integer <> ordinal
      OR (value->>'scheduledDate') !~ '^\d{4}-\d{2}-\d{2}$'
      OR (value->>'scheduledDate')::date < p_week_start
      OR (value->>'scheduledDate')::date >= p_week_start + 7
      OR value->>'taskType' NOT IN (
        'verified_questions', 'fsrs_review', 'diagnostic', 'paper_pack'
      )
      OR char_length(btrim(value->>'title')) NOT BETWEEN 2 AND 120
      OR value->>'reasonCode' NOT IN (
        'weak_outcome', 'due_review', 'diagnostic_gap', 'current_target', 'challenge'
      )
      OR (value->>'durationMinutes') !~ '^\d+$'
      OR (value->>'durationMinutes')::integer NOT BETWEEN 5 AND 60
      OR (value->>'targetQuestionCount') IS NOT NULL
        AND ((value->>'targetQuestionCount') !~ '^\d+$'
          OR (value->>'targetQuestionCount')::integer NOT BETWEEN 1 AND 50)
      OR value ?| ARRAY['studentId', 'userId', 'answerId', 'questionId']
  ) THEN
    RAISE EXCEPTION 'invalid institution study program items'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS item(value)
    GROUP BY value->>'scheduledDate'
    HAVING count(*) > 3
      OR sum((value->>'durationMinutes')::integer) > p_daily_minute_limit
  ) THEN
    RAISE EXCEPTION 'institution study program daily limit exceeded'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS item(value)
    WHERE value->>'taskType' = 'diagnostic'
  ) AND NOT COALESCE((v_scope->>'diagnosticEnabled')::boolean, false) THEN
    RAISE EXCEPTION 'adaptive diagnostic is unavailable for released taxonomy'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS item(value)
    WHERE NULLIF(btrim(value->>'outcomeCode'), '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.curriculum_outcomes AS outcome
        WHERE outcome.code = btrim(value->>'outcomeCode')
          AND outcome.game = v_scope->>'game'
          AND outcome.exam_ref = v_scope->>'displayExamRef'
          AND outcome.taxonomy_version = v_scope->>'taxonomyVersion'
          AND outcome.is_active
      )
  ) THEN
    RAISE EXCEPTION 'institution study program target is outside released taxonomy'
      USING ERRCODE = '22023';
  END IF;

  v_hash := public.institution_pilot_payload_hash(jsonb_build_object(
    'classroomId', p_classroom_id,
    'memberRef', p_member_ref,
    'weekStart', p_week_start,
    'dailyMinuteLimit', p_daily_minute_limit,
    'modelVersion', p_model_version,
    'items', p_items,
    'game', v_scope->>'game',
    'displayExamRef', v_scope->>'displayExamRef',
    'questionExamRef', v_scope->'questionExamRef',
    'taxonomyVersion', v_scope->>'taxonomyVersion',
    'scopePolicyVersion', v_scope->>'scopePolicyVersion'
  ));
  v_legacy_hash := public.institution_pilot_payload_hash(jsonb_build_object(
    'classroomId', p_classroom_id,
    'memberRef', p_member_ref,
    'weekStart', p_week_start,
    'dailyMinuteLimit', p_daily_minute_limit,
    'modelVersion', p_model_version,
    'items', p_items,
    'taxonomyVersion', v_scope->>'taxonomyVersion'
  ));
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':program-draft:' || p_request_id::text, 0)
  );
  SELECT * INTO v_request
  FROM public.pilot_institution_requests
  WHERE user_id = p_user_id
    AND operation = 'create_study_program_draft'
    AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash IS DISTINCT FROM v_hash
      AND v_request.payload_hash IS DISTINCT FROM v_legacy_hash THEN
      RAISE EXCEPTION 'program draft request payload mismatch'
        USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_program
    FROM public.institution_study_programs AS program
    WHERE program.program_ref = v_request.result->>'programRef'
      AND program.teacher_id = p_user_id
      AND program.classroom_id = p_classroom_id
      AND program.membership_id = v_membership.id
      AND program.game = v_scope->>'game'
      AND program.display_exam_ref = v_scope->>'displayExamRef'
      AND program.question_exam_ref IS NOT DISTINCT FROM
        NULLIF(v_scope->>'questionExamRef', '')
      AND program.taxonomy_version = v_scope->>'taxonomyVersion'
      AND program.scope_policy_version = v_scope->>'scopePolicyVersion';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'program draft request scope mismatch'
        USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object(
      'scope', jsonb_build_object(
        'game', v_scope->>'game',
        'examRef', v_scope->>'displayExamRef',
        'questionExamRef', v_scope->'questionExamRef',
        'taxonomyVersion', v_scope->>'taxonomyVersion',
        'scopePolicyVersion', v_scope->>'scopePolicyVersion'
      ),
      'replayed', true
    );
  END IF;

  v_count := jsonb_array_length(p_items);
  INSERT INTO public.institution_study_programs(
    institution_id, classroom_id, membership_id, student_id, teacher_id,
    week_start, daily_minute_limit, model_version, item_count,
    game, display_exam_ref, question_exam_ref, taxonomy_version,
    scope_policy_version
  ) VALUES (
    v_classroom.institution_id, v_classroom.id, v_membership.id,
    v_membership.student_id, p_user_id, p_week_start,
    p_daily_minute_limit, p_model_version, v_count,
    v_scope->>'game', v_scope->>'displayExamRef',
    NULLIF(v_scope->>'questionExamRef', ''), v_scope->>'taxonomyVersion',
    v_scope->>'scopePolicyVersion'
  ) RETURNING * INTO v_program;
  INSERT INTO public.institution_study_program_items(
    program_id, position, scheduled_date, task_type, title, reason_code,
    outcome_code, duration_minutes, target_question_count
  )
  SELECT v_program.id,
    (value->>'position')::smallint,
    (value->>'scheduledDate')::date,
    value->>'taskType',
    btrim(value->>'title'),
    value->>'reasonCode',
    NULLIF(btrim(value->>'outcomeCode'), ''),
    (value->>'durationMinutes')::smallint,
    NULLIF(value->>'targetQuestionCount', '')::smallint
  FROM jsonb_array_elements(p_items) AS item(value);
  v_result := jsonb_build_object(
    'programRef', v_program.program_ref,
    'status', 'draft',
    'scope', jsonb_build_object(
      'game', v_scope->>'game',
      'examRef', v_scope->>'displayExamRef',
      'questionExamRef', v_scope->'questionExamRef',
      'taxonomyVersion', v_scope->>'taxonomyVersion',
      'scopePolicyVersion', v_scope->>'scopePolicyVersion'
    ),
    'weekStart', v_program.week_start,
    'dailyMinuteLimit', v_program.daily_minute_limit,
    'modelVersion', v_program.model_version,
    'itemCount', v_program.item_count,
    'createdAt', v_program.created_at,
    'reviewedAt', NULL,
    'publishedAt', NULL,
    'replayed', false
  );
  INSERT INTO public.pilot_institution_requests(
    user_id, operation, request_id, payload_hash, result
  ) VALUES (
    p_user_id, 'create_study_program_draft', p_request_id, v_hash, v_result
  );
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_institution_study_program_draft(
  p_user_id uuid,
  p_classroom_id uuid,
  p_member_ref text,
  p_week_start date,
  p_daily_minute_limit integer,
  p_model_version text,
  p_items jsonb,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_program public.institution_study_programs%ROWTYPE;
  v_request public.pilot_institution_requests%ROWTYPE;
  v_hash text;
  v_legacy_hash text;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_request_id IS NULL
    OR p_member_ref IS NULL OR p_member_ref !~ '^[0-9a-f]{32}$'
    OR p_week_start IS NULL OR extract(isodow FROM p_week_start) <> 1
    OR p_week_start < current_date - 7 OR p_week_start > current_date + 42
    OR p_daily_minute_limit NOT BETWEEN 20 AND 120
    OR p_model_version IS DISTINCT FROM 'institution-program-v1'
    OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
    OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 21 THEN
    RAISE EXCEPTION 'invalid institution study program draft'
      USING ERRCODE = '22023';
  END IF;
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':program-draft:' || p_request_id::text, 0)
  );
  SELECT * INTO v_request
  FROM public.pilot_institution_requests
  WHERE user_id = p_user_id
    AND operation = 'create_study_program_draft'
    AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    SELECT program.* INTO v_program
    FROM public.institution_study_programs AS program
    JOIN public.teacher_classroom_memberships AS membership
      ON membership.id = program.membership_id
      AND membership.classroom_id = program.classroom_id
      AND membership.student_id = program.student_id
      AND membership.status = 'active'
    JOIN public.teacher_classrooms AS classroom
      ON classroom.id = program.classroom_id
      AND classroom.institution_id = program.institution_id
      AND classroom.teacher_id = p_user_id
      AND classroom.status = 'active'
    WHERE program.program_ref = v_request.result->>'programRef'
      AND program.teacher_id = p_user_id
      AND program.classroom_id = p_classroom_id
      AND membership.member_ref = p_member_ref
      AND program.game = 'matematik'
      AND program.display_exam_ref = 'TYT';
    IF NOT FOUND OR NOT public.institution_pilot_has_role(
      p_user_id, v_program.institution_id, ARRAY['manager','teacher']::text[]
    ) THEN
      RAISE EXCEPTION 'program draft request scope mismatch'
        USING ERRCODE = '22023';
    END IF;

    v_hash := public.institution_pilot_payload_hash(jsonb_build_object(
      'classroomId', p_classroom_id,
      'memberRef', p_member_ref,
      'weekStart', p_week_start,
      'dailyMinuteLimit', p_daily_minute_limit,
      'modelVersion', p_model_version,
      'items', p_items,
      'game', v_program.game,
      'displayExamRef', v_program.display_exam_ref,
      'questionExamRef', to_jsonb(v_program.question_exam_ref),
      'taxonomyVersion', v_program.taxonomy_version,
      'scopePolicyVersion', v_program.scope_policy_version
    ));
    v_legacy_hash := public.institution_pilot_payload_hash(jsonb_build_object(
      'classroomId', p_classroom_id,
      'memberRef', p_member_ref,
      'weekStart', p_week_start,
      'dailyMinuteLimit', p_daily_minute_limit,
      'modelVersion', p_model_version,
      'items', p_items,
      'taxonomyVersion', v_program.taxonomy_version
    ));
    IF v_request.payload_hash IS DISTINCT FROM v_hash
      AND v_request.payload_hash IS DISTINCT FROM v_legacy_hash THEN
      RAISE EXCEPTION 'program draft request payload mismatch'
        USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object(
      'scope', jsonb_build_object(
        'game', v_program.game,
        'examRef', v_program.display_exam_ref,
        'questionExamRef', to_jsonb(v_program.question_exam_ref),
        'taxonomyVersion', v_program.taxonomy_version,
        'scopePolicyVersion', v_program.scope_policy_version
      ),
      'replayed', true
    );
  END IF;

  BEGIN
    RETURN public.create_institution_study_program_draft_v2(
      p_user_id, p_classroom_id, p_member_ref, 'matematik', 'TYT',
      p_week_start, p_daily_minute_limit, p_model_version, p_items, p_request_id
    );
  EXCEPTION WHEN check_violation THEN
    -- Preserve the legacy RPC's input-error contract while v2 deliberately
    -- exposes a fail-closed integrity/drift check violation to new callers.
    RAISE EXCEPTION 'institution study program scope is unavailable'
      USING ERRCODE = '22023';
  END;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_institution_student_program_history_v2(
  p_user_id uuid,
  p_classroom_id uuid,
  p_member_ref text,
  p_game text,
  p_display_exam_ref text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_membership public.teacher_classroom_memberships%ROWTYPE;
  v_scope jsonb;
  v_programs jsonb;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL
    OR p_member_ref IS NULL OR p_member_ref !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'invalid institution program history scope'
      USING ERRCODE = '22023';
  END IF;
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  v_scope := public.institution_scope_capability_snapshot(
    p_game, p_display_exam_ref, 'program'
  );
  SELECT * INTO v_classroom FROM public.teacher_classrooms
  WHERE id = p_classroom_id AND teacher_id = p_user_id AND status = 'active';
  IF NOT FOUND OR NOT public.institution_pilot_has_role(
    p_user_id, v_classroom.institution_id, ARRAY['manager','teacher']::text[]
  ) THEN
    RAISE EXCEPTION 'assigned institution teacher required' USING ERRCODE = '42501';
  END IF;
  SELECT membership.* INTO v_membership
  FROM public.teacher_classroom_memberships AS membership
  JOIN public.profiles AS profile
    ON profile.id = membership.student_id AND profile.deleted_at IS NULL
  WHERE membership.classroom_id = p_classroom_id
    AND membership.member_ref = p_member_ref
    AND membership.status = 'active';
  IF NOT FOUND OR public.teacher_classroom_is_blocked(
    p_user_id, v_membership.student_id
  ) THEN
    RAISE EXCEPTION 'active classroom member not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'programRef', scoped.program_ref,
    'scope', jsonb_build_object(
      'game', scoped.game,
      'examRef', scoped.display_exam_ref,
      'questionExamRef', scoped.question_exam_ref,
      'taxonomyVersion', scoped.taxonomy_version,
      'scopePolicyVersion', scoped.scope_policy_version
    ),
    'status', scoped.status,
    'weekStart', scoped.week_start,
    'itemCount', scoped.item_count,
    'publishedAt', scoped.published_at,
    'reviewEligible', current_date >= scoped.week_start + 14,
    'review', CASE WHEN scoped.review_ref IS NULL THEN NULL ELSE jsonb_build_object(
      'reviewRef', scoped.review_ref,
      'teacherResult', scoped.teacher_result,
      'systemSuggestion', scoped.system_suggestion,
      'evidence', scoped.evidence,
      'note', scoped.note,
      'reviewedAt', scoped.reviewed_at
    ) END
  ) ORDER BY scoped.week_start DESC), '[]'::jsonb)
  INTO v_programs
  FROM (
    SELECT program.program_ref, program.game, program.display_exam_ref,
      program.question_exam_ref, program.taxonomy_version,
      program.scope_policy_version, program.status, program.week_start,
      program.item_count, program.published_at,
      review.review_ref, review.teacher_result, review.system_suggestion,
      review.evidence, review.note, review.reviewed_at
    FROM public.institution_study_programs AS program
    LEFT JOIN public.institution_study_program_reviews AS review
      ON review.program_id = program.id
    WHERE program.institution_id = v_classroom.institution_id
      AND program.classroom_id = p_classroom_id
      AND program.membership_id = v_membership.id
      AND program.student_id = v_membership.student_id
      AND program.teacher_id = p_user_id
      AND program.game = v_scope->>'game'
      AND program.display_exam_ref = v_scope->>'displayExamRef'
      AND program.question_exam_ref IS NOT DISTINCT FROM
        NULLIF(v_scope->>'questionExamRef', '')
      AND program.taxonomy_version = v_scope->>'taxonomyVersion'
      AND program.scope_policy_version = v_scope->>'scopePolicyVersion'
      AND program.status IN ('published', 'completed')
    ORDER BY program.week_start DESC
    LIMIT 8
  ) AS scoped;
  RETURN jsonb_build_object(
    'scope', jsonb_build_object(
      'game', v_scope->>'game',
      'examRef', v_scope->>'displayExamRef',
      'questionExamRef', v_scope->'questionExamRef',
      'taxonomyVersion', v_scope->>'taxonomyVersion',
      'scopePolicyVersion', v_scope->>'scopePolicyVersion'
    ),
    'programs', v_programs
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_institution_student_program_history(
  p_user_id uuid,
  p_classroom_id uuid,
  p_member_ref text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  RETURN public.get_institution_student_program_history_v2(
    p_user_id, p_classroom_id, p_member_ref, 'matematik', 'TYT'
  );
END;
$fn$;

REVOKE ALL ON FUNCTION
  public.tg_guard_institution_scope_capability(),
  public.institution_scope_integrity_is_clean(jsonb),
  public.institution_scope_capability_snapshot(text, text, text),
  public.resolve_released_institution_scope(text, text),
  public.list_released_institution_scopes(),
  public.get_institution_student_learning_analysis_v2(uuid, uuid, text, text, text, timestamptz),
  public.get_institution_classroom_growth_metrics_v2(uuid, uuid, text, text, timestamptz),
  public.get_institution_classroom_published_program_members_v2(uuid, uuid, text, text, timestamptz, timestamptz),
  public.get_institution_classroom_followup_metrics_v2(uuid, uuid, text, text, timestamptz, timestamptz),
  public.create_institution_student_report_v2(uuid, uuid, text, text, text, jsonb, uuid),
  public.get_institution_student_reports_v2(uuid, uuid, text, text, text),
  public.create_institution_study_program_draft_v2(uuid, uuid, text, text, text, date, integer, text, jsonb, uuid),
  public.get_institution_student_program_history_v2(uuid, uuid, text, text, text),
  public.get_institution_student_learning_analysis(uuid, uuid, text, text, text, timestamptz),
  public.get_institution_classroom_growth_metrics(uuid, uuid, timestamptz),
  public.get_institution_classroom_growth_metrics(uuid, uuid, timestamptz, text),
  public.get_institution_classroom_published_program_members(uuid, uuid, timestamptz, timestamptz),
  public.get_institution_classroom_followup_metrics(uuid, uuid, timestamptz, timestamptz),
  public.create_institution_student_report(uuid, uuid, text, jsonb, uuid),
  public.get_institution_student_reports(uuid, uuid, text),
  public.create_institution_study_program_draft(uuid, uuid, text, date, integer, text, jsonb, uuid),
  public.get_institution_student_program_history(uuid, uuid, text)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.resolve_released_institution_scope(text, text),
  public.list_released_institution_scopes(),
  public.get_institution_student_learning_analysis_v2(uuid, uuid, text, text, text, timestamptz),
  public.get_institution_classroom_growth_metrics_v2(uuid, uuid, text, text, timestamptz),
  public.get_institution_classroom_published_program_members_v2(uuid, uuid, text, text, timestamptz, timestamptz),
  public.get_institution_classroom_followup_metrics_v2(uuid, uuid, text, text, timestamptz, timestamptz),
  public.create_institution_student_report_v2(uuid, uuid, text, text, text, jsonb, uuid),
  public.get_institution_student_reports_v2(uuid, uuid, text, text, text),
  public.create_institution_study_program_draft_v2(uuid, uuid, text, text, text, date, integer, text, jsonb, uuid),
  public.get_institution_student_program_history_v2(uuid, uuid, text, text, text)
TO authenticated, service_role;

-- Preserve the deployed compatibility surface. The wrappers remain bounded to
-- Math/TYT and retain migration 159's authenticated AAL2 contract.
GRANT EXECUTE ON FUNCTION
  public.get_institution_student_learning_analysis(uuid, uuid, text, text, text, timestamptz),
  public.get_institution_classroom_growth_metrics(uuid, uuid, timestamptz),
  public.get_institution_classroom_published_program_members(uuid, uuid, timestamptz, timestamptz),
  public.get_institution_classroom_followup_metrics(uuid, uuid, timestamptz, timestamptz),
  public.create_institution_student_report(uuid, uuid, text, jsonb, uuid),
  public.get_institution_student_reports(uuid, uuid, text),
  public.create_institution_study_program_draft(uuid, uuid, text, date, integer, text, jsonb, uuid),
  public.get_institution_student_program_history(uuid, uuid, text)
TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.get_institution_classroom_growth_metrics(uuid, uuid, timestamptz, text)
TO service_role;

-- Migration-local postchecks: the scope owned by this migration is exact and
-- all forward RPCs require an authenticated AAL2 institution actor (or the
-- trusted service role). Later proof migrations may add scopes, so
-- replay deliberately does not assert a global released-row count.
DO $fn$
DECLARE
  v_math_scope jsonb;
BEGIN
  v_math_scope := public.institution_scope_capability_snapshot(
    'matematik', 'TYT', 'analysis'
  );
  IF v_math_scope->>'taxonomyVersion' IS DISTINCT FROM 'ba-tyt-math-v1'
    OR v_math_scope->>'scopePolicyVersion' IS DISTINCT FROM 'institution-scope-v1' THEN
    RAISE EXCEPTION 'institution scope release postcheck failed'
      USING ERRCODE = '23514';
  END IF;
  IF NOT has_function_privilege(
      'authenticated',
      'public.get_institution_student_learning_analysis_v2(uuid,uuid,text,text,text,timestamptz)',
      'EXECUTE'
    ) OR has_function_privilege(
      'anon',
      'public.list_released_institution_scopes()',
      'EXECUTE'
    ) OR NOT has_function_privilege(
      'authenticated',
      'public.resolve_released_institution_scope(text,text)',
      'EXECUTE'
    ) OR NOT has_function_privilege(
      'service_role',
      'public.resolve_released_institution_scope(text,text)',
      'EXECUTE'
    ) THEN
    RAISE EXCEPTION 'institution scope RPC privilege postcheck failed'
      USING ERRCODE = '42501';
  END IF;
END;
$fn$;

NOTIFY pgrst, 'reload schema';
COMMIT;
