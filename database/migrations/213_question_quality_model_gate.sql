-- Migration 213: the model term can no longer be the reason for an automatic
-- quarantine, confirmation or rejection (community-quality@2).
--
-- Migration 212 records the posterior computed from human and external-proof
-- evidence alone. This migration uses it as a gate: an automatic action is
-- taken only when its threshold holds both with and without the model term.
-- The model keeps a protective role (a model verdict pointing the other way
-- still withholds the action and sends the case to human review), but it can
-- never carry a case across a threshold by itself.
--
--   quarantine  requires LEAST(posterior, posterior_without_model) >= 0.98
--   confirmed   requires LEAST(posterior, posterior_without_model) >= 0.995
--               plus the existing external-proof condition
--   rejected    requires GREATEST(posterior, posterior_without_model) <= 0.02
--
-- The human floors (5 users, 5 clusters, 3 trusted) and every threshold are
-- unchanged. A withheld quarantine or confirmation lands in 'suspected'; a
-- withheld rejection stays in 'collecting' (or 'inconclusive' at 11 users).
--
-- The gate never reverses an action already taken under community-quality@1.
-- A case that is already quarantined or confirmed keeps that state when the
-- gate alone would lower it; the snapshot marks it
-- modelGate='retained_existing_action' so reviewers can find the historical
-- quarantines the model term carried. Lifting them stays a human decision.
-- Without this, record_question_quality_consensus would raise its
-- "cannot regress automatically" error, and the worker calls it outside a
-- try/catch after every verification job.
--
-- Policy version. This is a decision-rule change, so decisions are recorded
-- under community-quality@2 and every snapshot carries policyVersion,
-- ungatedDecision and modelGate. The @2 decisions are a new dedup namespace
-- (UNIQUE(case_id,policy_version,inputs_sha256)), so these fields are part of
-- the hashed snapshot. Rewards and quarantines are unaffected by the new
-- namespace: rewards dedup on (source_type,source_id,reward_type,reward_key)
-- and quarantine only fires from a non-quarantined state.
--
-- Rollout. Migration-first stays safe: record_question_quality_consensus still
-- accepts 'community-quality@1' from a not-yet-redeployed worker, but it always
-- stores and reports the version it actually applied ('community-quality@2').
-- The request payload hash keeps the caller's version, since it identifies the
-- request, not the rule.

BEGIN;

CREATE OR REPLACE FUNCTION public.compute_question_quality_consensus(p_case_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE
  quality_case public.question_quality_cases%ROWTYPE;
  domain_name text;
  independent_users integer:=0;
  independent_clusters integer:=0;
  leading_reason text;
  leading_fingerprint text;
  leading_total integer:=0;
  leading_clusters integer:=0;
  trusted_flaw integer:=0;
  trusted_clean integer:=0;
  human_llr numeric:=0;
  model_llr numeric:=0;
  proof_llr numeric:=0;
  posterior numeric;
posterior_without_model numeric;
  flaw_floor boolean;
  clean_floor boolean;
  ungated_decision text:='collecting';
  model_gate text;
  proof_kind text:='none';
  proof_direction text:='inconclusive';
  computed_decision text:='collecting';
  snapshot jsonb;
  inputs_sha text;
BEGIN
  SELECT * INTO quality_case FROM public.question_quality_cases WHERE id=p_case_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'quality case not found' USING ERRCODE='P0002'; END IF;
  SELECT COALESCE(NULLIF(r.game,''),'general') INTO domain_name
  FROM public.question_content_revisions r WHERE r.id=quality_case.revision_id;

  WITH scored AS (
    SELECT cl.*,
      ((COALESCE(w.resolved_total,0)>=20 AND COALESCE(w.flawed_controls,0)>=5 AND COALESCE(w.clean_controls,0)>=5
        AND (COALESCE(w.flawed_controls_correct,0)+2)::numeric/(COALESCE(w.flawed_controls,0)+4)>=0.70
        AND (COALESCE(w.clean_controls_correct,0)+2)::numeric/(COALESCE(w.clean_controls,0)+4)>=0.80)
       OR w.trust_state='trusted') AS trusted
    FROM public.question_quality_claims cl
    LEFT JOIN public.question_quality_worker_profiles w ON w.user_id=cl.user_id AND w.domain=domain_name
    WHERE cl.case_id=p_case_id
  ), leading_group AS (
    SELECT reason_code,correction_fingerprint,count(*)::integer AS total,
      count(DISTINCT independence_key)::integer AS clusters,
      count(*) FILTER(WHERE trusted)::integer AS trusted_total
    FROM scored WHERE verdict='flawed'
    GROUP BY reason_code,correction_fingerprint
    ORDER BY count(*) FILTER(WHERE trusted) DESC,count(*) DESC,reason_code,correction_fingerprint
    LIMIT 1
  )
  SELECT reason_code,correction_fingerprint,total,clusters,trusted_total
  INTO leading_reason,leading_fingerprint,leading_total,leading_clusters,trusted_flaw FROM leading_group;

  WITH scored AS (
    SELECT cl.*,
      ((COALESCE(w.resolved_total,0)>=20 AND COALESCE(w.flawed_controls,0)>=5 AND COALESCE(w.clean_controls,0)>=5
        AND (COALESCE(w.flawed_controls_correct,0)+2)::numeric/(COALESCE(w.flawed_controls,0)+4)>=0.70
        AND (COALESCE(w.clean_controls_correct,0)+2)::numeric/(COALESCE(w.clean_controls,0)+4)>=0.80)
       OR w.trust_state='trusted') AS trusted,
      GREATEST(0.51,LEAST(0.98,(COALESCE(w.flawed_controls_correct,0)+2)::numeric/(COALESCE(w.flawed_controls,0)+4))) AS sensitivity,
      GREATEST(0.51,LEAST(0.98,(COALESCE(w.clean_controls_correct,0)+2)::numeric/(COALESCE(w.clean_controls,0)+4))) AS specificity,
      GREATEST(0.50,LEAST(1.00,(COALESCE(w.correction_checks_correct,0)+2)::numeric/(COALESCE(w.correction_checks,0)+4))) AS correction_accuracy
    FROM public.question_quality_claims cl
    LEFT JOIN public.question_quality_worker_profiles w ON w.user_id=cl.user_id AND w.domain=domain_name
    WHERE cl.case_id=p_case_id
  )
  SELECT count(DISTINCT user_id)::integer,count(DISTINCT independence_key)::integer,
    count(*) FILTER(WHERE verdict='clean' AND trusted)::integer,
    COALESCE(sum(GREATEST(-3,LEAST(3,CASE WHEN verdict='flawed'
      THEN ln(sensitivity/(1-specificity))*correction_accuracy
      ELSE ln((1-sensitivity)/specificity) END))),0)
  INTO independent_users,independent_clusters,trusted_clean,human_llr FROM scored;

  SELECT GREATEST(-2.2,LEAST(2.2,COALESCE(sum(CASE
    WHEN direction='supports_flaw' THEN COALESCE(strength,0)*2.2
    WHEN direction='supports_clean' THEN COALESCE(strength,0)*-2.2 ELSE 0 END),0)))
  INTO model_llr FROM public.question_quality_verifications
  WHERE case_id=p_case_id AND role IN ('model_a','model_b','research') AND status='ok';

  SELECT p.proof_kind,p.direction INTO proof_kind,proof_direction
  FROM public.question_quality_case_proofs p WHERE p.case_id=p_case_id
  ORDER BY p.created_at DESC,p.id DESC LIMIT 1;
  IF proof_kind IS NULL THEN proof_kind:='none'; proof_direction:='inconclusive'; END IF;
  proof_llr:=CASE proof_direction WHEN 'supports_flaw' THEN 4.6 WHEN 'supports_clean' THEN -4.6 ELSE 0 END;
  posterior:=1/(1+exp(-(ln(0.02/0.98)+human_llr+model_llr+proof_llr)));
  posterior_without_model:=round(1/(1+exp(-(ln(0.02/0.98)+human_llr+proof_llr))),9);

  flaw_floor:=independent_users>=5 AND independent_clusters>=5 AND leading_clusters>=3
    AND trusted_flaw>=3 AND leading_fingerprint IS NOT NULL;
  clean_floor:=independent_users>=5 AND independent_clusters>=5 AND trusted_clean>=3;

  -- community-quality@1 rule, kept only to report what the gate withheld.
  IF flaw_floor THEN
    IF posterior>=0.995 AND proof_kind<>'none' AND proof_direction='supports_flaw' THEN ungated_decision:='confirmed';
    ELSIF posterior>=0.98 THEN ungated_decision:='quarantine';
    ELSE ungated_decision:='suspected'; END IF;
  ELSIF clean_floor AND posterior<=0.02 THEN
    ungated_decision:='rejected';
  ELSIF independent_users>=11 THEN ungated_decision:='inconclusive';
  END IF;

  -- community-quality@2 rule: an automatic action must hold both with and
  -- without the model term. The model can still withhold an action (send it
  -- to human review) but can never be the reason one is taken.
  IF flaw_floor THEN
    IF LEAST(posterior,posterior_without_model)>=0.995
      AND proof_kind<>'none' AND proof_direction='supports_flaw' THEN computed_decision:='confirmed';
    ELSIF LEAST(posterior,posterior_without_model)>=0.98 THEN computed_decision:='quarantine';
    ELSE computed_decision:='suspected'; END IF;
  ELSIF clean_floor AND GREATEST(posterior,posterior_without_model)<=0.02 THEN
    computed_decision:='rejected';
  ELSIF independent_users>=11 THEN computed_decision:='inconclusive';
  END IF;

  IF computed_decision<>ungated_decision THEN
    -- The gate only withholds new automatic actions. An action already taken
    -- under the ungated rule is never reversed by the gate alone: lifting a
    -- quarantine or reopening a confirmation stays a human decision, and
    -- record_question_quality_consensus would otherwise refuse the regression.
    IF quality_case.state='confirmed' AND ungated_decision='confirmed' THEN
      computed_decision:='confirmed';
      model_gate:='retained_existing_action';
    ELSIF quality_case.state IN ('quarantined','confirmed')
      AND ungated_decision IN ('quarantine','confirmed')
      AND computed_decision NOT IN ('quarantine','confirmed') THEN
      computed_decision:='quarantine';
      model_gate:='retained_existing_action';
    ELSE
      model_gate:='held_for_human_review';
    END IF;
  END IF;

  snapshot:=jsonb_build_object(
    'caseId',p_case_id,'decision',computed_decision,'posterior',posterior,
    'independentUserCount',independent_users,'independentClusterCount',independent_clusters,
    'trustedAgreementCount',CASE WHEN leading_fingerprint IS NULL THEN trusted_clean ELSE trusted_flaw END,
    'leadingReasonCode',leading_reason,'leadingCorrectionFingerprint',leading_fingerprint,
    'leadingTotal',leading_total,'externalProofKind',proof_kind,'externalProofDirection',proof_direction,
    'humanLogLikelihood',human_llr,'modelLogLikelihood',model_llr,'proofLogLikelihood',proof_llr,
    'policyVersion','community-quality@2','posteriorWithoutModel',posterior_without_model,
    'ungatedDecision',ungated_decision,'modelGate',model_gate
  );
  inputs_sha:=encode(extensions.digest(snapshot::text,'sha256'),'hex');
  RETURN snapshot||jsonb_build_object('inputsSha256',inputs_sha);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.record_question_quality_consensus(
  p_actor_id uuid,p_case_id uuid,p_policy_version text,p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE
  quality_case public.question_quality_cases%ROWTYPE;
  previous_state text;
  current_question public.questions%ROWTYPE;
  snapshot jsonb;
  computed_decision text;
  effective_decision text;
  decision_row public.question_quality_consensus_decisions%ROWTYPE;
  first_claim public.question_quality_claims%ROWTYPE;
  matching_claim public.question_quality_claims%ROWTYPE;
  old_request public.content_governance_requests%ROWTYPE;
  payload_hash text;
  result jsonb;
  inserted_reward uuid;
  reward_amount integer;
  daily_reward integer;
  effective_policy_version constant text:='community-quality@2';
BEGIN
  IF NOT public.content_governance_has_permission(p_actor_id,'content.corrections.apply')
    OR p_case_id IS NULL OR p_request_id IS NULL
    OR p_policy_version NOT IN ('community-quality@1','community-quality@2') THEN
    RAISE EXCEPTION 'invalid quality consensus request' USING ERRCODE='22023';
  END IF;
  PERFORM public.content_governance_lock_request(p_actor_id,'record_quality_consensus',p_request_id);
  payload_hash:=public.content_governance_hash(jsonb_build_object(
    'caseId',p_case_id,'policyVersion',p_policy_version
  ));
  SELECT * INTO old_request FROM public.content_governance_requests
  WHERE user_id=p_actor_id AND operation='record_quality_consensus' AND request_id=p_request_id;
  IF FOUND THEN
    IF old_request.payload_hash<>payload_hash THEN RAISE EXCEPTION 'quality consensus request payload mismatch' USING ERRCODE='22023'; END IF;
    RETURN old_request.result||jsonb_build_object('replayed',true);
  END IF;

  SELECT * INTO quality_case FROM public.question_quality_cases WHERE id=p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quality case not found' USING ERRCODE='P0002'; END IF;
  previous_state:=quality_case.state;
  snapshot:=public.compute_question_quality_consensus(p_case_id);
  computed_decision:=snapshot->>'decision';
  effective_decision:=computed_decision;
  SELECT * INTO current_question FROM public.questions WHERE id=quality_case.question_id FOR UPDATE;
  IF computed_decision='quarantine' AND (
    current_question.published_revision_id IS DISTINCT FROM quality_case.revision_id
    OR NOT EXISTS(SELECT 1 FROM public.question_content_revisions r WHERE r.id=quality_case.revision_id AND r.content_sha256=quality_case.content_sha256)
  ) THEN effective_decision:='inconclusive'; END IF;
  IF previous_state='confirmed' AND effective_decision<>'confirmed' THEN
    RAISE EXCEPTION 'confirmed quality case is terminal' USING ERRCODE='P0003';
  END IF;
  IF previous_state='quarantined' AND effective_decision NOT IN ('quarantine','confirmed') THEN
    RAISE EXCEPTION 'quarantined quality case cannot regress automatically' USING ERRCODE='P0003';
  END IF;

  INSERT INTO public.question_quality_consensus_decisions(
    case_id,policy_version,decision,posterior_defect_probability,independent_user_count,
    independent_cluster_count,trusted_agreement_count,leading_reason_code,
    leading_correction_fingerprint,external_proof_kind,inputs_sha256,rationale,actor_id
  ) VALUES(
    p_case_id,effective_policy_version,effective_decision,(snapshot->>'posterior')::numeric,
    (snapshot->>'independentUserCount')::integer,(snapshot->>'independentClusterCount')::integer,
    (snapshot->>'trustedAgreementCount')::integer,snapshot->>'leadingReasonCode',
    snapshot->>'leadingCorrectionFingerprint',snapshot->>'externalProofKind',
    snapshot->>'inputsSha256',CASE WHEN effective_decision<>computed_decision
      THEN 'Stale revision; current published question was not quarantined.' ELSE snapshot::text END,p_actor_id
  ) ON CONFLICT(case_id,policy_version,inputs_sha256) DO NOTHING RETURNING * INTO decision_row;
  IF NOT FOUND THEN SELECT * INTO decision_row FROM public.question_quality_consensus_decisions
    WHERE case_id=p_case_id AND policy_version=effective_policy_version AND inputs_sha256=snapshot->>'inputsSha256'; END IF;

  UPDATE public.question_quality_cases SET
    state=CASE WHEN effective_decision='quarantine' THEN 'quarantined' ELSE effective_decision END,
    posterior_defect_probability=(snapshot->>'posterior')::numeric,
    leading_reason_code=snapshot->>'leadingReasonCode',leading_correction_fingerprint=snapshot->>'leadingCorrectionFingerprint',
    independent_user_count=(snapshot->>'independentUserCount')::integer,
    independent_cluster_count=(snapshot->>'independentClusterCount')::integer,
    trusted_agreement_count=(snapshot->>'trustedAgreementCount')::integer,updated_at=clock_timestamp(),
    resolved_at=CASE WHEN effective_decision IN ('confirmed','rejected','inconclusive') THEN clock_timestamp() ELSE resolved_at END
  WHERE id=p_case_id RETURNING * INTO quality_case;

  IF effective_decision IN ('quarantine','confirmed')
    AND previous_state NOT IN ('quarantined','confirmed')
    AND current_question.published_revision_id=quality_case.revision_id AND current_question.is_active THEN
    PERFORM public.quarantine_question_content(
      p_actor_id,quality_case.question_id,'Topluluk kalite kaniti: '||effective_policy_version||' / '||effective_decision,p_request_id
    );
  END IF;

  IF effective_decision='confirmed' AND previous_state<>'confirmed' THEN
    SELECT * INTO first_claim FROM public.question_quality_claims
    WHERE case_id=p_case_id AND verdict='flawed'
      AND correction_fingerprint=quality_case.leading_correction_fingerprint
    ORDER BY created_at,id LIMIT 1;
    FOR matching_claim IN
      SELECT DISTINCT ON (independence_key) * FROM public.question_quality_claims
      WHERE case_id=p_case_id AND verdict='flawed'
        AND correction_fingerprint=quality_case.leading_correction_fingerprint
      ORDER BY independence_key,created_at,id LIMIT 11
    LOOP
      reward_amount:=CASE WHEN matching_claim.id=first_claim.id THEN 75 ELSE 10 END;
      PERFORM pg_advisory_xact_lock(hashtextextended(
        'question-quality-reward:'||matching_claim.user_id::text||':'||
        (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date::text,146
      ));
      SELECT COALESCE(sum(amount),0)::integer INTO daily_reward FROM public.reward_ledger
      WHERE user_id=matching_claim.user_id AND source_type='question_quality_claim' AND reward_type='coin'
        AND (created_at AT TIME ZONE 'Europe/Istanbul')::date=(clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date;
      IF daily_reward+reward_amount<=300 THEN
        INSERT INTO public.reward_ledger(user_id,source_type,source_id,reward_type,reward_key,amount,metadata)
        VALUES(matching_claim.user_id,'question_quality_claim',matching_claim.id,'coin',
          CASE WHEN matching_claim.id=first_claim.id THEN 'confirmed_discovery' ELSE 'confirmed_corroboration' END,
          reward_amount,jsonb_build_object('caseId',p_case_id,'policyVersion',effective_policy_version))
        ON CONFLICT(source_type,source_id,reward_type,reward_key) DO NOTHING RETURNING id INTO inserted_reward;
        IF inserted_reward IS NOT NULL THEN PERFORM public.increment_coins(matching_claim.user_id,reward_amount); END IF;
        inserted_reward:=NULL;
      END IF;
    END LOOP;
    IF first_claim.id IS NOT NULL AND (first_claim.proposed_answer_index IS NOT NULL OR first_claim.correction_text IS NOT NULL) THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(
        'question-quality-reward:'||first_claim.user_id::text||':'||
        (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date::text,146
      ));
      SELECT COALESCE(sum(amount),0)::integer INTO daily_reward FROM public.reward_ledger
      WHERE user_id=first_claim.user_id AND source_type='question_quality_claim' AND reward_type='coin'
        AND (created_at AT TIME ZONE 'Europe/Istanbul')::date=(clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date;
      IF daily_reward+125<=300 THEN
        INSERT INTO public.reward_ledger(user_id,source_type,source_id,reward_type,reward_key,amount,metadata)
        VALUES(first_claim.user_id,'question_quality_claim',first_claim.id,'coin','accepted_correction',125,
          jsonb_build_object('caseId',p_case_id,'policyVersion',effective_policy_version))
        ON CONFLICT(source_type,source_id,reward_type,reward_key) DO NOTHING RETURNING id INTO inserted_reward;
        IF inserted_reward IS NOT NULL THEN PERFORM public.increment_coins(first_claim.user_id,125); END IF;
      END IF;
    END IF;
  END IF;

  DELETE FROM public.question_quality_consensus_queue WHERE case_id=p_case_id;

  result:=jsonb_build_object('caseId',quality_case.id,'state',quality_case.state,
    'decisionId',decision_row.id,'posterior',quality_case.posterior_defect_probability,
    'inputsSha256',snapshot->>'inputsSha256','policyVersion',effective_policy_version,'replayed',false);
  INSERT INTO public.content_governance_requests VALUES(
    p_actor_id,'record_quality_consensus',p_request_id,payload_hash,result,clock_timestamp()
  );
  RETURN result;
END;
$fn$;

-- CREATE OR REPLACE keeps the existing ACLs; re-assert them so a first-time
-- create can never inherit the default PUBLIC EXECUTE.
REVOKE ALL ON FUNCTION public.compute_question_quality_consensus(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.record_question_quality_consensus(uuid,uuid,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_question_quality_consensus(uuid,uuid,text,uuid)
  TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
