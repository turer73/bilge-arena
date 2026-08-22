-- Migration 139: revision-bound, provenance-labelled question appeal evidence.
--
-- This is deliberately additive: the legacy submit RPC remains available for
-- compatibility, while new callers must use submit_question_appeal_v2.
BEGIN;

ALTER TABLE public.question_appeals
  ADD COLUMN IF NOT EXISTS attempt_id uuid REFERENCES public.verified_attempts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS evidence_kind text;

CREATE INDEX IF NOT EXISTS question_appeals_revision_signal_idx
  ON public.question_appeals(revision_id,status,reason_code)
  WHERE revision_id IS NOT NULL;

-- Existing rows do not gain a claim of verified evidence merely because they
-- happened to contain an answer reference before snapshot binding existed.
UPDATE public.question_appeals
SET evidence_kind = CASE
  WHEN legacy_error_report_id IS NOT NULL THEN 'legacy_report'
  WHEN session_answer_id IS NOT NULL THEN 'legacy_session'
  ELSE 'current_revision'
END
WHERE evidence_kind IS NULL;

DO $body$
BEGIN
  IF EXISTS (SELECT 1 FROM public.question_appeals WHERE evidence_kind IS NULL) THEN
    RAISE EXCEPTION 'question appeal evidence kind backfill incomplete';
  END IF;

  ALTER TABLE public.question_appeals
    ALTER COLUMN evidence_kind SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.question_appeals'::regclass
      AND conname = 'question_appeals_evidence_kind_check'
  ) THEN
    ALTER TABLE public.question_appeals
      ADD CONSTRAINT question_appeals_evidence_kind_check
      CHECK (evidence_kind IN ('legacy_report','legacy_session','current_revision','issued_attempt','verified_session'));
  END IF;

END
$body$;

CREATE OR REPLACE FUNCTION public.submit_question_appeal_v2(
  p_user_id uuid,
  p_question_id uuid,
  p_session_answer_id uuid,
  p_attempt_id uuid,
  p_reason text,
  p_description text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_answer public.session_answers%ROWTYPE;
  v_revision_id uuid;
  v_bound_attempt_id uuid;
  v_evidence_kind text;
  v_payload_hash text;
  v_old public.content_governance_requests%ROWTYPE;
  v_appeal public.question_appeals%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL
    OR p_question_id IS NULL
    OR p_request_id IS NULL
    OR p_reason NOT IN ('wrong_key','ambiguous','invalid_content','outcome_mismatch','other')
    OR char_length(btrim(COALESCE(p_description,''))) NOT BETWEEN 0 AND 1000 THEN
    RAISE EXCEPTION 'invalid appeal' USING ERRCODE = '22023';
  END IF;

  IF p_session_answer_id IS NOT NULL AND p_attempt_id IS NOT NULL THEN
    RAISE EXCEPTION 'ambiguous appeal evidence: session and attempt are mutually exclusive'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.content_governance_lock_request(p_user_id,'submit_appeal_v2',p_request_id);
  v_payload_hash := public.content_governance_hash(jsonb_build_object(
    'questionId',p_question_id,
    'sessionAnswerId',p_session_answer_id,
    'attemptId',p_attempt_id,
    'reason',p_reason,
    'description',p_description
  ));

  SELECT * INTO v_old
  FROM public.content_governance_requests
  WHERE user_id=p_user_id AND operation='submit_appeal_v2' AND request_id=p_request_id;
  IF FOUND THEN
    IF v_old.payload_hash<>v_payload_hash THEN
      RAISE EXCEPTION 'appeal request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_old.result || jsonb_build_object('replayed',true);
  END IF;

  IF p_session_answer_id IS NOT NULL THEN
    SELECT * INTO v_answer
    FROM public.session_answers
    WHERE id=p_session_answer_id AND user_id=p_user_id AND question_id=p_question_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'appeal answer owner mismatch' USING ERRCODE = '42501';
    END IF;

    -- A session answer is evidence only after completed-attempt snapshot binding.
    SELECT va.id, snap.revision_id INTO v_bound_attempt_id, v_revision_id
    FROM public.verified_attempts va
    JOIN public.game_sessions game_session
      ON game_session.id=va.session_id AND game_session.status='completed'
    JOIN public.verified_attempt_question_revisions snap
      ON snap.attempt_id=va.id
      AND snap.question_id=v_answer.question_id
      AND snap.revision_id=v_answer.question_revision_id
    JOIN public.question_content_revisions rev
      ON rev.id=snap.revision_id AND rev.question_id=v_answer.question_id
    WHERE va.session_id=v_answer.session_id
      AND va.user_id=p_user_id
      AND va.completed_at IS NOT NULL
      AND v_answer.question_revision_id IS NOT NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'verified session evidence required' USING ERRCODE = '22023';
    END IF;
    v_evidence_kind := 'verified_session';

  ELSIF p_attempt_id IS NOT NULL THEN
    -- Issued-attempt evidence need not be completed, but must be the caller's
    -- own immutable question snapshot.
    SELECT snap.revision_id INTO v_revision_id
    FROM public.verified_attempts va
    JOIN public.verified_attempt_question_revisions snap
      ON snap.attempt_id=va.id AND snap.question_id=p_question_id
    JOIN public.question_content_revisions rev
      ON rev.id=snap.revision_id AND rev.question_id=p_question_id
    WHERE va.id=p_attempt_id AND va.user_id=p_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'verified attempt snapshot required' USING ERRCODE = '42501';
    END IF;
    v_bound_attempt_id := p_attempt_id;
    v_evidence_kind := 'issued_attempt';

  ELSE
    SELECT rev.id INTO v_revision_id
    FROM public.questions q
    JOIN public.question_content_revisions rev
      ON rev.id=q.published_revision_id
      AND rev.question_id=q.id
      AND rev.status='published'
    WHERE q.id=p_question_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'published question revision required' USING ERRCODE = '22023';
    END IF;
    v_evidence_kind := 'current_revision';
  END IF;

  INSERT INTO public.question_appeals(
    user_id,question_id,session_answer_id,attempt_id,revision_id,evidence_kind,reason_code,description
  ) VALUES (
    p_user_id,p_question_id,p_session_answer_id,v_bound_attempt_id,v_revision_id,v_evidence_kind,p_reason,p_description
  ) RETURNING * INTO v_appeal;

  INSERT INTO public.question_appeal_events(appeal_id,actor_id,event_type,public_message)
  VALUES(v_appeal.id,p_user_id,'submitted','Your appeal was received.');

  v_result := jsonb_build_object(
    'appealId',v_appeal.id,
    'status','submitted',
    'evidenceKind',v_evidence_kind,
    'ackDueAt',v_appeal.ack_due_at,
    'resolveDueAt',v_appeal.resolve_due_at,
    'replayed',false
  );
  INSERT INTO public.content_governance_requests
  VALUES(p_user_id,'submit_appeal_v2',p_request_id,v_payload_hash,v_result,clock_timestamp());
  RETURN v_result;
END
$fn$;

-- Keep the pre-v2 endpoint callable during rollout.  It cannot claim the new
-- snapshot evidence guarantee, so its rows are explicitly labelled legacy.
CREATE OR REPLACE FUNCTION public.submit_question_appeal(p_user_id uuid,p_question_id uuid,p_session_answer_id uuid,p_reason text,p_description text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE a public.session_answers%ROWTYPE; r uuid; h text; old public.content_governance_requests%ROWTYPE; appeal public.question_appeals%ROWTYPE; out jsonb;
BEGIN
  IF p_user_id IS NULL OR p_question_id IS NULL OR p_request_id IS NULL OR p_reason NOT IN ('wrong_key','ambiguous','invalid_content','outcome_mismatch','other') OR char_length(btrim(COALESCE(p_description,''))) NOT BETWEEN 0 AND 1000 THEN RAISE EXCEPTION 'invalid appeal' USING ERRCODE='22023'; END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'submit_appeal',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object('questionId',p_question_id,'sessionAnswerId',p_session_answer_id,'reason',p_reason,'description',p_description)); SELECT * INTO old FROM public.content_governance_requests WHERE user_id=p_user_id AND operation='submit_appeal' AND request_id=p_request_id; IF FOUND THEN IF old.payload_hash<>h THEN RAISE EXCEPTION 'appeal request payload mismatch' USING ERRCODE='22023'; END IF; RETURN old.result||jsonb_build_object('replayed',true); END IF;
  IF p_session_answer_id IS NOT NULL THEN SELECT * INTO a FROM public.session_answers WHERE id=p_session_answer_id AND user_id=p_user_id AND question_id=p_question_id; IF NOT FOUND THEN RAISE EXCEPTION 'appeal answer owner mismatch' USING ERRCODE='42501'; END IF; r:=a.question_revision_id; ELSE SELECT published_revision_id INTO r FROM public.questions WHERE id=p_question_id; END IF;
  INSERT INTO public.question_appeals(user_id,question_id,session_answer_id,revision_id,evidence_kind,reason_code,description) VALUES(p_user_id,p_question_id,p_session_answer_id,r,CASE WHEN p_session_answer_id IS NULL THEN 'current_revision' ELSE 'legacy_session' END,p_reason,p_description) RETURNING * INTO appeal; INSERT INTO public.question_appeal_events(appeal_id,actor_id,event_type,public_message) VALUES(appeal.id,p_user_id,'submitted','Your appeal was received.'); out:=jsonb_build_object('appealId',appeal.id,'status','submitted','ackDueAt',appeal.ack_due_at,'resolveDueAt',appeal.resolve_due_at,'replayed',false); INSERT INTO public.content_governance_requests VALUES(p_user_id,'submit_appeal',p_request_id,h,out,clock_timestamp()); RETURN out;
END $fn$;

CREATE OR REPLACE FUNCTION public.get_question_appeal_queue(p_user_id uuid,p_status text,p_limit integer,p_cursor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_limit integer:=GREATEST(1,LEAST(COALESCE(p_limit,50),100)); v_cursor_time timestamptz; v_cursor_id uuid;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.appeals.manage') THEN RAISE EXCEPTION 'appeal management permission required' USING ERRCODE='42501'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('submitted','acknowledged','investigating','resolved','rejected','withdrawn') THEN RAISE EXCEPTION 'invalid appeal queue status' USING ERRCODE='22023'; END IF;
  IF NULLIF(p_cursor,'') IS NOT NULL THEN
    BEGIN
      IF split_part(p_cursor,'|',1)='' OR split_part(p_cursor,'|',2)='' OR split_part(p_cursor,'|',3)<>'' THEN RAISE EXCEPTION 'invalid cursor'; END IF;
      v_cursor_time:=split_part(p_cursor,'|',1)::timestamptz;
      v_cursor_id:=split_part(p_cursor,'|',2)::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'invalid appeal queue cursor' USING ERRCODE='22023';
    END;
  END IF;
  RETURN (
    WITH page AS MATERIALIZED (
      SELECT a.id,a.question_id,a.revision_id,a.evidence_kind,a.reason_code,a.description,a.status,a.submitted_at,
        a.ack_due_at,a.resolve_due_at,a.sla_breached_at,
        a.evidence_kind='verified_session' AS has_session_evidence,
        a.evidence_kind IN ('verified_session','issued_attempt') AS has_verified_evidence,
        (SELECT e.public_message FROM public.question_appeal_events e WHERE e.appeal_id=a.id AND e.public_message IS NOT NULL ORDER BY e.created_at DESC,e.id DESC LIMIT 1) AS latest_public_message,
        (SELECT e.internal_note FROM public.question_appeal_events e WHERE e.appeal_id=a.id AND e.internal_note IS NOT NULL ORDER BY e.created_at DESC,e.id DESC LIMIT 1) AS latest_internal_note
      FROM public.question_appeals a
      WHERE (p_status IS NULL OR a.status=p_status)
        AND (v_cursor_time IS NULL OR (a.submitted_at,a.id)<(v_cursor_time,v_cursor_id))
      ORDER BY a.submitted_at DESC,a.id DESC LIMIT v_limit+1
    ), shown AS (SELECT * FROM page ORDER BY submitted_at DESC,id DESC LIMIT v_limit)
    SELECT jsonb_build_object(
      'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'appealId',s.id,'questionId',s.question_id,'revisionId',s.revision_id,'reasonCode',s.reason_code,
        'description',s.description,'status',s.status,'submittedAt',s.submitted_at,'ackDueAt',s.ack_due_at,
        'resolveDueAt',s.resolve_due_at,'slaBreachedAt',s.sla_breached_at,
        'evidenceKind',s.evidence_kind,'hasVerifiedEvidence',s.has_verified_evidence,
        'hasSessionEvidence',s.has_session_evidence,
        'latestPublicMessage',s.latest_public_message,'latestInternalNote',s.latest_internal_note
      ) ORDER BY s.submitted_at DESC,s.id DESC) FROM shown s),'[]'::jsonb),
      'nextCursor',CASE WHEN (SELECT count(*) FROM page)>v_limit THEN (SELECT s.submitted_at::text||'|'||s.id::text FROM shown s ORDER BY s.submitted_at ASC,s.id ASC LIMIT 1) ELSE NULL END
    )
  );
END $fn$;

REVOKE ALL ON FUNCTION public.submit_question_appeal_v2(uuid,uuid,uuid,uuid,text,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.submit_question_appeal_v2(uuid,uuid,uuid,uuid,text,text,uuid)
  TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
