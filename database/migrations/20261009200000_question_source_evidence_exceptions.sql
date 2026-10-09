-- Explicit owner-adjudicated exceptions; no backfill, source acceptance or release.
-- Requires source curriculum v2, AI owner acceptance and actor AAL2 helper (166).
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE TABLE IF NOT EXISTS public.question_revision_source_exceptions (
  revision_id uuid PRIMARY KEY REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[a-f0-9]{64}$'),
  evidence_fingerprint text NOT NULL CHECK(evidence_fingerprint ~ '^[a-f0-9]{64}$'),
  report_sha256 text NOT NULL CHECK(report_sha256 ~ '^[a-f0-9]{64}$'),
  declaration jsonb NOT NULL CHECK(jsonb_typeof(declaration)='object'),
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.question_revision_source_exceptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.question_revision_source_exceptions FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS question_source_exception_immutable ON public.question_revision_source_exceptions;
CREATE TRIGGER question_source_exception_immutable BEFORE UPDATE OR DELETE
  ON public.question_revision_source_exceptions FOR EACH ROW EXECUTE FUNCTION public.question_source_review_immutable();
COMMENT ON TABLE public.question_revision_source_exceptions IS
  'Immutable accountable-owner adjudication, not independent review or a quality/publication decision. Original contrary evidence retained.';

CREATE OR REPLACE FUNCTION public.question_source_exception_keys(p jsonb,keys text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT COALESCE(jsonb_typeof(p)='object' AND p ?& keys
    AND (SELECT count(*) FROM jsonb_object_keys(CASE WHEN jsonb_typeof(p)='object' THEN p ELSE '{}'::jsonb END))=cardinality(keys),false)
$$;

CREATE OR REPLACE FUNCTION public.question_source_exception_supported(c jsonb,s jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT COALESCE(s->>'access'='inspected_section'
    AND length(btrim(s->>'retrievalRef'))>0 AND s->>'retrievedTextSha256' ~ '^[a-f0-9]{64}$'
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(c->'evidence') e
      WHERE e->>'sourceId'=s->>'id' AND e->>'relation'='supports' AND e->'scopeMatch'='true'::jsonb),false)
$$;

-- NULL means denied. This checks a declaration, not authority; the public report
-- validator below only supplies declarations from the immutable owner ledger.
CREATE OR REPLACE FUNCTION public.question_source_exception_allowances(p_revision_id uuid,p_report jsonb,p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r public.question_content_revisions%ROWTYPE; b jsonb; c jsonb; s jsonb; v jsonb; ev jsonb;
  k text; claim_id text; source_id text; records text[]:=ARRAY[]::text[]; dates date[]:=ARRAY[]::date[];
  resolved jsonb:='[]'::jsonb;
  ids text[]; regions text[]:=ARRAY['Karadeniz Bölgesi','Akdeniz Bölgesi','Marmara Bölgesi','Ege Bölgesi','Doğu Anadolu Bölgesi','İç Anadolu Bölgesi','Güneydoğu Anadolu Bölgesi'];
  winner text; answer_index integer; max_value integer;
BEGIN
  SELECT * INTO r FROM public.question_content_revisions WHERE id=p_revision_id;
  IF NOT FOUND OR p IS NULL OR octet_length(p::text)>1100000
    OR NOT public.question_source_exception_keys(p,ARRAY['version','reportSnapshot','revisionEvidenceFingerprint','rationale','basis'])
    OR p->>'version' IS DISTINCT FROM 'source-evidence-exception@1'
    OR p->'reportSnapshot' IS DISTINCT FROM p_report
    OR p->>'revisionEvidenceFingerprint' IS DISTINCT FROM public.question_source_review_fingerprint(r.id)
    OR jsonb_typeof(p->'rationale') IS DISTINCT FROM 'string' OR length(btrim(p->>'rationale')) NOT BETWEEN 10 AND 4000
    OR r.game<>'sosyal' OR r.exam_ref<>'TYT' OR r.category NOT IN ('tarih','cografya')
    OR p_report->>'format' IS DISTINCT FROM 'source-comparison@2'
    OR p_report->>'questionId' IS DISTINCT FROM r.question_id::text
    OR p_report->>'revisionId' IS DISTINCT FROM r.id::text
    OR p_report->>'contentSha256' IS DISTINCT FROM r.content_sha256
    OR p_report#>>'{curriculumBinding,examRef}' IS DISTINCT FROM 'TYT'
    OR p_report#>'{curriculumBinding,examYear}' IS DISTINCT FROM '2027'::jsonb
    OR jsonb_typeof(p_report->'sources') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_report->'claims') IS DISTINCT FROM 'array'
    OR public.question_source_curriculum_binding_valid(r.id,p_report) IS NOT TRUE THEN RETURN NULL; END IF;
  -- A narrow preparation allowance may not masquerade as official exam certification.
  IF EXISTS(SELECT 1 FROM public.question_revision_outcomes ro
    JOIN public.curriculum_outcome_canonical_links l ON l.outcome_id=ro.outcome_id
    JOIN public.curriculum_canonical_exam_scopes es ON es.canonical_id=l.canonical_id AND es.exam_year=2027
    WHERE ro.revision_id=r.id AND (es.source_receipt->>'acceptancePurpose' IS DISTINCT FROM 'preparation_only'
      OR es.source_receipt->'officialExamCertification' IS DISTINCT FROM 'false'::jsonb)) THEN RETURN NULL; END IF;
  b:=p->'basis';
  IF b->>'kind'='mgm_regional_normal_maximum@1' THEN
    IF r.category<>'cografya' OR NOT public.question_source_exception_keys(b,ARRAY['kind','sourceId','claimIds','periodStart','periodEnd','statistic','unit','values'])
      OR b->'periodStart' IS DISTINCT FROM '1991'::jsonb OR b->'periodEnd' IS DISTINCT FROM '2020'::jsonb
      OR b->>'statistic' IS DISTINCT FROM 'annual_areal_precipitation_mean' OR b->>'unit' IS DISTINCT FROM 'tenths_mm'
      OR jsonb_typeof(b->'claimIds') IS DISTINCT FROM 'array' OR jsonb_typeof(b->'values') IS DISTINCT FROM 'array'
      OR jsonb_typeof(b->'sourceId') IS DISTINCT FROM 'string' OR length(btrim(b->>'sourceId')) NOT BETWEEN 1 AND 120
      OR jsonb_array_length(b->'claimIds') NOT BETWEEN 1 AND 20 OR jsonb_array_length(b->'values')<>7
      OR jsonb_typeof(r.content->'options') IS DISTINCT FROM 'array'
      OR jsonb_array_length(r.content->'options')<>5 OR COALESCE(r.content->>'answer',r.content->>'correct','') !~ '^[0-4]$' THEN RETURN NULL; END IF;
    SELECT value INTO s FROM jsonb_array_elements(p_report->'sources') WHERE value->>'id'=b->>'sourceId';
    IF NOT FOUND OR COALESCE(s->>'url','') !~ '^https://(www\.)?mgm\.gov\.tr/' THEN RETURN NULL; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_report->'claims') c0 CROSS JOIN LATERAL jsonb_array_elements(c0->'evidence') e
      WHERE e->>'relation'='contradicts') THEN RETURN NULL; END IF;
    FOR v IN SELECT value FROM jsonb_array_elements(b->'values') LOOP
      IF NOT public.question_source_exception_keys(v,ARRAY['region','value']) OR jsonb_typeof(v->'region') IS DISTINCT FROM 'string'
        OR NOT COALESCE(v->>'region'=ANY(regions),false) OR jsonb_typeof(v->'value') IS DISTINCT FROM 'number'
        OR COALESCE(v->>'value','') !~ '^[0-9]+$' OR (v->>'value')::numeric NOT BETWEEN 0 AND 500000 THEN RETURN NULL; END IF;
    END LOOP;
    IF (SELECT count(DISTINCT ds.value->>'region') FROM jsonb_array_elements(b->'values') ds)<>7 THEN RETURN NULL; END IF;
    SELECT max((ds.value->>'value')::integer) INTO max_value FROM jsonb_array_elements(b->'values') ds;
    IF (SELECT count(*) FROM jsonb_array_elements(b->'values') ds WHERE (ds.value->>'value')::integer=max_value)<>1 THEN RETURN NULL; END IF;
    SELECT ds.value->>'region' INTO winner FROM jsonb_array_elements(b->'values') ds WHERE (ds.value->>'value')::integer=max_value;
    answer_index:=COALESCE(r.content->>'answer',r.content->>'correct')::integer;
    IF r.content->'options'->>answer_index IS DISTINCT FROM winner
      OR (SELECT count(DISTINCT ds.value) FROM jsonb_array_elements_text(r.content->'options') ds)<>5
      OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(r.content->'options') ds WHERE NOT ds.value=ANY(regions)) THEN RETURN NULL; END IF;
    IF (SELECT count(DISTINCT ds.value) FROM jsonb_array_elements_text(b->'claimIds') ds)<>jsonb_array_length(b->'claimIds') THEN RETURN NULL; END IF;
    FOR v IN SELECT value FROM jsonb_array_elements(b->'claimIds') LOOP
      IF jsonb_typeof(v)<>'string' OR length(btrim(v#>>'{}')) NOT BETWEEN 1 AND 120 THEN RETURN NULL; END IF;
      SELECT value INTO c FROM jsonb_array_elements(p_report->'claims') WHERE value->>'id'=v#>>'{}';
      IF NOT FOUND OR c->>'target'='curriculum' OR NOT public.question_source_exception_supported(c,s) THEN RETURN NULL; END IF;
    END LOOP;
    RETURN jsonb_build_object('singleSourceClaims',b->'claimIds','resolvedContradictions','[]'::jsonb);
  ELSIF b->>'kind'='dated_record_order@1' THEN
    IF r.category<>'tarih' OR NOT public.question_source_exception_keys(b,ARRAY['kind','claimIds','contradictingSourceIds','calendar','earlier','later','conclusion'])
      OR b->>'calendar' IS DISTINCT FROM 'gregorian' OR b->>'conclusion' IS DISTINCT FROM 'earlier_precedes_later'
      OR jsonb_typeof(b->'claimIds') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'claimIds') NOT BETWEEN 1 AND 2
      OR jsonb_typeof(b->'contradictingSourceIds') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'contradictingSourceIds') NOT BETWEEN 1 AND 5 THEN RETURN NULL; END IF;
    IF (SELECT count(DISTINCT ds.value) FROM jsonb_array_elements_text(b->'claimIds') ds)<>jsonb_array_length(b->'claimIds')
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(b->'claimIds') ds WHERE jsonb_typeof(ds.value)<>'string' OR length(btrim(ds.value#>>'{}')) NOT BETWEEN 1 AND 120) THEN RETURN NULL; END IF;
    FOR claim_id IN SELECT value FROM jsonb_array_elements_text(b->'claimIds') LOOP
    records:=ARRAY[]::text[]; dates:=ARRAY[]::date[];
    SELECT value INTO c FROM jsonb_array_elements(p_report->'claims') WHERE value->>'id'=claim_id;
    IF NOT FOUND OR COALESCE(c->>'target','') NOT IN ('stem','solution') THEN RETURN NULL; END IF;
    SELECT array_agg(value) INTO ids FROM jsonb_array_elements_text(b->'contradictingSourceIds');
    IF (SELECT count(DISTINCT ds.id) FROM unnest(ids) ds(id))<>cardinality(ids) THEN RETURN NULL; END IF;
    FOR v IN SELECT value FROM jsonb_array_elements(b->'contradictingSourceIds') LOOP
      IF jsonb_typeof(v)<>'string' OR length(btrim(v#>>'{}')) NOT BETWEEN 1 AND 120 THEN RETURN NULL; END IF;
      SELECT value INTO s FROM jsonb_array_elements(p_report->'sources') WHERE value->>'id'=v#>>'{}';
      IF NOT FOUND OR s->>'access' IS DISTINCT FROM 'inspected_section' OR NULLIF(btrim(s->>'retrievalRef'),'') IS NULL
        OR COALESCE(s->>'retrievedTextSha256','') !~ '^[a-f0-9]{64}$' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c->'evidence') e
          WHERE e->>'sourceId'=v#>>'{}' AND e->>'relation'='contradicts' AND e->'scopeMatch'='true'::jsonb) THEN RETURN NULL; END IF;
    END LOOP;
    FOREACH k IN ARRAY ARRAY['earlier','later'] LOOP
      ev:=b->k;
      IF NOT public.question_source_exception_keys(ev,ARRAY['name','date','sourceIds'])
        OR jsonb_typeof(ev->'name') IS DISTINCT FROM 'string' OR length(btrim(ev->>'name')) NOT BETWEEN 10 AND 4000
        OR jsonb_typeof(ev->'date') IS DISTINCT FROM 'string' OR COALESCE(ev->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        OR jsonb_typeof(ev->'sourceIds') IS DISTINCT FROM 'array' OR jsonb_array_length(ev->'sourceIds') NOT BETWEEN 1 AND 5 THEN RETURN NULL; END IF;
      dates:=array_append(dates,(ev->>'date')::date);
      FOR v IN SELECT value FROM jsonb_array_elements(ev->'sourceIds') LOOP
        IF jsonb_typeof(v)<>'string' OR length(btrim(v#>>'{}')) NOT BETWEEN 1 AND 120 THEN RETURN NULL; END IF;
        source_id:=v#>>'{}';
        IF source_id=ANY(records) OR source_id=ANY(ids) THEN RETURN NULL; END IF;
        records:=array_append(records,source_id);
        SELECT value INTO s FROM jsonb_array_elements(p_report->'sources') WHERE value->>'id'=source_id;
        IF NOT FOUND OR NOT public.question_source_exception_supported(c,s)
          OR (COALESCE(s->>'url','') !~ '^https://(history\.state\.gov|api\.parliament\.uk|hansard\.parliament\.uk|archivesdiplomatiques\.diplomatie\.gouv\.fr|gallica\.bnf\.fr|archivesetmanuscrits\.bnf\.fr|(www\.)?rct\.uk|(www\.)?icj-cij\.org)/'
            AND s->>'url' IS DISTINCT FROM 'https://icj-web.leman.un-icc.cloud/sites/default/files/permanent-court-of-international-justice/serie_B/B_14/05_Commission_europeenne_du_Danube_Annexe.pdf') THEN RETURN NULL; END IF;
      END LOOP;
    END LOOP;
    IF dates[1]>=dates[2] THEN RETURN NULL; END IF;
    resolved:=resolved||(SELECT jsonb_agg(claim_id||':'||ds.id) FROM unnest(ids) ds(id));
    END LOOP;
    RETURN jsonb_build_object('singleSourceClaims','[]'::jsonb,'resolvedContradictions',resolved);
  END IF;
  RETURN NULL;
EXCEPTION WHEN invalid_text_representation OR invalid_parameter_value OR numeric_value_out_of_range OR datetime_field_overflow OR invalid_datetime_format THEN RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.question_source_report_evidence_valid(p_revision_id uuid, p_report jsonb, p_exception jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  r public.question_content_revisions%ROWTYPE;
  c jsonb; e jsonb; s jsonb; opt jsonb; claim_id text;
  allowances jsonb;
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
  IF p_exception IS NOT NULL THEN
    allowances:=public.question_source_exception_allowances(p_revision_id,p_report,p_exception);
    IF allowances IS NULL THEN RETURN false; END IF;
  END IF;
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
      IF NOT FOUND OR (COALESCE(e->>'relation','') NOT IN ('supports','not_applicable','unverified')
        AND NOT (e->>'relation'='contradicts' AND COALESCE(allowances->'resolvedContradictions' ? ((c->>'id')||':'||(e->>'sourceId')),false)))
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
    IF (component_count < CASE WHEN COALESCE(allowances->'singleSourceClaims' ? (c->>'id'),false) THEN 1 ELSE 2 END
      AND NOT (p_report->>'format'='source-comparison@2' AND c->>'target'='curriculum'))
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

CREATE OR REPLACE FUNCTION public.question_source_report_valid(p_revision_id uuid,p_report jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE doc jsonb;
BEGIN
  SELECT e.declaration INTO doc FROM public.question_revision_source_exceptions e
    JOIN public.question_content_revisions r ON r.id=e.revision_id
    WHERE e.revision_id=p_revision_id AND e.content_sha256=r.content_sha256
      AND e.evidence_fingerprint=public.question_source_review_fingerprint(r.id)
      AND e.report_sha256=public.content_governance_hash(p_report)
      AND e.declaration->'reportSnapshot'=p_report;
  RETURN public.question_source_report_evidence_valid(p_revision_id,p_report,doc);
END $$;

CREATE OR REPLACE FUNCTION public.accept_question_revision_source_exception_review(
  p_user_id uuid,p_revision_id uuid,p_report jsonb,p_exception jsonb,p_rationale text,p_request_id uuid,p_preparation jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r public.question_content_revisions%ROWTYPE; old public.content_governance_requests%ROWTYPE;
  h text; result jsonb; fingerprint text;
BEGIN
  IF NOT COALESCE(public.question_outcome_mapping_actor_has_aal2(p_user_id)
    AND public.content_governance_has_permission(p_user_id,'content.prepare')
    AND public.content_governance_has_permission(p_user_id,'content.review.stage1')
    AND public.content_governance_has_permission(p_user_id,'content.publish'),false) THEN
    RAISE EXCEPTION 'source exception requires authenticated accountable owner' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL OR p_rationale IS NULL OR length(btrim(p_rationale)) NOT BETWEEN 10 AND 1000
    OR NOT public.question_ai_preparation_declaration_valid(p_preparation) THEN
    RAISE EXCEPTION 'explicit source exception responsibility required' USING ERRCODE='22023'; END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'accept_source_exception',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object('revisionId',p_revision_id,'report',p_report,'exception',p_exception,'rationale',p_rationale,'preparation',p_preparation));
  SELECT * INTO old FROM public.content_governance_requests WHERE user_id=p_user_id AND operation='accept_source_exception' AND request_id=p_request_id;
  IF FOUND THEN
    IF old.payload_hash<>h THEN RAISE EXCEPTION 'source exception payload mismatch' USING ERRCODE='22023'; END IF;
    RETURN old.result||jsonb_build_object('replayed',true);
  END IF;
  SELECT * INTO r FROM public.question_content_revisions WHERE id=p_revision_id FOR UPDATE;
  IF NOT FOUND OR r.status<>'draft' OR r.change_kind IN ('legacy_import','retire') OR r.prepared_by IS DISTINCT FROM p_user_id
    OR (r.outcomes_prepared_by IS NOT NULL AND r.outcomes_prepared_by<>p_user_id) THEN
    RAISE EXCEPTION 'own non-legacy draft required for exception' USING ERRCODE='22023'; END IF;
  PERFORM public.lock_question_revision_outcome_scope(r.id);
  PERFORM 1 FROM public.question_revision_sources WHERE revision_id=r.id FOR SHARE;
  fingerprint:=public.question_source_review_fingerprint(r.id);
  IF p_preparation->>'revisionEvidenceFingerprint' IS DISTINCT FROM fingerprint
    OR public.question_source_exception_allowances(r.id,p_report,p_exception) IS NULL
    OR public.question_source_report_evidence_valid(r.id,p_report,p_exception) IS NOT TRUE THEN
    RAISE EXCEPTION 'source exception evidence incomplete or changed' USING ERRCODE='22023'; END IF;
  INSERT INTO public.question_revision_source_exceptions(revision_id,content_sha256,evidence_fingerprint,report_sha256,declaration,reviewer_id,request_id)
    VALUES(r.id,r.content_sha256,fingerprint,public.content_governance_hash(p_report),p_exception,p_user_id,p_request_id);
  -- A distinct inner request avoids cross-operation lock collisions. Failure rolls
  -- the exception back too; the ordinary source/year/provenance gates stay active.
  result:=public.accept_question_revision_ai_source_review(p_user_id,r.id,p_report,p_rationale,gen_random_uuid(),p_preparation)
    ||jsonb_build_object('exceptionKind',p_exception#>>'{basis,kind}','publicationAuthorized',false);
  INSERT INTO public.content_governance_requests VALUES(p_user_id,'accept_source_exception',p_request_id,h,result,clock_timestamp());
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.question_source_exception_keys(jsonb,text[]),public.question_source_exception_supported(jsonb,jsonb),
  public.question_source_exception_allowances(uuid,jsonb,jsonb),public.question_source_report_evidence_valid(uuid,jsonb,jsonb),
  public.question_source_report_valid(uuid,jsonb),public.accept_question_revision_source_exception_review(uuid,uuid,jsonb,jsonb,text,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.question_source_report_valid(uuid,jsonb),
  public.accept_question_revision_source_exception_review(uuid,uuid,jsonb,jsonb,text,uuid,jsonb) TO service_role;
COMMIT;
