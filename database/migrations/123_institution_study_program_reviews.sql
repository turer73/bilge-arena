-- Migration 123: teacher-reviewed, evidence-backed study program outcomes.
-- System evidence is advisory; the assigned teacher records the final result.
BEGIN;

CREATE TABLE IF NOT EXISTS public.institution_study_program_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_ref text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(16), 'hex')
    CHECK (review_ref ~ '^[0-9a-f]{32}$'),
  program_id uuid NOT NULL UNIQUE REFERENCES public.institution_study_programs(id) ON DELETE RESTRICT,
  institution_id uuid NOT NULL REFERENCES public.pilot_institutions(id) ON DELETE RESTRICT,
  classroom_id uuid NOT NULL REFERENCES public.teacher_classrooms(id) ON DELETE RESTRICT,
  membership_id uuid NOT NULL REFERENCES public.teacher_classroom_memberships(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  teacher_result text NOT NULL CHECK (teacher_result IN ('effective','partial','ineffective','insufficient')),
  system_suggestion text NOT NULL CHECK (system_suggestion IN ('effective','partial','ineffective','insufficient')),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  note text CHECK (note IS NULL OR char_length(btrim(note)) BETWEEN 1 AND 500),
  reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.institution_study_program_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.institution_study_program_reviews
  FROM PUBLIC, anon, authenticated, service_role;

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
      AND outcome.taxonomy_version = 'ba-tyt-math-v1'
      AND outcome.is_active
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

CREATE OR REPLACE FUNCTION public.get_institution_student_program_history(
  p_user_id uuid, p_classroom_id uuid, p_member_ref text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
DECLARE
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_membership public.teacher_classroom_memberships%ROWTYPE;
  v_programs jsonb;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_member_ref IS NULL
    OR p_member_ref !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'invalid institution program history scope' USING ERRCODE='22023'; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution program history actor mismatch' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_classroom FROM public.teacher_classrooms
    WHERE id=p_classroom_id AND teacher_id=p_user_id AND status='active';
  IF NOT FOUND OR NOT public.institution_pilot_has_role(
    p_user_id,v_classroom.institution_id,ARRAY['manager','teacher']::text[]
  ) THEN RAISE EXCEPTION 'assigned institution teacher required' USING ERRCODE='42501'; END IF;
  SELECT membership.* INTO v_membership FROM public.teacher_classroom_memberships AS membership
  JOIN public.profiles AS profile ON profile.id=membership.student_id AND profile.deleted_at IS NULL
  WHERE membership.classroom_id=p_classroom_id AND membership.member_ref=p_member_ref AND membership.status='active';
  IF NOT FOUND OR public.teacher_classroom_is_blocked(p_user_id,v_membership.student_id) THEN
    RAISE EXCEPTION 'active classroom member not found' USING ERRCODE='P0002'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'programRef',scoped.program_ref,'status',scoped.status,'weekStart',scoped.week_start,
    'itemCount',scoped.item_count,'publishedAt',scoped.published_at,
    'reviewEligible',current_date >= scoped.week_start + 14,
    'review',CASE WHEN scoped.review_ref IS NULL THEN NULL ELSE jsonb_build_object(
      'reviewRef',scoped.review_ref,'teacherResult',scoped.teacher_result,
      'systemSuggestion',scoped.system_suggestion,'evidence',scoped.evidence,
      'note',scoped.note,'reviewedAt',scoped.reviewed_at
    ) END
  ) ORDER BY scoped.week_start DESC),'[]'::jsonb) INTO v_programs
  FROM (
    SELECT program.program_ref,program.status,program.week_start,program.item_count,program.published_at,
      review.review_ref,review.teacher_result,review.system_suggestion,review.evidence,review.note,review.reviewed_at
    FROM public.institution_study_programs AS program
    LEFT JOIN public.institution_study_program_reviews AS review ON review.program_id=program.id
    WHERE program.institution_id=v_classroom.institution_id AND program.classroom_id=p_classroom_id
      AND program.membership_id=v_membership.id AND program.student_id=v_membership.student_id
      AND program.teacher_id=p_user_id AND program.status IN ('published','completed')
    ORDER BY program.week_start DESC LIMIT 8
  ) AS scoped;
  RETURN jsonb_build_object('programs',v_programs);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.preview_institution_study_program_review(
  p_user_id uuid, p_program_ref text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
DECLARE v_program public.institution_study_programs%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_program_ref IS NULL OR p_program_ref!~'^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'invalid institution program review preview' USING ERRCODE='22023'; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution program review actor mismatch' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_program FROM public.institution_study_programs
    WHERE program_ref=p_program_ref AND teacher_id=p_user_id AND status='published';
  IF NOT FOUND OR NOT public.institution_pilot_has_role(
    p_user_id,v_program.institution_id,ARRAY['manager','teacher']::text[]
  ) THEN RAISE EXCEPTION 'published teacher program not found' USING ERRCODE='P0002'; END IF;
  IF current_date < v_program.week_start+14 THEN
    RAISE EXCEPTION 'program review evidence window is not mature' USING ERRCODE='22023'; END IF;
  RETURN public.institution_study_program_review_evidence(v_program.id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.review_institution_study_program(
  p_user_id uuid, p_program_ref text, p_teacher_result text, p_note text, p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
DECLARE
  v_program public.institution_study_programs%ROWTYPE;
  v_review public.institution_study_program_reviews%ROWTYPE;
  v_request public.pilot_institution_requests%ROWTYPE;
  v_evidence jsonb;
  v_note text:=NULLIF(btrim(p_note),'');
  v_hash text; v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_program_ref IS NULL OR p_program_ref!~'^[0-9a-f]{32}$'
    OR p_teacher_result NOT IN ('effective','partial','ineffective','insufficient')
    OR (v_note IS NOT NULL AND char_length(v_note)>500) THEN
    RAISE EXCEPTION 'invalid institution program review' USING ERRCODE='22023'; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution program review actor mismatch' USING ERRCODE='42501'; END IF;
  v_hash:=public.institution_pilot_payload_hash(jsonb_build_object(
    'programRef',p_program_ref,'teacherResult',p_teacher_result,'note',v_note));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text||':program-review:'||p_request_id::text,0));
  SELECT * INTO v_request FROM public.pilot_institution_requests
    WHERE user_id=p_user_id AND operation='review_study_program' AND request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash<>v_hash THEN RAISE EXCEPTION 'program review payload mismatch' USING ERRCODE='22023'; END IF;
    RETURN v_request.result||jsonb_build_object('replayed',true); END IF;
  SELECT * INTO v_program FROM public.institution_study_programs
    WHERE program_ref=p_program_ref AND teacher_id=p_user_id AND status='published' FOR UPDATE;
  IF NOT FOUND OR NOT public.institution_pilot_has_role(
    p_user_id,v_program.institution_id,ARRAY['manager','teacher']::text[]
  ) THEN RAISE EXCEPTION 'published teacher program not found' USING ERRCODE='P0002'; END IF;
  IF current_date < v_program.week_start+14 THEN
    RAISE EXCEPTION 'program review evidence window is not mature' USING ERRCODE='22023'; END IF;
  v_evidence:=public.institution_study_program_review_evidence(v_program.id);
  INSERT INTO public.institution_study_program_reviews(
    program_id,institution_id,classroom_id,membership_id,student_id,teacher_id,
    teacher_result,system_suggestion,evidence,note
  ) VALUES (
    v_program.id,v_program.institution_id,v_program.classroom_id,v_program.membership_id,
    v_program.student_id,p_user_id,p_teacher_result,v_evidence->>'systemSuggestion',v_evidence,v_note
  ) RETURNING * INTO v_review;
  UPDATE public.institution_study_programs SET status='completed',completed_at=clock_timestamp()
    WHERE id=v_program.id;
  v_result:=jsonb_build_object(
    'reviewRef',v_review.review_ref,'teacherResult',v_review.teacher_result,
    'systemSuggestion',v_review.system_suggestion,'evidence',v_review.evidence,
    'note',v_review.note,'reviewedAt',v_review.reviewed_at,'replayed',false
  );
  INSERT INTO public.pilot_institution_requests(user_id,operation,request_id,payload_hash,result)
    VALUES(p_user_id,'review_study_program',p_request_id,v_hash,v_result);
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION
  public.institution_study_program_review_evidence(uuid),
  public.get_institution_student_program_history(uuid,uuid,text),
  public.preview_institution_study_program_review(uuid,text),
  public.review_institution_study_program(uuid,text,text,text,uuid)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
  public.get_institution_student_program_history(uuid,uuid,text),
  public.preview_institution_study_program_review(uuid,text),
  public.review_institution_study_program(uuid,text,text,text,uuid)
TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
