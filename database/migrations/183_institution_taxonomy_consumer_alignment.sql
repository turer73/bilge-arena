-- Migration 183: bind institution evidence consumers to immutable curriculum scopes.
--
-- Classroom growth now receives the exact released taxonomy from the route.
-- Study programs retain the taxonomy used at generation time, so later review
-- evidence cannot silently move to a newer curriculum release.

BEGIN;

ALTER TABLE public.institution_study_programs
  ADD COLUMN IF NOT EXISTS taxonomy_version text;

-- Every program created before the scope registry rollout used the original
-- TYT Mathematics taxonomy. Refuse the cutover if any historical target cannot
-- be proven to belong to that immutable scope.
UPDATE public.institution_study_programs
SET taxonomy_version = 'ba-tyt-math-v1'
WHERE taxonomy_version IS NULL;

DO $fn$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.institution_study_programs AS program
    JOIN public.institution_study_program_items AS item
      ON item.program_id = program.id
     AND item.outcome_code IS NOT NULL
    LEFT JOIN public.curriculum_outcomes AS outcome
      ON outcome.code = item.outcome_code
     AND outcome.game = 'matematik'
     AND outcome.exam_ref = 'TYT'
     AND outcome.taxonomy_version = program.taxonomy_version
    WHERE outcome.id IS NULL
  ) THEN
    RAISE EXCEPTION 'institution program taxonomy backfill has unresolvable targets'
      USING ERRCODE = '23514';
  END IF;
END;
$fn$;

ALTER TABLE public.institution_study_programs
  ALTER COLUMN taxonomy_version SET NOT NULL;

DO $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.institution_study_programs'::regclass
      AND conname = 'institution_study_programs_taxonomy_version_check'
  ) THEN
    ALTER TABLE public.institution_study_programs
      ADD CONSTRAINT institution_study_programs_taxonomy_version_check
      CHECK (taxonomy_version ~ '^ba-[a-z0-9-]+-v[0-9]+$');
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_institution_classroom_growth_metrics(
  p_user_id uuid,
  p_classroom_id uuid,
  p_window_end timestamptz,
  p_taxonomy_version text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_role text;
  v_active_count integer;
  v_eligible_count integer;
  v_positive_count integer;
  v_released_taxonomy text;
  v_baseline_start timestamptz := p_window_end - interval '56 days';
  v_baseline_end timestamptz := p_window_end - interval '28 days';
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_window_end IS NULL
    OR p_window_end > clock_timestamp() + interval '5 minutes'
    OR p_taxonomy_version IS NULL
    OR p_taxonomy_version !~ '^ba-[a-z0-9-]+-v[0-9]+$' THEN
    RAISE EXCEPTION 'invalid classroom growth window' USING ERRCODE = '22023';
  END IF;
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);

  SELECT scope.taxonomy_version
  INTO v_released_taxonomy
  FROM public.curriculum_scope_releases AS scope
  WHERE scope.game = 'matematik'
    AND scope.display_exam_ref = 'TYT'
    AND scope.release_status = 'released';
  IF NOT FOUND OR v_released_taxonomy IS DISTINCT FROM p_taxonomy_version THEN
    RAISE EXCEPTION 'released institution curriculum scope is required'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_classroom
  FROM public.teacher_classrooms
  WHERE id = p_classroom_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'classroom not found' USING ERRCODE = 'P0002'; END IF;
  SELECT membership.role INTO v_role
  FROM public.pilot_institution_memberships AS membership
  JOIN public.pilot_institutions AS institution
    ON institution.id = membership.institution_id AND institution.status IN ('pilot', 'active')
  JOIN public.profiles AS profile
    ON profile.id = membership.user_id AND profile.deleted_at IS NULL
  WHERE membership.user_id = p_user_id
    AND membership.institution_id = v_classroom.institution_id
    AND membership.status = 'active'
    AND membership.role IN ('manager', 'teacher');
  IF v_role IS NULL OR (v_role = 'teacher' AND v_classroom.teacher_id <> p_user_id) THEN
    RAISE EXCEPTION 'institution classroom access required' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_active_count
  FROM public.teacher_classroom_memberships AS membership
  JOIN public.profiles AS profile ON profile.id = membership.student_id AND profile.deleted_at IS NULL
  WHERE membership.classroom_id = p_classroom_id
    AND membership.status = 'active'
    AND NOT public.teacher_classroom_is_blocked(v_classroom.teacher_id, membership.student_id);

  WITH roster AS (
    SELECT membership.id AS membership_id, membership.student_id
    FROM public.teacher_classroom_memberships AS membership
    JOIN public.profiles AS profile ON profile.id = membership.student_id AND profile.deleted_at IS NULL
    WHERE membership.classroom_id = p_classroom_id
      AND membership.status = 'active'
      AND membership.accepted_at <= v_baseline_start
      AND NOT public.teacher_classroom_is_blocked(v_classroom.teacher_id, membership.student_id)
  ), evidence AS (
    SELECT roster.membership_id, mastered.answer_id, mastered.attempt_id,
      mastered.difficulty_weighted_earned, mastered.difficulty_weighted_possible,
      answer.answered_at
    FROM roster
    JOIN public.mastery_outcome_evidence AS mastered ON mastered.user_id = roster.student_id
    JOIN public.session_answers AS answer ON answer.id = mastered.answer_id
    JOIN public.curriculum_outcomes AS outcome
      ON outcome.id = mastered.outcome_id
      AND outcome.game = 'matematik'
      AND outcome.exam_ref = 'TYT'
      AND outcome.taxonomy_version = p_taxonomy_version
      AND outcome.is_active
    WHERE answer.answered_at >= v_baseline_start
      AND answer.answered_at < p_window_end
  ), student_windows AS (
    SELECT membership_id,
      count(DISTINCT answer_id) FILTER (
        WHERE answered_at >= v_baseline_start AND answered_at < v_baseline_end
      )::integer AS baseline_evidence_count,
      count(DISTINCT attempt_id) FILTER (
        WHERE answered_at >= v_baseline_start AND answered_at < v_baseline_end
      )::integer AS baseline_attempt_count,
      sum(difficulty_weighted_earned) FILTER (
        WHERE answered_at >= v_baseline_start AND answered_at < v_baseline_end
      ) AS baseline_earned,
      sum(difficulty_weighted_possible) FILTER (
        WHERE answered_at >= v_baseline_start AND answered_at < v_baseline_end
      ) AS baseline_possible,
      count(DISTINCT answer_id) FILTER (
        WHERE answered_at >= v_baseline_end AND answered_at < p_window_end
      )::integer AS current_evidence_count,
      count(DISTINCT attempt_id) FILTER (
        WHERE answered_at >= v_baseline_end AND answered_at < p_window_end
      )::integer AS current_attempt_count,
      sum(difficulty_weighted_earned) FILTER (
        WHERE answered_at >= v_baseline_end AND answered_at < p_window_end
      ) AS current_earned,
      sum(difficulty_weighted_possible) FILTER (
        WHERE answered_at >= v_baseline_end AND answered_at < p_window_end
      ) AS current_possible
    FROM evidence
    GROUP BY membership_id
  ), eligible AS (
    SELECT membership_id,
      100.0 * baseline_earned / baseline_possible AS baseline_score,
      100.0 * current_earned / current_possible AS current_score
    FROM student_windows
    WHERE baseline_evidence_count >= 6 AND baseline_attempt_count >= 3
      AND current_evidence_count >= 6 AND current_attempt_count >= 3
      AND baseline_possible > 0 AND current_possible > 0
  )
  SELECT count(*)::integer,
    count(*) FILTER (WHERE current_score >= baseline_score + 5
      OR (baseline_score >= 80 AND current_score >= 80))::integer
  INTO v_eligible_count, v_positive_count
  FROM eligible;

  RETURN jsonb_build_object(
    'modelVersion', 'institution-growth-v1',
    'baselineWindowStart', v_baseline_start,
    'baselineWindowEnd', v_baseline_end,
    'currentWindowStart', v_baseline_end,
    'currentWindowEnd', p_window_end,
    'eligibleStudentCount', v_eligible_count,
    'positiveGrowthStudentCount', v_positive_count,
    'excludedInsufficientCount', v_active_count - v_eligible_count
  );
END;
$fn$;

-- Compatibility entry point: old app deployments continue to resolve the
-- current release server-side until the four-argument route is deployed.
CREATE OR REPLACE FUNCTION public.get_institution_classroom_growth_metrics(
  p_user_id uuid,
  p_classroom_id uuid,
  p_window_end timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_taxonomy_version text;
BEGIN
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  SELECT scope.taxonomy_version
  INTO v_taxonomy_version
  FROM public.curriculum_scope_releases AS scope
  WHERE scope.game = 'matematik'
    AND scope.display_exam_ref = 'TYT'
    AND scope.release_status = 'released';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'released institution curriculum scope is required'
      USING ERRCODE = 'P0002';
  END IF;
  RETURN public.get_institution_classroom_growth_metrics(
    p_user_id, p_classroom_id, p_window_end, v_taxonomy_version
  );
END;
$fn$;

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
  v_operational_institution_id uuid;
  v_taxonomy_version text;
  v_question_exam_ref text;
  v_diagnostic_enabled boolean;
  v_hash text;
  v_legacy_hash text;
  v_result jsonb;
  v_count integer;
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
  v_operational_institution_id := public.institution_pilot_assert_operational_actor(p_user_id);
  SELECT * INTO v_classroom FROM public.teacher_classrooms
    WHERE id = p_classroom_id AND teacher_id = p_user_id AND status = 'active';
  IF NOT FOUND OR v_operational_institution_id IS DISTINCT FROM v_classroom.institution_id
    OR NOT public.institution_pilot_has_role(
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
  v_legacy_hash := public.institution_pilot_payload_hash(jsonb_build_object(
    'classroomId', p_classroom_id, 'memberRef', p_member_ref, 'weekStart', p_week_start,
    'dailyMinuteLimit', p_daily_minute_limit, 'modelVersion', p_model_version, 'items', p_items));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':program-draft:' || p_request_id::text, 0));
  SELECT * INTO v_request FROM public.pilot_institution_requests
    WHERE user_id = p_user_id AND operation = 'create_study_program_draft' AND request_id = p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash = v_legacy_hash THEN
      RETURN v_request.result || jsonb_build_object('replayed', true);
    END IF;
    SELECT * INTO v_program
    FROM public.institution_study_programs
    WHERE program_ref = v_request.result->>'programRef'
      AND teacher_id = p_user_id
      AND classroom_id = p_classroom_id
      AND membership_id = v_membership.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'program draft request payload mismatch' USING ERRCODE = '22023';
    END IF;
    v_hash := public.institution_pilot_payload_hash(jsonb_build_object(
      'classroomId', p_classroom_id, 'memberRef', p_member_ref, 'weekStart', p_week_start,
      'dailyMinuteLimit', p_daily_minute_limit, 'modelVersion', p_model_version, 'items', p_items,
      'taxonomyVersion', v_program.taxonomy_version));
    IF v_request.payload_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'program draft request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;

  SELECT scope.taxonomy_version, scope.question_exam_ref, scope.diagnostic_enabled
  INTO v_taxonomy_version, v_question_exam_ref, v_diagnostic_enabled
  FROM public.curriculum_scope_releases AS scope
  WHERE scope.game = 'matematik'
    AND scope.display_exam_ref = 'TYT'
    AND scope.release_status = 'released'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'released institution curriculum scope is required'
      USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS item(value)
    WHERE value->>'taskType' = 'diagnostic'
  ) AND (
    v_taxonomy_version IS DISTINCT FROM 'ba-tyt-math-v1'
    OR v_question_exam_ref IS DISTINCT FROM 'TYT'
    OR NOT COALESCE(v_diagnostic_enabled, false)
  ) THEN
    RAISE EXCEPTION 'adaptive diagnostic is unavailable for released taxonomy'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS item(value)
    WHERE NULLIF(btrim(value->>'outcomeCode'), '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.curriculum_outcomes AS outcome
        WHERE outcome.code = btrim(value->>'outcomeCode')
          AND outcome.game = 'matematik'
          AND outcome.exam_ref = 'TYT'
          AND outcome.taxonomy_version = v_taxonomy_version
          AND outcome.is_active
      )
  ) THEN RAISE EXCEPTION 'institution study program target is outside released taxonomy' USING ERRCODE = '22023'; END IF;
  v_hash := public.institution_pilot_payload_hash(jsonb_build_object(
    'classroomId', p_classroom_id, 'memberRef', p_member_ref, 'weekStart', p_week_start,
    'dailyMinuteLimit', p_daily_minute_limit, 'modelVersion', p_model_version, 'items', p_items,
    'taxonomyVersion', v_taxonomy_version));
  v_count := jsonb_array_length(p_items);
  INSERT INTO public.institution_study_programs(
    institution_id,classroom_id,membership_id,student_id,teacher_id,week_start,
    daily_minute_limit,model_version,item_count,taxonomy_version
  ) VALUES (
    v_classroom.institution_id,v_classroom.id,v_membership.id,v_membership.student_id,p_user_id,p_week_start,
    p_daily_minute_limit,p_model_version,v_count,v_taxonomy_version
  ) RETURNING * INTO v_program;
  INSERT INTO public.institution_study_program_items(
    program_id,position,scheduled_date,task_type,title,reason_code,outcome_code,duration_minutes,target_question_count
  ) SELECT v_program.id,(value->>'position')::smallint,(value->>'scheduledDate')::date,value->>'taskType',
    btrim(value->>'title'),value->>'reasonCode',NULLIF(btrim(value->>'outcomeCode'),''),
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

CREATE OR REPLACE FUNCTION public.update_institution_study_program_draft(
  p_user_id uuid,
  p_program_ref text,
  p_week_start date,
  p_daily_minute_limit integer,
  p_items jsonb,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_program public.institution_study_programs%ROWTYPE;
  v_request public.pilot_institution_requests%ROWTYPE;
  v_operational_institution_id uuid;
  v_hash text;
BEGIN
  v_operational_institution_id := public.institution_pilot_assert_operational_actor(p_user_id);
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'invalid institution study program update' USING ERRCODE = '22023';
  END IF;
  v_hash := public.institution_pilot_payload_hash(jsonb_build_object(
    'programRef', p_program_ref,
    'weekStart', p_week_start,
    'dailyMinuteLimit', p_daily_minute_limit,
    'items', p_items
  ));
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':program-update:' || p_request_id::text, 0)
  );
  SELECT * INTO v_request
  FROM public.pilot_institution_requests
  WHERE user_id = p_user_id
    AND operation = 'update_study_program_draft'
    AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'program update request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;
  SELECT * INTO v_program
  FROM public.institution_study_programs
  WHERE program_ref = p_program_ref AND teacher_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'study program not found' USING ERRCODE = 'P0002'; END IF;
  IF v_operational_institution_id IS DISTINCT FROM v_program.institution_id THEN
    RAISE EXCEPTION 'operational institution mismatch' USING ERRCODE = '42501';
  END IF;
  IF v_program.status = 'draft' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS item(value)
    WHERE value->>'taskType' = 'diagnostic'
  ) THEN
    PERFORM 1
    FROM public.curriculum_scope_releases AS scope
    WHERE scope.game = 'matematik'
      AND scope.display_exam_ref = 'TYT'
      AND scope.question_exam_ref = 'TYT'
      AND scope.taxonomy_version = v_program.taxonomy_version
      AND scope.taxonomy_version = 'ba-tyt-math-v1'
      AND scope.release_status = 'released'
      AND scope.diagnostic_enabled
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'adaptive diagnostic is unavailable for program taxonomy'
        USING ERRCODE = '22023';
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS item(value)
    WHERE NULLIF(btrim(value->>'outcomeCode'), '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.curriculum_outcomes AS outcome
        WHERE outcome.code = btrim(value->>'outcomeCode')
          AND outcome.game = 'matematik'
          AND outcome.exam_ref = 'TYT'
          AND outcome.taxonomy_version = v_program.taxonomy_version
      )
  ) THEN RAISE EXCEPTION 'institution study program target is outside program taxonomy' USING ERRCODE = '22023'; END IF;
  RETURN public.free_pilot_legacy_program_update(
    p_user_id, p_program_ref, p_week_start, p_daily_minute_limit,
    p_items, p_request_id
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.publish_institution_study_program(
  p_user_id uuid,
  p_program_ref text,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_program public.institution_study_programs%ROWTYPE;
  v_operational_institution_id uuid;
BEGIN
  v_operational_institution_id := public.institution_pilot_assert_operational_actor(p_user_id);
  SELECT * INTO v_program
  FROM public.institution_study_programs
  WHERE program_ref = p_program_ref AND teacher_id = p_user_id
  FOR UPDATE;
  IF FOUND AND v_operational_institution_id IS DISTINCT FROM v_program.institution_id THEN
    RAISE EXCEPTION 'operational institution mismatch' USING ERRCODE = '42501';
  END IF;
  IF FOUND AND v_program.status = 'draft' AND EXISTS (
    SELECT 1 FROM public.institution_study_program_items AS item
    WHERE item.program_id = v_program.id AND item.task_type = 'diagnostic'
  ) THEN
    PERFORM 1
    FROM public.curriculum_scope_releases AS scope
    WHERE scope.game = 'matematik'
      AND scope.display_exam_ref = 'TYT'
      AND scope.question_exam_ref = 'TYT'
      AND scope.taxonomy_version = v_program.taxonomy_version
      AND scope.taxonomy_version = 'ba-tyt-math-v1'
      AND scope.release_status = 'released'
      AND scope.diagnostic_enabled
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'adaptive diagnostic is unavailable for program taxonomy'
        USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN public.free_pilot_legacy_program_publish(
    p_user_id, p_program_ref, p_request_id
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.institution_study_program_review_evidence(
  p_program_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_program public.institution_study_programs%ROWTYPE;
  v_targeted integer;
  v_assessed integer;
  v_improved integer;
  v_declined integer;
  v_suggestion text;
  v_baseline_start timestamptz;
  v_baseline_end timestamptz;
  v_current_start timestamptz;
  v_current_end timestamptz;
BEGIN
  SELECT * INTO v_program FROM public.institution_study_programs WHERE id = p_program_id;
  IF NOT FOUND OR v_program.status NOT IN ('published','completed') THEN
    RAISE EXCEPTION 'published study program required' USING ERRCODE = '22023';
  END IF;
  v_baseline_start := (v_program.week_start - 14)::timestamptz;
  v_baseline_end := v_program.week_start::timestamptz;
  v_current_start := v_program.week_start::timestamptz;
  v_current_end := (v_program.week_start + 14)::timestamptz;

  WITH targets AS (
    SELECT DISTINCT outcome.id AS outcome_id
    FROM public.institution_study_program_items AS item
    JOIN public.curriculum_outcomes AS outcome
      ON outcome.code = item.outcome_code
      AND outcome.game = 'matematik'
      AND outcome.exam_ref = 'TYT'
      AND outcome.taxonomy_version = v_program.taxonomy_version
    WHERE item.program_id = v_program.id AND item.outcome_code IS NOT NULL
  ), evidence AS (
    SELECT target.outcome_id, mastered.answer_id, mastered.attempt_id,
      mastered.difficulty_weighted_earned, mastered.difficulty_weighted_possible,
      answer.answered_at
    FROM targets AS target
    LEFT JOIN public.mastery_outcome_evidence AS mastered
      ON mastered.outcome_id = target.outcome_id AND mastered.user_id = v_program.student_id
    LEFT JOIN public.session_answers AS answer ON answer.id = mastered.answer_id
      AND answer.answered_at >= v_baseline_start AND answer.answered_at < v_current_end
  ), outcome_windows AS (
    SELECT outcome_id,
      count(DISTINCT answer_id) FILTER (WHERE answered_at >= v_baseline_start AND answered_at < v_baseline_end)::integer AS baseline_evidence,
      count(DISTINCT attempt_id) FILTER (WHERE answered_at >= v_baseline_start AND answered_at < v_baseline_end)::integer AS baseline_attempts,
      sum(difficulty_weighted_earned) FILTER (WHERE answered_at >= v_baseline_start AND answered_at < v_baseline_end) AS baseline_earned,
      sum(difficulty_weighted_possible) FILTER (WHERE answered_at >= v_baseline_start AND answered_at < v_baseline_end) AS baseline_possible,
      count(DISTINCT answer_id) FILTER (WHERE answered_at >= v_current_start AND answered_at < v_current_end)::integer AS current_evidence,
      count(DISTINCT attempt_id) FILTER (WHERE answered_at >= v_current_start AND answered_at < v_current_end)::integer AS current_attempts,
      sum(difficulty_weighted_earned) FILTER (WHERE answered_at >= v_current_start AND answered_at < v_current_end) AS current_earned,
      sum(difficulty_weighted_possible) FILTER (WHERE answered_at >= v_current_start AND answered_at < v_current_end) AS current_possible
    FROM evidence GROUP BY outcome_id
  ), scored AS (
    SELECT outcome_id,
      100.0 * baseline_earned / baseline_possible AS baseline_score,
      100.0 * current_earned / current_possible AS current_score
    FROM outcome_windows
    WHERE baseline_evidence >= 3 AND baseline_attempts >= 2
      AND current_evidence >= 3 AND current_attempts >= 2
      AND baseline_possible > 0 AND current_possible > 0
  )
  SELECT
    (SELECT count(*)::integer FROM targets),
    count(*)::integer,
    count(*) FILTER (WHERE current_score >= baseline_score + 5
      OR (baseline_score >= 80 AND current_score >= 80))::integer,
    count(*) FILTER (WHERE current_score <= baseline_score - 5)::integer
  INTO v_targeted, v_assessed, v_improved, v_declined
  FROM scored;

  v_suggestion := CASE
    WHEN v_assessed = 0 THEN 'insufficient'
    WHEN v_improved * 1.0 / v_assessed >= 0.60 THEN 'effective'
    WHEN v_improved > 0 THEN 'partial'
    ELSE 'ineffective'
  END;
  RETURN jsonb_build_object(
    'modelVersion','institution-program-review-v1',
    'baselineWindowStart',v_baseline_start,'baselineWindowEnd',v_baseline_end,
    'currentWindowStart',v_current_start,'currentWindowEnd',v_current_end,
    'targetedOutcomeCount',v_targeted,'assessedOutcomeCount',v_assessed,
    'improvedOutcomeCount',v_improved,'declinedOutcomeCount',v_declined,
    'insufficientOutcomeCount',v_targeted-v_assessed,'systemSuggestion',v_suggestion
  );
END;
$fn$;

REVOKE ALL ON FUNCTION
  public.get_institution_classroom_growth_metrics(uuid, uuid, timestamptz),
  public.get_institution_classroom_growth_metrics(uuid, uuid, timestamptz, text),
  public.create_institution_study_program_draft(uuid, uuid, text, date, integer, text, jsonb, uuid),
  public.update_institution_study_program_draft(uuid, text, date, integer, jsonb, uuid),
  public.publish_institution_study_program(uuid, text, uuid),
  public.institution_study_program_review_evidence(uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.get_institution_classroom_growth_metrics(uuid, uuid, timestamptz),
  public.create_institution_study_program_draft(uuid, uuid, text, date, integer, text, jsonb, uuid),
  public.update_institution_study_program_draft(uuid, text, date, integer, jsonb, uuid),
  public.publish_institution_study_program(uuid, text, uuid)
TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.get_institution_classroom_growth_metrics(uuid, uuid, timestamptz, text)
TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
