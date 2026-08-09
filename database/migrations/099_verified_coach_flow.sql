-- Migration 099: server-authoritative verified coach flow.
--
-- The coach flow is deliberately separate from the UI token flow: only a
-- service-role RPC can create/advance a session or grade its transfer answer.
-- Raw coach records are private. Stage-4 stores no solution text; the answer
-- RPC reads and returns the bounded, server-owned solution only after the
-- transfer question has been selected and answered.
--
-- Rollback (after application readers have been disabled):
--   DROP TRIGGER IF EXISTS trg_verified_coach_stage_events_append_only ON public.verified_coach_stage_events;
--   DROP TRIGGER IF EXISTS trg_verified_coach_sessions_guard ON public.verified_coach_sessions;
--   DROP FUNCTION IF EXISTS public.answer_verified_coach_transfer(uuid,uuid,uuid,smallint);
--   DROP FUNCTION IF EXISTS public.advance_verified_coach_stage(uuid,uuid,smallint,uuid,text,text,boolean,text,text);
--   DROP FUNCTION IF EXISTS public.start_verified_coach_session(uuid,uuid,uuid,smallint);
--   DROP FUNCTION IF EXISTS public.verified_coach_stage_events_append_only();
--   DROP FUNCTION IF EXISTS public.verified_coach_sessions_guard();
--   DROP FUNCTION IF EXISTS public.verified_coach_correct_option(jsonb);
--   DROP FUNCTION IF EXISTS public.verified_coach_option_count(jsonb);
--   DROP TABLE IF EXISTS public.verified_coach_stage_events;
--   DROP TABLE IF EXISTS public.verified_coach_sessions;

BEGIN;

CREATE TABLE IF NOT EXISTS public.verified_coach_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.verified_attempts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  initial_selected_option smallint NOT NULL CHECK (initial_selected_option >= 0),
  stage smallint NOT NULL DEFAULT 0 CHECK (stage BETWEEN 0 AND 4),
  expires_at timestamptz NOT NULL,
  transfer_question_id uuid REFERENCES public.questions(id) ON DELETE RESTRICT,
  transfer_request_id uuid,
  transfer_selected_option smallint CHECK (transfer_selected_option IS NULL OR transfer_selected_option >= 0),
  transfer_is_correct boolean,
  transfer_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (attempt_id,question_id),
  CONSTRAINT verified_coach_session_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT verified_coach_transfer_state_check CHECK (
    (stage < 4 AND transfer_question_id IS NULL AND transfer_request_id IS NULL
      AND transfer_selected_option IS NULL AND transfer_is_correct IS NULL AND transfer_completed_at IS NULL)
    OR
    (stage = 4 AND transfer_question_id IS NOT NULL AND (
      (transfer_request_id IS NULL AND transfer_selected_option IS NULL
        AND transfer_is_correct IS NULL AND transfer_completed_at IS NULL)
      OR
      (transfer_request_id IS NOT NULL AND transfer_selected_option IS NOT NULL
        AND transfer_is_correct IS NOT NULL AND transfer_completed_at IS NOT NULL)
    ))
  )
);
CREATE INDEX IF NOT EXISTS verified_coach_sessions_user_expiry_idx
  ON public.verified_coach_sessions(user_id,expires_at);

CREATE TABLE IF NOT EXISTS public.verified_coach_stage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.verified_coach_sessions(id) ON DELETE CASCADE,
  stage smallint NOT NULL CHECK (stage BETWEEN 1 AND 4),
  request_id uuid NOT NULL,
  response_text text,
  source text NOT NULL CHECK (source IN ('authored','ai','fallback','solution')),
  evaluation_passed boolean NOT NULL,
  policy_version text NOT NULL CHECK (char_length(trim(policy_version)) BETWEEN 1 AND 80),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (session_id,stage),
  UNIQUE (session_id,request_id),
  CONSTRAINT verified_coach_stage_event_payload_check CHECK (
    (stage BETWEEN 1 AND 3 AND source IN ('authored','ai','fallback')
      AND response_text IS NOT NULL AND char_length(trim(response_text)) BETWEEN 1 AND 1000)
    OR (stage = 4 AND source = 'solution' AND response_text IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS verified_coach_stage_events_session_created_idx
  ON public.verified_coach_stage_events(session_id,created_at);

ALTER TABLE public.verified_coach_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verified_coach_stage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.verified_coach_sessions, public.verified_coach_stage_events
  FROM PUBLIC, anon, authenticated, service_role;

-- Returns a bounded standard-MCQ option count, or NULL for unsupported JSON.
CREATE OR REPLACE FUNCTION public.verified_coach_option_count(p_content jsonb)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $fn$
  SELECT CASE WHEN jsonb_typeof(p_content) = 'object'
    AND jsonb_typeof(p_content->'options') = 'array'
    AND jsonb_array_length(p_content->'options') BETWEEN 2 AND 20
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_content->'options') AS option_rows(option_value)
      WHERE jsonb_typeof(option_value) <> 'string'
        OR char_length(trim(option_value #>> '{}')) NOT BETWEEN 1 AND 500
    )
  THEN jsonb_array_length(p_content->'options')::smallint END
$fn$;

-- A transfer can only be graded when its persisted question has a canonical,
-- in-range numeric answer. This helper never returns that value to a caller.
CREATE OR REPLACE FUNCTION public.verified_coach_correct_option(p_content jsonb)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $fn$
  WITH option_count AS (
    SELECT public.verified_coach_option_count(p_content) AS value
  )
  SELECT CASE WHEN option_count.value IS NOT NULL
    AND jsonb_typeof(p_content->'answer') = 'number'
    AND (p_content->>'answer') ~ '^(0|[1-9][0-9]*)$'
    AND char_length(p_content->>'answer') <= 2
    AND (p_content->>'answer')::integer < option_count.value
  THEN (p_content->>'answer')::smallint END
  FROM option_count
$fn$;

CREATE OR REPLACE FUNCTION public.verified_coach_stage_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  RAISE EXCEPTION 'verified coach stage events are append-only' USING ERRCODE='42501';
END $fn$;

DROP TRIGGER IF EXISTS trg_verified_coach_stage_events_append_only ON public.verified_coach_stage_events;
CREATE TRIGGER trg_verified_coach_stage_events_append_only
  BEFORE UPDATE OR DELETE ON public.verified_coach_stage_events
  FOR EACH ROW EXECUTE FUNCTION public.verified_coach_stage_events_append_only();

-- The RPCs are the only mutators. This guard makes accidental privileged writes
-- fail closed too: identity/initial answer never change, a stage only advances
-- once, and the transfer answer can be bound exactly once at stage four.
CREATE OR REPLACE FUNCTION public.verified_coach_sessions_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.attempt_id IS DISTINCT FROM OLD.attempt_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.question_id IS DISTINCT FROM OLD.question_id
    OR NEW.initial_selected_option IS DISTINCT FROM OLD.initial_selected_option
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'verified coach session identity is immutable' USING ERRCODE='42501';
  END IF;

  IF NEW.stage = OLD.stage + 1 THEN
    IF NEW.stage < 4 AND (NEW.transfer_question_id IS NOT NULL OR NEW.transfer_request_id IS NOT NULL
      OR NEW.transfer_selected_option IS NOT NULL OR NEW.transfer_is_correct IS NOT NULL OR NEW.transfer_completed_at IS NOT NULL) THEN
      RAISE EXCEPTION 'transfer cannot exist before stage four' USING ERRCODE='42501';
    END IF;
    IF NEW.stage = 4 AND (NEW.transfer_question_id IS NULL OR NEW.transfer_request_id IS NOT NULL
      OR NEW.transfer_selected_option IS NOT NULL OR NEW.transfer_is_correct IS NOT NULL OR NEW.transfer_completed_at IS NOT NULL) THEN
      RAISE EXCEPTION 'stage four must bind only a transfer question' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.stage = 4 AND NEW.stage = 4
    AND OLD.transfer_question_id IS NOT NULL
    AND OLD.transfer_request_id IS NULL
    AND OLD.transfer_selected_option IS NULL
    AND OLD.transfer_is_correct IS NULL
    AND OLD.transfer_completed_at IS NULL
    AND NEW.transfer_question_id IS NOT DISTINCT FROM OLD.transfer_question_id
    AND NEW.transfer_request_id IS NOT NULL
    AND NEW.transfer_selected_option IS NOT NULL
    AND NEW.transfer_is_correct IS NOT NULL
    AND NEW.transfer_completed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'invalid verified coach session transition' USING ERRCODE='42501';
END $fn$;

DROP TRIGGER IF EXISTS trg_verified_coach_sessions_guard ON public.verified_coach_sessions;
CREATE TRIGGER trg_verified_coach_sessions_guard
  BEFORE UPDATE ON public.verified_coach_sessions
  FOR EACH ROW EXECUTE FUNCTION public.verified_coach_sessions_guard();

CREATE OR REPLACE FUNCTION public.start_verified_coach_session(
  p_attempt_id uuid,
  p_user_id uuid,
  p_question_id uuid,
  p_selected_option smallint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_attempt public.verified_attempts%ROWTYPE;
  v_question record;
  v_existing public.verified_coach_sessions%ROWTYPE;
  v_primary_count integer;
BEGIN
  IF p_attempt_id IS NULL OR p_user_id IS NULL OR p_question_id IS NULL OR p_selected_option IS NULL THEN
    RAISE EXCEPTION 'attempt, user, question and selected option are required' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_attempt FROM public.verified_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF NOT FOUND OR v_attempt.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'attempt owner mismatch' USING ERRCODE='42501';
  END IF;
  IF v_attempt.completed_at IS NOT NULL OR v_attempt.expires_at <= clock_timestamp()
    OR NOT (p_question_id = ANY(v_attempt.question_ids)) THEN
    RAISE EXCEPTION 'attempt is not eligible for coach flow' USING ERRCODE='22023';
  END IF;

  SELECT question.id,question.content,public.verified_coach_option_count(question.content) AS option_count
  INTO v_question
  FROM public.questions question
  WHERE question.id=p_question_id AND question.is_active=true AND question.game=v_attempt.game;
  IF NOT FOUND OR v_question.option_count IS NULL OR p_selected_option < 0 OR p_selected_option >= v_question.option_count THEN
    RAISE EXCEPTION 'question is not a supported multiple-choice question or selected option is out of range' USING ERRCODE='22023';
  END IF;
  SELECT count(*) INTO v_primary_count
  FROM public.question_outcomes mapping
  JOIN public.curriculum_outcomes outcome ON outcome.id=mapping.outcome_id
  WHERE mapping.question_id=p_question_id AND mapping.is_primary=true AND outcome.is_active=true;
  IF v_primary_count <> 1
    OR jsonb_typeof(v_question.content->'solution') <> 'string'
    OR char_length(trim(v_question.content->>'solution')) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'source question requires exactly one active primary outcome and approved solution' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.verified_coach_sessions
  WHERE attempt_id=p_attempt_id AND question_id=p_question_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.initial_selected_option IS DISTINCT FROM p_selected_option THEN
      RAISE EXCEPTION 'initial selected option is immutable' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object(
      'sessionId',v_existing.id,'stage',v_existing.stage,'expiresAt',v_existing.expires_at,
      'transferQuestionId',v_existing.transfer_question_id,'transferCompleted',v_existing.transfer_completed_at IS NOT NULL,
      'replayed',true
    );
  END IF;

  INSERT INTO public.verified_coach_sessions(
    attempt_id,user_id,question_id,initial_selected_option,stage,expires_at
  ) VALUES (p_attempt_id,p_user_id,p_question_id,p_selected_option,0,v_attempt.expires_at)
  RETURNING * INTO v_existing;

  RETURN jsonb_build_object(
    'sessionId',v_existing.id,'stage',0,'expiresAt',v_existing.expires_at,
    'transferQuestionId',NULL,'transferCompleted',false,'replayed',false
  );
END $fn$;

CREATE OR REPLACE FUNCTION public.advance_verified_coach_stage(
  p_session_id uuid,
  p_user_id uuid,
  p_stage smallint,
  p_request_id uuid,
  p_response_text text,
  p_source text,
  p_evaluation_passed boolean,
  p_policy_version text,
  p_content_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_session public.verified_coach_sessions%ROWTYPE;
  v_event public.verified_coach_stage_events%ROWTYPE;
  v_source_question record;
  v_outcome_id uuid;
  v_transfer_question_id uuid;
  v_policy_version text;
  v_primary_count integer;
BEGIN
  IF p_session_id IS NULL OR p_user_id IS NULL OR p_stage IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'session, user, stage and request are required' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_session FROM public.verified_coach_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'coach session owner mismatch' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_event FROM public.verified_coach_stage_events
  WHERE session_id=p_session_id AND request_id=p_request_id;
  IF FOUND THEN
    IF v_event.stage IS DISTINCT FROM p_stage THEN RAISE EXCEPTION 'request id is bound to another stage' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object(
      'stage',v_event.stage,'responseText',v_event.response_text,'source',v_event.source,
      'evaluationPassed',v_event.evaluation_passed,'policyVersion',v_event.policy_version,
      'contentSha256',v_event.content_sha256,'transferQuestionId',v_session.transfer_question_id,'replayed',true
    );
  END IF;
  IF p_source IS NULL OR p_evaluation_passed IS NULL OR p_policy_version IS NULL OR p_content_sha256 IS NULL THEN
    RAISE EXCEPTION 'required coach stage payload is missing' USING ERRCODE='22023';
  END IF;
  v_policy_version := trim(p_policy_version);
  IF p_stage NOT BETWEEN 1 AND 4
    OR char_length(v_policy_version) NOT BETWEEN 1 AND 80
    OR p_content_sha256 !~ '^[0-9a-f]{64}$'
    OR (p_stage BETWEEN 1 AND 3 AND (p_source NOT IN ('authored','ai','fallback')
      OR p_response_text IS NULL OR char_length(trim(p_response_text)) NOT BETWEEN 1 AND 1000))
    OR (p_stage = 4 AND (p_response_text IS NOT NULL OR p_source <> 'solution')) THEN
    RAISE EXCEPTION 'invalid coach stage payload' USING ERRCODE='22023';
  END IF;
  IF v_session.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'coach session expired' USING ERRCODE='22023';
  END IF;
  IF p_stage <> v_session.stage + 1 THEN
    RAISE EXCEPTION 'coach stages must advance in order' USING ERRCODE='22023';
  END IF;

  IF p_stage = 4 THEN
    SELECT question.game::text AS game,question.exam_ref::text AS exam_ref
    INTO v_source_question
    FROM public.questions question
    WHERE question.id=v_session.question_id AND question.is_active=true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'source question is no longer active' USING ERRCODE='22023';
    END IF;
    SELECT count(*) INTO v_primary_count
    FROM public.question_outcomes mapping
    JOIN public.curriculum_outcomes outcome ON outcome.id=mapping.outcome_id
    WHERE mapping.question_id=v_session.question_id AND mapping.is_primary=true AND outcome.is_active=true;
    IF v_primary_count <> 1 THEN
      RAISE EXCEPTION 'source question requires exactly one active primary outcome' USING ERRCODE='22023';
    END IF;
    SELECT mapping.outcome_id INTO v_outcome_id
    FROM public.question_outcomes mapping
    JOIN public.curriculum_outcomes outcome ON outcome.id=mapping.outcome_id
    WHERE mapping.question_id=v_session.question_id AND mapping.is_primary=true AND outcome.is_active=true;
    SELECT candidate.id INTO v_transfer_question_id
    FROM public.questions candidate
    JOIN public.question_outcomes mapping ON mapping.question_id=candidate.id
      AND mapping.outcome_id=v_outcome_id AND mapping.is_primary=true
    WHERE candidate.is_active=true
      AND candidate.id <> v_session.question_id
      AND candidate.game::text = v_source_question.game
      AND candidate.exam_ref IS NOT DISTINCT FROM v_source_question.exam_ref
      AND public.verified_coach_correct_option(candidate.content) IS NOT NULL
      AND jsonb_typeof(candidate.content->'solution')='string'
      AND char_length(trim(candidate.content->>'solution')) BETWEEN 1 AND 2000
      AND 1 = (
        SELECT count(*)
        FROM public.question_outcomes candidate_primary
        JOIN public.curriculum_outcomes candidate_outcome ON candidate_outcome.id=candidate_primary.outcome_id
        WHERE candidate_primary.question_id=candidate.id
          AND candidate_primary.is_primary=true AND candidate_outcome.is_active=true
      )
    ORDER BY candidate.id
    LIMIT 1;
    IF v_transfer_question_id IS NULL THEN
      RAISE EXCEPTION 'no eligible deterministic transfer question exists' USING ERRCODE='23514';
    END IF;
  END IF;

  INSERT INTO public.verified_coach_stage_events(
    session_id,stage,request_id,response_text,source,evaluation_passed,policy_version,content_sha256
  ) VALUES (
    p_session_id,p_stage,p_request_id,p_response_text,p_source,p_evaluation_passed,v_policy_version,p_content_sha256
  );

  UPDATE public.verified_coach_sessions
  SET stage=p_stage,transfer_question_id=CASE WHEN p_stage=4 THEN v_transfer_question_id ELSE NULL END,
      updated_at=clock_timestamp()
  WHERE id=p_session_id;

  RETURN jsonb_build_object(
    'stage',p_stage,'responseText',p_response_text,'source',p_source,
    'evaluationPassed',p_evaluation_passed,'policyVersion',v_policy_version,
    'contentSha256',p_content_sha256,'transferQuestionId',v_transfer_question_id,'replayed',false
  );
END $fn$;

CREATE OR REPLACE FUNCTION public.answer_verified_coach_transfer(
  p_session_id uuid,
  p_user_id uuid,
  p_request_id uuid,
  p_selected_option smallint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_session public.verified_coach_sessions%ROWTYPE;
  v_question record;
BEGIN
  IF p_session_id IS NULL OR p_user_id IS NULL OR p_request_id IS NULL OR p_selected_option IS NULL THEN
    RAISE EXCEPTION 'session, user, request and selected option are required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_session FROM public.verified_coach_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'coach session owner mismatch' USING ERRCODE='42501';
  END IF;
  IF v_session.transfer_completed_at IS NOT NULL THEN
    IF v_session.transfer_request_id IS DISTINCT FROM p_request_id THEN
      RAISE EXCEPTION 'transfer answer was already bound to another request' USING ERRCODE='22023';
    END IF;
    SELECT public.verified_coach_correct_option(question.content) AS correct_option,
      public.verified_coach_option_count(question.content) AS option_count,
      CASE WHEN jsonb_typeof(question.content->'solution')='string'
        THEN left(trim(question.content->>'solution'),2000) END AS solution
    INTO v_question FROM public.questions question WHERE question.id=v_session.transfer_question_id;
    RETURN jsonb_build_object('isCorrect',v_session.transfer_is_correct,'correctOption',v_question.correct_option,
      'solution',v_question.solution,'coachDepth',4,'transferQuestionId',v_session.transfer_question_id,'replayed',true);
  END IF;
  IF v_session.expires_at <= clock_timestamp() OR v_session.stage <> 4 OR v_session.transfer_question_id IS NULL THEN
    RAISE EXCEPTION 'coach transfer is not eligible' USING ERRCODE='22023';
  END IF;

  SELECT public.verified_coach_correct_option(question.content) AS correct_option,
    public.verified_coach_option_count(question.content) AS option_count,
    CASE WHEN jsonb_typeof(question.content->'solution')='string'
      THEN left(trim(question.content->>'solution'),2000) END AS solution
  INTO v_question
  FROM public.questions question
  WHERE question.id=v_session.transfer_question_id AND question.is_active=true;
  IF NOT FOUND OR v_question.correct_option IS NULL OR p_selected_option < 0 OR p_selected_option >= v_question.option_count THEN
    RAISE EXCEPTION 'transfer question is not a supported multiple-choice question or selected option is out of range' USING ERRCODE='22023';
  END IF;

  UPDATE public.verified_coach_sessions
  SET transfer_request_id=p_request_id,transfer_selected_option=p_selected_option,
      transfer_is_correct=(p_selected_option=v_question.correct_option),transfer_completed_at=clock_timestamp(),updated_at=clock_timestamp()
  WHERE id=p_session_id;

  RETURN jsonb_build_object('isCorrect',p_selected_option=v_question.correct_option,'correctOption',v_question.correct_option,
    'solution',v_question.solution,'coachDepth',4,'transferQuestionId',v_session.transfer_question_id,'replayed',false);
END $fn$;

REVOKE ALL ON FUNCTION public.verified_coach_option_count(jsonb),public.verified_coach_correct_option(jsonb),
  public.verified_coach_stage_events_append_only(),public.verified_coach_sessions_guard()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.start_verified_coach_session(uuid,uuid,uuid,smallint),
  public.advance_verified_coach_stage(uuid,uuid,smallint,uuid,text,text,boolean,text,text),
  public.answer_verified_coach_transfer(uuid,uuid,uuid,smallint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_verified_coach_session(uuid,uuid,uuid,smallint),
  public.advance_verified_coach_stage(uuid,uuid,smallint,uuid,text,text,boolean,text,text),
  public.answer_verified_coach_transfer(uuid,uuid,uuid,smallint)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
