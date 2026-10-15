-- Manual rollback: restores the previous publication contract; retains every evidence record.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE OR REPLACE FUNCTION public.publish_question_content_revision(p_user_id uuid, p_revision_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  r public.question_content_revisions%ROWTYPE;
  q public.questions%ROWTYPE;
  h text;
  old public.content_governance_requests%ROWTYPE;
  out jsonb;
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
  IF NOT FOUND OR r.status<>'stage2_approved' THEN
    RAISE EXCEPTION 'two-stage approved revision required' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(
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
  IF NOT public.question_revision_outcomes_valid(r.id)
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
    WHERE question.id=r.question_id
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
    r.question_id,r.id,p_user_id,'published','Two-stage approved revision published'
  );
  out:=jsonb_build_object(
    'questionId',r.question_id,'revisionId',r.id,'status','published','replayed',false
  );
  INSERT INTO public.content_governance_requests
  VALUES(p_user_id,'publish_revision',p_request_id,h,out,clock_timestamp());
  RETURN out;
END
$function$
;

CREATE OR REPLACE FUNCTION public.tyt_social_revision_source_policy_ready(p_revision_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT p_revision_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.questions AS question
    JOIN public.question_content_revisions AS revision
      ON revision.id = question.published_revision_id
     AND revision.question_id = question.id
    JOIN public.question_revision_sources AS source
      ON source.revision_id = revision.id
    JOIN public.question_revision_approvals AS stage_one
      ON stage_one.revision_id = revision.id
     AND stage_one.stage = 1
     AND stage_one.decision = 'approved'
    JOIN public.question_revision_approvals AS stage_two
      ON stage_two.revision_id = revision.id
     AND stage_two.stage = 2
     AND stage_two.decision = 'approved'
    WHERE revision.id = p_revision_id
      AND question.is_active
      AND question.game::text = 'sosyal'
      AND upper(btrim(COALESCE(question.exam_ref::text, ''))) = 'TYT'
      AND revision.status = 'published'
      AND revision.published_at IS NOT NULL
      AND revision.change_kind <> 'legacy_import'
      AND revision.prepared_by IS NOT NULL
      AND revision.game IS NOT DISTINCT FROM question.game::text
      AND revision.category IS NOT DISTINCT FROM question.category::text
      AND upper(btrim(COALESCE(revision.exam_ref, ''))) = 'TYT'
      AND revision.difficulty IS NOT DISTINCT FROM question.difficulty
      AND revision.content_sha256 ~ '^[0-9a-f]{64}$'
      AND source.source_kind IN (
        'original','licensed','public_domain','user_generated','official_exam'
      )
      AND lower(source.license_code) <> 'legacy-import'
      AND NULLIF(btrim(COALESCE(source.provenance_ref, '')), '') IS NOT NULL
      AND lower(btrim(source.provenance_ref)) NOT LIKE 'legacy:%'
      AND stage_one.reviewer_id IS DISTINCT FROM stage_two.reviewer_id
      AND stage_one.reviewer_id IS DISTINCT FROM revision.prepared_by
      AND stage_two.reviewer_id IS DISTINCT FROM revision.prepared_by
      AND (
        revision.outcomes_prepared_by IS NULL
        OR (
          stage_one.reviewer_id IS DISTINCT FROM revision.outcomes_prepared_by
          AND stage_two.reviewer_id IS DISTINCT FROM revision.outcomes_prepared_by
        )
      )
  )
$function$
;
CREATE OR REPLACE FUNCTION public.question_revision_single_review_ready(p_revision_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT false $$;
REVOKE ALL ON FUNCTION public.accept_question_revision_source_review(uuid,uuid,jsonb,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

