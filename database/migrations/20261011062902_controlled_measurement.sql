-- Opt-in measurement collection; NO form seed, learner activation or calibration.
-- Reuses immutable question revisions and existing authoritative source gates.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE TABLE IF NOT EXISTS public.measurement_forms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 game text NOT NULL CHECK(game IN ('matematik','turkce','fen','sosyal')),
 exam_ref text NOT NULL CHECK(exam_ref IN ('TYT','LGS')),
 exam_year integer NOT NULL CHECK(exam_year BETWEEN 2026 AND 2100),
 protocol text NOT NULL DEFAULT 'closed-measurement@1' CHECK(protocol='closed-measurement@1'),
 -- Ordered, fixed form. Not an adaptive test or a whole-curriculum blueprint.
 pins jsonb NOT NULL CHECK(jsonb_typeof(pins)='array' AND jsonb_array_length(pins) BETWEEN 5 AND 30),
 form_sha256 text NOT NULL CHECK(form_sha256 ~ '^[a-f0-9]{64}$'),
 acceptance_ref text NOT NULL CHECK(length(btrim(acceptance_ref)) BETWEEN 1 AND 1000),
 accepted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(exam_ref='LGS' OR game='matematik')
);
-- Separate switch permits withdrawal without modifying the immutable form.
CREATE TABLE IF NOT EXISTS public.measurement_form_releases (
 form_id uuid PRIMARY KEY REFERENCES public.measurement_forms(id) ON DELETE RESTRICT,
 enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.measurement_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 form_id uuid NOT NULL REFERENCES public.measurement_forms(id) ON DELETE RESTRICT,
 request_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','abandoned','expired')),
 answered integer NOT NULL DEFAULT 0 CHECK(answered BETWEEN 0 AND 30),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '2 hours',
 completed_at timestamptz,
 UNIQUE(user_id,request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS measurement_one_active_user ON public.measurement_sessions(user_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS measurement_sessions_form ON public.measurement_sessions(form_id);
CREATE TABLE IF NOT EXISTS public.measurement_items (
 session_id uuid NOT NULL REFERENCES public.measurement_sessions(id) ON DELETE CASCADE,
 position integer NOT NULL CHECK(position BETWEEN 1 AND 30),
 question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
 revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
 content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[a-f0-9]{64}$'),
 prior_recorded_exposure boolean NOT NULL,
 issued_at timestamptz,
 acknowledged_at timestamptz,
 render_version text,
 render_ok boolean NOT NULL DEFAULT false,
 assistance_used boolean NOT NULL DEFAULT false,
 interrupted boolean NOT NULL DEFAULT false,
 selected_option integer CHECK(selected_option BETWEEN -1 AND 4),
 answered_at timestamptz,
 server_elapsed_ms bigint,
 request_id uuid,
 PRIMARY KEY(session_id,position), UNIQUE(session_id,question_id), UNIQUE(session_id,request_id),
 CHECK((answered_at IS NULL)=(selected_option IS NULL))
);
CREATE INDEX IF NOT EXISTS measurement_items_question ON public.measurement_items(question_id,session_id);
CREATE INDEX IF NOT EXISTS measurement_items_revision ON public.measurement_items(revision_id);

ALTER TABLE public.measurement_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measurement_form_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measurement_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measurement_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.measurement_forms,public.measurement_form_releases,public.measurement_sessions,public.measurement_items FROM PUBLIC,anon,authenticated,service_role;
-- Operator import only; learner/service_role cannot invent an approved form.
DROP TRIGGER IF EXISTS measurement_form_immutable ON public.measurement_forms;
CREATE TRIGGER measurement_form_immutable BEFORE UPDATE OR DELETE ON public.measurement_forms
 FOR EACH ROW EXECUTE FUNCTION public.question_source_review_immutable();

CREATE OR REPLACE FUNCTION public.measurement_form_ready(p_form_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE f public.measurement_forms%ROWTYPE; pin jsonb; r public.question_content_revisions%ROWTYPE;
BEGIN
 SELECT * INTO f FROM public.measurement_forms WHERE id=p_form_id;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.measurement_form_releases WHERE form_id=f.id AND enabled)
   OR f.form_sha256 IS DISTINCT FROM encode(extensions.digest(jsonb_build_object(
     'game',f.game,'examRef',f.exam_ref,'examYear',f.exam_year,'protocol',f.protocol,'pins',f.pins)::text,'sha256'),'hex')
   OR (SELECT count(DISTINCT p->>'questionId') FROM jsonb_array_elements(f.pins) p)<>jsonb_array_length(f.pins)
 THEN RETURN false; END IF;
 FOR pin IN SELECT value FROM jsonb_array_elements(f.pins) LOOP
  IF jsonb_typeof(pin)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(pin))<>3
    OR NOT(pin ?& ARRAY['questionId','revisionId','contentSha256']) THEN RETURN false; END IF;
  SELECT * INTO r FROM public.question_content_revisions WHERE id=(pin->>'revisionId')::uuid;
  IF NOT FOUND OR r.question_id IS DISTINCT FROM (pin->>'questionId')::uuid
    OR r.game IS DISTINCT FROM f.game OR r.exam_ref IS DISTINCT FROM f.exam_ref
    OR r.status<>'published' OR r.content_sha256 IS DISTINCT FROM pin->>'contentSha256'
    OR r.content_sha256 IS DISTINCT FROM encode(extensions.digest(r.content::text,'sha256'),'hex')
    OR NOT EXISTS(SELECT 1 FROM public.questions q WHERE q.id=r.question_id AND q.published_revision_id=r.id
       AND q.is_active AND q.content=r.content AND q.game::text=f.game AND q.exam_ref::text=f.exam_ref)
    OR public.question_revision_single_review_ready(r.id) IS NOT TRUE
    OR jsonb_typeof(r.content->'options') IS DISTINCT FROM 'array'
    OR jsonb_array_length(r.content->'options')<>(CASE f.exam_ref WHEN 'LGS' THEN 4 ELSE 5 END)
    OR jsonb_typeof(r.content->'question') IS DISTINCT FROM 'string'
    OR length(btrim(r.content->>'question'))=0 OR length(r.content->>'question')>20000
    OR length(r.content->>'passage')>30000
    OR jsonb_typeof(r.content->'answer') IS DISTINCT FROM 'number'
    OR COALESCE(r.content->>'answer','') !~ '^[0-4]$'
    OR (r.content->>'answer')::integer>=jsonb_array_length(r.content->'options')
    OR (r.content ? 'correct' AND r.content->'correct' IS DISTINCT FROM r.content->'answer')
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.content->'options') v WHERE jsonb_typeof(v)<>'string' OR length(btrim(v#>>'{}'))=0 OR length(v#>>'{}')>10000)
    OR (SELECT count(DISTINCT lower(btrim(v))) FROM jsonb_array_elements_text(r.content->'options') v)<>jsonb_array_length(r.content->'options')
    -- First renderer handles plain/Unicode text and <u>, not LaTeX or media.
    OR r.content ?| ARRAY['image','imageUrl','image_url','diagram','svg','table','figure','media']
    OR EXISTS(SELECT 1 FROM (
      SELECT r.content->>'question' AS t UNION ALL SELECT r.content->>'passage'
      UNION ALL SELECT r.content->>'solution' UNION ALL SELECT r.content->>'explanation'
      UNION ALL SELECT value FROM jsonb_array_elements_text(r.content->'options')
    ) texts WHERE strpos(t,chr(92))>0 OR strpos(t,'$')>0 OR replace(replace(t,'<u>',''),'</u>','') ~ '<[/]?[A-Za-z]')
    OR (r.content ? 'passage' AND jsonb_typeof(r.content->'passage') NOT IN ('string','null'))
  THEN RETURN false; END IF;
  -- Existing LGS year acceptance is mandatory, not inferred from 2026 receipts.
  IF f.exam_ref='LGS' AND NOT EXISTS(SELECT 1 FROM public.question_revision_source_reviews e
    WHERE e.revision_id=r.id AND e.content_sha256=r.content_sha256
      AND e.report#>>'{curriculumBinding,examYear}'=f.exam_year::text
      AND public.question_source_curriculum_binding_valid(r.id,e.report)) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN invalid_text_representation OR invalid_parameter_value OR numeric_value_out_of_range THEN RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.measurement_public_session(p_user_id uuid,p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s public.measurement_sessions%ROWTYPE; f public.measurement_forms%ROWTYPE;
 q jsonb; feedback jsonb; state text;
BEGIN
 SELECT * INTO s FROM public.measurement_sessions WHERE id=p_session_id AND user_id=p_user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'measurement not found' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT f FROM public.measurement_forms WHERE id=s.form_id;
 state:=CASE WHEN s.status='active' AND s.expires_at<=clock_timestamp() THEN 'expired' ELSE s.status END;
 IF state IN ('active','completed') AND NOT public.measurement_form_ready(f.id) THEN state:='withdrawn'; END IF;
 IF state='active' THEN
  SELECT jsonb_build_object('id',i.question_id,'position',i.position,'text',r.content->>'question',
    'passage',r.content->>'passage','options',r.content->'options') INTO q
   FROM public.measurement_items i JOIN public.question_content_revisions r ON r.id=i.revision_id
   WHERE i.session_id=s.id AND i.position=s.answered+1;
 END IF;
 IF state='completed' THEN
  SELECT jsonb_agg(jsonb_build_object('questionId',i.question_id,'position',i.position,
    'text',r.content->>'question','selectedText',CASE WHEN i.selected_option>=0 THEN r.content->'options'->>i.selected_option ELSE NULL END,
    'correctText',r.content->'options'->>(r.content->>'answer')::integer,
    'isCorrect',i.selected_option=(r.content->>'answer')::integer,
    'solution',COALESCE(r.content->>'solution',r.content->>'explanation')) ORDER BY i.position) INTO feedback
   FROM public.measurement_items i JOIN public.question_content_revisions r ON r.id=i.revision_id WHERE i.session_id=s.id;
 END IF;
 RETURN jsonb_build_object('id',s.id,'formId',f.id,'game',f.game,'examRef',f.exam_ref,'examYear',f.exam_year,
   'protocol',f.protocol,'status',state,'answered',s.answered,'questionCount',jsonb_array_length(f.pins),
   'expiresAt',s.expires_at,'question',q,'feedback',feedback,'calibrated',false);
END $$;

CREATE OR REPLACE FUNCTION public.get_measurement_context(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE forms jsonb; sid uuid;
BEGIN
 IF p_user_id IS NULL THEN RAISE EXCEPTION 'user required' USING ERRCODE='42501'; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',id,'game',game,'examRef',exam_ref,'examYear',exam_year,
   'questionCount',jsonb_array_length(pins)) ORDER BY accepted_at,id) INTO forms
 FROM public.measurement_forms WHERE public.measurement_form_ready(id);
 SELECT id INTO sid FROM public.measurement_sessions WHERE user_id=p_user_id ORDER BY started_at DESC,id DESC LIMIT 1;
 RETURN jsonb_build_object('forms',COALESCE(forms,'[]'::jsonb),
   'session',CASE WHEN sid IS NOT NULL THEN public.measurement_public_session(p_user_id,sid) ELSE NULL END);
END $$;

CREATE OR REPLACE FUNCTION public.start_measurement(p_user_id uuid,p_form_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s public.measurement_sessions%ROWTYPE; f public.measurement_forms%ROWTYPE; pin jsonb; pos integer:=0;
BEGIN
 IF p_user_id IS NULL OR p_form_id IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'request required' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('measurement:'||p_user_id::text,0));
 SELECT * INTO s FROM public.measurement_sessions WHERE user_id=p_user_id AND request_id=p_request_id;
 IF FOUND THEN
  IF s.form_id<>p_form_id THEN RAISE EXCEPTION 'request reuse mismatch' USING ERRCODE='22023'; END IF;
  RETURN public.measurement_public_session(p_user_id,s.id);
 END IF;
 UPDATE public.measurement_sessions SET status='expired' WHERE user_id=p_user_id AND status='active' AND expires_at<=clock_timestamp();
 IF EXISTS(SELECT 1 FROM public.measurement_sessions WHERE user_id=p_user_id AND status='active') THEN
  RAISE EXCEPTION 'resume or abandon active measurement' USING ERRCODE='55000'; END IF;
 IF NOT public.measurement_form_ready(p_form_id) THEN RAISE EXCEPTION 'form unavailable' USING ERRCODE='55000'; END IF;
 SELECT * INTO STRICT f FROM public.measurement_forms WHERE id=p_form_id;
 INSERT INTO public.measurement_sessions(user_id,form_id,request_id) VALUES(p_user_id,f.id,p_request_id) RETURNING * INTO s;
 FOR pin IN SELECT value FROM jsonb_array_elements(f.pins) LOOP
  pos:=pos+1;
  INSERT INTO public.measurement_items(session_id,position,question_id,revision_id,content_sha256,prior_recorded_exposure,issued_at)
  VALUES(s.id,pos,(pin->>'questionId')::uuid,(pin->>'revisionId')::uuid,pin->>'contentSha256',
    EXISTS(SELECT 1 FROM public.session_answers a WHERE a.user_id=p_user_id AND a.question_id=(pin->>'questionId')::uuid)
    OR EXISTS(SELECT 1 FROM public.adaptive_diagnostic_answers a WHERE a.user_id=p_user_id AND a.question_id=(pin->>'questionId')::uuid)
    OR EXISTS(SELECT 1 FROM public.verified_attempts a WHERE a.user_id=p_user_id AND (pin->>'questionId')::uuid=ANY(a.question_ids))
    OR EXISTS(SELECT 1 FROM public.measurement_items i JOIN public.measurement_sessions other ON other.id=i.session_id
      WHERE other.user_id=p_user_id AND other.id<>s.id AND i.question_id=(pin->>'questionId')::uuid AND i.issued_at IS NOT NULL),
    CASE WHEN pos=1 THEN clock_timestamp() ELSE NULL END);
 END LOOP;
 RETURN public.measurement_public_session(p_user_id,s.id);
END $$;

CREATE OR REPLACE FUNCTION public.record_measurement_event(p_user_id uuid,p_session_id uuid,p_action text,
 p_position integer,p_request_id uuid,p_selected_option integer,p_render_ok boolean,p_assistance_used boolean,p_interrupted boolean,p_render_version text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s public.measurement_sessions%ROWTYPE; i public.measurement_items%ROWTYPE; content jsonb; total integer;
BEGIN
 SELECT * INTO s FROM public.measurement_sessions WHERE id=p_session_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'measurement not found' USING ERRCODE='42501'; END IF;
 -- Abandon is always available, including after withdrawal/expiry.
 IF p_action='abandon' THEN
  UPDATE public.measurement_sessions SET status='abandoned' WHERE id=s.id AND status='active';
  RETURN public.measurement_public_session(p_user_id,s.id);
 END IF;
 IF p_action NOT IN ('acknowledge','answer') OR p_action IS NULL OR p_request_id IS NULL THEN
  RAISE EXCEPTION 'invalid measurement event' USING ERRCODE='22023'; END IF;
 SELECT * INTO i FROM public.measurement_items WHERE session_id=s.id AND position=p_position;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid position' USING ERRCODE='22023'; END IF;
 IF p_action='answer' AND i.answered_at IS NOT NULL THEN
  IF i.request_id IS DISTINCT FROM p_request_id OR i.selected_option IS DISTINCT FROM p_selected_option THEN
   RAISE EXCEPTION 'first answer locked' USING ERRCODE='55000'; END IF;
  RETURN public.measurement_public_session(p_user_id,s.id);
 END IF;
 IF s.status<>'active' OR s.expires_at<=clock_timestamp() OR p_position<>s.answered+1
   OR NOT public.measurement_form_ready(s.form_id) THEN
  RAISE EXCEPTION 'measurement not active' USING ERRCODE='55000'; END IF;
 IF p_render_ok IS NULL OR p_assistance_used IS NULL OR p_interrupted IS NULL
   OR p_render_version IS DISTINCT FROM 'measurement-text@1' THEN
  RAISE EXCEPTION 'render declaration required' USING ERRCODE='22023'; END IF;
 -- False render / true assistance and interruption are sticky; never upgrade a bad receipt.
 UPDATE public.measurement_items SET
   render_ok=CASE WHEN acknowledged_at IS NULL THEN p_render_ok ELSE render_ok AND p_render_ok END,
   assistance_used=assistance_used OR p_assistance_used, interrupted=interrupted OR p_interrupted,
   acknowledged_at=COALESCE(acknowledged_at,clock_timestamp()),render_version=p_render_version
 WHERE session_id=s.id AND position=p_position;
 IF p_action='answer' THEN
  IF i.acknowledged_at IS NULL THEN RAISE EXCEPTION 'acknowledge before answer' USING ERRCODE='22023'; END IF;
  SELECT r.content INTO STRICT content FROM public.question_content_revisions r WHERE r.id=i.revision_id;
  IF p_selected_option IS NULL OR p_selected_option NOT BETWEEN -1 AND jsonb_array_length(content->'options')-1 THEN
   RAISE EXCEPTION 'invalid option' USING ERRCODE='22023'; END IF;
  UPDATE public.measurement_items SET selected_option=p_selected_option,answered_at=clock_timestamp(),request_id=p_request_id,
    server_elapsed_ms=floor(extract(epoch FROM (clock_timestamp()-issued_at))*1000)::bigint
  WHERE session_id=s.id AND position=p_position;
  SELECT jsonb_array_length(pins) INTO STRICT total FROM public.measurement_forms WHERE id=s.form_id;
  UPDATE public.measurement_sessions SET answered=answered+1,
    status=CASE WHEN answered+1=total THEN 'completed' ELSE 'active' END,
    completed_at=CASE WHEN answered+1=total THEN clock_timestamp() ELSE NULL END WHERE id=s.id;
  UPDATE public.measurement_items SET issued_at=clock_timestamp() WHERE session_id=s.id AND position=p_position+1;
 END IF;
 RETURN public.measurement_public_session(p_user_id,s.id);
END $$;

-- Existing practice endpoints consult this before revealing any form answer.
CREATE OR REPLACE FUNCTION public.measurement_feedback_blocked(p_user_id uuid,p_question_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.measurement_sessions s JOIN public.measurement_items i ON i.session_id=s.id
 WHERE s.user_id=p_user_id AND s.status='active' AND s.expires_at>clock_timestamp() AND i.question_id=p_question_id)
$$;

-- Private, recomputed eligibility. No learner labels, reward or mastery writes.
CREATE OR REPLACE VIEW public.measurement_evidence_v1 WITH (security_invoker=true) AS
 SELECT s.form_id,s.id AS session_id,s.user_id,i.position,i.question_id,i.revision_id,i.content_sha256,
 i.selected_option,i.selected_option=(r.content->>'answer')::integer AS is_correct,i.server_elapsed_ms,
 array_remove(ARRAY[
   CASE WHEN s.status<>'completed' THEN 'incomplete_session' END,
   CASE WHEN i.prior_recorded_exposure THEN 'prior_recorded_exposure' END,
   CASE WHEN EXISTS(SELECT 1 FROM public.verified_attempts va WHERE va.user_id=s.user_id
     AND i.question_id=ANY(va.question_ids) AND va.started_at<=COALESCE(s.completed_at,clock_timestamp())) THEN 'practice_issuance_recorded' END,
   CASE WHEN EXISTS(SELECT 1 FROM public.session_answers a WHERE a.user_id=s.user_id AND a.question_id=i.question_id
       AND a.answered_at<=COALESCE(s.completed_at,clock_timestamp()))
     OR EXISTS(SELECT 1 FROM public.adaptive_diagnostic_answers a WHERE a.user_id=s.user_id AND a.question_id=i.question_id
       AND a.created_at<=COALESCE(s.completed_at,clock_timestamp()))
     THEN 'other_answer_recorded' END,
   CASE WHEN i.selected_option IS NULL OR i.selected_option=-1 THEN 'unanswered' END,
   CASE WHEN i.acknowledged_at IS NULL OR NOT i.render_ok THEN 'render_unconfirmed' END,
   CASE WHEN i.assistance_used THEN 'declared_assistance' END,
   CASE WHEN i.interrupted THEN 'interrupted' END,
   CASE WHEN i.server_elapsed_ms IS NULL OR i.server_elapsed_ms NOT BETWEEN 1000 AND 600000 THEN 'timing_out_of_range' END,
   CASE WHEN q.published_revision_id<>i.revision_id OR NOT q.is_active THEN 'revision_withdrawn' END,
   CASE WHEN NOT public.measurement_form_ready(s.form_id) THEN 'form_not_ready' END
 ],NULL) AS exclusion_reasons
 FROM public.measurement_sessions s JOIN public.measurement_items i ON i.session_id=s.id
 JOIN public.question_content_revisions r ON r.id=i.revision_id JOIN public.questions q ON q.id=i.question_id;
REVOKE ALL ON public.measurement_evidence_v1 FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.measurement_form_ready(uuid),public.measurement_public_session(uuid,uuid),
 public.get_measurement_context(uuid),public.start_measurement(uuid,uuid,uuid),
 public.record_measurement_event(uuid,uuid,text,integer,uuid,integer,boolean,boolean,boolean,text),
 public.measurement_feedback_blocked(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_measurement_context(uuid),public.start_measurement(uuid,uuid,uuid),
 public.record_measurement_event(uuid,uuid,text,integer,uuid,integer,boolean,boolean,boolean,text),
 public.measurement_feedback_blocked(uuid,uuid) TO service_role;
-- Preserve the existing subject-only export and include new child evidence.
CREATE OR REPLACE FUNCTION public.export_account_data(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = pg_catalog
AS $function$
DECLARE
  v_table record;
  v_predicate text;
  v_rows jsonb;
  v_tables jsonb := '{}'::jsonb;
  v_candidate_policy jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'account export subject required' USING ERRCODE = '22023';
  END IF;

  FOR v_table IN
    SELECT relation.relname,
           array_agg(attribute.attname::text ORDER BY attribute.attnum) AS link_columns
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid = relation.oid
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND relation.relname <> ALL (ARRAY[
        'user_reports',
        'candidate_exam_policy_events',
        'verified_attempt_candidate_policy_snapshots',
        'daily_plan_candidate_policy_snapshots'
      ]::text[])
      AND attribute.attnum > 0 AND NOT attribute.attisdropped
      AND attribute.atttypid = 'uuid'::regtype
      AND (
        attribute.attname = ANY (ARRAY[
          'user_id','student_id','owner_id','target_user_id','manager_user_id',
          'previous_manager_user_id','blocker_id','blocked_id','friend_id',
          'recipient_id','sender_id'
        ])
        OR (relation.relname = 'profiles' AND attribute.attname = 'id')
      )
    GROUP BY relation.oid, relation.relname
    ORDER BY relation.relname
  LOOP
    SELECT string_agg(format('subject_row.%I = $1', link_column), ' OR ')
      INTO v_predicate
      FROM unnest(v_table.link_columns) AS link_column;

    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(to_jsonb(subject_row)), ''[]''::jsonb) FROM public.%I AS subject_row WHERE %s',
      v_table.relname,
      v_predicate
    ) INTO v_rows USING p_user_id;
    IF jsonb_array_length(v_rows) > 0 THEN
      v_tables := v_tables || jsonb_build_object(v_table.relname, v_rows);
    END IF;
  END LOOP;

  EXECUTE
    'SELECT COALESCE(jsonb_agg(to_jsonb(answer_row)), ''[]''::jsonb)
       FROM public.session_answers AS answer_row
       JOIN public.game_sessions AS session_row ON session_row.id = answer_row.session_id
      WHERE session_row.user_id = $1'
    INTO v_rows USING p_user_id;
  IF jsonb_array_length(v_rows) > 0 THEN
    v_tables := v_tables || jsonb_build_object('session_answers', v_rows);
  END IF;

  EXECUTE
    'SELECT COALESCE(jsonb_agg(to_jsonb(item_row)), ''[]''::jsonb)
       FROM public.teacher_assignment_submission_items AS item_row
       JOIN public.teacher_assignment_submissions AS submission_row
         ON submission_row.id = item_row.submission_id
      WHERE submission_row.student_id = $1'
    INTO v_rows USING p_user_id;
  IF jsonb_array_length(v_rows) > 0 THEN
    v_tables := v_tables || jsonb_build_object('teacher_assignment_submission_items', v_rows);
  END IF;

  IF to_regclass('public.user_reports') IS NOT NULL THEN
    EXECUTE
      'SELECT COALESCE(
         jsonb_agg(
           jsonb_build_object(
             ''id'', report_row.id,
             ''reportedUserId'', report_row.reported_user_id,
             ''reportType'', report_row.report_type,
             ''reason'', report_row.reason,
             ''status'', report_row.status,
             ''createdAt'', report_row.created_at,
             ''updatedAt'', report_row.updated_at
           ) ORDER BY report_row.created_at, report_row.id
         ),
         ''[]''::jsonb
       )
       FROM public.user_reports AS report_row
       WHERE report_row.reporter_id = $1'
      INTO v_rows USING p_user_id;
    IF jsonb_array_length(v_rows) > 0 THEN
      v_tables := v_tables || jsonb_build_object('user_reports', v_rows);
    END IF;
  END IF;

  v_candidate_policy := public.export_tyt_social_candidate_policy_data(p_user_id);
  IF jsonb_array_length(v_candidate_policy -> 'selectionEvents') > 0
     OR jsonb_array_length(v_candidate_policy -> 'attemptProvenance') > 0
     OR jsonb_array_length(v_candidate_policy -> 'dailyPlanProvenance') > 0 THEN
    v_tables := v_tables || jsonb_build_object(
      'tyt_social_candidate_policy',
      v_candidate_policy
    );
  END IF;

  -- Include child answers through the authenticated subject's own session.
  -- No answer keys, question content or other learners are joined.
  SELECT COALESCE(jsonb_agg(to_jsonb(item_row) ORDER BY item_row.session_id,item_row.position),'[]'::jsonb)
    INTO v_rows
    FROM public.measurement_items item_row
    JOIN public.measurement_sessions session_row ON session_row.id=item_row.session_id
    WHERE session_row.user_id=p_user_id;
  IF jsonb_array_length(v_rows)>0 THEN
    v_tables:=v_tables||jsonb_build_object('measurement_items',v_rows);
  END IF;

  RETURN jsonb_build_object(
    'tables', v_tables,
    'coverage', jsonb_build_object(
      'directSubjectColumns', true,
      'relatedTables', jsonb_build_array(
        'session_answers',
        'measurement_items',
        'teacher_assignment_submission_items',
        'user_reports_safe_projection',
        'tyt_social_candidate_policy_safe_projection'
      )
    )
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.export_account_data(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.export_account_data(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
