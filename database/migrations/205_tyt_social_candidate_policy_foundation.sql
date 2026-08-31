-- Migration 205: TYT Social candidate-route policy foundation.
--
-- The official booklet has 15 common questions followed by two alternative
-- five-question branches. This migration keeps learning taxonomy (`category`)
-- independent from booklet role, stores only the selected question range (not
-- religion, exemption reason or documents), and leaves the public mastery
-- scope fail-closed while reviewed role mappings and snapshot issuers are built.

BEGIN;

CREATE TABLE IF NOT EXISTS public.exam_candidate_policy_versions (
  policy_version text PRIMARY KEY CHECK (policy_version ~ '^tyt-social-[0-9]{4}-v[0-9]+$'),
  game text NOT NULL CHECK (game = 'sosyal'),
  display_exam_ref text NOT NULL CHECK (display_exam_ref = 'TYT'),
  question_exam_ref text NOT NULL CHECK (question_exam_ref = 'TYT'),
  taxonomy_version text NOT NULL CHECK (taxonomy_version = 'ba-tyt-sosyal-v1'),
  valid_from date NOT NULL,
  valid_until date,
  status text NOT NULL CHECK (status IN ('draft','validating','released','retired')),
  rules jsonb NOT NULL CHECK (jsonb_typeof(rules) = 'object'),
  rules_sha256 text NOT NULL CHECK (rules_sha256 ~ '^[0-9a-f]{64}$'),
  official_source_url text NOT NULL CHECK (official_source_url ~ '^https://'),
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  CHECK (status <> 'released' OR released_at IS NOT NULL),
  UNIQUE (policy_version, rules_sha256)
);

CREATE TABLE IF NOT EXISTS public.exam_candidate_policy_variants (
  policy_version text NOT NULL REFERENCES public.exam_candidate_policy_versions(policy_version) ON DELETE RESTRICT,
  variant_code text NOT NULL CHECK (variant_code IN ('questions_16_20','questions_21_25')),
  question_range int4range NOT NULL,
  allowed_roles text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (policy_version, variant_code),
  CHECK (NOT isempty(question_range)),
  CHECK (cardinality(allowed_roles) = 4),
  CHECK (allowed_roles <@ ARRAY[
    'common_history','common_geography','common_philosophy',
    'standard_religion','alternate_philosophy'
  ]::text[])
);

CREATE TABLE IF NOT EXISTS public.question_revision_exam_role_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_version text NOT NULL REFERENCES public.exam_candidate_policy_versions(policy_version) ON DELETE RESTRICT,
  revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  proposed_role text NOT NULL CHECK (proposed_role IN (
    'common_history','common_geography','common_philosophy',
    'standard_religion','alternate_philosophy'
  )),
  rationale text NOT NULL CHECK (char_length(btrim(rationale)) BETWEEN 10 AND 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','stage1_approved','approved','rejected')),
  prepared_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  prepared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_at timestamptz,
  UNIQUE (id, policy_version, revision_id, proposed_role)
);

CREATE UNIQUE INDEX IF NOT EXISTS question_revision_exam_role_candidate_open_uidx
  ON public.question_revision_exam_role_candidates(policy_version, revision_id)
  WHERE status IN ('pending','stage1_approved','approved');

CREATE TABLE IF NOT EXISTS public.question_revision_exam_role_reviews (
  candidate_id uuid NOT NULL REFERENCES public.question_revision_exam_role_candidates(id) ON DELETE RESTRICT,
  stage smallint NOT NULL CHECK (stage IN (1,2)),
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('approved','rejected')),
  rationale text NOT NULL CHECK (char_length(btrim(rationale)) BETWEEN 10 AND 1000),
  request_id uuid NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (candidate_id, stage),
  UNIQUE (reviewer_id, request_id)
);

CREATE TABLE IF NOT EXISTS public.question_revision_exam_roles (
  policy_version text NOT NULL REFERENCES public.exam_candidate_policy_versions(policy_version) ON DELETE RESTRICT,
  revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  exam_role text NOT NULL CHECK (exam_role IN (
    'common_history','common_geography','common_philosophy',
    'standard_religion','alternate_philosophy'
  )),
  candidate_id uuid NOT NULL UNIQUE,
  stage1_reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  stage2_reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (policy_version, revision_id),
  UNIQUE (policy_version, revision_id, exam_role),
  FOREIGN KEY (candidate_id, policy_version, revision_id, exam_role)
    REFERENCES public.question_revision_exam_role_candidates(
      id, policy_version, revision_id, proposed_role
    ) ON DELETE RESTRICT,
  CHECK (stage1_reviewer_id <> stage2_reviewer_id)
);

CREATE TABLE IF NOT EXISTS public.candidate_exam_policy_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  policy_version text NOT NULL REFERENCES public.exam_candidate_policy_versions(policy_version) ON DELETE RESTRICT,
  variant_code text NOT NULL,
  notice_version text NOT NULL CHECK (notice_version = 'tyt-social-choice-notice-v1'),
  request_id uuid NOT NULL,
  supersedes_event_id uuid,
  effective_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  privacy_classification text NOT NULL DEFAULT 'sensitive_inference'
    CHECK (privacy_classification = 'sensitive_inference'),
  UNIQUE (user_id, request_id),
  UNIQUE (supersedes_event_id),
  UNIQUE (id, user_id, policy_version),
  UNIQUE (id, user_id, policy_version, variant_code, effective_at),
  FOREIGN KEY (supersedes_event_id, user_id, policy_version)
    REFERENCES public.candidate_exam_policy_events(id, user_id, policy_version) ON DELETE RESTRICT,
  FOREIGN KEY (policy_version, variant_code)
    REFERENCES public.exam_candidate_policy_variants(policy_version, variant_code) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS candidate_exam_policy_events_current_idx
  ON public.candidate_exam_policy_events(user_id, policy_version, effective_at DESC, id DESC);

COMMENT ON TABLE public.candidate_exam_policy_events IS
  'Append-only sensitive inference: stores only the selected TYT Social question range. No religion, exemption reason or document. Governed retention/erasure is required; direct profile cascade is forbidden.';

-- Redundant owner-qualified keys let immutable snapshots prove their parent
-- belongs to the same user without trusting a future writer or application.
CREATE UNIQUE INDEX IF NOT EXISTS verified_attempts_id_user_uidx
  ON public.verified_attempts(id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS daily_plan_id_user_uidx
  ON public.daily_plan(id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS question_content_revisions_id_question_uidx
  ON public.question_content_revisions(id, question_id);

-- Fact tables are created now so every future writer has one immutable target.
-- Migration 205 deliberately creates no issuance writer and therefore cannot
-- make the candidate-policy integrity gate ready by itself.
CREATE TABLE IF NOT EXISTS public.verified_attempt_candidate_policy_snapshots (
  attempt_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  policy_version text NOT NULL,
  variant_code text NOT NULL,
  artifact_kind text NOT NULL CHECK (artifact_kind IN (
    'practice','daily_plan','smart_mock','official_section'
  )),
  source_plan_id uuid,
  issue_request_id uuid NOT NULL,
  selection_event_id uuid NOT NULL,
  selection_effective_at timestamptz NOT NULL,
  rules_sha256 text NOT NULL CHECK (rules_sha256 ~ '^[0-9a-f]{64}$'),
  question_set_sha256 text NOT NULL CHECK (question_set_sha256 ~ '^[0-9a-f]{64}$'),
  composition jsonb NOT NULL CHECK (jsonb_typeof(composition) = 'object'),
  resolved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((artifact_kind='daily_plan')=(source_plan_id IS NOT NULL)),
  UNIQUE (attempt_id, policy_version),
  UNIQUE (user_id, issue_request_id),
  FOREIGN KEY (attempt_id, user_id)
    REFERENCES public.verified_attempts(id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (selection_event_id, user_id, policy_version, variant_code, selection_effective_at)
    REFERENCES public.candidate_exam_policy_events(
      id, user_id, policy_version, variant_code, effective_at
    ) ON DELETE RESTRICT,
  FOREIGN KEY (policy_version, rules_sha256)
    REFERENCES public.exam_candidate_policy_versions(policy_version, rules_sha256) ON DELETE RESTRICT,
  FOREIGN KEY (policy_version, variant_code)
    REFERENCES public.exam_candidate_policy_variants(policy_version, variant_code) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.verified_attempt_question_exam_role_snapshots (
  attempt_id uuid NOT NULL,
  policy_version text NOT NULL,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 100),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  revision_id uuid NOT NULL,
  exam_role text NOT NULL CHECK (exam_role IN (
    'common_history','common_geography','common_philosophy',
    'standard_religion','alternate_philosophy'
  )),
  gradeable boolean NOT NULL DEFAULT true,
  PRIMARY KEY (attempt_id, position),
  UNIQUE (attempt_id, question_id),
  FOREIGN KEY (attempt_id, policy_version)
    REFERENCES public.verified_attempt_candidate_policy_snapshots(attempt_id, policy_version) ON DELETE RESTRICT,
  FOREIGN KEY (revision_id, question_id)
    REFERENCES public.question_content_revisions(id, question_id) ON DELETE RESTRICT,
  FOREIGN KEY (policy_version, revision_id, exam_role)
    REFERENCES public.question_revision_exam_roles(policy_version, revision_id, exam_role) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.daily_plan_candidate_policy_snapshots (
  plan_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  policy_version text NOT NULL,
  variant_code text NOT NULL,
  selection_event_id uuid NOT NULL,
  selection_effective_at timestamptz NOT NULL,
  rules_sha256 text NOT NULL CHECK (rules_sha256 ~ '^[0-9a-f]{64}$'),
  resolved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (plan_id, policy_version),
  UNIQUE (plan_id, user_id, policy_version, variant_code, selection_event_id),
  FOREIGN KEY (plan_id, user_id)
    REFERENCES public.daily_plan(id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (selection_event_id, user_id, policy_version, variant_code, selection_effective_at)
    REFERENCES public.candidate_exam_policy_events(
      id, user_id, policy_version, variant_code, effective_at
    ) ON DELETE RESTRICT,
  FOREIGN KEY (policy_version, rules_sha256)
    REFERENCES public.exam_candidate_policy_versions(policy_version, rules_sha256) ON DELETE RESTRICT,
  FOREIGN KEY (policy_version, variant_code)
    REFERENCES public.exam_candidate_policy_variants(policy_version, variant_code) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.daily_plan_question_exam_role_snapshots (
  plan_id uuid NOT NULL,
  policy_version text NOT NULL,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 15),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  revision_id uuid NOT NULL,
  exam_role text NOT NULL CHECK (exam_role IN (
    'common_history','common_geography','common_philosophy',
    'standard_religion','alternate_philosophy'
  )),
  PRIMARY KEY (plan_id, position),
  UNIQUE (plan_id, question_id),
  FOREIGN KEY (plan_id, policy_version)
    REFERENCES public.daily_plan_candidate_policy_snapshots(plan_id, policy_version) ON DELETE RESTRICT,
  FOREIGN KEY (revision_id, question_id)
    REFERENCES public.question_content_revisions(id, question_id) ON DELETE RESTRICT,
  FOREIGN KEY (policy_version, revision_id, exam_role)
    REFERENCES public.question_revision_exam_roles(policy_version, revision_id, exam_role) ON DELETE RESTRICT
);

ALTER TABLE public.verified_attempt_candidate_policy_snapshots
  ADD CONSTRAINT verified_attempt_policy_source_plan_fkey
  FOREIGN KEY (source_plan_id,user_id,policy_version,variant_code,selection_event_id)
  REFERENCES public.daily_plan_candidate_policy_snapshots(
    plan_id,user_id,policy_version,variant_code,selection_event_id
  ) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.tyt_social_policy_capabilities (
  policy_version text NOT NULL REFERENCES public.exam_candidate_policy_versions(policy_version) ON DELETE RESTRICT,
  capability text NOT NULL CHECK (capability IN ('snapshot_boundary_v1')),
  capability_version integer NOT NULL CHECK (capability_version = 1),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  activated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (policy_version, capability, capability_version)
);

CREATE OR REPLACE FUNCTION public.tg_exam_candidate_policy_version_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_expected_hash text;
BEGIN
  v_expected_hash := encode(extensions.digest(NEW.rules::text, 'sha256'), 'hex');
  IF NEW.rules_sha256 IS DISTINCT FROM v_expected_hash THEN
    RAISE EXCEPTION 'candidate policy rules hash mismatch' USING ERRCODE='23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('released','retired') THEN
    IF OLD.status = 'released' AND NEW.status = 'retired'
      AND (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'released or retired candidate policy is immutable except released-to-retired withdrawal'
      USING ERRCODE='55000';
  END IF;
  IF NEW.status = 'released' AND EXISTS (
    SELECT 1 FROM public.exam_candidate_policy_versions AS existing
    WHERE existing.policy_version <> NEW.policy_version
      AND existing.game = NEW.game
      AND existing.display_exam_ref = NEW.display_exam_ref
      AND existing.status = 'released'
      AND daterange(existing.valid_from, existing.valid_until, '[)')
        && daterange(NEW.valid_from, NEW.valid_until, '[)')
  ) THEN
    RAISE EXCEPTION 'candidate policy validity ranges overlap' USING ERRCODE='23P01';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_exam_candidate_policy_version_guard ON public.exam_candidate_policy_versions;
CREATE TRIGGER trg_exam_candidate_policy_version_guard
BEFORE INSERT OR UPDATE ON public.exam_candidate_policy_versions
FOR EACH ROW EXECUTE FUNCTION public.tg_exam_candidate_policy_version_guard();

CREATE OR REPLACE FUNCTION public.tg_tyt_social_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE='55000';
END
$fn$;

DO $fn$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'exam_candidate_policy_variants',
    'question_revision_exam_role_reviews',
    'question_revision_exam_roles',
    'candidate_exam_policy_events',
    'verified_attempt_candidate_policy_snapshots',
    'verified_attempt_question_exam_role_snapshots',
    'daily_plan_candidate_policy_snapshots',
    'daily_plan_question_exam_role_snapshots',
    'tyt_social_policy_capabilities'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_append_only ON public.%I', v_table, v_table);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_append_only BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_tyt_social_append_only()',
      v_table, v_table
    );
  END LOOP;
END
$fn$;

ALTER TABLE public.exam_candidate_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_candidate_policy_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_revision_exam_role_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_revision_exam_role_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_revision_exam_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_exam_policy_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verified_attempt_candidate_policy_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verified_attempt_question_exam_role_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_plan_candidate_policy_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_plan_question_exam_role_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tyt_social_policy_capabilities ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.exam_candidate_policy_versions,
  public.exam_candidate_policy_variants,
  public.question_revision_exam_role_candidates,
  public.question_revision_exam_role_reviews,
  public.question_revision_exam_roles,
  public.candidate_exam_policy_events,
  public.verified_attempt_candidate_policy_snapshots,
  public.verified_attempt_question_exam_role_snapshots,
  public.daily_plan_candidate_policy_snapshots,
  public.daily_plan_question_exam_role_snapshots,
  public.tyt_social_policy_capabilities
FROM PUBLIC, anon, authenticated, service_role;

DO $fn$
DECLARE
  v_rules jsonb := jsonb_build_object(
    'game','sosyal',
    'displayExamRef','TYT',
    'bookletQuestionCount',25,
    'candidateQuestionCount',20,
    'common',jsonb_build_array(
      jsonb_build_object('from',1,'to',5,'role','common_history'),
      jsonb_build_object('from',6,'to',10,'role','common_geography'),
      jsonb_build_object('from',11,'to',15,'role','common_philosophy')
    ),
    'variants',jsonb_build_object(
      'questions_16_20',jsonb_build_object('from',16,'to',20,'role','standard_religion'),
      'questions_21_25',jsonb_build_object('from',21,'to',25,'role','alternate_philosophy')
    ),
    'privacy',jsonb_build_object('storeReason',false,'storeReligion',false,'storeDocument',false)
  );
BEGIN
  INSERT INTO public.exam_candidate_policy_versions(
    policy_version,game,display_exam_ref,question_exam_ref,taxonomy_version,
    valid_from,valid_until,status,rules,rules_sha256,official_source_url,released_at
  ) VALUES (
    'tyt-social-2026-v1','sosyal','TYT','TYT','ba-tyt-sosyal-v1',
    DATE '2026-01-01',DATE '2027-01-01','released',v_rules,
    encode(extensions.digest(v_rules::text,'sha256'),'hex'),
    'https://dokuman.osym.gov.tr/pdfdokuman/2026/yks/tsk/yks_tyt_2026_kitapcik_d350.pdf',
    clock_timestamp()
  ) ON CONFLICT (policy_version) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.exam_candidate_policy_versions
    WHERE policy_version='tyt-social-2026-v1'
      AND game='sosyal'
      AND display_exam_ref='TYT'
      AND question_exam_ref='TYT'
      AND taxonomy_version='ba-tyt-sosyal-v1'
      AND valid_from=DATE '2026-01-01'
      AND valid_until=DATE '2027-01-01'
      AND rules_sha256=encode(extensions.digest(v_rules::text,'sha256'),'hex')
      AND rules=v_rules
      AND official_source_url='https://dokuman.osym.gov.tr/pdfdokuman/2026/yks/tsk/yks_tyt_2026_kitapcik_d350.pdf'
      AND status='released'
      AND released_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'TYT Social policy seed drifted' USING ERRCODE='23514';
  END IF;
END
$fn$;

INSERT INTO public.exam_candidate_policy_variants(
  policy_version,variant_code,question_range,allowed_roles
) VALUES
  ('tyt-social-2026-v1','questions_16_20',int4range(16,21,'[)'),
    ARRAY['common_history','common_geography','common_philosophy','standard_religion']),
  ('tyt-social-2026-v1','questions_21_25',int4range(21,26,'[)'),
    ARRAY['common_history','common_geography','common_philosophy','alternate_philosophy'])
ON CONFLICT (policy_version,variant_code) DO NOTHING;

DO $fn$
BEGIN
  IF (SELECT count(*) FROM public.exam_candidate_policy_variants
      WHERE policy_version='tyt-social-2026-v1') <> 2
    OR NOT EXISTS (
      SELECT 1 FROM public.exam_candidate_policy_variants
      WHERE policy_version='tyt-social-2026-v1'
        AND variant_code='questions_16_20'
        AND question_range=int4range(16,21,'[)')
        AND allowed_roles=ARRAY[
          'common_history','common_geography','common_philosophy','standard_religion'
        ]::text[]
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.exam_candidate_policy_variants
      WHERE policy_version='tyt-social-2026-v1'
        AND variant_code='questions_21_25'
        AND question_range=int4range(21,26,'[)')
        AND allowed_roles=ARRAY[
          'common_history','common_geography','common_philosophy','alternate_philosophy'
        ]::text[]
    ) THEN
    RAISE EXCEPTION 'TYT Social policy variant seed drifted' USING ERRCODE='23514';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.resolve_current_tyt_social_candidate_policy()
RETURNS SETOF public.exam_candidate_policy_versions
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*)::integer INTO v_count
  FROM public.exam_candidate_policy_versions AS policy
  WHERE policy.game='sosyal' AND policy.display_exam_ref='TYT'
    AND policy.status='released'
    AND current_date >= policy.valid_from
    AND (policy.valid_until IS NULL OR current_date < policy.valid_until);
  IF v_count > 1 THEN
    RAISE EXCEPTION 'multiple active TYT Social candidate policies' USING ERRCODE='23514';
  END IF;
  RETURN QUERY
  SELECT policy.* FROM public.exam_candidate_policy_versions AS policy
  WHERE policy.game='sosyal' AND policy.display_exam_ref='TYT'
    AND policy.status='released'
    AND current_date >= policy.valid_from
    AND (policy.valid_until IS NULL OR current_date < policy.valid_until);
END
$fn$;

CREATE OR REPLACE FUNCTION public.resolve_tyt_social_exam_policy_for_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_policy public.exam_candidate_policy_versions%ROWTYPE;
  v_event public.candidate_exam_policy_events%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_policy FROM public.resolve_current_tyt_social_candidate_policy();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','unavailable','appliesTo','new_artifacts_only');
  END IF;
  SELECT * INTO v_event
  FROM public.candidate_exam_policy_events AS event
  WHERE event.user_id=p_user_id AND event.policy_version=v_policy.policy_version
    AND event.effective_at<=clock_timestamp()
  ORDER BY event.effective_at DESC,event.id DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status','setup_required','policyVersion',v_policy.policy_version,
      'rulesSha256',v_policy.rules_sha256,'appliesTo','new_artifacts_only'
    );
  END IF;
  RETURN jsonb_build_object(
    'status','active','policyVersion',v_policy.policy_version,
    'variant',v_event.variant_code,'effectiveAt',v_event.effective_at,
    'rulesSha256',v_policy.rules_sha256,'appliesTo','new_artifacts_only'
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.get_my_tyt_social_exam_policy()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE='42501';
  END IF;
  RETURN public.resolve_tyt_social_exam_policy_for_user(auth.uid());
END
$fn$;

CREATE OR REPLACE FUNCTION public.set_my_tyt_social_exam_policy(
  p_variant text,
  p_notice_version text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_policy public.exam_candidate_policy_versions%ROWTYPE;
  v_existing public.candidate_exam_policy_events%ROWTYPE;
  v_previous_id uuid;
  v_previous_effective_at timestamptz;
  v_recent_count integer;
  v_now timestamptz;
  v_event public.candidate_exam_policy_events%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL OR p_notice_version <> 'tyt-social-choice-notice-v1'
    OR p_variant NOT IN ('questions_16_20','questions_21_25') THEN
    RAISE EXCEPTION 'invalid TYT Social policy selection' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_policy FROM public.resolve_current_tyt_social_candidate_policy();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TYT Social policy unavailable' USING ERRCODE='55000';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'tyt-social-policy:'||v_user_id::text||':'||v_policy.policy_version,205
  ));
  -- Re-resolve after the per-user/policy lock. An operator may have retired
  -- the policy between the first lookup and lock acquisition.
  IF NOT EXISTS (
    SELECT 1 FROM public.exam_candidate_policy_versions AS policy
    WHERE policy.policy_version=v_policy.policy_version
      AND policy.status='released'
      AND current_date>=policy.valid_from
      AND (policy.valid_until IS NULL OR current_date<policy.valid_until)
  ) THEN
    RAISE EXCEPTION 'TYT Social policy unavailable' USING ERRCODE='55000';
  END IF;
  v_now:=clock_timestamp();
  IF NOT EXISTS (
    SELECT 1 FROM public.exam_candidate_policy_variants
    WHERE policy_version=v_policy.policy_version AND variant_code=p_variant
  ) THEN
    RAISE EXCEPTION 'TYT Social policy variant unavailable' USING ERRCODE='55000';
  END IF;
  SELECT * INTO v_existing FROM public.candidate_exam_policy_events
  WHERE user_id=v_user_id AND request_id=p_request_id FOR KEY SHARE;
  IF FOUND THEN
    IF v_existing.policy_version IS DISTINCT FROM v_policy.policy_version
      OR v_existing.variant_code IS DISTINCT FROM p_variant
      OR v_existing.notice_version IS DISTINCT FROM p_notice_version THEN
      RAISE EXCEPTION 'policy selection replay payload differs' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object(
      'status','active','policyVersion',v_existing.policy_version,
      'variant',v_existing.variant_code,'effectiveAt',v_existing.effective_at,
      'appliesTo','new_artifacts_only','replayed',true
    );
  END IF;
  SELECT id,effective_at INTO v_previous_id,v_previous_effective_at
  FROM public.candidate_exam_policy_events
  WHERE user_id=v_user_id AND policy_version=v_policy.policy_version
  ORDER BY effective_at DESC,id DESC LIMIT 1 FOR KEY SHARE;
  SELECT count(*)::integer INTO v_recent_count
  FROM public.candidate_exam_policy_events
  WHERE user_id=v_user_id AND policy_version=v_policy.policy_version
    AND recorded_at>=v_now-interval '24 hours';
  IF v_recent_count>=6
    OR (v_previous_effective_at IS NOT NULL AND v_previous_effective_at>v_now-interval '15 seconds') THEN
    RAISE EXCEPTION 'TYT Social policy selection rate limit exceeded' USING ERRCODE='55000';
  END IF;
  INSERT INTO public.candidate_exam_policy_events(
    user_id,policy_version,variant_code,notice_version,request_id,
    supersedes_event_id,effective_at,recorded_at
  ) VALUES (
    v_user_id,v_policy.policy_version,p_variant,p_notice_version,p_request_id,
    v_previous_id,v_now,v_now
  ) RETURNING * INTO v_event;
  RETURN jsonb_build_object(
    'status','active','policyVersion',v_event.policy_version,
    'variant',v_event.variant_code,'effectiveAt',v_event.effective_at,
    'appliesTo','new_artifacts_only','replayed',false
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.tyt_social_exam_role_compatible(
  p_category text,
  p_exam_role text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
  SELECT CASE p_exam_role
    WHEN 'common_history' THEN p_category='tarih'
    WHEN 'common_geography' THEN p_category='cografya'
    WHEN 'common_philosophy' THEN p_category IN ('felsefe','sosyoloji')
    WHEN 'standard_religion' THEN p_category='din_kulturu'
    WHEN 'alternate_philosophy' THEN p_category IN ('felsefe','sosyoloji')
    ELSE false
  END
$fn$;

CREATE OR REPLACE FUNCTION public.prepare_tyt_social_exam_role(
  p_actor_user_id uuid,
  p_revision_id uuid,
  p_exam_role text,
  p_rationale text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_policy public.exam_candidate_policy_versions%ROWTYPE;
  v_revision public.question_content_revisions%ROWTYPE;
  v_candidate public.question_revision_exam_role_candidates%ROWTYPE;
  v_old public.content_governance_requests%ROWTYPE;
  v_hash text;
  v_result jsonb;
BEGIN
  IF NOT public.question_outcome_mapping_actor_has_aal2(p_actor_user_id)
    OR NOT public.content_governance_has_permission(p_actor_user_id,'content.prepare') THEN
    RAISE EXCEPTION 'AAL2 content prepare permission required' USING ERRCODE='42501';
  END IF;
  IF p_revision_id IS NULL OR p_request_id IS NULL
    OR char_length(btrim(COALESCE(p_rationale,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'invalid exam-role proposal' USING ERRCODE='22023';
  END IF;
  PERFORM public.content_governance_lock_request(p_actor_user_id,'prepare_tyt_social_exam_role',p_request_id);
  v_hash:=public.content_governance_hash(jsonb_build_object(
    'revisionId',p_revision_id,'examRole',p_exam_role,'rationale',btrim(p_rationale)
  ));
  SELECT * INTO v_old FROM public.content_governance_requests
  WHERE user_id=p_actor_user_id AND operation='prepare_tyt_social_exam_role' AND request_id=p_request_id;
  IF FOUND THEN
    IF v_old.payload_hash<>v_hash THEN RAISE EXCEPTION 'exam-role proposal replay differs' USING ERRCODE='22023'; END IF;
    RETURN v_old.result||jsonb_build_object('replayed',true);
  END IF;
  SELECT * INTO v_policy FROM public.resolve_current_tyt_social_candidate_policy();
  IF NOT FOUND THEN RAISE EXCEPTION 'TYT Social policy unavailable' USING ERRCODE='55000'; END IF;
  SELECT * INTO v_revision FROM public.question_content_revisions
  WHERE id=p_revision_id AND status='published' AND game='sosyal'
    AND upper(btrim(COALESCE(exam_ref,'')))='TYT' FOR KEY SHARE;
  IF NOT FOUND OR NOT public.tyt_social_exam_role_compatible(v_revision.category,p_exam_role) THEN
    RAISE EXCEPTION 'revision and exam role are incompatible' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.question_revision_exam_roles WHERE policy_version=v_policy.policy_version AND revision_id=p_revision_id) THEN
    RAISE EXCEPTION 'revision exam role already approved' USING ERRCODE='23505';
  END IF;
  INSERT INTO public.question_revision_exam_role_candidates(
    policy_version,revision_id,proposed_role,rationale,prepared_by
  ) VALUES (
    v_policy.policy_version,p_revision_id,p_exam_role,btrim(p_rationale),p_actor_user_id
  ) RETURNING * INTO v_candidate;
  v_result:=jsonb_build_object(
    'candidateId',v_candidate.id,'revisionId',v_candidate.revision_id,
    'policyVersion',v_candidate.policy_version,'examRole',v_candidate.proposed_role,
    'status',v_candidate.status,'replayed',false
  );
  INSERT INTO public.content_governance_requests
  VALUES(p_actor_user_id,'prepare_tyt_social_exam_role',p_request_id,v_hash,v_result,clock_timestamp());
  RETURN v_result;
END
$fn$;

CREATE OR REPLACE FUNCTION public.review_tyt_social_exam_role(
  p_actor_user_id uuid,
  p_candidate_id uuid,
  p_stage smallint,
  p_decision text,
  p_rationale text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_candidate public.question_revision_exam_role_candidates%ROWTYPE;
  v_stage1 public.question_revision_exam_role_reviews%ROWTYPE;
  v_old public.content_governance_requests%ROWTYPE;
  v_hash text;
  v_result jsonb;
BEGIN
  IF NOT public.question_outcome_mapping_actor_has_aal2(p_actor_user_id)
    OR p_stage NOT IN (1,2)
    OR NOT public.content_governance_has_permission(
      p_actor_user_id,CASE p_stage WHEN 1 THEN 'content.review.stage1' ELSE 'content.review.stage2' END
    ) THEN
    RAISE EXCEPTION 'AAL2 content review permission required' USING ERRCODE='42501';
  END IF;
  IF p_candidate_id IS NULL OR p_request_id IS NULL OR p_decision NOT IN ('approved','rejected')
    OR char_length(btrim(COALESCE(p_rationale,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'invalid exam-role review' USING ERRCODE='22023';
  END IF;
  PERFORM public.content_governance_lock_request(p_actor_user_id,'review_tyt_social_exam_role',p_request_id);
  v_hash:=public.content_governance_hash(jsonb_build_object(
    'candidateId',p_candidate_id,'stage',p_stage,'decision',p_decision,'rationale',btrim(p_rationale)
  ));
  SELECT * INTO v_old FROM public.content_governance_requests
  WHERE user_id=p_actor_user_id AND operation='review_tyt_social_exam_role' AND request_id=p_request_id;
  IF FOUND THEN
    IF v_old.payload_hash<>v_hash THEN RAISE EXCEPTION 'exam-role review replay differs' USING ERRCODE='22023'; END IF;
    RETURN v_old.result||jsonb_build_object('replayed',true);
  END IF;
  SELECT * INTO v_candidate FROM public.question_revision_exam_role_candidates
  WHERE id=p_candidate_id FOR UPDATE;
  IF NOT FOUND OR v_candidate.status IN ('approved','rejected') OR v_candidate.prepared_by=p_actor_user_id THEN
    RAISE EXCEPTION 'candidate is not reviewable by actor' USING ERRCODE='22023';
  END IF;
  IF p_stage=1 AND v_candidate.status<>'pending' THEN
    RAISE EXCEPTION 'stage one review is out of order' USING ERRCODE='22023';
  END IF;
  IF p_stage=2 THEN
    SELECT * INTO v_stage1 FROM public.question_revision_exam_role_reviews
    WHERE candidate_id=p_candidate_id AND stage=1 AND decision='approved';
    IF NOT FOUND OR v_candidate.status<>'stage1_approved' OR v_stage1.reviewer_id=p_actor_user_id THEN
      RAISE EXCEPTION 'stage two requires an independent stage one approval' USING ERRCODE='22023';
    END IF;
  END IF;
  INSERT INTO public.question_revision_exam_role_reviews(
    candidate_id,stage,reviewer_id,decision,rationale,request_id
  ) VALUES (p_candidate_id,p_stage,p_actor_user_id,p_decision,btrim(p_rationale),p_request_id);
  IF p_decision='rejected' THEN
    UPDATE public.question_revision_exam_role_candidates
    SET status='rejected',decided_at=clock_timestamp() WHERE id=p_candidate_id;
  ELSIF p_stage=1 THEN
    UPDATE public.question_revision_exam_role_candidates
    SET status='stage1_approved' WHERE id=p_candidate_id;
  ELSE
    INSERT INTO public.question_revision_exam_roles(
      policy_version,revision_id,exam_role,candidate_id,stage1_reviewer_id,stage2_reviewer_id
    ) VALUES (
      v_candidate.policy_version,v_candidate.revision_id,v_candidate.proposed_role,
      v_candidate.id,v_stage1.reviewer_id,p_actor_user_id
    );
    UPDATE public.question_revision_exam_role_candidates
    SET status='approved',decided_at=clock_timestamp() WHERE id=p_candidate_id;
  END IF;
  SELECT jsonb_build_object(
    'candidateId',candidate.id,'revisionId',candidate.revision_id,
    'policyVersion',candidate.policy_version,'examRole',candidate.proposed_role,
    'status',candidate.status,'replayed',false
  ) INTO v_result FROM public.question_revision_exam_role_candidates AS candidate
  WHERE candidate.id=p_candidate_id;
  INSERT INTO public.content_governance_requests
  VALUES(p_actor_user_id,'review_tyt_social_exam_role',p_request_id,v_hash,v_result,clock_timestamp());
  RETURN v_result;
END
$fn$;

CREATE OR REPLACE FUNCTION public.assert_tyt_social_exam_role_approval(
  p_policy_version text,
  p_revision_id uuid
) RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_role public.question_revision_exam_roles%ROWTYPE;
  v_candidate public.question_revision_exam_role_candidates%ROWTYPE;
  v_stage1 public.question_revision_exam_role_reviews%ROWTYPE;
  v_stage2 public.question_revision_exam_role_reviews%ROWTYPE;
BEGIN
  SELECT * INTO v_role FROM public.question_revision_exam_roles
  WHERE policy_version=p_policy_version AND revision_id=p_revision_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TYT Social approved role not found' USING ERRCODE='P0002';
  END IF;
  SELECT * INTO v_candidate FROM public.question_revision_exam_role_candidates
  WHERE id=v_role.candidate_id;
  SELECT * INTO v_stage1 FROM public.question_revision_exam_role_reviews
  WHERE candidate_id=v_role.candidate_id AND stage=1;
  SELECT * INTO v_stage2 FROM public.question_revision_exam_role_reviews
  WHERE candidate_id=v_role.candidate_id AND stage=2;
  IF v_candidate.id IS NULL OR v_candidate.status<>'approved'
    OR v_candidate.policy_version IS DISTINCT FROM v_role.policy_version
    OR v_candidate.revision_id IS DISTINCT FROM v_role.revision_id
    OR v_candidate.proposed_role IS DISTINCT FROM v_role.exam_role
    OR v_candidate.prepared_by IN (v_role.stage1_reviewer_id,v_role.stage2_reviewer_id)
    OR v_stage1.candidate_id IS NULL OR v_stage1.decision<>'approved'
    OR v_stage1.reviewer_id IS DISTINCT FROM v_role.stage1_reviewer_id
    OR v_stage2.candidate_id IS NULL OR v_stage2.decision<>'approved'
    OR v_stage2.reviewer_id IS DISTINCT FROM v_role.stage2_reviewer_id
    OR v_stage1.reviewer_id=v_stage2.reviewer_id THEN
    RAISE EXCEPTION 'TYT Social exam role lacks two independent approved reviews'
      USING ERRCODE='23514';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.tg_assert_tyt_social_exam_role_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  PERFORM public.assert_tyt_social_exam_role_approval(NEW.policy_version,NEW.revision_id);
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_tyt_social_exam_role_approval
  ON public.question_revision_exam_roles;
CREATE CONSTRAINT TRIGGER trg_tyt_social_exam_role_approval
AFTER INSERT ON public.question_revision_exam_roles
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.tg_assert_tyt_social_exam_role_approval();

CREATE OR REPLACE FUNCTION public.tyt_social_candidate_policy_integrity()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_policy public.exam_candidate_policy_versions%ROWTYPE;
  v_active integer;
  v_assigned integer;
  v_invalid integer;
  v_invalid_approval_provenance integer;
  v_role_counts jsonb;
  v_snapshot_boundary_ready boolean;
  v_attempt_trigger_oid oid;
  v_plan_trigger_oid oid;
  v_attempt_parent_guard_oid oid;
  v_plan_parent_guard_oid oid;
  v_capability_manifest_sha256 text;
  v_runtime_integrity jsonb;
  v_review_provenance_trigger_ready boolean;
  v_review_provenance_trigger_oid oid;
BEGIN
  SELECT * INTO v_policy FROM public.resolve_current_tyt_social_candidate_policy();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ready',false,'reason','released-policy-missing');
  END IF;
  SELECT count(*)::integer INTO v_active FROM public.questions AS question
  JOIN public.question_content_revisions AS revision
    ON revision.id=question.published_revision_id AND revision.question_id=question.id
  WHERE question.is_active AND question.game='sosyal'
    AND upper(btrim(COALESCE(question.exam_ref,'')))='TYT'
    AND revision.status='published';
  SELECT count(*)::integer INTO v_invalid_approval_provenance
  FROM public.question_revision_exam_roles AS role
  LEFT JOIN public.question_revision_exam_role_candidates AS candidate
    ON candidate.id=role.candidate_id
  LEFT JOIN public.question_revision_exam_role_reviews AS stage1
    ON stage1.candidate_id=role.candidate_id AND stage1.stage=1
  LEFT JOIN public.question_revision_exam_role_reviews AS stage2
    ON stage2.candidate_id=role.candidate_id AND stage2.stage=2
  WHERE role.policy_version=v_policy.policy_version
    AND (
      candidate.id IS NULL OR candidate.status<>'approved'
      OR candidate.policy_version IS DISTINCT FROM role.policy_version
      OR candidate.revision_id IS DISTINCT FROM role.revision_id
      OR candidate.proposed_role IS DISTINCT FROM role.exam_role
      OR candidate.prepared_by IN (role.stage1_reviewer_id,role.stage2_reviewer_id)
      OR stage1.candidate_id IS NULL OR stage1.decision<>'approved'
      OR stage1.reviewer_id IS DISTINCT FROM role.stage1_reviewer_id
      OR stage2.candidate_id IS NULL OR stage2.decision<>'approved'
      OR stage2.reviewer_id IS DISTINCT FROM role.stage2_reviewer_id
      OR stage1.reviewer_id=stage2.reviewer_id
    );
  SELECT trigger.oid INTO v_review_provenance_trigger_oid
  FROM pg_trigger AS trigger
  WHERE trigger.tgrelid='public.question_revision_exam_roles'::regclass
    AND trigger.tgname='trg_tyt_social_exam_role_approval'
    AND NOT trigger.tgisinternal AND trigger.tgenabled<>'D'
    AND trigger.tgdeferrable AND trigger.tginitdeferred;
  v_review_provenance_trigger_ready:=v_review_provenance_trigger_oid IS NOT NULL;
  SELECT count(*)::integer,
    count(*) FILTER (WHERE NOT public.tyt_social_exam_role_compatible(revision.category,role.exam_role))::integer
  INTO v_assigned,v_invalid
  FROM public.questions AS question
  JOIN public.question_content_revisions AS revision
    ON revision.id=question.published_revision_id AND revision.question_id=question.id
  JOIN public.question_revision_exam_roles AS role
    ON role.policy_version=v_policy.policy_version AND role.revision_id=revision.id
  WHERE question.is_active AND question.game='sosyal'
    AND upper(btrim(COALESCE(question.exam_ref,'')))='TYT'
    AND revision.status='published';
  SELECT jsonb_object_agg(required.role,COALESCE(counts.count,0)) INTO v_role_counts
  FROM (VALUES
    ('common_history'),('common_geography'),('common_philosophy'),
    ('standard_religion'),('alternate_philosophy')
  ) AS required(role)
  LEFT JOIN (
    SELECT role.exam_role,count(*)::integer AS count
    FROM public.questions AS question
    JOIN public.question_content_revisions AS revision
      ON revision.id=question.published_revision_id AND revision.question_id=question.id
    JOIN public.question_revision_exam_roles AS role
      ON role.policy_version=v_policy.policy_version AND role.revision_id=revision.id
    WHERE question.is_active AND question.game='sosyal'
      AND upper(btrim(COALESCE(question.exam_ref,'')))='TYT'
      AND revision.status='published'
    GROUP BY role.exam_role
  ) AS counts ON counts.exam_role=required.role;
  SELECT trigger.oid INTO v_attempt_trigger_oid
  FROM pg_trigger AS trigger
  WHERE trigger.tgrelid='public.verified_attempts'::regclass
    AND trigger.tgname='trg_tyt_social_attempt_snapshot_integrity'
    AND NOT trigger.tgisinternal AND trigger.tgenabled<>'D'
    AND trigger.tgdeferrable AND trigger.tginitdeferred;
  SELECT trigger.oid INTO v_plan_trigger_oid
  FROM pg_trigger AS trigger
  WHERE trigger.tgrelid='public.daily_plan'::regclass
    AND trigger.tgname='trg_tyt_social_plan_snapshot_integrity'
    AND NOT trigger.tgisinternal AND trigger.tgenabled<>'D'
    AND trigger.tgdeferrable AND trigger.tginitdeferred;
  SELECT trigger.oid INTO v_attempt_parent_guard_oid
  FROM pg_trigger AS trigger
  WHERE trigger.tgrelid='public.verified_attempts'::regclass
    AND trigger.tgname='trg_guard_tyt_social_attempt_parent_update'
    AND NOT trigger.tgisinternal AND trigger.tgenabled<>'D';
  SELECT trigger.oid INTO v_plan_parent_guard_oid
  FROM pg_trigger AS trigger
  WHERE trigger.tgrelid='public.daily_plan'::regclass
    AND trigger.tgname='trg_guard_tyt_social_plan_parent_update'
    AND NOT trigger.tgisinternal AND trigger.tgenabled<>'D';
  IF v_attempt_trigger_oid IS NOT NULL AND v_plan_trigger_oid IS NOT NULL
    AND v_attempt_parent_guard_oid IS NOT NULL
    AND v_plan_parent_guard_oid IS NOT NULL
    AND v_review_provenance_trigger_oid IS NOT NULL
    AND to_regprocedure('public.issue_verified_tyt_social_attempt(uuid,text,uuid[],integer,uuid)') IS NOT NULL
    AND to_regprocedure('public.create_tyt_social_daily_plan_v2(uuid,date,jsonb)') IS NOT NULL
    AND to_regprocedure('public.assert_tyt_social_attempt_snapshot_integrity(uuid)') IS NOT NULL
    AND to_regprocedure('public.assert_tyt_social_plan_snapshot_integrity(uuid)') IS NOT NULL
    AND to_regprocedure('public.tyt_social_snapshot_boundary_integrity()') IS NOT NULL
    AND to_regprocedure('public.issue_verified_tyt_social_attempt_with_event(uuid,text,uuid[],integer,uuid,text,uuid,text,uuid)') IS NOT NULL
    AND to_regprocedure('public.issue_verified_tyt_social_section_attempt(uuid,uuid[],integer,uuid)') IS NOT NULL
    AND to_regprocedure('public.issue_verified_tyt_social_plan_attempt(uuid,uuid,text,integer,uuid)') IS NOT NULL
    AND to_regprocedure('public.issue_verified_tyt_social_exam_attempt(uuid,text,jsonb,integer,integer,uuid)') IS NOT NULL
    AND to_regprocedure('public.filter_tyt_social_question_candidates(uuid,uuid[])') IS NOT NULL THEN
    SELECT encode(extensions.digest(jsonb_build_object(
      'attemptIssuer',pg_get_functiondef(to_regprocedure(
        'public.issue_verified_tyt_social_attempt(uuid,text,uuid[],integer,uuid)'
      )),
      'planIssuer',pg_get_functiondef(to_regprocedure(
        'public.create_tyt_social_daily_plan_v2(uuid,date,jsonb)'
      )),
      'attemptCore',pg_get_functiondef(to_regprocedure(
        'public.issue_verified_tyt_social_attempt_with_event(uuid,text,uuid[],integer,uuid,text,uuid,text,uuid)'
      )),
      'officialSectionIssuer',pg_get_functiondef(to_regprocedure(
        'public.issue_verified_tyt_social_section_attempt(uuid,uuid[],integer,uuid)'
      )),
      'planAttemptIssuer',pg_get_functiondef(to_regprocedure(
        'public.issue_verified_tyt_social_plan_attempt(uuid,uuid,text,integer,uuid)'
      )),
      'smartMockIssuer',pg_get_functiondef(to_regprocedure(
        'public.issue_verified_tyt_social_exam_attempt(uuid,text,jsonb,integer,integer,uuid)'
      )),
      'candidateFilter',pg_get_functiondef(to_regprocedure(
        'public.filter_tyt_social_question_candidates(uuid,uuid[])'
      )),
      'attemptAssertion',pg_get_functiondef(to_regprocedure(
        'public.assert_tyt_social_attempt_snapshot_integrity(uuid)'
      )),
      'planAssertion',pg_get_functiondef(to_regprocedure(
        'public.assert_tyt_social_plan_snapshot_integrity(uuid)'
      )),
      'aggregateAssertion',pg_get_functiondef(to_regprocedure(
        'public.tyt_social_snapshot_boundary_integrity()'
      )),
      'attemptParentGuardFunction',pg_get_functiondef(to_regprocedure(
        'public.tg_guard_tyt_social_attempt_parent_update()'
      )),
      'planParentGuardFunction',pg_get_functiondef(to_regprocedure(
        'public.tg_guard_tyt_social_plan_parent_update()'
      )),
      'reviewApprovalAssertion',pg_get_functiondef(to_regprocedure(
        'public.assert_tyt_social_exam_role_approval(text,uuid)'
      )),
      'reviewApprovalTriggerFunction',pg_get_functiondef(to_regprocedure(
        'public.tg_assert_tyt_social_exam_role_approval()'
      )),
      'attemptTrigger',pg_get_triggerdef(v_attempt_trigger_oid,true),
      'planTrigger',pg_get_triggerdef(v_plan_trigger_oid,true),
      'attemptParentGuard',pg_get_triggerdef(v_attempt_parent_guard_oid,true),
      'planParentGuard',pg_get_triggerdef(v_plan_parent_guard_oid,true),
      'reviewApprovalTrigger',pg_get_triggerdef(v_review_provenance_trigger_oid,true)
    )::text,'sha256'),'hex') INTO v_capability_manifest_sha256;
    EXECUTE 'SELECT public.tyt_social_snapshot_boundary_integrity()'
      INTO v_runtime_integrity;
  END IF;
  v_snapshot_boundary_ready := v_capability_manifest_sha256 IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.tyt_social_policy_capabilities AS capability
    WHERE capability.policy_version=v_policy.policy_version
      AND capability.capability='snapshot_boundary_v1'
      AND capability.capability_version=1
      AND capability.manifest_sha256=v_capability_manifest_sha256
      AND capability.evidence @> jsonb_build_object(
        'semanticAggregateCheck','passed',
        'attemptConstraintTrigger','trg_tyt_social_attempt_snapshot_integrity',
        'planConstraintTrigger','trg_tyt_social_plan_snapshot_integrity',
        'attemptParentGuard','trg_guard_tyt_social_attempt_parent_update',
        'planParentGuard','trg_guard_tyt_social_plan_parent_update'
      )
  ) AND COALESCE((v_runtime_integrity->>'ready')::boolean,false);
  RETURN jsonb_build_object(
    'policyVersion',v_policy.policy_version,'rulesSha256',v_policy.rules_sha256,
    'activeQuestionCount',v_active,'assignedQuestionCount',v_assigned,
    'unassignedQuestionCount',v_active-v_assigned,'invalidRoleCount',v_invalid,
    'invalidApprovalProvenanceCount',v_invalid_approval_provenance,
    'reviewProvenanceTriggerReady',v_review_provenance_trigger_ready,
    'roleCounts',COALESCE(v_role_counts,'{}'::jsonb),
    'snapshotBoundaryReady',v_snapshot_boundary_ready,
    'ready',v_active>0 AND v_assigned=v_active AND v_invalid=0
      AND v_invalid_approval_provenance=0 AND v_review_provenance_trigger_ready
      AND COALESCE((v_role_counts->>'common_history')::integer,0)>=5
      AND COALESCE((v_role_counts->>'common_geography')::integer,0)>=5
      AND COALESCE((v_role_counts->>'common_philosophy')::integer,0)>=5
      AND COALESCE((v_role_counts->>'standard_religion')::integer,0)>=5
      AND COALESCE((v_role_counts->>'alternate_philosophy')::integer,0)>=5
      AND v_snapshot_boundary_ready
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.tyt_social_combined_release_integrity()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT source.evidence || jsonb_build_object(
    'candidatePolicyVersion',candidate.evidence->>'policyVersion',
    'candidatePolicyReady',COALESCE((candidate.evidence->>'ready')::boolean,false),
    'candidatePolicy',candidate.evidence,
    'ready',COALESCE((source.evidence->>'sourceReady')::boolean,false)
      AND COALESCE((candidate.evidence->>'ready')::boolean,false)
  )
  FROM (SELECT public.tyt_social_source_policy_integrity(
    'sosyal','TYT','ba-tyt-sosyal-v1'
  ) AS evidence) AS source
  CROSS JOIN (SELECT public.tyt_social_candidate_policy_integrity() AS evidence) AS candidate
$fn$;

-- Allow governed content/mapping work without exposing the scope. Public
-- resolvers still require `released`; diagnostic remains explicitly disabled.
UPDATE public.curriculum_scope_releases
SET release_status='validating',diagnostic_enabled=false,updated_at=clock_timestamp()
WHERE game='sosyal' AND display_exam_ref='TYT'
  AND question_exam_ref='TYT' AND taxonomy_version='ba-tyt-sosyal-v1'
  AND release_status IN ('draft','validating','released');

DO $fn$
DECLARE
  v_integrity jsonb;
BEGIN
  IF (SELECT count(*) FROM public.exam_candidate_policy_variants WHERE policy_version='tyt-social-2026-v1')<>2 THEN
    RAISE EXCEPTION 'TYT Social policy variants incomplete' USING ERRCODE='23514';
  END IF;
  IF (SELECT count(*) FROM public.curriculum_scope_releases
      WHERE game='sosyal' AND display_exam_ref='TYT'
        AND question_exam_ref='TYT' AND taxonomy_version='ba-tyt-sosyal-v1'
        AND release_status='validating' AND NOT diagnostic_enabled) <> 1 THEN
    RAISE EXCEPTION 'TYT Social validation scope is not fail-closed' USING ERRCODE='23514';
  END IF;
  v_integrity:=public.tyt_social_combined_release_integrity();
  IF v_integrity IS NULL OR jsonb_typeof(v_integrity)<>'object'
    OR COALESCE((v_integrity->>'candidatePolicyReady')::boolean,true) THEN
    RAISE EXCEPTION 'migration 205 must not release an incomplete candidate policy' USING ERRCODE='23514';
  END IF;
END
$fn$;

REVOKE ALL ON FUNCTION public.tg_exam_candidate_policy_version_guard(),
  public.tg_tyt_social_append_only(),
  public.resolve_current_tyt_social_candidate_policy(),
  public.resolve_tyt_social_exam_policy_for_user(uuid),
  public.get_my_tyt_social_exam_policy(),
  public.set_my_tyt_social_exam_policy(text,text,uuid),
  public.tyt_social_exam_role_compatible(text,text),
  public.prepare_tyt_social_exam_role(uuid,uuid,text,text,uuid),
  public.review_tyt_social_exam_role(uuid,uuid,smallint,text,text,uuid),
  public.assert_tyt_social_exam_role_approval(text,uuid),
  public.tg_assert_tyt_social_exam_role_approval(),
  public.tyt_social_candidate_policy_integrity(),
  public.tyt_social_combined_release_integrity()
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_my_tyt_social_exam_policy(),
  public.set_my_tyt_social_exam_policy(text,text,uuid),
  public.prepare_tyt_social_exam_role(uuid,uuid,text,text,uuid),
  public.review_tyt_social_exam_role(uuid,uuid,smallint,text,text,uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.resolve_tyt_social_exam_policy_for_user(uuid),
  public.tyt_social_candidate_policy_integrity(),
  public.tyt_social_combined_release_integrity()
TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
