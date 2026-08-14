-- Migration 122: baseline-adjusted, exposure-gated classroom growth evidence.
-- Two adjacent 28-day windows are compared. Learners without enough verified
-- evidence in both windows are excluded, never treated as zero growth.
BEGIN;

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
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_role text;
  v_active_count integer;
  v_eligible_count integer;
  v_positive_count integer;
  v_baseline_start timestamptz := p_window_end - interval '56 days';
  v_baseline_end timestamptz := p_window_end - interval '28 days';
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_window_end IS NULL
    OR p_window_end > clock_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION 'invalid classroom growth window' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'classroom growth actor mismatch' USING ERRCODE = '42501';
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
      -- Both windows must fall inside the active sharing/responsibility period.
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
      AND outcome.taxonomy_version = 'ba-tyt-math-v1'
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

REVOKE ALL ON FUNCTION public.get_institution_classroom_growth_metrics(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_institution_classroom_growth_metrics(uuid, uuid, timestamptz)
  TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
