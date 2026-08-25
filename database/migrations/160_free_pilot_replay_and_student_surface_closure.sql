-- Migration 160: close replay-first mutations and student-facing tenant reads
-- when a bounded free canary expires.
--
-- Student privacy exits remain available. Student learning actions stay AAL1,
-- but may target only an operational institution. Privileged staff replay
-- paths use the AAL2 operational guard introduced in migration 159.
BEGIN;

DO $block$
DECLARE
  v_function record;
BEGIN
  FOR v_function IN
    SELECT * FROM (VALUES
      ('transfer_my_pilot_institution_manager(uuid,text,uuid)',
       'free_pilot_legacy_manager_transfer(uuid,text,uuid)',
       'free_pilot_legacy_manager_transfer'),
      ('resolve_institution_student_followup(uuid,text,uuid)',
       'free_pilot_legacy_followup_resolve(uuid,text,uuid)',
       'free_pilot_legacy_followup_resolve'),
      ('review_institution_study_program(uuid,text,text,text,uuid)',
       'free_pilot_legacy_program_review(uuid,text,text,text,uuid)',
       'free_pilot_legacy_program_review'),
      ('submit_teacher_assignment(uuid,uuid,jsonb,uuid)',
       'free_pilot_legacy_assignment_submit(uuid,uuid,jsonb,uuid)',
       'free_pilot_legacy_assignment_submit'),
      ('accept_teacher_classroom_invite(uuid,text,text,text,uuid)',
       'free_pilot_legacy_invite_accept(uuid,text,text,text,uuid)',
       'free_pilot_legacy_invite_accept')
    ) AS functions(original_signature, legacy_signature, legacy_name)
  LOOP
    IF to_regprocedure('public.' || v_function.legacy_signature) IS NULL THEN
      EXECUTE format(
        'ALTER FUNCTION public.%s RENAME TO %I',
        v_function.original_signature,
        v_function.legacy_name
      );
    END IF;
  END LOOP;
END;
$block$;

CREATE OR REPLACE FUNCTION public.transfer_my_pilot_institution_manager(
  p_user_id uuid,
  p_new_manager_member_ref text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  -- A former manager may replay a successful transfer while still an active
  -- staff member, but never after the tenant review boundary has expired.
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  RETURN public.free_pilot_legacy_manager_transfer(
    p_user_id, p_new_manager_member_ref, p_request_id
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.resolve_institution_student_followup(
  p_user_id uuid,
  p_followup_ref text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  RETURN public.free_pilot_legacy_followup_resolve(
    p_user_id, p_followup_ref, p_request_id
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.review_institution_study_program(
  p_user_id uuid,
  p_program_ref text,
  p_teacher_result text,
  p_note text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  RETURN public.free_pilot_legacy_program_review(
    p_user_id, p_program_ref, p_teacher_result, p_note, p_request_id
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.submit_teacher_assignment(
  p_user_id uuid,
  p_assignment_id uuid,
  p_answers jsonb,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF p_user_id IS NULL OR p_assignment_id IS NULL THEN
    RAISE EXCEPTION 'assignment actor and target required' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'assignment actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.teacher_assignments AS assignment
    JOIN public.teacher_classrooms AS classroom
      ON classroom.id = assignment.classroom_id
      AND classroom.status = 'active'
    WHERE assignment.id = p_assignment_id
      AND public.institution_pilot_is_operational(classroom.institution_id)
  ) THEN
    RAISE EXCEPTION 'assignment not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN public.free_pilot_legacy_assignment_submit(
    p_user_id, p_assignment_id, p_answers, p_request_id
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.accept_teacher_classroom_invite(
  p_user_id uuid,
  p_token_digest text,
  p_notice_version text,
  p_consent_version text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_institution_id uuid;
  v_has_replay boolean := false;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'invite actor and request required' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'invite actor mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT classroom.institution_id INTO v_institution_id
  FROM public.teacher_classroom_invites AS invite
  JOIN public.teacher_classrooms AS classroom ON classroom.id = invite.classroom_id
  WHERE invite.token_digest = p_token_digest;

  IF v_institution_id IS NULL THEN
    SELECT true, classroom.institution_id
    INTO v_has_replay, v_institution_id
    FROM public.teacher_classroom_requests AS request
    LEFT JOIN public.teacher_classrooms AS classroom
      ON classroom.id::text = request.result #>> '{classroom,id}'
    WHERE request.user_id = p_user_id
      AND request.operation = 'accept_invite'
      AND request.request_id = p_request_id;
  END IF;

  IF v_institution_id IS NOT NULL THEN
    IF NOT public.institution_pilot_is_operational(v_institution_id) THEN
      RAISE EXCEPTION 'invite unavailable' USING ERRCODE = 'P0003';
    END IF;
  ELSIF v_has_replay THEN
    RAISE EXCEPTION 'invite unavailable' USING ERRCODE = 'P0003';
  END IF;

  RETURN public.free_pilot_legacy_invite_accept(
    p_user_id, p_token_digest, p_notice_version, p_consent_version, p_request_id
  );
END;
$fn$;

-- A student may belong to classrooms in more than one tenant, so filtering is
-- row-level rather than an all-or-nothing actor assertion.
CREATE OR REPLACE FUNCTION public.get_my_institution_study_programs(
  p_user_id uuid,
  p_as_of_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_programs jsonb;
BEGIN
  IF p_user_id IS NULL OR p_as_of_date IS NULL
    OR p_as_of_date < current_date - 7 OR p_as_of_date > current_date + 1 THEN
    RAISE EXCEPTION 'invalid student study program scope' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'student study program actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'student not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'classroomName', scoped.classroom_name,
    'teacherAlias', scoped.teacher_alias,
    'weekStart', scoped.week_start,
    'dailyMinuteLimit', scoped.daily_minute_limit,
    'modelVersion', scoped.model_version,
    'publishedAt', scoped.published_at,
    'items', scoped.items
  ) ORDER BY scoped.classroom_name, scoped.week_start), '[]'::jsonb)
  INTO v_programs
  FROM (
    SELECT
      program.week_start,
      program.daily_minute_limit,
      program.model_version,
      program.published_at,
      classroom.name AS classroom_name,
      public.teacher_classroom_safe_alias(program.teacher_id) AS teacher_alias,
      (
        SELECT jsonb_agg(jsonb_build_object(
          'position', item.position,
          'scheduledDate', item.scheduled_date,
          'taskType', item.task_type,
          'title', item.title,
          'reasonCode', item.reason_code,
          'outcomeCode', item.outcome_code,
          'durationMinutes', item.duration_minutes,
          'targetQuestionCount', item.target_question_count,
          'status', item.status
        ) ORDER BY item.position)
        FROM public.institution_study_program_items AS item
        WHERE item.program_id = program.id
      ) AS items
    FROM public.institution_study_programs AS program
    JOIN public.teacher_classrooms AS classroom
      ON classroom.id = program.classroom_id AND classroom.status = 'active'
    JOIN public.pilot_institutions AS institution
      ON institution.id = program.institution_id
      AND institution.id = classroom.institution_id
      AND public.institution_pilot_is_operational(institution.id)
    JOIN public.teacher_classroom_memberships AS membership
      ON membership.id = program.membership_id
      AND membership.classroom_id = program.classroom_id
      AND membership.student_id = p_user_id
      AND membership.status = 'active'
    WHERE program.student_id = p_user_id
      AND program.status IN ('published', 'completed')
      AND program.published_at IS NOT NULL
      AND p_as_of_date >= program.week_start
      AND p_as_of_date < program.week_start + 7
      AND NOT public.teacher_classroom_is_blocked(classroom.teacher_id, p_user_id)
  ) AS scoped;
  RETURN jsonb_build_object('asOfDate', p_as_of_date, 'programs', v_programs);
END;
$fn$;

-- An expired tenant no longer controls a learner's platform-wide assistance
-- policy. Other operational classrooms may still impose their active policy.
CREATE OR REPLACE FUNCTION public.get_my_assistance_policy(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_until timestamptz;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user required' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'assistance actor mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT max(classroom.exam_mode_expires_at) INTO v_until
  FROM public.teacher_classroom_memberships AS membership
  JOIN public.teacher_classrooms AS classroom
    ON classroom.id = membership.classroom_id
  JOIN public.pilot_institutions AS institution
    ON institution.id = classroom.institution_id
    AND public.institution_pilot_is_operational(institution.id)
  JOIN public.profiles AS profile ON profile.id = membership.student_id
  WHERE membership.student_id = p_user_id
    AND membership.status = 'active'
    AND classroom.status = 'active'
    AND profile.deleted_at IS NULL
    AND classroom.exam_mode_expires_at IS NOT NULL
    AND classroom.exam_mode_expires_at > now();

  RETURN jsonb_build_object(
    'examMode', v_until IS NOT NULL,
    'board', v_until IS NULL,
    'coach', v_until IS NULL,
    'assistant', v_until IS NULL,
    'until', v_until
  );
END;
$fn$;

REVOKE ALL ON FUNCTION
  public.free_pilot_legacy_manager_transfer(uuid, text, uuid),
  public.free_pilot_legacy_followup_resolve(uuid, text, uuid),
  public.free_pilot_legacy_program_review(uuid, text, text, text, uuid),
  public.free_pilot_legacy_assignment_submit(uuid, uuid, jsonb, uuid),
  public.free_pilot_legacy_invite_accept(uuid, text, text, text, uuid)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.transfer_my_pilot_institution_manager(uuid, text, uuid),
  public.resolve_institution_student_followup(uuid, text, uuid),
  public.review_institution_study_program(uuid, text, text, text, uuid),
  public.submit_teacher_assignment(uuid, uuid, jsonb, uuid),
  public.accept_teacher_classroom_invite(uuid, text, text, text, uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.transfer_my_pilot_institution_manager(uuid, text, uuid),
  public.resolve_institution_student_followup(uuid, text, uuid),
  public.review_institution_study_program(uuid, text, text, text, uuid),
  public.submit_teacher_assignment(uuid, uuid, jsonb, uuid),
  public.accept_teacher_classroom_invite(uuid, text, text, text, uuid)
TO authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.get_my_institution_study_programs(uuid, date),
  public.get_my_assistance_policy(uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.get_my_institution_study_programs(uuid, date),
  public.get_my_assistance_policy(uuid)
TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
