-- Source comparison + ONE independent authorized human; existing two-stage history stays valid.
-- This migration publishes/approves NO questions and changes NO roles or runtime flags.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.question_revision_source_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_fingerprint text NOT NULL CHECK (evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  report jsonb NOT NULL CHECK (jsonb_typeof(report) = 'object' AND octet_length(report::text) <= 1048576),
  report_sha256 text NOT NULL CHECK (report_sha256 ~ '^[0-9a-f]{64}$'),
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewed_at timestamptz NOT NULL,
  policy_version text NOT NULL DEFAULT 'source-review-single@1' CHECK (policy_version = 'source-review-single@1'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (revision_id, reviewer_id, reviewed_at)
);
ALTER TABLE public.question_revision_source_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.question_revision_source_reviews FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON TABLE public.question_revision_source_reviews IS
  'Private append-only report attestations attached to existing stage-1 approvals; not an AI approval or a second lifecycle.';

CREATE OR REPLACE FUNCTION public.question_source_review_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'source review evidence is append-only' USING ERRCODE='42501';
END $$;

DROP TRIGGER IF EXISTS question_source_review_immutable ON public.question_revision_source_reviews;
CREATE TRIGGER question_source_review_immutable BEFORE UPDATE OR DELETE
ON public.question_revision_source_reviews FOR EACH ROW EXECUTE FUNCTION public.question_source_review_immutable();

CREATE OR REPLACE FUNCTION public.question_source_review_fingerprint(p_revision_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT public.content_governance_hash(jsonb_build_object(
    'revision', jsonb_build_object('contentSha256',r.content_sha256,'game',r.game,
      'category',r.category,'subcategory',r.subcategory,'topic',r.topic,'difficulty',r.difficulty,
      'examRef',r.exam_ref,'levelTag',r.level_tag,'isBoss',r.is_boss,'changeKind',r.change_kind,
      'preparedBy',r.prepared_by,'outcomesPreparedBy',r.outcomes_prepared_by),
    'source', (SELECT to_jsonb(s) FROM public.question_revision_sources s WHERE s.revision_id=r.id),
    'outcomes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.outcome_id,'weight',o.weight,'primary',o.is_primary)
      ORDER BY o.outcome_id) FROM public.question_revision_outcomes o WHERE o.revision_id=r.id),'[]'::jsonb)
  )) FROM public.question_content_revisions r WHERE r.id=p_revision_id
$$;

-- Core coverage is rechecked in SQL as well as by the strict server schema.
-- Retrieval hashes are attestations, NOT proof that PostgreSQL visited a website.
CREATE OR REPLACE FUNCTION public.question_source_report_valid(p_revision_id uuid, p_report jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  r public.question_content_revisions%ROWTYPE;
  c jsonb; e jsonb; s jsonb; opt jsonb; claim_id text;
  supports jsonb; component_count integer; option_count integer; answer_index integer;
BEGIN
  SELECT * INTO r FROM public.question_content_revisions WHERE id=p_revision_id;
  IF NOT FOUND OR p_report IS NULL OR jsonb_typeof(p_report) <> 'object'
    OR octet_length(p_report::text)>1048576
    OR (p_report->>'format') IS DISTINCT FROM 'source-comparison@1'
    OR (p_report->>'questionId') IS DISTINCT FROM r.question_id::text
    OR (p_report->>'revisionId') IS DISTINCT FROM r.id::text
    OR (p_report->>'contentSha256') IS DISTINCT FROM r.content_sha256 THEN RETURN false; END IF;
  IF jsonb_typeof(r.content->'options') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_report->'sources') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_report->'claims') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_report->'optionChecks') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_report->'examComparison') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_report->'terminology') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  option_count:=jsonb_array_length(r.content->'options');
  IF option_count NOT BETWEEN 2 AND 5 OR COALESCE(r.content->>'answer',r.content->>'correct','') !~ '^[0-4]$'
    OR jsonb_array_length(p_report->'sources') NOT BETWEEN 2 AND 30
    OR jsonb_array_length(p_report->'claims') NOT BETWEEN 1 AND 100
    OR jsonb_array_length(p_report->'optionChecks')<>option_count THEN RETURN false; END IF;
  answer_index:=COALESCE(r.content->>'answer',r.content->>'correct')::integer;
  IF answer_index>=option_count THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_report->'sources') v
      GROUP BY v->>'id' HAVING count(*)>1 OR NULLIF(btrim(v->>'id'),'') IS NULL)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_report->'claims') v
      GROUP BY v->>'id' HAVING count(*)>1 OR NULLIF(btrim(v->>'id'),'') IS NULL)
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_report->'claims') v WHERE v->>'target'='stem')
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_report->'claims') v WHERE v->>'target'='curriculum')
    OR (NULLIF(btrim(COALESCE(r.content->>'solution',r.content->>'explanation','')),'') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_report->'claims') v WHERE v->>'target'='solution'))
  THEN RETURN false; END IF;
  FOR s IN SELECT value FROM jsonb_array_elements(p_report->'sources') LOOP
    IF NULLIF(btrim(s->>'workId'),'') IS NULL OR NULLIF(btrim(s->>'independenceGroup'),'') IS NULL
      OR COALESCE(s->>'url','') !~ '^https://[^/@[:space:]]+/'
      OR COALESCE(s->>'kind','') NOT IN ('official_curriculum','official_exam','textbook','university_material','peer_reviewed','reference')
      OR COALESCE(s->>'access','') NOT IN ('inspected_section','abstract_only','unavailable')
    THEN RETURN false; END IF;
  END LOOP;
  FOR c IN SELECT value FROM jsonb_array_elements(p_report->'claims') LOOP
    IF COALESCE(c->>'target','') NOT IN ('stem','option','solution','curriculum')
      OR jsonb_typeof(c->'evidence') IS DISTINCT FROM 'array'
      OR jsonb_array_length(c->'evidence') NOT BETWEEN 1 AND 30
      OR NULLIF(btrim(c->>'statement'),'') IS NULL OR NULLIF(btrim(c->>'reasoningSummary'),'') IS NULL
    THEN RETURN false; END IF;
    IF c->>'target'='option' THEN
      IF COALESCE(c->>'optionIndex','') !~ '^[0-4]$' OR (c->>'optionIndex')::integer>=option_count THEN RETURN false; END IF;
    ELSIF c->'optionIndex' IS DISTINCT FROM 'null'::jsonb THEN RETURN false; END IF;
    supports:='[]'::jsonb;
    FOR e IN SELECT value FROM jsonb_array_elements(c->'evidence') LOOP
      SELECT value INTO s FROM jsonb_array_elements(p_report->'sources') WHERE value->>'id'=e->>'sourceId';
      IF NOT FOUND OR COALESCE(e->>'relation','') NOT IN ('supports','not_applicable','unverified')
        OR NULLIF(btrim(e->>'locator'),'') IS NULL OR NULLIF(btrim(e->>'explanation'),'') IS NULL THEN RETURN false; END IF;
      IF e->>'relation'='supports' AND e->'scopeMatch'='true'::jsonb AND s->>'access'='inspected_section'
        AND NULLIF(btrim(s->>'retrievalRef'),'') IS NOT NULL
        AND COALESCE(s->>'retrievedTextSha256','') ~ '^[0-9a-f]{64}$' THEN
        supports:=supports||jsonb_build_array(s);
      END IF;
    END LOOP;
    -- Connected components, not merely DISTINCT group labels: A--B--C is ONE source chain.
    WITH RECURSIVE nodes AS (
      SELECT DISTINCT v->>'id' id,lower(btrim(v->>'workId')) work,
        lower(btrim(v->>'independenceGroup')) grp,split_part(v->>'url','#',1) url,v->>'retrievedTextSha256' sha
      FROM jsonb_array_elements(supports) v
    ), edges AS (
      SELECT a.id a,b.id b FROM nodes a CROSS JOIN nodes b
      WHERE a.work=b.work OR a.grp=b.grp OR a.url=b.url OR a.sha=b.sha
    ), reach(a,b) AS (
      SELECT id,id FROM nodes UNION SELECT reach.a,edges.b FROM reach JOIN edges ON edges.a=reach.b
    ), roots AS (SELECT a,min(b) root FROM reach GROUP BY a)
    SELECT count(DISTINCT root) INTO component_count FROM roots;
    IF component_count<2 OR (c->>'target'='curriculum' AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(supports) v WHERE v->>'kind'='official_curriculum')) THEN RETURN false; END IF;
  END LOOP;
  IF (SELECT count(DISTINCT v->>'index') FROM jsonb_array_elements(p_report->'optionChecks') v)<>option_count
    OR (SELECT count(*) FROM jsonb_array_elements(p_report->'optionChecks') v WHERE v->>'assessment'='supported')<>1
  THEN RETURN false; END IF;
  FOR opt IN SELECT value FROM jsonb_array_elements(p_report->'optionChecks') LOOP
    IF COALESCE(opt->>'index','') !~ '^[0-4]$' OR (opt->>'index')::integer>=option_count
      OR COALESCE(opt->>'assessment','') NOT IN ('supported','excluded')
      OR ((opt->>'assessment'='supported') IS DISTINCT FROM ((opt->>'index')::integer=answer_index))
      OR jsonb_typeof(opt->'claimIds') IS DISTINCT FROM 'array'
      OR jsonb_array_length(opt->'claimIds') NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
    FOR claim_id IN SELECT value FROM jsonb_array_elements_text(opt->'claimIds') LOOP
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_report->'claims') v
        WHERE v->>'id'=claim_id AND v->>'target'='option' AND v->>'optionIndex'=opt->>'index') THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  IF p_report#>'{examComparison,answerKeyTransfer}' IS DISTINCT FROM 'false'::jsonb
    OR COALESCE(p_report#>>'{examComparison,status}','') NOT IN ('compared','not_found','not_applicable') THEN RETURN false; END IF;
  IF p_report#>>'{examComparison,status}'='compared' THEN
    IF NULLIF(btrim(p_report#>>'{examComparison,reference}'),'') IS NULL
      OR p_report#>'{examComparison,optionOrderChecked}' IS DISTINCT FROM 'true'::jsonb
      OR jsonb_typeof(p_report#>'{examComparison,sourceIds}') IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_report#>'{examComparison,sourceIds}') NOT BETWEEN 1 AND 10 THEN RETURN false; END IF;
    FOR claim_id IN SELECT value FROM jsonb_array_elements_text(p_report#>'{examComparison,sourceIds}') LOOP
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_report->'sources') v WHERE v->>'id'=claim_id
        AND v->>'kind'='official_exam' AND v->>'access'='inspected_section'
        AND NULLIF(btrim(v->>'retrievalRef'),'') IS NOT NULL AND v->>'retrievedTextSha256' ~ '^[0-9a-f]{64}$') THEN RETURN false; END IF;
    END LOOP;
  END IF;
  RETURN true;
EXCEPTION WHEN invalid_text_representation OR invalid_parameter_value OR numeric_value_out_of_range THEN RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.question_revision_single_review_ready(p_revision_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
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
      AND a.reviewer_id<>r.prepared_by AND (r.outcomes_prepared_by IS NULL OR a.reviewer_id<>r.outcomes_prepared_by)
      AND e.content_sha256=r.content_sha256 AND e.evidence_fingerprint=public.question_source_review_fingerprint(r.id)
      AND e.report_sha256=public.content_governance_hash(e.report)
      AND public.question_source_report_valid(r.id,e.report) AND public.question_revision_outcomes_valid(r.id)
      AND lower(source.license_code)<>'legacy-import'
      AND NULLIF(btrim(source.provenance_ref),'') IS NOT NULL AND lower(btrim(source.provenance_ref)) NOT LIKE 'legacy:%'
  )
$$;

CREATE OR REPLACE FUNCTION public.accept_question_revision_source_review(
  p_user_id uuid,p_revision_id uuid,p_report jsonb,p_rationale text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE r public.question_content_revisions%ROWTYPE; old public.content_governance_requests%ROWTYPE;
  h text; result jsonb; a public.question_revision_approvals%ROWTYPE;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.review.stage1') THEN
    RAISE EXCEPTION 'source review permission required' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL OR p_rationale IS NULL OR char_length(btrim(p_rationale)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'source review request and rationale required' USING ERRCODE='22023'; END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'accept_source_review',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object('revisionId',p_revision_id,'report',p_report,'rationale',p_rationale));
  SELECT * INTO old FROM public.content_governance_requests
    WHERE user_id=p_user_id AND operation='accept_source_review' AND request_id=p_request_id;
  IF FOUND THEN
    IF old.payload_hash<>h THEN RAISE EXCEPTION 'source review payload mismatch' USING ERRCODE='22023'; END IF;
    RETURN old.result||jsonb_build_object('replayed',true);
  END IF;
  SELECT * INTO r FROM public.question_content_revisions WHERE id=p_revision_id FOR UPDATE;
  IF NOT FOUND OR r.status<>'draft' OR r.change_kind IN ('legacy_import','retire') THEN
    RAISE EXCEPTION 'editable non-legacy draft required' USING ERRCODE='22023'; END IF;
  PERFORM public.lock_question_revision_outcome_scope(r.id);
  PERFORM 1 FROM public.question_revision_sources WHERE revision_id=r.id FOR SHARE;
  IF NOT public.question_revision_outcomes_valid(r.id) OR NOT public.question_source_report_valid(r.id,p_report)
    OR NOT EXISTS (SELECT 1 FROM public.question_revision_sources s WHERE s.revision_id=r.id
      AND lower(s.license_code)<>'legacy-import' AND NULLIF(btrim(s.provenance_ref),'') IS NOT NULL
      AND lower(btrim(s.provenance_ref)) NOT LIKE 'legacy:%') THEN
    RAISE EXCEPTION 'source comparison or provenance incomplete' USING ERRCODE='22023'; END IF;
  -- Delegate real human signature and author separation to the existing governance function.
  -- The outer request owns replay; a distinct inner key avoids lock-order collisions
  -- with clients submitting a legacy review under the same request UUID.
  PERFORM public.review_question_content_revision(p_user_id,r.id,1::smallint,'approved',p_rationale,gen_random_uuid());
  SELECT * INTO STRICT a FROM public.question_revision_approvals WHERE revision_id=r.id AND stage=1;
  IF a.reviewer_id IS DISTINCT FROM p_user_id OR a.decision<>'approved' THEN
    RAISE EXCEPTION 'review signature mismatch' USING ERRCODE='22023'; END IF;
  INSERT INTO public.question_revision_source_reviews(revision_id,content_sha256,evidence_fingerprint,report,report_sha256,reviewer_id,reviewed_at)
    VALUES(r.id,r.content_sha256,public.question_source_review_fingerprint(r.id),p_report,public.content_governance_hash(p_report),a.reviewer_id,a.decided_at);
  result:=jsonb_build_object('questionId',r.question_id,'revisionId',r.id,'status','stage1_approved','replayed',false);
  INSERT INTO public.content_governance_requests VALUES(p_user_id,'accept_source_review',p_request_id,h,result,clock_timestamp());
  RETURN result;
END $$;

-- Separate safe projection avoids breaking the deployed strict revision-detail contract.
CREATE OR REPLACE FUNCTION public.get_question_revision_source_review(p_user_id uuid,p_revision_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE r public.question_content_revisions%ROWTYPE;
BEGIN
  IF NOT (public.content_governance_has_permission(p_user_id,'content.prepare')
    OR public.content_governance_has_permission(p_user_id,'content.review.stage1')
    OR public.content_governance_has_permission(p_user_id,'content.review.stage2')
    OR public.content_governance_has_permission(p_user_id,'content.publish')) THEN
    RAISE EXCEPTION 'content read permission required' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.question_content_revisions WHERE id=p_revision_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'revision not found' USING ERRCODE='P0002'; END IF;
  RETURN jsonb_build_object('revisionId',r.id,'readyToPublish',public.question_revision_single_review_ready(r.id),
    'draft',jsonb_build_object('id',r.question_id,'game',r.game,'category',r.category,'topic',r.topic,
      'exam_ref',r.exam_ref,'content',r.content,'published_revision_id',r.id,'content_sha256',r.content_sha256),
    'accepted',EXISTS (SELECT 1 FROM public.question_revision_source_reviews e JOIN public.question_revision_approvals a
      ON a.revision_id=e.revision_id AND a.stage=1 AND a.decision='approved' AND a.reviewer_id=e.reviewer_id AND a.decided_at=e.reviewed_at
      WHERE e.revision_id=r.id AND e.content_sha256=r.content_sha256 AND e.evidence_fingerprint=public.question_source_review_fingerprint(r.id)));
END $$;

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
  IF single_review THEN
    -- Freeze policy and its exact authoritative decision through projection write.
    PERFORM 1 FROM public.question_validation_runtime WHERE singleton FOR SHARE;
    PERFORM 1 FROM public.question_validation_decisions d
      JOIN public.question_validation_runtime runtime ON runtime.singleton
      WHERE d.revision_id=r.id AND d.question_id=r.question_id AND d.content_sha256=r.content_sha256
        AND d.policy_version=runtime.required_policy_version FOR SHARE OF d;
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
$function$
;

CREATE OR REPLACE FUNCTION public.tyt_social_revision_source_policy_ready(p_revision_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = pg_catalog
AS $function$
  SELECT p_revision_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.questions AS question
    JOIN public.question_content_revisions AS revision
      ON revision.id = question.published_revision_id
     AND revision.question_id = question.id
    JOIN public.question_revision_sources AS source
      ON source.revision_id = revision.id
    LEFT JOIN public.question_revision_approvals AS stage_one
      ON stage_one.revision_id = revision.id
     AND stage_one.stage = 1
     AND stage_one.decision = 'approved'
    LEFT JOIN public.question_revision_approvals AS stage_two
      ON stage_two.revision_id = revision.id
     AND stage_two.stage = 2
     AND stage_two.decision = 'approved'
    WHERE revision.id = p_revision_id
      AND question.is_active
      AND question.game::text = 'sosyal'
      AND upper(btrim(COALESCE(question.exam_ref::text, ''))) = 'TYT'
      AND revision.status = 'published'
      AND revision.published_at IS NOT NULL
      AND revision.change_kind <> 'legacy_import'
      AND revision.prepared_by IS NOT NULL
      AND revision.game IS NOT DISTINCT FROM question.game::text
      AND revision.category IS NOT DISTINCT FROM question.category::text
      AND upper(btrim(COALESCE(revision.exam_ref, ''))) = 'TYT'
      AND revision.difficulty IS NOT DISTINCT FROM question.difficulty
      AND revision.content_sha256 ~ '^[0-9a-f]{64}$'
      AND source.source_kind IN (
        'original','licensed','public_domain','user_generated','official_exam'
      )
      AND lower(source.license_code) <> 'legacy-import'
      AND NULLIF(btrim(COALESCE(source.provenance_ref, '')), '') IS NOT NULL
      AND lower(btrim(source.provenance_ref)) NOT LIKE 'legacy:%'
      AND (
        public.question_revision_single_review_ready(revision.id)
        OR (
      stage_one.revision_id IS NOT NULL AND stage_two.revision_id IS NOT NULL
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
        )
      )
  )
$function$
;

REVOKE ALL ON FUNCTION public.question_source_review_immutable(),
  public.question_source_review_fingerprint(uuid),public.question_source_report_valid(uuid,jsonb),
  public.question_revision_single_review_ready(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.accept_question_revision_source_review(uuid,uuid,jsonb,text,uuid),
  public.get_question_revision_source_review(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_question_revision_source_review(uuid,uuid,jsonb,text,uuid),
  public.get_question_revision_source_review(uuid,uuid) TO service_role;
-- Existing publisher/reader ACLs are preserved by CREATE OR REPLACE.
NOTIFY pgrst, 'reload schema';
COMMIT;
