-- Migration 211: an observational teacher review is not proof of completion.
-- CLI origin: 20260906073559_institution_program_completion_integrity.sql.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='15min';

-- Match 201's source-table -> global lock -> program-table migration order.
LOCK TABLE public.verified_attempts,public.adaptive_diagnostic_sessions IN SHARE ROW EXCLUSIVE MODE;
SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('institution-program-execution-integrity-v201',201)
);
LOCK TABLE public.institution_study_programs,public.institution_study_program_items,
  public.institution_study_program_item_executions,public.institution_study_program_reviews
  IN SHARE ROW EXCLUSIVE MODE;

-- This is an internal invariant, not a new API or an authorization grant.
-- Completion requires the exact program snapshot, every item (not EXISTS one),
-- and the server-owned execution bound to its actual completed source.
CREATE OR REPLACE FUNCTION public.institution_study_program_completion_ready(p_program_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT COALESCE((SELECT
    program.item_count>0
    AND (SELECT count(*) FROM public.institution_study_program_items item
      WHERE item.program_id=program.id)=program.item_count
    AND EXISTS (SELECT 1 FROM public.institution_study_program_reviews review
      WHERE review.program_id=program.id AND review.institution_id=program.institution_id
        AND review.classroom_id=program.classroom_id AND review.membership_id=program.membership_id
        AND review.student_id=program.student_id AND review.teacher_id=program.teacher_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.institution_study_program_items item
      WHERE item.program_id=program.id AND (
        item.status<>'completed' OR item.completed_at IS NULL
        OR item.target_question_count IS NULL OR item.target_question_count NOT BETWEEN 1 AND 10
        OR item.outcome_code IS NULL OR NOT EXISTS (
          SELECT 1 FROM public.institution_study_program_item_executions execution
          WHERE execution.program_id=program.id AND execution.position=item.position
            AND execution.student_id=program.student_id AND execution.task_type=item.task_type
            AND execution.game=program.game AND execution.display_exam_ref=program.display_exam_ref
            AND execution.question_exam_ref IS NOT DISTINCT FROM program.question_exam_ref
            AND execution.taxonomy_version=program.taxonomy_version
            AND execution.status='completed' AND execution.completed_at=item.completed_at
            AND execution.completed_at BETWEEN execution.started_at AND execution.expires_at
            AND (
              (item.task_type='verified_questions' AND execution.diagnostic_session_id IS NULL AND EXISTS (
                SELECT 1 FROM public.verified_attempts attempt
                WHERE attempt.id=execution.verified_attempt_id AND attempt.user_id=program.student_id
                  AND attempt.game=program.game AND attempt.mode='practice' AND attempt.session_id IS NOT NULL
                  AND attempt.started_at>=execution.started_at AND attempt.completed_at=execution.completed_at
                  AND (SELECT count(DISTINCT evidence.answer_id)
                    FROM public.mastery_outcome_evidence evidence
                    JOIN public.session_answers answer ON answer.id=evidence.answer_id
                    JOIN public.curriculum_outcomes outcome ON outcome.id=evidence.outcome_id
                    WHERE evidence.attempt_id=attempt.id AND evidence.user_id=program.student_id
                      AND answer.session_id=attempt.session_id AND answer.user_id=program.student_id
                      AND NOT COALESCE(answer.is_skipped,false) AND outcome.code=item.outcome_code
                      AND outcome.game=program.game AND outcome.exam_ref=program.display_exam_ref
                      AND outcome.taxonomy_version=program.taxonomy_version)>=item.target_question_count
              )) OR (item.task_type='diagnostic' AND execution.verified_attempt_id IS NULL AND EXISTS (
                SELECT 1 FROM public.adaptive_diagnostic_sessions session
                WHERE session.id=execution.diagnostic_session_id AND session.user_id=program.student_id
                  AND session.game=program.game AND session.exam_ref=program.display_exam_ref
                  AND session.question_exam_ref IS NOT DISTINCT FROM program.question_exam_ref
                  AND session.taxonomy_version=program.taxonomy_version AND session.status='completed'
                  AND session.started_at>=execution.started_at AND session.completed_at=execution.completed_at
                  AND (SELECT count(*) FROM public.adaptive_diagnostic_answers answer
                    WHERE answer.session_id=session.id AND answer.user_id=program.student_id)>=item.target_question_count
                  AND EXISTS (SELECT 1 FROM public.adaptive_diagnostic_answers answer
                    JOIN public.curriculum_outcomes outcome ON outcome.id=answer.outcome_id
                    WHERE answer.session_id=session.id AND answer.user_id=program.student_id
                      AND outcome.code=item.outcome_code AND outcome.game=program.game
                      AND outcome.exam_ref=program.display_exam_ref
                      AND outcome.taxonomy_version=program.taxonomy_version)
              ))
            )
        )
      )
    )
    FROM public.institution_study_programs program WHERE program.id=p_program_id),false)
$fn$;

-- Never silently reinterpret historical completed programs. Reconciliation
-- needs a separately approved evidence-specific change if this count is nonzero.
DO $precheck$
DECLARE v_invalid_count integer;
BEGIN
  SELECT count(*)::integer INTO v_invalid_count FROM public.institution_study_programs program
    WHERE program.status='completed' AND (program.completed_at IS NULL
      OR NOT public.institution_study_program_completion_ready(program.id));
  IF v_invalid_count>0 THEN
    RAISE EXCEPTION 'migration 211 precheck: % completed programs lack full trusted execution',v_invalid_count
      USING ERRCODE='23514';
  END IF;
END;
$precheck$;

CREATE OR REPLACE FUNCTION public.sync_institution_study_program_completion(p_program_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_program public.institution_study_programs%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('institution-program-execution-integrity-v201',201)
  );
  SELECT * INTO v_program FROM public.institution_study_programs
    WHERE id=p_program_id FOR UPDATE;
  IF NOT FOUND OR v_program.status<>'published' THEN RETURN; END IF;
  -- Authorization/lifecycle is rechecked even when a teacher reviewed earlier.
  IF NOT EXISTS (SELECT 1 FROM public.teacher_classroom_memberships membership
    JOIN public.teacher_classrooms classroom ON classroom.id=membership.classroom_id
      AND classroom.id=v_program.classroom_id AND classroom.institution_id=v_program.institution_id
      AND classroom.teacher_id=v_program.teacher_id AND classroom.status='active'
    JOIN public.profiles profile ON profile.id=v_program.student_id AND profile.deleted_at IS NULL
    WHERE membership.id=v_program.membership_id AND membership.student_id=v_program.student_id
      AND membership.status='active' AND public.institution_pilot_is_operational(v_program.institution_id)
      AND NOT public.teacher_classroom_is_blocked(classroom.teacher_id,v_program.student_id))
    OR NOT public.institution_pilot_has_role(v_program.teacher_id,v_program.institution_id,ARRAY['manager','teacher']::text[])
  THEN RETURN; END IF;
  IF public.institution_study_program_completion_ready(v_program.id) THEN
    UPDATE public.institution_study_programs SET status='completed',completed_at=clock_timestamp()
      WHERE id=v_program.id AND status='published';
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.sync_institution_study_program_item_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  -- Runs after 201 has bound the completed source and updated the item. The
  -- existing completion event and review ledger trace this derived transition.
  IF NEW.status='completed' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.sync_institution_study_program_completion(NEW.program_id);
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS institution_program_item_completion_sync ON public.institution_study_program_items;
CREATE TRIGGER institution_program_item_completion_sync AFTER UPDATE OF status
  ON public.institution_study_program_items FOR EACH ROW
  EXECUTE FUNCTION public.sync_institution_study_program_item_completion();

-- Deferred defense-in-depth covers direct privileged writes and future RPCs.
-- Removing/reparenting a child checks both old and new parents; a missing parent
-- is not a route to delete evidence because the existing RESTRICT FKs remain.
CREATE OR REPLACE FUNCTION public.enforce_institution_study_program_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_old_id uuid; v_new_id uuid; v_id uuid; v_program public.institution_study_programs%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='institution_study_programs' THEN
    IF TG_OP<>'INSERT' THEN v_old_id:=OLD.id; END IF;
    IF TG_OP<>'DELETE' THEN v_new_id:=NEW.id; END IF;
  ELSE
    IF TG_OP<>'INSERT' THEN v_old_id:=OLD.program_id; END IF;
    IF TG_OP<>'DELETE' THEN v_new_id:=NEW.program_id; END IF;
  END IF;
  FOR v_id IN SELECT DISTINCT parent_id FROM unnest(ARRAY[v_old_id,v_new_id]) parent_id
    WHERE parent_id IS NOT NULL ORDER BY parent_id
  LOOP
    SELECT * INTO v_program FROM public.institution_study_programs WHERE id=v_id FOR UPDATE;
    IF FOUND AND v_program.status='completed' AND (v_program.completed_at IS NULL
      OR NOT public.institution_study_program_completion_ready(v_id)) THEN
      RAISE EXCEPTION 'completed institution program requires every trusted task and a teacher review'
        USING ERRCODE='23514';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS institution_program_completion_contract ON public.institution_study_programs;
CREATE CONSTRAINT TRIGGER institution_program_completion_contract AFTER INSERT OR UPDATE OR DELETE
  ON public.institution_study_programs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.enforce_institution_study_program_completion();
DROP TRIGGER IF EXISTS institution_program_item_completion_contract ON public.institution_study_program_items;
CREATE CONSTRAINT TRIGGER institution_program_item_completion_contract AFTER INSERT OR UPDATE OR DELETE
  ON public.institution_study_program_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.enforce_institution_study_program_completion();
DROP TRIGGER IF EXISTS institution_program_execution_completion_contract ON public.institution_study_program_item_executions;
CREATE CONSTRAINT TRIGGER institution_program_execution_completion_contract AFTER INSERT OR UPDATE OR DELETE
  ON public.institution_study_program_item_executions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.enforce_institution_study_program_completion();
DROP TRIGGER IF EXISTS institution_program_review_completion_contract ON public.institution_study_program_reviews;
CREATE CONSTRAINT TRIGGER institution_program_review_completion_contract AFTER INSERT OR UPDATE OR DELETE
  ON public.institution_study_program_reviews DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.enforce_institution_study_program_completion();

CREATE OR REPLACE FUNCTION public.review_institution_study_program(
  p_user_id uuid,p_program_ref text,p_teacher_result text,p_note text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE
  v_program public.institution_study_programs%ROWTYPE;
  v_review public.institution_study_program_reviews%ROWTYPE;
  v_request public.pilot_institution_requests%ROWTYPE;
  v_today date:=(clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date;
  v_note text:=NULLIF(btrim(p_note),''); v_hash text; v_evidence jsonb; v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_program_ref IS NULL OR p_program_ref!~'^[0-9a-f]{32}$'
    OR p_teacher_result IS NULL OR p_teacher_result NOT IN ('effective','partial','ineffective','insufficient')
    OR (v_note IS NOT NULL AND char_length(v_note)>500) THEN
    RAISE EXCEPTION 'invalid institution program review' USING ERRCODE='22023';
  END IF;
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution program review actor mismatch' USING ERRCODE='42501';
  END IF;
  -- Same global ordering as the trusted attempt/diagnostic completion writers.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('institution-program-execution-integrity-v201',201)
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text||':program-review:'||p_request_id::text,0));
  SELECT program.* INTO v_program FROM public.institution_study_programs program
  JOIN public.teacher_classroom_memberships membership
    ON membership.id=program.membership_id AND membership.classroom_id=program.classroom_id
    AND membership.student_id=program.student_id AND membership.status='active'
  JOIN public.teacher_classrooms classroom ON classroom.id=program.classroom_id
    AND classroom.institution_id=program.institution_id AND classroom.teacher_id=p_user_id AND classroom.status='active'
  JOIN public.pilot_institutions institution ON institution.id=program.institution_id
    AND public.institution_pilot_is_operational(institution.id)
  JOIN public.profiles profile ON profile.id=program.student_id AND profile.deleted_at IS NULL
  WHERE program.program_ref=p_program_ref AND program.teacher_id=p_user_id
    AND program.status IN ('published','completed')
    AND NOT public.teacher_classroom_is_blocked(classroom.teacher_id,program.student_id)
  FOR UPDATE OF program;
  IF NOT FOUND OR NOT public.institution_pilot_has_role(p_user_id,v_program.institution_id,ARRAY['manager','teacher']::text[]) THEN
    RAISE EXCEPTION 'published teacher program not found' USING ERRCODE='P0002';
  END IF;
  v_hash:=public.institution_pilot_payload_hash(jsonb_build_object(
    'programRef',p_program_ref,'teacherResult',p_teacher_result,'note',v_note));
  SELECT * INTO v_request FROM public.pilot_institution_requests
    WHERE user_id=p_user_id AND operation='review_study_program' AND request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash<>v_hash THEN RAISE EXCEPTION 'program review payload mismatch' USING ERRCODE='22023'; END IF;
    RETURN v_request.result||jsonb_build_object('replayed',true);
  END IF;
  IF v_program.status<>'published' THEN
    RAISE EXCEPTION 'published teacher program not found' USING ERRCODE='P0002';
  END IF;
  IF NOT public.institution_study_program_review_ready(v_program.id,v_today) THEN
    RAISE EXCEPTION 'program review requires a mature completed execution' USING ERRCODE='22023';
  END IF;
  v_evidence:=public.institution_study_program_review_evidence(v_program.id);
  INSERT INTO public.institution_study_program_reviews(
    program_id,institution_id,classroom_id,membership_id,student_id,teacher_id,
    teacher_result,system_suggestion,evidence,note
  ) VALUES(v_program.id,v_program.institution_id,v_program.classroom_id,v_program.membership_id,
    v_program.student_id,p_user_id,p_teacher_result,v_evidence->>'systemSuggestion',v_evidence,v_note)
    RETURNING * INTO v_review;
  PERFORM public.sync_institution_study_program_completion(v_program.id);
  SELECT * INTO v_program FROM public.institution_study_programs WHERE id=v_program.id;
  v_result:=jsonb_build_object(
    'reviewRef',v_review.review_ref,'teacherResult',v_review.teacher_result,'systemSuggestion',v_review.system_suggestion,
    'evidence',v_review.evidence,'note',v_review.note,'reviewedAt',v_review.reviewed_at,
    'programStatus',v_program.status,'replayed',false);
  -- The existing request-ledger trigger writes study_program_reviewed once;
  -- review, derived completion, request receipt and audit commit atomically.
  INSERT INTO public.pilot_institution_requests(user_id,operation,request_id,payload_hash,result)
    VALUES(p_user_id,'review_study_program',p_request_id,v_hash,v_result);
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.institution_study_program_completion_ready(uuid),
  public.sync_institution_study_program_completion(uuid),public.enforce_institution_study_program_completion(),
  public.sync_institution_study_program_item_completion(),public.review_institution_study_program(uuid,text,text,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.review_institution_study_program(uuid,text,text,text,uuid) TO service_role;

DO $postcheck$
DECLARE v_identity text; v_role text;
BEGIN
  FOREACH v_identity IN ARRAY ARRAY[
    'public.institution_study_program_completion_ready(uuid)',
    'public.sync_institution_study_program_completion(uuid)',
    'public.enforce_institution_study_program_completion()',
    'public.sync_institution_study_program_item_completion()'
  ] LOOP
    FOREACH v_role IN ARRAY ARRAY['public','anon','authenticated','service_role'] LOOP
      IF has_function_privilege(v_role,v_identity,'EXECUTE') THEN
        RAISE EXCEPTION 'migration 211 postcheck: private completion helper leaked' USING ERRCODE='23514';
      END IF;
    END LOOP;
  END LOOP;
  IF has_function_privilege('public','public.review_institution_study_program(uuid,text,text,text,uuid)','EXECUTE')
    OR has_function_privilege('anon','public.review_institution_study_program(uuid,text,text,text,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.review_institution_study_program(uuid,text,text,text,uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.review_institution_study_program(uuid,text,text,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'migration 211 postcheck: review RPC ACL mismatch' USING ERRCODE='23514';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O' AND tgdeferrable AND tginitdeferred
    AND tgfoid='public.enforce_institution_study_program_completion()'::regprocedure
    AND tgrelid IN ('public.institution_study_programs'::regclass,'public.institution_study_program_items'::regclass,
      'public.institution_study_program_item_executions'::regclass,'public.institution_study_program_reviews'::regclass))<>4
    OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O'
      AND tgrelid='public.institution_study_program_items'::regclass
      AND tgfoid='public.sync_institution_study_program_item_completion()'::regprocedure) THEN
    RAISE EXCEPTION 'migration 211 postcheck: completion trigger mismatch' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.institution_study_programs program WHERE program.status='completed'
    AND (program.completed_at IS NULL OR NOT public.institution_study_program_completion_ready(program.id))) THEN
    RAISE EXCEPTION 'migration 211 postcheck: invalid completed program' USING ERRCODE='23514';
  END IF;
END;
$postcheck$;
NOTIFY pgrst,'reload schema';
COMMIT;
