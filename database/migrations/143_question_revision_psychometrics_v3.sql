-- Migration 143: conservative, provenance-honest revision psychometrics.
--
-- Client-reported time is not an eligibility signal. Repeated exposure is
-- excluded across revisions and adaptive diagnostic exposure is included in
-- that history. Classical item-rest discrimination uses a normalized rest
-- score; this is still descriptive evidence, not an IRT ability estimate.
BEGIN;

CREATE OR REPLACE FUNCTION public.materialize_question_revision_psychometrics(
  p_user_id uuid,
  p_revision_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE
  n integer; good integer; omitted integer; disc numeric;
  p numeric; z2 numeric:=3.8416; center numeric; margin numeric;
  low numeric; high numeric; h text; old public.content_governance_requests%ROWTYPE; out jsonb;
  v_content jsonb; v_option_count integer; v_correct_option smallint;
  v_policy constant text:='verified_first_question_exposure_no_hint_no_timing_normalized_rest_v3';
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.psychometrics.refresh') THEN
    RAISE EXCEPTION 'psychometric permission required' USING ERRCODE='42501';
  END IF;
  IF p_window_start IS NULL OR p_window_end IS NULL OR p_window_end<=p_window_start
    OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'invalid psychometric request' USING ERRCODE='22023';
  END IF;

  SELECT revision.content INTO v_content
  FROM public.question_content_revisions revision
  WHERE revision.id=p_revision_id;
  IF NOT FOUND
    OR jsonb_typeof(v_content->'options') IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_content->'options') NOT BETWEEN 2 AND 10
    OR COALESCE(v_content->>'answer','') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'revision does not contain valid option evidence' USING ERRCODE='22023';
  END IF;
  v_option_count:=jsonb_array_length(v_content->'options');
  v_correct_option:=(v_content->>'answer')::smallint;
  IF v_correct_option NOT BETWEEN 0 AND v_option_count-1 THEN
    RAISE EXCEPTION 'revision answer is outside its option evidence' USING ERRCODE='22023';
  END IF;

  PERFORM public.content_governance_lock_request(p_user_id,'materialize_psychometrics',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object(
    'revisionId',p_revision_id,'windowStart',p_window_start,'windowEnd',p_window_end,
    'eligibilityPolicy',v_policy
  ));
  SELECT * INTO old FROM public.content_governance_requests
  WHERE user_id=p_user_id AND operation='materialize_psychometrics' AND request_id=p_request_id;
  IF FOUND THEN
    IF old.payload_hash<>h THEN
      RAISE EXCEPTION 'psychometric request payload mismatch' USING ERRCODE='22023';
    END IF;
    RETURN old.result||jsonb_build_object('replayed',true);
  END IF;

  WITH candidate AS MATERIALIZED (
    SELECT a.*,
      CASE WHEN session.total_questions>1 THEN
        (session.correct_count-(a.is_correct)::int)::double precision
          /(session.total_questions-1)::double precision
      ELSE NULL END AS normalized_rest_score,
      EXISTS (
        SELECT 1 FROM public.verified_attempt_hint_events hint
        WHERE hint.attempt_id=attempt.id AND hint.question_id=a.question_id
      ) AS has_hint
    FROM public.session_answers a
    JOIN public.verified_attempts attempt
      ON attempt.session_id=a.session_id
      AND attempt.user_id=a.user_id
      AND attempt.completed_at IS NOT NULL
    JOIN public.verified_attempt_question_revisions snapshot
      ON snapshot.attempt_id=attempt.id
      AND snapshot.question_id=a.question_id
      AND snapshot.revision_id=a.question_revision_id
    JOIN public.game_sessions session
      ON session.id=a.session_id
      AND session.user_id=a.user_id
      AND session.status='completed'
    WHERE a.question_revision_id=p_revision_id
      AND a.answered_at>=p_window_start AND a.answered_at<p_window_end
      AND NOT EXISTS (
        SELECT 1 FROM public.session_answers earlier
        WHERE earlier.user_id=a.user_id
          AND earlier.question_id=a.question_id
          AND (earlier.answered_at,earlier.id)<(a.answered_at,a.id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.adaptive_diagnostic_answers diagnostic
        WHERE diagnostic.user_id=a.user_id
          AND diagnostic.question_id=a.question_id
          AND diagnostic.created_at<a.answered_at
      )
  ), eligible AS MATERIALIZED (
    SELECT * FROM candidate
    WHERE NOT has_hint
      AND NOT COALESCE(is_skipped,false)
      AND selected_option IS NOT NULL
  )
  SELECT
    (SELECT count(*)::int FROM eligible),
    (SELECT count(*) FILTER(WHERE is_correct)::int FROM eligible),
    (SELECT count(*)::int FROM candidate)-(SELECT count(*)::int FROM eligible),
    (SELECT corr((is_correct)::int::double precision,normalized_rest_score) FROM eligible)
  INTO n,good,omitted,disc;

  IF n>0 THEN
    p:=good::numeric/n;
    center:=(p+z2/(2*n))/(1+z2/n);
    margin:=1.96*sqrt((p*(1-p)+z2/(4*n))/n)/(1+z2/n);
    low:=GREATEST(0,center-margin);
    high:=LEAST(1,center+margin);
  ELSE
    p:=NULL; low:=NULL; high:=NULL;
  END IF;

  INSERT INTO public.question_revision_psychometrics(
    revision_id,window_start,window_end,materialization_hash,sample_n,correct_n,
    p_correct,wilson_low,wilson_high,discrimination,omitted_n,
    median_response_time_sec,fast_response_rate,eligibility_policy
  ) VALUES(
    p_revision_id,p_window_start,p_window_end,h,n,good,p,low,high,
    CASE WHEN n<30 THEN NULL ELSE disc END,omitted,NULL,NULL,v_policy
  ) ON CONFLICT(revision_id,window_start,window_end) DO UPDATE SET
    materialization_hash=EXCLUDED.materialization_hash,sample_n=EXCLUDED.sample_n,
    correct_n=EXCLUDED.correct_n,p_correct=EXCLUDED.p_correct,
    wilson_low=EXCLUDED.wilson_low,wilson_high=EXCLUDED.wilson_high,
    discrimination=EXCLUDED.discrimination,omitted_n=EXCLUDED.omitted_n,
    median_response_time_sec=NULL,fast_response_rate=NULL,
    eligibility_policy=EXCLUDED.eligibility_policy,materialized_at=clock_timestamp();

  DELETE FROM public.question_option_statistics
  WHERE revision_id=p_revision_id AND window_start=p_window_start AND window_end=p_window_end;
  INSERT INTO public.question_option_statistics(
    revision_id,window_start,window_end,option_index,selected_n,selected_rate,
    is_correct_option,discrimination,eligibility_policy
  )
  WITH eligible AS MATERIALIZED (
    SELECT a.selected_option,
      CASE WHEN session.total_questions>1 THEN
        (session.correct_count-(a.is_correct)::int)::double precision
          /(session.total_questions-1)::double precision
      ELSE NULL END AS normalized_rest_score
    FROM public.session_answers a
    JOIN public.verified_attempts attempt
      ON attempt.session_id=a.session_id
      AND attempt.user_id=a.user_id
      AND attempt.completed_at IS NOT NULL
    JOIN public.verified_attempt_question_revisions snapshot
      ON snapshot.attempt_id=attempt.id
      AND snapshot.question_id=a.question_id
      AND snapshot.revision_id=a.question_revision_id
    JOIN public.game_sessions session
      ON session.id=a.session_id
      AND session.user_id=a.user_id
      AND session.status='completed'
    WHERE a.question_revision_id=p_revision_id
      AND a.answered_at>=p_window_start AND a.answered_at<p_window_end
      AND NOT COALESCE(a.is_skipped,false)
      AND a.selected_option IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.verified_attempt_hint_events hint
        WHERE hint.attempt_id=attempt.id AND hint.question_id=a.question_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.session_answers earlier
        WHERE earlier.user_id=a.user_id
          AND earlier.question_id=a.question_id
          AND (earlier.answered_at,earlier.id)<(a.answered_at,a.id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.adaptive_diagnostic_answers diagnostic
        WHERE diagnostic.user_id=a.user_id
          AND diagnostic.question_id=a.question_id
          AND diagnostic.created_at<a.answered_at
      )
  )
  SELECT p_revision_id,p_window_start,p_window_end,option_index.i::smallint,
    count(eligible_answer.selected_option) FILTER(WHERE eligible_answer.selected_option=option_index.i)::int,
    CASE WHEN count(eligible_answer.selected_option)=0 THEN NULL
      ELSE count(eligible_answer.selected_option) FILTER(WHERE eligible_answer.selected_option=option_index.i)::numeric
        /count(eligible_answer.selected_option)
    END,
    option_index.i=v_correct_option,
    CASE WHEN count(eligible_answer.selected_option)<30 THEN NULL
      ELSE corr((eligible_answer.selected_option=option_index.i)::int::double precision,eligible_answer.normalized_rest_score)
    END,
    v_policy
  FROM generate_series(0,v_option_count-1) option_index(i)
  LEFT JOIN eligible eligible_answer ON true
  GROUP BY option_index.i;

  out:=jsonb_build_object(
    'revisionId',p_revision_id,'sampleN',n,'correctN',good,'omittedN',omitted,
    'pCorrect',p,'wilsonLow',low,'wilsonHigh',high,
    'discrimination',CASE WHEN n<30 THEN NULL ELSE disc END,
    'medianResponseTimeSec',NULL::numeric,'fastResponseRate',NULL::numeric,
    'eligibilityPolicy',v_policy,'replayed',false
  );
  INSERT INTO public.content_governance_requests
  VALUES(p_user_id,'materialize_psychometrics',p_request_id,h,out,clock_timestamp());
  RETURN out;
END
$fn$;

REVOKE ALL ON FUNCTION public.materialize_question_revision_psychometrics(uuid,uuid,timestamptz,timestamptz,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.materialize_question_revision_psychometrics(uuid,uuid,timestamptz,timestamptz,uuid)
  TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
