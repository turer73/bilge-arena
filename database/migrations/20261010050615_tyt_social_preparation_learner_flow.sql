-- Bounded preparation, not an official exam or whole-curriculum release.
-- No seed, question publication, role acceptance, or activation in migration.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE OR REPLACE FUNCTION public.tyt_social_preparation_variants_valid(p_policy text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT (SELECT count(*) FROM public.exam_candidate_policy_variants WHERE policy_version=p_policy)=2
 AND EXISTS(SELECT 1 FROM public.exam_candidate_policy_variants WHERE policy_version=p_policy
   AND variant_code='questions_16_20' AND question_range='[16,21)'::int4range
   AND allowed_roles=ARRAY['common_history','common_geography','common_philosophy','standard_religion'])
 AND EXISTS(SELECT 1 FROM public.exam_candidate_policy_variants WHERE policy_version=p_policy
   AND variant_code='questions_21_25' AND question_range='[21,26)'::int4range
   AND allowed_roles=ARRAY['common_history','common_geography','common_philosophy','alternate_philosophy'])
$$;

-- Official readers must never resolve a preparation policy by accident.
CREATE OR REPLACE FUNCTION public.resolve_current_tyt_social_candidate_policy()
RETURNS SETOF public.exam_candidate_policy_versions LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.exam_candidate_policy_versions p
 WHERE p.game='sosyal' AND p.display_exam_ref='TYT' AND p.status='released'
   AND p.rules->>'purpose' IS DISTINCT FROM 'reviewed_preparation'
   AND current_date>=p.valid_from AND (p.valid_until IS NULL OR current_date<p.valid_until);
 IF n>1 THEN RAISE EXCEPTION 'multiple active TYT Social candidate policies' USING ERRCODE='23514'; END IF;
 RETURN QUERY SELECT p.* FROM public.exam_candidate_policy_versions p
 WHERE p.game='sosyal' AND p.display_exam_ref='TYT' AND p.status='released'
   AND p.rules->>'purpose' IS DISTINCT FROM 'reviewed_preparation'
   AND current_date>=p.valid_from AND (p.valid_until IS NULL OR current_date<p.valid_until);
END $fn$;

CREATE OR REPLACE FUNCTION public.tg_exam_candidate_policy_version_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE pool_id uuid; gate jsonb;
BEGIN
 IF NEW.rules_sha256 IS DISTINCT FROM encode(extensions.digest(NEW.rules::text,'sha256'),'hex') THEN
  RAISE EXCEPTION 'candidate policy rules hash mismatch' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND OLD.status IN ('released','retired') THEN
  IF OLD.status='released' AND NEW.status='retired' AND (to_jsonb(NEW)-'status')=(to_jsonb(OLD)-'status') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'released or retired candidate policy is immutable except released-to-retired withdrawal' USING ERRCODE='55000';
 END IF;
 IF NEW.status='released' AND EXISTS(SELECT 1 FROM public.exam_candidate_policy_versions p
   WHERE p.policy_version<>NEW.policy_version AND p.game=NEW.game AND p.display_exam_ref=NEW.display_exam_ref AND p.status='released'
     AND (COALESCE(p.rules->>'purpose','')='reviewed_preparation')=(COALESCE(NEW.rules->>'purpose','')='reviewed_preparation')
     AND daterange(p.valid_from,p.valid_until,'[)')&&daterange(NEW.valid_from,NEW.valid_until,'[)')) THEN
  RAISE EXCEPTION 'candidate policy validity ranges overlap within purpose' USING ERRCODE='23P01'; END IF;
 IF NEW.status='released' AND NEW.rules->>'purpose'='reviewed_preparation' THEN
  IF TG_OP<>'UPDATE' OR OLD.status<>'validating' OR (to_jsonb(NEW)-ARRAY['status','released_at'])<>(to_jsonb(OLD)-ARRAY['status','released_at']) THEN
   RAISE EXCEPTION 'preparation release must preserve validated policy' USING ERRCODE='23514'; END IF;
  SELECT id INTO pool_id FROM public.tyt_social_reviewed_preparation_pools WHERE policy_version=NEW.policy_version;
  IF pool_id IS NULL OR NOT public.tyt_social_preparation_variants_valid(NEW.policy_version) THEN
   RAISE EXCEPTION 'reviewed preparation pool and exact variants required' USING ERRCODE='23514'; END IF;
  gate:=public.tyt_social_preparation_pool_integrity(pool_id);
  IF NOT COALESCE((gate->>'poolEvidenceReady')::boolean,false) THEN
   RAISE EXCEPTION 'preparation source year quality or roles unavailable' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $fn$;

ALTER TABLE public.tyt_social_policy_capabilities DROP CONSTRAINT IF EXISTS tyt_social_policy_capabilities_capability_check;
ALTER TABLE public.tyt_social_policy_capabilities ADD CONSTRAINT tyt_social_policy_capabilities_capability_check
 CHECK(capability IN ('snapshot_boundary_v1','mastery_reader_v1','official_section_composer_v1','reviewed_preparation_v1'));

-- Receipt binds the actual executable boundary, not a manually asserted ready flag.
CREATE OR REPLACE FUNCTION public.tyt_social_preparation_boundary_sha256()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE signature text; oid_value oid; parts jsonb:='[]';
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'public.compose_and_issue_tyt_social_preparation(uuid,text,uuid)',
  'public.get_tyt_social_preparation_context(uuid)',
  'public.tyt_social_preparation_variants_valid(text)',
  'public.tyt_social_preparation_pool_integrity(uuid)',
  'public.tyt_social_preparation_policy_valid(text,integer)',
  'public.assert_tyt_social_exam_role_approval(text,uuid)',
  'public.issue_verified_tyt_social_attempt_with_event(uuid,text,uuid[],integer,uuid,text,uuid,text,uuid)',
  'public.assert_tyt_social_attempt_snapshot_integrity(uuid)',
  'public.verified_attempt_private_snapshot(uuid)',
  'public.tg_exam_candidate_policy_version_guard()',
  'public.resolve_current_tyt_social_candidate_policy()'
 ] LOOP
  oid_value:=to_regprocedure(signature);
  IF oid_value IS NULL OR has_function_privilege('anon',oid_value,'EXECUTE') OR has_function_privilege('authenticated',oid_value,'EXECUTE') THEN RETURN NULL; END IF;
  parts:=parts||jsonb_build_array(jsonb_build_object('signature',signature,'definition',pg_get_functiondef(oid_value),
    'acl',(SELECT proacl::text FROM pg_proc WHERE oid=oid_value)));
 END LOOP;
 RETURN encode(extensions.digest(parts::text,'sha256'),'hex');
END $$;

CREATE OR REPLACE FUNCTION public.release_tyt_social_preparation_pool(
 p_actor_user_id uuid,p_pool_id uuid,p_manifest_sha256 text,p_rationale text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE pool public.tyt_social_reviewed_preparation_pools%ROWTYPE; gate jsonb; proof text;
 old public.content_governance_requests%ROWTYPE; h text; result jsonb;
BEGIN
 IF NOT COALESCE(public.question_outcome_mapping_actor_has_aal2(p_actor_user_id),false)
   OR NOT COALESCE(public.content_governance_has_permission(p_actor_user_id,'content.publish'),false) THEN
  RAISE EXCEPTION 'AAL2 publisher required' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR length(btrim(COALESCE(p_rationale,''))) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'release rationale required' USING ERRCODE='22023'; END IF;
 PERFORM public.content_governance_lock_request(p_actor_user_id,'release_tyt_social_preparation',p_request_id);
 h:=public.content_governance_hash(jsonb_build_object('poolId',p_pool_id,'manifestSha256',p_manifest_sha256,'rationale',btrim(p_rationale)));
 SELECT * INTO old FROM public.content_governance_requests WHERE user_id=p_actor_user_id AND operation='release_tyt_social_preparation' AND request_id=p_request_id;
 IF FOUND THEN IF old.payload_hash<>h THEN RAISE EXCEPTION 'preparation release replay differs' USING ERRCODE='22023'; END IF; RETURN old.result||jsonb_build_object('replayed',true); END IF;
 SELECT * INTO pool FROM public.tyt_social_reviewed_preparation_pools WHERE id=p_pool_id FOR UPDATE;
 IF NOT FOUND OR pool.prepared_by IS DISTINCT FROM p_actor_user_id OR pool.manifest_sha256 IS DISTINCT FROM p_manifest_sha256 THEN RAISE EXCEPTION 'own exact pool required' USING ERRCODE='22023'; END IF;
 LOCK TABLE public.questions,public.question_content_revisions,public.question_validation_runtime,public.question_validation_decisions,
  public.question_revision_sources,public.question_revision_source_reviews,public.curriculum_canonical_exam_scopes,
  public.question_revision_outcomes,public.curriculum_outcomes,public.curriculum_nodes IN SHARE MODE;
 gate:=public.tyt_social_preparation_pool_integrity(pool.id);proof:=public.tyt_social_preparation_boundary_sha256();
 IF NOT COALESCE((gate->>'poolEvidenceReady')::boolean,false) OR proof IS NULL OR NOT public.tyt_social_preparation_variants_valid(pool.policy_version) THEN
  RAISE EXCEPTION 'preparation evidence or executable boundary unavailable' USING ERRCODE='55000'; END IF;
 UPDATE public.exam_candidate_policy_versions SET status='released',released_at=clock_timestamp()
 WHERE policy_version=pool.policy_version AND status='validating';
 IF NOT FOUND THEN RAISE EXCEPTION 'validating preparation policy required' USING ERRCODE='55000'; END IF;
 INSERT INTO public.tyt_social_policy_capabilities(policy_version,capability,capability_version,manifest_sha256,evidence)
 VALUES(pool.policy_version,'reviewed_preparation_v1',1,proof,jsonb_build_object('poolId',pool.id,'manifestSha256',pool.manifest_sha256,
   'evidenceFingerprint',gate->>'evidenceFingerprint','actorUserId',p_actor_user_id,'purpose','reviewed_preparation',
   'independentHumanReview',false,'officialExamCertification',false,'wholeCurriculumMeasurement',false));
 result:=jsonb_build_object('poolId',pool.id,'policyVersion',pool.policy_version,'manifestSha256',pool.manifest_sha256,
  'candidateQuestionCount',20,'bookletQuestionCount',25,'preparationReleased',true,'officialScopeReleased',false,'replayed',false);
 INSERT INTO public.content_governance_requests VALUES(p_actor_user_id,'release_tyt_social_preparation',p_request_id,h,result,clock_timestamp());
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.get_tyt_social_preparation_context(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE pool public.tyt_social_reviewed_preparation_pools%ROWTYPE; gate jsonb; n integer; variant text; proof text; resume jsonb;
BEGIN
 IF p_user_id IS NULL OR (auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id) THEN RAISE EXCEPTION 'actor mismatch' USING ERRCODE='42501'; END IF;
 SELECT count(*) INTO n FROM public.tyt_social_reviewed_preparation_pools x JOIN public.exam_candidate_policy_versions p ON p.policy_version=x.policy_version
 WHERE p.status='released' AND p.rules->>'purpose'='reviewed_preparation' AND current_date>=p.valid_from AND (p.valid_until IS NULL OR current_date<p.valid_until);
 IF n<>1 THEN RETURN jsonb_build_object('available',false); END IF;
 SELECT x.* INTO pool FROM public.tyt_social_reviewed_preparation_pools x JOIN public.exam_candidate_policy_versions p ON p.policy_version=x.policy_version
 WHERE p.status='released' AND p.rules->>'purpose'='reviewed_preparation' AND current_date>=p.valid_from AND (p.valid_until IS NULL OR current_date<p.valid_until);
 gate:=public.tyt_social_preparation_pool_integrity(pool.id);proof:=public.tyt_social_preparation_boundary_sha256();
 IF NOT COALESCE((gate->>'poolEvidenceReady')::boolean,false) OR proof IS NULL OR NOT public.tyt_social_preparation_variants_valid(pool.policy_version)
  OR NOT EXISTS(SELECT 1 FROM public.tyt_social_policy_capabilities c WHERE c.policy_version=pool.policy_version
   AND c.capability='reviewed_preparation_v1' AND c.capability_version=1 AND c.manifest_sha256=proof
   AND c.evidence->>'poolId'=pool.id::text AND c.evidence->>'manifestSha256'=pool.manifest_sha256
   AND c.evidence->>'evidenceFingerprint'=gate->>'evidenceFingerprint') THEN RETURN jsonb_build_object('available',false); END IF;
 SELECT variant_code INTO variant FROM public.candidate_exam_policy_events WHERE user_id=p_user_id AND policy_version=pool.policy_version
  AND effective_at<=clock_timestamp() ORDER BY effective_at DESC,id DESC LIMIT 1;
 SELECT jsonb_build_object('requestId',h.issue_request_id,'variant',h.variant_code) INTO resume
 FROM public.verified_attempt_candidate_policy_snapshots h JOIN public.verified_attempts a ON a.id=h.attempt_id
 WHERE h.user_id=p_user_id AND h.policy_version=pool.policy_version AND h.artifact_kind='practice'
   AND a.completed_at IS NULL AND a.expires_at>clock_timestamp()
 ORDER BY a.started_at DESC LIMIT 1;
 RETURN jsonb_build_object('available',true,'policyVersion',pool.policy_version,'examYear',pool.exam_year,'variant',variant,'resume',resume,
  'candidateQuestionCount',20,'bookletQuestionCount',25,'officialExamCertification',false,'wholeCurriculumMeasurement',false);
END $$;

CREATE OR REPLACE FUNCTION public.compose_and_issue_tyt_social_preparation(p_user_id uuid,p_variant text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE context jsonb; pool public.tyt_social_reviewed_preparation_pools%ROWTYPE; header public.verified_attempt_candidate_policy_snapshots%ROWTYPE;
 attempt public.verified_attempts%ROWTYPE; event public.candidate_exam_policy_events%ROWTYPE; previous_id uuid;
 latest_at timestamptz; recent integer; now_at timestamptz; selected uuid[]; i jsonb; result jsonb;
BEGIN
 IF p_user_id IS NULL OR p_request_id IS NULL OR p_variant IS NULL OR p_variant NOT IN ('questions_16_20','questions_21_25')
   OR (auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id) THEN RAISE EXCEPTION 'invalid preparation actor or selection' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('tyt-social-attempt:'||p_user_id::text||':'||p_request_id::text,206));
 SELECT * INTO header FROM public.verified_attempt_candidate_policy_snapshots WHERE user_id=p_user_id AND issue_request_id=p_request_id;
 IF FOUND THEN
  SELECT * INTO attempt FROM public.verified_attempts WHERE id=header.attempt_id;
  SELECT * INTO pool FROM public.tyt_social_reviewed_preparation_pools WHERE policy_version=header.policy_version;
  IF pool.id IS NULL OR header.artifact_kind<>'practice' OR header.variant_code<>p_variant OR header.source_plan_id IS NOT NULL
    OR attempt.mode<>'practice' OR attempt.game<>'sosyal' OR attempt.user_id IS DISTINCT FROM p_user_id OR cardinality(attempt.question_ids)<>20
    OR attempt.duration_sec<>7200 THEN RAISE EXCEPTION 'preparation replay payload differs' USING ERRCODE='22023'; END IF;
  -- Replay preserves issued content even after a later choice, quarantine or withdrawal.
  result:=public.issue_verified_tyt_social_attempt_with_event(p_user_id,'practice',attempt.question_ids,7200,p_request_id,'practice',NULL,header.policy_version,header.selection_event_id);
  RETURN result||jsonb_build_object('composerVersion','tyt-social-preparation-v1','examYear',pool.exam_year);
 END IF;
 context:=public.get_tyt_social_preparation_context(p_user_id);
 IF NOT COALESCE((context->>'available')::boolean,false) THEN RAISE EXCEPTION 'reviewed preparation unavailable' USING ERRCODE='55000'; END IF;
 SELECT * INTO pool FROM public.tyt_social_reviewed_preparation_pools WHERE policy_version=context->>'policyVersion' FOR SHARE;
 PERFORM 1 FROM public.exam_candidate_policy_versions WHERE policy_version=pool.policy_version AND status='released' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'reviewed preparation unavailable' USING ERRCODE='55000'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('tyt-social-policy:'||p_user_id::text||':'||pool.policy_version,205));
 -- Hold the same authorities checked by the pool gate until all snapshots exist.
 LOCK TABLE public.question_validation_runtime,public.question_validation_decisions,public.question_revision_sources,
   public.question_revision_source_reviews,public.curriculum_canonical_exam_scopes,public.question_revision_outcomes,
   public.curriculum_outcomes,public.curriculum_nodes IN SHARE MODE;
 FOR i IN SELECT value FROM jsonb_array_elements(pool.pins) ORDER BY value->>'questionId' LOOP
  PERFORM 1 FROM public.questions WHERE id=(i->>'questionId')::uuid FOR SHARE;
  PERFORM 1 FROM public.question_content_revisions WHERE id=(i->>'revisionId')::uuid FOR SHARE;
 END LOOP;
 context:=public.get_tyt_social_preparation_context(p_user_id);
 IF NOT COALESCE((context->>'available')::boolean,false) OR context->>'policyVersion' IS DISTINCT FROM pool.policy_version THEN RAISE EXCEPTION 'reviewed preparation changed' USING ERRCODE='55000'; END IF;
 now_at:=clock_timestamp();
 SELECT * INTO event FROM public.candidate_exam_policy_events WHERE user_id=p_user_id AND policy_version=pool.policy_version
  ORDER BY effective_at DESC,id DESC LIMIT 1;
 IF event.id IS NULL OR event.variant_code<>p_variant THEN
  previous_id:=event.id;latest_at:=event.effective_at;
  SELECT count(*) INTO recent FROM public.candidate_exam_policy_events WHERE user_id=p_user_id AND policy_version=pool.policy_version AND recorded_at>=now_at-interval '24 hours';
  IF recent>=6 OR latest_at>now_at-interval '15 seconds' THEN RAISE EXCEPTION 'preparation selection rate limited' USING ERRCODE='55000'; END IF;
  INSERT INTO public.candidate_exam_policy_events(user_id,policy_version,variant_code,notice_version,request_id,supersedes_event_id,effective_at,recorded_at)
   VALUES(p_user_id,pool.policy_version,p_variant,'tyt-social-choice-notice-v1',p_request_id,previous_id,now_at,now_at) RETURNING * INTO event;
 END IF;
 SELECT array_agg((pin->>'questionId')::uuid ORDER BY CASE pin->>'examRole'
   WHEN 'common_history' THEN 1 WHEN 'common_geography' THEN 2 WHEN 'common_philosophy' THEN 3 ELSE 4 END,
   md5(p_request_id::text||':'||(pin->>'questionId')),(pin->>'questionId')) INTO selected
 FROM jsonb_array_elements(pool.pins) pin
 WHERE pin->>'examRole'=ANY(ARRAY['common_history','common_geography','common_philosophy',
   CASE p_variant WHEN 'questions_16_20' THEN 'standard_religion' ELSE 'alternate_philosophy' END]);
 IF cardinality(selected)<>20 THEN RAISE EXCEPTION 'exact preparation composition required' USING ERRCODE='23514'; END IF;
 result:=public.issue_verified_tyt_social_attempt_with_event(p_user_id,'practice',selected,7200,p_request_id,'practice',NULL,pool.policy_version,event.id);
 RETURN result||jsonb_build_object('composerVersion','tyt-social-preparation-v1','examYear',pool.exam_year);
END $$;

REVOKE ALL ON FUNCTION public.tyt_social_preparation_variants_valid(text),public.resolve_current_tyt_social_candidate_policy(),
 public.tg_exam_candidate_policy_version_guard(),public.tyt_social_preparation_boundary_sha256(),
 public.release_tyt_social_preparation_pool(uuid,uuid,text,text,uuid),public.get_tyt_social_preparation_context(uuid),
 public.compose_and_issue_tyt_social_preparation(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.release_tyt_social_preparation_pool(uuid,uuid,text,text,uuid),
 public.get_tyt_social_preparation_context(uuid),public.compose_and_issue_tyt_social_preparation(uuid,text,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
