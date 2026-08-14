-- Migration 116: teacher-reviewed weekly study programs for institution pilots.
-- Draft generation is server-side; no draft can become visible to a learner
-- without a distinct publish request by the classroom's assigned teacher.
BEGIN;

CREATE TABLE IF NOT EXISTS public.institution_study_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_ref text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(16), 'hex')
    CHECK (program_ref ~ '^[0-9a-f]{32}$'),
  institution_id uuid NOT NULL REFERENCES public.pilot_institutions(id) ON DELETE RESTRICT,
  classroom_id uuid NOT NULL REFERENCES public.teacher_classrooms(id) ON DELETE RESTRICT,
  membership_id uuid NOT NULL REFERENCES public.teacher_classroom_memberships(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  week_start date NOT NULL CHECK (extract(isodow FROM week_start) = 1),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'completed', 'archived')),
  daily_minute_limit smallint NOT NULL CHECK (daily_minute_limit BETWEEN 20 AND 120),
  model_version text NOT NULL CHECK (model_version = 'institution-program-v1'),
  item_count smallint NOT NULL CHECK (item_count BETWEEN 1 AND 21),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reviewed_at timestamptz,
  published_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  CHECK ((status = 'draft' AND reviewed_at IS NULL AND published_at IS NULL)
    OR (status IN ('published', 'completed', 'archived') AND reviewed_at IS NOT NULL AND published_at IS NOT NULL)),
  FOREIGN KEY (membership_id, student_id, classroom_id)
    REFERENCES public.teacher_classroom_memberships(id, student_id, classroom_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS institution_study_program_one_active_week
  ON public.institution_study_programs (membership_id, week_start)
  WHERE status IN ('draft', 'published');
CREATE INDEX IF NOT EXISTS institution_study_programs_teacher_week
  ON public.institution_study_programs (teacher_id, week_start DESC, status);

CREATE TABLE IF NOT EXISTS public.institution_study_program_items (
  program_id uuid NOT NULL REFERENCES public.institution_study_programs(id) ON DELETE RESTRICT,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 21),
  scheduled_date date NOT NULL,
  task_type text NOT NULL CHECK (task_type IN ('verified_questions', 'fsrs_review', 'diagnostic', 'paper_pack')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 120),
  reason_code text NOT NULL CHECK (reason_code IN ('weak_outcome', 'due_review', 'diagnostic_gap', 'current_target', 'challenge')),
  outcome_code text CHECK (outcome_code IS NULL OR char_length(outcome_code) BETWEEN 1 AND 120),
  duration_minutes smallint NOT NULL CHECK (duration_minutes BETWEEN 5 AND 60),
  target_question_count smallint CHECK (target_question_count BETWEEN 1 AND 50),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped')),
  completed_at timestamptz,
  PRIMARY KEY (program_id, position),
  CHECK ((status = 'completed' AND completed_at IS NOT NULL) OR (status <> 'completed' AND completed_at IS NULL))
);

ALTER TABLE public.institution_study_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institution_study_program_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.institution_study_programs, public.institution_study_program_items
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_institution_study_program_draft(
  p_user_id uuid, p_classroom_id uuid, p_member_ref text, p_week_start date,
  p_daily_minute_limit integer, p_model_version text, p_items jsonb, p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
DECLARE
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_membership public.teacher_classroom_memberships%ROWTYPE;
  v_program public.institution_study_programs%ROWTYPE;
  v_request public.pilot_institution_requests%ROWTYPE;
  v_hash text; v_result jsonb; v_count integer;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_request_id IS NULL
    OR p_member_ref IS NULL OR p_member_ref !~ '^[0-9a-f]{32}$'
    OR p_week_start IS NULL OR extract(isodow FROM p_week_start) <> 1
    OR p_week_start < current_date - 7 OR p_week_start > current_date + 42
    OR p_daily_minute_limit NOT BETWEEN 20 AND 120
    OR p_model_version IS DISTINCT FROM 'institution-program-v1'
    OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
    OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 21 THEN
    RAISE EXCEPTION 'invalid institution study program draft' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution program actor mismatch' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_classroom FROM public.teacher_classrooms
    WHERE id = p_classroom_id AND teacher_id = p_user_id AND status = 'active';
  IF NOT FOUND OR NOT public.institution_pilot_has_role(
    p_user_id, v_classroom.institution_id, ARRAY['manager','teacher']::text[]
  ) THEN RAISE EXCEPTION 'assigned institution teacher required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_membership FROM public.teacher_classroom_memberships
    WHERE classroom_id = p_classroom_id AND member_ref = p_member_ref AND status = 'active';
  IF NOT FOUND OR public.teacher_classroom_is_blocked(p_user_id, v_membership.student_id) THEN
    RAISE EXCEPTION 'active classroom member not found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) WITH ORDINALITY AS item(value, ordinal)
    WHERE jsonb_typeof(value) <> 'object'
      OR (value->>'position') !~ '^(?:[1-9]|1[0-9]|2[01])$'
      OR (value->>'position')::integer <> ordinal
      OR (value->>'scheduledDate') !~ '^\d{4}-\d{2}-\d{2}$'
      OR (value->>'scheduledDate')::date < p_week_start
      OR (value->>'scheduledDate')::date >= p_week_start + 7
      OR value->>'taskType' NOT IN ('verified_questions','fsrs_review','diagnostic','paper_pack')
      OR char_length(btrim(value->>'title')) NOT BETWEEN 2 AND 120
      OR value->>'reasonCode' NOT IN ('weak_outcome','due_review','diagnostic_gap','current_target','challenge')
      OR (value->>'durationMinutes') !~ '^\d+$'
      OR (value->>'durationMinutes')::integer NOT BETWEEN 5 AND 60
      OR (value->>'targetQuestionCount') IS NOT NULL AND ((value->>'targetQuestionCount') !~ '^\d+$'
        OR (value->>'targetQuestionCount')::integer NOT BETWEEN 1 AND 50)
      OR value ?| ARRAY['studentId','userId','answerId','questionId']
  ) THEN RAISE EXCEPTION 'invalid institution study program items' USING ERRCODE = '22023'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS item(value)
    GROUP BY value->>'scheduledDate'
    HAVING count(*) > 3 OR sum((value->>'durationMinutes')::integer) > p_daily_minute_limit
  ) THEN RAISE EXCEPTION 'institution study program daily limit exceeded' USING ERRCODE = '22023'; END IF;

  v_hash := public.institution_pilot_payload_hash(jsonb_build_object(
    'classroomId', p_classroom_id, 'memberRef', p_member_ref, 'weekStart', p_week_start,
    'dailyMinuteLimit', p_daily_minute_limit, 'modelVersion', p_model_version, 'items', p_items));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':program-draft:' || p_request_id::text, 0));
  SELECT * INTO v_request FROM public.pilot_institution_requests
    WHERE user_id = p_user_id AND operation = 'create_study_program_draft' AND request_id = p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN RAISE EXCEPTION 'program draft request payload mismatch' USING ERRCODE = '22023'; END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;
  v_count := jsonb_array_length(p_items);
  INSERT INTO public.institution_study_programs(
    institution_id,classroom_id,membership_id,student_id,teacher_id,week_start,
    daily_minute_limit,model_version,item_count
  ) VALUES (
    v_classroom.institution_id,v_classroom.id,v_membership.id,v_membership.student_id,p_user_id,p_week_start,
    p_daily_minute_limit,p_model_version,v_count
  ) RETURNING * INTO v_program;
  INSERT INTO public.institution_study_program_items(
    program_id,position,scheduled_date,task_type,title,reason_code,outcome_code,duration_minutes,target_question_count
  ) SELECT v_program.id,(value->>'position')::smallint,(value->>'scheduledDate')::date,value->>'taskType',
    btrim(value->>'title'),value->>'reasonCode',NULLIF(value->>'outcomeCode',''),
    (value->>'durationMinutes')::smallint,NULLIF(value->>'targetQuestionCount','')::smallint
    FROM jsonb_array_elements(p_items) AS item(value);
  v_result := jsonb_build_object('programRef',v_program.program_ref,'status','draft','weekStart',v_program.week_start,
    'dailyMinuteLimit',v_program.daily_minute_limit,'modelVersion',v_program.model_version,'itemCount',v_program.item_count,
    'createdAt',v_program.created_at,'reviewedAt',NULL,'publishedAt',NULL,'replayed',false);
  INSERT INTO public.pilot_institution_requests(user_id,operation,request_id,payload_hash,result)
    VALUES(p_user_id,'create_study_program_draft',p_request_id,v_hash,v_result);
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.publish_institution_study_program(
  p_user_id uuid, p_program_ref text, p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
DECLARE v_program public.institution_study_programs%ROWTYPE; v_request public.pilot_institution_requests%ROWTYPE;
  v_hash text; v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_program_ref IS NULL OR p_program_ref !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'invalid institution study program publish' USING ERRCODE = '22023'; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution program actor mismatch' USING ERRCODE = '42501'; END IF;
  v_hash := public.institution_pilot_payload_hash(jsonb_build_object('programRef',p_program_ref));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':program-publish:' || p_request_id::text, 0));
  SELECT * INTO v_request FROM public.pilot_institution_requests
    WHERE user_id=p_user_id AND operation='publish_study_program' AND request_id=p_request_id FOR UPDATE;
  IF FOUND THEN IF v_request.payload_hash<>v_hash THEN RAISE EXCEPTION 'program publish request payload mismatch' USING ERRCODE='22023'; END IF;
    RETURN v_request.result||jsonb_build_object('replayed',true); END IF;
  SELECT * INTO v_program FROM public.institution_study_programs
    WHERE program_ref=p_program_ref AND teacher_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'study program not found' USING ERRCODE='P0002'; END IF;
  IF v_program.status <> 'draft' THEN RAISE EXCEPTION 'only draft programs can be published' USING ERRCODE='22023'; END IF;
  UPDATE public.institution_study_programs SET status='published',reviewed_at=clock_timestamp(),published_at=clock_timestamp()
    WHERE id=v_program.id RETURNING * INTO v_program;
  v_result:=jsonb_build_object('programRef',v_program.program_ref,'status','published','weekStart',v_program.week_start,
    'dailyMinuteLimit',v_program.daily_minute_limit,'modelVersion',v_program.model_version,'itemCount',v_program.item_count,
    'createdAt',v_program.created_at,'reviewedAt',v_program.reviewed_at,'publishedAt',v_program.published_at,'replayed',false);
  INSERT INTO public.pilot_institution_requests(user_id,operation,request_id,payload_hash,result)
    VALUES(p_user_id,'publish_study_program',p_request_id,v_hash,v_result);
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_institution_study_program_draft(uuid,uuid,text,date,integer,text,jsonb,uuid),
  public.publish_institution_study_program(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_institution_study_program_draft(uuid,uuid,text,date,integer,text,jsonb,uuid),
  public.publish_institution_study_program(uuid,text,uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
