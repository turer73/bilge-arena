-- Migration 140: revision-bound adaptive diagnostic evidence.
--
-- Diagnostic observations remain a separate, adaptively selected population;
-- this migration makes them auditable without mixing them into classical
-- verified-session psychometrics.
BEGIN;

ALTER TABLE public.adaptive_diagnostic_sessions
  ADD COLUMN IF NOT EXISTS current_question_revision_id uuid REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS current_question_content_sha256 text,
  ADD COLUMN IF NOT EXISTS current_question_correct_option smallint,
  ADD COLUMN IF NOT EXISTS current_question_option_count smallint,
  ADD COLUMN IF NOT EXISTS current_question_base_points smallint,
  ADD COLUMN IF NOT EXISTS current_question_outcome_id uuid REFERENCES public.curriculum_outcomes(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS current_question_difficulty smallint,
  ADD COLUMN IF NOT EXISTS current_question_issued_at timestamptz;

ALTER TABLE public.adaptive_diagnostic_answers
  ADD COLUMN IF NOT EXISTS selected_option smallint,
  ADD COLUMN IF NOT EXISTS question_revision_id uuid REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS question_content_sha256 text,
  ADD COLUMN IF NOT EXISTS server_response_time_ms integer,
  ADD COLUMN IF NOT EXISTS response_time_source text,
  ADD COLUMN IF NOT EXISTS evidence_kind text;

UPDATE public.adaptive_diagnostic_answers
SET evidence_kind='legacy_unbound',response_time_source='client_reported'
WHERE evidence_kind IS NULL OR response_time_source IS NULL;

ALTER TABLE public.adaptive_diagnostic_answers
  ALTER COLUMN evidence_kind SET DEFAULT 'legacy_unbound',
  ALTER COLUMN evidence_kind SET NOT NULL,
  ALTER COLUMN response_time_source SET DEFAULT 'client_reported',
  ALTER COLUMN response_time_source SET NOT NULL;

DO $body$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.adaptive_diagnostic_answers'::regclass
      AND conname='adaptive_diagnostic_answer_evidence_v2_check'
  ) THEN
    ALTER TABLE public.adaptive_diagnostic_answers
      ADD CONSTRAINT adaptive_diagnostic_answer_evidence_v2_check CHECK (
        selected_option IS NULL OR selected_option BETWEEN 0 AND 9
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.adaptive_diagnostic_answers'::regclass
      AND conname='adaptive_diagnostic_answer_evidence_kind_check'
  ) THEN
    ALTER TABLE public.adaptive_diagnostic_answers
      ADD CONSTRAINT adaptive_diagnostic_answer_evidence_kind_check CHECK (
        evidence_kind IN ('legacy_unbound','revision_snapshot')
        AND response_time_source IN ('client_reported','client_reported_with_server_elapsed')
        AND (server_response_time_ms IS NULL OR server_response_time_ms>=0)
        AND (
          evidence_kind='legacy_unbound'
          OR (
            selected_option IS NOT NULL
            AND question_revision_id IS NOT NULL
            AND question_content_sha256 IS NOT NULL
            AND server_response_time_ms IS NOT NULL
            AND response_time_source='client_reported_with_server_elapsed'
          )
        )
      ) NOT VALID;
  END IF;
  ALTER TABLE public.adaptive_diagnostic_answers
    VALIDATE CONSTRAINT adaptive_diagnostic_answer_evidence_v2_check;
  ALTER TABLE public.adaptive_diagnostic_answers
    VALIDATE CONSTRAINT adaptive_diagnostic_answer_evidence_kind_check;
END
$body$;

CREATE INDEX IF NOT EXISTS adaptive_diagnostic_answers_revision_idx
  ON public.adaptive_diagnostic_answers(question_revision_id,created_at)
  WHERE question_revision_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_adaptive_diagnostic_question_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_revision public.question_content_revisions%ROWTYPE;
  v_outcome_id uuid;
  v_difficulty smallint;
  v_base_points smallint;
  v_refresh boolean;
BEGIN
  IF NEW.current_question_id IS NULL THEN
    NEW.current_question_revision_id:=NULL;
    NEW.current_question_content_sha256:=NULL;
    NEW.current_question_correct_option:=NULL;
    NEW.current_question_option_count:=NULL;
    NEW.current_question_base_points:=NULL;
    NEW.current_question_outcome_id:=NULL;
    NEW.current_question_difficulty:=NULL;
    NEW.current_question_issued_at:=NULL;
    RETURN NEW;
  END IF;

  v_refresh:=TG_OP='INSERT';
  IF TG_OP<>'INSERT' THEN
    v_refresh:=NEW.current_question_id IS DISTINCT FROM OLD.current_question_id
      OR NEW.current_question_revision_id IS NULL;
  END IF;
  IF v_refresh THEN
    SELECT revision.*
    INTO v_revision
    FROM public.questions question
    JOIN public.question_content_revisions revision
      ON revision.id=question.published_revision_id
      AND revision.question_id=question.id
      AND revision.status='published'
    WHERE question.id=NEW.current_question_id;
    IF NOT FOUND
      OR jsonb_typeof(v_revision.content->'options') IS DISTINCT FROM 'array'
      OR jsonb_array_length(v_revision.content->'options') NOT BETWEEN 2 AND 10
      OR (v_revision.content->>'answer') IS NULL
      OR (v_revision.content->>'answer')::integer NOT BETWEEN 0 AND jsonb_array_length(v_revision.content->'options')-1 THEN
      RAISE EXCEPTION 'diagnostic question requires a valid published revision snapshot'
        USING ERRCODE='23514';
    END IF;
    SELECT COALESCE(question.base_points,v_revision.difficulty*10)::smallint
    INTO v_base_points
    FROM public.questions question
    WHERE question.id=NEW.current_question_id;
    SELECT resolved.outcome_id,resolved.difficulty
    INTO v_outcome_id,v_difficulty
    FROM public.resolve_adaptive_diagnostic_question(NEW.current_question_id) resolved;
    IF NOT FOUND OR v_difficulty IS DISTINCT FROM v_revision.difficulty THEN
      RAISE EXCEPTION 'diagnostic question requires exact pilot outcome and difficulty evidence'
        USING ERRCODE='23514';
    END IF;
    NEW.current_question_revision_id:=v_revision.id;
    NEW.current_question_content_sha256:=v_revision.content_sha256;
    NEW.current_question_correct_option:=(v_revision.content->>'answer')::smallint;
    NEW.current_question_option_count:=jsonb_array_length(v_revision.content->'options')::smallint;
    NEW.current_question_base_points:=v_base_points;
    NEW.current_question_outcome_id:=v_outcome_id;
    NEW.current_question_difficulty:=v_difficulty;
    NEW.current_question_issued_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_adaptive_diagnostic_question_snapshot ON public.adaptive_diagnostic_sessions;
CREATE TRIGGER trg_adaptive_diagnostic_question_snapshot
  BEFORE INSERT OR UPDATE OF current_question_id ON public.adaptive_diagnostic_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_adaptive_diagnostic_question_snapshot();

-- Do not manufacture a snapshot for an already-issued question: the revision
-- actually shown cannot be reconstructed. Active pre-v2 sessions restart.
UPDATE public.adaptive_diagnostic_sessions
SET status='abandoned',current_question_id=NULL,updated_at=clock_timestamp()
WHERE status='active'
  AND current_question_id IS NOT NULL
  AND current_question_revision_id IS NULL;

CREATE OR REPLACE FUNCTION public.get_adaptive_diagnostic_question_v2(
  p_user_id uuid,
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id',session.current_question_id,
    'game',revision.game,
    'category',revision.category,
    'subcategory',revision.subcategory,
    'topic',revision.topic,
    'difficulty',session.current_question_difficulty,
    'level_tag',revision.level_tag,
    'base_points',session.current_question_base_points,
    'content',jsonb_strip_nulls(jsonb_build_object(
      'question',revision.content->>'question',
      'options',revision.content->'options',
      'sentence',revision.content->'sentence',
      'passage',revision.content->'passage',
      'context',revision.content->'context',
      'type',revision.content->'type'
    ))
  ) INTO v_result
  FROM public.adaptive_diagnostic_sessions session
  JOIN public.question_content_revisions revision
    ON revision.id=session.current_question_revision_id
    AND revision.question_id=session.current_question_id
    AND revision.content_sha256=session.current_question_content_sha256
  WHERE session.id=p_session_id AND session.user_id=p_user_id
    AND session.status='active' AND session.current_question_id IS NOT NULL;
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'active diagnostic question snapshot not found' USING ERRCODE='P0002';
  END IF;
  RETURN v_result;
END
$fn$;

CREATE OR REPLACE FUNCTION public.record_adaptive_diagnostic_answer_v2(
  p_user_id uuid,
  p_session_id uuid,
  p_question_id uuid,
  p_selected_option smallint,
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
  v_next record;
  v_sequence smallint;
  v_covered smallint;
  v_next_outcome_attempts integer;
  v_has_uncovered boolean;
  v_status text;
  v_is_correct boolean;
  v_server_response_time_ms integer;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR p_question_id IS NULL
    OR p_selected_option IS NULL OR p_response_time_ms IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'user, session, question, selected option, response time and request are required'
      USING ERRCODE='22023';
  END IF;
  IF p_selected_option NOT BETWEEN 0 AND 9 OR p_response_time_ms NOT BETWEEN 100 AND 600000 THEN
    RAISE EXCEPTION 'invalid diagnostic answer evidence' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_session
  FROM public.adaptive_diagnostic_sessions
  WHERE id=p_session_id
  FOR UPDATE;
  IF NOT FOUND OR v_session.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'diagnostic session owner mismatch' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_existing
  FROM public.adaptive_diagnostic_answers answer
  WHERE answer.session_id=p_session_id
    AND (answer.request_id=p_request_id OR answer.question_id=p_question_id)
  ORDER BY CASE WHEN answer.request_id=p_request_id THEN 0 ELSE 1 END
  LIMIT 1;
  IF FOUND THEN
    IF v_existing.request_id=p_request_id AND (
      v_existing.question_id IS DISTINCT FROM p_question_id
      OR (
        v_existing.evidence_kind<>'legacy_unbound'
        AND v_existing.selected_option IS DISTINCT FROM p_selected_option
      )
      OR v_existing.response_time_ms IS DISTINCT FROM p_response_time_ms
    ) THEN
      RAISE EXCEPTION 'diagnostic request payload mismatch' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object(
      'alreadyProcessed',true,
      'status',v_existing.status_after,
      'nextQuestionId',v_existing.next_question_id,
      'answeredCount',v_existing.sequence,
      'coveredOutcomes',v_existing.covered_outcomes_after
    );
  END IF;

  IF v_session.status<>'active' THEN
    RAISE EXCEPTION 'diagnostic session is not active' USING ERRCODE='22023';
  END IF;
  IF v_session.expires_at<=clock_timestamp() THEN
    UPDATE public.adaptive_diagnostic_sessions
    SET status='abandoned',current_question_id=NULL,updated_at=clock_timestamp()
    WHERE id=v_session.id;
    RETURN jsonb_build_object(
      'alreadyProcessed',false,'status','abandoned','nextQuestionId',NULL,
      'answeredCount',v_session.answered_count,'coveredOutcomes',v_session.covered_outcomes
    );
  END IF;
  IF v_session.current_question_id IS DISTINCT FROM p_question_id
    OR v_session.current_question_revision_id IS NULL
    OR v_session.current_question_content_sha256 IS NULL
    OR v_session.current_question_correct_option IS NULL
    OR v_session.current_question_option_count IS NULL
    OR v_session.current_question_outcome_id IS NULL
    OR v_session.current_question_difficulty IS NULL
    OR v_session.current_question_issued_at IS NULL THEN
    RAISE EXCEPTION 'question is not the current revision-bound diagnostic question'
      USING ERRCODE='22023';
  END IF;
  IF p_selected_option>=v_session.current_question_option_count THEN
    RAISE EXCEPTION 'selected option is outside the issued question snapshot'
      USING ERRCODE='22023';
  END IF;
  v_is_correct:=p_selected_option=v_session.current_question_correct_option;
  v_server_response_time_ms:=LEAST(
    2147483647,
    GREATEST(0,floor(extract(epoch FROM (clock_timestamp()-v_session.current_question_issued_at))*1000))
  )::integer;

  IF (SELECT count(*) FROM public.adaptive_diagnostic_answers answer
      WHERE answer.session_id=p_session_id
        AND answer.outcome_id=v_session.current_question_outcome_id)>=2 THEN
    RAISE EXCEPTION 'an outcome cannot be measured more than twice' USING ERRCODE='23514';
  END IF;

  v_sequence:=(v_session.answered_count+1)::smallint;
  SELECT count(DISTINCT measured.outcome_id)::smallint INTO v_covered
  FROM (
    SELECT answer.outcome_id FROM public.adaptive_diagnostic_answers answer
    WHERE answer.session_id=p_session_id
    UNION ALL SELECT v_session.current_question_outcome_id
  ) measured;

  IF p_next_question_id IS NOT NULL THEN
    IF v_sequence>=10 OR p_next_question_id=p_question_id OR EXISTS (
      SELECT 1 FROM public.adaptive_diagnostic_answers answer
      WHERE answer.session_id=p_session_id AND answer.question_id=p_next_question_id
    ) THEN
      RAISE EXCEPTION 'next question is not eligible for this session' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_next FROM public.resolve_adaptive_diagnostic_question(p_next_question_id);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'next question is not an exact single-outcome pilot question' USING ERRCODE='22023';
    END IF;
    SELECT count(*)+CASE WHEN v_next.outcome_id=v_session.current_question_outcome_id THEN 1 ELSE 0 END
    INTO v_next_outcome_attempts
    FROM public.adaptive_diagnostic_answers answer
    WHERE answer.session_id=p_session_id AND answer.outcome_id=v_next.outcome_id;
    IF v_next_outcome_attempts>=2 THEN
      RAISE EXCEPTION 'next outcome already reached the two-question bound' USING ERRCODE='23514';
    END IF;
    SELECT EXISTS (
      SELECT 1
      FROM public.curriculum_outcomes outcome
      JOIN public.curriculum_nodes node ON node.id=outcome.node_id
      WHERE outcome.is_active=true AND outcome.game='matematik' AND outcome.exam_ref='TYT'
        AND outcome.taxonomy_version='ba-tyt-math-v1' AND node.is_active=true
        AND NOT EXISTS (
          SELECT 1 FROM public.adaptive_diagnostic_answers answer
          WHERE answer.session_id=p_session_id AND answer.outcome_id=outcome.id
        )
        AND outcome.id<>v_session.current_question_outcome_id
    ) INTO v_has_uncovered;
    IF v_has_uncovered AND EXISTS (
      SELECT 1 FROM public.adaptive_diagnostic_answers answer
      WHERE answer.session_id=p_session_id AND answer.outcome_id=v_next.outcome_id
      UNION ALL SELECT 1 WHERE v_next.outcome_id=v_session.current_question_outcome_id
    ) THEN
      RAISE EXCEPTION 'all pilot outcomes must be covered before confirmation questions'
        USING ERRCODE='23514';
    END IF;
    v_status:='active';
  ELSE
    v_status:=CASE WHEN v_covered=6 AND v_sequence=10 THEN 'completed' ELSE 'abandoned' END;
  END IF;

  INSERT INTO public.adaptive_diagnostic_answers(
    session_id,user_id,question_id,outcome_id,sequence,difficulty,is_correct,
    response_time_ms,request_id,next_question_id,covered_outcomes_after,status_after,
    selected_option,question_revision_id,question_content_sha256,server_response_time_ms,
    response_time_source,evidence_kind
  ) VALUES (
    p_session_id,p_user_id,p_question_id,v_session.current_question_outcome_id,v_sequence,
    v_session.current_question_difficulty,v_is_correct,
    p_response_time_ms,p_request_id,p_next_question_id,v_covered,v_status,
    p_selected_option,v_session.current_question_revision_id,v_session.current_question_content_sha256,
    v_server_response_time_ms,'client_reported_with_server_elapsed','revision_snapshot'
  );

  UPDATE public.adaptive_diagnostic_sessions
  SET current_question_id=p_next_question_id,answered_count=v_sequence,covered_outcomes=v_covered,
      status=v_status,completed_at=CASE WHEN v_status='completed' THEN clock_timestamp() ELSE NULL END,
      updated_at=clock_timestamp()
  WHERE id=p_session_id;

  IF v_status='completed' THEN
    WITH aggregate_result AS (
      SELECT answer.outcome_id,count(*)::smallint AS attempts,
        count(*) FILTER(WHERE answer.is_correct)::smallint AS correct_attempts,
        sum(CASE WHEN answer.is_correct THEN answer.difficulty ELSE 0 END)::numeric(8,3) AS earned,
        sum(answer.difficulty)::numeric(8,3) AS possible
      FROM public.adaptive_diagnostic_answers answer
      WHERE answer.session_id=p_session_id GROUP BY answer.outcome_id
    ), latest AS (
      SELECT DISTINCT ON (answer.outcome_id) answer.outcome_id,answer.difficulty,answer.is_correct
      FROM public.adaptive_diagnostic_answers answer
      WHERE answer.session_id=p_session_id
      ORDER BY answer.outcome_id,answer.sequence DESC
    )
    INSERT INTO public.user_diagnostic_outcome_state(
      user_id,outcome_id,completed_session_id,attempts,correct_attempts,
      difficulty_weighted_earned,difficulty_weighted_possible,score,
      recommended_difficulty,last_diagnosed_at,updated_at
    )
    SELECT p_user_id,aggregate_result.outcome_id,p_session_id,aggregate_result.attempts,
      aggregate_result.correct_attempts,aggregate_result.earned,aggregate_result.possible,
      round(100*aggregate_result.earned/aggregate_result.possible,2),
      least(5,greatest(1,latest.difficulty+CASE WHEN latest.is_correct THEN 1 ELSE -1 END))::smallint,
      clock_timestamp(),clock_timestamp()
    FROM aggregate_result JOIN latest ON latest.outcome_id=aggregate_result.outcome_id
    ON CONFLICT(user_id,outcome_id) DO UPDATE SET
      completed_session_id=EXCLUDED.completed_session_id,attempts=EXCLUDED.attempts,
      correct_attempts=EXCLUDED.correct_attempts,
      difficulty_weighted_earned=EXCLUDED.difficulty_weighted_earned,
      difficulty_weighted_possible=EXCLUDED.difficulty_weighted_possible,score=EXCLUDED.score,
      recommended_difficulty=EXCLUDED.recommended_difficulty,
      last_diagnosed_at=EXCLUDED.last_diagnosed_at,updated_at=clock_timestamp();
  END IF;

  RETURN jsonb_build_object(
    'alreadyProcessed',false,'status',v_status,'nextQuestionId',p_next_question_id,
    'answeredCount',v_sequence,'coveredOutcomes',v_covered
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.tg_adaptive_diagnostic_question_snapshot()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_adaptive_diagnostic_question_v2(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_adaptive_diagnostic_question_v2(uuid,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.record_adaptive_diagnostic_answer_v2(uuid,uuid,uuid,smallint,integer,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_adaptive_diagnostic_answer_v2(uuid,uuid,uuid,smallint,integer,uuid,uuid)
  TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
