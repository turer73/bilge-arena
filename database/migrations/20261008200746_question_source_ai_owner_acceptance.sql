-- Explicit AI-assisted preparation + accountable owner acceptance.
-- Not independent human review. No role grants, backfill, approvals or publication.
-- Requires 217 and 20261008183619. Normal review/source acceptance is unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE OR REPLACE FUNCTION public.question_ai_preparation_declaration_valid(p jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT COALESCE(jsonb_typeof(p)='object'
    AND p ?& ARRAY['version','agent','evidenceRef','evidenceSha256','revisionEvidenceFingerprint','acknowledgesNonIndependentReview','acceptsResponsibility']
    AND (SELECT count(*) FROM jsonb_object_keys(CASE WHEN jsonb_typeof(p)='object' THEN p ELSE '{}'::jsonb END))=7
    AND p->>'version'='ai-preparation-declaration@1'
    AND jsonb_typeof(p->'agent')='string' AND length(btrim(p->>'agent')) BETWEEN 1 AND 120
    AND jsonb_typeof(p->'evidenceRef')='string' AND length(btrim(p->>'evidenceRef')) BETWEEN 1 AND 1000
    AND jsonb_typeof(p->'evidenceSha256')='string' AND p->>'evidenceSha256' ~ '^[a-f0-9]{64}$'
    AND jsonb_typeof(p->'revisionEvidenceFingerprint')='string' AND p->>'revisionEvidenceFingerprint' ~ '^[a-f0-9]{64}$'
    AND p->'acknowledgesNonIndependentReview'='true'::jsonb
    AND p->'acceptsResponsibility'='true'::jsonb,false)
$$;

ALTER TABLE public.question_revision_source_reviews
  ADD COLUMN IF NOT EXISTS acceptance_mode text NOT NULL DEFAULT 'separate_reviewer',
  ADD COLUMN IF NOT EXISTS ai_preparation jsonb;
ALTER TABLE public.question_revision_source_reviews
  DROP CONSTRAINT IF EXISTS question_revision_source_reviews_policy_version_check,
  DROP CONSTRAINT IF EXISTS question_source_review_acceptance_mode_check;
ALTER TABLE public.question_revision_source_reviews ADD CONSTRAINT question_source_review_acceptance_mode_check CHECK (
  (acceptance_mode='separate_reviewer' AND policy_version='source-review-single@1' AND ai_preparation IS NULL)
  OR (acceptance_mode='ai_assisted_owner' AND policy_version='source-review-ai-owner@1'
      AND public.question_ai_preparation_declaration_valid(ai_preparation))
);
COMMENT ON COLUMN public.question_revision_source_reviews.ai_preparation IS
  'Accountable human declaration, not proof of AI generation or independent review. Hash/reference retained with immutable acceptance; no server file access.';

CREATE OR REPLACE FUNCTION public.question_source_review_actor_valid(p_revision_id uuid,p_review_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM public.question_content_revisions r
    JOIN public.question_revision_source_reviews e ON e.revision_id=r.id
    WHERE r.id=p_revision_id AND e.id=p_review_id AND (
      (e.acceptance_mode='separate_reviewer' AND e.policy_version='source-review-single@1'
        AND e.reviewer_id<>r.prepared_by AND (r.outcomes_prepared_by IS NULL OR e.reviewer_id<>r.outcomes_prepared_by))
      OR (e.acceptance_mode='ai_assisted_owner' AND e.policy_version='source-review-ai-owner@1'
        AND e.reviewer_id=r.prepared_by AND (r.outcomes_prepared_by IS NULL OR e.reviewer_id=r.outcomes_prepared_by)
        AND public.question_ai_preparation_declaration_valid(e.ai_preparation)
        AND e.ai_preparation->>'revisionEvidenceFingerprint'=e.evidence_fingerprint)
    ))
$$;

CREATE OR REPLACE FUNCTION public.accept_question_revision_ai_source_review(
  p_user_id uuid,p_revision_id uuid,p_report jsonb,p_rationale text,p_request_id uuid,p_preparation jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r public.question_content_revisions%ROWTYPE; old public.content_governance_requests%ROWTYPE;
  h text; result jsonb; fingerprint text; decided timestamptz;
BEGIN
  -- Reuse existing least-privilege permissions conjunctively; never grant all reviewers owner authority.
  IF NOT (public.content_governance_has_permission(p_user_id,'content.prepare')
    AND public.content_governance_has_permission(p_user_id,'content.review.stage1')
    AND public.content_governance_has_permission(p_user_id,'content.publish')) THEN
    RAISE EXCEPTION 'AI owner acceptance requires prepare, review and publish permissions' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL OR p_rationale IS NULL OR length(btrim(p_rationale)) NOT BETWEEN 1 AND 1000
    OR NOT public.question_ai_preparation_declaration_valid(p_preparation) THEN
    RAISE EXCEPTION 'explicit AI preparation declaration and responsibility acknowledgement required' USING ERRCODE='22023'; END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'accept_ai_source_review',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object('revisionId',p_revision_id,'report',p_report,'rationale',p_rationale,'preparation',p_preparation));
  SELECT * INTO old FROM public.content_governance_requests WHERE user_id=p_user_id AND operation='accept_ai_source_review' AND request_id=p_request_id;
  IF FOUND THEN
    IF old.payload_hash<>h THEN RAISE EXCEPTION 'AI source review payload mismatch' USING ERRCODE='22023'; END IF;
    RETURN old.result||jsonb_build_object('replayed',true);
  END IF;
  SELECT * INTO r FROM public.question_content_revisions WHERE id=p_revision_id FOR UPDATE;
  IF NOT FOUND OR r.status<>'draft' OR r.change_kind IN ('legacy_import','retire')
    OR r.prepared_by IS DISTINCT FROM p_user_id
    OR (r.outcomes_prepared_by IS NOT NULL AND r.outcomes_prepared_by<>p_user_id) THEN
    RAISE EXCEPTION 'own AI-prepared non-legacy draft required' USING ERRCODE='22023'; END IF;
  IF r.exam_ref='LGS' AND (p_report->>'format') IS DISTINCT FROM 'source-comparison@2' THEN
    RAISE EXCEPTION 'source-comparison@2 required for new LGS source acceptance' USING ERRCODE='22023'; END IF;
  PERFORM public.lock_question_revision_outcome_scope(r.id);
  PERFORM 1 FROM public.question_revision_sources WHERE revision_id=r.id FOR SHARE;
  fingerprint:=public.question_source_review_fingerprint(r.id);
  IF p_preparation->>'revisionEvidenceFingerprint' IS DISTINCT FROM fingerprint THEN
    RAISE EXCEPTION 'AI preparation evidence changed; review again' USING ERRCODE='22023'; END IF;
  IF NOT public.question_revision_outcomes_valid(r.id) OR NOT public.question_source_report_valid(r.id,p_report)
    OR NOT EXISTS(SELECT 1 FROM public.question_revision_sources s WHERE s.revision_id=r.id
      AND lower(s.license_code)<>'legacy-import' AND NULLIF(btrim(s.provenance_ref),'') IS NOT NULL
      AND lower(btrim(s.provenance_ref)) NOT LIKE 'legacy:%') THEN
    RAISE EXCEPTION 'source comparison or provenance incomplete' USING ERRCODE='22023'; END IF;
  -- This is a separate, explicit policy. Do not relax or impersonate normal review.
  decided:=clock_timestamp();
  INSERT INTO public.question_revision_approvals(revision_id,stage,reviewer_id,decision,rationale,decided_at)
    VALUES(r.id,1,p_user_id,'approved',p_rationale,decided);
  INSERT INTO public.question_revision_source_reviews(revision_id,content_sha256,evidence_fingerprint,report,report_sha256,reviewer_id,reviewed_at,policy_version,acceptance_mode,ai_preparation)
    VALUES(r.id,r.content_sha256,fingerprint,p_report,public.content_governance_hash(p_report),p_user_id,decided,'source-review-ai-owner@1','ai_assisted_owner',p_preparation);
  UPDATE public.question_content_revisions SET status='stage1_approved' WHERE id=r.id;
  result:=jsonb_build_object('questionId',r.question_id,'revisionId',r.id,'status','stage1_approved','acceptanceMode','ai_assisted_owner','replayed',false);
  INSERT INTO public.content_governance_requests VALUES(p_user_id,'accept_ai_source_review',p_request_id,h,result,clock_timestamp());
  RETURN result;
END $$;

-- Same source, provenance, exact quality and academic-scope gates as 217.
-- Only the explicit attestation mode controls the actor-separation branch.
CREATE OR REPLACE FUNCTION public.question_revision_single_review_ready(p_revision_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.question_content_revisions r
    JOIN public.question_revision_sources source ON source.revision_id=r.id
    JOIN public.question_revision_approvals a ON a.revision_id=r.id AND a.stage=1 AND a.decision='approved'
    JOIN public.question_revision_source_reviews e ON e.revision_id=r.id AND e.reviewer_id=a.reviewer_id AND e.reviewed_at=a.decided_at
    JOIN public.question_validation_runtime runtime ON runtime.singleton
    JOIN public.question_validation_decisions d ON d.revision_id=r.id AND d.question_id=r.question_id AND d.content_sha256=r.content_sha256
      AND d.policy_version=runtime.required_policy_version AND d.verdict='APPROVED'
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

CREATE OR REPLACE FUNCTION public.get_question_revision_source_review(p_user_id uuid,p_revision_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r public.question_content_revisions%ROWTYPE; mode text; can_ai boolean;
BEGIN
  IF NOT (public.content_governance_has_permission(p_user_id,'content.prepare')
    OR public.content_governance_has_permission(p_user_id,'content.review.stage1')
    OR public.content_governance_has_permission(p_user_id,'content.review.stage2')
    OR public.content_governance_has_permission(p_user_id,'content.publish')) THEN
    RAISE EXCEPTION 'content read permission required' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.question_content_revisions WHERE id=p_revision_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'revision not found' USING ERRCODE='P0002'; END IF;
  SELECT e.acceptance_mode INTO mode FROM public.question_revision_source_reviews e JOIN public.question_revision_approvals a
    ON a.revision_id=e.revision_id AND a.stage=1 AND a.decision='approved' AND a.reviewer_id=e.reviewer_id AND a.decided_at=e.reviewed_at
    WHERE e.revision_id=r.id AND e.content_sha256=r.content_sha256 AND e.evidence_fingerprint=public.question_source_review_fingerprint(r.id)
      AND public.question_source_review_actor_valid(r.id,e.id);
  can_ai:=COALESCE(r.status='draft' AND r.change_kind NOT IN ('legacy_import','retire') AND r.prepared_by=p_user_id
    AND (r.outcomes_prepared_by IS NULL OR r.outcomes_prepared_by=p_user_id)
    AND public.content_governance_has_permission(p_user_id,'content.prepare')
    AND public.content_governance_has_permission(p_user_id,'content.review.stage1')
    AND public.content_governance_has_permission(p_user_id,'content.publish'),false);
  RETURN jsonb_build_object('revisionId',r.id,'readyToPublish',public.question_revision_single_review_ready(r.id),
    'draft',jsonb_build_object('id',r.question_id,'game',r.game,'category',r.category,'topic',r.topic,
      'exam_ref',r.exam_ref,'content',r.content,'published_revision_id',r.id,'content_sha256',r.content_sha256),
    'accepted',mode IS NOT NULL,'acceptanceMode',mode,'canAcceptAiPrepared',can_ai,
    'evidenceFingerprint',CASE WHEN can_ai THEN public.question_source_review_fingerprint(r.id) ELSE NULL END);
END $$;

REVOKE ALL ON FUNCTION public.question_ai_preparation_declaration_valid(jsonb),public.question_source_review_actor_valid(uuid,uuid),
  public.accept_question_revision_ai_source_review(uuid,uuid,jsonb,text,uuid,jsonb),
  public.question_revision_single_review_ready(uuid),public.get_question_revision_source_review(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.accept_question_revision_ai_source_review(uuid,uuid,jsonb,text,uuid,jsonb),
  public.get_question_revision_source_review(uuid,uuid) TO service_role;
-- Existing RLS, append-only trigger and direct-DML revocations stay unchanged.
COMMIT;
