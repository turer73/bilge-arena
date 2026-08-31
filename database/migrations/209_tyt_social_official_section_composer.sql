-- Migration 209: deterministic TYT Social official-section composer.
--
-- Migration 206 validates an ordered question array but deliberately does not
-- choose that array.  This migration adds the missing service-only boundary:
-- a request-id seeded composer selects exactly five published questions from
-- each common role and five from the learner's current neutral branch, then
-- delegates immutable attempt creation to the existing 206 issuer.
--
-- Installing the boundary does not release Social mastery.  The scope remains
-- validating until governed role sources, the branch-aware reader and every
-- other combined release proof are clean.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '15min';

ALTER TABLE public.tyt_social_policy_capabilities
  DROP CONSTRAINT IF EXISTS tyt_social_policy_capabilities_capability_check;
ALTER TABLE public.tyt_social_policy_capabilities
  ADD CONSTRAINT tyt_social_policy_capabilities_capability_check
  CHECK (capability IN (
    'snapshot_boundary_v1',
    'mastery_reader_v1',
    'official_section_composer_v1'
  ));

CREATE OR REPLACE FUNCTION public.compose_and_issue_verified_tyt_social_section_attempt(
  p_user_id uuid,
  p_duration_sec integer,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_policy public.exam_candidate_policy_versions%ROWTYPE;
  v_event public.candidate_exam_policy_events%ROWTYPE;
  v_variant public.exam_candidate_policy_variants%ROWTYPE;
  v_existing_header public.verified_attempt_candidate_policy_snapshots%ROWTYPE;
  v_existing_attempt public.verified_attempts%ROWTYPE;
  v_expected_roles text[];
  v_branch_role text;
  v_question_ids uuid[];
  v_common_history integer := 0;
  v_common_geography integer := 0;
  v_common_philosophy integer := 0;
  v_selected_branch integer := 0;
  v_scope_count integer := 0;
  v_release_integrity jsonb;
  v_result jsonb;
  v_now timestamptz;
BEGIN
  IF p_user_id IS NULL
     OR p_request_id IS NULL
     OR p_duration_sec IS NULL
     OR p_duration_sec NOT BETWEEN 5 AND 7200 THEN
    RAISE EXCEPTION 'invalid TYT Social official-section composition request'
      USING ERRCODE = '22023';
  END IF;

  -- Match the 206 core lock before looking for a replay.  This serializes two
  -- concurrent calls with the same user/request pair and makes the second call
  -- observe the immutable attempt produced by the first.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'tyt-social-attempt:' || p_user_id::text || ':' || p_request_id::text,
    206
  ));

  SELECT * INTO v_existing_header
  FROM public.verified_attempt_candidate_policy_snapshots AS header
  WHERE header.user_id = p_user_id
    AND header.issue_request_id = p_request_id;

  IF FOUND THEN
    SELECT * INTO STRICT v_existing_attempt
    FROM public.verified_attempts AS attempt
    WHERE attempt.id = v_existing_header.attempt_id;

    IF v_existing_header.artifact_kind <> 'official_section'
       OR v_existing_header.source_plan_id IS NOT NULL
       OR v_existing_attempt.user_id IS DISTINCT FROM p_user_id
       OR v_existing_attempt.game <> 'sosyal'
       OR v_existing_attempt.mode <> 'deneme'
       OR v_existing_attempt.duration_sec IS DISTINCT FROM p_duration_sec
       OR cardinality(v_existing_attempt.question_ids) <> 20 THEN
      RAISE EXCEPTION 'TYT Social official-section replay payload differs'
        USING ERRCODE = '22023';
    END IF;

    -- Re-enter the immutable 206 core with the stored policy/event/question
    -- facts.  A later preference or policy change cannot rewrite a replay.
    v_result := public.issue_verified_tyt_social_attempt_with_event(
      p_user_id,
      'deneme',
      v_existing_attempt.question_ids,
      p_duration_sec,
      p_request_id,
      'official_section',
      NULL,
      v_existing_header.policy_version,
      v_existing_header.selection_event_id
    );

    RETURN v_result || jsonb_build_object(
      'composerVersion', 'tyt-social-official-section-v1'
    );
  END IF;

  SELECT * INTO v_policy
  FROM public.resolve_current_tyt_social_candidate_policy();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TYT Social policy unavailable' USING ERRCODE = '55000';
  END IF;

  -- The preference writer uses the same lock.  Once acquired, the selection
  -- event and its branch cannot change until the issuer has committed.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'tyt-social-policy:' || p_user_id::text || ':' || v_policy.policy_version,
    205
  ));

  SELECT * INTO v_policy
  FROM public.exam_candidate_policy_versions AS policy
  WHERE policy.policy_version = v_policy.policy_version
    AND policy.game = 'sosyal'
    AND policy.display_exam_ref = 'TYT'
    AND policy.question_exam_ref = 'TYT'
    AND policy.taxonomy_version = 'ba-tyt-sosyal-v1'
    AND policy.status = 'released'
    AND current_date >= policy.valid_from
    AND (policy.valid_until IS NULL OR current_date < policy.valid_until);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TYT Social policy unavailable' USING ERRCODE = '55000';
  END IF;

  v_now := clock_timestamp();
  SELECT * INTO v_event
  FROM public.candidate_exam_policy_events AS event_row
  WHERE event_row.user_id = p_user_id
    AND event_row.policy_version = v_policy.policy_version
    AND event_row.effective_at <= v_now
  ORDER BY event_row.effective_at DESC, event_row.id DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TYT Social policy selection required'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_variant
  FROM public.exam_candidate_policy_variants AS variant
  WHERE variant.policy_version = v_policy.policy_version
    AND variant.variant_code = v_event.variant_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TYT Social policy variant unavailable'
      USING ERRCODE = '55000';
  END IF;

  IF v_event.variant_code = 'questions_16_20' THEN
    v_branch_role := 'standard_religion';
    v_expected_roles := ARRAY[
      'common_history',
      'common_geography',
      'common_philosophy',
      'standard_religion'
    ]::text[];
  ELSIF v_event.variant_code = 'questions_21_25' THEN
    v_branch_role := 'alternate_philosophy';
    v_expected_roles := ARRAY[
      'common_history',
      'common_geography',
      'common_philosophy',
      'alternate_philosophy'
    ]::text[];
  ELSE
    RAISE EXCEPTION 'unknown TYT Social answering variant'
      USING ERRCODE = '23514';
  END IF;

  IF v_variant.allowed_roles IS DISTINCT FROM v_expected_roles
     OR (v_event.variant_code = 'questions_16_20'
       AND v_variant.question_range IS DISTINCT FROM int4range(16, 21, '[)'))
     OR (v_event.variant_code = 'questions_21_25'
       AND v_variant.question_range IS DISTINCT FROM int4range(21, 26, '[)')) THEN
    RAISE EXCEPTION 'TYT Social policy variant contract drifted'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::integer INTO v_scope_count
  FROM public.curriculum_scope_releases AS scope
  WHERE scope.game = 'sosyal'
    AND scope.display_exam_ref = 'TYT'
    AND scope.question_exam_ref = 'TYT'
    AND scope.taxonomy_version = 'ba-tyt-sosyal-v1'
    AND scope.release_status = 'released'
    AND NOT scope.diagnostic_enabled;
  IF v_scope_count <> 1 THEN
    RAISE EXCEPTION 'TYT Social official section is not released'
      USING ERRCODE = '55000';
  END IF;

  v_release_integrity := public.tyt_social_combined_release_integrity();
  IF v_release_integrity IS NULL
     OR jsonb_typeof(v_release_integrity) <> 'object'
     OR NOT COALESCE((v_release_integrity->>'ready')::boolean, false)
     OR NOT COALESCE(
       (v_release_integrity->>'officialSectionComposerReady')::boolean,
       false
     ) THEN
    RAISE EXCEPTION 'TYT Social official-section release integrity failed: %',
      v_release_integrity USING ERRCODE = '23514';
  END IF;

  -- Ranking is deterministic for the request and immutable policy/revision
  -- facts.  UUID is the final tie-breaker even if two SHA-256 values collide.
  WITH eligible AS (
    SELECT
      question.id AS question_id,
      revision.id AS revision_id,
      role.exam_role,
      CASE role.exam_role
        WHEN 'common_history' THEN 1
        WHEN 'common_geography' THEN 2
        WHEN 'common_philosophy' THEN 3
        WHEN v_branch_role THEN 4
        ELSE 99
      END AS role_order,
      row_number() OVER (
        PARTITION BY role.exam_role
        ORDER BY
          encode(extensions.digest(
            concat_ws(
              ':',
              p_request_id::text,
              p_user_id::text,
              v_policy.policy_version,
              v_policy.rules_sha256,
              role.exam_role,
              question.id::text,
              revision.id::text
            ),
            'sha256'
          ), 'hex'),
          question.id,
          revision.id
      ) AS role_rank
    FROM public.questions AS question
    JOIN public.question_content_revisions AS revision
      ON revision.id = question.published_revision_id
     AND revision.question_id = question.id
    JOIN public.question_revision_exam_roles AS role
      ON role.policy_version = v_policy.policy_version
     AND role.revision_id = revision.id
    WHERE question.is_active
      AND question.game = 'sosyal'
      AND upper(btrim(COALESCE(question.exam_ref, ''))) = 'TYT'
      AND revision.status = 'published'
      AND revision.game = 'sosyal'
      AND upper(btrim(COALESCE(revision.exam_ref, ''))) = 'TYT'
      AND role.exam_role = ANY(v_expected_roles)
      AND public.tyt_social_exam_role_compatible(
        revision.category,
        role.exam_role
      )
  ), selected AS (
    SELECT *
    FROM eligible
    WHERE role_rank <= 5
  )
  SELECT
    COALESCE(
      array_agg(question_id ORDER BY role_order, role_rank, question_id),
      '{}'::uuid[]
    ),
    count(*) FILTER (WHERE exam_role = 'common_history')::integer,
    count(*) FILTER (WHERE exam_role = 'common_geography')::integer,
    count(*) FILTER (WHERE exam_role = 'common_philosophy')::integer,
    count(*) FILTER (WHERE exam_role = v_branch_role)::integer
  INTO
    v_question_ids,
    v_common_history,
    v_common_geography,
    v_common_philosophy,
    v_selected_branch
  FROM selected;

  IF cardinality(v_question_ids) <> 20
     OR cardinality(v_question_ids) <> (
       SELECT count(DISTINCT selected.question_id)
       FROM unnest(v_question_ids) AS selected(question_id)
     )
     OR v_common_history <> 5
     OR v_common_geography <> 5
     OR v_common_philosophy <> 5
     OR v_selected_branch <> 5 THEN
    RAISE EXCEPTION 'TYT Social official-section source pool cannot satisfy exact 5/5/5/5 composition'
      USING ERRCODE = '23514';
  END IF;

  -- The existing issuer independently re-resolves the policy/event, validates
  -- every role and records immutable revision, role and selection snapshots.
  v_result := public.issue_verified_tyt_social_section_attempt(
    p_user_id,
    v_question_ids,
    p_duration_sec,
    p_request_id
  );

  RETURN v_result || jsonb_build_object(
    'composerVersion', 'tyt-social-official-section-v1'
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.tyt_social_official_section_composer_integrity()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_policy public.exam_candidate_policy_versions%ROWTYPE;
  v_composer_oid oid;
  v_issuer_oid oid;
  v_release_guard_oid oid;
  v_release_trigger_oid oid;
  v_composer_config text[];
  v_composer_security_definer boolean := false;
  v_acl_ready boolean := false;
  v_release_guard_ready boolean := false;
  v_manifest_sha256 text;
  v_capability_ready boolean := false;
  v_role_counts jsonb := '{}'::jsonb;
  v_pool_ready boolean := false;
BEGIN
  SELECT * INTO v_policy
  FROM public.resolve_current_tyt_social_candidate_policy();

  IF v_policy.policy_version IS NOT NULL THEN
    SELECT jsonb_object_agg(required.exam_role, COALESCE(pool.count, 0))
    INTO v_role_counts
    FROM (VALUES
      ('common_history'),
      ('common_geography'),
      ('common_philosophy'),
      ('standard_religion'),
      ('alternate_philosophy')
    ) AS required(exam_role)
    LEFT JOIN (
      SELECT role.exam_role, count(DISTINCT question.id)::integer AS count
      FROM public.questions AS question
      JOIN public.question_content_revisions AS revision
        ON revision.id = question.published_revision_id
       AND revision.question_id = question.id
      JOIN public.question_revision_exam_roles AS role
        ON role.policy_version = v_policy.policy_version
       AND role.revision_id = revision.id
      WHERE question.is_active
        AND question.game = 'sosyal'
        AND upper(btrim(COALESCE(question.exam_ref, ''))) = 'TYT'
        AND revision.status = 'published'
        AND revision.game = 'sosyal'
        AND upper(btrim(COALESCE(revision.exam_ref, ''))) = 'TYT'
        AND public.tyt_social_exam_role_compatible(
          revision.category,
          role.exam_role
        )
      GROUP BY role.exam_role
    ) AS pool ON pool.exam_role = required.exam_role;

    v_pool_ready :=
      COALESCE((v_role_counts->>'common_history')::integer, 0) >= 5
      AND COALESCE((v_role_counts->>'common_geography')::integer, 0) >= 5
      AND COALESCE((v_role_counts->>'common_philosophy')::integer, 0) >= 5
      AND COALESCE((v_role_counts->>'standard_religion')::integer, 0) >= 5
      AND COALESCE((v_role_counts->>'alternate_philosophy')::integer, 0) >= 5;
  END IF;

  v_composer_oid := to_regprocedure(
    'public.compose_and_issue_verified_tyt_social_section_attempt(uuid,integer,uuid)'
  );
  v_issuer_oid := to_regprocedure(
    'public.issue_verified_tyt_social_section_attempt(uuid,uuid[],integer,uuid)'
  );
  v_release_guard_oid := to_regprocedure(
    'public.tg_guard_tyt_social_official_section_release()'
  );

  IF v_composer_oid IS NOT NULL THEN
    SELECT procedure_row.proconfig, procedure_row.prosecdef
    INTO v_composer_config, v_composer_security_definer
    FROM pg_catalog.pg_proc AS procedure_row
    WHERE procedure_row.oid = v_composer_oid;
  END IF;

  IF v_composer_oid IS NOT NULL AND v_issuer_oid IS NOT NULL THEN
    v_acl_ready :=
      v_composer_security_definer
      AND 'search_path=pg_catalog' = ANY(
        COALESCE(v_composer_config, ARRAY[]::text[])
      )
      AND NOT pg_catalog.has_function_privilege(
        'anon', v_composer_oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'authenticated', v_composer_oid, 'EXECUTE'
      )
      AND pg_catalog.has_function_privilege(
        'service_role', v_composer_oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'anon', v_issuer_oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'authenticated', v_issuer_oid, 'EXECUTE'
      )
      AND NOT pg_catalog.has_function_privilege(
        'service_role', v_issuer_oid, 'EXECUTE'
      );
  END IF;

  SELECT trigger_row.oid INTO v_release_trigger_oid
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE trigger_row.tgrelid = 'public.curriculum_scope_releases'::regclass
    AND trigger_row.tgname = 'trg_guard_tyt_social_official_section_release'
    AND NOT trigger_row.tgisinternal
    AND trigger_row.tgenabled <> 'D';
  v_release_guard_ready :=
    v_release_guard_oid IS NOT NULL AND v_release_trigger_oid IS NOT NULL;

  IF v_composer_oid IS NOT NULL
     AND v_issuer_oid IS NOT NULL
     AND v_release_guard_oid IS NOT NULL
     AND v_release_trigger_oid IS NOT NULL THEN
    SELECT encode(extensions.digest(jsonb_build_object(
      'composer', pg_catalog.pg_get_functiondef(v_composer_oid),
      'validatedIssuer', pg_catalog.pg_get_functiondef(v_issuer_oid),
      'releaseGuard', pg_catalog.pg_get_functiondef(v_release_guard_oid),
      'releaseConstraint', pg_catalog.pg_get_triggerdef(
        v_release_trigger_oid,
        true
      )
    )::text, 'sha256'), 'hex')
    INTO v_manifest_sha256;

    v_capability_ready := EXISTS (
      SELECT 1
      FROM public.tyt_social_policy_capabilities AS capability
      WHERE capability.policy_version = 'tyt-social-2026-v1'
        AND capability.capability = 'official_section_composer_v1'
        AND capability.capability_version = 1
        AND capability.manifest_sha256 = v_manifest_sha256
        AND capability.evidence @> jsonb_build_object(
          'semanticComposerCheck', 'passed',
          'deterministicByRequestId', true,
          'directIssuerServiceRoleExecute', false,
          'releaseConstraint',
            'trg_guard_tyt_social_official_section_release'
        )
    );
  END IF;

  RETURN jsonb_build_object(
    'policyVersion', v_policy.policy_version,
    'composerBoundaryReady',
      v_acl_ready AND v_release_guard_ready AND v_capability_ready,
    'aclReady', v_acl_ready,
    'releaseConstraintReady', v_release_guard_ready,
    'capabilityManifestReady', v_capability_ready,
    'roleCounts', COALESCE(v_role_counts, '{}'::jsonb),
    'sourcePoolReady', v_pool_ready,
    'ready',
      v_acl_ready
      AND v_release_guard_ready
      AND v_capability_ready
      AND v_pool_ready
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.tg_guard_tyt_social_official_section_release()
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
    v_integrity := public.tyt_social_combined_release_integrity();
    IF v_integrity IS NULL
       OR jsonb_typeof(v_integrity) <> 'object'
       OR NOT COALESCE((v_integrity->>'ready')::boolean, false)
       OR NOT COALESCE(
         (v_integrity->>'officialSectionComposerReady')::boolean,
         false
       ) THEN
      RAISE EXCEPTION 'TYT Social release requires a deterministic official-section composer: %',
        v_integrity USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_guard_tyt_social_official_section_release
  ON public.curriculum_scope_releases;
CREATE TRIGGER trg_guard_tyt_social_official_section_release
BEFORE INSERT OR UPDATE
ON public.curriculum_scope_releases
FOR EACH ROW
EXECUTE FUNCTION public.tg_guard_tyt_social_official_section_release();

-- The arbitrary-array official issuer becomes an internal implementation
-- detail.  Service code receives only the deterministic composer entry point.
REVOKE ALL ON FUNCTION
  public.compose_and_issue_verified_tyt_social_section_attempt(uuid,integer,uuid),
  public.tyt_social_official_section_composer_integrity(),
  public.tg_guard_tyt_social_official_section_release(),
  public.issue_verified_tyt_social_section_attempt(uuid,uuid[],integer,uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.compose_and_issue_verified_tyt_social_section_attempt(uuid,integer,uuid),
  public.tyt_social_official_section_composer_integrity()
TO service_role;

DO $capability$
DECLARE
  v_composer_oid oid;
  v_issuer_oid oid;
  v_release_guard_oid oid;
  v_release_trigger_oid oid;
  v_manifest_sha256 text;
BEGIN
  SELECT procedure_row.oid INTO STRICT v_composer_oid
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid =
    'public.compose_and_issue_verified_tyt_social_section_attempt(uuid,integer,uuid)'::regprocedure;
  SELECT procedure_row.oid INTO STRICT v_issuer_oid
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid =
    'public.issue_verified_tyt_social_section_attempt(uuid,uuid[],integer,uuid)'::regprocedure;
  SELECT procedure_row.oid INTO STRICT v_release_guard_oid
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid =
    'public.tg_guard_tyt_social_official_section_release()'::regprocedure;
  SELECT trigger_row.oid INTO STRICT v_release_trigger_oid
  FROM pg_catalog.pg_trigger AS trigger_row
  WHERE trigger_row.tgrelid = 'public.curriculum_scope_releases'::regclass
    AND trigger_row.tgname = 'trg_guard_tyt_social_official_section_release'
    AND NOT trigger_row.tgisinternal;

  SELECT encode(extensions.digest(jsonb_build_object(
    'composer', pg_catalog.pg_get_functiondef(v_composer_oid),
    'validatedIssuer', pg_catalog.pg_get_functiondef(v_issuer_oid),
    'releaseGuard', pg_catalog.pg_get_functiondef(v_release_guard_oid),
    'releaseConstraint', pg_catalog.pg_get_triggerdef(
      v_release_trigger_oid,
      true
    )
  )::text, 'sha256'), 'hex')
  INTO v_manifest_sha256;

  INSERT INTO public.tyt_social_policy_capabilities (
    policy_version,
    capability,
    capability_version,
    manifest_sha256,
    evidence
  ) VALUES (
    'tyt-social-2026-v1',
    'official_section_composer_v1',
    1,
    v_manifest_sha256,
    jsonb_build_object(
      'semanticComposerCheck', 'passed',
      'deterministicByRequestId', true,
      'directIssuerServiceRoleExecute', false,
      'releaseConstraint',
        'trg_guard_tyt_social_official_section_release'
    )
  ) ON CONFLICT (policy_version, capability, capability_version) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tyt_social_policy_capabilities AS capability
    WHERE capability.policy_version = 'tyt-social-2026-v1'
      AND capability.capability = 'official_section_composer_v1'
      AND capability.capability_version = 1
      AND capability.manifest_sha256 = v_manifest_sha256
      AND capability.evidence @> jsonb_build_object(
        'semanticComposerCheck', 'passed',
        'deterministicByRequestId', true,
        'directIssuerServiceRoleExecute', false,
        'releaseConstraint',
          'trg_guard_tyt_social_official_section_release'
      )
  ) THEN
    RAISE EXCEPTION 'TYT Social official-section composer capability drifted'
      USING ERRCODE = '23514';
  END IF;
END
$capability$;

-- Fold the composer into the canonical proof without modifying the immutable
-- 206/208 capability rows.
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
    'officialSectionComposerReady',
      COALESCE((composer.evidence->>'ready')::boolean, false),
    'officialSectionComposer', composer.evidence,
    'ready',
      COALESCE((source.evidence->>'sourceReady')::boolean, false)
      AND COALESCE((candidate.evidence->>'ready')::boolean, false)
      AND COALESCE((reader.evidence->>'ready')::boolean, false)
      AND COALESCE((composer.evidence->>'ready')::boolean, false)
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
  CROSS JOIN (
    SELECT public.tyt_social_official_section_composer_integrity() AS evidence
  ) AS composer
$fn$;

REVOKE ALL ON FUNCTION public.tyt_social_combined_release_integrity()
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tyt_social_combined_release_integrity()
TO service_role;

-- A later reviewed migration performs the actual release transition.  This
-- installer remains deployable while role sources are still being governed.
UPDATE public.curriculum_scope_releases
SET release_status = 'validating',
    diagnostic_enabled = false,
    updated_at = clock_timestamp()
WHERE game = 'sosyal'
  AND display_exam_ref = 'TYT'
  AND question_exam_ref = 'TYT'
  AND taxonomy_version = 'ba-tyt-sosyal-v1'
  AND release_status IN ('validating', 'released');

DO $postcheck$
DECLARE
  v_composer_integrity jsonb;
  v_combined_integrity jsonb;
  v_composer_definition text;
BEGIN
  v_composer_integrity :=
    public.tyt_social_official_section_composer_integrity();
  v_combined_integrity := public.tyt_social_combined_release_integrity();

  IF v_composer_integrity IS NULL
     OR jsonb_typeof(v_composer_integrity) <> 'object'
     OR NOT COALESCE(
       (v_composer_integrity->>'composerBoundaryReady')::boolean,
       false
     ) THEN
    RAISE EXCEPTION 'TYT Social official-section composer boundary postcheck failed: %',
      v_composer_integrity USING ERRCODE = '23514';
  END IF;

  IF v_combined_integrity IS NULL
     OR jsonb_typeof(v_combined_integrity) <> 'object'
     OR NOT (v_combined_integrity ? 'officialSectionComposerReady')
     OR NOT (v_combined_integrity ? 'officialSectionComposer') THEN
    RAISE EXCEPTION 'TYT Social combined release proof omitted official composer'
      USING ERRCODE = '23514';
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
    RAISE EXCEPTION 'migration 209 must leave TYT Social fail-closed in validating state'
      USING ERRCODE = '23514';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure_row.oid)
  INTO v_composer_definition
  FROM pg_catalog.pg_proc AS procedure_row
  WHERE procedure_row.oid =
    'public.compose_and_issue_verified_tyt_social_section_attempt(uuid,integer,uuid)'::regprocedure;

  IF pg_catalog.strpos(v_composer_definition, 'p_request_id::text') = 0
     OR pg_catalog.strpos(v_composer_definition, 'row_number() OVER') = 0
     OR pg_catalog.strpos(
       v_composer_definition,
       'question.published_revision_id'
     ) = 0
     OR pg_catalog.strpos(
       v_composer_definition,
       'question_revision_exam_roles'
     ) = 0
     OR pg_catalog.strpos(
       v_composer_definition,
       'issue_verified_tyt_social_section_attempt'
     ) = 0 THEN
    RAISE EXCEPTION 'TYT Social composer no longer proves deterministic governed sourcing'
      USING ERRCODE = '23514';
  END IF;
END
$postcheck$;

NOTIFY pgrst, 'reload schema';

COMMIT;
