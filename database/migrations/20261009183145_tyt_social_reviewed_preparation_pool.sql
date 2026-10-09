-- Bounded TYT preparation pool and explicit AI-assisted owner role acceptance.
-- No policy seed, source acceptance, quality decision, publication or activation.
-- Existing 2026 whole-bank release and two-review role path remain closed/unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE OR REPLACE FUNCTION public.tyt_social_preparation_policy_valid(p_policy text,p_year integer)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM public.exam_candidate_policy_versions p
    WHERE p.policy_version=p_policy AND p.policy_version ~ ('^tyt-social-'||p_year::text||'-v[0-9]+$')
      AND p_year BETWEEN 2027 AND 2100 AND p.game='sosyal' AND p.display_exam_ref='TYT'
      AND p.question_exam_ref='TYT' AND p.taxonomy_version='ba-tyt-sosyal-v1'
      AND p.status IN ('validating','released')
      AND p.rules_sha256=encode(extensions.digest(p.rules::text,'sha256'),'hex')
      AND p.rules @> jsonb_build_object('purpose','reviewed_preparation','targetExamYear',p_year,
        'officialExamCertification',false,'wholeCurriculumMeasurement',false,
        'candidateQuestionCount',20,'bookletQuestionCount',25,
        'roleAcceptance','ai_assisted_owner',
        'privacy',jsonb_build_object('storeReason',false,'storeReligion',false,'storeDocument',false)))
$$;

CREATE OR REPLACE FUNCTION public.tyt_social_preparation_pins_valid(p jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE i jsonb; u constant text:='^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(p)<>25 THEN RETURN false; END IF;
  FOR i IN SELECT value FROM jsonb_array_elements(p) LOOP
    IF jsonb_typeof(i) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(i))<>4
      OR NOT i ?& ARRAY['questionId','revisionId','contentSha256','examRole']
      OR jsonb_typeof(i->'questionId') IS DISTINCT FROM 'string' OR COALESCE(i->>'questionId','') !~ u
      OR jsonb_typeof(i->'revisionId') IS DISTINCT FROM 'string' OR COALESCE(i->>'revisionId','') !~ u
      OR jsonb_typeof(i->'contentSha256') IS DISTINCT FROM 'string' OR COALESCE(i->>'contentSha256','') !~ '^[a-f0-9]{64}$'
      OR jsonb_typeof(i->'examRole') IS DISTINCT FROM 'string'
      OR COALESCE(i->>'examRole','') NOT IN ('common_history','common_geography','common_philosophy','standard_religion','alternate_philosophy')
    THEN RETURN false; END IF;
  END LOOP;
  RETURN (SELECT count(DISTINCT value->>'questionId')=25 AND count(DISTINCT value->>'revisionId')=25 FROM jsonb_array_elements(p))
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p) GROUP BY value->>'examRole' HAVING count(*)<>5);
END $$;

CREATE TABLE IF NOT EXISTS public.tyt_social_reviewed_preparation_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_version text NOT NULL UNIQUE REFERENCES public.exam_candidate_policy_versions(policy_version) ON DELETE RESTRICT,
  exam_year smallint NOT NULL CHECK(exam_year BETWEEN 2027 AND 2100),
  policy_rules_sha256 text NOT NULL CHECK(policy_rules_sha256 ~ '^[a-f0-9]{64}$'),
  pins jsonb NOT NULL CHECK(public.tyt_social_preparation_pins_valid(pins)),
  manifest_sha256 text NOT NULL CHECK(manifest_sha256 ~ '^[a-f0-9]{64}$'),
  prepared_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  rationale text NOT NULL CHECK(length(btrim(rationale)) BETWEEN 10 AND 1000),
  request_id uuid NOT NULL,
  prepared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(prepared_by,request_id),
  CHECK(manifest_sha256=encode(extensions.digest(pins::text,'sha256'),'hex'))
);
ALTER TABLE public.tyt_social_reviewed_preparation_pools ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tyt_social_reviewed_preparation_pools FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS tyt_preparation_pool_immutable ON public.tyt_social_reviewed_preparation_pools;
CREATE TRIGGER tyt_preparation_pool_immutable BEFORE UPDATE OR DELETE ON public.tyt_social_reviewed_preparation_pools
  FOR EACH ROW EXECUTE FUNCTION public.tg_tyt_social_append_only();

-- Do not fabricate a second reviewer. The old path still requires two real rows.
ALTER TABLE public.question_revision_exam_roles
  ADD COLUMN IF NOT EXISTS acceptance_mode text NOT NULL DEFAULT 'two_reviewers',
  ADD COLUMN IF NOT EXISTS preparation_pool_id uuid REFERENCES public.tyt_social_reviewed_preparation_pools(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS ai_preparation jsonb,
  ALTER COLUMN stage2_reviewer_id DROP NOT NULL;
ALTER TABLE public.question_revision_exam_roles DROP CONSTRAINT IF EXISTS tyt_social_role_acceptance_mode;
ALTER TABLE public.question_revision_exam_roles ADD CONSTRAINT tyt_social_role_acceptance_mode CHECK (
  (acceptance_mode='two_reviewers' AND stage2_reviewer_id IS NOT NULL
    AND stage1_reviewer_id<>stage2_reviewer_id AND preparation_pool_id IS NULL AND ai_preparation IS NULL)
  OR (acceptance_mode='ai_assisted_owner' AND stage2_reviewer_id IS NULL AND preparation_pool_id IS NOT NULL
    AND public.question_ai_preparation_declaration_valid(ai_preparation))
);
CREATE INDEX IF NOT EXISTS tyt_social_roles_preparation_pool_idx ON public.question_revision_exam_roles(preparation_pool_id)
  WHERE preparation_pool_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assert_tyt_social_exam_role_approval(p_policy_version text,p_revision_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r public.question_revision_exam_roles%ROWTYPE; c public.question_revision_exam_role_candidates%ROWTYPE;
  s1 public.question_revision_exam_role_reviews%ROWTYPE; s2 public.question_revision_exam_role_reviews%ROWTYPE;
  pool public.tyt_social_reviewed_preparation_pools%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.question_revision_exam_roles WHERE policy_version=p_policy_version AND revision_id=p_revision_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TYT Social approved role not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO c FROM public.question_revision_exam_role_candidates WHERE id=r.candidate_id;
  SELECT * INTO s1 FROM public.question_revision_exam_role_reviews WHERE candidate_id=r.candidate_id AND stage=1;
  SELECT * INTO s2 FROM public.question_revision_exam_role_reviews WHERE candidate_id=r.candidate_id AND stage=2;
  IF c.id IS NULL OR c.status<>'approved' OR c.policy_version IS DISTINCT FROM r.policy_version
    OR c.revision_id IS DISTINCT FROM r.revision_id OR c.proposed_role IS DISTINCT FROM r.exam_role
    OR s1.candidate_id IS NULL OR s1.decision<>'approved' OR s1.reviewer_id IS DISTINCT FROM r.stage1_reviewer_id THEN
    RAISE EXCEPTION 'TYT Social role approval provenance mismatch' USING ERRCODE='23514'; END IF;
  IF r.acceptance_mode='ai_assisted_owner' THEN
    SELECT * INTO pool FROM public.tyt_social_reviewed_preparation_pools WHERE id=r.preparation_pool_id;
    IF pool.id IS NULL OR pool.policy_version IS DISTINCT FROM r.policy_version
      OR c.prepared_by IS DISTINCT FROM r.stage1_reviewer_id OR s2.candidate_id IS NOT NULL OR r.stage2_reviewer_id IS NOT NULL
      OR NOT public.question_ai_preparation_declaration_valid(r.ai_preparation)
      OR r.ai_preparation->>'revisionEvidenceFingerprint' IS DISTINCT FROM public.question_source_review_fingerprint(r.revision_id)
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(pool.pins) i
        JOIN public.question_content_revisions rev ON rev.id=r.revision_id
        WHERE i->>'revisionId'=rev.id::text AND i->>'questionId'=rev.question_id::text
          AND i->>'contentSha256'=rev.content_sha256 AND i->>'examRole'=r.exam_role)
    THEN RAISE EXCEPTION 'TYT Social explicit owner role provenance mismatch' USING ERRCODE='23514'; END IF;
  ELSIF r.acceptance_mode<>'two_reviewers' OR c.prepared_by IN (r.stage1_reviewer_id,r.stage2_reviewer_id)
    OR s2.candidate_id IS NULL OR s2.decision<>'approved' OR s2.reviewer_id IS DISTINCT FROM r.stage2_reviewer_id
    OR s1.reviewer_id=s2.reviewer_id THEN
    RAISE EXCEPTION 'TYT Social exam role lacks two independent approved reviews' USING ERRCODE='23514';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.prepare_tyt_social_reviewed_pool(
  p_actor_user_id uuid,p_policy_version text,p_exam_year integer,p_pins jsonb,p_rationale text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE manifest jsonb; policy public.exam_candidate_policy_versions%ROWTYPE; old public.content_governance_requests%ROWTYPE;
  h text; result jsonb; pool_id uuid;
BEGIN
  IF NOT COALESCE(public.question_outcome_mapping_actor_has_aal2(p_actor_user_id),false)
    OR NOT COALESCE(public.content_governance_has_permission(p_actor_user_id,'content.prepare'),false)
  THEN RAISE EXCEPTION 'AAL2 content prepare permission required' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL OR NOT public.tyt_social_preparation_pins_valid(p_pins)
    OR length(btrim(COALESCE(p_rationale,''))) NOT BETWEEN 10 AND 1000
  THEN RAISE EXCEPTION 'exact reviewed 25-question preparation manifest required' USING ERRCODE='22023'; END IF;
  SELECT jsonb_agg(value ORDER BY value->>'questionId') INTO manifest FROM jsonb_array_elements(p_pins);
  PERFORM public.content_governance_lock_request(p_actor_user_id,'prepare_tyt_social_reviewed_pool',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object('policyVersion',p_policy_version,'examYear',p_exam_year,'pins',manifest,'rationale',btrim(p_rationale)));
  SELECT * INTO old FROM public.content_governance_requests WHERE user_id=p_actor_user_id AND operation='prepare_tyt_social_reviewed_pool' AND request_id=p_request_id;
  IF FOUND THEN
    IF old.payload_hash<>h THEN RAISE EXCEPTION 'preparation pool replay differs' USING ERRCODE='22023'; END IF;
    RETURN old.result||jsonb_build_object('replayed',true);
  END IF;
  SELECT * INTO policy FROM public.exam_candidate_policy_versions WHERE policy_version=p_policy_version FOR SHARE;
  IF NOT FOUND OR NOT public.tyt_social_preparation_policy_valid(p_policy_version,p_exam_year)
    OR policy.status<>'validating' THEN RAISE EXCEPTION 'explicit validating preparation policy required' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(manifest) i JOIN public.question_content_revisions r
    ON r.id=(i->>'revisionId')::uuid AND r.question_id=(i->>'questionId')::uuid
    WHERE r.content_sha256=i->>'contentSha256'
      AND r.content_sha256=encode(extensions.digest(r.content::text,'sha256'),'hex')
      AND r.game='sosyal' AND r.exam_ref='TYT' AND r.status NOT IN ('rejected','superseded')
      AND public.tyt_social_exam_role_compatible(r.category,i->>'examRole'))<>25
  THEN RAISE EXCEPTION 'preparation pins do not match current revision identities' USING ERRCODE='22023'; END IF;
  INSERT INTO public.tyt_social_reviewed_preparation_pools(policy_version,exam_year,policy_rules_sha256,pins,manifest_sha256,prepared_by,rationale,request_id)
    VALUES(p_policy_version,p_exam_year,policy.rules_sha256,manifest,public.content_governance_hash(manifest),p_actor_user_id,btrim(p_rationale),p_request_id)
    RETURNING id INTO pool_id;
  result:=jsonb_build_object('poolId',pool_id,'manifestSha256',public.content_governance_hash(manifest),'candidateEvidenceOnly',true,'publicationAuthorized',false,'replayed',false);
  INSERT INTO public.content_governance_requests VALUES(p_actor_user_id,'prepare_tyt_social_reviewed_pool',p_request_id,h,result,clock_timestamp());
  RETURN result;
END $$;

-- Private common gate: used both by the owner writer and by later activation/
-- issuance. Never substitute a previous preflight response for this live read.
CREATE OR REPLACE FUNCTION public.tyt_social_preparation_pool_integrity(p_pool_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE pool public.tyt_social_reviewed_preparation_pools%ROWTYPE; i jsonb; r public.question_content_revisions%ROWTYPE;
  q public.questions%ROWTYPE; issues text[]; out_items jsonb:='[]'; evidence jsonb:='[]'; role_ok boolean;
  policy_ok boolean; content_ready integer:=0; ready_count integer:=0; fingerprint text;
BEGIN
  SELECT * INTO pool FROM public.tyt_social_reviewed_preparation_pools WHERE id=p_pool_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'preparation pool not found' USING ERRCODE='P0002'; END IF;
  SELECT public.tyt_social_preparation_policy_valid(pool.policy_version,pool.exam_year)
    AND p.rules_sha256=pool.policy_rules_sha256
    AND current_date>=p.valid_from AND (p.valid_until IS NULL OR current_date<p.valid_until)
  INTO policy_ok FROM public.exam_candidate_policy_versions p WHERE p.policy_version=pool.policy_version;
  FOR i IN SELECT value FROM jsonb_array_elements(pool.pins) LOOP
    issues:=ARRAY[]::text[]; fingerprint:=NULL;
    IF policy_ok IS NOT TRUE THEN issues:=array_append(issues,'POLICY_UNAVAILABLE'); END IF;
    SELECT * INTO r FROM public.question_content_revisions WHERE id=(i->>'revisionId')::uuid;
    SELECT * INTO q FROM public.questions WHERE id=(i->>'questionId')::uuid;
    IF r.id IS NULL OR q.id IS NULL OR r.question_id IS DISTINCT FROM q.id THEN
      issues:=array_append(issues,'PIN_NOT_FOUND');
    ELSE
      IF r.content_sha256 IS DISTINCT FROM i->>'contentSha256'
        OR r.content_sha256 IS DISTINCT FROM encode(extensions.digest(r.content::text,'sha256'),'hex') THEN issues:=array_append(issues,'CONTENT_HASH_MISMATCH'); END IF;
      IF q.published_revision_id IS DISTINCT FROM r.id OR r.status<>'published' OR r.published_at IS NULL
        OR q.is_active IS NOT TRUE THEN issues:=array_append(issues,'NOT_ACTIVE_PUBLICATION'); END IF;
      IF q.content IS DISTINCT FROM r.content OR q.category::text IS DISTINCT FROM r.category
        OR q.difficulty IS DISTINCT FROM r.difficulty OR q.game::text IS DISTINCT FROM 'sosyal'
        OR r.game IS DISTINCT FROM 'sosyal' OR q.exam_ref::text IS DISTINCT FROM 'TYT' OR r.exam_ref IS DISTINCT FROM 'TYT'
        OR NOT COALESCE(public.tyt_social_exam_role_compatible(r.category,i->>'examRole'),false) THEN issues:=array_append(issues,'REVISION_SCOPE_DRIFT'); END IF;
      IF public.question_content_basic_guard_for_exam(r.game,r.content,r.exam_ref) IS NOT TRUE THEN issues:=array_append(issues,'INVALID_CONTENT'); END IF;
      IF public.question_revision_outcomes_valid(r.id) IS NOT TRUE THEN issues:=array_append(issues,'OUTCOME_SCOPE_INVALID'); END IF;
      IF public.tyt_social_revision_source_policy_ready(r.id) IS NOT TRUE THEN issues:=array_append(issues,'SOURCE_ACCEPTANCE_MISSING'); END IF;
      fingerprint:=public.question_source_review_fingerprint(r.id);
      IF NOT EXISTS(SELECT 1 FROM public.question_revision_source_reviews s WHERE s.revision_id=r.id
        AND s.content_sha256=r.content_sha256 AND s.evidence_fingerprint=fingerprint
        AND s.report_sha256=public.content_governance_hash(s.report)
        AND s.report->>'format'='source-comparison@2'
        AND s.report#>'{curriculumBinding,examYear}'=to_jsonb(pool.exam_year)
        AND public.question_source_report_valid(r.id,s.report)
        AND public.question_source_curriculum_binding_valid(r.id,s.report))
      THEN issues:=array_append(issues,'EXAM_YEAR_ACCEPTANCE_MISSING'); END IF;
      IF NOT EXISTS(SELECT 1 FROM public.question_validation_runtime rt JOIN public.question_validation_decisions d
        ON d.policy_version=rt.required_policy_version AND d.question_id=q.id AND d.revision_id=r.id
          AND d.content_sha256=r.content_sha256 AND d.verdict='APPROVED'
        WHERE rt.singleton AND rt.enforce_publish_gate) THEN issues:=array_append(issues,'QUALITY_DECISION_MISSING'); END IF;
    END IF;
    IF cardinality(issues)=0 THEN content_ready:=content_ready+1; END IF;
    role_ok:=false;
    IF EXISTS(SELECT 1 FROM public.question_revision_exam_roles a WHERE a.policy_version=pool.policy_version
      AND a.revision_id=r.id AND a.exam_role=i->>'examRole' AND a.preparation_pool_id=pool.id AND a.acceptance_mode='ai_assisted_owner') THEN
      BEGIN PERFORM public.assert_tyt_social_exam_role_approval(pool.policy_version,r.id); role_ok:=true;
      EXCEPTION WHEN SQLSTATE 'P0002' OR SQLSTATE '23514' THEN role_ok:=false; END;
    END IF;
    IF NOT role_ok THEN issues:=array_append(issues,'ROLE_ACCEPTANCE_MISSING'); END IF;
    IF cardinality(issues)=0 THEN ready_count:=ready_count+1; END IF;
    evidence:=evidence||jsonb_build_array(jsonb_build_object('pin',i,'revisionEvidenceFingerprint',fingerprint));
    out_items:=out_items||jsonb_build_array(i||jsonb_build_object('issues',to_jsonb(issues),'eligible',cardinality(issues)=0));
  END LOOP;
  RETURN jsonb_build_object('poolId',pool.id,'policyVersion',pool.policy_version,'examYear',pool.exam_year,
    'manifestSha256',pool.manifest_sha256,'evidenceFingerprint',public.content_governance_hash(jsonb_build_object('pins',evidence,'rulesSha256',pool.policy_rules_sha256)),
    'contentReadyCount',content_ready,'eligibleCount',ready_count,'poolEvidenceReady',ready_count=25,
    'items',out_items,'candidateEvidenceOnly',true,'publicationAuthorized',false,'activationSupported',false,
    'globalGateUnchanged',true,'databaseWrites',0);
END $$;

CREATE OR REPLACE FUNCTION public.get_tyt_social_preparation_pool(p_actor_user_id uuid,p_pool_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT COALESCE(public.question_outcome_mapping_actor_has_aal2(p_actor_user_id),false)
    OR NOT (COALESCE(public.content_governance_has_permission(p_actor_user_id,'content.prepare'),false)
      OR COALESCE(public.content_governance_has_permission(p_actor_user_id,'content.review.stage1'),false)
      OR COALESCE(public.content_governance_has_permission(p_actor_user_id,'content.publish'),false))
  THEN RAISE EXCEPTION 'AAL2 content permission required' USING ERRCODE='42501'; END IF;
  RETURN public.tyt_social_preparation_pool_integrity(p_pool_id);
END $$;

CREATE OR REPLACE FUNCTION public.accept_tyt_social_preparation_pool_roles(
  p_actor_user_id uuid,p_pool_id uuid,p_manifest_sha256 text,p_evidence_fingerprint text,
  p_preparation jsonb,p_rationale text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE pool public.tyt_social_reviewed_preparation_pools%ROWTYPE; old public.content_governance_requests%ROWTYPE;
  i jsonb; integrity jsonb; declaration jsonb; candidate_id uuid; h text; result jsonb;
BEGIN
  IF NOT COALESCE(public.question_outcome_mapping_actor_has_aal2(p_actor_user_id),false)
    OR NOT (COALESCE(public.content_governance_has_permission(p_actor_user_id,'content.prepare'),false)
      AND COALESCE(public.content_governance_has_permission(p_actor_user_id,'content.review.stage1'),false)
      AND COALESCE(public.content_governance_has_permission(p_actor_user_id,'content.publish'),false))
  THEN RAISE EXCEPTION 'AAL2 prepare, review and publish permissions required' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL OR length(btrim(COALESCE(p_rationale,''))) NOT BETWEEN 10 AND 1000
    OR NOT public.question_ai_preparation_declaration_valid(p_preparation)
    OR p_preparation->>'revisionEvidenceFingerprint' IS DISTINCT FROM p_evidence_fingerprint
  THEN RAISE EXCEPTION 'explicit non-independent owner responsibility required' USING ERRCODE='22023'; END IF;
  PERFORM public.content_governance_lock_request(p_actor_user_id,'accept_tyt_social_pool_roles',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object('poolId',p_pool_id,'manifestSha256',p_manifest_sha256,'evidenceFingerprint',p_evidence_fingerprint,'preparation',p_preparation,'rationale',btrim(p_rationale)));
  SELECT * INTO old FROM public.content_governance_requests WHERE user_id=p_actor_user_id AND operation='accept_tyt_social_pool_roles' AND request_id=p_request_id;
  IF FOUND THEN
    IF old.payload_hash<>h THEN RAISE EXCEPTION 'owner role acceptance replay differs' USING ERRCODE='22023'; END IF;
    RETURN old.result||jsonb_build_object('replayed',true);
  END IF;
  SELECT * INTO pool FROM public.tyt_social_reviewed_preparation_pools WHERE id=p_pool_id FOR UPDATE;
  IF NOT FOUND OR pool.prepared_by IS DISTINCT FROM p_actor_user_id OR pool.manifest_sha256 IS DISTINCT FROM p_manifest_sha256 THEN
    RAISE EXCEPTION 'own exact preparation pool required' USING ERRCODE='22023'; END IF;
  -- Block changes to accepted authorities for the duration of this bounded batch.
  LOCK TABLE public.question_validation_runtime,public.question_validation_decisions,
    public.question_revision_sources,public.question_revision_source_reviews,
    public.curriculum_canonical_exam_scopes IN SHARE MODE;
  PERFORM 1 FROM public.exam_candidate_policy_versions WHERE policy_version=pool.policy_version FOR SHARE;
  FOR i IN SELECT value FROM jsonb_array_elements(pool.pins) ORDER BY value->>'questionId' LOOP
    PERFORM 1 FROM public.questions WHERE id=(i->>'questionId')::uuid FOR SHARE;
    PERFORM 1 FROM public.question_content_revisions WHERE id=(i->>'revisionId')::uuid FOR SHARE;
    PERFORM public.lock_question_revision_outcome_scope((i->>'revisionId')::uuid);
  END LOOP;
  integrity:=public.tyt_social_preparation_pool_integrity(pool.id);
  IF integrity->>'evidenceFingerprint' IS DISTINCT FROM p_evidence_fingerprint
    OR (integrity->>'contentReadyCount')::integer<>25 THEN
    RAISE EXCEPTION 'all exact pins need current source, year and quality acceptance before roles' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.question_revision_exam_role_candidates WHERE policy_version=pool.policy_version AND status IN ('pending','stage1_approved','approved')) THEN
    RAISE EXCEPTION 'preparation policy already has role candidates; use the original request receipt' USING ERRCODE='23505'; END IF;
  FOR i IN SELECT value FROM jsonb_array_elements(pool.pins) LOOP
    declaration:=jsonb_set(p_preparation,'{revisionEvidenceFingerprint}',to_jsonb(public.question_source_review_fingerprint((i->>'revisionId')::uuid)));
    INSERT INTO public.question_revision_exam_role_candidates(policy_version,revision_id,proposed_role,rationale,status,prepared_by,decided_at)
      VALUES(pool.policy_version,(i->>'revisionId')::uuid,i->>'examRole',btrim(p_rationale),'approved',p_actor_user_id,clock_timestamp()) RETURNING id INTO candidate_id;
    INSERT INTO public.question_revision_exam_role_reviews(candidate_id,stage,reviewer_id,decision,rationale,request_id)
      VALUES(candidate_id,1,p_actor_user_id,'approved',btrim(p_rationale),gen_random_uuid());
    INSERT INTO public.question_revision_exam_roles(policy_version,revision_id,exam_role,candidate_id,stage1_reviewer_id,stage2_reviewer_id,acceptance_mode,preparation_pool_id,ai_preparation)
      VALUES(pool.policy_version,(i->>'revisionId')::uuid,i->>'examRole',candidate_id,p_actor_user_id,NULL,'ai_assisted_owner',pool.id,declaration);
    PERFORM public.assert_tyt_social_exam_role_approval(pool.policy_version,(i->>'revisionId')::uuid);
  END LOOP;
  result:=jsonb_build_object('poolId',pool.id,'manifestSha256',pool.manifest_sha256,'acceptedRoleCount',25,
    'acceptanceMode','ai_assisted_owner','independentHumanReview',false,'publicationAuthorized',false,'replayed',false);
  INSERT INTO public.content_governance_requests VALUES(p_actor_user_id,'accept_tyt_social_pool_roles',p_request_id,h,result,clock_timestamp());
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.tyt_social_preparation_policy_valid(text,integer),public.tyt_social_preparation_pins_valid(jsonb),
  public.assert_tyt_social_exam_role_approval(text,uuid),public.tyt_social_preparation_pool_integrity(uuid),
  public.prepare_tyt_social_reviewed_pool(uuid,text,integer,jsonb,text,uuid),public.get_tyt_social_preparation_pool(uuid,uuid),
  public.accept_tyt_social_preparation_pool_roles(uuid,uuid,text,text,jsonb,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.prepare_tyt_social_reviewed_pool(uuid,text,integer,jsonb,text,uuid),
  public.get_tyt_social_preparation_pool(uuid,uuid),public.accept_tyt_social_preparation_pool_roles(uuid,uuid,text,text,jsonb,text,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
