-- Revision-bound LGS Fen rollout. No seeds, decisions, approvals or publications.
-- Keep the global @2 policy unchanged. A binding is a DB-owner release artifact,
-- not a source/year acceptance and not a provider assertion of correctness.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE TABLE IF NOT EXISTS public.question_validation_revision_policies (
  revision_id uuid PRIMARY KEY REFERENCES public.question_content_revisions(id),
  question_id uuid NOT NULL REFERENCES public.questions(id),
  content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[a-f0-9]{64}$'),
  base_policy_version text NOT NULL CHECK(base_policy_version='question-quality@2'),
  policy_version text NOT NULL CHECK(policy_version='question-quality@5'),
  audit_policy_version text NOT NULL CHECK(audit_policy_version='question-quality@4'),
  audit_execution jsonb NOT NULL CHECK(jsonb_typeof(audit_execution)='object'
    AND audit_execution->>'policyVersion'='question-quality@4'
    AND audit_execution->'generationConfig'->>'blindSamples'='3'),
  audit_code_commit text NOT NULL CHECK(audit_code_commit ~ '^[a-f0-9]{40}$'),
  run_id uuid NOT NULL,
  benchmark_ref text NOT NULL CHECK(length(btrim(benchmark_ref)) BETWEEN 1 AND 1000),
  benchmark_sha256 text NOT NULL CHECK(benchmark_sha256 ~ '^[a-f0-9]{64}$'),
  evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref)) BETWEEN 1 AND 1000),
  evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[a-f0-9]{64}$'),
  code_commit text NOT NULL CHECK(code_commit ~ '^[a-f0-9]{40}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.question_validation_revision_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.question_validation_revision_policies FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.question_validation_revision_policies TO service_role;
COMMENT ON TABLE public.question_validation_revision_policies IS
  'DB-owner-only append-only exact-revision policy rollout; local evidence hashes are receipts, not server-verified file contents. No human acceptance or scope activation.';

-- Offline decision version and original paid execution version are distinct.
-- A decision row alone is not a replayable audit: all five exact raw agents
-- must still exist. JSON values are compared as data, never executed.
CREATE OR REPLACE FUNCTION public.question_revision_validation_run_complete(b public.question_validation_revision_policies)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $complete$
  SELECT count(*)=5 AND count(DISTINCT (v.agent,v.sample_index))=5 AND COALESCE(bool_and((
    v.question_id=b.question_id AND v.revision_id=b.revision_id AND v.content_sha256=b.content_sha256
    AND v.policy_version=b.audit_policy_version AND v.status='ok'
    AND v.error_kind IS NULL AND v.skip_reason IS NULL
    AND NULLIF(btrim(v.raw_output),'') IS NOT NULL AND jsonb_typeof(v.parsed_output)='object'
    AND v.input_snapshot->>'questionId'=b.question_id::text
    AND v.input_snapshot->>'revisionId'=b.revision_id::text
    AND v.input_snapshot->>'contentSha256'=b.content_sha256
    AND v.generation_config=b.audit_execution->'generationConfig'
    AND v.generation_config_sha256=b.audit_execution->>'generationConfigSha256'
    AND v.provider_id=b.audit_execution->'providerIds'->>CASE v.agent WHEN 'blind_solver' THEN 'blind' WHEN 'adversarial' THEN 'adversarial' ELSE 'verifier' END
    AND v.model_id=b.audit_execution->'modelIds'->>CASE v.agent WHEN 'blind_solver' THEN 'blind' WHEN 'adversarial' THEN 'adversarial' ELSE 'verifier' END
    AND v.prompt_version=b.audit_execution->'promptVersions'->>CASE v.agent WHEN 'blind_solver' THEN 'blind' WHEN 'adversarial' THEN 'adversarial' ELSE 'verifier' END
    AND ((v.agent='blind_solver' AND v.sample_index IN (0,1,2))
      OR (v.agent IN ('adversarial','solution_verifier') AND v.sample_index=0))
  ) IS TRUE),false)
  FROM public.question_validation_runs v WHERE v.run_id=b.run_id AND v.question_id=b.question_id
$complete$;

CREATE OR REPLACE FUNCTION public.lock_question_revision_validation_run(p_revision_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $lockrun$
DECLARE b public.question_validation_revision_policies%ROWTYPE; current_policy text;
BEGIN
  SELECT required_policy_version INTO current_policy FROM public.question_validation_runtime WHERE singleton FOR SHARE;
  SELECT * INTO b FROM public.question_validation_revision_policies WHERE revision_id=p_revision_id FOR SHARE;
  IF FOUND AND b.base_policy_version=current_policy THEN
    PERFORM 1 FROM public.question_validation_runs WHERE run_id=b.run_id AND question_id=b.question_id FOR SHARE;
    IF NOT public.question_revision_validation_run_complete(b) THEN
      RAISE EXCEPTION 'complete exact raw validation run required' USING ERRCODE='22023';
    END IF;
  END IF;
END $lockrun$;

CREATE OR REPLACE FUNCTION public.tg_question_revision_policy_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $guard$
DECLARE r public.question_content_revisions%ROWTYPE; current_policy text; enforced boolean;
BEGIN
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'revision policy bindings are immutable' USING ERRCODE='22023';
  END IF;
  -- Serialize with the existing publisher and a global policy change.
  SELECT * INTO r FROM public.question_content_revisions WHERE id=NEW.revision_id FOR SHARE;
  SELECT required_policy_version,enforce_publish_gate INTO current_policy,enforced
    FROM public.question_validation_runtime WHERE singleton FOR SHARE;
  IF r.id IS NULL OR r.question_id IS DISTINCT FROM NEW.question_id
    OR r.content_sha256 IS DISTINCT FROM NEW.content_sha256
    OR r.game IS DISTINCT FROM 'fen' OR r.exam_ref IS DISTINCT FROM 'LGS'
    OR r.status NOT IN ('draft','stage1_approved')
    OR current_policy IS DISTINCT FROM NEW.base_policy_version OR enforced IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'exact unpublished LGS Fen revision and enforced base policy required' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.question_validation_decisions d
    WHERE d.revision_id=r.id AND d.question_id=r.question_id AND d.content_sha256=r.content_sha256
      AND d.policy_version=NEW.policy_version AND d.run_id=NEW.run_id AND d.verdict='APPROVED'
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'exact approved validation run required' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.question_validation_runs WHERE run_id=NEW.run_id AND question_id=NEW.question_id FOR SHARE;
  IF NOT public.question_revision_validation_run_complete(NEW) THEN
    RAISE EXCEPTION 'complete exact raw validation run required' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END $guard$;
DROP TRIGGER IF EXISTS trg_question_revision_policy_guard ON public.question_validation_revision_policies;
CREATE TRIGGER trg_question_revision_policy_guard BEFORE INSERT OR UPDATE OR DELETE
  ON public.question_validation_revision_policies FOR EACH ROW EXECUTE FUNCTION public.tg_question_revision_policy_guard();

CREATE OR REPLACE FUNCTION public.question_revision_validation_policy(p_revision_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $policy$
  SELECT CASE WHEN b.revision_id IS NOT NULL AND b.base_policy_version=rt.required_policy_version
    THEN CASE WHEN r.question_id=b.question_id AND r.content_sha256=b.content_sha256
      AND r.game='fen' AND r.exam_ref='LGS'
      AND public.question_revision_validation_run_complete(b)
      AND EXISTS(SELECT 1 FROM public.question_validation_decisions d
        WHERE d.revision_id=r.id AND d.question_id=r.question_id AND d.content_sha256=r.content_sha256
          AND d.policy_version=b.policy_version AND d.run_id=b.run_id AND d.verdict='APPROVED')
      THEN b.policy_version ELSE NULL END
    ELSE rt.required_policy_version END
  FROM public.question_validation_runtime rt
  JOIN public.question_content_revisions r ON r.id=p_revision_id
  LEFT JOIN public.question_validation_revision_policies b ON b.revision_id=r.id
  WHERE rt.singleton
$policy$;

CREATE OR REPLACE FUNCTION public.question_revision_single_review_ready(p_revision_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.question_content_revisions r
    JOIN public.question_revision_sources source ON source.revision_id=r.id
    JOIN public.question_revision_approvals a ON a.revision_id=r.id AND a.stage=1 AND a.decision='approved'
    JOIN public.question_revision_source_reviews e ON e.revision_id=r.id AND e.reviewer_id=a.reviewer_id AND e.reviewed_at=a.decided_at
    JOIN public.question_validation_runtime runtime ON runtime.singleton
    JOIN public.question_validation_decisions d ON d.revision_id=r.id AND d.question_id=r.question_id AND d.content_sha256=r.content_sha256
      AND d.policy_version=public.question_revision_validation_policy(r.id) AND d.verdict='APPROVED'
    WHERE r.id=p_revision_id AND r.status IN ('stage1_approved','stage2_approved','published')
      AND r.prepared_by IS NOT NULL AND r.change_kind NOT IN ('legacy_import','retire')
      AND public.question_source_review_actor_valid(r.id,e.id)
      AND e.content_sha256=r.content_sha256 AND e.evidence_fingerprint=public.question_source_review_fingerprint(r.id)
      AND e.report_sha256=public.content_governance_hash(e.report)
      AND public.question_source_report_valid(r.id,e.report) AND public.question_revision_outcomes_valid(r.id)
      AND lower(source.license_code)<>'legacy-import'
      AND NULLIF(btrim(source.provenance_ref),'') IS NOT NULL AND lower(btrim(source.provenance_ref)) NOT LIKE 'legacy:%'
  )
$$;

CREATE OR REPLACE FUNCTION public.publish_question_content_revision(p_user_id uuid, p_revision_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog
AS $function$
DECLARE
  r public.question_content_revisions%ROWTYPE;
  q public.questions%ROWTYPE;
  h text;
  old public.content_governance_requests%ROWTYPE;
  out jsonb;
  single_review boolean;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.publish') THEN
    RAISE EXCEPTION 'content publish permission required' USING ERRCODE='42501';
  END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'publish_revision',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object('revisionId',p_revision_id));
  SELECT * INTO old FROM public.content_governance_requests
  WHERE user_id=p_user_id AND operation='publish_revision' AND request_id=p_request_id;
  IF FOUND THEN
    IF old.payload_hash<>h THEN
      RAISE EXCEPTION 'publish request payload mismatch' USING ERRCODE='22023';
    END IF;
    RETURN old.result||jsonb_build_object('replayed',true);
  END IF;
  SELECT * INTO r FROM public.question_content_revisions
  WHERE id=p_revision_id FOR UPDATE;
  IF NOT FOUND OR r.status NOT IN ('stage1_approved','stage2_approved') THEN
    RAISE EXCEPTION 'approved revision required' USING ERRCODE='22023';
  END IF;
  single_review := r.status='stage1_approved';
  IF NOT single_review AND NOT EXISTS(
    SELECT 1
    FROM public.question_revision_approvals a
    JOIN public.question_revision_approvals b ON b.revision_id=a.revision_id
    WHERE a.revision_id=r.id AND a.stage=1 AND b.stage=2
      AND a.decision='approved' AND b.decision='approved'
      AND a.reviewer_id<>b.reviewer_id
      AND a.reviewer_id<>r.prepared_by AND b.reviewer_id<>r.prepared_by
      AND (
        r.outcomes_prepared_by IS NULL
        OR (a.reviewer_id<>r.outcomes_prepared_by AND b.reviewer_id<>r.outcomes_prepared_by)
      )
  ) THEN
    RAISE EXCEPTION 'independent approvals required' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('content-publish:'||r.question_id::text,0));
  SELECT * INTO q FROM public.questions WHERE id=r.question_id FOR UPDATE;
  IF q.published_revision_id IS DISTINCT FROM r.base_revision_id THEN
    RAISE EXCEPTION 'stale revision cannot publish' USING ERRCODE='22023';
  END IF;
  PERFORM public.lock_question_revision_outcome_scope(r.id);
  PERFORM 1 FROM public.question_revision_sources WHERE revision_id=r.id FOR SHARE;
  PERFORM public.lock_question_revision_validation_run(r.id);
  IF single_review THEN
    -- Freeze policy and its exact authoritative decision through projection write.
    PERFORM 1 FROM public.question_validation_runtime WHERE singleton FOR SHARE;
    PERFORM 1 FROM public.question_validation_decisions d
      JOIN public.question_validation_runtime runtime ON runtime.singleton
      WHERE d.revision_id=r.id AND d.question_id=r.question_id AND d.content_sha256=r.content_sha256
        AND d.policy_version=public.question_revision_validation_policy(r.id) FOR SHARE OF d;
    IF NOT public.question_revision_single_review_ready(r.id) THEN
      RAISE EXCEPTION 'accepted source review and current APPROVED quality decision required' USING ERRCODE='22023';
    END IF;
  END IF;
  IF NOT public.question_revision_outcomes_valid(r.id)
    OR NOT EXISTS(SELECT 1 FROM public.question_revision_sources WHERE revision_id=r.id) THEN
    RAISE EXCEPTION 'revision evidence incomplete or outside academic scope' USING ERRCODE='22023';
  END IF;
  PERFORM public.content_governance_authorize_question_write(r.question_id,'publish');
  UPDATE public.questions
  SET content=r.content,game=r.game,category=r.category,subcategory=r.subcategory,
    topic=r.topic,difficulty=r.difficulty,level_tag=r.level_tag,exam_ref=r.exam_ref,
    is_boss=r.is_boss,is_active=(r.change_kind<>'retire'),published_revision_id=r.id
  WHERE id=r.question_id;
  PERFORM public.content_governance_clear_question_write(r.question_id);
  DELETE FROM public.question_outcomes WHERE question_id=r.question_id;
  INSERT INTO public.question_outcomes(question_id,outcome_id,weight,is_primary)
  SELECT r.question_id,outcome_id,weight,is_primary
  FROM public.question_revision_outcomes WHERE revision_id=r.id;

  IF EXISTS (
    SELECT 1
    FROM public.questions question
    CROSS JOIN LATERAL public.resolve_question_curriculum_validation_scope(
      question.game,question.exam_ref
    ) AS scope
    WHERE question.id=r.question_id
      AND scope.taxonomy_version IS NOT NULL
      AND (
        scope.release_status NOT IN ('validating','released')
        OR NOT public.question_active_outcome_mapping_valid(r.question_id)
      )
  ) THEN
    RAISE EXCEPTION 'published mapping is outside the active split curriculum scope'
      USING ERRCODE='22023';
  END IF;

  UPDATE public.question_content_revisions SET status='superseded'
  WHERE question_id=r.question_id AND status='published' AND id<>r.id;
  UPDATE public.question_content_revisions
  SET status='published',published_at=clock_timestamp() WHERE id=r.id;
  INSERT INTO public.question_governance_events(
    question_id,revision_id,actor_id,event_type,public_reason
  ) VALUES(
    r.question_id,r.id,p_user_id,'published',CASE WHEN single_review THEN 'Source-comparison single approval published' ELSE 'Two-stage approved revision published' END
  );
  out:=jsonb_build_object(
    'questionId',r.question_id,'revisionId',r.id,'status','published','replayed',false
  );
  INSERT INTO public.content_governance_requests
  VALUES(p_user_id,'publish_revision',p_request_id,h,out,clock_timestamp());
  RETURN out;
END
$function$;

CREATE OR REPLACE FUNCTION public.tg_require_question_validation_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE
  v_revision public.question_content_revisions%ROWTYPE;
  v_policy text;
  v_enforce boolean;
  v_verdict text;
BEGIN
  IF NEW.published_revision_id IS NOT DISTINCT FROM OLD.published_revision_id
     OR NEW.published_revision_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT enforce_publish_gate, required_policy_version
    INTO v_enforce, v_policy
  FROM public.question_validation_runtime WHERE singleton;
  IF NOT COALESCE(v_enforce, false) THEN RETURN NEW; END IF;

  SELECT * INTO v_revision
  FROM public.question_content_revisions
  WHERE id = NEW.published_revision_id AND question_id = NEW.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'published revision does not belong to question' USING ERRCODE='22023';
  END IF;
  IF v_revision.change_kind = 'retire' THEN RETURN NEW; END IF;

  PERFORM public.lock_question_revision_validation_run(v_revision.id);
  v_policy := public.question_revision_validation_policy(v_revision.id);

  SELECT verdict INTO v_verdict
  FROM public.question_validation_decisions
  WHERE revision_id = v_revision.id
    AND content_sha256 = v_revision.content_sha256
    AND policy_version = v_policy;

  -- NEEDS_REVIEW is allowed only after the existing independent two-stage
  -- human approvals; this trigger runs inside that publish path. REJECTED and
  -- INCONCLUSIVE are always fail-closed.
  IF v_verdict IS NULL OR v_verdict NOT IN ('APPROVED','NEEDS_REVIEW') THEN
    RAISE EXCEPTION 'current automated validation decision required before publish'
      USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END $fn$;

REVOKE ALL ON FUNCTION public.tg_question_revision_policy_guard(),
  public.question_revision_validation_run_complete(public.question_validation_revision_policies),
  public.lock_question_revision_validation_run(uuid),
  public.question_revision_validation_policy(uuid),
  public.question_revision_single_review_ready(uuid),
  public.tg_require_question_validation_decision()
  FROM PUBLIC,anon,authenticated,service_role;
-- Existing service-role-only publisher ACL is retained by CREATE OR REPLACE.
COMMIT;
