-- Explicit owner acceptance of an unchanged retirement, not content truth or independent review.
-- No grants to people, backfill, decisions, approvals or publications are performed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE TABLE IF NOT EXISTS public.question_revision_retirement_reviews (
  revision_id uuid PRIMARY KEY REFERENCES public.question_content_revisions(id),
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id),
  reviewed_at timestamptz NOT NULL,
  content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[a-f0-9]{64}$'),
  evidence_fingerprint text NOT NULL CHECK(evidence_fingerprint ~ '^[a-f0-9]{64}$'),
  evidence jsonb NOT NULL,
  evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[a-f0-9]{64}$'),
  ai_preparation jsonb NOT NULL CHECK(public.question_ai_preparation_declaration_valid(ai_preparation)),
  acceptance_mode text NOT NULL DEFAULT 'ai_assisted_owner_retirement'
    CHECK(acceptance_mode='ai_assisted_owner_retirement')
);
ALTER TABLE public.question_revision_retirement_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.question_revision_retirement_reviews FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS retirement_review_immutable ON public.question_revision_retirement_reviews;
CREATE TRIGGER retirement_review_immutable BEFORE UPDATE OR DELETE ON public.question_revision_retirement_reviews
  FOR EACH ROW EXECUTE FUNCTION public.question_source_review_immutable();
COMMENT ON TABLE public.question_revision_retirement_reviews IS
  'Private append-only accountable owner retirement acceptance. Not independent review, content approval, benchmark gold or publication.';

CREATE OR REPLACE FUNCTION public.question_retirement_fingerprint(p_revision_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT public.content_governance_hash(jsonb_build_object(
    'revisionEvidence',public.question_source_review_fingerprint(r.id),
    'baseRevisionId',r.base_revision_id,'publishedRevisionId',q.published_revision_id,
    'currentContent',q.content,'active',q.is_active,
    'metadata',jsonb_build_array(q.game,q.category,q.subcategory,q.topic,q.difficulty,q.level_tag,q.exam_ref,q.is_boss)))
  FROM public.question_content_revisions r JOIN public.questions q ON q.id=r.question_id WHERE r.id=p_revision_id
$$;

CREATE OR REPLACE FUNCTION public.question_retirement_evidence_valid(p_revision_id uuid,p_evidence jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r public.question_content_revisions%ROWTYPE; q public.questions%ROWTYPE;
  survivor public.questions%ROWTYPE; s jsonb;
BEGIN
  SELECT * INTO r FROM public.question_content_revisions WHERE id=p_revision_id;
  SELECT * INTO q FROM public.questions WHERE id=r.question_id;
  IF NOT COALESCE(jsonb_typeof(p_evidence)='object'
    AND (SELECT count(*) FROM jsonb_object_keys(p_evidence))=9
    AND p_evidence ?& ARRAY['version','questionId','revisionId','contentSha256','baseRevisionId','reason','evidenceRef','evidenceSha256','survivor']
    AND p_evidence->>'version'='retirement-evidence@1'
    AND p_evidence->>'questionId'=r.question_id::text AND p_evidence->>'revisionId'=r.id::text
    AND p_evidence->>'contentSha256'=r.content_sha256 AND p_evidence->>'baseRevisionId'=r.base_revision_id::text
    AND p_evidence->>'reason' IN ('duplicate','invalid_content','out_of_curriculum')
    AND jsonb_typeof(p_evidence->'evidenceRef')='string' AND length(btrim(p_evidence->>'evidenceRef')) BETWEEN 1 AND 1000
    AND jsonb_typeof(p_evidence->'evidenceSha256')='string' AND p_evidence->>'evidenceSha256' ~ '^[a-f0-9]{64}$'
    AND r.change_kind='retire' AND r.prepared_by IS NOT NULL AND r.base_revision_id IS NOT NULL
    AND q.published_revision_id=r.base_revision_id
    AND r.content_sha256=encode(extensions.digest(q.content::text,'sha256'),'hex')
    AND ROW(r.content,r.game,r.category,r.subcategory,r.topic,r.difficulty,r.level_tag,r.exam_ref,r.is_boss)
      IS NOT DISTINCT FROM ROW(q.content,q.game::text,q.category::text,q.subcategory::text,q.topic::text,q.difficulty,q.level_tag::text,q.exam_ref::text,q.is_boss)
    AND EXISTS(SELECT 1 FROM public.question_revision_sources source WHERE source.revision_id=r.id
      AND lower(source.license_code)<>'legacy-import' AND NULLIF(btrim(source.provenance_ref),'') IS NOT NULL
      AND lower(btrim(source.provenance_ref)) NOT LIKE 'legacy:%')
    AND (public.question_revision_outcomes_valid(r.id) OR (q.is_active IS FALSE
      AND NOT EXISTS(SELECT 1 FROM public.question_revision_outcomes WHERE revision_id=r.id))),false) THEN
    RETURN false;
  END IF;
  -- A survivor protected by this explicit path cannot simultaneously be retired through it.
  IF EXISTS(SELECT 1 FROM public.question_revision_retirement_reviews e
    JOIN public.question_content_revisions other ON other.id=e.revision_id
    WHERE e.evidence->'survivor'->>'questionId'=r.question_id::text
      AND other.status IN ('stage1_approved','stage2_approved','published')) THEN RETURN false; END IF;
  s:=p_evidence->'survivor';
  IF p_evidence->>'reason'='duplicate' THEN
    IF NOT COALESCE(jsonb_typeof(s)='object' AND (SELECT count(*) FROM jsonb_object_keys(s))=3
      AND s ?& ARRAY['questionId','publishedRevisionId','contentSha256']
      AND s->>'questionId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      AND s->>'publishedRevisionId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      AND s->>'contentSha256' ~ '^[a-f0-9]{64}$',false) THEN RETURN false; END IF;
    SELECT * INTO survivor FROM public.questions WHERE id=(s->>'questionId')::uuid;
    RETURN COALESCE(survivor.id<>r.question_id AND survivor.published_revision_id::text=s->>'publishedRevisionId'
      AND encode(extensions.digest(survivor.content::text,'sha256'),'hex')=s->>'contentSha256'
      AND (q.is_active IS FALSE OR survivor.is_active IS TRUE)
      AND NOT EXISTS(SELECT 1 FROM public.question_revision_retirement_reviews e
        JOIN public.question_content_revisions other ON other.id=e.revision_id
        WHERE other.question_id=survivor.id AND other.status IN ('stage1_approved','stage2_approved','published')),false);
  END IF;
  RETURN s='null'::jsonb;
END $$;

CREATE OR REPLACE FUNCTION public.question_revision_retirement_review_ready(p_revision_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM public.question_content_revisions r
    JOIN public.question_revision_retirement_reviews e ON e.revision_id=r.id
    JOIN public.question_revision_approvals a ON a.revision_id=r.id AND a.stage=1 AND a.decision='approved'
      AND a.reviewer_id=e.reviewer_id AND a.decided_at=e.reviewed_at
    WHERE r.id=p_revision_id AND r.status='stage1_approved' AND r.change_kind='retire'
      AND r.prepared_by=e.reviewer_id AND (r.outcomes_prepared_by IS NULL OR r.outcomes_prepared_by=e.reviewer_id)
      AND e.content_sha256=r.content_sha256 AND e.evidence_fingerprint=public.question_retirement_fingerprint(r.id)
      AND e.evidence_sha256=public.content_governance_hash(e.evidence)
      AND public.question_ai_preparation_declaration_valid(e.ai_preparation)
      AND e.ai_preparation->>'revisionEvidenceFingerprint'=e.evidence_fingerprint
      AND e.ai_preparation->>'evidenceRef'=e.evidence->>'evidenceRef'
      AND e.ai_preparation->>'evidenceSha256'=e.evidence->>'evidenceSha256'
      AND public.question_retirement_evidence_valid(r.id,e.evidence))
$$;

CREATE OR REPLACE FUNCTION public.accept_question_revision_retirement_review(
  p_user_id uuid,p_revision_id uuid,p_evidence jsonb,p_rationale text,p_request_id uuid,p_preparation jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r public.question_content_revisions%ROWTYPE; old public.content_governance_requests%ROWTYPE;
  h text; result jsonb; fingerprint text; decided timestamptz; survivor_id uuid;
BEGIN
  IF NOT (public.content_governance_has_permission(p_user_id,'content.prepare')
    AND public.content_governance_has_permission(p_user_id,'content.review.stage1')
    AND public.content_governance_has_permission(p_user_id,'content.publish')) THEN
    RAISE EXCEPTION 'owner retirement acceptance requires prepare, review and publish permissions' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL OR length(btrim(COALESCE(p_rationale,''))) NOT BETWEEN 1 AND 1000
    OR NOT public.question_ai_preparation_declaration_valid(p_preparation) THEN
    RAISE EXCEPTION 'explicit responsibility and rationale required' USING ERRCODE='22023'; END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'accept_retirement_review',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object('revisionId',p_revision_id,'evidence',p_evidence,'rationale',p_rationale,'preparation',p_preparation));
  SELECT * INTO old FROM public.content_governance_requests WHERE user_id=p_user_id AND operation='accept_retirement_review' AND request_id=p_request_id;
  IF FOUND THEN
    IF old.payload_hash<>h THEN RAISE EXCEPTION 'retirement review payload mismatch' USING ERRCODE='22023'; END IF;
    RETURN old.result||jsonb_build_object('replayed',true);
  END IF;
  SELECT * INTO r FROM public.question_content_revisions WHERE id=p_revision_id FOR UPDATE;
  IF NOT FOUND OR r.status<>'draft' OR r.change_kind<>'retire' OR r.prepared_by IS DISTINCT FROM p_user_id
    OR (r.outcomes_prepared_by IS NOT NULL AND r.outcomes_prepared_by<>p_user_id) THEN
    RAISE EXCEPTION 'own unchanged retirement draft required' USING ERRCODE='22023'; END IF;
  IF p_evidence->'survivor'->>'questionId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN
    survivor_id:=(p_evidence->'survivor'->>'questionId')::uuid;
  END IF;
  -- Shared deterministic lock order with publication; prevents a survivor changing during acceptance.
  PERFORM 1 FROM public.questions WHERE id IN (r.question_id,survivor_id) ORDER BY id FOR UPDATE;
  PERFORM public.lock_question_revision_outcome_scope(r.id);
  PERFORM 1 FROM public.question_revision_sources WHERE revision_id=r.id FOR SHARE;
  fingerprint:=public.question_retirement_fingerprint(r.id);
  IF p_preparation->>'revisionEvidenceFingerprint' IS DISTINCT FROM fingerprint
    OR p_preparation->>'evidenceRef' IS DISTINCT FROM p_evidence->>'evidenceRef'
    OR p_preparation->>'evidenceSha256' IS DISTINCT FROM p_evidence->>'evidenceSha256'
    OR NOT public.question_retirement_evidence_valid(r.id,p_evidence) THEN
    RAISE EXCEPTION 'retirement evidence changed or incomplete' USING ERRCODE='22023'; END IF;
  decided:=clock_timestamp();
  INSERT INTO public.question_revision_approvals(revision_id,stage,reviewer_id,decision,rationale,decided_at)
    VALUES(r.id,1,p_user_id,'approved',p_rationale,decided);
  INSERT INTO public.question_revision_retirement_reviews
    VALUES(r.id,p_user_id,decided,r.content_sha256,fingerprint,p_evidence,public.content_governance_hash(p_evidence),p_preparation,'ai_assisted_owner_retirement');
  UPDATE public.question_content_revisions SET status='stage1_approved' WHERE id=r.id;
  result:=jsonb_build_object('questionId',r.question_id,'revisionId',r.id,'status','stage1_approved','acceptanceMode','ai_assisted_owner_retirement','replayed',false);
  INSERT INTO public.content_governance_requests VALUES(p_user_id,'accept_retirement_review',p_request_id,h,result,clock_timestamp());
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.get_question_revision_retirement_review(p_user_id uuid,p_revision_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r public.question_content_revisions%ROWTYPE; can_accept boolean; accepted boolean;
BEGIN
  IF NOT (public.content_governance_has_permission(p_user_id,'content.prepare')
    OR public.content_governance_has_permission(p_user_id,'content.review.stage1')
    OR public.content_governance_has_permission(p_user_id,'content.review.stage2')
    OR public.content_governance_has_permission(p_user_id,'content.publish')) THEN
    RAISE EXCEPTION 'content read permission required' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.question_content_revisions WHERE id=p_revision_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'revision not found' USING ERRCODE='P0002'; END IF;
  can_accept:=COALESCE(r.change_kind='retire' AND r.status='draft' AND r.prepared_by=p_user_id
    AND (r.outcomes_prepared_by IS NULL OR r.outcomes_prepared_by=p_user_id)
    AND public.content_governance_has_permission(p_user_id,'content.prepare')
    AND public.content_governance_has_permission(p_user_id,'content.review.stage1')
    AND public.content_governance_has_permission(p_user_id,'content.publish'),false);
  SELECT EXISTS(SELECT 1 FROM public.question_revision_retirement_reviews WHERE revision_id=r.id) INTO accepted;
  RETURN jsonb_build_object('revisionId',r.id,'accepted',accepted,'canAccept',can_accept,
    'acceptanceMode',CASE WHEN accepted THEN 'ai_assisted_owner_retirement' ELSE NULL END,
    'readyToPublish',public.question_revision_retirement_review_ready(r.id),
    'evidenceFingerprint',CASE WHEN can_accept THEN public.question_retirement_fingerprint(r.id) ELSE NULL END);
END $$;

-- Publisher/readiness definitions appended below. Ordinary content quality/source gates are preserved.

CREATE OR REPLACE FUNCTION public.question_revision_single_review_ready(p_revision_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT public.question_revision_retirement_review_ready(p_revision_id) OR EXISTS (
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
  -- Lock both pinned questions before checking owner retirement evidence.
  -- Ordinary two-stage publication retains its previous behavior.
  IF single_review AND r.change_kind='retire' THEN
    PERFORM 1 FROM public.questions WHERE id IN (r.question_id,
      (SELECT (e.evidence->'survivor'->>'questionId')::uuid
       FROM public.question_revision_retirement_reviews e WHERE e.revision_id=r.id))
      ORDER BY id FOR UPDATE;
  END IF;
  SELECT * INTO q FROM public.questions WHERE id=r.question_id FOR UPDATE;
  IF q.published_revision_id IS DISTINCT FROM r.base_revision_id THEN
    RAISE EXCEPTION 'stale revision cannot publish' USING ERRCODE='22023';
  END IF;
  PERFORM public.lock_question_revision_outcome_scope(r.id);
  PERFORM 1 FROM public.question_revision_sources WHERE revision_id=r.id FOR SHARE;
  PERFORM public.lock_question_revision_validation_run(r.id);
  -- Freeze the decision in BOTH single-owner and two-stage publication paths.
  PERFORM 1 FROM public.question_validation_runtime WHERE singleton FOR SHARE;
  PERFORM 1 FROM public.question_validation_decisions d
    JOIN public.question_validation_runtime runtime ON runtime.singleton
    WHERE d.revision_id=r.id AND d.question_id=r.question_id AND d.content_sha256=r.content_sha256
      AND d.policy_version=public.question_revision_validation_policy(r.id) FOR SHARE OF d;
  IF single_review THEN
    IF NOT public.question_revision_single_review_ready(r.id) THEN
      RAISE EXCEPTION 'accepted current retirement or source/quality evidence required' USING ERRCODE='22023';
    END IF;
  END IF;
  -- Same narrow retirement check is repeated after locking the current base.
  -- No exception applies to activation, content edits, or partial mappings.
  IF (NOT public.question_revision_outcomes_valid(r.id)
      AND NOT COALESCE((r.change_kind='retire'
        AND q.id=r.question_id AND q.is_active IS FALSE
        AND r.base_revision_id IS NOT NULL
        AND q.published_revision_id=r.base_revision_id
        AND NOT EXISTS (SELECT 1 FROM public.question_revision_outcomes WHERE revision_id=r.id)
        AND r.content_sha256=encode(extensions.digest(q.content::text,'sha256'),'hex')
        AND ROW(r.content,r.game,r.category,r.subcategory,r.topic,r.difficulty,r.level_tag,r.exam_ref,r.is_boss)
          IS NOT DISTINCT FROM
          ROW(q.content,q.game::text,q.category::text,q.subcategory::text,q.topic::text,q.difficulty,q.level_tag::text,q.exam_ref::text,q.is_boss)),false))
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
    WHERE question.id=r.question_id AND question.is_active
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
    r.question_id,r.id,p_user_id,'published',CASE WHEN single_review AND r.change_kind='retire' THEN 'AI-assisted owner retirement accepted; not independent review' WHEN single_review THEN 'Source-comparison single approval published' ELSE 'Two-stage approved revision published' END
  );
  out:=jsonb_build_object(
    'questionId',r.question_id,'revisionId',r.id,'status','published','replayed',false
  );
  INSERT INTO public.content_governance_requests
  VALUES(p_user_id,'publish_revision',p_request_id,h,out,clock_timestamp());
  RETURN out;
END
$function$;

REVOKE ALL ON FUNCTION public.question_retirement_fingerprint(uuid),public.question_retirement_evidence_valid(uuid,jsonb),
  public.question_revision_retirement_review_ready(uuid),
  public.accept_question_revision_retirement_review(uuid,uuid,jsonb,text,uuid,jsonb),
  public.get_question_revision_retirement_review(uuid,uuid),
  public.question_revision_single_review_ready(uuid),public.publish_question_content_revision(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.accept_question_revision_retirement_review(uuid,uuid,jsonb,text,uuid,jsonb),
  public.get_question_revision_retirement_review(uuid,uuid),public.publish_question_content_revision(uuid,uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
