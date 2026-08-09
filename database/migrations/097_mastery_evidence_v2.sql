-- Migration 097: verified-completion mastery evidence v2.
-- Rollback (after readers stop using v2 fields): drop 097 triggers/functions/tables,
-- then remove v2 columns from user_outcome_state. Never delete base 086 evidence.
BEGIN;

CREATE TABLE IF NOT EXISTS public.mastery_outcome_evidence (
  answer_id uuid NOT NULL REFERENCES public.session_answers(id) ON DELETE RESTRICT,
  outcome_id uuid NOT NULL REFERENCES public.curriculum_outcomes(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  attempt_id uuid NOT NULL REFERENCES public.verified_attempts(id) ON DELETE RESTRICT,
  is_correct boolean NOT NULL,
  mapping_weight numeric(6,3) NOT NULL CHECK (mapping_weight > 0),
  difficulty smallint NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  difficulty_weighted_earned numeric(12,3) NOT NULL CHECK (difficulty_weighted_earned >= 0),
  difficulty_weighted_possible numeric(12,3) NOT NULL CHECK (difficulty_weighted_possible > 0),
  time_taken_sec numeric(8,2) CHECK (time_taken_sec IS NULL OR time_taken_sec >= 0),
  fast_wrong boolean NOT NULL DEFAULT false,
  max_hint_stage smallint NOT NULL DEFAULT 0 CHECK (max_hint_stage BETWEEN 0 AND 4),
  delayed_correct boolean NOT NULL DEFAULT false,
  base_already_recorded boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (answer_id,outcome_id)
);
CREATE INDEX IF NOT EXISTS mastery_outcome_evidence_user_outcome_idx ON public.mastery_outcome_evidence(user_id,outcome_id);
CREATE INDEX IF NOT EXISTS mastery_outcome_evidence_attempt_idx ON public.mastery_outcome_evidence(attempt_id);

CREATE TABLE IF NOT EXISTS public.mastery_materialized_attempts (
  attempt_id uuid PRIMARY KEY REFERENCES public.verified_attempts(id) ON DELETE RESTRICT,
  materialized_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.verified_attempt_hint_events (
  attempt_id uuid NOT NULL REFERENCES public.verified_attempts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  stage smallint NOT NULL CHECK (stage BETWEEN 1 AND 4),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (attempt_id,question_id,stage)
);
CREATE INDEX IF NOT EXISTS verified_attempt_hint_events_attempt_question_idx ON public.verified_attempt_hint_events(attempt_id,question_id);

ALTER TABLE public.user_outcome_state ADD COLUMN IF NOT EXISTS v2_attempts integer NOT NULL DEFAULT 0 CHECK (v2_attempts >= 0);
ALTER TABLE public.user_outcome_state ADD COLUMN IF NOT EXISTS difficulty_weighted_earned numeric(14,3) NOT NULL DEFAULT 0 CHECK (difficulty_weighted_earned >= 0);
ALTER TABLE public.user_outcome_state ADD COLUMN IF NOT EXISTS difficulty_weighted_possible numeric(14,3) NOT NULL DEFAULT 0 CHECK (difficulty_weighted_possible >= 0 AND difficulty_weighted_earned <= difficulty_weighted_possible);
ALTER TABLE public.user_outcome_state ADD COLUMN IF NOT EXISTS timed_attempts integer NOT NULL DEFAULT 0 CHECK (timed_attempts >= 0);
ALTER TABLE public.user_outcome_state ADD COLUMN IF NOT EXISTS total_time_sec numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_time_sec >= 0);
ALTER TABLE public.user_outcome_state ADD COLUMN IF NOT EXISTS fast_wrong integer NOT NULL DEFAULT 0 CHECK (fast_wrong >= 0);
ALTER TABLE public.user_outcome_state ADD COLUMN IF NOT EXISTS hinted_attempts integer NOT NULL DEFAULT 0 CHECK (hinted_attempts >= 0);
ALTER TABLE public.user_outcome_state ADD COLUMN IF NOT EXISTS hint_stage_sum integer NOT NULL DEFAULT 0 CHECK (hint_stage_sum >= 0);
ALTER TABLE public.user_outcome_state ADD COLUMN IF NOT EXISTS guess_annotations integer NOT NULL DEFAULT 0 CHECK (guess_annotations >= 0);
ALTER TABLE public.user_outcome_state ADD COLUMN IF NOT EXISTS careless_annotations integer NOT NULL DEFAULT 0 CHECK (careless_annotations >= 0);
ALTER TABLE public.user_outcome_state DROP CONSTRAINT IF EXISTS user_outcome_state_v2_bounds_check;
ALTER TABLE public.user_outcome_state ADD CONSTRAINT user_outcome_state_v2_bounds_check CHECK (
  timed_attempts <= v2_attempts AND fast_wrong <= v2_attempts
  AND hinted_attempts <= v2_attempts AND hint_stage_sum <= 4 * hinted_attempts
  AND guess_annotations + careless_annotations <= v2_attempts
);

-- ON CONFLICT first builds an excluded delta row before updating the stored
-- aggregate. A normal CHECK would reject that transient row when migration
-- 086 already recorded the base attempt (attempts delta 0, v2 delta 1).
-- This deferred constraint trigger validates only the final persisted row.
CREATE OR REPLACE FUNCTION public.user_outcome_state_v2_attempt_bounds()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF NEW.v2_attempts > NEW.attempts THEN
    RAISE EXCEPTION 'v2 attempts cannot exceed base attempts' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $fn$;
DROP TRIGGER IF EXISTS trg_user_outcome_state_v2_attempt_bounds ON public.user_outcome_state;
CREATE CONSTRAINT TRIGGER trg_user_outcome_state_v2_attempt_bounds
AFTER INSERT OR UPDATE OF attempts,v2_attempts ON public.user_outcome_state
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.user_outcome_state_v2_attempt_bounds();

ALTER TABLE public.mastery_outcome_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mastery_materialized_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verified_attempt_hint_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mastery_outcome_evidence, public.mastery_materialized_attempts, public.verified_attempt_hint_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.mastery_outcome_evidence, public.mastery_materialized_attempts, public.verified_attempt_hint_events, public.user_outcome_state FROM service_role;
GRANT SELECT ON TABLE public.user_outcome_state TO service_role;

CREATE OR REPLACE FUNCTION public.materialize_verified_attempt_mastery(p_attempt_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_attempt record; v_new boolean;
BEGIN
  SELECT * INTO v_attempt FROM public.verified_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF NOT FOUND OR v_attempt.completed_at IS NULL OR v_attempt.session_id IS NULL THEN
    RAISE EXCEPTION 'completed verified attempt required' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.mastery_materialized_attempts(attempt_id) VALUES(p_attempt_id)
  ON CONFLICT(attempt_id) DO NOTHING RETURNING true INTO v_new;
  IF NOT COALESCE(v_new,false) THEN RETURN; END IF;

  INSERT INTO public.mastery_outcome_evidence(
    answer_id,outcome_id,user_id,question_id,session_id,attempt_id,is_correct,mapping_weight,difficulty,
    difficulty_weighted_earned,difficulty_weighted_possible,time_taken_sec,fast_wrong,max_hint_stage,
    delayed_correct,base_already_recorded
  )
  SELECT sa.id,mapping.outcome_id,sa.user_id,sa.question_id,sa.session_id,p_attempt_id,sa.is_correct,mapping.weight,
    q.difficulty,
    CASE WHEN sa.is_correct THEN mapping.weight*q.difficulty ELSE 0 END,
    mapping.weight*q.difficulty,sa.time_taken_sec,
    COALESCE(NOT sa.is_correct AND sa.is_fast,false),
    COALESCE((SELECT max(h.stage) FROM public.verified_attempt_hint_events h WHERE h.attempt_id=p_attempt_id AND h.question_id=sa.question_id),0),
    sa.is_correct AND EXISTS(SELECT 1 FROM public.session_answers previous WHERE previous.user_id=sa.user_id AND previous.question_id=sa.question_id AND previous.id<>sa.id AND previous.answered_at<=sa.answered_at-interval '24 hours'),
    mapping.created_at <= sa.answered_at
  FROM public.session_answers sa
  JOIN public.questions q ON q.id=sa.question_id
  JOIN public.question_outcomes mapping ON mapping.question_id=sa.question_id
  JOIN public.curriculum_outcomes outcome ON outcome.id=mapping.outcome_id AND outcome.is_active
  WHERE sa.session_id=v_attempt.session_id AND sa.user_id=v_attempt.user_id AND NOT COALESCE(sa.is_skipped,false)
  ON CONFLICT(answer_id,outcome_id) DO NOTHING;
  INSERT INTO public.user_outcome_state(
    user_id,outcome_id,attempts,correct_attempts,weighted_earned,weighted_possible,delayed_correct,last_answered_at,updated_at,
    v2_attempts,difficulty_weighted_earned,difficulty_weighted_possible,timed_attempts,total_time_sec,fast_wrong,hinted_attempts,hint_stage_sum,guess_annotations,careless_annotations
  )
  SELECT e.user_id,e.outcome_id,
    sum(CASE WHEN e.base_already_recorded THEN 0 ELSE 1 END)::integer,
    sum(CASE WHEN NOT e.base_already_recorded AND e.is_correct THEN 1 ELSE 0 END)::integer,
    sum(CASE WHEN NOT e.base_already_recorded AND e.is_correct THEN e.mapping_weight ELSE 0 END),
    sum(CASE WHEN e.base_already_recorded THEN 0 ELSE e.mapping_weight END),
    sum(CASE WHEN NOT e.base_already_recorded AND e.delayed_correct THEN 1 ELSE 0 END)::integer,
    max(sa.answered_at),clock_timestamp(),
    count(*)::integer,sum(e.difficulty_weighted_earned),sum(e.difficulty_weighted_possible),
    count(*) FILTER (WHERE e.time_taken_sec IS NOT NULL)::integer,sum(COALESCE(e.time_taken_sec,0)),
    count(*) FILTER (WHERE e.fast_wrong)::integer,count(*) FILTER (WHERE e.max_hint_stage>0)::integer,sum(e.max_hint_stage)::integer,
    count(*) FILTER (WHERE EXISTS(SELECT 1 FROM public.review_logs log JOIN public.review_error_annotations ann ON ann.review_log_id=log.id WHERE log.answer_id=e.answer_id AND ann.reason_code='guess'))::integer,
    count(*) FILTER (WHERE EXISTS(SELECT 1 FROM public.review_logs log JOIN public.review_error_annotations ann ON ann.review_log_id=log.id WHERE log.answer_id=e.answer_id AND ann.reason_code='careless'))::integer
  FROM public.mastery_outcome_evidence e
  JOIN public.session_answers sa ON sa.id=e.answer_id
  WHERE e.attempt_id=p_attempt_id
  GROUP BY e.user_id,e.outcome_id
  ON CONFLICT(user_id,outcome_id) DO UPDATE SET
    attempts=public.user_outcome_state.attempts+EXCLUDED.attempts,
    correct_attempts=public.user_outcome_state.correct_attempts+EXCLUDED.correct_attempts,
    weighted_earned=public.user_outcome_state.weighted_earned+EXCLUDED.weighted_earned,
    weighted_possible=public.user_outcome_state.weighted_possible+EXCLUDED.weighted_possible,
    delayed_correct=public.user_outcome_state.delayed_correct+EXCLUDED.delayed_correct,
    last_answered_at=GREATEST(public.user_outcome_state.last_answered_at,EXCLUDED.last_answered_at),updated_at=clock_timestamp(),
    v2_attempts=public.user_outcome_state.v2_attempts+EXCLUDED.v2_attempts,
    difficulty_weighted_earned=public.user_outcome_state.difficulty_weighted_earned+EXCLUDED.difficulty_weighted_earned,
    difficulty_weighted_possible=public.user_outcome_state.difficulty_weighted_possible+EXCLUDED.difficulty_weighted_possible,
    timed_attempts=public.user_outcome_state.timed_attempts+EXCLUDED.timed_attempts,total_time_sec=public.user_outcome_state.total_time_sec+EXCLUDED.total_time_sec,
    fast_wrong=public.user_outcome_state.fast_wrong+EXCLUDED.fast_wrong,hinted_attempts=public.user_outcome_state.hinted_attempts+EXCLUDED.hinted_attempts,
    hint_stage_sum=public.user_outcome_state.hint_stage_sum+EXCLUDED.hint_stage_sum,
    guess_annotations=public.user_outcome_state.guess_annotations+EXCLUDED.guess_annotations,careless_annotations=public.user_outcome_state.careless_annotations+EXCLUDED.careless_annotations;
END $fn$;

CREATE OR REPLACE FUNCTION public.trg_materialize_verified_attempt_mastery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN PERFORM public.materialize_verified_attempt_mastery(NEW.id); RETURN NEW; END $fn$;
DROP TRIGGER IF EXISTS trg_materialize_verified_attempt_mastery ON public.verified_attempts;
CREATE TRIGGER trg_materialize_verified_attempt_mastery AFTER UPDATE OF completed_at,session_id ON public.verified_attempts
FOR EACH ROW WHEN (OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL AND OLD.session_id IS NULL AND NEW.session_id IS NOT NULL)
EXECUTE FUNCTION public.trg_materialize_verified_attempt_mastery();

CREATE OR REPLACE FUNCTION public.record_verified_hint_event(p_attempt_id uuid,p_user_id uuid,p_question_id uuid,p_stage smallint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE a record; inserted boolean;
BEGIN
  IF p_attempt_id IS NULL OR p_user_id IS NULL OR p_question_id IS NULL OR p_stage IS NULL THEN
    RAISE EXCEPTION 'attempt, user, question and stage are required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO a FROM public.verified_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF NOT FOUND OR a.user_id IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'attempt owner mismatch' USING ERRCODE='42501'; END IF;
  IF a.completed_at IS NOT NULL OR a.expires_at<=clock_timestamp() OR NOT (p_question_id=ANY(a.question_ids)) THEN RAISE EXCEPTION 'attempt is not eligible for hints' USING ERRCODE='22023'; END IF;
  IF p_stage NOT BETWEEN 1 AND 4 THEN RAISE EXCEPTION 'hint stage must be 1..4' USING ERRCODE='22023'; END IF;
  INSERT INTO public.verified_attempt_hint_events(attempt_id,user_id,question_id,stage) VALUES(p_attempt_id,p_user_id,p_question_id,p_stage)
  ON CONFLICT DO NOTHING RETURNING true INTO inserted;
  RETURN jsonb_build_object('recorded',COALESCE(inserted,false));
END $fn$;

CREATE OR REPLACE FUNCTION public.trg_review_error_annotation_mastery_delta()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE answer uuid; guess_delta integer; careless_delta integer;
BEGIN
  IF TG_OP='DELETE' THEN
    SELECT answer_id INTO answer FROM public.review_logs WHERE id=OLD.review_log_id;
    guess_delta := CASE WHEN OLD.reason_code='guess' THEN -1 ELSE 0 END;
    careless_delta := CASE WHEN OLD.reason_code='careless' THEN -1 ELSE 0 END;
  ELSIF TG_OP='INSERT' THEN
    SELECT answer_id INTO answer FROM public.review_logs WHERE id=NEW.review_log_id;
    guess_delta := CASE WHEN NEW.reason_code='guess' THEN 1 ELSE 0 END;
    careless_delta := CASE WHEN NEW.reason_code='careless' THEN 1 ELSE 0 END;
  ELSE
    SELECT answer_id INTO answer FROM public.review_logs WHERE id=NEW.review_log_id;
    guess_delta := (CASE WHEN NEW.reason_code='guess' THEN 1 ELSE 0 END)-(CASE WHEN OLD.reason_code='guess' THEN 1 ELSE 0 END);
    careless_delta := (CASE WHEN NEW.reason_code='careless' THEN 1 ELSE 0 END)-(CASE WHEN OLD.reason_code='careless' THEN 1 ELSE 0 END);
  END IF;
  UPDATE public.user_outcome_state state SET guess_annotations=state.guess_annotations+guess_delta,careless_annotations=state.careless_annotations+careless_delta,updated_at=clock_timestamp()
  FROM public.mastery_outcome_evidence evidence WHERE evidence.answer_id=answer AND evidence.user_id=state.user_id AND evidence.outcome_id=state.outcome_id;
  RETURN COALESCE(NEW,OLD);
END $fn$;
DROP TRIGGER IF EXISTS trg_review_error_annotation_mastery_delta ON public.review_error_annotations;
CREATE TRIGGER trg_review_error_annotation_mastery_delta AFTER INSERT OR UPDATE OF reason_code OR DELETE ON public.review_error_annotations
FOR EACH ROW EXECUTE FUNCTION public.trg_review_error_annotation_mastery_delta();

CREATE OR REPLACE FUNCTION public.backfill_verified_attempt_mastery(p_limit integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE a record; n integer:=0;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'limit must be 1..1000' USING ERRCODE='22023'; END IF;
  FOR a IN SELECT va.id FROM public.verified_attempts va LEFT JOIN public.mastery_materialized_attempts m ON m.attempt_id=va.id
    WHERE va.completed_at IS NOT NULL AND va.session_id IS NOT NULL AND m.attempt_id IS NULL ORDER BY va.completed_at,va.id LIMIT p_limit
  LOOP PERFORM public.materialize_verified_attempt_mastery(a.id); n:=n+1; END LOOP;
  RETURN jsonb_build_object('processed',n);
END $fn$;

REVOKE ALL ON FUNCTION public.materialize_verified_attempt_mastery(uuid),public.trg_materialize_verified_attempt_mastery(),public.trg_review_error_annotation_mastery_delta(),public.user_outcome_state_v2_attempt_bounds() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_verified_hint_event(uuid,uuid,uuid,smallint),public.backfill_verified_attempt_mastery(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_verified_hint_event(uuid,uuid,uuid,smallint),public.backfill_verified_attempt_mastery(integer) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
