-- Migration 098: private, server-authoritative adaptive diagnostic pilot.
-- Exact pilot scope: matematık + TYT + ba-tyt-math-v1.
--
-- Rollback after application readers are disabled:
--   DROP FUNCTION IF EXISTS public.record_adaptive_diagnostic_answer(uuid,uuid,uuid,boolean,integer,uuid,uuid);
--   DROP FUNCTION IF EXISTS public.start_adaptive_diagnostic(uuid,uuid,uuid);
--   DROP FUNCTION IF EXISTS public.resolve_adaptive_diagnostic_question(uuid);
--   DROP FUNCTION IF EXISTS public.adaptive_diagnostic_answers_append_only();
--   DROP TABLE IF EXISTS public.user_diagnostic_outcome_state;
--   DROP TABLE IF EXISTS public.adaptive_diagnostic_answers;
--   DROP TABLE IF EXISTS public.adaptive_diagnostic_sessions;

BEGIN;

CREATE TABLE IF NOT EXISTS public.adaptive_diagnostic_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game text NOT NULL CHECK (game = 'matematik'),
  exam_ref text NOT NULL CHECK (exam_ref = 'TYT'),
  taxonomy_version text NOT NULL CHECK (taxonomy_version = 'ba-tyt-math-v1'),
  kind text NOT NULL CHECK (kind IN ('initial','recheck')),
  status text NOT NULL CHECK (status IN ('active','completed','abandoned')),
  current_question_id uuid REFERENCES public.questions(id) ON DELETE RESTRICT,
  answered_count smallint NOT NULL DEFAULT 0 CHECK (answered_count BETWEEN 0 AND 10),
  covered_outcomes smallint NOT NULL DEFAULT 0 CHECK (
    covered_outcomes BETWEEN 0 AND 6
    AND covered_outcomes <= answered_count
  ),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL CHECK (expires_at > started_at),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT adaptive_diagnostic_session_state_check CHECK (
    (status = 'active' AND current_question_id IS NOT NULL AND completed_at IS NULL)
    OR (status = 'completed' AND current_question_id IS NULL AND completed_at IS NOT NULL AND covered_outcomes = 6)
    OR (status = 'abandoned' AND current_question_id IS NULL AND completed_at IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS adaptive_diagnostic_one_active_scope_idx
  ON public.adaptive_diagnostic_sessions(user_id,game,exam_ref,taxonomy_version)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS adaptive_diagnostic_user_recent_idx
  ON public.adaptive_diagnostic_sessions(user_id,game,exam_ref,created_at DESC);

CREATE TABLE IF NOT EXISTS public.adaptive_diagnostic_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.adaptive_diagnostic_sessions(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  outcome_id uuid NOT NULL REFERENCES public.curriculum_outcomes(id) ON DELETE RESTRICT,
  sequence smallint NOT NULL CHECK (sequence BETWEEN 1 AND 10),
  difficulty smallint NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  is_correct boolean NOT NULL,
  response_time_ms integer NOT NULL CHECK (response_time_ms BETWEEN 100 AND 600000),
  request_id uuid NOT NULL,
  next_question_id uuid REFERENCES public.questions(id) ON DELETE RESTRICT,
  covered_outcomes_after smallint NOT NULL CHECK (covered_outcomes_after BETWEEN 1 AND 6),
  status_after text NOT NULL CHECK (status_after IN ('active','completed','abandoned')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (session_id,sequence),
  UNIQUE (session_id,question_id),
  UNIQUE (session_id,request_id),
  CONSTRAINT adaptive_diagnostic_answer_next_state_check CHECK (
    (status_after = 'active' AND next_question_id IS NOT NULL)
    OR (status_after IN ('completed','abandoned') AND next_question_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS adaptive_diagnostic_answers_outcome_idx
  ON public.adaptive_diagnostic_answers(session_id,outcome_id,sequence);

CREATE TABLE IF NOT EXISTS public.user_diagnostic_outcome_state (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  outcome_id uuid NOT NULL REFERENCES public.curriculum_outcomes(id) ON DELETE RESTRICT,
  completed_session_id uuid NOT NULL REFERENCES public.adaptive_diagnostic_sessions(id) ON DELETE RESTRICT,
  attempts smallint NOT NULL CHECK (attempts BETWEEN 1 AND 2),
  correct_attempts smallint NOT NULL CHECK (correct_attempts BETWEEN 0 AND attempts),
  difficulty_weighted_earned numeric(8,3) NOT NULL CHECK (difficulty_weighted_earned >= 0),
  difficulty_weighted_possible numeric(8,3) NOT NULL CHECK (
    difficulty_weighted_possible > 0
    AND difficulty_weighted_earned <= difficulty_weighted_possible
  ),
  score numeric(5,2) NOT NULL CHECK (score BETWEEN 0 AND 100),
  recommended_difficulty smallint NOT NULL CHECK (recommended_difficulty BETWEEN 1 AND 5),
  last_diagnosed_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id,outcome_id)
);

ALTER TABLE public.adaptive_diagnostic_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_diagnostic_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_diagnostic_outcome_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.adaptive_diagnostic_sessions, public.adaptive_diagnostic_answers, public.user_diagnostic_outcome_state
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.adaptive_diagnostic_sessions, public.adaptive_diagnostic_answers, public.user_diagnostic_outcome_state
  TO service_role;

-- Returns exactly one active pilot outcome for a question or no row. Questions
-- with zero/multiple mappings or category/scope drift fail closed.
CREATE OR REPLACE FUNCTION public.resolve_adaptive_diagnostic_question(p_question_id uuid)
RETURNS TABLE(outcome_id uuid,difficulty smallint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_outcomes uuid[];
  v_difficulty smallint;
  v_category_matches boolean;
BEGIN
  IF p_question_id IS NULL THEN
    RETURN;
  END IF;

  SELECT array_agg(DISTINCT outcome.id), min(question.difficulty)::smallint,
    bool_and(outcome.category = question.category)
  INTO v_outcomes,v_difficulty,v_category_matches
  FROM public.questions question
  JOIN public.question_outcomes mapping ON mapping.question_id = question.id
  JOIN public.curriculum_outcomes outcome ON outcome.id = mapping.outcome_id
  JOIN public.curriculum_nodes node ON node.id = outcome.node_id
  WHERE question.id = p_question_id
    AND question.is_active = true
    AND question.game = 'matematik'
    AND question.exam_ref = 'TYT'
    AND outcome.is_active = true
    AND outcome.game = 'matematik'
    AND outcome.exam_ref = 'TYT'
    AND outcome.taxonomy_version = 'ba-tyt-math-v1'
    AND node.is_active = true
    AND node.node_type = 'outcome'
    AND node.taxonomy_version = 'ba-tyt-math-v1'
    AND node.game = 'matematik'
    AND node.exam_ref = 'TYT';

  IF cardinality(v_outcomes) = 1 AND v_category_matches THEN
    outcome_id := v_outcomes[1];
    difficulty := v_difficulty;
    RETURN NEXT;
  END IF;
END $fn$;

CREATE OR REPLACE FUNCTION public.adaptive_diagnostic_answers_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  RAISE EXCEPTION 'adaptive diagnostic answers are append-only'
    USING ERRCODE = '42501';
END $fn$;

DROP TRIGGER IF EXISTS trg_adaptive_diagnostic_answers_append_only ON public.adaptive_diagnostic_answers;
CREATE TRIGGER trg_adaptive_diagnostic_answers_append_only
  BEFORE UPDATE OR DELETE ON public.adaptive_diagnostic_answers
  FOR EACH ROW EXECUTE FUNCTION public.adaptive_diagnostic_answers_append_only();

CREATE OR REPLACE FUNCTION public.start_adaptive_diagnostic(
  p_user_id uuid,
  p_session_id uuid,
  p_first_question_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_existing public.adaptive_diagnostic_sessions%ROWTYPE;
  v_first record;
  v_kind text;
  v_outcome_count integer;
  v_covered_candidate_count integer;
  v_double_candidate_count integer;
  v_total_candidate_count integer;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR p_first_question_id IS NULL THEN
    RAISE EXCEPTION 'user, session and first question are required'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':adaptive-diagnostic:matematik:TYT', 0)
  );

  SELECT * INTO v_existing
  FROM public.adaptive_diagnostic_sessions
  WHERE user_id = p_user_id
    AND game = 'matematik'
    AND exam_ref = 'TYT'
    AND taxonomy_version = 'ba-tyt-math-v1'
    AND status = 'active'
  FOR UPDATE;

  IF FOUND AND v_existing.expires_at <= clock_timestamp() THEN
    UPDATE public.adaptive_diagnostic_sessions
    SET status = 'abandoned',current_question_id = NULL,updated_at = clock_timestamp()
    WHERE id = v_existing.id;
    v_existing.id := NULL;
  ELSIF FOUND THEN
    RETURN jsonb_build_object(
      'sessionId',v_existing.id,
      'currentQuestionId',v_existing.current_question_id,
      'kind',v_existing.kind,
      'answeredCount',v_existing.answered_count,
      'coveredOutcomes',v_existing.covered_outcomes,
      'expiresAt',v_existing.expires_at,
      'resumed',true
    );
  END IF;

  SELECT count(*) INTO v_outcome_count
  FROM public.curriculum_outcomes outcome
  JOIN public.curriculum_nodes node ON node.id = outcome.node_id
  WHERE outcome.is_active = true
    AND outcome.game = 'matematik'
    AND outcome.exam_ref = 'TYT'
    AND outcome.taxonomy_version = 'ba-tyt-math-v1'
    AND node.is_active = true
    AND node.node_type = 'outcome'
    AND node.taxonomy_version = 'ba-tyt-math-v1';

  WITH eligible_question AS (
    SELECT question.id,(array_agg(DISTINCT outcome.id))[1] AS outcome_id
    FROM public.questions question
    JOIN public.question_outcomes mapping ON mapping.question_id = question.id
    JOIN public.curriculum_outcomes outcome ON outcome.id = mapping.outcome_id
    JOIN public.curriculum_nodes node ON node.id = outcome.node_id
    WHERE question.is_active = true
      AND question.game = 'matematik'
      AND question.exam_ref = 'TYT'
      AND outcome.is_active = true
      AND outcome.game = 'matematik'
      AND outcome.exam_ref = 'TYT'
      AND outcome.taxonomy_version = 'ba-tyt-math-v1'
      AND node.is_active = true
      AND node.node_type = 'outcome'
      AND node.taxonomy_version = 'ba-tyt-math-v1'
    GROUP BY question.id,question.category
    HAVING count(DISTINCT outcome.id) = 1
      AND bool_and(outcome.category = question.category)
  ), coverage AS (
    SELECT outcome.id,count(DISTINCT question.id)::integer AS candidate_count
    FROM public.curriculum_outcomes outcome
    JOIN public.curriculum_nodes node ON node.id = outcome.node_id
    LEFT JOIN eligible_question question ON question.outcome_id = outcome.id
    WHERE outcome.is_active = true
      AND outcome.game = 'matematik'
      AND outcome.exam_ref = 'TYT'
      AND outcome.taxonomy_version = 'ba-tyt-math-v1'
      AND node.is_active = true
      AND node.node_type = 'outcome'
    GROUP BY outcome.id
  )
  SELECT count(*) FILTER (WHERE candidate_count >= 1),
         count(*) FILTER (WHERE candidate_count >= 2),
         sum(candidate_count)
  INTO v_covered_candidate_count,v_double_candidate_count,v_total_candidate_count
  FROM coverage;

  IF v_outcome_count <> 6 OR v_covered_candidate_count <> 6
    OR v_double_candidate_count < 4 OR v_total_candidate_count < 10 THEN
    RAISE EXCEPTION 'adaptive diagnostic requires six outcomes and ten pilot candidates'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_first
  FROM public.resolve_adaptive_diagnostic_question(p_first_question_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'first question is not an exact single-outcome pilot question'
      USING ERRCODE = '22023';
  END IF;

  v_kind := CASE WHEN EXISTS (
    SELECT 1 FROM public.adaptive_diagnostic_sessions previous
    WHERE previous.user_id = p_user_id
      AND previous.game = 'matematik'
      AND previous.exam_ref = 'TYT'
      AND previous.taxonomy_version = 'ba-tyt-math-v1'
      AND previous.status = 'completed'
  ) THEN 'recheck' ELSE 'initial' END;

  INSERT INTO public.adaptive_diagnostic_sessions(
    id,user_id,game,exam_ref,taxonomy_version,kind,status,current_question_id,
    answered_count,covered_outcomes,started_at,expires_at
  ) VALUES (
    p_session_id,p_user_id,'matematik','TYT','ba-tyt-math-v1',v_kind,'active',p_first_question_id,
    0,0,clock_timestamp(),clock_timestamp() + interval '30 minutes'
  ) RETURNING * INTO v_existing;

  RETURN jsonb_build_object(
    'sessionId',v_existing.id,
    'currentQuestionId',v_existing.current_question_id,
    'kind',v_existing.kind,
    'answeredCount',0,
    'coveredOutcomes',0,
    'expiresAt',v_existing.expires_at,
    'resumed',false
  );
END $fn$;

CREATE OR REPLACE FUNCTION public.record_adaptive_diagnostic_answer(
  p_user_id uuid,
  p_session_id uuid,
  p_question_id uuid,
  p_is_correct boolean,
  p_response_time_ms integer,
  p_request_id uuid,
  p_next_question_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_session public.adaptive_diagnostic_sessions%ROWTYPE;
  v_existing public.adaptive_diagnostic_answers%ROWTYPE;
  v_current record;
  v_next record;
  v_sequence smallint;
  v_covered smallint;
  v_next_outcome_attempts integer;
  v_has_uncovered boolean;
  v_status text;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR p_question_id IS NULL
    OR p_is_correct IS NULL OR p_response_time_ms IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'user, session, question, correctness, response time and request are required'
      USING ERRCODE = '22023';
  END IF;
  IF p_response_time_ms NOT BETWEEN 100 AND 600000 THEN
    RAISE EXCEPTION 'response time must be between 100 and 600000 ms'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_session
  FROM public.adaptive_diagnostic_sessions
  WHERE id = p_session_id
  FOR UPDATE;
  IF NOT FOUND OR v_session.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'diagnostic session owner mismatch'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_existing
  FROM public.adaptive_diagnostic_answers answer
  WHERE answer.session_id = p_session_id
    AND (answer.request_id = p_request_id OR answer.question_id = p_question_id)
  ORDER BY CASE WHEN answer.request_id = p_request_id THEN 0 ELSE 1 END
  LIMIT 1;
  IF FOUND THEN
    IF v_existing.request_id = p_request_id
      AND v_existing.question_id IS DISTINCT FROM p_question_id THEN
      RAISE EXCEPTION 'request id is already bound to another question'
        USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'alreadyProcessed',true,
      'status',v_existing.status_after,
      'nextQuestionId',v_existing.next_question_id,
      'answeredCount',v_existing.sequence,
      'coveredOutcomes',v_existing.covered_outcomes_after
    );
  END IF;

  IF v_session.status <> 'active' THEN
    RAISE EXCEPTION 'diagnostic session is not active'
      USING ERRCODE = '22023';
  END IF;
  IF v_session.expires_at <= clock_timestamp() THEN
    UPDATE public.adaptive_diagnostic_sessions
    SET status = 'abandoned',current_question_id = NULL,updated_at = clock_timestamp()
    WHERE id = v_session.id;
    RETURN jsonb_build_object(
      'alreadyProcessed',false,
      'status','abandoned',
      'nextQuestionId',NULL,
      'answeredCount',v_session.answered_count,
      'coveredOutcomes',v_session.covered_outcomes
    );
  END IF;
  IF v_session.current_question_id IS DISTINCT FROM p_question_id THEN
    RAISE EXCEPTION 'question is not the current diagnostic question'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_current
  FROM public.resolve_adaptive_diagnostic_question(p_question_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'current question lost exact pilot eligibility'
      USING ERRCODE = '23514';
  END IF;

  IF (SELECT count(*) FROM public.adaptive_diagnostic_answers answer
      WHERE answer.session_id = p_session_id AND answer.outcome_id = v_current.outcome_id) >= 2 THEN
    RAISE EXCEPTION 'an outcome cannot be measured more than twice'
      USING ERRCODE = '23514';
  END IF;

  v_sequence := (v_session.answered_count + 1)::smallint;
  SELECT count(DISTINCT measured.outcome_id)::smallint INTO v_covered
  FROM (
    SELECT answer.outcome_id
    FROM public.adaptive_diagnostic_answers answer
    WHERE answer.session_id = p_session_id
    UNION ALL SELECT v_current.outcome_id
  ) measured;

  IF p_next_question_id IS NOT NULL THEN
    IF v_sequence >= 10 OR p_next_question_id = p_question_id OR EXISTS (
      SELECT 1 FROM public.adaptive_diagnostic_answers answer
      WHERE answer.session_id = p_session_id AND answer.question_id = p_next_question_id
    ) THEN
      RAISE EXCEPTION 'next question is not eligible for this session'
        USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_next
    FROM public.resolve_adaptive_diagnostic_question(p_next_question_id);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'next question is not an exact single-outcome pilot question'
        USING ERRCODE = '22023';
    END IF;

    SELECT count(*) + CASE WHEN v_next.outcome_id = v_current.outcome_id THEN 1 ELSE 0 END
    INTO v_next_outcome_attempts
    FROM public.adaptive_diagnostic_answers answer
    WHERE answer.session_id = p_session_id
      AND answer.outcome_id = v_next.outcome_id;
    IF v_next_outcome_attempts >= 2 THEN
      RAISE EXCEPTION 'next outcome already reached the two-question bound'
        USING ERRCODE = '23514';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.curriculum_outcomes outcome
      JOIN public.curriculum_nodes node ON node.id = outcome.node_id
      WHERE outcome.is_active = true
        AND outcome.game = 'matematik'
        AND outcome.exam_ref = 'TYT'
        AND outcome.taxonomy_version = 'ba-tyt-math-v1'
        AND node.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM public.adaptive_diagnostic_answers answer
          WHERE answer.session_id = p_session_id AND answer.outcome_id = outcome.id
        )
        AND outcome.id <> v_current.outcome_id
    ) INTO v_has_uncovered;
    IF v_has_uncovered AND EXISTS (
      SELECT 1 FROM public.adaptive_diagnostic_answers answer
      WHERE answer.session_id = p_session_id AND answer.outcome_id = v_next.outcome_id
      UNION ALL SELECT 1 WHERE v_next.outcome_id = v_current.outcome_id
    ) THEN
      RAISE EXCEPTION 'all pilot outcomes must be covered before confirmation questions'
        USING ERRCODE = '23514';
    END IF;
    v_status := 'active';
  ELSE
    v_status := CASE WHEN v_covered = 6 AND v_sequence = 10 THEN 'completed' ELSE 'abandoned' END;
  END IF;

  INSERT INTO public.adaptive_diagnostic_answers(
    session_id,user_id,question_id,outcome_id,sequence,difficulty,is_correct,
    response_time_ms,request_id,next_question_id,covered_outcomes_after,status_after
  ) VALUES (
    p_session_id,p_user_id,p_question_id,v_current.outcome_id,v_sequence,v_current.difficulty,p_is_correct,
    p_response_time_ms,p_request_id,p_next_question_id,v_covered,v_status
  );

  UPDATE public.adaptive_diagnostic_sessions
  SET current_question_id = p_next_question_id,
      answered_count = v_sequence,
      covered_outcomes = v_covered,
      status = v_status,
      completed_at = CASE WHEN v_status = 'completed' THEN clock_timestamp() ELSE NULL END,
      updated_at = clock_timestamp()
  WHERE id = p_session_id;

  IF v_status = 'completed' THEN
    WITH aggregate_result AS (
      SELECT answer.outcome_id,
        count(*)::smallint AS attempts,
        count(*) FILTER (WHERE answer.is_correct)::smallint AS correct_attempts,
        sum(CASE WHEN answer.is_correct THEN answer.difficulty ELSE 0 END)::numeric(8,3) AS earned,
        sum(answer.difficulty)::numeric(8,3) AS possible
      FROM public.adaptive_diagnostic_answers answer
      WHERE answer.session_id = p_session_id
      GROUP BY answer.outcome_id
    ), latest AS (
      SELECT DISTINCT ON (answer.outcome_id)
        answer.outcome_id,answer.difficulty,answer.is_correct
      FROM public.adaptive_diagnostic_answers answer
      WHERE answer.session_id = p_session_id
      ORDER BY answer.outcome_id,answer.sequence DESC
    )
    INSERT INTO public.user_diagnostic_outcome_state(
      user_id,outcome_id,completed_session_id,attempts,correct_attempts,
      difficulty_weighted_earned,difficulty_weighted_possible,score,
      recommended_difficulty,last_diagnosed_at,updated_at
    )
    SELECT p_user_id,aggregate_result.outcome_id,p_session_id,aggregate_result.attempts,
      aggregate_result.correct_attempts,aggregate_result.earned,aggregate_result.possible,
      round(100 * aggregate_result.earned / aggregate_result.possible,2),
      least(5,greatest(1,latest.difficulty + CASE WHEN latest.is_correct THEN 1 ELSE -1 END))::smallint,
      clock_timestamp(),clock_timestamp()
    FROM aggregate_result
    JOIN latest ON latest.outcome_id = aggregate_result.outcome_id
    ON CONFLICT (user_id,outcome_id) DO UPDATE SET
      completed_session_id = EXCLUDED.completed_session_id,
      attempts = EXCLUDED.attempts,
      correct_attempts = EXCLUDED.correct_attempts,
      difficulty_weighted_earned = EXCLUDED.difficulty_weighted_earned,
      difficulty_weighted_possible = EXCLUDED.difficulty_weighted_possible,
      score = EXCLUDED.score,
      recommended_difficulty = EXCLUDED.recommended_difficulty,
      last_diagnosed_at = EXCLUDED.last_diagnosed_at,
      updated_at = clock_timestamp();
  END IF;

  RETURN jsonb_build_object(
    'alreadyProcessed',false,
    'status',v_status,
    'nextQuestionId',p_next_question_id,
    'answeredCount',v_sequence,
    'coveredOutcomes',v_covered
  );
END $fn$;

REVOKE ALL ON FUNCTION public.resolve_adaptive_diagnostic_question(uuid),
  public.adaptive_diagnostic_answers_append_only()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.start_adaptive_diagnostic(uuid,uuid,uuid),
  public.record_adaptive_diagnostic_answer(uuid,uuid,uuid,boolean,integer,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_adaptive_diagnostic(uuid,uuid,uuid),
  public.record_adaptive_diagnostic_answer(uuid,uuid,uuid,boolean,integer,uuid,uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
