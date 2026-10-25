-- Revision-bound TYT quality@5; global runtime and all existing LGS bindings remain unchanged.
-- Generated with Supabase CLI, then numbered229 for this repository migration-order contract.
-- Requires independent source/catalog acceptance and exact benchmark before any binding.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
ALTER TABLE public.question_validation_revision_policies ADD COLUMN IF NOT EXISTS revision_metadata_sha256 text;
ALTER TABLE public.question_validation_revision_policies DROP CONSTRAINT IF EXISTS qvrp_revision_metadata_sha256_check;
ALTER TABLE public.question_validation_revision_policies ADD CONSTRAINT qvrp_revision_metadata_sha256_check
 CHECK(revision_metadata_sha256 IS NULL OR revision_metadata_sha256 ~ '^[a-f0-9]{64}$');
CREATE OR REPLACE FUNCTION public.question_revision_validation_metadata_hash(p_revision_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $metadata$
 SELECT public.content_governance_hash(jsonb_build_object(
  'game',r.game,'examRef',r.exam_ref,'category',r.category,'subcategory',r.subcategory,
  'topic',r.topic,'difficulty',r.difficulty,'levelTag',r.level_tag,'isBoss',r.is_boss))
 FROM public.question_content_revisions r WHERE r.id=p_revision_id
$metadata$;
REVOKE ALL ON FUNCTION public.question_revision_validation_metadata_hash(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.question_revision_validation_pair_valid(p_game text,p_exam text,p_audit text,p_decision text)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $pair$
 SELECT COALESCE(p_decision='question-quality@5' AND (
  (p_exam='LGS' AND ((p_game='fen' AND p_audit='question-quality@4') OR (p_game='turkce' AND p_audit='question-quality@5')))
  OR (p_exam='TYT' AND p_game IN ('matematik','turkce','fen','sosyal') AND p_audit='question-quality@5')
 ),false)
$pair$;
CREATE OR REPLACE FUNCTION public.tg_question_revision_policy_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path=pg_catalog
AS $function$
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
    OR ((r.exam_ref='LGS' AND NEW.revision_metadata_sha256 IS NULL)
      OR NEW.revision_metadata_sha256=public.question_revision_validation_metadata_hash(r.id)) IS NOT TRUE
    OR r.status NOT IN ('draft','stage1_approved')
    OR current_policy IS DISTINCT FROM NEW.base_policy_version OR enforced IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'exact unpublished eligible revision, allowed audit/decision pair and enforced base policy required' USING ERRCODE='22023';
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
END $function$;
CREATE OR REPLACE FUNCTION public.question_revision_validation_policy(p_revision_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path=pg_catalog
AS $function$
  SELECT CASE WHEN b.revision_id IS NOT NULL AND b.base_policy_version=rt.required_policy_version
    THEN CASE WHEN r.question_id=b.question_id AND r.content_sha256=b.content_sha256
      AND public.question_revision_validation_pair_valid(r.game,r.exam_ref,b.audit_policy_version,b.policy_version)
      AND ((r.exam_ref='LGS' AND b.revision_metadata_sha256 IS NULL)
      OR b.revision_metadata_sha256=public.question_revision_validation_metadata_hash(r.id)) IS TRUE
      AND public.question_revision_validation_run_complete(b)
      AND EXISTS(SELECT 1 FROM public.question_validation_decisions d
        WHERE d.revision_id=r.id AND d.question_id=r.question_id AND d.content_sha256=r.content_sha256
          AND d.policy_version=b.policy_version AND d.run_id=b.run_id AND d.verdict='APPROVED')
      THEN b.policy_version ELSE NULL END
    -- An attempted @5 rollout must not fall back to an old @2 approval while
    -- its required binding is missing, even if the new decision is rejected.
    WHEN b.revision_id IS NULL AND rt.required_policy_version='question-quality@2'
      AND ((r.game IN ('fen','turkce') AND r.exam_ref='LGS') OR (r.game IN ('matematik','turkce','fen','sosyal') AND r.exam_ref='TYT'))
      AND EXISTS(SELECT 1 FROM public.question_validation_decisions d
        WHERE d.revision_id=r.id AND d.question_id=r.question_id
          AND d.policy_version='question-quality@5') THEN NULL
    ELSE rt.required_policy_version END
  FROM public.question_validation_runtime rt
  JOIN public.question_content_revisions r ON r.id=p_revision_id
  LEFT JOIN public.question_validation_revision_policies b ON b.revision_id=r.id
  WHERE rt.singleton
$function$;

COMMIT;
