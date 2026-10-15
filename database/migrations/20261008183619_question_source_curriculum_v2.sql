-- v2 separates content corroboration from official curriculum/year binding.
-- No seed/import/approval/publication, role change, or diagnostic activation.
-- Requires 217 + 219; v1 history is deliberately not reinterpreted.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Reviewed by an authorized catalog owner transaction, not by report ingestion.
-- Acceptance is for this canonical outcome and this exam year only.
CREATE TABLE IF NOT EXISTS public.curriculum_canonical_exam_scopes (
  canonical_id text NOT NULL REFERENCES public.curriculum_canonical_outcomes(canonical_id) ON DELETE RESTRICT,
  exam_year smallint NOT NULL CHECK (exam_year BETWEEN 2000 AND 2100),
  source_receipt jsonb NOT NULL,
  reviewed_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (canonical_id,exam_year),
  CHECK (COALESCE(jsonb_typeof(source_receipt)='object'
    AND source_receipt->>'kind' IN ('official_exam','official_curriculum')
    AND source_receipt->>'url' ~ '^https://[^/@[:space:]]+/'
    AND source_receipt->>'retrievedTextSha256' ~ '^[a-f0-9]{64}$'
    AND length(btrim(source_receipt->>'retrievalRef')) BETWEEN 1 AND 4000
    AND length(btrim(source_receipt->>'locator')) BETWEEN 1 AND 4000
    AND length(btrim(source_receipt->>'acceptanceRef')) BETWEEN 1 AND 4000, false))
);
ALTER TABLE public.curriculum_canonical_exam_scopes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.curriculum_canonical_exam_scopes FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.curriculum_canonical_exam_scopes TO service_role;
DROP POLICY IF EXISTS canonical_exam_scopes_service_read ON public.curriculum_canonical_exam_scopes;
CREATE POLICY canonical_exam_scopes_service_read ON public.curriculum_canonical_exam_scopes
  FOR SELECT TO service_role USING (true);
DROP TRIGGER IF EXISTS canonical_exam_scope_immutable ON public.curriculum_canonical_exam_scopes;
CREATE TRIGGER canonical_exam_scope_immutable BEFORE UPDATE OR DELETE
  ON public.curriculum_canonical_exam_scopes FOR EACH ROW EXECUTE FUNCTION public.question_source_review_immutable();
COMMENT ON TABLE public.curriculum_canonical_exam_scopes IS
  'Owner-reviewed, immutable official exam-year receipts; not source-review acceptance or publication. No client import API.';

CREATE OR REPLACE FUNCTION public.question_source_curriculum_binding_valid(p_revision_id uuid,p_report jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  r public.question_content_revisions%ROWTYPE;
  b jsonb; m jsonb; c jsonb; program_source jsonb; scope_source jsonb;
  canonical public.curriculum_canonical_outcomes%ROWTYPE;
  scope_receipt jsonb;
  binding_count integer;
BEGIN
  SELECT * INTO r FROM public.question_content_revisions WHERE id=p_revision_id;
  IF NOT FOUND OR p_report->>'format' IS DISTINCT FROM 'source-comparison@2'
    OR public.question_revision_outcomes_valid(r.id) IS NOT TRUE THEN RETURN false; END IF;
  b:=p_report->'curriculumBinding';
  IF jsonb_typeof(b) IS DISTINCT FROM 'object'
    OR b->>'examRef' IS DISTINCT FROM r.exam_ref
    OR jsonb_typeof(b->'examYear') IS DISTINCT FROM 'number'
    OR COALESCE(b->>'examYear','') !~ '^[0-9]{4}$'
    OR (b->>'examYear')::integer NOT BETWEEN 2000 AND 2100
    OR jsonb_typeof(b->'mappings') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  binding_count:=jsonb_array_length(b->'mappings');
  IF binding_count NOT BETWEEN 1 AND 30
    OR binding_count<>(SELECT count(*) FROM public.question_revision_outcomes WHERE revision_id=r.id)
    OR binding_count<>(SELECT count(DISTINCT v->>'outcomeId') FROM jsonb_array_elements(b->'mappings') v)
    OR binding_count<>(SELECT count(DISTINCT v->>'canonicalId') FROM jsonb_array_elements(b->'mappings') v)
  THEN RETURN false; END IF;
  FOR m IN SELECT value FROM jsonb_array_elements(b->'mappings') LOOP
    SELECT co.* INTO canonical
      FROM public.question_revision_outcomes ro
      JOIN public.curriculum_outcomes o ON o.id=ro.outcome_id
      JOIN public.curriculum_outcome_canonical_links l ON l.outcome_id=o.id
      JOIN public.curriculum_canonical_outcomes co ON co.canonical_id=l.canonical_id
      WHERE ro.revision_id=r.id AND ro.outcome_id::text=m->>'outcomeId'
        AND co.canonical_id=m->>'canonicalId' AND co.game=r.game AND co.exam_ref=r.exam_ref
        AND co.title=o.title AND l.taxonomy_version=o.taxonomy_version AND o.is_active
        AND public.curriculum_outcome_scope_valid(o.id,r.game,r.category,r.exam_ref);
    IF NOT FOUND OR m->>'programKey' IS DISTINCT FROM canonical.program_key
      OR m->>'programEdition' IS DISTINCT FROM canonical.program_edition
      OR jsonb_typeof(m->'grade') IS DISTINCT FROM 'number'
      OR m->>'grade' IS DISTINCT FROM canonical.grade::text
      OR m->>'officialCode' IS DISTINCT FROM canonical.official_code
      OR m->>'programPageTextSha256' IS DISTINCT FROM canonical.source_receipt->>'pageTextSha256'
    THEN RETURN false; END IF;
    SELECT value INTO c FROM jsonb_array_elements(p_report->'claims') WHERE value->>'id'=m->>'claimId';
    IF NOT FOUND OR c->>'target' IS DISTINCT FROM 'curriculum'
      OR jsonb_typeof(c->'evidence') IS DISTINCT FROM 'array'
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(c->'evidence') e
        WHERE e->>'sourceId'=m->>'programSourceId' AND e->>'relation'='supports' AND e->'scopeMatch'='true'::jsonb)
    THEN RETURN false; END IF;
    SELECT value INTO program_source FROM jsonb_array_elements(p_report->'sources') WHERE value->>'id'=m->>'programSourceId';
    -- v2 uses the precise program page text, not an unrelated whole-packet hash.
    IF NOT FOUND OR program_source->>'kind' IS DISTINCT FROM 'official_curriculum'
      OR program_source->>'access' IS DISTINCT FROM 'inspected_section'
      OR program_source->>'url' IS DISTINCT FROM canonical.source_receipt->>'url'
      OR program_source->>'retrievedTextSha256' IS DISTINCT FROM canonical.source_receipt->>'pageTextSha256'
      OR NULLIF(btrim(program_source->>'retrievalRef'),'') IS NULL THEN RETURN false; END IF;
    SELECT source_receipt INTO scope_receipt FROM public.curriculum_canonical_exam_scopes
      WHERE canonical_id=canonical.canonical_id AND exam_year=(b->>'examYear')::integer;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT value INTO scope_source FROM jsonb_array_elements(p_report->'sources') WHERE value->>'id'=m->>'examScopeSourceId';
    IF NOT FOUND OR scope_source->>'access' IS DISTINCT FROM 'inspected_section'
      OR scope_source->>'kind' IS DISTINCT FROM scope_receipt->>'kind'
      OR scope_source->>'url' IS DISTINCT FROM scope_receipt->>'url'
      OR scope_source->>'retrievedTextSha256' IS DISTINCT FROM scope_receipt->>'retrievedTextSha256'
      OR scope_source->>'retrievalRef' IS DISTINCT FROM scope_receipt->>'retrievalRef'
      OR m->>'examScopeLocator' IS DISTINCT FROM scope_receipt->>'locator' THEN RETURN false; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_report->'claims') claim_row
    WHERE claim_row->>'target'='curriculum' AND NOT EXISTS
      (SELECT 1 FROM jsonb_array_elements(b->'mappings') mapping_row WHERE mapping_row->>'claimId'=claim_row->>'id'))
  THEN RETURN false; END IF;
  RETURN true;
EXCEPTION WHEN invalid_text_representation OR invalid_parameter_value OR numeric_value_out_of_range THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.question_source_curriculum_binding_valid(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

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
    OR COALESCE(p_report->>'format','') NOT IN ('source-comparison@1','source-comparison@2')
    OR (p_report->>'questionId') IS DISTINCT FROM r.question_id::text
    OR (p_report->>'revisionId') IS DISTINCT FROM r.id::text
    OR (p_report->>'contentSha256') IS DISTINCT FROM r.content_sha256 THEN RETURN false; END IF;
  IF jsonb_typeof(r.content->'options') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_report->'sources') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_report->'claims') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_report->'optionChecks') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_report->'examComparison') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_report->'terminology') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF p_report->>'format'='source-comparison@2'
    AND public.question_source_curriculum_binding_valid(p_revision_id,p_report) IS NOT TRUE THEN RETURN false; END IF;
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
    IF (component_count<2 AND NOT (p_report->>'format'='source-comparison@2' AND c->>'target'='curriculum'))
      OR (c->>'target'='curriculum' AND NOT EXISTS (
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
  -- Historical v1 attestations and exact idempotent replays remain valid.
  -- A new LGS acceptance must not downgrade around canonical/year verification.
  IF r.exam_ref='LGS' AND (p_report->>'format') IS DISTINCT FROM 'source-comparison@2' THEN
    RAISE EXCEPTION 'source-comparison@2 required for new LGS source acceptance' USING ERRCODE='22023'; END IF;
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

REVOKE ALL ON FUNCTION public.question_source_report_valid(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.question_source_report_valid(uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.accept_question_revision_source_review(uuid,uuid,jsonb,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.accept_question_revision_source_review(uuid,uuid,jsonb,text,uuid) TO service_role;
COMMIT;
