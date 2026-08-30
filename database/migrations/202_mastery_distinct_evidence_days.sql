-- Migration 202: distinct verified Türkiye-day evidence for Mastery Discovery.
--
-- Discovery progress is not an answer counter. One outcome can earn at most
-- one evidence unit per Europe/Istanbul calendar day, even when a verified attempt contains
-- several answers for that outcome. The day is copied from the server-controlled
-- verified_attempts.completed_at boundary; session_answers.answered_at and any
-- caller-supplied evidence timestamp are intentionally ignored.
--
-- Rollback requires application readers to stop using verified_evidence_days
-- first. The evidence-day ledger is append-only and must not be discarded as a
-- routine rollback because it is the provenance for already reported progress.

BEGIN;

-- Never wait indefinitely behind live writers. Production rollout must stop
-- and be retried in a measured maintenance window when these bounds are hit.
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '15min';

LOCK TABLE
  public.verified_attempts,
  public.game_sessions,
  public.session_answers,
  public.mastery_outcome_evidence,
  public.user_outcome_state
IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.mastery_outcome_evidence
  ADD COLUMN IF NOT EXISTS verified_completed_at timestamptz;

ALTER TABLE public.mastery_outcome_evidence
  ADD COLUMN IF NOT EXISTS evidence_day_tr date
    GENERATED ALWAYS AS ((verified_completed_at AT TIME ZONE 'Europe/Istanbul')::date) STORED;

-- A rerun can see the guards installed by an earlier successful apply. Remove
-- them before the deterministic backfill, then recreate them below.
DROP TRIGGER IF EXISTS aaa_bind_mastery_evidence_verified_day
  ON public.mastery_outcome_evidence;
DROP TRIGGER IF EXISTS trg_mastery_evidence_verified_day_immutable
  ON public.mastery_outcome_evidence;
DROP TRIGGER IF EXISTS trg_record_mastery_distinct_evidence_day
  ON public.mastery_outcome_evidence;

-- Existing evidence must already have the same verified attempt/answer
-- provenance that future inserts are required to prove. Abort instead of
-- fabricating a day for an ambiguous legacy row.
DO $fn$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.mastery_outcome_evidence AS evidence
    LEFT JOIN public.verified_attempts AS attempt
      ON attempt.id = evidence.attempt_id
    LEFT JOIN public.game_sessions AS session
      ON session.id = evidence.session_id
    LEFT JOIN public.session_answers AS answer
      ON answer.id = evidence.answer_id
    WHERE attempt.id IS NULL
      OR attempt.completed_at IS NULL
      OR (
        evidence.verified_completed_at IS NOT NULL
        AND evidence.verified_completed_at IS DISTINCT FROM attempt.completed_at
      )
      OR attempt.session_id IS NULL
      OR attempt.user_id IS DISTINCT FROM evidence.user_id
      OR attempt.session_id IS DISTINCT FROM evidence.session_id
      OR NOT (evidence.question_id = ANY(attempt.question_ids))
      OR session.id IS NULL
      OR session.user_id IS DISTINCT FROM evidence.user_id
      OR answer.id IS NULL
      OR answer.user_id IS DISTINCT FROM evidence.user_id
      OR answer.session_id IS DISTINCT FROM evidence.session_id
      OR answer.question_id IS DISTINCT FROM evidence.question_id
      OR COALESCE(answer.is_skipped, false)
  ) THEN
    RAISE EXCEPTION 'legacy mastery evidence has unverifiable attempt provenance'
      USING ERRCODE = '23514';
  END IF;
END
$fn$;

UPDATE public.mastery_outcome_evidence AS evidence
SET verified_completed_at = attempt.completed_at
FROM public.verified_attempts AS attempt
WHERE attempt.id = evidence.attempt_id
  AND evidence.verified_completed_at IS NULL;

ALTER TABLE public.mastery_outcome_evidence
  ALTER COLUMN verified_completed_at SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.mastery_outcome_evidence_days (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  outcome_id uuid NOT NULL REFERENCES public.curriculum_outcomes(id) ON DELETE RESTRICT,
  evidence_day_tr date NOT NULL,
  first_verified_completed_at timestamptz NOT NULL,
  first_answer_id uuid NOT NULL,
  first_attempt_id uuid NOT NULL REFERENCES public.verified_attempts(id) ON DELETE CASCADE,
  first_question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, outcome_id, evidence_day_tr),
  CONSTRAINT mastery_outcome_evidence_days_source_fkey
    FOREIGN KEY (first_answer_id, outcome_id)
    REFERENCES public.mastery_outcome_evidence(answer_id, outcome_id)
    ON DELETE CASCADE,
  CONSTRAINT mastery_outcome_evidence_days_tr_check CHECK (
    evidence_day_tr = (first_verified_completed_at AT TIME ZONE 'Europe/Istanbul')::date
  )
);

CREATE INDEX IF NOT EXISTS mastery_outcome_evidence_days_outcome_idx
  ON public.mastery_outcome_evidence_days(outcome_id, user_id, evidence_day_tr);

-- One immutable evidence source can establish at most one day. The primary
-- key limits a day to one source; this reciprocal key prevents the same source
-- from being replayed into a second day during a migration rerun.
CREATE UNIQUE INDEX IF NOT EXISTS mastery_outcome_evidence_days_source_uidx
  ON public.mastery_outcome_evidence_days(first_answer_id, outcome_id);

LOCK TABLE public.mastery_outcome_evidence_days IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.mastery_outcome_evidence_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mastery_outcome_evidence_days
  FROM PUBLIC, anon, authenticated, service_role;

-- Preserve the earliest immutable verified completion as the public counter's
-- provenance when several answers land on the same outcome/day.
INSERT INTO public.mastery_outcome_evidence_days (
  user_id,
  outcome_id,
  evidence_day_tr,
  first_verified_completed_at,
  first_answer_id,
  first_attempt_id,
  first_question_id
)
SELECT DISTINCT ON (evidence.user_id, evidence.outcome_id, evidence.evidence_day_tr)
  evidence.user_id,
  evidence.outcome_id,
  evidence.evidence_day_tr,
  evidence.verified_completed_at,
  evidence.answer_id,
  evidence.attempt_id,
  evidence.question_id
FROM public.mastery_outcome_evidence AS evidence
ORDER BY
  evidence.user_id,
  evidence.outcome_id,
  evidence.evidence_day_tr,
  evidence.verified_completed_at,
  evidence.answer_id
ON CONFLICT (user_id, outcome_id, evidence_day_tr) DO NOTHING;

ALTER TABLE public.user_outcome_state
  ADD COLUMN IF NOT EXISTS verified_evidence_days integer NOT NULL DEFAULT 0;
ALTER TABLE public.user_outcome_state
  DROP CONSTRAINT IF EXISTS user_outcome_state_verified_evidence_days_nonnegative;
ALTER TABLE public.user_outcome_state
  ADD CONSTRAINT user_outcome_state_verified_evidence_days_nonnegative
  CHECK (verified_evidence_days >= 0);

DO $fn$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.mastery_outcome_evidence_days AS evidence_day
    LEFT JOIN public.user_outcome_state AS state
      ON state.user_id = evidence_day.user_id
     AND state.outcome_id = evidence_day.outcome_id
    WHERE state.user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'mastery evidence day has no aggregate state row'
      USING ERRCODE = '23514';
  END IF;
END
$fn$;

ALTER TABLE public.user_outcome_state
  DROP CONSTRAINT IF EXISTS user_outcome_state_verified_evidence_days_bounds;
ALTER TABLE public.user_outcome_state
  ADD CONSTRAINT user_outcome_state_verified_evidence_days_bounds
  CHECK (verified_evidence_days <= v2_attempts);

UPDATE public.user_outcome_state AS state
SET verified_evidence_days = (
  SELECT count(*)::integer
  FROM public.mastery_outcome_evidence_days AS evidence_day
  WHERE evidence_day.user_id = state.user_id
    AND evidence_day.outcome_id = state.outcome_id
);

DO $fn$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.user_outcome_state AS state
    WHERE state.verified_evidence_days > state.v2_attempts
  ) THEN
    RAISE EXCEPTION 'verified evidence days cannot exceed verified evidence rows'
      USING ERRCODE = '23514';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.bind_mastery_evidence_verified_day()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_attempt public.verified_attempts%ROWTYPE;
  v_answer public.session_answers%ROWTYPE;
  v_session_user_id uuid;
BEGIN
  SELECT * INTO v_attempt
  FROM public.verified_attempts
  WHERE id = NEW.attempt_id
  FOR KEY SHARE;

  IF NOT FOUND
    OR v_attempt.completed_at IS NULL
    OR v_attempt.session_id IS NULL
    OR v_attempt.user_id IS DISTINCT FROM NEW.user_id
    OR v_attempt.session_id IS DISTINCT FROM NEW.session_id
    OR NOT (NEW.question_id = ANY(v_attempt.question_ids)) THEN
    RAISE EXCEPTION 'completed verified attempt provenance required for mastery evidence'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_answer
  FROM public.session_answers
  WHERE id = NEW.answer_id
  FOR KEY SHARE;
  IF NOT FOUND
    OR v_answer.user_id IS DISTINCT FROM NEW.user_id
    OR v_answer.session_id IS DISTINCT FROM NEW.session_id
    OR v_answer.question_id IS DISTINCT FROM NEW.question_id
    OR COALESCE(v_answer.is_skipped, false) THEN
    RAISE EXCEPTION 'verified mastery evidence answer provenance mismatch'
      USING ERRCODE = '23514';
  END IF;

  SELECT session.user_id INTO v_session_user_id
  FROM public.game_sessions AS session
  WHERE session.id = NEW.session_id
  FOR KEY SHARE;
  IF NOT FOUND OR v_session_user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'verified mastery evidence session provenance mismatch'
      USING ERRCODE = '23514';
  END IF;

  -- Always overwrite a supplied value. The immutable Türkiye day is generated
  -- from this server-side verified-completion timestamp by PostgreSQL.
  NEW.verified_completed_at := v_attempt.completed_at;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.mastery_evidence_verified_day_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  RAISE EXCEPTION 'mastery evidence verified provenance is immutable'
    USING ERRCODE = '55000';
END
$fn$;

CREATE OR REPLACE FUNCTION public.mastery_outcome_evidence_days_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  RAISE EXCEPTION 'mastery outcome evidence days are immutable'
    USING ERRCODE = '55000';
END
$fn$;

CREATE OR REPLACE FUNCTION public.record_mastery_distinct_evidence_day()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_inserted boolean;
BEGIN
  INSERT INTO public.mastery_outcome_evidence_days (
    user_id,
    outcome_id,
    evidence_day_tr,
    first_verified_completed_at,
    first_answer_id,
    first_attempt_id,
    first_question_id
  ) VALUES (
    NEW.user_id,
    NEW.outcome_id,
    NEW.evidence_day_tr,
    NEW.verified_completed_at,
    NEW.answer_id,
    NEW.attempt_id,
    NEW.question_id
  )
  ON CONFLICT (user_id, outcome_id, evidence_day_tr) DO NOTHING
  RETURNING true INTO v_inserted;

  IF COALESCE(v_inserted, false) THEN
    UPDATE public.user_outcome_state AS state
    SET verified_evidence_days = state.verified_evidence_days + 1,
      updated_at = clock_timestamp()
    WHERE state.user_id = NEW.user_id
      AND state.outcome_id = NEW.outcome_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'verified mastery evidence requires an aggregate state row'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_mastery_outcome_evidence_days_append_only
  ON public.mastery_outcome_evidence_days;
CREATE TRIGGER trg_mastery_outcome_evidence_days_append_only
  -- DELETE remains available to owner-driven FK/privacy cascades. Raw roles
  -- have no table DML grant; only an in-place provenance rewrite is blocked.
  BEFORE UPDATE ON public.mastery_outcome_evidence_days
  FOR EACH ROW EXECUTE FUNCTION public.mastery_outcome_evidence_days_append_only();

CREATE TRIGGER aaa_bind_mastery_evidence_verified_day
  BEFORE INSERT ON public.mastery_outcome_evidence
  FOR EACH ROW EXECUTE FUNCTION public.bind_mastery_evidence_verified_day();

CREATE TRIGGER trg_mastery_evidence_verified_day_immutable
  BEFORE UPDATE OF
    answer_id,
    outcome_id,
    user_id,
    question_id,
    session_id,
    attempt_id,
    verified_completed_at
  ON public.mastery_outcome_evidence
  FOR EACH ROW EXECUTE FUNCTION public.mastery_evidence_verified_day_immutable();

CREATE CONSTRAINT TRIGGER trg_record_mastery_distinct_evidence_day
  AFTER INSERT ON public.mastery_outcome_evidence
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.record_mastery_distinct_evidence_day();

REVOKE ALL ON FUNCTION
  public.bind_mastery_evidence_verified_day(),
  public.mastery_evidence_verified_day_immutable(),
  public.mastery_outcome_evidence_days_append_only(),
  public.record_mastery_distinct_evidence_day()
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE public.user_outcome_state FROM service_role;
GRANT SELECT ON TABLE public.user_outcome_state TO service_role;

-- Production-local postcheck: the committed public counter must exactly match
-- the private provenance ledger and no raw role may bypass the API contract.
DO $fn$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.user_outcome_state AS state
    WHERE state.verified_evidence_days IS DISTINCT FROM (
      SELECT count(*)::integer
      FROM public.mastery_outcome_evidence_days AS evidence_day
      WHERE evidence_day.user_id = state.user_id
        AND evidence_day.outcome_id = state.outcome_id
    )
  ) THEN
    RAISE EXCEPTION 'verified evidence day aggregate postcheck failed'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.mastery_outcome_evidence_days AS evidence_day
    LEFT JOIN public.mastery_outcome_evidence AS evidence
      ON evidence.answer_id=evidence_day.first_answer_id
     AND evidence.outcome_id=evidence_day.outcome_id
    WHERE evidence.answer_id IS NULL
      OR evidence.user_id IS DISTINCT FROM evidence_day.user_id
      OR evidence.attempt_id IS DISTINCT FROM evidence_day.first_attempt_id
      OR evidence.question_id IS DISTINCT FROM evidence_day.first_question_id
      OR evidence.verified_completed_at IS DISTINCT FROM evidence_day.first_verified_completed_at
      OR evidence.evidence_day_tr IS DISTINCT FROM evidence_day.evidence_day_tr
  ) THEN
    RAISE EXCEPTION 'verified evidence day source provenance postcheck failed'
      USING ERRCODE = '23514';
  END IF;

  IF NOT (SELECT relation.relrowsecurity
      FROM pg_catalog.pg_class AS relation
      WHERE relation.oid = 'public.mastery_outcome_evidence_days'::regclass)
    OR has_table_privilege('authenticated', 'public.mastery_outcome_evidence_days', 'SELECT')
    OR has_table_privilege('service_role', 'public.mastery_outcome_evidence_days', 'SELECT')
    OR has_table_privilege('service_role', 'public.mastery_outcome_evidence_days', 'INSERT')
    OR has_table_privilege('service_role', 'public.mastery_outcome_evidence_days', 'UPDATE')
    OR has_table_privilege('service_role', 'public.mastery_outcome_evidence_days', 'DELETE')
    OR NOT has_table_privilege('service_role', 'public.user_outcome_state', 'SELECT')
    OR has_function_privilege('authenticated', 'public.record_mastery_distinct_evidence_day()', 'EXECUTE')
    OR has_function_privilege('service_role', 'public.record_mastery_distinct_evidence_day()', 'EXECUTE')
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_index AS index_row
      JOIN pg_catalog.pg_class AS index_relation ON index_relation.oid=index_row.indexrelid
      WHERE index_row.indrelid='public.mastery_outcome_evidence_days'::regclass
        AND index_relation.relname='mastery_outcome_evidence_days_source_uidx'
        AND index_row.indisunique
        AND index_row.indisvalid
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger AS trigger
      WHERE trigger.tgrelid = 'public.mastery_outcome_evidence'::regclass
        AND trigger.tgname = 'trg_record_mastery_distinct_evidence_day'
        AND NOT trigger.tgisinternal
    ) THEN
    RAISE EXCEPTION 'verified evidence day ACL or trigger postcheck failed'
      USING ERRCODE = '42501';
  END IF;
END
$fn$;

NOTIFY pgrst, 'reload schema';
COMMIT;
