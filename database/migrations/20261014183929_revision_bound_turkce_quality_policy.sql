-- Narrow native LGS Turkish @5 -> @5 path; preserve Fen replay @4 -> @5.
-- No bindings, decisions, source acceptances, runtime changes or publications.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

ALTER TABLE public.question_validation_revision_policies
  -- PostgreSQL shortens the table portion of automatically named constraints
  -- to preserve the column/suffix. This is NOT ordinary right truncation.
  DROP CONSTRAINT IF EXISTS question_validation_revision_policie_audit_policy_version_check,
  DROP CONSTRAINT IF EXISTS question_validation_revision_policies_audit_policy_version_check,
  DROP CONSTRAINT IF EXISTS question_validation_revision_policies_audit_execution_check,
  DROP CONSTRAINT IF EXISTS qvrp_audit_policy_check,
  DROP CONSTRAINT IF EXISTS qvrp_audit_execution_check;
ALTER TABLE public.question_validation_revision_policies
  ADD CONSTRAINT qvrp_audit_policy_check
    CHECK(audit_policy_version IN ('question-quality@4','question-quality@5')),
  ADD CONSTRAINT qvrp_audit_execution_check
    CHECK((jsonb_typeof(audit_execution)='object'
      AND audit_execution->>'policyVersion'=audit_policy_version
      AND audit_execution->'generationConfig'->>'blindSamples'='3') IS TRUE);

-- One shared pair predicate for both insertion and effective-policy lookup.
CREATE OR REPLACE FUNCTION public.question_revision_validation_pair_valid(
  p_game text,p_exam text,p_audit text,p_decision text
) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $pair$
  SELECT COALESCE(p_exam='LGS' AND p_decision='question-quality@5' AND (
    (p_game='fen' AND p_audit='question-quality@4') OR
    (p_game='turkce' AND p_audit='question-quality@5')
  ),false)
$pair$;

CREATE OR REPLACE FUNCTION public.tg_question_revision_policy_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $guard$
DECLARE r public.question_content_revisions%ROWTYPE; current_policy text; enforced boolean;
BEGIN
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'revision policy bindings are immutable' USING ERRCODE='22023';
  END IF;
  SELECT * INTO r FROM public.question_content_revisions WHERE id=NEW.revision_id FOR SHARE;
  SELECT required_policy_version,enforce_publish_gate INTO current_policy,enforced
    FROM public.question_validation_runtime WHERE singleton FOR SHARE;
  IF r.id IS NULL OR r.question_id IS DISTINCT FROM NEW.question_id
    OR r.content_sha256 IS DISTINCT FROM NEW.content_sha256
    OR NOT public.question_revision_validation_pair_valid(r.game,r.exam_ref,NEW.audit_policy_version,NEW.policy_version)
    OR r.status NOT IN ('draft','stage1_approved')
    OR current_policy IS DISTINCT FROM NEW.base_policy_version OR enforced IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'exact unpublished LGS revision, allowed audit/decision pair and enforced base policy required' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.question_validation_decisions d
    WHERE d.revision_id=r.id AND d.question_id=r.question_id AND d.content_sha256=r.content_sha256
      AND d.policy_version=NEW.policy_version AND d.run_id=NEW.run_id AND d.verdict='APPROVED'
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'exact approved validation run required' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.question_validation_runs WHERE run_id=NEW.run_id AND question_id=NEW.question_id FOR SHARE;
  IF NOT public.question_revision_validation_run_complete(NEW) THEN
    RAISE EXCEPTION 'complete exact raw validation run required' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END $guard$;

CREATE OR REPLACE FUNCTION public.question_revision_validation_policy(p_revision_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $policy$
  SELECT CASE WHEN b.revision_id IS NOT NULL AND b.base_policy_version=rt.required_policy_version
    THEN CASE WHEN r.question_id=b.question_id AND r.content_sha256=b.content_sha256
      AND public.question_revision_validation_pair_valid(r.game,r.exam_ref,b.audit_policy_version,b.policy_version)
      AND public.question_revision_validation_run_complete(b)
      AND EXISTS(SELECT 1 FROM public.question_validation_decisions d
        WHERE d.revision_id=r.id AND d.question_id=r.question_id AND d.content_sha256=r.content_sha256
          AND d.policy_version=b.policy_version AND d.run_id=b.run_id AND d.verdict='APPROVED')
      THEN b.policy_version ELSE NULL END
    -- An attempted @5 rollout must not fall back to an old @2 approval while
    -- its required binding is missing, even if the new decision is rejected.
    WHEN b.revision_id IS NULL AND rt.required_policy_version='question-quality@2'
      AND r.game IN ('fen','turkce') AND r.exam_ref='LGS'
      AND EXISTS(SELECT 1 FROM public.question_validation_decisions d
        WHERE d.revision_id=r.id AND d.question_id=r.question_id
          AND d.policy_version='question-quality@5') THEN NULL
    ELSE rt.required_policy_version END
  FROM public.question_validation_runtime rt
  JOIN public.question_content_revisions r ON r.id=p_revision_id
  LEFT JOIN public.question_validation_revision_policies b ON b.revision_id=r.id
  WHERE rt.singleton
$policy$;

-- The existing publisher, source-readiness and quality trigger all use this
-- resolver. Their lock order and five-exact-raw-agent checks stay unchanged.
REVOKE ALL ON FUNCTION public.question_revision_validation_pair_valid(text,text,text,text),
  public.tg_question_revision_policy_guard(),public.question_revision_validation_policy(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
-- Reassert private append-only boundary, including deployments with grant drift.
ALTER TABLE public.question_validation_revision_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.question_validation_revision_policies FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.question_validation_revision_policies TO service_role;
COMMIT;
