-- Migration 191: Release the TYT Social discovery scope.
--
-- The graph already exists as a coarse, internal category-proxy taxonomy.
-- This release deliberately keeps adaptive diagnostic disabled: the learner
-- sees an evidence-collection discovery level, never an unsupported diagnosis.
-- Before releasing either scope, extend the DB-boundary mapping guard from the
-- split Wordquest scope to every scope registered in the release registry.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- Drain graph, question, mapping and verified-attempt writers before replacing
-- the boundary functions or proving coverage. A publish call that began before
-- this migration must resume through the permanent row/deferred triggers below.
LOCK TABLE
  public.curriculum_scope_releases,
  public.curriculum_nodes,
  public.curriculum_outcomes,
  public.question_content_revisions,
  public.question_revision_sources,
  public.question_revision_approvals,
  public.question_revision_outcomes,
  public.session_answers,
  public.questions,
  public.question_outcomes,
  public.verified_attempts,
  public.verified_attempt_question_revisions,
  public.verified_attempt_hint_events,
  public.review_logs,
  public.review_error_annotations,
  public.mastery_materialized_attempts,
  public.mastery_outcome_evidence,
  public.user_outcome_state
IN SHARE ROW EXCLUSIVE MODE;

-- A category label and one active row are not a release proof.  Social is
-- published only from the current immutable published revision, a non-legacy
-- source declaration and two independent human approvals.  The manifest hash
-- is append-only: a later replay may add a new proof, but cannot rewrite the
-- evidence that justified an earlier decision.  Partial source evidence is
-- never written to this release ledger: the candidate-policy gate must also be
-- ready, otherwise a later reader could mistake content approval for a full
-- Social release authorization.
CREATE TABLE IF NOT EXISTS public.curriculum_scope_source_policy_evidence (
  game varchar(20) NOT NULL CHECK (game IN ('wordquest','matematik','turkce','fen','sosyal')),
  display_exam_ref varchar(20) NOT NULL CHECK (display_exam_ref ~ '^[A-Z0-9-]{2,10}$'),
  taxonomy_version text NOT NULL CHECK (taxonomy_version ~ '^ba-[a-z0-9-]+-v[0-9]+$'),
  source_policy_version text NOT NULL CHECK (source_policy_version ~ '^[a-z0-9-]+-v[0-9]+$'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_manifest jsonb NOT NULL CHECK (jsonb_typeof(evidence_manifest) = 'array'),
  approved_question_count integer NOT NULL CHECK (approved_question_count > 0),
  required_category_count integer NOT NULL CHECK (required_category_count > 0),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (
    game, display_exam_ref, taxonomy_version, source_policy_version, evidence_sha256
  )
);

ALTER TABLE public.curriculum_scope_source_policy_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.curriculum_scope_source_policy_evidence
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_curriculum_scope_source_policy_evidence_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  RAISE EXCEPTION 'curriculum scope source-policy evidence is append-only'
    USING ERRCODE = '55000';
END
$fn$;

DROP TRIGGER IF EXISTS trg_curriculum_scope_source_policy_evidence_immutable
  ON public.curriculum_scope_source_policy_evidence;
CREATE TRIGGER trg_curriculum_scope_source_policy_evidence_immutable
BEFORE UPDATE OR DELETE ON public.curriculum_scope_source_policy_evidence
FOR EACH ROW
EXECUTE FUNCTION public.tg_curriculum_scope_source_policy_evidence_immutable();

REVOKE ALL ON FUNCTION public.tg_curriculum_scope_source_policy_evidence_immutable()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tyt_social_source_policy_integrity(
  p_game text,
  p_display_exam_ref text,
  p_taxonomy_version text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  WITH requested AS (
    SELECT lower(btrim(p_game)) AS game,
      upper(btrim(p_display_exam_ref)) AS display_exam_ref,
      btrim(p_taxonomy_version) AS taxonomy_version
  ), required(category,minimum_questions) AS (
    VALUES
      ('tarih',1),('cografya',1),('felsefe',1),('sosyoloji',1),('din_kulturu',2)
  ), active_question AS (
    SELECT question.id AS question_id, question.category::text AS category,
      question.difficulty, question.published_revision_id,
      revision.id AS revision_id, revision.content_sha256,
      revision.change_kind, revision.status AS revision_status,
      revision.prepared_by, revision.outcomes_prepared_by, revision.published_at,
      source.source_kind, source.license_code, source.provenance_ref,
      stage_one.reviewer_id AS stage_one_reviewer,
      stage_one.decided_at AS stage_one_decided_at,
      stage_two.reviewer_id AS stage_two_reviewer,
      stage_two.decided_at AS stage_two_decided_at,
      (
        revision.id IS NOT NULL
        AND revision.status = 'published'
        AND revision.published_at IS NOT NULL
        AND revision.change_kind <> 'legacy_import'
        AND revision.prepared_by IS NOT NULL
        AND revision.game IS NOT DISTINCT FROM question.game::text
        AND revision.category IS NOT DISTINCT FROM question.category::text
        AND upper(btrim(COALESCE(revision.exam_ref, ''))) = 'TYT'
        AND revision.difficulty IS NOT DISTINCT FROM question.difficulty
        AND revision.content_sha256 ~ '^[0-9a-f]{64}$'
        AND source.revision_id IS NOT NULL
        AND source.source_kind IN (
          'original','licensed','public_domain','user_generated','official_exam'
        )
        AND lower(source.license_code) <> 'legacy-import'
        AND NULLIF(btrim(COALESCE(source.provenance_ref, '')), '') IS NOT NULL
        AND lower(btrim(source.provenance_ref)) NOT LIKE 'legacy:%'
        AND stage_one.decision = 'approved'
        AND stage_two.decision = 'approved'
        AND stage_one.reviewer_id IS DISTINCT FROM stage_two.reviewer_id
        AND stage_one.reviewer_id IS DISTINCT FROM revision.prepared_by
        AND stage_two.reviewer_id IS DISTINCT FROM revision.prepared_by
        AND (
          revision.outcomes_prepared_by IS NULL
          OR (
            stage_one.reviewer_id IS DISTINCT FROM revision.outcomes_prepared_by
            AND stage_two.reviewer_id IS DISTINCT FROM revision.outcomes_prepared_by
          )
        )
      ) AS policy_approved
    FROM public.questions AS question
    LEFT JOIN public.question_content_revisions AS revision
      ON revision.id = question.published_revision_id
     AND revision.question_id = question.id
    LEFT JOIN public.question_revision_sources AS source
      ON source.revision_id = revision.id
    LEFT JOIN public.question_revision_approvals AS stage_one
      ON stage_one.revision_id = revision.id AND stage_one.stage = 1
    LEFT JOIN public.question_revision_approvals AS stage_two
      ON stage_two.revision_id = revision.id AND stage_two.stage = 2
    CROSS JOIN requested
    WHERE requested.game = 'sosyal'
      AND requested.display_exam_ref = 'TYT'
      AND requested.taxonomy_version = 'ba-tyt-sosyal-v1'
      AND question.is_active
      AND question.game::text = requested.game
      AND upper(btrim(COALESCE(question.exam_ref::text, ''))) = requested.display_exam_ref
  ), category_evidence AS (
    SELECT required.category, required.minimum_questions,
      count(active_question.question_id)::integer AS active_questions,
      count(active_question.question_id) FILTER (
        WHERE active_question.policy_approved
      )::integer AS approved_questions
    FROM required
    LEFT JOIN active_question ON active_question.category = required.category
    GROUP BY required.category, required.minimum_questions
  ), manifest AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'questionId', question_id,
      'revisionId', revision_id,
      'contentSha256', content_sha256,
      'category', category,
      'sourceKind', source_kind,
      'licenseCode', license_code,
      'provenanceRef', provenance_ref,
      'stageOneReviewer', stage_one_reviewer,
      'stageOneDecidedAt', stage_one_decided_at,
      'stageTwoReviewer', stage_two_reviewer,
      'stageTwoDecidedAt', stage_two_decided_at
    ) ORDER BY category, question_id), '[]'::jsonb) AS evidence_manifest
    FROM active_question
    WHERE policy_approved
  ), summary AS (
    SELECT count(*)::integer AS required_category_count,
      count(*) FILTER (
        WHERE active_questions < minimum_questions
      )::integer AS category_gap,
      COALESCE(sum(active_questions), 0)::integer AS active_question_count,
      COALESCE(sum(approved_questions), 0)::integer AS approved_question_count,
      bool_and(
        active_questions >= minimum_questions
        AND approved_questions = active_questions
      ) AS required_categories_ready,
      (SELECT count(*)::integer
       FROM active_question
       WHERE category NOT IN (SELECT category FROM required)) AS unexpected_category_count
    FROM category_evidence
  )
  SELECT jsonb_build_object(
    'policyVersion','social-human-source-v1',
    'minimumDinKulturuQuestions',2,
    'requiredCategoryCount',summary.required_category_count,
    'categoryGap',summary.category_gap,
    'activeQuestionCount',summary.active_question_count + summary.unexpected_category_count,
    'approvedQuestionCount',summary.approved_question_count,
    'unapprovedQuestionCount',
      summary.active_question_count + summary.unexpected_category_count
        - summary.approved_question_count,
    'unexpectedCategoryCount',summary.unexpected_category_count,
    'evidenceSha256',encode(
      extensions.digest(manifest.evidence_manifest::text, 'sha256'), 'hex'
    ),
    'manifest',manifest.evidence_manifest,
    'sourceReady',
      summary.required_categories_ready
      AND summary.category_gap = 0
      AND summary.unexpected_category_count = 0
      AND summary.active_question_count = summary.approved_question_count,
    -- TYT Social has candidate-dependent Din Kulturu exemption / additional
    -- philosophy semantics.  No immutable candidate+exam+category policy or
    -- attempt snapshot exists yet, so content approval alone must never open
    -- learner or institution reporting surfaces.  A separate forward
    -- migration must introduce and prove that model before changing this gate.
    'candidatePolicyVersion',NULL,
    'candidatePolicyReady',false,
    'candidatePolicyReason','candidate-exam-category-policy-missing',
    'ready',false
  )
  FROM summary CROSS JOIN manifest
$fn$;

REVOKE ALL ON FUNCTION public.tyt_social_source_policy_integrity(text,text,text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.tyt_social_source_policy_integrity(text,text,text)
  IS 'Internal Social release proof: governed source evidence plus a fail-closed candidate eligibility/snapshot policy gate that remains disabled until a later forward migration.';

-- Resolve every registered question-storage scope, including ordinary exact
-- scopes such as turkce/TYT -> TYT. Unregistered scopes keep the legacy exact
-- exam-ref validation and no taxonomy lifecycle contract.
CREATE OR REPLACE FUNCTION public.resolve_question_curriculum_validation_scope(
  p_game text,
  p_question_exam_ref text
)
RETURNS TABLE (
  display_exam_ref text,
  taxonomy_version text,
  release_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  WITH normalized AS (
    SELECT lower(btrim(p_game)) AS game,
      NULLIF(upper(btrim(COALESCE(p_question_exam_ref, ''))), '') AS question_exam_ref
  ), registered_scope AS (
    SELECT scope.display_exam_ref::text, scope.taxonomy_version::text,
      scope.release_status::text
    FROM public.curriculum_scope_releases AS scope
    CROSS JOIN normalized
    WHERE scope.game = normalized.game
      AND scope.question_exam_ref IS NOT DISTINCT FROM normalized.question_exam_ref
  )
  SELECT scope.display_exam_ref, scope.taxonomy_version, scope.release_status
  FROM registered_scope AS scope
  UNION ALL
  SELECT normalized.question_exam_ref, NULL::text, NULL::text
  FROM normalized
  WHERE NOT EXISTS (SELECT 1 FROM registered_scope)
$fn$;

REVOKE ALL ON FUNCTION public.resolve_question_curriculum_validation_scope(text,text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.resolve_question_curriculum_validation_scope(text,text)
  IS 'Resolves registered exact or split question-storage scope lifecycle for internal fail-closed validation.';

-- Keep the existing trigger/function identifiers so upgrades from migration
-- 187 replace their behavior atomically without a trigger-disable window.
CREATE OR REPLACE FUNCTION public.tg_question_outcome_split_scope_row_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_taxonomy_version text;
  v_release_status text;
BEGIN
  SELECT scope.taxonomy_version, scope.release_status
  INTO v_taxonomy_version, v_release_status
  FROM public.questions AS question
  CROSS JOIN LATERAL public.resolve_question_curriculum_validation_scope(
    question.game, question.exam_ref
  ) AS scope
  WHERE question.id = NEW.question_id;

  -- Unregistered scopes retain the pre-registry outcome validation contract.
  IF v_taxonomy_version IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT COALESCE(v_release_status IN ('validating','released'), false)
    OR NOT public.question_outcome_scope_valid(NEW.question_id, NEW.outcome_id) THEN
    RAISE EXCEPTION 'question outcome is outside the active registered curriculum scope'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.assert_split_question_outcome_integrity(
  p_question_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_is_active boolean;
  v_taxonomy_version text;
  v_release_status text;
BEGIN
  SELECT question.is_active, scope.taxonomy_version, scope.release_status
  INTO v_is_active, v_taxonomy_version, v_release_status
  FROM public.questions AS question
  CROSS JOIN LATERAL public.resolve_question_curriculum_validation_scope(
    question.game, question.exam_ref
  ) AS scope
  WHERE question.id = p_question_id;

  IF NOT FOUND OR NOT COALESCE(v_is_active, false) OR v_taxonomy_version IS NULL THEN
    RETURN;
  END IF;

  -- Draft/retired mappings may be removed, but the immediate row guard rejects
  -- new writes. Cardinality becomes mandatory while validating or released.
  IF NOT COALESCE(v_release_status IN ('validating','released'), false) THEN
    RETURN;
  END IF;

  IF NOT public.question_active_outcome_mapping_valid(p_question_id) THEN
    RAISE EXCEPTION 'active registered-scope question mapping is invalid or unreleased'
      USING ERRCODE = '22023';
  END IF;
END
$fn$;

REVOKE ALL ON FUNCTION public.assert_split_question_outcome_integrity(uuid),
  public.tg_assert_split_question_outcome_integrity(),
  public.tg_question_outcome_split_scope_row_guard()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.assert_split_question_outcome_integrity(uuid)
  IS 'Deferred DB-boundary assertion for active registered exact or split curriculum mappings.';

-- Refuse a partial/fresh install whose registry rows are missing. A later
-- taxonomy or an operator-retired scope is preserved and skipped on replay.
DO $fn$
BEGIN
  IF EXISTS (
    WITH expected(game, display_exam_ref) AS (
      VALUES ('sosyal','TYT')
    )
    SELECT 1
    FROM expected
    LEFT JOIN public.curriculum_scope_releases AS scope
      ON scope.game = expected.game
     AND scope.display_exam_ref = expected.display_exam_ref
    WHERE scope.game IS NULL
  ) THEN
    RAISE EXCEPTION 'TYT Social registry foundation is missing'
      USING ERRCODE = '55000';
  END IF;
END
$fn$;

CREATE TEMP TABLE tyt_humanities_scope_release_control (
  game text PRIMARY KEY,
  display_exam_ref text NOT NULL,
  question_exam_ref text NOT NULL,
  taxonomy_version text NOT NULL,
  should_apply boolean NOT NULL,
  should_sync boolean NOT NULL,
  should_release boolean NOT NULL,
  source_policy jsonb NOT NULL,
  source_policy_ready boolean NOT NULL,
  source_policy_evidence_sha256 text,
  prior_released_at timestamptz
) ON COMMIT DROP;

INSERT INTO tyt_humanities_scope_release_control (
  game, display_exam_ref, question_exam_ref, taxonomy_version, should_apply,
  should_sync, should_release, source_policy, source_policy_ready,
  source_policy_evidence_sha256, prior_released_at
)
SELECT expected.game, expected.display_exam_ref, expected.question_exam_ref,
  expected.taxonomy_version,
  scope.question_exam_ref IS NOT DISTINCT FROM expected.question_exam_ref
    AND scope.taxonomy_version = expected.taxonomy_version
    AND scope.release_status IN ('draft','validating','released'),
  scope.question_exam_ref IS NOT DISTINCT FROM expected.question_exam_ref
    AND scope.taxonomy_version = expected.taxonomy_version
    AND scope.release_status IN ('draft','validating')
    AND readiness.has_required_categories
    AND source_policy.is_ready,
  scope.question_exam_ref IS NOT DISTINCT FROM expected.question_exam_ref
    AND scope.taxonomy_version = expected.taxonomy_version
    AND readiness.has_required_categories
    AND source_policy.is_ready
    AND (
      scope.release_status = 'released'
      OR (
        scope.release_status IN ('draft','validating')
      )
    ),
  source_policy.evidence,
  source_policy.is_ready,
  source_policy.evidence->>'evidenceSha256',
  scope.released_at
FROM (VALUES
  ('sosyal','TYT','TYT','ba-tyt-sosyal-v1')
) AS expected(game,display_exam_ref,question_exam_ref,taxonomy_version)
JOIN public.curriculum_scope_releases AS scope
  ON scope.game = expected.game
 AND scope.display_exam_ref = expected.display_exam_ref
CROSS JOIN LATERAL (
  SELECT NOT EXISTS (
    SELECT 1
    FROM (VALUES
      ('tarih'),('cografya'),('felsefe'),('sosyoloji'),('din_kulturu')
    ) AS required(category)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.questions AS question
      WHERE question.is_active
        AND question.game::text = expected.game
        AND upper(btrim(COALESCE(question.exam_ref::text, '')))
          = expected.question_exam_ref
        AND question.category::text = required.category
    )
  ) AS has_required_categories
) AS readiness
CROSS JOIN LATERAL (
  SELECT evidence,
    COALESCE((evidence->>'ready')::boolean, false) AS is_ready
  FROM (
    SELECT public.tyt_social_source_policy_integrity(
      expected.game, expected.display_exam_ref, expected.taxonomy_version
    ) AS evidence
  ) AS calculated
) AS source_policy;

-- Social is intentionally allowed to remain draft when the reviewed source
-- bank is incomplete. This lets later foundation migrations apply without
-- publishing an empty or misleading mastery graph. A dedicated future Social
-- release migration must re-prove the full exam/candidate policy before it can
-- open this scope.

INSERT INTO public.curriculum_scope_source_policy_evidence (
  game, display_exam_ref, taxonomy_version, source_policy_version,
  evidence_sha256, evidence_manifest, approved_question_count,
  required_category_count
)
SELECT target.game, target.display_exam_ref, target.taxonomy_version,
  target.source_policy->>'policyVersion',
  target.source_policy_evidence_sha256,
  target.source_policy->'manifest',
  (target.source_policy->>'approvedQuestionCount')::integer,
  (target.source_policy->>'requiredCategoryCount')::integer
FROM tyt_humanities_scope_release_control AS target
WHERE target.source_policy_ready
ON CONFLICT (
  game, display_exam_ref, taxonomy_version, source_policy_version, evidence_sha256
) DO NOTHING;

DO $fn$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM tyt_humanities_scope_release_control AS target
    WHERE target.source_policy_ready
      AND NOT EXISTS (
        SELECT 1
        FROM public.curriculum_scope_source_policy_evidence AS evidence
        WHERE evidence.game = target.game
          AND evidence.display_exam_ref = target.display_exam_ref
          AND evidence.taxonomy_version = target.taxonomy_version
          AND evidence.source_policy_version = target.source_policy->>'policyVersion'
          AND evidence.evidence_sha256 = target.source_policy_evidence_sha256
      )
  ) THEN
    RAISE EXCEPTION 'TYT Social immutable source-policy evidence was not persisted'
      USING ERRCODE = '55000';
  END IF;
END
$fn$;

-- Replays are fail-closed too.  A previously released v1 scope whose current
-- published bank no longer proves the exact source policy is withdrawn from
-- every resolver before any repair or mapping mutation can run.
UPDATE public.curriculum_scope_releases AS scope
SET release_status = 'draft',
    diagnostic_enabled = false,
    updated_at = clock_timestamp()
FROM tyt_humanities_scope_release_control AS target
WHERE target.should_apply
  AND NOT target.should_release
  AND scope.game = target.game
  AND scope.display_exam_ref = target.display_exam_ref
  AND scope.question_exam_ref IS NOT DISTINCT FROM target.question_exam_ref
  AND scope.taxonomy_version = target.taxonomy_version
  AND scope.release_status IN ('draft','validating','released');

-- Do not expose the scope before the historical repair can be attributed from
-- immutable snapshots. Missing materialization markers are a separate recovery
-- workflow; snapshot-less or drifted answers require an explicit policy rather
-- than silently inheriting mutable current question metadata.
DO $fn$
DECLARE
  v_marker_gap integer;
  v_snapshot_gap integer;
BEGIN
  SELECT count(DISTINCT attempt.id)::integer INTO v_marker_gap
  FROM tyt_humanities_scope_release_control AS target
  JOIN public.verified_attempts AS attempt
    ON target.should_sync
   AND attempt.game = target.game
   AND attempt.completed_at IS NOT NULL
   AND attempt.session_id IS NOT NULL
  JOIN public.session_answers AS answer
    ON answer.session_id = attempt.session_id
   AND answer.user_id = attempt.user_id
  JOIN public.questions AS question
    ON question.id = answer.question_id
   AND question.game::text = target.game
   AND upper(btrim(COALESCE(question.exam_ref::text, ''))) = target.question_exam_ref
   AND question.is_active
  WHERE answer.question_id = ANY(attempt.question_ids)
    AND NOT COALESCE(answer.is_skipped, false)
    AND NOT EXISTS (
      SELECT 1 FROM public.mastery_materialized_attempts AS marker
      WHERE marker.attempt_id = attempt.id
    );

  SELECT count(*)::integer INTO v_snapshot_gap
  FROM tyt_humanities_scope_release_control AS target
  JOIN public.verified_attempts AS attempt
    ON target.should_sync
   AND attempt.game = target.game
   AND attempt.completed_at IS NOT NULL
   AND attempt.session_id IS NOT NULL
  JOIN public.mastery_materialized_attempts AS marker
    ON marker.attempt_id = attempt.id
  JOIN public.session_answers AS answer
    ON answer.session_id = attempt.session_id
   AND answer.user_id = attempt.user_id
  JOIN public.questions AS question
    ON question.id = answer.question_id
   AND question.game::text = target.game
   AND upper(btrim(COALESCE(question.exam_ref::text, ''))) = target.question_exam_ref
   AND question.is_active
  LEFT JOIN public.verified_attempt_question_revisions AS snapshot
    ON snapshot.attempt_id = attempt.id
   AND snapshot.question_id = answer.question_id
  WHERE answer.question_id = ANY(attempt.question_ids)
    AND NOT COALESCE(answer.is_skipped, false)
    AND (
      snapshot.question_id IS NULL
      OR answer.question_revision_id IS NULL
      OR snapshot.revision_id IS DISTINCT FROM answer.question_revision_id
      OR snapshot.game IS DISTINCT FROM target.game
      OR upper(btrim(COALESCE(snapshot.exam_ref, ''))) IS DISTINCT FROM target.question_exam_ref
      OR snapshot.category IS DISTINCT FROM question.category::text
    );

  IF v_marker_gap <> 0 OR v_snapshot_gap <> 0 THEN
    RAISE EXCEPTION 'TYT Social release blocked by historical mastery provenance: marker gaps %, snapshot gaps %',
      v_marker_gap, v_snapshot_gap USING ERRCODE = '23514';
  END IF;
END
$fn$;

DO $fn$
DECLARE
  v_expected integer;
  v_updated integer;
BEGIN
  SELECT count(*)::integer INTO v_expected
  FROM tyt_humanities_scope_release_control
  WHERE should_sync;

  UPDATE public.curriculum_scope_releases AS scope
  SET release_status = CASE WHEN scope.release_status = 'released' THEN 'released' ELSE 'validating' END,
      diagnostic_enabled = false,
      updated_at = clock_timestamp()
  FROM tyt_humanities_scope_release_control AS target
  WHERE target.should_sync
    AND scope.game = target.game
    AND scope.display_exam_ref = target.display_exam_ref
    AND scope.question_exam_ref IS NOT DISTINCT FROM target.question_exam_ref
    AND scope.taxonomy_version = target.taxonomy_version
    AND scope.release_status IN ('draft','validating','released');
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> v_expected THEN
    RAISE EXCEPTION 'TYT Social validating transition lost rows: expected %, updated %',
      v_expected, v_updated USING ERRCODE = '55000';
  END IF;
END
$fn$;

DO $fn$
DECLARE
  v_question record;
BEGIN
  FOR v_question IN
    SELECT question.id, question.game::text AS game,
      question.exam_ref::text AS exam_ref,
      question.category::text AS category, question.is_active
    FROM public.questions AS question
    JOIN tyt_humanities_scope_release_control AS target
      ON target.should_sync
     AND target.game = question.game::text
     AND target.question_exam_ref = upper(btrim(COALESCE(question.exam_ref::text, '')))
    WHERE question.is_active
    ORDER BY question.game, question.id
  LOOP
    PERFORM public.sync_taxonomy_auto_question_outcomes(
      v_question.id,
      v_question.game,
      v_question.exam_ref,
      v_question.category,
      v_question.is_active
    );
  END LOOP;
END
$fn$;

DO $fn$
DECLARE
  v_target record;
  v_integrity jsonb;
BEGIN
  FOR v_target IN
    SELECT * FROM tyt_humanities_scope_release_control
    WHERE should_release
    ORDER BY game
  LOOP
    v_integrity := public.curriculum_scope_integrity(
      v_target.game, v_target.display_exam_ref, v_target.taxonomy_version
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
      RAISE EXCEPTION '%/% curriculum scope failed release integrity: %',
        v_target.game, v_target.display_exam_ref, v_integrity
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
END
$fn$;

UPDATE public.curriculum_scope_releases AS scope
SET release_status = 'released',
    diagnostic_enabled = false,
    released_at = COALESCE(scope.released_at, clock_timestamp()),
    updated_at = clock_timestamp()
FROM tyt_humanities_scope_release_control AS target
WHERE target.should_sync
  AND scope.game = target.game
  AND scope.display_exam_ref = target.display_exam_ref
  AND scope.question_exam_ref IS NOT DISTINCT FROM target.question_exam_ref
  AND scope.taxonomy_version = target.taxonomy_version
  AND scope.release_status IN ('validating','released');

DO $fn$
DECLARE
  v_target record;
  v_scope jsonb;
  v_registered record;
  v_split_trigger_count integer;
  v_row_trigger_count integer;
BEGIN
  FOR v_target IN
    SELECT * FROM tyt_humanities_scope_release_control
    WHERE should_release
    ORDER BY game
  LOOP
    v_scope := public.resolve_released_curriculum_scope(
      v_target.game, v_target.display_exam_ref
    );
    IF v_scope IS NULL
      OR v_scope->>'game' <> v_target.game
      OR v_scope->>'displayExamRef' <> v_target.display_exam_ref
      OR v_scope->>'questionExamRef' <> v_target.question_exam_ref
      OR v_scope->>'taxonomyVersion' <> v_target.taxonomy_version
      OR v_scope->>'mappingMode' <> 'category_proxy'
      OR COALESCE((v_scope->>'diagnosticEnabled')::boolean, true) THEN
      RAISE EXCEPTION '%/% released scope resolver postcheck failed: %',
        v_target.game, v_target.display_exam_ref, v_scope
        USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_registered
    FROM public.resolve_question_curriculum_validation_scope(
      v_target.game, v_target.question_exam_ref
    );
    IF NOT FOUND
      OR v_registered.display_exam_ref IS DISTINCT FROM v_target.display_exam_ref
      OR v_registered.taxonomy_version IS DISTINCT FROM v_target.taxonomy_version
      OR v_registered.release_status IS DISTINCT FROM 'released' THEN
      RAISE EXCEPTION '%/% registered validation scope postcheck failed',
        v_target.game, v_target.display_exam_ref USING ERRCODE = '23514';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM tyt_humanities_scope_release_control AS target
    JOIN public.curriculum_scope_releases AS scope
      ON scope.game = target.game
     AND scope.display_exam_ref = target.display_exam_ref
    WHERE target.should_apply
      AND NOT target.should_release
      AND (
        scope.release_status <> 'draft'
        OR scope.diagnostic_enabled
        OR scope.released_at IS DISTINCT FROM target.prior_released_at
      )
  ) THEN
    RAISE EXCEPTION 'incomplete TYT Social scope was not kept fail-closed'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::integer INTO v_split_trigger_count
  FROM pg_catalog.pg_trigger
  WHERE tgrelid IN ('public.questions'::regclass, 'public.question_outcomes'::regclass)
    AND tgname IN (
      'trg_questions_split_scope_integrity',
      'trg_question_outcomes_split_scope_integrity'
    )
    AND tgenabled <> 'D'
    AND tgdeferrable
    AND tginitdeferred;
  IF v_split_trigger_count <> 2 THEN
    RAISE EXCEPTION 'registered-scope deferred integrity triggers are not enabled'
      USING ERRCODE = '55000';
  END IF;

  SELECT count(*)::integer INTO v_row_trigger_count
  FROM pg_catalog.pg_trigger
  WHERE tgrelid = 'public.question_outcomes'::regclass
    AND tgname = 'trg_question_outcomes_split_scope_row_guard'
    AND tgenabled <> 'D'
    AND NOT tgdeferrable;
  IF v_row_trigger_count <> 1 THEN
    RAISE EXCEPTION 'registered-scope immediate mapping guard is not enabled'
      USING ERRCODE = '55000';
  END IF;
END
$fn$;

NOTIFY pgrst, 'reload schema';
COMMIT;
