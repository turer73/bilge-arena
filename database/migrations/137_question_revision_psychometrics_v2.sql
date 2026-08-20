-- Migration 137: measurement-eligible revision and option psychometrics.
-- Fixes the legacy normal/Wald interval that was stored under Wilson columns,
-- and materializes canonical selected_option statistics per revision.

BEGIN;

ALTER TABLE public.question_revision_psychometrics
  ADD COLUMN IF NOT EXISTS omitted_n integer NOT NULL DEFAULT 0 CHECK (omitted_n >= 0),
  ADD COLUMN IF NOT EXISTS median_response_time_sec numeric(10,3),
  ADD COLUMN IF NOT EXISTS fast_response_rate numeric(8,6),
  ADD COLUMN IF NOT EXISTS eligibility_policy text NOT NULL DEFAULT 'legacy_verified_v1';

CREATE TABLE IF NOT EXISTS public.question_option_statistics (
  revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  option_index smallint NOT NULL CHECK (option_index BETWEEN 0 AND 9),
  selected_n integer NOT NULL CHECK (selected_n >= 0),
  selected_rate numeric(8,6) CHECK (selected_rate BETWEEN 0 AND 1),
  is_correct_option boolean NOT NULL,
  discrimination numeric(10,6) CHECK (discrimination BETWEEN -1 AND 1),
  eligibility_policy text NOT NULL,
  materialized_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(revision_id, window_start, window_end, option_index),
  CHECK (window_end > window_start)
);

CREATE OR REPLACE FUNCTION public.materialize_question_revision_psychometrics(
  p_user_id uuid,
  p_revision_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE
  n integer; good integer; omitted integer; disc numeric; med numeric; fast_rate numeric;
  p numeric; z2 numeric := 3.8416; center numeric; margin numeric;
  low numeric; high numeric; h text; old public.content_governance_requests%ROWTYPE; out jsonb;
  v_policy constant text := 'verified_first_exposure_no_hint_valid_time_v2';
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.psychometrics.refresh') THEN
    RAISE EXCEPTION 'psychometric permission required' USING ERRCODE='42501';
  END IF;
  IF p_window_start IS NULL OR p_window_end IS NULL OR p_window_end<=p_window_start OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'invalid psychometric request' USING ERRCODE='22023';
  END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'materialize_psychometrics',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object('revisionId',p_revision_id,'windowStart',p_window_start,'windowEnd',p_window_end,'eligibilityPolicy',v_policy));
  SELECT * INTO old FROM public.content_governance_requests
    WHERE user_id=p_user_id AND operation='materialize_psychometrics' AND request_id=p_request_id;
  IF FOUND THEN
    IF old.payload_hash<>h THEN RAISE EXCEPTION 'psychometric request payload mismatch' USING ERRCODE='22023'; END IF;
    RETURN old.result||jsonb_build_object('replayed',true);
  END IF;

  WITH base AS MATERIALIZED (
    SELECT a.*, va.id AS attempt_id,
      (s.correct_count-(a.is_correct)::int)::double precision AS rest_score
    FROM public.session_answers a
    JOIN public.verified_attempts va
      ON va.session_id=a.session_id AND va.completed_at IS NOT NULL
    JOIN public.verified_attempt_question_revisions snap
      ON snap.attempt_id=va.id AND snap.question_id=a.question_id
      AND snap.revision_id=a.question_revision_id
    JOIN public.game_sessions s ON s.id=a.session_id AND s.status='completed'
    WHERE a.question_revision_id=p_revision_id
      AND a.answered_at>=p_window_start AND a.answered_at<p_window_end
      AND NOT EXISTS (
        SELECT 1 FROM public.verified_attempt_hint_events hint
        WHERE hint.attempt_id=va.id AND hint.question_id=a.question_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.session_answers earlier
        WHERE earlier.user_id=a.user_id
          AND earlier.question_revision_id=a.question_revision_id
          AND (earlier.answered_at,earlier.id)<(a.answered_at,a.id)
      )
  ), eligible AS (
    SELECT * FROM base
    WHERE NOT COALESCE(is_skipped,false) AND selected_option IS NOT NULL
      AND time_taken_sec BETWEEN 2 AND 600
  )
  SELECT
    (SELECT count(*)::int FROM eligible),
    (SELECT count(*) FILTER(WHERE is_correct)::int FROM eligible),
    (SELECT count(*) FILTER(WHERE COALESCE(is_skipped,false) OR selected_option IS NULL)::int FROM base),
    (SELECT corr((is_correct)::int::double precision,rest_score) FROM eligible),
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY time_taken_sec) FROM eligible),
    (SELECT count(*) FILTER(WHERE COALESCE(is_fast,false))::numeric/NULLIF(count(*),0) FROM eligible)
  INTO n,good,omitted,disc,med,fast_rate;

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
    CASE WHEN n<30 THEN NULL ELSE disc END,omitted,med,fast_rate,v_policy
  ) ON CONFLICT(revision_id,window_start,window_end) DO UPDATE SET
    materialization_hash=EXCLUDED.materialization_hash,sample_n=EXCLUDED.sample_n,
    correct_n=EXCLUDED.correct_n,p_correct=EXCLUDED.p_correct,
    wilson_low=EXCLUDED.wilson_low,wilson_high=EXCLUDED.wilson_high,
    discrimination=EXCLUDED.discrimination,omitted_n=EXCLUDED.omitted_n,
    median_response_time_sec=EXCLUDED.median_response_time_sec,
    fast_response_rate=EXCLUDED.fast_response_rate,
    eligibility_policy=EXCLUDED.eligibility_policy,materialized_at=clock_timestamp();

  DELETE FROM public.question_option_statistics
    WHERE revision_id=p_revision_id AND window_start=p_window_start AND window_end=p_window_end;
  INSERT INTO public.question_option_statistics(
    revision_id,window_start,window_end,option_index,selected_n,selected_rate,
    is_correct_option,discrimination,eligibility_policy
  )
  WITH eligible AS MATERIALIZED (
    SELECT a.selected_option,
      (s.correct_count-(a.is_correct)::int)::double precision AS rest_score
    FROM public.session_answers a
    JOIN public.verified_attempts va ON va.session_id=a.session_id AND va.completed_at IS NOT NULL
    JOIN public.verified_attempt_question_revisions snap
      ON snap.attempt_id=va.id AND snap.question_id=a.question_id AND snap.revision_id=a.question_revision_id
    JOIN public.game_sessions s ON s.id=a.session_id AND s.status='completed'
    WHERE a.question_revision_id=p_revision_id
      AND a.answered_at>=p_window_start AND a.answered_at<p_window_end
      AND NOT COALESCE(a.is_skipped,false) AND a.selected_option IS NOT NULL
      AND a.time_taken_sec BETWEEN 2 AND 600
      AND NOT EXISTS (SELECT 1 FROM public.verified_attempt_hint_events hint WHERE hint.attempt_id=va.id AND hint.question_id=a.question_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.session_answers earlier
        WHERE earlier.user_id=a.user_id AND earlier.question_revision_id=a.question_revision_id
          AND (earlier.answered_at,earlier.id)<(a.answered_at,a.id)
      )
  ), revision AS (
    SELECT jsonb_array_length(content->'options') AS option_count,
      (content->>'answer')::smallint AS correct_option
    FROM public.question_content_revisions WHERE id=p_revision_id
  )
  SELECT p_revision_id,p_window_start,p_window_end,g.i::smallint,
    count(e.*) FILTER(WHERE e.selected_option=g.i)::int,
    CASE WHEN count(e.*)=0 THEN NULL ELSE count(e.*) FILTER(WHERE e.selected_option=g.i)::numeric/count(e.*) END,
    g.i=r.correct_option,
    CASE WHEN count(e.*)<30 THEN NULL ELSE corr((e.selected_option=g.i)::int::double precision,e.rest_score) END,
    v_policy
  FROM revision r CROSS JOIN LATERAL generate_series(0,r.option_count-1) g(i)
  LEFT JOIN eligible e ON true
  GROUP BY g.i,r.correct_option;

  out:=jsonb_build_object(
    'revisionId',p_revision_id,'sampleN',n,'correctN',good,'omittedN',omitted,
    'pCorrect',p,'wilsonLow',low,'wilsonHigh',high,
    'discrimination',CASE WHEN n<30 THEN NULL ELSE disc END,
    'medianResponseTimeSec',med,'fastResponseRate',fast_rate,
    'eligibilityPolicy',v_policy,'replayed',false
  );
  INSERT INTO public.content_governance_requests
    VALUES(p_user_id,'materialize_psychometrics',p_request_id,h,out,clock_timestamp());
  RETURN out;
END $fn$;

ALTER TABLE public.question_option_statistics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.question_option_statistics FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
