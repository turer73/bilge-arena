-- Read-only, revision-pinned subset assessment. NOT a release or gate bypass.
-- Existing authoritative helpers remain the source of acceptance decisions.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_tyt_social_reviewed_pool_preflight(
  p_actor_user_id uuid, p_policy_version text, p_items jsonb
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog AS $fn$
DECLARE
  item jsonb; r public.question_content_revisions%ROWTYPE;
  q public.questions%ROWTYPE; role_row public.question_revision_exam_roles%ROWTYPE;
  issues text[]; results jsonb := '[]'::jsonb; counts jsonb; deficits jsonb;
  manifest jsonb; policy_ok boolean; role_ok boolean; eligible_count integer := 0;
  uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
BEGIN
  IF NOT COALESCE(public.question_outcome_mapping_actor_has_aal2(p_actor_user_id),false)
    OR NOT (COALESCE(public.content_governance_has_permission(p_actor_user_id,'content.prepare'),false)
      OR COALESCE(public.content_governance_has_permission(p_actor_user_id,'content.review.stage1'),false)
      OR COALESCE(public.content_governance_has_permission(p_actor_user_id,'content.review.stage2'),false)
      OR COALESCE(public.content_governance_has_permission(p_actor_user_id,'content.publish'),false)) THEN
    RAISE EXCEPTION 'AAL2 content governance permission required' USING ERRCODE='42501';
  END IF;
  IF p_policy_version IS DISTINCT FROM 'tyt-social-2026-v1'
    OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid reviewed pool request' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'reviewed pool requires 1 to 100 pins' USING ERRCODE='22023';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'invalid reviewed pool pin' USING ERRCODE='22023';
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(item)) <> 4
      OR NOT (item ?& ARRAY['questionId','revisionId','contentSha256','examRole'])
      OR jsonb_typeof(item->'questionId') IS DISTINCT FROM 'string'
      OR jsonb_typeof(item->'revisionId') IS DISTINCT FROM 'string'
      OR jsonb_typeof(item->'contentSha256') IS DISTINCT FROM 'string'
      OR jsonb_typeof(item->'examRole') IS DISTINCT FROM 'string'
      OR COALESCE(item->>'questionId','') !~ uuid_pattern
      OR COALESCE(item->>'revisionId','') !~ uuid_pattern
      OR COALESCE(item->>'contentSha256','') !~ '^[0-9a-f]{64}$'
      OR COALESCE(item->>'examRole','') NOT IN ('common_history','common_geography',
        'common_philosophy','standard_religion','alternate_philosophy') THEN
      RAISE EXCEPTION 'invalid reviewed pool pin' USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF (SELECT count(DISTINCT value->>'questionId') FROM jsonb_array_elements(p_items)) <> jsonb_array_length(p_items)
    OR (SELECT count(DISTINCT value->>'revisionId') FROM jsonb_array_elements(p_items)) <> jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'reviewed pool pins must be unique' USING ERRCODE='22023';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.resolve_current_tyt_social_candidate_policy()
    WHERE policy_version=p_policy_version) INTO policy_ok;
  -- Canonical request fingerprint, independent of caller order. It is not an
  -- approval receipt; all live authorities must be read again at publication.
  SELECT jsonb_agg(value ORDER BY value->>'questionId') INTO manifest FROM jsonb_array_elements(p_items);
  FOR item IN SELECT value FROM jsonb_array_elements(manifest) LOOP
    issues := ARRAY[]::text[];
    IF NOT policy_ok THEN issues := array_append(issues,'POLICY_UNAVAILABLE'); END IF;
    SELECT * INTO r FROM public.question_content_revisions WHERE id=(item->>'revisionId')::uuid;
    IF NOT FOUND OR r.question_id IS DISTINCT FROM (item->>'questionId')::uuid THEN
      issues := array_append(issues,'PIN_NOT_FOUND');
    ELSE
      SELECT * INTO q FROM public.questions WHERE id=r.question_id;
      IF NOT FOUND THEN issues := array_append(issues,'PIN_NOT_FOUND');
      ELSE
        IF r.content_sha256 IS DISTINCT FROM item->>'contentSha256'
          OR r.content_sha256 IS DISTINCT FROM encode(extensions.digest(r.content::text,'sha256'),'hex') THEN
          issues := array_append(issues,'CONTENT_HASH_MISMATCH');
        END IF;
        IF q.published_revision_id IS DISTINCT FROM r.id OR r.status IS DISTINCT FROM 'published'
          OR r.published_at IS NULL THEN issues := array_append(issues,'NOT_CURRENT_PUBLICATION'); END IF;
        IF q.is_active IS DISTINCT FROM true THEN issues := array_append(issues,'QUESTION_INACTIVE'); END IF;
        IF q.content IS DISTINCT FROM r.content OR q.category::text IS DISTINCT FROM r.category
          OR q.difficulty IS DISTINCT FROM r.difficulty THEN issues := array_append(issues,'LIVE_REVISION_DRIFT'); END IF;
        IF q.game::text IS DISTINCT FROM 'sosyal' OR r.game IS DISTINCT FROM 'sosyal'
          OR q.exam_ref::text IS DISTINCT FROM 'TYT' OR r.exam_ref IS DISTINCT FROM 'TYT'
          OR NOT COALESCE(public.tyt_social_exam_role_compatible(r.category,item->>'examRole'),false) THEN
          issues := array_append(issues,'ROLE_SCOPE_MISMATCH');
        END IF;
        IF NOT COALESCE(public.social_discovery_valid_content(r.content),false) THEN
          issues := array_append(issues,'INVALID_CONTENT');
        END IF;
        IF NOT COALESCE(public.tyt_social_revision_source_policy_ready(r.id),false) THEN
          issues := array_append(issues,'SOURCE_ACCEPTANCE_MISSING');
        END IF;
        IF NOT COALESCE(public.question_revision_outcomes_valid(r.id),false) THEN
          issues := array_append(issues,'OUTCOME_SCOPE_INVALID');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.question_validation_runtime runtime
          JOIN public.question_validation_decisions decision
            ON decision.policy_version=runtime.required_policy_version
          WHERE runtime.singleton AND runtime.enforce_publish_gate
            AND decision.question_id=r.question_id AND decision.revision_id=r.id
            AND decision.content_sha256=r.content_sha256 AND decision.verdict='APPROVED') THEN
          issues := array_append(issues,'QUALITY_DECISION_MISSING');
        END IF;
        role_ok := false;
        SELECT * INTO role_row FROM public.question_revision_exam_roles
          WHERE policy_version=p_policy_version AND revision_id=r.id;
        IF FOUND AND role_row.exam_role=item->>'examRole' THEN
          BEGIN
            PERFORM public.assert_tyt_social_exam_role_approval(p_policy_version,r.id);
            role_ok := true;
          EXCEPTION WHEN SQLSTATE 'P0002' OR SQLSTATE '23514' THEN role_ok := false;
          END;
        END IF;
        IF NOT role_ok THEN issues := array_append(issues,'ROLE_ACCEPTANCE_MISSING'); END IF;
      END IF;
    END IF;
    IF cardinality(issues)=0 THEN eligible_count := eligible_count+1; END IF;
    results := results || jsonb_build_array(item || jsonb_build_object(
      'eligible',cardinality(issues)=0,'issues',to_jsonb(issues)));
  END LOOP;
  WITH required(role) AS (VALUES ('common_history'),('common_geography'),
    ('common_philosophy'),('standard_religion'),('alternate_philosophy')),
  totals AS (SELECT role,(SELECT count(*)::integer FROM jsonb_array_elements(results) entry
    WHERE entry->>'examRole'=role AND (entry->>'eligible')::boolean) AS n FROM required)
  SELECT jsonb_object_agg(role,n),jsonb_object_agg(role,greatest(5-n,0)) INTO counts,deficits FROM totals;
  RETURN jsonb_build_object('version','tyt-social-reviewed-pool-preflight@1',
    'policyVersion',p_policy_version,'manifestSha256',encode(extensions.digest(manifest::text,'sha256'),'hex'),
    'candidateEvidenceOnly',true,'publicationAuthorized',false,'activationSupported',false,
    'databaseWrites',0,'selectedCount',jsonb_array_length(p_items),'eligibleCount',eligible_count,
    'poolEvidenceReady',eligible_count=jsonb_array_length(p_items)
      AND NOT EXISTS (SELECT 1 FROM jsonb_each_text(deficits) deficit WHERE deficit.value::integer>0),
    'roleCounts',counts,'roleDeficits',deficits,'items',results,
    'globalGateUnchanged',true);
END $fn$;

REVOKE ALL ON FUNCTION public.get_tyt_social_reviewed_pool_preflight(uuid,text,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_tyt_social_reviewed_pool_preflight(uuid,text,jsonb)
  TO authenticated,service_role;
COMMENT ON FUNCTION public.get_tyt_social_reviewed_pool_preflight(uuid,text,jsonb)
  IS 'AAL2 admin-only read-only subset assessment; existing authoritative helpers, no approvals, no release, no global gate relaxation.';
NOTIFY pgrst,'reload schema';
COMMIT;
