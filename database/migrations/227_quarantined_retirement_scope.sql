-- Allow formal retirement of already quarantined, unchanged, unmapped content.
-- Two independent reviewers, source evidence presence, stale-base checks and ACLs stay intact.
-- This migration does not approve, publish, retire, or reactivate any question.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE OR REPLACE FUNCTION public.review_question_content_revision(
  p_user_id uuid,p_revision_id uuid,p_stage smallint,p_decision text,
  p_rationale text,p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  r public.question_content_revisions%ROWTYPE;
  prior public.question_revision_approvals%ROWTYPE;
  q public.questions%ROWTYPE;
  h text;
  old public.content_governance_requests%ROWTYPE;
  out jsonb;
BEGIN
  IF p_stage NOT IN (1,2) OR p_decision NOT IN ('approved','rejected')
    OR char_length(btrim(COALESCE(p_rationale,''))) NOT BETWEEN 1 AND 1000
    OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'invalid review' USING ERRCODE='22023';
  END IF;
  IF NOT public.content_governance_has_permission(
    p_user_id,CASE WHEN p_stage=1 THEN 'content.review.stage1' ELSE 'content.review.stage2' END
  ) THEN
    RAISE EXCEPTION 'review permission required' USING ERRCODE='42501';
  END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'review_revision',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object(
    'revisionId',p_revision_id,'stage',p_stage,'decision',p_decision,'rationale',p_rationale
  ));
  SELECT * INTO old FROM public.content_governance_requests
  WHERE user_id=p_user_id AND operation='review_revision' AND request_id=p_request_id;
  IF FOUND THEN
    IF old.payload_hash<>h THEN
      RAISE EXCEPTION 'review request payload mismatch' USING ERRCODE='22023';
    END IF;
    RETURN old.result||jsonb_build_object('replayed',true);
  END IF;
  SELECT * INTO r FROM public.question_content_revisions WHERE id=p_revision_id FOR UPDATE;
  IF NOT FOUND OR r.status NOT IN ('draft','stage1_approved')
    OR r.prepared_by IS NULL OR r.prepared_by=p_user_id
    OR r.outcomes_prepared_by=p_user_id THEN
    RAISE EXCEPTION 'revision is not reviewable' USING ERRCODE='22023';
  END IF;
  IF p_stage=2 THEN
    SELECT * INTO prior FROM public.question_revision_approvals
    WHERE revision_id=p_revision_id AND stage=1;
    IF NOT FOUND OR prior.decision<>'approved' OR prior.reviewer_id=p_user_id THEN
      RAISE EXCEPTION 'independent stage one approval required' USING ERRCODE='22023';
    END IF;
    IF p_decision='approved' THEN
      PERFORM public.lock_question_revision_outcome_scope(p_revision_id);
      IF NOT public.question_revision_outcomes_valid(p_revision_id) THEN
        -- A quarantined, byte-identical retirement does not teach an outcome.
        -- Freeze the current question through the approval transaction.
        SELECT * INTO q FROM public.questions WHERE id=r.question_id FOR SHARE;
        IF NOT COALESCE((r.change_kind='retire'
        AND q.id=r.question_id AND q.is_active IS FALSE
        AND r.base_revision_id IS NOT NULL
        AND q.published_revision_id=r.base_revision_id
        AND NOT EXISTS (SELECT 1 FROM public.question_revision_outcomes WHERE revision_id=r.id)
        AND r.content_sha256=encode(extensions.digest(q.content::text,'sha256'),'hex')
        AND ROW(r.content,r.game,r.category,r.subcategory,r.topic,r.difficulty,r.level_tag,r.exam_ref,r.is_boss)
          IS NOT DISTINCT FROM
          ROW(q.content,q.game::text,q.category::text,q.subcategory::text,q.topic::text,q.difficulty,q.level_tag::text,q.exam_ref::text,q.is_boss)),false) THEN
          RAISE EXCEPTION 'stage two requires exact-scope outcome evidence' USING ERRCODE='22023';
        END IF;
      END IF;
    END IF;
  END IF;
  INSERT INTO public.question_revision_approvals
  VALUES(p_revision_id,p_stage,p_user_id,p_decision,p_rationale,clock_timestamp());
  UPDATE public.question_content_revisions
  SET status=CASE WHEN p_decision='rejected' THEN 'rejected'
    WHEN p_stage=1 THEN 'stage1_approved' ELSE 'stage2_approved' END
  WHERE id=p_revision_id;
  out:=jsonb_build_object(
    'revisionId',p_revision_id,'stage',p_stage,'decision',p_decision,'replayed',false
  );
  INSERT INTO public.content_governance_requests
  VALUES(p_user_id,'review_revision',p_request_id,h,out,clock_timestamp());
  RETURN out;
END
$fn$;

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
  PERFORM public.lock_question_revision_validation_run(r.id);
  -- Freeze the decision in BOTH single-owner and two-stage publication paths.
  PERFORM 1 FROM public.question_validation_runtime WHERE singleton FOR SHARE;
  PERFORM 1 FROM public.question_validation_decisions d
    JOIN public.question_validation_runtime runtime ON runtime.singleton
    WHERE d.revision_id=r.id AND d.question_id=r.question_id AND d.content_sha256=r.content_sha256
      AND d.policy_version=public.question_revision_validation_policy(r.id) FOR SHARE OF d;
  IF single_review THEN
    IF NOT public.question_revision_single_review_ready(r.id) THEN
      RAISE EXCEPTION 'accepted source review and current APPROVED quality decision required' USING ERRCODE='22023';
    END IF;
  END IF;
  -- Same narrow retirement check is repeated after locking the current base.
  -- No exception applies to activation, content edits, or partial mappings.
  IF (NOT public.question_revision_outcomes_valid(r.id)
      AND NOT COALESCE((r.change_kind='retire'
        AND q.id=r.question_id AND q.is_active IS FALSE
        AND r.base_revision_id IS NOT NULL
        AND q.published_revision_id=r.base_revision_id
        AND NOT EXISTS (SELECT 1 FROM public.question_revision_outcomes WHERE revision_id=r.id)
        AND r.content_sha256=encode(extensions.digest(q.content::text,'sha256'),'hex')
        AND ROW(r.content,r.game,r.category,r.subcategory,r.topic,r.difficulty,r.level_tag,r.exam_ref,r.is_boss)
          IS NOT DISTINCT FROM
          ROW(q.content,q.game::text,q.category::text,q.subcategory::text,q.topic::text,q.difficulty,q.level_tag::text,q.exam_ref::text,q.is_boss)),false))
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
    WHERE question.id=r.question_id AND question.is_active
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
$function$;

REVOKE ALL ON FUNCTION public.review_question_content_revision(uuid,uuid,smallint,text,text,uuid),
  public.publish_question_content_revision(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.review_question_content_revision(uuid,uuid,smallint,text,text,uuid),
  public.publish_question_content_revision(uuid,uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
