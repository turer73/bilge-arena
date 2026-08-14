-- Migration 118: idempotent teacher edits for unpublished study programs.
BEGIN;

CREATE OR REPLACE FUNCTION public.update_institution_study_program_draft(
  p_user_id uuid, p_program_ref text, p_week_start date, p_daily_minute_limit integer,
  p_items jsonb, p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
DECLARE
  v_program public.institution_study_programs%ROWTYPE;
  v_request public.pilot_institution_requests%ROWTYPE;
  v_hash text; v_result jsonb; v_count integer;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_program_ref IS NULL OR p_program_ref !~ '^[0-9a-f]{32}$'
    OR p_week_start IS NULL OR extract(isodow FROM p_week_start) <> 1
    OR p_daily_minute_limit NOT BETWEEN 20 AND 120
    OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
    OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 21 THEN
    RAISE EXCEPTION 'invalid institution study program update' USING ERRCODE='22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution program actor mismatch' USING ERRCODE='42501'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) WITH ORDINALITY AS item(value,ordinal)
    WHERE jsonb_typeof(value)<>'object'
      OR (value->>'position') !~ '^(?:[1-9]|1[0-9]|2[01])$' OR (value->>'position')::integer<>ordinal
      OR (value->>'scheduledDate') !~ '^\d{4}-\d{2}-\d{2}$'
      OR (value->>'scheduledDate')::date<p_week_start OR (value->>'scheduledDate')::date>=p_week_start+7
      OR value->>'taskType' NOT IN ('verified_questions','fsrs_review','diagnostic','paper_pack')
      OR char_length(btrim(value->>'title')) NOT BETWEEN 2 AND 120
      OR value->>'reasonCode' NOT IN ('weak_outcome','due_review','diagnostic_gap','current_target','challenge')
      OR (value->>'durationMinutes') !~ '^\d+$' OR (value->>'durationMinutes')::integer NOT BETWEEN 5 AND 60
      OR (value->>'targetQuestionCount') IS NOT NULL AND ((value->>'targetQuestionCount') !~ '^\d+$'
        OR (value->>'targetQuestionCount')::integer NOT BETWEEN 1 AND 50)
      OR value ?| ARRAY['studentId','userId','answerId','questionId']
  ) THEN RAISE EXCEPTION 'invalid institution study program items' USING ERRCODE='22023'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS item(value)
    GROUP BY value->>'scheduledDate'
    HAVING count(*)>3 OR sum((value->>'durationMinutes')::integer)>p_daily_minute_limit
  ) THEN RAISE EXCEPTION 'institution study program daily limit exceeded' USING ERRCODE='22023'; END IF;

  v_hash:=public.institution_pilot_payload_hash(jsonb_build_object(
    'programRef',p_program_ref,'weekStart',p_week_start,'dailyMinuteLimit',p_daily_minute_limit,'items',p_items));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text||':program-update:'||p_request_id::text,0));
  SELECT * INTO v_request FROM public.pilot_institution_requests
    WHERE user_id=p_user_id AND operation='update_study_program_draft' AND request_id=p_request_id FOR UPDATE;
  IF FOUND THEN IF v_request.payload_hash<>v_hash THEN RAISE EXCEPTION 'program update request payload mismatch' USING ERRCODE='22023'; END IF;
    RETURN v_request.result||jsonb_build_object('replayed',true); END IF;
  SELECT * INTO v_program FROM public.institution_study_programs
    WHERE program_ref=p_program_ref AND teacher_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'study program not found' USING ERRCODE='P0002'; END IF;
  IF v_program.status<>'draft' OR v_program.week_start<>p_week_start THEN
    RAISE EXCEPTION 'only the matching draft program can be updated' USING ERRCODE='22023'; END IF;
  v_count:=jsonb_array_length(p_items);
  DELETE FROM public.institution_study_program_items WHERE program_id=v_program.id;
  INSERT INTO public.institution_study_program_items(
    program_id,position,scheduled_date,task_type,title,reason_code,outcome_code,duration_minutes,target_question_count
  ) SELECT v_program.id,(value->>'position')::smallint,(value->>'scheduledDate')::date,value->>'taskType',
    btrim(value->>'title'),value->>'reasonCode',NULLIF(value->>'outcomeCode',''),
    (value->>'durationMinutes')::smallint,NULLIF(value->>'targetQuestionCount','')::smallint
    FROM jsonb_array_elements(p_items) AS item(value);
  UPDATE public.institution_study_programs SET daily_minute_limit=p_daily_minute_limit,item_count=v_count
    WHERE id=v_program.id RETURNING * INTO v_program;
  v_result:=jsonb_build_object('programRef',v_program.program_ref,'status','draft','weekStart',v_program.week_start,
    'dailyMinuteLimit',v_program.daily_minute_limit,'modelVersion',v_program.model_version,'itemCount',v_program.item_count,
    'createdAt',v_program.created_at,'reviewedAt',NULL,'publishedAt',NULL,'replayed',false);
  INSERT INTO public.pilot_institution_requests(user_id,operation,request_id,payload_hash,result)
    VALUES(p_user_id,'update_study_program_draft',p_request_id,v_hash,v_result);
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.update_institution_study_program_draft(uuid,text,date,integer,jsonb,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.update_institution_study_program_draft(uuid,text,date,integer,jsonb,uuid)
  TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
