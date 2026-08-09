-- Migration 100: private, server-receipt-backed strategy telemetry for verified
-- personalized mock exams.  session_answers.time_taken_sec is deliberately not
-- read here: it is client telemetry, never the canonical timing source.
--
-- Rollback (after callers are disabled): drop the six public RPCs, triggers,
-- private helpers and the five verified_exam_/controlled_experiment tables.

BEGIN;

CREATE TABLE IF NOT EXISTS public.verified_exam_attempts (
  attempt_id uuid PRIMARY KEY REFERENCES public.verified_attempts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game text NOT NULL CHECK (game IN ('matematik','turkce','fen','sosyal')),
  exam_ref text CHECK (exam_ref IS NULL OR char_length(trim(exam_ref)) BETWEEN 1 AND 40),
  blueprint_version text NOT NULL CHECK (char_length(trim(blueprint_version)) BETWEEN 1 AND 80),
  question_set_hash text NOT NULL CHECK (question_set_hash ~ '^[0-9a-f]{64}$'),
  planned_duration_sec integer NOT NULL CHECK (planned_duration_sec BETWEEN 5 AND 7200),
  issue_request_id uuid NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  started_at timestamptz,
  deadline_at timestamptz,
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','active','finalized','expired')),
  session_id uuid REFERENCES public.game_sessions(id) ON DELETE RESTRICT,
  start_request_id uuid,
  finalize_request_id uuid,
  experiment_assignment_id uuid,
  UNIQUE (user_id, issue_request_id),
  CONSTRAINT verified_exam_attempts_time_check CHECK (
    deadline_at IS NULL OR (started_at IS NOT NULL AND deadline_at > started_at)
  ),
  CONSTRAINT verified_exam_attempts_state_check CHECK (
    (status = 'issued' AND started_at IS NULL AND deadline_at IS NULL AND completed_at IS NULL
      AND session_id IS NULL AND start_request_id IS NULL AND finalize_request_id IS NULL)
    OR (status = 'active' AND started_at IS NOT NULL AND deadline_at IS NOT NULL
      AND completed_at IS NULL AND session_id IS NULL AND start_request_id IS NOT NULL
      AND finalize_request_id IS NULL)
    OR (status = 'finalized' AND started_at IS NOT NULL AND deadline_at IS NOT NULL
      AND completed_at IS NOT NULL AND session_id IS NOT NULL AND start_request_id IS NOT NULL
      AND finalize_request_id IS NOT NULL)
    OR (status = 'expired' AND completed_at IS NULL AND session_id IS NULL AND finalize_request_id IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS verified_exam_attempts_open_scope_idx
  ON public.verified_exam_attempts(user_id, game, (COALESCE(exam_ref, '')))
  WHERE status IN ('issued','active');

CREATE TABLE IF NOT EXISTS public.verified_exam_attempt_items (
  attempt_id uuid NOT NULL REFERENCES public.verified_exam_attempts(attempt_id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 99),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  source_bucket text NOT NULL CHECK (source_bucket IN ('wrong','weak','coverage')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (attempt_id, position),
  UNIQUE (attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS public.controlled_experiments (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  experiment_key text NOT NULL CHECK (char_length(trim(experiment_key)) BETWEEN 1 AND 80),
  revision integer NOT NULL CHECK (revision >= 1),
  game text NOT NULL CHECK (game IN ('matematik','turkce','fen','sosyal')),
  mode text NOT NULL CHECK (mode = 'deneme'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed')),
  allocation_bps integer NOT NULL DEFAULT 0 CHECK (allocation_bps BETWEEN 0 AND 10000),
  allocation_salt text NOT NULL CHECK (char_length(allocation_salt) BETWEEN 32 AND 256),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  activated_at timestamptz,
  UNIQUE (experiment_key, revision)
);
CREATE UNIQUE INDEX IF NOT EXISTS controlled_experiments_one_active_scope_idx
  ON public.controlled_experiments(game, mode) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.controlled_experiment_assignments (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.controlled_experiments(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  variant text NOT NULL CHECK (variant IN ('control','treatment')),
  bucket integer NOT NULL CHECK (bucket BETWEEN 0 AND 9999),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (experiment_id, user_id)
);

ALTER TABLE public.verified_exam_attempts
  DROP CONSTRAINT IF EXISTS verified_exam_attempts_assignment_fk;
ALTER TABLE public.verified_exam_attempts
  ADD CONSTRAINT verified_exam_attempts_assignment_fk FOREIGN KEY (experiment_assignment_id)
  REFERENCES public.controlled_experiment_assignments(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.verified_exam_strategy_events (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.verified_exam_attempts(attempt_id) ON DELETE CASCADE,
  client_event_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence >= 1),
  position smallint CHECK (position BETWEEN 0 AND 99),
  event_type text NOT NULL CHECK (event_type IN ('question_opened','question_left','answer_submitted','exam_submitted')),
  server_received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (attempt_id, client_event_id),
  UNIQUE (attempt_id, sequence),
  CONSTRAINT verified_exam_strategy_event_shape_check CHECK (
    (event_type = 'exam_submitted' AND position IS NULL) OR
    (event_type <> 'exam_submitted' AND position IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS verified_exam_strategy_events_one_submit_idx
  ON public.verified_exam_strategy_events(attempt_id) WHERE event_type = 'exam_submitted';
CREATE UNIQUE INDEX IF NOT EXISTS verified_exam_strategy_events_slot_idx
  ON public.verified_exam_strategy_events(attempt_id, position, event_type)
  WHERE position IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.controlled_experiment_exposures (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.controlled_experiment_assignments(id) ON DELETE RESTRICT,
  attempt_id uuid NOT NULL REFERENCES public.verified_exam_attempts(attempt_id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  exposed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (assignment_id, session_id),
  UNIQUE (assignment_id, request_id)
);

ALTER TABLE public.verified_exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verified_exam_attempt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verified_exam_strategy_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.controlled_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.controlled_experiment_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.controlled_experiment_exposures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.verified_exam_attempts, public.verified_exam_attempt_items,
  public.verified_exam_strategy_events, public.controlled_experiments,
  public.controlled_experiment_assignments, public.controlled_experiment_exposures
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.verified_exam_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
BEGIN RAISE EXCEPTION 'verified exam records are append-only' USING ERRCODE='42501'; END $fn$;

CREATE OR REPLACE FUNCTION public.verified_exam_attempt_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
BEGIN
  IF NEW.attempt_id IS DISTINCT FROM OLD.attempt_id OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.game IS DISTINCT FROM OLD.game OR NEW.exam_ref IS DISTINCT FROM OLD.exam_ref
    OR NEW.blueprint_version IS DISTINCT FROM OLD.blueprint_version
    OR NEW.question_set_hash IS DISTINCT FROM OLD.question_set_hash
    OR NEW.planned_duration_sec IS DISTINCT FROM OLD.planned_duration_sec
    OR NEW.issue_request_id IS DISTINCT FROM OLD.issue_request_id OR NEW.issued_at IS DISTINCT FROM OLD.issued_at THEN
    RAISE EXCEPTION 'verified exam attempt identity is immutable' USING ERRCODE='42501';
  END IF;
  IF OLD.status = 'issued' AND NEW.status = 'active' THEN
    IF NEW.started_at IS NULL OR NEW.deadline_at IS NULL OR NEW.start_request_id IS NULL THEN
      RAISE EXCEPTION 'invalid verified exam start transition' USING ERRCODE='22023'; END IF;
  ELSIF OLD.status = 'active' AND NEW.status = 'finalized' THEN
    IF NEW.completed_at IS NULL OR NEW.session_id IS NULL OR NEW.finalize_request_id IS NULL THEN
      RAISE EXCEPTION 'invalid verified exam finalize transition' USING ERRCODE='22023'; END IF;
  ELSIF NEW.status = 'expired' AND OLD.status IN ('issued','active') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'invalid verified exam attempt transition' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_verified_exam_attempt_guard ON public.verified_exam_attempts;
CREATE TRIGGER trg_verified_exam_attempt_guard BEFORE UPDATE ON public.verified_exam_attempts
FOR EACH ROW EXECUTE FUNCTION public.verified_exam_attempt_guard();
DROP TRIGGER IF EXISTS trg_verified_exam_items_append_only ON public.verified_exam_attempt_items;
CREATE TRIGGER trg_verified_exam_items_append_only BEFORE UPDATE OR DELETE ON public.verified_exam_attempt_items
FOR EACH ROW EXECUTE FUNCTION public.verified_exam_append_only();
DROP TRIGGER IF EXISTS trg_verified_exam_events_append_only ON public.verified_exam_strategy_events;
CREATE TRIGGER trg_verified_exam_events_append_only BEFORE UPDATE OR DELETE ON public.verified_exam_strategy_events
FOR EACH ROW EXECUTE FUNCTION public.verified_exam_append_only();
DROP TRIGGER IF EXISTS trg_controlled_assignments_append_only ON public.controlled_experiment_assignments;
CREATE TRIGGER trg_controlled_assignments_append_only BEFORE UPDATE OR DELETE ON public.controlled_experiment_assignments
FOR EACH ROW EXECUTE FUNCTION public.verified_exam_append_only();
DROP TRIGGER IF EXISTS trg_controlled_exposures_append_only ON public.controlled_experiment_exposures;
CREATE TRIGGER trg_controlled_exposures_append_only BEFORE UPDATE OR DELETE ON public.controlled_experiment_exposures
FOR EACH ROW EXECUTE FUNCTION public.verified_exam_append_only();

CREATE OR REPLACE FUNCTION public.issue_verified_exam_attempt(
  p_user_id uuid, p_game text, p_exam_ref text, p_blueprint_version text,
  p_items jsonb, p_duration_sec integer, p_planned_duration_sec integer, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_now timestamptz := clock_timestamp(); v_ids uuid[]; v_hash text; v_attempt uuid; v_existing public.verified_exam_attempts%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_game NOT IN ('matematik','turkce','fen','sosyal')
    OR p_blueprint_version IS NULL OR char_length(trim(p_blueprint_version)) NOT BETWEEN 1 AND 80
    OR p_duration_sec IS NULL OR p_planned_duration_sec IS NULL OR p_planned_duration_sec NOT BETWEEN 5 AND 7200
    OR p_duration_sec NOT BETWEEN p_planned_duration_sec + 1 AND 7200
    OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) <> 40 THEN
    RAISE EXCEPTION 'invalid verified exam issuance' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) e WHERE jsonb_typeof(e) <> 'object'
    OR (e->>'position') !~ '^([0-9]|[1-3][0-9])$' OR (e->>'questionId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR e->>'sourceBucket' NOT IN ('wrong','weak','coverage')) THEN RAISE EXCEPTION 'invalid verified exam items' USING ERRCODE='22023'; END IF;
  SELECT array_agg((e->>'questionId')::uuid ORDER BY (e->>'position')::integer) INTO v_ids FROM jsonb_array_elements(p_items) e;
  IF (SELECT count(DISTINCT (e->>'position')::integer) FROM jsonb_array_elements(p_items) e) <> 40
    OR (SELECT min((e->>'position')::integer) FROM jsonb_array_elements(p_items) e) <> 0
    OR (SELECT max((e->>'position')::integer) FROM jsonb_array_elements(p_items) e) <> 39
    OR cardinality(ARRAY(SELECT DISTINCT unnest(v_ids))) <> 40 THEN RAISE EXCEPTION 'items must be unique and contiguous' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM public.questions q WHERE q.id = ANY(v_ids) AND q.is_active AND q.game = p_game
      AND q.exam_ref IS NOT DISTINCT FROM p_exam_ref) <> 40 THEN RAISE EXCEPTION 'questions do not match verified exam scope' USING ERRCODE='22023'; END IF;
  v_hash := encode(public.digest(array_to_string(v_ids, ','), 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_game || ':' || coalesce(p_exam_ref,''), 100));
  SELECT * INTO v_existing FROM public.verified_exam_attempts WHERE user_id=p_user_id AND issue_request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.game IS DISTINCT FROM p_game OR v_existing.exam_ref IS DISTINCT FROM p_exam_ref OR v_existing.question_set_hash <> v_hash
      OR v_existing.blueprint_version <> p_blueprint_version OR v_existing.planned_duration_sec <> p_planned_duration_sec
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) e JOIN public.verified_exam_attempt_items i ON i.attempt_id=v_existing.attempt_id AND i.position=(e->>'position')::smallint WHERE i.question_id<>(e->>'questionId')::uuid OR i.source_bucket<>(e->>'sourceBucket')) THEN RAISE EXCEPTION 'issuance replay payload differs' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('attemptId',v_existing.attempt_id,'expiresAt',(SELECT expires_at FROM public.verified_attempts WHERE id=v_existing.attempt_id),'plannedDurationSec',v_existing.planned_duration_sec,'status',v_existing.status,'replayed',true);
  END IF;
  UPDATE public.verified_exam_attempts e SET status='expired' FROM public.verified_attempts a
   WHERE e.attempt_id=a.id AND e.user_id=p_user_id AND e.game=p_game AND e.exam_ref IS NOT DISTINCT FROM p_exam_ref
     AND e.status IN ('issued','active') AND (a.expires_at <= v_now OR (e.status='active' AND e.deadline_at <= v_now));
  SELECT * INTO v_existing FROM public.verified_exam_attempts WHERE user_id=p_user_id AND game=p_game AND exam_ref IS NOT DISTINCT FROM p_exam_ref AND status IN ('issued','active') FOR UPDATE;
  IF FOUND THEN
    -- A lost HTTP response must not strand a user behind the one-open scope.
    -- The immutable snapshot, including provenance, is the replay identity;
    -- a different request UUID is intentionally irrelevant here.
    IF v_existing.question_set_hash=v_hash AND v_existing.blueprint_version=p_blueprint_version AND v_existing.planned_duration_sec=p_planned_duration_sec
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) e JOIN public.verified_exam_attempt_items i ON i.attempt_id=v_existing.attempt_id AND i.position=(e->>'position')::smallint WHERE i.question_id<>(e->>'questionId')::uuid OR i.source_bucket<>(e->>'sourceBucket')) THEN
      RETURN jsonb_build_object('attemptId',v_existing.attempt_id,'expiresAt',(SELECT expires_at FROM public.verified_attempts WHERE id=v_existing.attempt_id),'plannedDurationSec',v_existing.planned_duration_sec,'status',v_existing.status,'replayed',true);
    END IF;
    RAISE EXCEPTION 'an open verified exam has a different snapshot' USING ERRCODE='23505';
  END IF;
  INSERT INTO public.verified_attempts(user_id,game,mode,question_ids,duration_sec,started_at,expires_at)
  VALUES(p_user_id,p_game,'deneme',v_ids,p_duration_sec,v_now,v_now + make_interval(secs=>p_duration_sec)) RETURNING id INTO v_attempt;
  INSERT INTO public.verified_exam_attempts(attempt_id,user_id,game,exam_ref,blueprint_version,question_set_hash,planned_duration_sec,issue_request_id)
  VALUES(v_attempt,p_user_id,p_game,p_exam_ref,p_blueprint_version,v_hash,p_planned_duration_sec,p_request_id);
  INSERT INTO public.verified_exam_attempt_items(attempt_id,position,question_id,source_bucket)
  SELECT v_attempt,(e->>'position')::smallint,(e->>'questionId')::uuid,e->>'sourceBucket' FROM jsonb_array_elements(p_items) e;
  RETURN jsonb_build_object('attemptId',v_attempt,'expiresAt',v_now+make_interval(secs=>p_duration_sec),'plannedDurationSec',p_planned_duration_sec,'status','issued','replayed',false);
END $fn$;

CREATE OR REPLACE FUNCTION public.start_verified_exam_attempt(p_attempt_id uuid,p_user_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_exam public.verified_exam_attempts%ROWTYPE; v_attempt public.verified_attempts%ROWTYPE; v_exp public.controlled_experiments%ROWTYPE; v_assign public.controlled_experiment_assignments%ROWTYPE; v_now timestamptz:=clock_timestamp(); v_bucket integer;
BEGIN
  IF p_attempt_id IS NULL OR p_user_id IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'invalid verified exam start' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_exam FROM public.verified_exam_attempts WHERE attempt_id=p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'verified exam attempt not found' USING ERRCODE='P0002'; END IF;
  IF v_exam.user_id <> p_user_id THEN RAISE EXCEPTION 'verified exam owner mismatch' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_attempt FROM public.verified_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF v_exam.status='active' THEN
    SELECT * INTO v_assign FROM public.controlled_experiment_assignments WHERE id=v_exam.experiment_assignment_id;
    RETURN jsonb_build_object('attemptId',p_attempt_id,'status','active','startedAt',v_exam.started_at,'deadlineAt',v_exam.deadline_at,'experiment',CASE WHEN v_assign.id IS NULL THEN NULL ELSE jsonb_build_object('key',(SELECT experiment_key FROM public.controlled_experiments WHERE id=v_assign.experiment_id),'revision',(SELECT revision FROM public.controlled_experiments WHERE id=v_assign.experiment_id),'variant',v_assign.variant) END,'replayed',true);
  END IF;
  IF v_exam.status <> 'issued' OR v_attempt.expires_at <= v_now THEN RAISE EXCEPTION 'verified exam is not startable' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_exp FROM public.controlled_experiments WHERE game=v_exam.game AND mode='deneme' AND status='active' FOR UPDATE;
  IF FOUND THEN
    v_bucket := (('x'||substr(encode(public.digest(v_exp.experiment_key||':'||v_exp.revision||':'||v_exp.allocation_salt||':'||p_user_id::text,'sha256'),'hex'),1,4))::bit(16)::integer % 10000);
    INSERT INTO public.controlled_experiment_assignments(experiment_id,user_id,variant,bucket) VALUES(v_exp.id,p_user_id,CASE WHEN v_bucket < v_exp.allocation_bps THEN 'treatment' ELSE 'control' END,v_bucket)
    ON CONFLICT (experiment_id,user_id) DO NOTHING;
    SELECT * INTO v_assign FROM public.controlled_experiment_assignments WHERE experiment_id=v_exp.id AND user_id=p_user_id;
  END IF;
  IF v_now + make_interval(secs=>v_exam.planned_duration_sec) > v_attempt.expires_at THEN RAISE EXCEPTION 'verified exam issuance expires too soon' USING ERRCODE='22023'; END IF;
  UPDATE public.verified_exam_attempts SET status='active',started_at=v_now,deadline_at=v_now+make_interval(secs=>v_exam.planned_duration_sec),start_request_id=p_request_id,experiment_assignment_id=v_assign.id WHERE attempt_id=p_attempt_id;
  RETURN jsonb_build_object('attemptId',p_attempt_id,'status','active','startedAt',v_now,'deadlineAt',v_now+make_interval(secs=>v_exam.planned_duration_sec),'experiment',CASE WHEN v_assign.id IS NULL THEN NULL ELSE jsonb_build_object('key',v_exp.experiment_key,'revision',v_exp.revision,'variant',v_assign.variant) END,'replayed',false);
END $fn$;

CREATE OR REPLACE FUNCTION public.record_verified_exam_strategy_event(p_attempt_id uuid,p_user_id uuid,p_client_event_id uuid,p_sequence integer,p_position smallint,p_event_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_exam public.verified_exam_attempts%ROWTYPE; v_existing public.verified_exam_strategy_events%ROWTYPE; v_slot public.verified_exam_strategy_events%ROWTYPE; v_now timestamptz:=clock_timestamp();
BEGIN
  IF p_attempt_id IS NULL OR p_user_id IS NULL OR p_client_event_id IS NULL OR p_sequence IS NULL OR p_sequence < 1 OR p_event_type NOT IN ('question_opened','answer_submitted','exam_submitted')
    OR ((p_event_type='exam_submitted') <> (p_position IS NULL)) THEN RAISE EXCEPTION 'invalid verified exam event' USING ERRCODE='22023'; END IF;
  IF p_event_type='exam_submitted' THEN RAISE EXCEPTION 'exam submission receipt is finalized server side' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_exam FROM public.verified_exam_attempts WHERE attempt_id=p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'verified exam attempt not found' USING ERRCODE='P0002'; END IF;
  IF v_exam.user_id <> p_user_id THEN RAISE EXCEPTION 'verified exam owner mismatch' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_existing FROM public.verified_exam_strategy_events WHERE attempt_id=p_attempt_id AND client_event_id=p_client_event_id;
  IF FOUND THEN
    IF v_existing.sequence<>p_sequence OR v_existing.position IS DISTINCT FROM p_position OR v_existing.event_type<>p_event_type THEN RAISE EXCEPTION 'event replay payload differs' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('sequence',v_existing.sequence,'position',v_existing.position,'eventType',v_existing.event_type,'serverReceivedAt',v_existing.server_received_at,'replayed',true);
  END IF;
  IF v_exam.status <> 'active' OR v_exam.deadline_at <= v_now THEN RAISE EXCEPTION 'verified exam is inactive or expired' USING ERRCODE='22023'; END IF;
  IF p_event_type <> 'exam_submitted' AND NOT EXISTS (SELECT 1 FROM public.verified_exam_attempt_items WHERE attempt_id=p_attempt_id AND position=p_position) THEN RAISE EXCEPTION 'event position is not an exam item' USING ERRCODE='22023'; END IF;
  IF p_event_type='question_opened' AND p_sequence <> p_position::integer * 2 + 1 THEN RAISE EXCEPTION 'question open sequence does not match position' USING ERRCODE='22023'; END IF;
  IF p_event_type='answer_submitted' AND p_sequence <> p_position::integer * 2 + 2 THEN RAISE EXCEPTION 'answer sequence does not match position' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_slot FROM public.verified_exam_strategy_events WHERE attempt_id=p_attempt_id AND position=p_position AND event_type=p_event_type;
  IF FOUND THEN RETURN jsonb_build_object('sequence',v_slot.sequence,'position',v_slot.position,'eventType',v_slot.event_type,'serverReceivedAt',v_slot.server_received_at,'replayed',true); END IF;
  IF p_event_type='exam_submitted' AND NOT EXISTS (SELECT 1 FROM public.verified_exam_strategy_events WHERE attempt_id=p_attempt_id AND event_type='question_opened') THEN RAISE EXCEPTION 'exam cannot be submitted before an item is opened' USING ERRCODE='22023'; END IF;
  INSERT INTO public.verified_exam_strategy_events(attempt_id,client_event_id,sequence,position,event_type,server_received_at) VALUES(p_attempt_id,p_client_event_id,p_sequence,p_position,p_event_type,v_now);
  RETURN jsonb_build_object('sequence',p_sequence,'position',p_position,'eventType',p_event_type,'serverReceivedAt',v_now,'replayed',false);
END $fn$;

CREATE OR REPLACE FUNCTION public.finalize_verified_exam_attempt(p_attempt_id uuid,p_user_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_exam public.verified_exam_attempts%ROWTYPE; v_attempt public.verified_attempts%ROWTYPE; v_receipt_id uuid;
BEGIN
  IF p_attempt_id IS NULL OR p_user_id IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'invalid verified exam finalization' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_exam FROM public.verified_exam_attempts WHERE attempt_id=p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'verified exam attempt not found' USING ERRCODE='P0002'; END IF;
  IF v_exam.user_id<>p_user_id THEN RAISE EXCEPTION 'verified exam owner mismatch' USING ERRCODE='42501'; END IF;
  IF v_exam.status='finalized' AND v_exam.finalize_request_id=p_request_id THEN RETURN jsonb_build_object('sessionId',v_exam.session_id,'finalizedAt',v_exam.completed_at,'replayed',true); END IF;
  IF v_exam.status <> 'active' THEN RAISE EXCEPTION 'verified exam is not finalizable' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_attempt FROM public.verified_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF v_attempt.user_id<>p_user_id OR v_attempt.mode<>'deneme' OR v_attempt.completed_at IS NULL OR v_attempt.session_id IS NULL THEN RAISE EXCEPTION 'verified session is not complete' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.game_sessions s WHERE s.id=v_attempt.session_id AND s.user_id=p_user_id AND s.game=v_exam.game AND s.status='completed') THEN RAISE EXCEPTION 'verified session mismatch' USING ERRCODE='22023'; END IF;
  -- This UUID derives only from the immutable attempt ID, making the terminal
  -- server receipt retry-safe without relying on a client-supplied terminal event.
  v_receipt_id := (substr(md5('verified-exam-finalize:'||p_attempt_id::text),1,8)||'-'||substr(md5('verified-exam-finalize:'||p_attempt_id::text),9,4)||'-'||substr(md5('verified-exam-finalize:'||p_attempt_id::text),13,4)||'-'||substr(md5('verified-exam-finalize:'||p_attempt_id::text),17,4)||'-'||substr(md5('verified-exam-finalize:'||p_attempt_id::text),21,12))::uuid;
  IF EXISTS (SELECT 1 FROM public.verified_exam_strategy_events WHERE attempt_id=p_attempt_id AND event_type='exam_submitted' AND client_event_id<>v_receipt_id) THEN RAISE EXCEPTION 'exam submission receipt is not canonical' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.verified_exam_strategy_events WHERE attempt_id=p_attempt_id AND client_event_id=v_receipt_id AND event_type<>'exam_submitted') THEN RAISE EXCEPTION 'terminal receipt id is already bound' USING ERRCODE='22023'; END IF;
  INSERT INTO public.verified_exam_strategy_events(attempt_id,client_event_id,sequence,position,event_type)
  SELECT p_attempt_id,v_receipt_id,(SELECT count(*) * 2 + 1 FROM public.verified_exam_attempt_items WHERE attempt_id=p_attempt_id),NULL,'exam_submitted'
  WHERE NOT EXISTS (SELECT 1 FROM public.verified_exam_strategy_events WHERE attempt_id=p_attempt_id AND event_type='exam_submitted');
  UPDATE public.verified_exam_attempts SET status='finalized',completed_at=clock_timestamp(),session_id=v_attempt.session_id,finalize_request_id=p_request_id WHERE attempt_id=p_attempt_id;
  RETURN jsonb_build_object('sessionId',v_attempt.session_id,'finalizedAt',clock_timestamp(),'replayed',false);
END $fn$;

CREATE OR REPLACE FUNCTION public.get_verified_exam_strategy_evidence(p_attempt_id uuid,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_exam public.verified_exam_attempts%ROWTYPE; v_assign public.controlled_experiment_assignments%ROWTYPE; v_exp public.controlled_experiments%ROWTYPE; v_items jsonb;
BEGIN
  SELECT * INTO v_exam FROM public.verified_exam_attempts WHERE attempt_id=p_attempt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'verified exam attempt not found' USING ERRCODE='P0002'; END IF;
  IF v_exam.user_id<>p_user_id THEN RAISE EXCEPTION 'verified exam owner mismatch' USING ERRCODE='42501'; END IF;
  IF v_exam.status<>'finalized' OR v_exam.experiment_assignment_id IS NULL THEN RAISE EXCEPTION 'verified exam evidence is unavailable' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_assign FROM public.controlled_experiment_assignments WHERE id=v_exam.experiment_assignment_id;
  SELECT * INTO v_exp FROM public.controlled_experiments WHERE id=v_assign.experiment_id;
  IF v_exp.status <> 'active' THEN RAISE EXCEPTION 'experiment is disabled' USING ERRCODE='22023'; END IF;
  IF v_assign.variant='control' THEN v_items:='[]'::jsonb; ELSE
    IF NOT EXISTS (SELECT 1 FROM public.verified_exam_strategy_events WHERE attempt_id=p_attempt_id AND event_type='exam_submitted') THEN RAISE EXCEPTION 'exam submission receipt is required' USING ERRCODE='22023'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('position',i.position,'answered',a.question_id IS NOT NULL,'isCorrect',CASE WHEN a.question_id IS NULL THEN NULL ELSE a.is_correct END,'isSkipped',coalesce(a.is_skipped,false),'openedAt',o.server_received_at,'submittedAt',sub.server_received_at) ORDER BY i.position),'[]'::jsonb) INTO v_items
    FROM public.verified_exam_attempt_items i LEFT JOIN public.session_answers a ON a.session_id=v_exam.session_id AND a.question_order=i.position AND a.question_id=i.question_id
      LEFT JOIN public.verified_exam_strategy_events o ON o.attempt_id=i.attempt_id AND o.position=i.position AND o.event_type='question_opened'
      LEFT JOIN public.verified_exam_strategy_events sub ON sub.attempt_id=i.attempt_id AND sub.position=i.position AND sub.event_type='answer_submitted'
    WHERE i.attempt_id=p_attempt_id;
  END IF;
  RETURN jsonb_build_object('experimentKey',v_exp.experiment_key,'revision',v_exp.revision,'variant',v_assign.variant,'plannedCount',(SELECT count(*) FROM public.verified_exam_attempt_items WHERE attempt_id=p_attempt_id),'startedAt',v_exam.started_at,'deadlineAt',v_exam.deadline_at,'items',v_items);
END $fn$;

CREATE OR REPLACE FUNCTION public.record_verified_exam_exposure(p_attempt_id uuid,p_user_id uuid,p_experiment_key text,p_revision integer,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_exam public.verified_exam_attempts%ROWTYPE; v_assign public.controlled_experiment_assignments%ROWTYPE; v_exp public.controlled_experiments%ROWTYPE; v_existing public.controlled_experiment_exposures%ROWTYPE;
BEGIN
  IF p_attempt_id IS NULL OR p_user_id IS NULL OR p_request_id IS NULL OR p_experiment_key IS NULL OR p_revision IS NULL THEN RAISE EXCEPTION 'invalid experiment exposure' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_exam FROM public.verified_exam_attempts WHERE attempt_id=p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'verified exam attempt not found' USING ERRCODE='P0002'; END IF;
  IF v_exam.user_id<>p_user_id THEN RAISE EXCEPTION 'verified exam owner mismatch' USING ERRCODE='42501'; END IF;
  IF v_exam.status<>'finalized' OR v_exam.experiment_assignment_id IS NULL THEN RAISE EXCEPTION 'experiment exposure is unavailable' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_assign FROM public.controlled_experiment_assignments WHERE id=v_exam.experiment_assignment_id;
  SELECT * INTO v_exp FROM public.controlled_experiments WHERE id=v_assign.experiment_id;
  IF v_exp.status<>'active' OR v_exp.experiment_key<>p_experiment_key OR v_exp.revision<>p_revision THEN RAISE EXCEPTION 'experiment exposure mismatch' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_existing FROM public.controlled_experiment_exposures WHERE assignment_id=v_assign.id AND request_id=p_request_id;
  IF FOUND THEN RETURN jsonb_build_object('experimentKey',v_exp.experiment_key,'revision',v_exp.revision,'variant',v_assign.variant,'exposedAt',v_existing.exposed_at,'replayed',true); END IF;
  IF EXISTS (SELECT 1 FROM public.controlled_experiment_exposures WHERE assignment_id=v_assign.id AND session_id=v_exam.session_id) THEN RAISE EXCEPTION 'experiment exposure already recorded with another request' USING ERRCODE='22023'; END IF;
  INSERT INTO public.controlled_experiment_exposures(assignment_id,attempt_id,session_id,request_id) VALUES(v_assign.id,p_attempt_id,v_exam.session_id,p_request_id);
  RETURN jsonb_build_object('experimentKey',v_exp.experiment_key,'revision',v_exp.revision,'variant',v_assign.variant,'exposedAt',clock_timestamp(),'replayed',false);
END $fn$;

REVOKE ALL ON FUNCTION public.verified_exam_append_only(), public.verified_exam_attempt_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.issue_verified_exam_attempt(uuid,text,text,text,jsonb,integer,integer,uuid), public.start_verified_exam_attempt(uuid,uuid,uuid), public.record_verified_exam_strategy_event(uuid,uuid,uuid,integer,smallint,text), public.finalize_verified_exam_attempt(uuid,uuid,uuid), public.get_verified_exam_strategy_evidence(uuid,uuid), public.record_verified_exam_exposure(uuid,uuid,text,integer,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_verified_exam_attempt(uuid,text,text,text,jsonb,integer,integer,uuid), public.start_verified_exam_attempt(uuid,uuid,uuid), public.record_verified_exam_strategy_event(uuid,uuid,uuid,integer,smallint,text), public.finalize_verified_exam_attempt(uuid,uuid,uuid), public.get_verified_exam_strategy_evidence(uuid,uuid), public.record_verified_exam_exposure(uuid,uuid,text,integer,uuid) TO service_role;

INSERT INTO public.controlled_experiments(experiment_key,revision,game,mode,status,allocation_bps,allocation_salt)
VALUES ('mock_strategy_analysis_v1',1,'matematik','deneme','draft',0,encode(public.gen_random_bytes(32),'hex'))
ON CONFLICT (experiment_key,revision) DO NOTHING;

COMMIT;
