-- Migration 142: replace caller-forgeable GUC-only question writes with a
-- transaction- and question-bound private authorization context.
BEGIN;

CREATE TABLE IF NOT EXISTS public.content_governance_write_context (
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL,
  question_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('create','publish','quarantine')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(backend_pid,transaction_id,question_id)
);
ALTER TABLE public.content_governance_write_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.content_governance_write_context
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.content_governance_authorize_question_write(
  p_question_id uuid,
  p_operation text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF p_question_id IS NULL OR p_operation NOT IN ('create','publish','quarantine') THEN
    RAISE EXCEPTION 'invalid governed question write context' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.content_governance_write_context(
    backend_pid,transaction_id,question_id,operation
  ) VALUES (
    pg_backend_pid(),txid_current(),p_question_id,p_operation
  ) ON CONFLICT(backend_pid,transaction_id,question_id) DO UPDATE SET
    operation=EXCLUDED.operation,created_at=clock_timestamp();
END
$fn$;

CREATE OR REPLACE FUNCTION public.content_governance_clear_question_write(p_question_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  DELETE FROM public.content_governance_write_context
  WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND question_id=p_question_id
$fn$;

CREATE OR REPLACE FUNCTION public.tg_question_content_direct_mutation_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
BEGIN
  IF COALESCE((SELECT enforce_direct_mutation FROM public.content_governance_runtime WHERE singleton),true)
    AND NOT EXISTS (
      SELECT 1 FROM public.content_governance_write_context context
      WHERE context.backend_pid=pg_backend_pid()
        AND context.transaction_id=txid_current()
        AND context.question_id=NEW.id
        AND context.operation IN ('publish','quarantine')
    )
    AND (NEW.content,NEW.game,NEW.category,NEW.subcategory,NEW.topic,NEW.difficulty,NEW.level_tag,NEW.exam_ref,NEW.is_boss,NEW.is_active,NEW.published_revision_id)
        IS DISTINCT FROM (OLD.content,OLD.game,OLD.category,OLD.subcategory,OLD.topic,OLD.difficulty,OLD.level_tag,OLD.exam_ref,OLD.is_boss,OLD.is_active,OLD.published_revision_id) THEN
    RAISE EXCEPTION 'direct question content or activation mutation is disabled; publish or quarantine a revision' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.tg_question_direct_insert_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
BEGIN
  IF COALESCE((SELECT enforce_direct_mutation FROM public.content_governance_runtime WHERE singleton),true)
    AND NOT EXISTS (
      SELECT 1 FROM public.content_governance_write_context context
      WHERE context.backend_pid=pg_backend_pid()
        AND context.transaction_id=txid_current()
        AND context.question_id=NEW.id
        AND context.operation='create'
    ) THEN
    RAISE EXCEPTION 'direct question insert is disabled; create a governed draft' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.create_governed_question(p_user_id uuid,p_payload jsonb,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE qid uuid:=gen_random_uuid(); r public.question_content_revisions%ROWTYPE; h text; old public.content_governance_requests%ROWTYPE; out jsonb;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.prepare') THEN RAISE EXCEPTION 'content prepare permission required' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL OR NOT public.content_governance_validate_payload(p_payload) OR p_payload->>'changeKind'<>'create' THEN RAISE EXCEPTION 'invalid governed question payload' USING ERRCODE='22023'; END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'create_question',p_request_id);
  h:=public.content_governance_hash(p_payload); SELECT * INTO old FROM public.content_governance_requests WHERE user_id=p_user_id AND operation='create_question' AND request_id=p_request_id;
  IF FOUND THEN IF old.payload_hash<>h THEN RAISE EXCEPTION 'question creation request payload mismatch' USING ERRCODE='22023'; END IF; RETURN old.result||jsonb_build_object('replayed',true); END IF;
  PERFORM public.content_governance_authorize_question_write(qid,'create');
  INSERT INTO public.questions(id,game,category,subcategory,topic,difficulty,level_tag,exam_ref,is_boss,content,is_active,published_revision_id)
  VALUES(qid,p_payload->'metadata'->>'game',p_payload->'metadata'->>'category',NULLIF(p_payload->'metadata'->>'subcategory',''),NULLIF(p_payload->'metadata'->>'topic',''),(p_payload->'metadata'->>'difficulty')::smallint,NULLIF(p_payload->'metadata'->>'levelTag',''),NULLIF(p_payload->'metadata'->>'examRef',''),COALESCE((p_payload->'metadata'->>'isBoss')::boolean,false),p_payload->'content',false,NULL);
  PERFORM public.content_governance_clear_question_write(qid);
  INSERT INTO public.question_content_revisions(question_id,revision_no,game,category,subcategory,topic,difficulty,level_tag,exam_ref,is_boss,content,content_sha256,change_kind,change_summary,prepared_by)
  VALUES(qid,1,p_payload->'metadata'->>'game',p_payload->'metadata'->>'category',NULLIF(p_payload->'metadata'->>'subcategory',''),NULLIF(p_payload->'metadata'->>'topic',''),(p_payload->'metadata'->>'difficulty')::smallint,NULLIF(p_payload->'metadata'->>'levelTag',''),NULLIF(p_payload->'metadata'->>'examRef',''),COALESCE((p_payload->'metadata'->>'isBoss')::boolean,false),p_payload->'content',encode(extensions.digest((p_payload->'content')::text,'sha256'),'hex'),'create',p_payload->>'summary',p_user_id) RETURNING * INTO r;
  INSERT INTO public.question_revision_sources(revision_id,source_kind,source_title,source_url,license_code,license_url,attribution,provenance_ref)
  VALUES(r.id,p_payload->'source'->>'kind',p_payload->'source'->>'title',NULLIF(p_payload->'source'->>'url',''),p_payload->'source'->>'licenseCode',NULLIF(p_payload->'source'->>'licenseUrl',''),NULLIF(p_payload->'source'->>'attribution',''),NULLIF(p_payload->'source'->>'provenanceRef',''));
  INSERT INTO public.question_revision_outcomes(revision_id,outcome_id,weight,is_primary)
  SELECT r.id,(o->>'outcomeId')::uuid,(o->>'weight')::numeric,COALESCE((o->>'primary')::boolean,false) FROM jsonb_array_elements(p_payload->'outcomes') o JOIN public.curriculum_outcomes co ON co.id=(o->>'outcomeId')::uuid AND co.is_active;
  IF (SELECT count(*) FROM public.question_revision_outcomes WHERE revision_id=r.id) <> jsonb_array_length(p_payload->'outcomes') THEN RAISE EXCEPTION 'outcomes must be active and unique' USING ERRCODE='22023'; END IF;
  out:=jsonb_build_object('questionId',qid,'revisionId',r.id,'revisionNo',1,'status','draft','replayed',false); INSERT INTO public.content_governance_requests VALUES(p_user_id,'create_question',p_request_id,h,out,clock_timestamp()); RETURN out;
END
$fn$;

CREATE OR REPLACE FUNCTION public.publish_question_content_revision(p_user_id uuid,p_revision_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE r public.question_content_revisions%ROWTYPE; q public.questions%ROWTYPE; h text; old public.content_governance_requests%ROWTYPE; out jsonb;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.publish') THEN RAISE EXCEPTION 'content publish permission required' USING ERRCODE='42501'; END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'publish_revision',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object('revisionId',p_revision_id)); SELECT * INTO old FROM public.content_governance_requests WHERE user_id=p_user_id AND operation='publish_revision' AND request_id=p_request_id; IF FOUND THEN IF old.payload_hash<>h THEN RAISE EXCEPTION 'publish request payload mismatch' USING ERRCODE='22023'; END IF; RETURN old.result||jsonb_build_object('replayed',true); END IF;
  SELECT * INTO r FROM public.question_content_revisions WHERE id=p_revision_id FOR UPDATE; IF NOT FOUND OR r.status<>'stage2_approved' THEN RAISE EXCEPTION 'two-stage approved revision required' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.question_revision_approvals a JOIN public.question_revision_approvals b ON b.revision_id=a.revision_id WHERE a.revision_id=r.id AND a.stage=1 AND b.stage=2 AND a.decision='approved' AND b.decision='approved' AND a.reviewer_id<>b.reviewer_id AND a.reviewer_id<>r.prepared_by AND b.reviewer_id<>r.prepared_by) THEN RAISE EXCEPTION 'independent approvals required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('content-publish:'||r.question_id::text,0)); SELECT * INTO q FROM public.questions WHERE id=r.question_id FOR UPDATE;
  IF q.published_revision_id IS DISTINCT FROM r.base_revision_id THEN RAISE EXCEPTION 'stale revision cannot publish' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM public.question_revision_outcomes WHERE revision_id=r.id) NOT BETWEEN 1 AND 5 OR NOT EXISTS(SELECT 1 FROM public.question_revision_outcomes WHERE revision_id=r.id AND is_primary) OR NOT EXISTS(SELECT 1 FROM public.question_revision_sources WHERE revision_id=r.id) THEN RAISE EXCEPTION 'revision evidence incomplete' USING ERRCODE='22023'; END IF;
  PERFORM public.content_governance_authorize_question_write(r.question_id,'publish');
  UPDATE public.questions SET content=r.content,game=r.game,category=r.category,subcategory=r.subcategory,topic=r.topic,difficulty=r.difficulty,level_tag=r.level_tag,exam_ref=r.exam_ref,is_boss=r.is_boss,is_active=(r.change_kind<>'retire'),published_revision_id=r.id WHERE id=r.question_id;
  PERFORM public.content_governance_clear_question_write(r.question_id);
  DELETE FROM public.question_outcomes WHERE question_id=r.question_id; INSERT INTO public.question_outcomes(question_id,outcome_id,weight,is_primary) SELECT r.question_id,outcome_id,weight,is_primary FROM public.question_revision_outcomes WHERE revision_id=r.id;
  UPDATE public.question_content_revisions SET status='superseded' WHERE question_id=r.question_id AND status='published' AND id<>r.id; UPDATE public.question_content_revisions SET status='published',published_at=clock_timestamp() WHERE id=r.id;
  INSERT INTO public.question_governance_events(question_id,revision_id,actor_id,event_type,public_reason) VALUES(r.question_id,r.id,p_user_id,'published','Two-stage approved revision published');
  out:=jsonb_build_object('questionId',r.question_id,'revisionId',r.id,'status','published','replayed',false); INSERT INTO public.content_governance_requests VALUES(p_user_id,'publish_revision',p_request_id,h,out,clock_timestamp()); RETURN out;
END
$fn$;

CREATE OR REPLACE FUNCTION public.quarantine_question_content(p_user_id uuid,p_question_id uuid,p_reason text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE q public.questions%ROWTYPE; h text; old public.content_governance_requests%ROWTYPE; out jsonb;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.corrections.apply') OR char_length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid quarantine' USING ERRCODE='22023'; END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'quarantine_question',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object('questionId',p_question_id,'reason',p_reason)); SELECT * INTO old FROM public.content_governance_requests WHERE user_id=p_user_id AND operation='quarantine_question' AND request_id=p_request_id; IF FOUND THEN IF old.payload_hash<>h THEN RAISE EXCEPTION 'quarantine request payload mismatch' USING ERRCODE='22023'; END IF; RETURN old.result||jsonb_build_object('replayed',true); END IF;
  SELECT * INTO q FROM public.questions WHERE id=p_question_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'question not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.content_governance_authorize_question_write(p_question_id,'quarantine');
  UPDATE public.questions SET is_active=false WHERE id=p_question_id;
  PERFORM public.content_governance_clear_question_write(p_question_id);
  INSERT INTO public.question_governance_events(question_id,revision_id,actor_id,event_type,public_reason) VALUES(p_question_id,q.published_revision_id,p_user_id,'quarantined',p_reason); out:=jsonb_build_object('questionId',p_question_id,'status','quarantined','replayed',false); INSERT INTO public.content_governance_requests VALUES(p_user_id,'quarantine_question',p_request_id,h,out,clock_timestamp()); RETURN out;
END
$fn$;

REVOKE ALL ON FUNCTION public.content_governance_authorize_question_write(uuid,text),
  public.content_governance_clear_question_write(uuid)
  FROM PUBLIC,anon,authenticated,service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
