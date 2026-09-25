-- Supabase CLI scaffold: 20260906180531_tyt_social_learning_selection_epoch.
-- Local draft approved 2026-09-06; production execution is NOT authorized.

BEGIN;

-- Private resolver: one trusted cutoff, not a client-selected timestamp.
CREATE FUNCTION public.tyt_social_learning_context_at(p_user_id uuid,p_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
DECLARE
  v_policy public.exam_candidate_policy_versions%ROWTYPE;
  v_event public.candidate_exam_policy_events%ROWTYPE;
  v_variant public.exam_candidate_policy_variants%ROWTYPE;
  v_count integer;
  v_released boolean := false;
  v_categories jsonb := '[]'::jsonb;
  v_available boolean;
BEGIN
  IF p_user_id IS NULL OR p_at IS NULL THEN
    RAISE EXCEPTION 'TYT Social learning subject required' USING ERRCODE='22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'TYT Social learning actor mismatch' USING ERRCODE='42501';
  END IF;
  SELECT count(*) INTO v_count FROM public.exam_candidate_policy_versions AS policy
  WHERE policy.game='sosyal' AND policy.display_exam_ref='TYT' AND policy.question_exam_ref='TYT'
    AND policy.status='released' AND p_at::date>=policy.valid_from
    AND (policy.valid_until IS NULL OR p_at::date<policy.valid_until);
  IF v_count>1 THEN
    RAISE EXCEPTION 'multiple active TYT Social candidate policies' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_policy FROM public.exam_candidate_policy_versions AS policy
  WHERE policy.game='sosyal' AND policy.display_exam_ref='TYT' AND policy.question_exam_ref='TYT'
    AND policy.status='released' AND p_at::date>=policy.valid_from
    AND (policy.valid_until IS NULL OR p_at::date<policy.valid_until);
  IF FOUND THEN
    SELECT EXISTS (SELECT 1 FROM public.curriculum_scope_releases AS scope
      WHERE scope.game='sosyal' AND scope.display_exam_ref='TYT' AND scope.question_exam_ref='TYT'
        AND scope.taxonomy_version=v_policy.taxonomy_version AND scope.release_status='released'
        AND NOT scope.diagnostic_enabled) INTO v_released;
    SELECT * INTO v_event FROM public.candidate_exam_policy_events AS event_row
    WHERE event_row.user_id=p_user_id AND event_row.policy_version=v_policy.policy_version
      AND event_row.effective_at<=p_at
    ORDER BY event_row.effective_at DESC,event_row.id DESC LIMIT 1;
    IF FOUND THEN
      SELECT * INTO STRICT v_variant FROM public.exam_candidate_policy_variants
      WHERE policy_version=v_event.policy_version AND variant_code=v_event.variant_code;
      SELECT COALESCE(jsonb_agg(c.category ORDER BY c.category),'[]'::jsonb) INTO v_categories
      FROM (VALUES ('tarih'),('cografya'),('felsefe'),('sosyoloji'),('din_kulturu')) AS c(category)
      WHERE EXISTS (SELECT 1 FROM unnest(v_variant.allowed_roles) AS r(role)
        WHERE public.tyt_social_exam_role_compatible(c.category,r.role));
    END IF;
  END IF;
  v_available:=v_policy.policy_version IS NOT NULL AND v_event.id IS NOT NULL AND v_released;
  RETURN jsonb_build_object(
    'status',CASE WHEN v_available THEN 'active' WHEN v_event.id IS NULL THEN 'setup_required' ELSE 'unavailable' END,
    'available',v_available,
    'reason',CASE WHEN v_policy.policy_version IS NULL THEN 'released-policy-missing'
      WHEN v_event.id IS NULL THEN 'selection-required' WHEN NOT v_released THEN 'mastery-scope-not-released' ELSE NULL END,
    'policyVersion',v_policy.policy_version,'taxonomyVersion',v_policy.taxonomy_version,
    'variant',v_event.variant_code,'selectionEventId',v_event.id,'selectionEffectiveAt',v_event.effective_at,
    'allowedCategories',v_categories,'rebuildRequired',NOT v_released,'legacyAggregateUsed',false);
END
$fn$;

CREATE FUNCTION public.read_tyt_social_learning_snapshot(p_user_id uuid,p_question_ids uuid[] DEFAULT '{}'::uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
DECLARE
  v_context jsonb;
  v_states jsonb := '[]'::jsonb;
  v_allowed jsonb := '[]'::jsonb;
  v_at timestamptz := statement_timestamp();
BEGIN
  IF p_user_id IS NULL OR p_question_ids IS NULL OR cardinality(p_question_ids)>1000
    OR EXISTS (SELECT 1 FROM unnest(p_question_ids) AS q(id) WHERE q.id IS NULL) THEN
    RAISE EXCEPTION 'invalid TYT Social learning snapshot input' USING ERRCODE='22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'TYT Social learning actor mismatch' USING ERRCODE='42501';
  END IF;
  v_context:=public.tyt_social_learning_context_at(p_user_id,v_at);
  IF NOT COALESCE((v_context->>'available')::boolean,false) THEN
    RETURN jsonb_build_object('context',v_context,'states',v_states,'allowedQuestionIds',v_allowed);
  END IF;
  -- Same MVCC snapshot and bound event for context, evidence and candidates.
  -- Do not compose the independently resolving legacy readers.
  WITH eligible AS (
    SELECT evidence.* FROM public.mastery_outcome_evidence AS evidence
    JOIN public.curriculum_outcomes AS outcome
      ON outcome.id=evidence.outcome_id AND outcome.is_active AND outcome.game='sosyal'
      AND upper(btrim(COALESCE(outcome.exam_ref,'')))='TYT'
      AND outcome.taxonomy_version=v_context->>'taxonomyVersion'
    JOIN public.verified_attempts AS attempt
      ON attempt.id=evidence.attempt_id AND attempt.user_id=evidence.user_id AND attempt.game='sosyal'
      AND attempt.completed_at IS NOT NULL AND attempt.completed_at=evidence.verified_completed_at
      AND attempt.session_id=evidence.session_id AND evidence.question_id=ANY(attempt.question_ids)
    JOIN public.mastery_materialized_attempts AS marker ON marker.attempt_id=attempt.id
    JOIN public.session_answers AS answer
      ON answer.id=evidence.answer_id AND answer.user_id=evidence.user_id
      AND answer.session_id=evidence.session_id AND answer.question_id=evidence.question_id
      AND NOT COALESCE(answer.is_skipped,false)
    JOIN public.verified_attempt_candidate_policy_snapshots AS header
      ON header.attempt_id=evidence.attempt_id AND header.user_id=evidence.user_id
      AND header.policy_version=v_context->>'policyVersion' AND header.variant_code=v_context->>'variant'
      AND header.selection_event_id=(v_context->>'selectionEventId')::uuid
      AND header.selection_effective_at<=attempt.started_at
    JOIN public.candidate_exam_policy_events AS event_row
      ON event_row.id=header.selection_event_id AND event_row.user_id=header.user_id
      AND event_row.policy_version=header.policy_version AND event_row.variant_code=header.variant_code
      AND event_row.effective_at=header.selection_effective_at
    JOIN public.exam_candidate_policy_variants AS variant
      ON variant.policy_version=header.policy_version AND variant.variant_code=header.variant_code
    LEFT JOIN public.daily_plan_candidate_policy_snapshots AS plan_header
      ON header.artifact_kind='daily_plan' AND plan_header.plan_id=header.source_plan_id
      AND plan_header.user_id=header.user_id AND plan_header.policy_version=header.policy_version
      AND plan_header.variant_code=header.variant_code AND plan_header.selection_event_id=header.selection_event_id
    JOIN public.verified_attempt_question_exam_role_snapshots AS item
      ON item.attempt_id=evidence.attempt_id AND item.policy_version=header.policy_version
      AND item.question_id=evidence.question_id AND item.gradeable AND item.exam_role=ANY(variant.allowed_roles)
    LEFT JOIN public.daily_plan_question_exam_role_snapshots AS plan_item
      ON plan_item.plan_id=plan_header.plan_id AND plan_item.policy_version=plan_header.policy_version
      AND plan_item.question_id=item.question_id AND plan_item.revision_id=item.revision_id AND plan_item.exam_role=item.exam_role
    JOIN public.verified_attempt_question_revisions AS revision_snapshot
      ON revision_snapshot.attempt_id=item.attempt_id AND revision_snapshot.position=item.position
      AND revision_snapshot.question_id=item.question_id AND revision_snapshot.revision_id=item.revision_id
      AND revision_snapshot.revision_id=answer.question_revision_id AND revision_snapshot.game='sosyal'
      AND upper(btrim(COALESCE(revision_snapshot.exam_ref,'')))='TYT'
      AND revision_snapshot.category IS NOT DISTINCT FROM outcome.category
    WHERE evidence.user_id=p_user_id
      AND public.tyt_social_exam_role_compatible(revision_snapshot.category,item.exam_role)
      AND (header.artifact_kind<>'daily_plan' OR (plan_header.plan_id IS NOT NULL AND plan_item.question_id IS NOT NULL))
      AND header.question_set_sha256=encode(extensions.digest(array_to_string(attempt.question_ids,','),'sha256'),'hex')
  ), aggregated AS (
    SELECT evidence.outcome_id,count(*)::integer AS attempts,
      count(*) FILTER (WHERE evidence.is_correct)::integer AS correct_attempts,
      COALESCE(sum(CASE WHEN evidence.is_correct THEN evidence.mapping_weight ELSE 0 END),0)::numeric AS weighted_earned,
      COALESCE(sum(evidence.mapping_weight),0)::numeric AS weighted_possible,
      count(*) FILTER (WHERE evidence.delayed_correct)::integer AS delayed_correct,count(*)::integer AS v2_attempts,
      COALESCE(sum(evidence.difficulty_weighted_earned),0)::numeric AS difficulty_weighted_earned,
      COALESCE(sum(evidence.difficulty_weighted_possible),0)::numeric AS difficulty_weighted_possible,
      count(*) FILTER (WHERE evidence.time_taken_sec IS NOT NULL)::integer AS timed_attempts,
      COALESCE(sum(evidence.time_taken_sec),0)::numeric AS total_time_sec,
      count(*) FILTER (WHERE evidence.fast_wrong)::integer AS fast_wrong,
      count(*) FILTER (WHERE evidence.max_hint_stage>0)::integer AS hinted_attempts,
      COALESCE(sum(evidence.max_hint_stage),0)::integer AS hint_stage_sum,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.review_logs AS review_log
        JOIN public.review_error_annotations AS annotation ON annotation.review_log_id=review_log.id
        WHERE review_log.answer_id=evidence.answer_id AND annotation.reason_code='guess'))::integer AS guess_annotations,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.review_logs AS review_log
        JOIN public.review_error_annotations AS annotation ON annotation.review_log_id=review_log.id
        WHERE review_log.answer_id=evidence.answer_id AND annotation.reason_code='careless'))::integer AS careless_annotations,
      count(DISTINCT evidence.evidence_day_tr)::integer AS verified_evidence_days,
      max(evidence.verified_completed_at) AS last_answered_at
    FROM eligible AS evidence GROUP BY evidence.outcome_id
  ) SELECT COALESCE(jsonb_agg(to_jsonb(aggregated) ORDER BY aggregated.outcome_id),'[]'::jsonb)
    INTO v_states FROM aggregated;
  WITH requested AS (
    SELECT input.id,min(input.position) AS position
    FROM unnest(p_question_ids) WITH ORDINALITY AS input(id,position) GROUP BY input.id
  ) SELECT COALESCE(jsonb_agg(requested.id ORDER BY requested.position),'[]'::jsonb)
    INTO v_allowed FROM requested
    JOIN public.questions AS question ON question.id=requested.id
    JOIN public.question_content_revisions AS revision
      ON revision.id=question.published_revision_id AND revision.question_id=question.id
    JOIN public.question_revision_exam_roles AS role
      ON role.revision_id=revision.id AND role.policy_version=v_context->>'policyVersion'
    JOIN public.exam_candidate_policy_variants AS variant
      ON variant.policy_version=role.policy_version AND variant.variant_code=v_context->>'variant'
    WHERE question.is_active AND question.game='sosyal'
      AND upper(btrim(COALESCE(question.exam_ref,'')))='TYT' AND revision.status='published'
      AND role.exam_role=ANY(variant.allowed_roles);
  RETURN jsonb_build_object('context',v_context,'states',v_states,'allowedQuestionIds',v_allowed);
END
$fn$;

-- Private guard: callers acquire the request lock first, and smart mocks
-- acquire the exam lock before that. Daily plans use policy then plan-date.
CREATE FUNCTION public.assert_tyt_social_learning_epoch(p_user_id uuid,p_policy_version text,p_selection_event_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
DECLARE v_context jsonb;
BEGIN
  IF p_user_id IS NULL OR p_policy_version IS NULL OR p_selection_event_id IS NULL THEN
    RAISE EXCEPTION 'TYT Social learning epoch required' USING ERRCODE='22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'TYT Social learning actor mismatch' USING ERRCODE='42501';
  END IF;
  -- REPEATABLE READ cannot see an event committed during a lock wait.
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'TYT Social epoch writes require read committed' USING ERRCODE='25000';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('tyt-social-policy:'||p_user_id::text||':'||p_policy_version,205));
  SELECT public.tyt_social_learning_context_at(p_user_id,clock_timestamp()) INTO v_context;
  IF NOT COALESCE((v_context->>'available')::boolean,false)
    OR v_context->>'policyVersion' IS DISTINCT FROM p_policy_version
    OR (v_context->>'selectionEventId')::uuid IS DISTINCT FROM p_selection_event_id THEN
    RAISE EXCEPTION 'TYT Social selection epoch changed' USING ERRCODE='40001';
  END IF;
END
$fn$;

CREATE FUNCTION public.create_tyt_social_daily_plan_for_epoch(
  p_user_id uuid,p_plan_date date,p_items jsonb,p_expected_policy_version text,p_expected_selection_event_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
DECLARE v_result jsonb; v_plan_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'TYT Social learning actor mismatch' USING ERRCODE='42501';
  END IF;
  PERFORM public.assert_tyt_social_learning_epoch(p_user_id,p_expected_policy_version,p_expected_selection_event_id);
  v_result:=public.create_tyt_social_daily_plan_v2(p_user_id,p_plan_date,p_items);
  SELECT plan.id INTO v_plan_id FROM public.daily_plan AS plan
    WHERE plan.user_id=p_user_id AND plan.plan_date=p_plan_date AND plan.game='sosyal' AND plan.exam_ref='TYT';
  IF NOT EXISTS (SELECT 1 FROM public.daily_plan_candidate_policy_snapshots AS header
    WHERE header.plan_id=v_plan_id AND header.user_id=p_user_id
      AND header.policy_version=p_expected_policy_version AND header.selection_event_id=p_expected_selection_event_id) THEN
    RAISE EXCEPTION 'TYT Social selection epoch changed' USING ERRCODE='40001';
  END IF;
  PERFORM public.assert_tyt_social_learning_epoch(p_user_id,p_expected_policy_version,p_expected_selection_event_id);
  RETURN v_result;
EXCEPTION WHEN object_not_in_prerequisite_state THEN
  IF SQLERRM='existing TYT Social plan is stale for the current answering variant'
    OR SQLERRM='TYT Social policy selection is stale' THEN
    RAISE EXCEPTION 'TYT Social selection epoch changed' USING ERRCODE='40001';
  END IF;
  RAISE;
END
$fn$;

CREATE FUNCTION public.issue_verified_tyt_social_attempt_for_epoch(
  p_user_id uuid,p_mode text,p_question_ids uuid[],p_duration_sec integer,p_request_id uuid,
  p_expected_policy_version text,p_expected_selection_event_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'TYT Social learning actor mismatch' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'TYT Social request required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('tyt-social-attempt:'||p_user_id::text||':'||p_request_id::text,206));
  PERFORM public.assert_tyt_social_learning_epoch(p_user_id,p_expected_policy_version,p_expected_selection_event_id);
  v_result:=public.issue_verified_tyt_social_attempt(p_user_id,p_mode,p_question_ids,p_duration_sec,p_request_id);
  IF NOT EXISTS (SELECT 1 FROM public.verified_attempt_candidate_policy_snapshots AS header
    WHERE header.attempt_id=(v_result->>'attemptId')::uuid AND header.user_id=p_user_id
      AND header.policy_version=p_expected_policy_version AND header.selection_event_id=p_expected_selection_event_id) THEN
    RAISE EXCEPTION 'TYT Social selection epoch changed' USING ERRCODE='40001';
  END IF;
  PERFORM public.assert_tyt_social_learning_epoch(p_user_id,p_expected_policy_version,p_expected_selection_event_id);
  RETURN v_result;
EXCEPTION WHEN object_not_in_prerequisite_state THEN
  IF SQLERRM='TYT Social policy selection is stale' THEN
    RAISE EXCEPTION 'TYT Social selection epoch changed' USING ERRCODE='40001';
  END IF;
  RAISE;
END
$fn$;

CREATE FUNCTION public.issue_verified_tyt_social_exam_attempt_for_epoch(
  p_user_id uuid,p_blueprint_version text,p_items jsonb,p_duration_sec integer,p_planned_duration_sec integer,p_request_id uuid,
  p_expected_policy_version text,p_expected_selection_event_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'TYT Social learning actor mismatch' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'TYT Social request required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text||':sosyal:TYT',100));
  PERFORM pg_advisory_xact_lock(hashtextextended('tyt-social-attempt:'||p_user_id::text||':'||p_request_id::text,206));
  PERFORM public.assert_tyt_social_learning_epoch(p_user_id,p_expected_policy_version,p_expected_selection_event_id);
  v_result:=public.issue_verified_tyt_social_exam_attempt(p_user_id,p_blueprint_version,p_items,p_duration_sec,p_planned_duration_sec,p_request_id);
  IF NOT EXISTS (SELECT 1 FROM public.verified_attempt_candidate_policy_snapshots AS header
    WHERE header.attempt_id=(v_result->>'attemptId')::uuid AND header.user_id=p_user_id
      AND header.policy_version=p_expected_policy_version AND header.selection_event_id=p_expected_selection_event_id) THEN
    RAISE EXCEPTION 'TYT Social selection epoch changed' USING ERRCODE='40001';
  END IF;
  PERFORM public.assert_tyt_social_learning_epoch(p_user_id,p_expected_policy_version,p_expected_selection_event_id);
  RETURN v_result;
EXCEPTION WHEN object_not_in_prerequisite_state THEN
  IF SQLERRM='TYT Social policy selection is stale' THEN
    RAISE EXCEPTION 'TYT Social selection epoch changed' USING ERRCODE='40001';
  END IF;
  RAISE;
END
$fn$;

-- Legacy definitions/grants/manifests and immutable source-plan replay stay
-- unchanged. Only four new service entry points are exposed.
REVOKE ALL ON FUNCTION public.tyt_social_learning_context_at(uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.assert_tyt_social_learning_epoch(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.read_tyt_social_learning_snapshot(uuid,uuid[]) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.create_tyt_social_daily_plan_for_epoch(uuid,date,jsonb,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.issue_verified_tyt_social_attempt_for_epoch(uuid,text,uuid[],integer,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.issue_verified_tyt_social_exam_attempt_for_epoch(uuid,text,jsonb,integer,integer,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_tyt_social_learning_snapshot(uuid,uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_tyt_social_daily_plan_for_epoch(uuid,date,jsonb,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_verified_tyt_social_attempt_for_epoch(uuid,text,uuid[],integer,uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_verified_tyt_social_exam_attempt_for_epoch(uuid,text,jsonb,integer,integer,uuid,text,uuid) TO service_role;

COMMIT;
