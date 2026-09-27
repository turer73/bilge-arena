-- Migration 212: record the model-free posterior next to the consensus posterior.
--
-- The consensus posterior sums a human term, a model term (capped at +/-2.2)
-- and an external-proof term. The human floor in migration 146 already makes a
-- model verdict insufficient on its own: the quarantine branch is only reachable
-- with at least five independent reporters in five independent clusters and
-- three trusted reporters agreeing on one correction fingerprint. Inside that
-- branch, however, the model term can still be the margin that carries the
-- posterior across the 0.98 quarantine threshold, and nothing recorded today
-- shows whether it was.
--
-- This migration changes no threshold and no decision. It only records what the
-- posterior would have been from human and external-proof evidence alone, so a
-- reviewer auditing a quarantine can see whether the automated model term was
-- decisive.
--
-- inputs_sha256 is deliberately still computed over the pre-existing snapshot
-- only. It is the dedup key of question_quality_consensus_decisions
-- (UNIQUE(case_id,policy_version,inputs_sha256)); the new field is a pure
-- function of terms already inside that hash, so adding it to the hash would
-- change the identity of unchanged evidence and insert a duplicate decision row
-- on the first recompute after deploy.

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

  IF independent_users>=5 AND independent_clusters>=5 AND leading_clusters>=3
    AND trusted_flaw>=3 AND leading_fingerprint IS NOT NULL THEN
    IF posterior>=0.995 AND proof_kind<>'none' AND proof_direction='supports_flaw' THEN computed_decision:='confirmed';
    ELSIF posterior>=0.98 THEN computed_decision:='quarantine';
    ELSE computed_decision:='suspected'; END IF;
  ELSIF independent_users>=5 AND independent_clusters>=5 AND trusted_clean>=3 AND posterior<=0.02 THEN
    computed_decision:='rejected';
  ELSIF independent_users>=11 THEN computed_decision:='inconclusive';
  END IF;

  snapshot:=jsonb_build_object(
    'caseId',p_case_id,'decision',computed_decision,'posterior',posterior,
    'independentUserCount',independent_users,'independentClusterCount',independent_clusters,
    'trustedAgreementCount',CASE WHEN leading_fingerprint IS NULL THEN trusted_clean ELSE trusted_flaw END,
    'leadingReasonCode',leading_reason,'leadingCorrectionFingerprint',leading_fingerprint,
    'leadingTotal',leading_total,'externalProofKind',proof_kind,'externalProofDirection',proof_direction,
    'humanLogLikelihood',human_llr,'modelLogLikelihood',model_llr,'proofLogLikelihood',proof_llr
  );
  inputs_sha:=encode(extensions.digest(snapshot::text,'sha256'),'hex');
  RETURN snapshot||jsonb_build_object(
'posteriorWithoutModel',posterior_without_model,
'inputsSha256',inputs_sha);
END;
$fn$;

-- CREATE OR REPLACE keeps the existing ACL, but re-assert it so a first-time
-- create can never inherit the default PUBLIC EXECUTE. This stays an internal
-- helper of record_question_quality_consensus.
REVOKE ALL ON FUNCTION public.compute_question_quality_consensus(uuid)
  FROM PUBLIC,anon,authenticated,service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
