-- Migration 119: students may read only their own published current-week programs.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_institution_study_programs(
  p_user_id uuid,
  p_as_of_date date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
DECLARE v_programs jsonb;
BEGIN
  IF p_user_id IS NULL OR p_as_of_date IS NULL OR p_as_of_date<current_date-7 OR p_as_of_date>current_date+1 THEN
    RAISE EXCEPTION 'invalid student study program scope' USING ERRCODE='22023'; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'student study program actor mismatch' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_user_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'student not found' USING ERRCODE='P0002'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'classroomName',scoped.classroom_name,'teacherAlias',scoped.teacher_alias,
    'weekStart',scoped.week_start,'dailyMinuteLimit',scoped.daily_minute_limit,
    'modelVersion',scoped.model_version,'publishedAt',scoped.published_at,'items',scoped.items
  ) ORDER BY scoped.classroom_name,scoped.week_start),'[]'::jsonb)
  INTO v_programs
  FROM (
    SELECT program.week_start,program.daily_minute_limit,program.model_version,program.published_at,
      classroom.name AS classroom_name,public.teacher_classroom_safe_alias(program.teacher_id) AS teacher_alias,
      (SELECT jsonb_agg(jsonb_build_object(
        'position',item.position,'scheduledDate',item.scheduled_date,'taskType',item.task_type,
        'title',item.title,'reasonCode',item.reason_code,'outcomeCode',item.outcome_code,
        'durationMinutes',item.duration_minutes,'targetQuestionCount',item.target_question_count,'status',item.status
      ) ORDER BY item.position) FROM public.institution_study_program_items AS item WHERE item.program_id=program.id) AS items
    FROM public.institution_study_programs AS program
    JOIN public.teacher_classrooms AS classroom ON classroom.id=program.classroom_id AND classroom.status='active'
    JOIN public.teacher_classroom_memberships AS membership
      ON membership.id=program.membership_id AND membership.classroom_id=program.classroom_id
      AND membership.student_id=p_user_id AND membership.status='active'
    WHERE program.student_id=p_user_id AND program.status IN ('published','completed')
      AND program.published_at IS NOT NULL
      AND p_as_of_date>=program.week_start AND p_as_of_date<program.week_start+7
      AND NOT public.teacher_classroom_is_blocked(classroom.teacher_id,p_user_id)
  ) AS scoped;
  RETURN jsonb_build_object('asOfDate',p_as_of_date,'programs',v_programs);
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_my_institution_study_programs(uuid,date)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_institution_study_programs(uuid,date) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
