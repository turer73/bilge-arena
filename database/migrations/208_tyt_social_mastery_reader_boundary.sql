-- Migration 208: TYT Social branch-aware mastery reader boundary.
--
-- The generic user_outcome_state aggregate has no candidate-policy dimension.
-- Reading it for TYT Social would mix pre-policy evidence, retired policy
-- versions and a learner's superseded 16-20 / 21-25 selection.  This migration
-- installs a service-only reader that recomputes the public mastery state from
-- immutable evidence and the exact current policy-selection snapshot.
--
-- Historical evidence without a complete snapshot is deliberately not
-- backfilled here.  It remains an explicit release blocker for a later,
-- reviewed rebuild/disposition migration.  Evidence that has a valid historic
-- snapshot but belongs to a superseded selection remains immutable and is
-- safely excluded from the current map.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '15min';

-- A completion can occur long after an attempt was issued.  Re-run the 206
-- semantic assertion at completion so an attempt opened while the scope was
-- validating cannot cross a later release boundary without its snapshot.
DROP TRIGGER IF EXISTS trg_tyt_social_attempt_snapshot_on_completion
  ON public.verified_attempts;
CREATE CONSTRAINT TRIGGER trg_tyt_social_attempt_snapshot_on_completion
AFTER UPDATE OF completed_at, session_id ON public.verified_attempts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (NEW.completed_at IS NOT NULL AND NEW.session_id IS NOT NULL)
EXECUTE FUNCTION public.tg_assert_tyt_social_attempt_snapshot_integrity();

-- The completion trigger covers the normal application path.  This evidence
-- trigger also closes direct service backfill/materializer paths that do not
-- update the attempt row again after a scope is released.
CREATE OR REPLACE FUNCTION public.tg_require_tyt_social_mastery_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.curriculum_outcomes AS outcome
    JOIN public.curriculum_scope_releases AS scope
      ON scope.game = outcome.game
     AND scope.display_exam_ref = upper(btrim(COALESCE(outcome.exam_ref, '')))
     AND scope.taxonomy_version = outcome.taxonomy_version
     AND scope.release_status = 'released'
    WHERE outcome.id = NEW.outcome_id
      AND outcome.game = 'sosyal'
      AND upper(btrim(COALESCE(outcome.exam_ref, ''))) = 'TYT'
      AND outcome.taxonomy_version = 'ba-tyt-sosyal-v1'
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM public.assert_tyt_social_attempt_snapshot_integrity(NEW.attempt_id);

  IF NOT EXISTS (
    SELECT 1
    FROM public.curriculum_outcomes AS outcome
    JOIN public.verified_attempt_candidate_policy_snapshots AS header
      ON header.attempt_id = NEW.attempt_id
     AND header.user_id = NEW.user_id
    JOIN public.exam_candidate_policy_variants AS variant
      ON variant.policy_version = header.policy_version
     AND variant.variant_code = header.variant_code
    JOIN public.verified_attempt_question_exam_role_snapshots AS item
      ON item.attempt_id = header.attempt_id
     AND item.policy_version = header.policy_version
     AND item.question_id = NEW.question_id
     AND item.gradeable
     AND item.exam_role = ANY(variant.allowed_roles)
    JOIN public.verified_attempt_question_revisions AS revision_snapshot
      ON revision_snapshot.attempt_id = item.attempt_id
     AND revision_snapshot.position = item.position
     AND revision_snapshot.question_id = item.question_id
     AND revision_snapshot.revision_id = item.revision_id
     AND revision_snapshot.game = 'sosyal'
     AND upper(btrim(COALESCE(revision_snapshot.exam_ref, ''))) = 'TYT'
    JOIN public.session_answers AS answer
      ON answer.id = NEW.answer_id
     AND answer.user_id = NEW.user_id
     AND answer.session_id = NEW.session_id
     AND answer.question_id = NEW.question_id
     AND answer.question_revision_id = revision_snapshot.revision_id
     AND NOT COALESCE(answer.is_skipped, false)
    WHERE outcome.id = NEW.outcome_id
      AND outcome.is_active
      AND outcome.game = 'sosyal'
      AND upper(btrim(COALESCE(outcome.exam_ref, ''))) = 'TYT'
      AND outcome.taxonomy_version = 'ba-tyt-sosyal-v1'
      AND outcome.category IS NOT DISTINCT FROM revision_snapshot.category
      AND public.tyt_social_exam_role_compatible(
        revision_snapshot.category, item.exam_role
      )
  ) THEN
    RAISE EXCEPTION 'released TYT Social mastery evidence requires exact policy, event, revision and role snapshots'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS aab_require_tyt_social_mastery_snapshot
  ON public.mastery_outcome_evidence;
CREATE TRIGGER aab_require_tyt_social_mastery_snapshot
BEFORE INSERT ON public.mastery_outcome_evidence
FOR EACH ROW
EXECUTE FUNCTION public.tg_require_tyt_social_mastery_snapshot();

-- Extend the immutable capability ledger without weakening the existing 206
-- snapshot-boundary entry.
ALTER TABLE public.tyt_social_policy_capabilities
  DROP CONSTRAINT IF EXISTS tyt_social_policy_capabilities_capability_check;
ALTER TABLE public.tyt_social_policy_capabilities
  ADD CONSTRAINT tyt_social_policy_capabilities_capability_check
  CHECK (capability IN ('snapshot_boundary_v1','mastery_reader_v1'));

CREATE OR REPLACE FUNCTION public.tyt_social_mastery_reader_integrity()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_context_oid oid;
  v_reader_oid oid;
  v_completion_trigger_oid oid;
  v_evidence_trigger_oid oid;
  v_release_guard_trigger_oid oid;
  v_context_config text[];
  v_reader_config text[];
  v_manifest_sha256 text;
  v_capability_ready boolean := false;
  v_acl_ready boolean := false;
  v_completion_trigger_ready boolean := false;
  v_evidence_trigger_ready boolean := false;
  v_release_guard_ready boolean := false;
  v_scoped_evidence_count integer := 0;
  v_snapshot_bound_count integer := 0;
  v_current_context_count integer := 0;
  v_historical_excluded_count integer := 0;
  v_unresolved_count integer := 0;
BEGIN
  v_context_oid := to_regprocedure(
    'public.resolve_tyt_social_mastery_read_context(uuid)'
  );
  v_reader_oid := to_regprocedure(
    'public.read_tyt_social_mastery_outcome_state(uuid)'
  );

  IF v_context_oid IS NOT NULL AND v_reader_oid IS NOT NULL THEN
    SELECT procedure_row.proconfig INTO v_context_config
    FROM pg_catalog.pg_proc AS procedure_row
    WHERE procedure_row.oid = v_context_oid;
    SELECT procedure_row.proconfig INTO v_reader_config
    FROM pg_catalog.pg_proc AS procedure_row
    WHERE procedure_row.oid = v_reader_oid;

    v_acl_ready :=
      'search_path=pg_catalog' = ANY(COALESCE(v_context_config, ARRAY[]::text[]))
      AND 'search_path=pg_catalog' = ANY(COALESCE(v_reader_config, ARRAY[]::text[]))
      AND NOT pg_catalog.has_function_privilege(
        'anon', v_context_oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'authenticated', v_context_oid, 'EXECUTE'
      )
      AND pg_catalog.has_function_privilege(
        'service_role', v_context_oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'anon', v_reader_oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'authenticated', v_reader_oid, 'EXECUTE'
      )
      AND pg_catalog.has_function_privilege(
        'service_role', v_reader_oid, 'EXECUTE'
      );
  END IF;

  SELECT trigger_row.oid INTO v_completion_trigger_oid
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE trigger_row.tgrelid = 'public.verified_attempts'::regclass
    AND trigger_row.tgname = 'trg_tyt_social_attempt_snapshot_on_completion'
    AND NOT trigger_row.tgisinternal
    AND trigger_row.tgenabled <> 'D'
    AND trigger_row.tgdeferrable
    AND trigger_row.tginitdeferred;
  v_completion_trigger_ready := v_completion_trigger_oid IS NOT NULL;

  SELECT trigger_row.oid INTO v_evidence_trigger_oid
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE trigger_row.tgrelid = 'public.mastery_outcome_evidence'::regclass
    AND trigger_row.tgname = 'aab_require_tyt_social_mastery_snapshot'
    AND NOT trigger_row.tgisinternal
    AND trigger_row.tgenabled <> 'D';
  v_evidence_trigger_ready := v_evidence_trigger_oid IS NOT NULL;

  SELECT trigger_row.oid INTO v_release_guard_trigger_oid
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE trigger_row.tgrelid = 'public.curriculum_scope_releases'::regclass
    AND trigger_row.tgname = 'trg_guard_tyt_social_mastery_scope_release'
    AND NOT trigger_row.tgisinternal
    AND trigger_row.tgenabled <> 'D';
  v_release_guard_ready := v_release_guard_trigger_oid IS NOT NULL;

  IF v_context_oid IS NOT NULL
     AND v_reader_oid IS NOT NULL
     AND v_completion_trigger_oid IS NOT NULL
     AND v_evidence_trigger_oid IS NOT NULL
     AND v_release_guard_trigger_oid IS NOT NULL THEN
    SELECT encode(extensions.digest(jsonb_build_object(
      'contextReader', pg_catalog.pg_get_functiondef(v_context_oid),
      'masteryStateReader', pg_catalog.pg_get_functiondef(v_reader_oid),
      'masteryEvidenceGuard', pg_catalog.pg_get_functiondef(to_regprocedure(
        'public.tg_require_tyt_social_mastery_snapshot()'
      )),
      'releaseGuard', pg_catalog.pg_get_functiondef(to_regprocedure(
        'public.tg_guard_tyt_social_mastery_scope_release()'
      )),
      'completionConstraint', pg_catalog.pg_get_triggerdef(
        v_completion_trigger_oid, true
      ),
      'masteryEvidenceConstraint', pg_catalog.pg_get_triggerdef(
        v_evidence_trigger_oid, true
      ),
      'releaseConstraint', pg_catalog.pg_get_triggerdef(
        v_release_guard_trigger_oid, true
      )
    )::text, 'sha256'), 'hex')
    INTO v_manifest_sha256;

    v_capability_ready := EXISTS (
      SELECT 1
      FROM public.tyt_social_policy_capabilities AS capability
      WHERE capability.policy_version = 'tyt-social-2026-v1'
        AND capability.capability = 'mastery_reader_v1'
        AND capability.capability_version = 1
        AND capability.manifest_sha256 = v_manifest_sha256
        AND capability.evidence @> jsonb_build_object(
          'semanticReaderCheck', 'passed',
          'currentSelectionOnly', true,
          'legacyAggregateExcluded', true,
          'completionConstraint',
            'trg_tyt_social_attempt_snapshot_on_completion',
          'masteryEvidenceConstraint',
            'aab_require_tyt_social_mastery_snapshot',
          'releaseConstraint',
            'trg_guard_tyt_social_mastery_scope_release'
        )
    );
  END IF;

  -- Classify only evidence that targets the v1 TYT Social graph.  A complete
  -- historical snapshot is safe to retain even when it is no longer the
  -- learner's current selection; only snapshot-incomplete evidence is an
  -- unresolved rebuild/disposition obligation.
  WITH scoped AS (
    SELECT
      evidence.answer_id,
      evidence.outcome_id,
      evidence.user_id,
      evidence.question_id,
      evidence.session_id,
      evidence.attempt_id,
      evidence.verified_completed_at,
      outcome.category,
      attempt.user_id AS attempt_user_id,
      attempt.game AS attempt_game,
      attempt.session_id AS attempt_session_id,
      attempt.question_ids AS attempt_question_ids,
      attempt.started_at,
      attempt.completed_at,
      marker.attempt_id AS marker_attempt_id,
      answer.user_id AS answer_user_id,
      answer.session_id AS answer_session_id,
      answer.question_id AS answer_question_id,
      answer.question_revision_id,
      answer.is_skipped AS answer_is_skipped
    FROM public.mastery_outcome_evidence AS evidence
    JOIN public.curriculum_outcomes AS outcome
      ON outcome.id = evidence.outcome_id
     AND outcome.game = 'sosyal'
     AND upper(btrim(COALESCE(outcome.exam_ref, ''))) = 'TYT'
     AND outcome.taxonomy_version = 'ba-tyt-sosyal-v1'
    LEFT JOIN public.verified_attempts AS attempt
      ON attempt.id = evidence.attempt_id
    LEFT JOIN public.mastery_materialized_attempts AS marker
      ON marker.attempt_id = attempt.id
    LEFT JOIN public.session_answers AS answer
      ON answer.id = evidence.answer_id
  ), classified AS (
    SELECT scoped.*,
      COALESCE((
        scoped.attempt_user_id IS NOT DISTINCT FROM scoped.user_id
        AND scoped.attempt_game = 'sosyal'
        AND scoped.completed_at IS NOT NULL
        AND scoped.completed_at IS NOT DISTINCT FROM scoped.verified_completed_at
        AND scoped.attempt_session_id IS NOT DISTINCT FROM scoped.session_id
        AND scoped.question_id = ANY(scoped.attempt_question_ids)
        AND scoped.marker_attempt_id IS NOT NULL
        AND scoped.answer_user_id IS NOT DISTINCT FROM scoped.user_id
        AND scoped.answer_session_id IS NOT DISTINCT FROM scoped.session_id
        AND scoped.answer_question_id IS NOT DISTINCT FROM scoped.question_id
        AND NOT COALESCE(scoped.answer_is_skipped, false)
        AND policy.policy_version IS NOT NULL
        AND event_row.id IS NOT NULL
        AND variant.variant_code IS NOT NULL
        AND item.question_id IS NOT NULL
        AND revision_snapshot.question_id IS NOT NULL
        AND item.gradeable
        AND item.exam_role = ANY(variant.allowed_roles)
        AND (
          header.artifact_kind <> 'daily_plan'
          OR (
            plan_header.plan_id IS NOT NULL
            AND plan_item.question_id IS NOT NULL
          )
        )
        AND public.tyt_social_exam_role_compatible(
          revision_snapshot.category, item.exam_role
        )
        AND revision_snapshot.category IS NOT DISTINCT FROM scoped.category
        AND header.question_set_sha256 = encode(
          extensions.digest(
            array_to_string(attempt_row.question_ids, ','), 'sha256'
          ),
          'hex'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.candidate_exam_policy_events AS later_event
          WHERE later_event.user_id = header.user_id
            AND later_event.policy_version = header.policy_version
            AND later_event.effective_at <= attempt_row.started_at
            AND (later_event.effective_at, later_event.id) >
              (header.selection_effective_at, header.selection_event_id)
        )
      ), false) AS snapshot_bound,
      COALESCE((
        current_policy.policy_version IS NOT NULL
        AND current_event.id IS NOT NULL
        AND header.policy_version = current_policy.policy_version
        AND header.selection_event_id = current_event.id
        AND header.variant_code = current_event.variant_code
      ), false) AS current_context
    FROM scoped
    LEFT JOIN public.verified_attempts AS attempt_row
      ON attempt_row.id = scoped.attempt_id
    LEFT JOIN public.verified_attempt_candidate_policy_snapshots AS header
      ON header.attempt_id = scoped.attempt_id
     AND header.user_id = scoped.user_id
     AND header.selection_effective_at <= scoped.started_at
    LEFT JOIN public.exam_candidate_policy_versions AS policy
      ON policy.policy_version = header.policy_version
     AND policy.game = 'sosyal'
     AND policy.display_exam_ref = 'TYT'
     AND policy.question_exam_ref = 'TYT'
     AND policy.taxonomy_version = 'ba-tyt-sosyal-v1'
     AND policy.status IN ('released','retired')
     AND scoped.started_at::date >= policy.valid_from
     AND (policy.valid_until IS NULL OR scoped.started_at::date < policy.valid_until)
    LEFT JOIN public.candidate_exam_policy_events AS event_row
      ON event_row.id = header.selection_event_id
     AND event_row.user_id = header.user_id
     AND event_row.policy_version = header.policy_version
     AND event_row.variant_code = header.variant_code
     AND event_row.effective_at = header.selection_effective_at
    LEFT JOIN public.exam_candidate_policy_variants AS variant
      ON variant.policy_version = header.policy_version
     AND variant.variant_code = header.variant_code
    LEFT JOIN public.daily_plan_candidate_policy_snapshots AS plan_header
      ON header.artifact_kind = 'daily_plan'
     AND plan_header.plan_id = header.source_plan_id
     AND plan_header.user_id = header.user_id
     AND plan_header.policy_version = header.policy_version
     AND plan_header.variant_code = header.variant_code
     AND plan_header.selection_event_id = header.selection_event_id
    LEFT JOIN public.verified_attempt_question_exam_role_snapshots AS item
      ON item.attempt_id = scoped.attempt_id
     AND item.policy_version = header.policy_version
     AND item.question_id = scoped.question_id
    LEFT JOIN public.daily_plan_question_exam_role_snapshots AS plan_item
      ON plan_item.plan_id = plan_header.plan_id
     AND plan_item.policy_version = plan_header.policy_version
     AND plan_item.question_id = item.question_id
     AND plan_item.revision_id = item.revision_id
     AND plan_item.exam_role = item.exam_role
    LEFT JOIN public.verified_attempt_question_revisions AS revision_snapshot
      ON revision_snapshot.attempt_id = item.attempt_id
     AND revision_snapshot.position = item.position
     AND revision_snapshot.question_id = item.question_id
     AND revision_snapshot.revision_id = item.revision_id
     AND revision_snapshot.revision_id = scoped.question_revision_id
     AND revision_snapshot.game = 'sosyal'
     AND upper(btrim(COALESCE(revision_snapshot.exam_ref, ''))) = 'TYT'
    LEFT JOIN LATERAL (
      SELECT released_policy.policy_version
      FROM public.exam_candidate_policy_versions AS released_policy
      WHERE released_policy.game = 'sosyal'
        AND released_policy.display_exam_ref = 'TYT'
        AND released_policy.question_exam_ref = 'TYT'
        AND released_policy.taxonomy_version = 'ba-tyt-sosyal-v1'
        AND released_policy.status = 'released'
        AND current_date >= released_policy.valid_from
        AND (
          released_policy.valid_until IS NULL
          OR current_date < released_policy.valid_until
        )
      ORDER BY released_policy.valid_from DESC, released_policy.policy_version DESC
      LIMIT 1
    ) AS current_policy ON true
    LEFT JOIN LATERAL (
      SELECT selection.id, selection.variant_code
      FROM public.candidate_exam_policy_events AS selection
      WHERE selection.user_id = scoped.user_id
        AND selection.policy_version = current_policy.policy_version
        AND selection.effective_at <= clock_timestamp()
      ORDER BY selection.effective_at DESC, selection.id DESC
      LIMIT 1
    ) AS current_event ON true
  )
  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE snapshot_bound)::integer,
    count(*) FILTER (WHERE snapshot_bound AND current_context)::integer,
    count(*) FILTER (WHERE snapshot_bound AND NOT current_context)::integer,
    count(*) FILTER (WHERE NOT snapshot_bound)::integer
  INTO
    v_scoped_evidence_count,
    v_snapshot_bound_count,
    v_current_context_count,
    v_historical_excluded_count,
    v_unresolved_count
  FROM classified;

  RETURN jsonb_build_object(
    'policyVersion', 'tyt-social-2026-v1',
    'readerBoundaryReady',
      v_acl_ready
      AND v_completion_trigger_ready
      AND v_evidence_trigger_ready
      AND v_release_guard_ready
      AND v_capability_ready,
    'completionConstraintReady', v_completion_trigger_ready,
    'masteryEvidenceConstraintReady', v_evidence_trigger_ready,
    'releaseConstraintReady', v_release_guard_ready,
    'aclReady', v_acl_ready,
    'capabilityManifestReady', v_capability_ready,
    'scopedEvidenceCount', v_scoped_evidence_count,
    'snapshotBoundEvidenceCount', v_snapshot_bound_count,
    'currentSelectionEvidenceCount', v_current_context_count,
    'historicalSelectionEvidenceExcludedCount', v_historical_excluded_count,
    'unresolvedLegacyEvidenceCount', v_unresolved_count,
    'rebuildRequired', v_unresolved_count > 0,
    'legacyAggregateUsed', false,
    'ready',
      v_acl_ready
      AND v_completion_trigger_ready
      AND v_evidence_trigger_ready
      AND v_release_guard_ready
      AND v_capability_ready
      AND v_unresolved_count = 0
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.resolve_tyt_social_mastery_read_context(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_policy public.exam_candidate_policy_versions%ROWTYPE;
  v_event public.candidate_exam_policy_events%ROWTYPE;
  v_variant public.exam_candidate_policy_variants%ROWTYPE;
  v_scope_released boolean := false;
  v_allowed_categories jsonb := '[]'::jsonb;
  v_available boolean := false;
  v_reason text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'unavailable',
      'available', false,
      'reason', 'subject-required',
      'allowedCategories', '[]'::jsonb
    );
  END IF;

  SELECT * INTO v_policy
  FROM public.resolve_current_tyt_social_candidate_policy();

  IF v_policy.policy_version IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.curriculum_scope_releases AS scope
      WHERE scope.game = 'sosyal'
        AND scope.display_exam_ref = 'TYT'
        AND scope.question_exam_ref = 'TYT'
        AND scope.taxonomy_version = v_policy.taxonomy_version
        AND scope.release_status = 'released'
        AND NOT scope.diagnostic_enabled
    ) INTO v_scope_released;

    SELECT * INTO v_event
    FROM public.candidate_exam_policy_events AS event_row
    WHERE event_row.user_id = p_user_id
      AND event_row.policy_version = v_policy.policy_version
      AND event_row.effective_at <= clock_timestamp()
    ORDER BY event_row.effective_at DESC, event_row.id DESC
    LIMIT 1;

    IF FOUND THEN
      SELECT * INTO STRICT v_variant
      FROM public.exam_candidate_policy_variants AS variant
      WHERE variant.policy_version = v_event.policy_version
        AND variant.variant_code = v_event.variant_code;

      SELECT COALESCE(jsonb_agg(category_row.category ORDER BY category_row.category), '[]'::jsonb)
      INTO v_allowed_categories
      FROM (VALUES
        ('tarih'), ('cografya'), ('felsefe'), ('sosyoloji'), ('din_kulturu')
      ) AS category_row(category)
      WHERE EXISTS (
        SELECT 1
        FROM unnest(v_variant.allowed_roles) AS allowed_role(role)
        WHERE public.tyt_social_exam_role_compatible(
          category_row.category, allowed_role.role
        )
      );
    END IF;
  END IF;

  v_available :=
    v_policy.policy_version IS NOT NULL
    AND v_event.id IS NOT NULL
    AND v_scope_released;

  v_reason := CASE
    WHEN v_policy.policy_version IS NULL THEN 'released-policy-missing'
    WHEN v_event.id IS NULL THEN 'selection-required'
    WHEN NOT v_scope_released THEN 'mastery-scope-not-released'
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'status', CASE
      WHEN v_available THEN 'active'
      WHEN v_event.id IS NULL THEN 'setup_required'
      ELSE 'unavailable'
    END,
    'available', v_available,
    'reason', v_reason,
    'policyVersion', v_policy.policy_version,
    'taxonomyVersion', v_policy.taxonomy_version,
    'variant', v_event.variant_code,
    'selectionEventId', v_event.id,
    'selectionEffectiveAt', v_event.effective_at,
    'allowedCategories', v_allowed_categories,
    -- A released scope can exist only after the DB release trigger proves the
    -- reader and resolves every legacy evidence gap.  Avoid a global evidence
    -- scan on every learner request; the release transition is the gate.
    'rebuildRequired', NOT v_scope_released,
    'legacyAggregateUsed', false
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.read_tyt_social_mastery_outcome_state(
  p_user_id uuid
)
RETURNS TABLE (
  outcome_id uuid,
  attempts integer,
  correct_attempts integer,
  weighted_earned numeric,
  weighted_possible numeric,
  delayed_correct integer,
  v2_attempts integer,
  difficulty_weighted_earned numeric,
  difficulty_weighted_possible numeric,
  timed_attempts integer,
  total_time_sec numeric,
  fast_wrong integer,
  hinted_attempts integer,
  hint_stage_sum integer,
  guess_annotations integer,
  careless_annotations integer,
  verified_evidence_days integer,
  last_answered_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  WITH reader_context AS (
    SELECT public.resolve_tyt_social_mastery_read_context(p_user_id) AS value
  ), eligible AS (
    SELECT evidence.*
    FROM reader_context
    JOIN public.mastery_outcome_evidence AS evidence
      ON evidence.user_id = p_user_id
    JOIN public.curriculum_outcomes AS outcome
      ON outcome.id = evidence.outcome_id
     AND outcome.is_active
     AND outcome.game = 'sosyal'
     AND upper(btrim(COALESCE(outcome.exam_ref, ''))) = 'TYT'
     AND outcome.taxonomy_version = reader_context.value->>'taxonomyVersion'
    JOIN public.verified_attempts AS attempt
      ON attempt.id = evidence.attempt_id
     AND attempt.user_id = evidence.user_id
     AND attempt.game = 'sosyal'
     AND attempt.completed_at IS NOT NULL
     AND attempt.completed_at = evidence.verified_completed_at
     AND attempt.session_id = evidence.session_id
     AND evidence.question_id = ANY(attempt.question_ids)
    JOIN public.mastery_materialized_attempts AS marker
      ON marker.attempt_id = attempt.id
    JOIN public.session_answers AS answer
      ON answer.id = evidence.answer_id
     AND answer.user_id = evidence.user_id
     AND answer.session_id = evidence.session_id
     AND answer.question_id = evidence.question_id
     AND NOT COALESCE(answer.is_skipped, false)
    JOIN public.verified_attempt_candidate_policy_snapshots AS header
      ON header.attempt_id = evidence.attempt_id
     AND header.user_id = evidence.user_id
     AND header.policy_version = reader_context.value->>'policyVersion'
     AND header.variant_code = reader_context.value->>'variant'
     AND header.selection_event_id = (
       reader_context.value->>'selectionEventId'
     )::uuid
     AND header.selection_effective_at <= attempt.started_at
    JOIN public.candidate_exam_policy_events AS event_row
      ON event_row.id = header.selection_event_id
     AND event_row.user_id = header.user_id
     AND event_row.policy_version = header.policy_version
     AND event_row.variant_code = header.variant_code
     AND event_row.effective_at = header.selection_effective_at
    JOIN public.exam_candidate_policy_variants AS variant
      ON variant.policy_version = header.policy_version
     AND variant.variant_code = header.variant_code
    LEFT JOIN public.daily_plan_candidate_policy_snapshots AS plan_header
      ON header.artifact_kind = 'daily_plan'
     AND plan_header.plan_id = header.source_plan_id
     AND plan_header.user_id = header.user_id
     AND plan_header.policy_version = header.policy_version
     AND plan_header.variant_code = header.variant_code
     AND plan_header.selection_event_id = header.selection_event_id
    JOIN public.verified_attempt_question_exam_role_snapshots AS item
      ON item.attempt_id = evidence.attempt_id
     AND item.policy_version = header.policy_version
     AND item.question_id = evidence.question_id
     AND item.gradeable
     AND item.exam_role = ANY(variant.allowed_roles)
    LEFT JOIN public.daily_plan_question_exam_role_snapshots AS plan_item
      ON plan_item.plan_id = plan_header.plan_id
     AND plan_item.policy_version = plan_header.policy_version
     AND plan_item.question_id = item.question_id
     AND plan_item.revision_id = item.revision_id
     AND plan_item.exam_role = item.exam_role
    JOIN public.verified_attempt_question_revisions AS revision_snapshot
      ON revision_snapshot.attempt_id = item.attempt_id
     AND revision_snapshot.position = item.position
     AND revision_snapshot.question_id = item.question_id
     AND revision_snapshot.revision_id = item.revision_id
     AND revision_snapshot.revision_id = answer.question_revision_id
     AND revision_snapshot.game = 'sosyal'
     AND upper(btrim(COALESCE(revision_snapshot.exam_ref, ''))) = 'TYT'
     AND revision_snapshot.category IS NOT DISTINCT FROM outcome.category
    WHERE COALESCE((reader_context.value->>'available')::boolean, false)
      AND public.tyt_social_exam_role_compatible(
        revision_snapshot.category, item.exam_role
      )
      AND (
        header.artifact_kind <> 'daily_plan'
        OR (
          plan_header.plan_id IS NOT NULL
          AND plan_item.question_id IS NOT NULL
        )
      )
      AND header.question_set_sha256 = encode(
        extensions.digest(array_to_string(attempt.question_ids, ','), 'sha256'),
        'hex'
      )
  )
  SELECT
    evidence.outcome_id,
    count(*)::integer AS attempts,
    count(*) FILTER (WHERE evidence.is_correct)::integer AS correct_attempts,
    COALESCE(sum(CASE WHEN evidence.is_correct THEN evidence.mapping_weight ELSE 0 END), 0)::numeric
      AS weighted_earned,
    COALESCE(sum(evidence.mapping_weight), 0)::numeric AS weighted_possible,
    count(*) FILTER (WHERE evidence.delayed_correct)::integer AS delayed_correct,
    count(*)::integer AS v2_attempts,
    COALESCE(sum(evidence.difficulty_weighted_earned), 0)::numeric
      AS difficulty_weighted_earned,
    COALESCE(sum(evidence.difficulty_weighted_possible), 0)::numeric
      AS difficulty_weighted_possible,
    count(*) FILTER (WHERE evidence.time_taken_sec IS NOT NULL)::integer
      AS timed_attempts,
    COALESCE(sum(evidence.time_taken_sec), 0)::numeric AS total_time_sec,
    count(*) FILTER (WHERE evidence.fast_wrong)::integer AS fast_wrong,
    count(*) FILTER (WHERE evidence.max_hint_stage > 0)::integer AS hinted_attempts,
    COALESCE(sum(evidence.max_hint_stage), 0)::integer AS hint_stage_sum,
    count(*) FILTER (WHERE EXISTS (
      SELECT 1
      FROM public.review_logs AS review_log
      JOIN public.review_error_annotations AS annotation
        ON annotation.review_log_id = review_log.id
      WHERE review_log.answer_id = evidence.answer_id
        AND annotation.reason_code = 'guess'
    ))::integer AS guess_annotations,
    count(*) FILTER (WHERE EXISTS (
      SELECT 1
      FROM public.review_logs AS review_log
      JOIN public.review_error_annotations AS annotation
        ON annotation.review_log_id = review_log.id
      WHERE review_log.answer_id = evidence.answer_id
        AND annotation.reason_code = 'careless'
    ))::integer AS careless_annotations,
    count(DISTINCT evidence.evidence_day_tr)::integer AS verified_evidence_days,
    max(evidence.verified_completed_at) AS last_answered_at
  FROM eligible AS evidence
  GROUP BY evidence.outcome_id
$fn$;

-- Prove the global evidence disposition exactly once at the release
-- transition, not on every learner read.  After release, the completion and
-- evidence triggers above prevent a new unresolved row from entering.
CREATE OR REPLACE FUNCTION public.tg_guard_tyt_social_mastery_scope_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_integrity jsonb;
BEGIN
  IF NEW.game = 'sosyal'
     AND NEW.display_exam_ref = 'TYT'
     AND NEW.question_exam_ref = 'TYT'
     AND NEW.taxonomy_version = 'ba-tyt-sosyal-v1'
     AND NEW.release_status = 'released'
     AND (
       TG_OP = 'INSERT'
       OR OLD.release_status IS DISTINCT FROM NEW.release_status
     ) THEN
    v_integrity := public.tyt_social_mastery_reader_integrity();
    IF v_integrity IS NULL
       OR jsonb_typeof(v_integrity) <> 'object'
       OR NOT COALESCE((v_integrity->>'ready')::boolean, false) THEN
      RAISE EXCEPTION 'TYT Social mastery release requires a clean branch-aware reader and resolved legacy evidence: %',
        v_integrity USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_guard_tyt_social_mastery_scope_release
  ON public.curriculum_scope_releases;
CREATE TRIGGER trg_guard_tyt_social_mastery_scope_release
BEFORE INSERT OR UPDATE
ON public.curriculum_scope_releases
FOR EACH ROW
EXECUTE FUNCTION public.tg_guard_tyt_social_mastery_scope_release();

COMMENT ON FUNCTION public.resolve_tyt_social_mastery_read_context(uuid) IS
  'Service-only current-policy/current-selection Social mastery context. It exposes neutral range and allowed categories, never selection reasons.';
COMMENT ON FUNCTION public.read_tyt_social_mastery_outcome_state(uuid) IS
  'Service-only branch-aware TYT Social mastery aggregate rebuilt from immutable attempt, event, revision and exam-role snapshots. It never reads user_outcome_state.';

REVOKE ALL ON FUNCTION
  public.tg_require_tyt_social_mastery_snapshot(),
  public.tg_guard_tyt_social_mastery_scope_release(),
  public.tyt_social_mastery_reader_integrity(),
  public.resolve_tyt_social_mastery_read_context(uuid),
  public.read_tyt_social_mastery_outcome_state(uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.tyt_social_mastery_reader_integrity(),
  public.resolve_tyt_social_mastery_read_context(uuid),
  public.read_tyt_social_mastery_outcome_state(uuid)
TO service_role;

DO $fn$
DECLARE
  v_context_oid oid;
  v_reader_oid oid;
  v_completion_trigger_oid oid;
  v_evidence_trigger_oid oid;
  v_release_guard_trigger_oid oid;
  v_manifest_sha256 text;
BEGIN
  SELECT procedure_row.oid INTO STRICT v_context_oid
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid =
    'public.resolve_tyt_social_mastery_read_context(uuid)'::regprocedure;
  SELECT procedure_row.oid INTO STRICT v_reader_oid
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid =
    'public.read_tyt_social_mastery_outcome_state(uuid)'::regprocedure;
  SELECT trigger_row.oid INTO STRICT v_completion_trigger_oid
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE trigger_row.tgrelid = 'public.verified_attempts'::regclass
    AND trigger_row.tgname = 'trg_tyt_social_attempt_snapshot_on_completion'
    AND NOT trigger_row.tgisinternal;
  SELECT trigger_row.oid INTO STRICT v_evidence_trigger_oid
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE trigger_row.tgrelid = 'public.mastery_outcome_evidence'::regclass
    AND trigger_row.tgname = 'aab_require_tyt_social_mastery_snapshot'
    AND NOT trigger_row.tgisinternal;
  SELECT trigger_row.oid INTO STRICT v_release_guard_trigger_oid
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE trigger_row.tgrelid = 'public.curriculum_scope_releases'::regclass
    AND trigger_row.tgname = 'trg_guard_tyt_social_mastery_scope_release'
    AND NOT trigger_row.tgisinternal;

  SELECT encode(extensions.digest(jsonb_build_object(
    'contextReader', pg_catalog.pg_get_functiondef(v_context_oid),
    'masteryStateReader', pg_catalog.pg_get_functiondef(v_reader_oid),
    'masteryEvidenceGuard', pg_catalog.pg_get_functiondef(to_regprocedure(
      'public.tg_require_tyt_social_mastery_snapshot()'
    )),
    'releaseGuard', pg_catalog.pg_get_functiondef(to_regprocedure(
      'public.tg_guard_tyt_social_mastery_scope_release()'
    )),
    'completionConstraint', pg_catalog.pg_get_triggerdef(
      v_completion_trigger_oid, true
    ),
    'masteryEvidenceConstraint', pg_catalog.pg_get_triggerdef(
      v_evidence_trigger_oid, true
    ),
    'releaseConstraint', pg_catalog.pg_get_triggerdef(
      v_release_guard_trigger_oid, true
    )
  )::text, 'sha256'), 'hex')
  INTO v_manifest_sha256;

  INSERT INTO public.tyt_social_policy_capabilities (
    policy_version, capability, capability_version, manifest_sha256, evidence
  ) VALUES (
    'tyt-social-2026-v1',
    'mastery_reader_v1',
    1,
    v_manifest_sha256,
    jsonb_build_object(
      'semanticReaderCheck', 'passed',
      'currentSelectionOnly', true,
      'legacyAggregateExcluded', true,
      'completionConstraint',
        'trg_tyt_social_attempt_snapshot_on_completion',
      'masteryEvidenceConstraint',
        'aab_require_tyt_social_mastery_snapshot',
      'releaseConstraint',
        'trg_guard_tyt_social_mastery_scope_release'
    )
  ) ON CONFLICT (policy_version, capability, capability_version) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tyt_social_policy_capabilities AS capability
    WHERE capability.policy_version = 'tyt-social-2026-v1'
      AND capability.capability = 'mastery_reader_v1'
      AND capability.capability_version = 1
      AND capability.manifest_sha256 = v_manifest_sha256
      AND capability.evidence @> jsonb_build_object(
        'semanticReaderCheck', 'passed',
        'currentSelectionOnly', true,
        'legacyAggregateExcluded', true,
        'completionConstraint',
          'trg_tyt_social_attempt_snapshot_on_completion',
        'masteryEvidenceConstraint',
          'aab_require_tyt_social_mastery_snapshot',
        'releaseConstraint',
          'trg_guard_tyt_social_mastery_scope_release'
      )
  ) THEN
    RAISE EXCEPTION 'TYT Social mastery reader capability drifted'
      USING ERRCODE = '23514';
  END IF;
END
$fn$;

-- Fold the reader/rebuild gate into the canonical release proof.  A future
-- release migration must satisfy source, candidate-policy, snapshot and
-- branch-aware reader integrity together.
CREATE OR REPLACE FUNCTION public.tyt_social_combined_release_integrity()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT source.evidence || jsonb_build_object(
    'candidatePolicyVersion', candidate.evidence->>'policyVersion',
    'candidatePolicyReady',
      COALESCE((candidate.evidence->>'ready')::boolean, false),
    'candidatePolicy', candidate.evidence,
    'masteryReaderReady',
      COALESCE((reader.evidence->>'ready')::boolean, false),
    'masteryReader', reader.evidence,
    'ready',
      COALESCE((source.evidence->>'sourceReady')::boolean, false)
      AND COALESCE((candidate.evidence->>'ready')::boolean, false)
      AND COALESCE((reader.evidence->>'ready')::boolean, false)
  )
  FROM (SELECT public.tyt_social_source_policy_integrity(
    'sosyal', 'TYT', 'ba-tyt-sosyal-v1'
  ) AS evidence) AS source
  CROSS JOIN (
    SELECT public.tyt_social_candidate_policy_integrity() AS evidence
  ) AS candidate
  CROSS JOIN (
    SELECT public.tyt_social_mastery_reader_integrity() AS evidence
  ) AS reader
$fn$;

REVOKE ALL ON FUNCTION public.tyt_social_combined_release_integrity()
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tyt_social_combined_release_integrity()
TO service_role;

-- App integration is a separate forward change.  Keep the public resolver
-- closed so the existing generic user_outcome_state reader cannot expose a
-- mixed Social map between the DB and app deployments.
UPDATE public.curriculum_scope_releases
SET release_status = 'validating',
    diagnostic_enabled = false,
    updated_at = clock_timestamp()
WHERE game = 'sosyal'
  AND display_exam_ref = 'TYT'
  AND question_exam_ref = 'TYT'
  AND taxonomy_version = 'ba-tyt-sosyal-v1'
  AND release_status IN ('validating','released');

DO $postcheck$
DECLARE
  v_integrity jsonb;
  v_combined jsonb;
  v_reader_definition text;
BEGIN
  v_integrity := public.tyt_social_mastery_reader_integrity();
  v_combined := public.tyt_social_combined_release_integrity();

  IF v_integrity IS NULL
     OR jsonb_typeof(v_integrity) <> 'object'
     OR NOT COALESCE(
       (v_integrity->>'readerBoundaryReady')::boolean, false
     )
     OR COALESCE((v_integrity->>'legacyAggregateUsed')::boolean, true) THEN
    RAISE EXCEPTION 'TYT Social mastery reader boundary postcheck failed: %',
      v_integrity USING ERRCODE = '23514';
  END IF;

  IF v_combined IS NULL
     OR jsonb_typeof(v_combined) <> 'object'
     OR NOT (v_combined ? 'masteryReaderReady')
     OR NOT (v_combined ? 'masteryReader') THEN
    RAISE EXCEPTION 'TYT Social combined release proof omitted mastery reader';
  END IF;

  IF (
    SELECT count(*)
    FROM public.curriculum_scope_releases AS scope
    WHERE scope.game = 'sosyal'
      AND scope.display_exam_ref = 'TYT'
      AND scope.question_exam_ref = 'TYT'
      AND scope.taxonomy_version = 'ba-tyt-sosyal-v1'
      AND scope.release_status = 'validating'
      AND NOT scope.diagnostic_enabled
  ) <> 1 THEN
    RAISE EXCEPTION 'TYT Social mastery scope is not fail-closed after reader install'
      USING ERRCODE = '23514';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure_row.oid)
  INTO v_reader_definition
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid =
    'public.read_tyt_social_mastery_outcome_state(uuid)'::regprocedure;

  IF pg_catalog.strpos(v_reader_definition, 'user_outcome_state') <> 0
     OR pg_catalog.strpos(
       v_reader_definition,
       'verified_attempt_candidate_policy_snapshots'
     ) = 0
     OR pg_catalog.strpos(
       v_reader_definition,
       'verified_attempt_question_exam_role_snapshots'
     ) = 0
     OR pg_catalog.strpos(v_reader_definition, 'selectionEventId') = 0
     OR pg_catalog.strpos(v_reader_definition, 'policyVersion') = 0 THEN
    RAISE EXCEPTION 'TYT Social reader no longer proves branch-aware provenance'
      USING ERRCODE = '23514';
  END IF;
END
$postcheck$;

NOTIFY pgrst, 'reload schema';

COMMIT;
