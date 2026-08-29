-- Migration 201: bind an institution program item to server-verifiable work.
--
-- A program is a teacher recommendation, not a causal intervention.  The
-- execution ledger below records an owner-bound learner start, and completion
-- is written only by a completed verified practice attempt or by a completed
-- immutable adaptive-diagnostic session.  No browser supplied completion bit
-- is accepted.

BEGIN;

ALTER TABLE public.institution_operation_events
  DROP CONSTRAINT IF EXISTS institution_operation_events_event_type_check;
ALTER TABLE public.institution_operation_events
  ADD CONSTRAINT institution_operation_events_event_type_check CHECK (event_type IN (
    'institution_provisioned','institution_status_changed','staff_added','staff_removed',
    'manager_teaching_changed','manager_transferred',
    'role_created','role_updated','role_deleted','role_assignment_changed',
    'classroom_created','student_joined','student_withdrawn','student_removed',
    'invite_issued','invite_revoked','assignment_published','assignment_submitted',
    'board_access_changed','exam_mode_changed',
    'study_program_created','study_program_updated','study_program_published',
    'study_program_reviewed','study_program_item_started','study_program_item_completed',
    'student_followup_opened','student_followup_resolved',
    'student_report_created','support_access_granted','support_access_revoked'
  ));
-- Preserve every prior immutable-audit namespace while allowing this distinct
-- execution ledger to use its own request/idempotency domain.
ALTER TABLE public.institution_operation_events
  DROP CONSTRAINT IF EXISTS institution_operation_events_source_check;
ALTER TABLE public.institution_operation_events
  ADD CONSTRAINT institution_operation_events_source_check CHECK (source IN (
    'institution_request','free_pilot_request','classroom_request','program_execution'
  ));

-- Migration 194 made reports curriculum-scope aware, but its history reader
-- accepted an active membership even when the learner profile had since been
-- tombstoned.  Keep immutable reports retained for governance while removing
-- institution-facing access as soon as the learner lifecycle closes.
CREATE OR REPLACE FUNCTION public.get_institution_student_reports_v2(
  p_user_id uuid,
  p_classroom_id uuid,
  p_member_ref text,
  p_game text,
  p_display_exam_ref text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_membership public.teacher_classroom_memberships%ROWTYPE;
  v_scope jsonb;
  v_reports jsonb;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL
    OR p_member_ref IS NULL OR p_member_ref !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'invalid institution report scope' USING ERRCODE = '22023';
  END IF;
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  v_scope := public.institution_scope_capability_snapshot(
    p_game, p_display_exam_ref, 'report'
  );
  SELECT * INTO v_classroom FROM public.teacher_classrooms
  WHERE id = p_classroom_id AND teacher_id = p_user_id AND status = 'active';
  IF NOT FOUND OR NOT public.institution_pilot_has_role(
    p_user_id, v_classroom.institution_id, ARRAY['manager','teacher']::text[]
  ) THEN
    RAISE EXCEPTION 'assigned institution teacher required' USING ERRCODE = '42501';
  END IF;
  SELECT membership.* INTO v_membership
  FROM public.teacher_classroom_memberships AS membership
  JOIN public.profiles AS profile
    ON profile.id = membership.student_id AND profile.deleted_at IS NULL
  WHERE membership.classroom_id = p_classroom_id
    AND membership.member_ref = p_member_ref
    AND membership.status = 'active';
  IF NOT FOUND OR public.teacher_classroom_is_blocked(
    p_user_id, v_membership.student_id
  ) THEN
    RAISE EXCEPTION 'active classroom member not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'reportRef', report.report_ref,
    'scope', jsonb_build_object(
      'game', report.game,
      'examRef', report.display_exam_ref,
      'questionExamRef', report.question_exam_ref,
      'taxonomyVersion', report.taxonomy_version,
      'scopePolicyVersion', report.scope_policy_version
    ),
    'snapshot', report.snapshot,
    'createdAt', report.created_at
  ) ORDER BY report.created_at DESC), '[]'::jsonb)
  INTO v_reports
  FROM (
    SELECT *
    FROM public.institution_student_reports AS stored
    WHERE stored.institution_id = v_classroom.institution_id
      AND stored.classroom_id = p_classroom_id
      AND stored.membership_id = v_membership.id
      AND stored.student_id = v_membership.student_id
      AND stored.teacher_id = p_user_id
      AND stored.game = v_scope->>'game'
      AND stored.display_exam_ref = v_scope->>'displayExamRef'
      AND stored.question_exam_ref IS NOT DISTINCT FROM
        NULLIF(v_scope->>'questionExamRef', '')
      AND stored.taxonomy_version = v_scope->>'taxonomyVersion'
      AND stored.scope_policy_version = v_scope->>'scopePolicyVersion'
    ORDER BY stored.created_at DESC
    LIMIT 10
  ) AS report;
  RETURN jsonb_build_object(
    'scope', jsonb_build_object(
      'game', v_scope->>'game',
      'examRef', v_scope->>'displayExamRef',
      'questionExamRef', v_scope->'questionExamRef',
      'taxonomyVersion', v_scope->>'taxonomyVersion',
      'scopePolicyVersion', v_scope->>'scopePolicyVersion'
    ),
    'reports', v_reports
  );
END;
$fn$;

-- The application reads report history through its AAL2/rate-limited server
-- route.  Migration 194 also granted the forward RPC to authenticated for its
-- deploy-before-migration compatibility window; close that direct Data API
-- path now that the server route is the sole supported consumer.
REVOKE ALL ON FUNCTION public.get_institution_student_reports_v2(
  uuid, uuid, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_institution_student_reports_v2(
  uuid, uuid, text, text, text
) TO service_role;

-- Freeze publication/item edits for the reconciliation snapshot.  Without
-- this lock, an older application instance could publish another duplicate
-- diagnostic after the final scan but before this migration commits.
LOCK TABLE
  public.institution_study_programs,
  public.institution_study_program_items
IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS public.institution_study_program_item_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.institution_study_programs(id) ON DELETE RESTRICT,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 21),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  task_type text NOT NULL CHECK (task_type IN ('verified_questions','diagnostic')),
  game text NOT NULL CHECK (game = lower(btrim(game)) AND game ~ '^[a-z][a-z0-9_]{1,19}$'),
  display_exam_ref text NOT NULL CHECK (display_exam_ref = upper(btrim(display_exam_ref)) AND display_exam_ref ~ '^[A-Z0-9-]{2,10}$'),
  question_exam_ref text CHECK (question_exam_ref IS NULL OR question_exam_ref = upper(btrim(question_exam_ref))),
  taxonomy_version text NOT NULL CHECK (taxonomy_version ~ '^ba-[a-z0-9-]+-v[0-9]+$'),
  request_id uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started','completed','expired')),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '3 hours'),
  completed_at timestamptz,
  expired_at timestamptz,
  verified_attempt_id uuid UNIQUE REFERENCES public.verified_attempts(id) ON DELETE RESTRICT,
  diagnostic_session_id uuid UNIQUE REFERENCES public.adaptive_diagnostic_sessions(id) ON DELETE RESTRICT,
  CONSTRAINT institution_program_execution_item_fkey FOREIGN KEY (program_id, position)
    REFERENCES public.institution_study_program_items(program_id, position) ON DELETE RESTRICT,
  CONSTRAINT institution_program_execution_completion_check CHECK (
    (status='started' AND completed_at IS NULL AND expired_at IS NULL AND verified_attempt_id IS NULL AND diagnostic_session_id IS NULL)
    OR (status='completed' AND completed_at IS NOT NULL
      AND expired_at IS NULL AND ((verified_attempt_id IS NOT NULL)::integer + (diagnostic_session_id IS NOT NULL)::integer = 1))
    OR (status='expired' AND completed_at IS NULL AND expired_at IS NOT NULL
      AND verified_attempt_id IS NULL AND diagnostic_session_id IS NULL)
  )
  ,CONSTRAINT institution_program_execution_expiry_check CHECK (expires_at>started_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS institution_program_one_open_execution_idx
  ON public.institution_study_program_item_executions(program_id,position)
  WHERE status='started';
-- An attempt can close only one explicit learner intent. This also prevents a
-- later generic practice session from being ambiguously assigned to several
-- program cards.
CREATE UNIQUE INDEX IF NOT EXISTS institution_program_student_one_open_execution_idx
  ON public.institution_study_program_item_executions(student_id)
  WHERE status='started';
CREATE INDEX IF NOT EXISTS institution_program_execution_student_open_idx
  ON public.institution_study_program_item_executions(student_id,status,started_at);
ALTER TABLE public.institution_study_program_item_executions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.institution_study_program_item_executions
  FROM PUBLIC,anon,authenticated,service_role;

-- Older generators could publish several outcome-labelled cards that all
-- launch the same full-scope diagnostic.  Preserve the first card and migrate
-- only later pending cards to outcome-bound baseline practice.  This is a
-- system reconciliation, not a teacher action, so it has its own immutable
-- provenance ledger instead of impersonating the teacher in operation_events.
CREATE TABLE IF NOT EXISTS public.institution_program_item_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.institution_study_programs(id) ON DELETE RESTRICT,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 21),
  institution_id uuid NOT NULL REFERENCES public.pilot_institutions(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  origin text NOT NULL CHECK (origin='system_migration'),
  migration_id text NOT NULL CHECK (migration_id='201'),
  reason text NOT NULL CHECK (reason='duplicate_full_scope_diagnostic_to_verified_baseline'),
  original_snapshot jsonb NOT NULL CHECK (jsonb_typeof(original_snapshot)='object'),
  reconciled_snapshot jsonb NOT NULL CHECK (jsonb_typeof(reconciled_snapshot)='object'),
  reconciled_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (program_id,position,migration_id),
  FOREIGN KEY (program_id,position)
    REFERENCES public.institution_study_program_items(program_id,position) ON DELETE RESTRICT
);
ALTER TABLE public.institution_program_item_reconciliations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.institution_program_item_reconciliations
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.institution_program_reconciliation_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  RAISE EXCEPTION 'institution program reconciliation ledger is immutable' USING ERRCODE='42501';
END;
$fn$;
DROP TRIGGER IF EXISTS institution_program_reconciliation_immutable
  ON public.institution_program_item_reconciliations;
CREATE TRIGGER institution_program_reconciliation_immutable
  BEFORE UPDATE OR DELETE ON public.institution_program_item_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.institution_program_reconciliation_immutable();

DO $fn$
DECLARE
  v_candidate record;
  v_scope_outcome_count integer;
  v_category_outcome_count integer;
  v_outcome_title text;
  v_category text;
  v_new_title text;
  v_original jsonb;
  v_reconciled jsonb;
BEGIN
  -- Never rewrite a learner intent that has already been started.  A mixed
  -- legacy state needs explicit operator/teacher adjudication instead.
  IF EXISTS (
    WITH ranked AS (
      SELECT program.id AS program_id,item.position,
        row_number() OVER (PARTITION BY program.id ORDER BY item.position) AS diagnostic_rank
      FROM public.institution_study_programs AS program
      JOIN public.institution_study_program_items AS item ON item.program_id=program.id
      WHERE program.status='published' AND item.status='pending' AND item.task_type='diagnostic'
    )
    SELECT 1 FROM ranked
    JOIN public.institution_study_program_item_executions AS execution
      ON execution.program_id=ranked.program_id AND execution.position=ranked.position
    WHERE ranked.diagnostic_rank>1
  ) THEN
    RAISE EXCEPTION 'duplicate diagnostic reconciliation has an existing execution'
      USING ERRCODE='23514';
  END IF;

  FOR v_candidate IN
    WITH ranked AS (
      SELECT program.id AS program_id,program.institution_id,program.student_id,
        program.game,program.display_exam_ref,program.taxonomy_version,
        item.position,item.scheduled_date,item.task_type,item.title,item.reason_code,
        item.outcome_code,item.duration_minutes,item.target_question_count,item.status,
        row_number() OVER (PARTITION BY program.id ORDER BY item.position) AS diagnostic_rank
      FROM public.institution_study_programs AS program
      JOIN public.institution_study_program_items AS item ON item.program_id=program.id
      WHERE program.status='published' AND item.status='pending' AND item.task_type='diagnostic'
    )
    SELECT * FROM ranked WHERE diagnostic_rank>1 ORDER BY program_id,position
  LOOP
    SELECT count(*)::integer,min(outcome.title),min(outcome.category)
    INTO v_scope_outcome_count,v_outcome_title,v_category
    FROM public.curriculum_outcomes AS outcome
    WHERE outcome.code=v_candidate.outcome_code AND outcome.game=v_candidate.game
      AND outcome.exam_ref=v_candidate.display_exam_ref
      AND outcome.taxonomy_version=v_candidate.taxonomy_version AND outcome.is_active;
    IF v_scope_outcome_count<>1 OR v_category IS NULL
      OR v_category !~ '^[a-z][a-z0-9_]{1,29}$' THEN
      RAISE EXCEPTION 'duplicate diagnostic reconciliation outcome scope is ambiguous'
        USING ERRCODE='23514';
    END IF;
    SELECT count(*)::integer INTO v_category_outcome_count
    FROM public.curriculum_outcomes AS outcome
    WHERE outcome.game=v_candidate.game AND outcome.exam_ref=v_candidate.display_exam_ref
      AND outcome.taxonomy_version=v_candidate.taxonomy_version
      AND outcome.category=v_category AND outcome.is_active;
    IF v_category_outcome_count<>1 THEN
      RAISE EXCEPTION 'duplicate diagnostic reconciliation needs a dedicated category target'
        USING ERRCODE='23514';
    END IF;

    v_new_title:=left(btrim(v_outcome_title)||': başlangıç soru çalışması',120);
    v_original:=jsonb_build_object(
      'scheduledDate',v_candidate.scheduled_date,'taskType',v_candidate.task_type,
      'title',v_candidate.title,'reasonCode',v_candidate.reason_code,
      'outcomeCode',v_candidate.outcome_code,'durationMinutes',v_candidate.duration_minutes,
      'targetQuestionCount',v_candidate.target_question_count,'status',v_candidate.status,
      'scope',jsonb_build_object('game',v_candidate.game,'examRef',v_candidate.display_exam_ref,
        'taxonomyVersion',v_candidate.taxonomy_version)
    );
    v_reconciled:=jsonb_build_object(
      'scheduledDate',v_candidate.scheduled_date,'taskType','verified_questions',
      'title',v_new_title,'reasonCode','current_target',
      'outcomeCode',v_candidate.outcome_code,'durationMinutes',v_candidate.duration_minutes,
      'targetQuestionCount',10,'status','pending',
      'scope',jsonb_build_object('game',v_candidate.game,'examRef',v_candidate.display_exam_ref,
        'taxonomyVersion',v_candidate.taxonomy_version)
    );
    INSERT INTO public.institution_program_item_reconciliations(
      program_id,position,institution_id,student_id,origin,migration_id,reason,
      original_snapshot,reconciled_snapshot
    ) VALUES (
      v_candidate.program_id,v_candidate.position,v_candidate.institution_id,v_candidate.student_id,
      'system_migration','201','duplicate_full_scope_diagnostic_to_verified_baseline',
      v_original,v_reconciled
    );
    UPDATE public.institution_study_program_items AS item
    SET task_type='verified_questions',title=v_new_title,reason_code='current_target',
      target_question_count=10
    WHERE item.program_id=v_candidate.program_id AND item.position=v_candidate.position
      AND item.status='pending' AND item.task_type='diagnostic'
      AND item.outcome_code IS NOT DISTINCT FROM v_candidate.outcome_code;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'duplicate diagnostic reconciliation lost its locked source row'
        USING ERRCODE='40001';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT program.id
      FROM public.institution_study_programs AS program
      JOIN public.institution_study_program_items AS item ON item.program_id=program.id
      WHERE program.status='published' AND item.status='pending' AND item.task_type='diagnostic'
      GROUP BY program.id HAVING count(*)>1
    ) AS duplicate
  ) THEN
    RAISE EXCEPTION 'published program still has duplicate full-scope diagnostics'
      USING ERRCODE='23514';
  END IF;
END
$fn$;

-- A draft remains an editable teacher workspace.  Publication is the security
-- boundary: every published card must have an exact, active and launchable
-- server target.  Keep this invariant below the RPC layer so an older RPC,
-- direct SECURITY DEFINER call or privileged table write cannot publish cards
-- that the learner can never complete.
CREATE OR REPLACE FUNCTION public.assert_institution_program_startable(
  p_program_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE
  v_program public.institution_study_programs%ROWTYPE;
  v_current_scope jsonb;
  v_item_count integer;
  v_diagnostic_count integer;
  v_invalid_position smallint;
BEGIN
  IF p_program_id IS NULL THEN
    RAISE EXCEPTION 'institution program startability needs a program'
      USING ERRCODE='22023';
  END IF;

  SELECT program.* INTO v_program
  FROM public.institution_study_programs AS program
  WHERE program.id=p_program_id;
  IF NOT FOUND OR v_program.status<>'published' THEN RETURN; END IF;

  -- The durable program snapshot is evidence, not perpetual authorization.
  -- Re-resolve the current release/capability and reject retirement or drift.
  v_current_scope:=public.institution_scope_capability_snapshot(
    v_program.game,v_program.display_exam_ref,'program'
  );
  IF v_current_scope->>'game' IS DISTINCT FROM v_program.game
    OR v_current_scope->>'displayExamRef' IS DISTINCT FROM v_program.display_exam_ref
    OR NULLIF(v_current_scope->>'questionExamRef','') IS DISTINCT FROM v_program.question_exam_ref
    OR v_current_scope->>'taxonomyVersion' IS DISTINCT FROM v_program.taxonomy_version
    OR v_current_scope->>'scopePolicyVersion' IS DISTINCT FROM v_program.scope_policy_version THEN
    RAISE EXCEPTION 'published institution program scope is no longer current'
      USING ERRCODE='23514';
  END IF;

  SELECT count(*)::integer,
    count(*) FILTER (WHERE item.task_type='diagnostic')::integer
  INTO v_item_count,v_diagnostic_count
  FROM public.institution_study_program_items AS item
  WHERE item.program_id=v_program.id;

  IF v_item_count IS DISTINCT FROM v_program.item_count OR v_item_count<1 THEN
    RAISE EXCEPTION 'published institution program item count is inconsistent'
      USING ERRCODE='23514';
  END IF;
  IF v_diagnostic_count>1 THEN
    RAISE EXCEPTION 'published institution program has more than one diagnostic'
      USING ERRCODE='23514';
  END IF;
  IF v_diagnostic_count=1
    AND NOT COALESCE((v_current_scope->>'diagnosticEnabled')::boolean,false) THEN
    RAISE EXCEPTION 'published institution diagnostic scope is unavailable'
      USING ERRCODE='23514';
  END IF;

  SELECT item.position INTO v_invalid_position
  FROM public.institution_study_program_items AS item
  WHERE item.program_id=v_program.id AND (
    item.task_type NOT IN ('verified_questions','diagnostic')
    OR item.target_question_count IS NULL
    OR item.target_question_count NOT BETWEEN 1 AND 10
    OR item.outcome_code IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.curriculum_outcomes AS target
      WHERE target.code=item.outcome_code
        AND target.game=v_program.game
        AND target.exam_ref=v_program.display_exam_ref
        AND target.taxonomy_version=v_program.taxonomy_version
        AND target.is_active
        AND target.category ~ '^[a-z][a-z0-9_]{1,29}$'
        AND (
          SELECT count(*)
          FROM public.curriculum_outcomes AS same_code
          WHERE same_code.code=item.outcome_code
            AND same_code.game=v_program.game
            AND same_code.exam_ref=v_program.display_exam_ref
            AND same_code.taxonomy_version=v_program.taxonomy_version
            AND same_code.is_active
        )=1
        AND (
          SELECT count(*)
          FROM public.curriculum_outcomes AS same_category
          WHERE same_category.game=v_program.game
            AND same_category.exam_ref=v_program.display_exam_ref
            AND same_category.taxonomy_version=v_program.taxonomy_version
            AND same_category.category=target.category
            AND same_category.is_active
        )=1
    )
  )
  ORDER BY item.position
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'published institution program item % is not startable',v_invalid_position
      USING ERRCODE='23514';
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.enforce_institution_program_startable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF TG_TABLE_NAME='institution_study_programs' THEN
    IF TG_OP='UPDATE' AND OLD.id IS DISTINCT FROM NEW.id THEN
      PERFORM public.assert_institution_program_startable(OLD.id);
    END IF;
    PERFORM public.assert_institution_program_startable(NEW.id);
  ELSE
    IF TG_OP='DELETE' THEN
      PERFORM public.assert_institution_program_startable(OLD.program_id);
      RETURN OLD;
    END IF;
    IF TG_OP='UPDATE' AND OLD.program_id IS DISTINCT FROM NEW.program_id THEN
      PERFORM public.assert_institution_program_startable(OLD.program_id);
    END IF;
    PERFORM public.assert_institution_program_startable(NEW.program_id);
  END IF;
  RETURN NEW;
END;
$fn$;

-- Abort the migration if reconciliation did not leave every already-published
-- program launchable.  Constraint triggers protect all future transactions.
DO $fn$
DECLARE
  v_program record;
BEGIN
  FOR v_program IN
    SELECT program.id FROM public.institution_study_programs AS program
    WHERE program.status='published' ORDER BY program.id
  LOOP
    PERFORM public.assert_institution_program_startable(v_program.id);
  END LOOP;
END
$fn$;

DROP TRIGGER IF EXISTS institution_program_startable_contract
  ON public.institution_study_programs;
CREATE CONSTRAINT TRIGGER institution_program_startable_contract
  AFTER INSERT OR UPDATE ON public.institution_study_programs
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.enforce_institution_program_startable();
DROP TRIGGER IF EXISTS institution_program_item_startable_contract
  ON public.institution_study_program_items;
CREATE CONSTRAINT TRIGGER institution_program_item_startable_contract
  AFTER INSERT OR UPDATE OR DELETE ON public.institution_study_program_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.enforce_institution_program_startable();

CREATE OR REPLACE FUNCTION public.institution_program_execution_immutable_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
  IF NEW.program_id IS DISTINCT FROM OLD.program_id OR NEW.position IS DISTINCT FROM OLD.position
    OR NEW.student_id IS DISTINCT FROM OLD.student_id OR NEW.task_type IS DISTINCT FROM OLD.task_type
    OR NEW.game IS DISTINCT FROM OLD.game OR NEW.display_exam_ref IS DISTINCT FROM OLD.display_exam_ref
    OR NEW.question_exam_ref IS DISTINCT FROM OLD.question_exam_ref
    OR NEW.taxonomy_version IS DISTINCT FROM OLD.taxonomy_version
    OR NEW.request_id IS DISTINCT FROM OLD.request_id OR NEW.started_at IS DISTINCT FROM OLD.started_at
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'institution program execution fields are immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS institution_program_execution_immutable_fields ON public.institution_study_program_item_executions;
CREATE TRIGGER institution_program_execution_immutable_fields
  BEFORE UPDATE ON public.institution_study_program_item_executions
  FOR EACH ROW EXECUTE FUNCTION public.institution_program_execution_immutable_fields();

ALTER TABLE public.institution_study_program_reviews
  DROP CONSTRAINT IF EXISTS institution_study_program_reviews_system_suggestion_check;
ALTER TABLE public.institution_study_program_reviews
  ADD CONSTRAINT institution_study_program_reviews_system_suggestion_check CHECK (
    system_suggestion IN ('effective','partial','ineffective','insufficient',
      'observed_improvement','mixed_observation','no_observed_improvement')
  );

DROP FUNCTION IF EXISTS public.institution_program_start_target(text,text,text);
CREATE OR REPLACE FUNCTION public.institution_program_start_target(
  p_task_type text,p_game text,p_exam_ref text,p_taxonomy_version text,p_outcome_code text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE
  v_category text;
  v_category_outcome_count integer;
BEGIN
  IF p_game IS NULL OR p_game IS DISTINCT FROM lower(btrim(p_game))
    OR p_game !~ '^[a-z][a-z0-9_]{1,19}$'
    OR p_exam_ref IS NULL OR p_exam_ref IS DISTINCT FROM upper(btrim(p_exam_ref))
    OR p_exam_ref !~ '^[A-Z0-9-]{2,10}$'
    OR p_taxonomy_version IS NULL OR p_taxonomy_version !~ '^ba-[a-z0-9-]+-v[0-9]+$' THEN
    RAISE EXCEPTION 'invalid institution program start scope' USING ERRCODE='22023';
  END IF;
  IF p_task_type IS NULL OR p_task_type NOT IN ('verified_questions','diagnostic')
    OR p_outcome_code IS NULL THEN
    RAISE EXCEPTION 'program task needs an outcome-bound verifiable target' USING ERRCODE='23514';
  END IF;
  IF p_outcome_code IS NOT NULL THEN
    SELECT outcome.category INTO v_category
    FROM public.curriculum_outcomes AS outcome
    WHERE outcome.code=p_outcome_code AND outcome.game=p_game
      AND outcome.exam_ref=p_exam_ref AND outcome.taxonomy_version=p_taxonomy_version
      AND outcome.is_active;
    IF NOT FOUND OR v_category !~ '^[a-z][a-z0-9_]{1,29}$' THEN
      RAISE EXCEPTION 'institution program outcome scope mismatch' USING ERRCODE='23514';
    END IF;
    SELECT count(*) INTO v_category_outcome_count
    FROM public.curriculum_outcomes AS outcome
    WHERE outcome.game=p_game AND outcome.exam_ref=p_exam_ref
      AND outcome.taxonomy_version=p_taxonomy_version
      AND outcome.category=v_category AND outcome.is_active;
    IF v_category_outcome_count<>1 THEN
      RAISE EXCEPTION 'institution program outcome needs a dedicated category target' USING ERRCODE='23514';
    END IF;
  END IF;
  IF p_task_type='diagnostic' THEN
    RETURN jsonb_build_object('kind','diagnostic','requiredMode','diagnostic','href','/arena/tani?game='||p_game||'&exam_ref='||p_exam_ref);
  END IF;
  IF p_task_type='verified_questions' THEN
    RETURN jsonb_build_object(
      'kind','practice','requiredMode','practice','href','/arena/'||p_game||'?'
        ||CASE WHEN v_category IS NULL THEN '' ELSE 'category='||v_category||'&' END
        ||'exam_ref='||p_exam_ref||'&mode=practice'
    );
  END IF;
  RAISE EXCEPTION 'program task has no verifiable start target' USING ERRCODE='22023';
END;
$fn$;

CREATE OR REPLACE FUNCTION public.start_my_institution_study_program_item(
  p_user_id uuid,p_program_ref text,p_position smallint,p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE
  v_program public.institution_study_programs%ROWTYPE;
  v_item public.institution_study_program_items%ROWTYPE;
  v_execution public.institution_study_program_item_executions%ROWTYPE;
  v_target jsonb;
  v_today date := (pg_catalog.clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_program_ref !~ '^[0-9a-f]{32}$'
    OR p_position NOT BETWEEN 1 AND 21 THEN
    RAISE EXCEPTION 'invalid institution program item start' USING ERRCODE='22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution program item actor mismatch' USING ERRCODE='42501';
  END IF;
  -- Serialize the idempotency key before its first lookup. Without this lock,
  -- two concurrent first-use requests could both miss the row and race at the
  -- unique insert instead of returning the same replay contract.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('institution-program-start:'||p_request_id::text,201)
  );
  SELECT execution.* INTO v_execution
  FROM public.institution_study_program_item_executions AS execution
  WHERE execution.request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_execution.student_id IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'institution program item start replay mismatch' USING ERRCODE='22023';
    END IF;
    SELECT program.* INTO v_program
    FROM public.institution_study_programs AS program
    JOIN public.teacher_classroom_memberships AS membership
      ON membership.id=program.membership_id AND membership.classroom_id=program.classroom_id
      AND membership.student_id=p_user_id AND membership.status='active'
    JOIN public.teacher_classrooms AS classroom
      ON classroom.id=program.classroom_id AND classroom.status='active'
    JOIN public.pilot_institutions AS institution
      ON institution.id=program.institution_id AND institution.id=classroom.institution_id
      AND public.institution_pilot_is_operational(institution.id)
    JOIN public.profiles AS profile ON profile.id=p_user_id AND profile.deleted_at IS NULL
    WHERE program.id=v_execution.program_id AND program.student_id=p_user_id
      AND NOT public.teacher_classroom_is_blocked(classroom.teacher_id,p_user_id);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'active institution program item access not found' USING ERRCODE='P0002';
    END IF;
    SELECT item.* INTO v_item FROM public.institution_study_program_items AS item
      WHERE item.program_id=v_execution.program_id AND item.position=v_execution.position;
    IF v_program.program_ref IS DISTINCT FROM p_program_ref OR v_execution.position IS DISTINCT FROM p_position
      OR v_item.program_id IS NULL THEN
      RAISE EXCEPTION 'institution program item start replay mismatch' USING ERRCODE='22023';
    END IF;
    PERFORM public.assert_institution_program_startable(v_program.id);
    IF v_execution.status='expired'
      OR (v_execution.status='started' AND v_execution.expires_at<=clock_timestamp()) THEN
      RAISE EXCEPTION 'institution program item start expired; create a fresh request' USING ERRCODE='P0002';
    END IF;
    v_target:=public.institution_program_start_target(
      v_execution.task_type,v_execution.game,v_execution.display_exam_ref,
      v_execution.taxonomy_version,v_item.outcome_code
    );
    RETURN jsonb_build_object('status',v_execution.status,'replayed',true,'startTarget',v_target);
  END IF;

  SELECT program.* INTO v_program
  FROM public.institution_study_programs AS program
  JOIN public.teacher_classroom_memberships AS membership
    ON membership.id=program.membership_id AND membership.classroom_id=program.classroom_id
   AND membership.student_id=p_user_id AND membership.status='active'
  JOIN public.teacher_classrooms AS classroom ON classroom.id=program.classroom_id AND classroom.status='active'
  JOIN public.pilot_institutions AS institution
    ON institution.id=program.institution_id AND public.institution_pilot_is_operational(institution.id)
  JOIN public.profiles AS profile ON profile.id=p_user_id AND profile.deleted_at IS NULL
  WHERE program.program_ref=p_program_ref AND program.student_id=p_user_id
    AND program.status='published' AND v_today>=program.week_start AND v_today<program.week_start+7
    AND NOT public.teacher_classroom_is_blocked(classroom.teacher_id,p_user_id)
  FOR UPDATE OF program;
  IF NOT FOUND THEN RAISE EXCEPTION 'active published program item not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.assert_institution_program_startable(v_program.id);
  SELECT * INTO v_item FROM public.institution_study_program_items
    WHERE program_id=v_program.id AND position=p_position FOR UPDATE;
  IF NOT FOUND OR v_item.status<>'pending' THEN RAISE EXCEPTION 'pending program item not found' USING ERRCODE='P0002'; END IF;
  IF v_today<v_item.scheduled_date THEN
    RAISE EXCEPTION 'program item is not scheduled yet' USING ERRCODE='22023';
  END IF;
  IF v_item.task_type IN ('verified_questions','diagnostic')
    AND (v_item.target_question_count IS NULL OR v_item.target_question_count NOT BETWEEN 1 AND 10) THEN
    RAISE EXCEPTION 'program item exceeds the verifiable session capacity' USING ERRCODE='23514';
  END IF;
  v_target:=public.institution_program_start_target(
    v_item.task_type,v_program.game,v_program.display_exam_ref,
    v_program.taxonomy_version,v_item.outcome_code
  );
  UPDATE public.institution_study_program_item_executions
  SET status='expired',expired_at=clock_timestamp()
  WHERE student_id=p_user_id AND status='started' AND expires_at<=clock_timestamp();
  SELECT execution.* INTO v_execution
  FROM public.institution_study_program_item_executions execution
  WHERE execution.student_id=p_user_id AND execution.status='started'
  FOR UPDATE;
  IF FOUND THEN
    IF v_execution.program_id IS DISTINCT FROM v_program.id OR v_execution.position IS DISTINCT FROM v_item.position THEN
      RAISE EXCEPTION 'another institution program item is already active' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('status','started','replayed',true,'startTarget',v_target);
  END IF;
  INSERT INTO public.institution_study_program_item_executions(
    program_id,position,student_id,task_type,game,display_exam_ref,question_exam_ref,taxonomy_version,request_id
  ) VALUES (
    v_program.id,v_item.position,p_user_id,v_item.task_type,v_program.game,v_program.display_exam_ref,
    v_program.question_exam_ref,v_program.taxonomy_version,p_request_id
  ) RETURNING * INTO v_execution;
  INSERT INTO public.institution_operation_events(
    institution_id,actor_user_id,event_type,target_ref,classroom_id,source,request_id,metadata
  ) VALUES (
    v_program.institution_id,p_user_id,'study_program_item_started',v_program.program_ref,v_program.classroom_id,
    'program_execution',p_request_id,jsonb_build_object('position',v_item.position,'taskType',v_item.task_type)
  ) ON CONFLICT (source,actor_user_id,event_type,request_id) DO NOTHING;
  RETURN jsonb_build_object('status','started','replayed',false,'startTarget',v_target);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.complete_institution_program_item_from_verified_attempt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE
  v_execution public.institution_study_program_item_executions%ROWTYPE;
  v_program public.institution_study_programs%ROWTYPE;
  v_item public.institution_study_program_items%ROWTYPE;
BEGIN
  IF NEW.completed_at IS NULL OR OLD.completed_at IS NOT NULL OR NEW.session_id IS NULL OR NEW.mode<>'practice' THEN RETURN NEW; END IF;
  SELECT execution.* INTO v_execution
  FROM public.institution_study_program_item_executions AS execution
  JOIN public.institution_study_programs AS program ON program.id=execution.program_id
  JOIN public.institution_study_program_items AS item ON item.program_id=program.id AND item.position=execution.position
  JOIN public.teacher_classroom_memberships AS membership
    ON membership.id=program.membership_id AND membership.classroom_id=program.classroom_id
    AND membership.student_id=NEW.user_id AND membership.status='active'
  JOIN public.teacher_classrooms AS classroom
    ON classroom.id=program.classroom_id AND classroom.status='active'
  JOIN public.pilot_institutions AS institution
    ON institution.id=program.institution_id AND institution.id=classroom.institution_id
    AND public.institution_pilot_is_operational(institution.id)
  JOIN public.profiles AS profile ON profile.id=NEW.user_id AND profile.deleted_at IS NULL
  WHERE execution.student_id=NEW.user_id AND execution.status='started'
    AND execution.task_type='verified_questions' AND execution.game=NEW.game
    AND program.student_id=NEW.user_id AND program.status='published' AND item.status='pending'
    AND NOT public.teacher_classroom_is_blocked(classroom.teacher_id,NEW.user_id)
    AND NEW.started_at>=execution.started_at
    AND execution.started_at<=NEW.completed_at AND NEW.completed_at<=execution.expires_at
    AND (item.target_question_count IS NULL OR (
      SELECT count(DISTINCT answer.question_id)
      FROM public.session_answers answer
      WHERE answer.session_id=NEW.session_id AND answer.user_id=NEW.user_id
        AND NOT COALESCE(answer.is_skipped,false)
    )>=item.target_question_count)
    AND item.outcome_code IS NOT NULL
    AND (
      SELECT count(DISTINCT evidence.answer_id) FROM public.mastery_outcome_evidence AS evidence
      JOIN public.curriculum_outcomes AS outcome ON outcome.id=evidence.outcome_id
      JOIN public.session_answers AS answer ON answer.id=evidence.answer_id
      WHERE evidence.attempt_id=NEW.id AND answer.session_id=NEW.session_id
        AND NOT COALESCE(answer.is_skipped,false) AND outcome.code=item.outcome_code
        AND outcome.game=execution.game AND outcome.exam_ref=execution.display_exam_ref
        AND outcome.taxonomy_version=execution.taxonomy_version
    )>=item.target_question_count
  ORDER BY execution.started_at,execution.id LIMIT 1 FOR UPDATE OF execution;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT * INTO v_program FROM public.institution_study_programs WHERE id=v_execution.program_id;
  UPDATE public.institution_study_program_item_executions SET status='completed',completed_at=NEW.completed_at,verified_attempt_id=NEW.id WHERE id=v_execution.id;
  UPDATE public.institution_study_program_items SET status='completed',completed_at=NEW.completed_at WHERE program_id=v_execution.program_id AND position=v_execution.position AND status='pending';
  INSERT INTO public.institution_operation_events(institution_id,actor_user_id,event_type,target_ref,classroom_id,source,request_id,metadata)
  VALUES (v_program.institution_id,NEW.user_id,'study_program_item_completed',v_program.program_ref,v_program.classroom_id,'program_execution',v_execution.id,jsonb_build_object('position',v_execution.position,'source','verified_practice'))
  ON CONFLICT (source,actor_user_id,event_type,request_id) DO NOTHING;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.complete_institution_program_item_from_diagnostic()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE
  v_execution public.institution_study_program_item_executions%ROWTYPE;
  v_program public.institution_study_programs%ROWTYPE;
BEGIN
  IF NEW.status<>'completed' OR OLD.status='completed' OR NEW.completed_at IS NULL THEN RETURN NEW; END IF;
  SELECT execution.* INTO v_execution
  FROM public.institution_study_program_item_executions AS execution
  JOIN public.institution_study_programs AS program ON program.id=execution.program_id
  JOIN public.institution_study_program_items AS item ON item.program_id=program.id AND item.position=execution.position
  JOIN public.teacher_classroom_memberships AS membership
    ON membership.id=program.membership_id AND membership.classroom_id=program.classroom_id
    AND membership.student_id=NEW.user_id AND membership.status='active'
  JOIN public.teacher_classrooms AS classroom
    ON classroom.id=program.classroom_id AND classroom.status='active'
  JOIN public.pilot_institutions AS institution
    ON institution.id=program.institution_id AND institution.id=classroom.institution_id
    AND public.institution_pilot_is_operational(institution.id)
  JOIN public.profiles AS profile ON profile.id=NEW.user_id AND profile.deleted_at IS NULL
  WHERE execution.student_id=NEW.user_id AND execution.status='started' AND execution.task_type='diagnostic'
    AND execution.game=NEW.game AND execution.display_exam_ref=NEW.exam_ref
    AND execution.question_exam_ref IS NOT DISTINCT FROM NEW.question_exam_ref
    AND execution.taxonomy_version=NEW.taxonomy_version
    AND NEW.started_at>=execution.started_at
    AND execution.started_at<=NEW.completed_at AND NEW.completed_at<=execution.expires_at
    AND program.student_id=NEW.user_id AND program.status='published' AND item.status='pending'
    AND NOT public.teacher_classroom_is_blocked(classroom.teacher_id,NEW.user_id)
    AND (item.target_question_count IS NULL OR (
      SELECT count(DISTINCT answer.id) FROM public.adaptive_diagnostic_answers answer
      WHERE answer.session_id=NEW.id AND answer.user_id=NEW.user_id
    )>=item.target_question_count)
    AND item.outcome_code IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.adaptive_diagnostic_answers AS answer
      JOIN public.curriculum_outcomes AS outcome ON outcome.id=answer.outcome_id
      WHERE answer.session_id=NEW.id AND answer.user_id=NEW.user_id
        AND outcome.code=item.outcome_code AND outcome.game=execution.game
        AND outcome.exam_ref=execution.display_exam_ref
        AND outcome.taxonomy_version=execution.taxonomy_version
    )
  ORDER BY execution.started_at,execution.id LIMIT 1 FOR UPDATE OF execution;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT * INTO v_program FROM public.institution_study_programs WHERE id=v_execution.program_id;
  UPDATE public.institution_study_program_item_executions SET status='completed',completed_at=NEW.completed_at,diagnostic_session_id=NEW.id WHERE id=v_execution.id;
  UPDATE public.institution_study_program_items SET status='completed',completed_at=NEW.completed_at WHERE program_id=v_execution.program_id AND position=v_execution.position AND status='pending';
  INSERT INTO public.institution_operation_events(institution_id,actor_user_id,event_type,target_ref,classroom_id,source,request_id,metadata)
  VALUES (v_program.institution_id,NEW.user_id,'study_program_item_completed',v_program.program_ref,v_program.classroom_id,'program_execution',v_execution.id,jsonb_build_object('position',v_execution.position,'source','adaptive_diagnostic'))
  ON CONFLICT (source,actor_user_id,event_type,request_id) DO NOTHING;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS institution_program_verified_attempt_completion ON public.verified_attempts;
DROP TRIGGER IF EXISTS zzz_institution_program_verified_attempt_completion ON public.verified_attempts;
-- PostgreSQL executes same-kind triggers in name order. This must run after
-- trg_materialize_verified_attempt_mastery has persisted outcome evidence.
CREATE TRIGGER zzz_institution_program_verified_attempt_completion
  AFTER UPDATE OF completed_at,session_id ON public.verified_attempts
  FOR EACH ROW EXECUTE FUNCTION public.complete_institution_program_item_from_verified_attempt();
DROP TRIGGER IF EXISTS institution_program_diagnostic_completion ON public.adaptive_diagnostic_sessions;
CREATE TRIGGER institution_program_diagnostic_completion
  AFTER UPDATE OF status,completed_at ON public.adaptive_diagnostic_sessions
  FOR EACH ROW EXECUTE FUNCTION public.complete_institution_program_item_from_diagnostic();

-- Review eligibility is about observed work, not publication alone.  Keep the
-- Istanbul calendar explicit so the API and database agree around midnight.
CREATE OR REPLACE FUNCTION public.institution_study_program_review_ready(
  p_program_id uuid,p_review_day date
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
  SELECT COALESCE((
    SELECT p_review_day IS NOT NULL
      AND p_review_day>=program.week_start+14
      AND program.status IN ('published','completed')
      AND membership.accepted_at<(
        (program.week_start+14)::timestamp AT TIME ZONE 'Europe/Istanbul'
      )
      AND EXISTS (
        SELECT 1 FROM public.institution_study_program_item_executions execution
        JOIN public.institution_study_program_items item
          ON item.program_id=execution.program_id AND item.position=execution.position
        WHERE execution.program_id=program.id AND execution.status='completed'
          AND item.status='completed'
      )
    FROM public.institution_study_programs program
    JOIN public.teacher_classroom_memberships membership
      ON membership.id=program.membership_id AND membership.classroom_id=program.classroom_id
      AND membership.student_id=program.student_id AND membership.status='active'
    JOIN public.teacher_classrooms classroom
      ON classroom.id=program.classroom_id AND classroom.institution_id=program.institution_id
      AND classroom.status='active'
    JOIN public.pilot_institutions institution
      ON institution.id=program.institution_id AND public.institution_pilot_is_operational(institution.id)
    JOIN public.profiles profile ON profile.id=program.student_id AND profile.deleted_at IS NULL
    WHERE program.id=p_program_id
      AND NOT public.teacher_classroom_is_blocked(classroom.teacher_id,program.student_id)
  ),false)
$fn$;

-- Teacher review is explicitly descriptive: only executed items are targets,
-- and the result is a post-program association, not program effectiveness.
CREATE OR REPLACE FUNCTION public.institution_study_program_review_evidence(p_program_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE
  v_program public.institution_study_programs%ROWTYPE; v_targeted integer; v_assessed integer;
  v_improved integer; v_declined integer; v_suggestion text; v_membership_accepted_at timestamptz;
  v_baseline_start timestamptz;
  v_baseline_end timestamptz; v_current_start timestamptz; v_current_end timestamptz;
BEGIN
  SELECT program.* INTO v_program
  FROM public.institution_study_programs program
  JOIN public.teacher_classroom_memberships membership
    ON membership.id=program.membership_id AND membership.classroom_id=program.classroom_id
    AND membership.student_id=program.student_id AND membership.status='active'
  JOIN public.teacher_classrooms classroom
    ON classroom.id=program.classroom_id AND classroom.institution_id=program.institution_id
    AND classroom.status='active'
  JOIN public.pilot_institutions institution
    ON institution.id=program.institution_id AND public.institution_pilot_is_operational(institution.id)
  JOIN public.profiles profile ON profile.id=program.student_id AND profile.deleted_at IS NULL
  WHERE program.id=p_program_id
    AND NOT public.teacher_classroom_is_blocked(classroom.teacher_id,program.student_id);
  IF NOT FOUND OR v_program.status NOT IN ('published','completed') THEN RAISE EXCEPTION 'published study program required' USING ERRCODE='22023'; END IF;
  SELECT membership.accepted_at INTO v_membership_accepted_at
  FROM public.teacher_classroom_memberships membership
  WHERE membership.id=v_program.membership_id;
  v_baseline_start:=greatest(
    (v_program.week_start-14)::timestamp AT TIME ZONE 'Europe/Istanbul',
    v_membership_accepted_at
  );
  v_baseline_end:=greatest(
    v_program.week_start::timestamp AT TIME ZONE 'Europe/Istanbul',
    v_membership_accepted_at
  );
  v_current_start:=v_baseline_end;
  v_current_end:=(v_program.week_start+14)::timestamp AT TIME ZONE 'Europe/Istanbul';
  IF v_current_start>=v_current_end THEN
    RAISE EXCEPTION 'program review has no post-acceptance evidence window' USING ERRCODE='22023';
  END IF;
  WITH targets AS (
    SELECT DISTINCT outcome.id AS outcome_id FROM public.institution_study_program_items item
    JOIN public.institution_study_program_item_executions execution
      ON execution.program_id=item.program_id AND execution.position=item.position
      AND execution.status='completed'
    JOIN public.curriculum_outcomes outcome ON outcome.code=item.outcome_code AND outcome.game=v_program.game
      AND outcome.exam_ref=v_program.display_exam_ref AND outcome.taxonomy_version=v_program.taxonomy_version
    WHERE item.program_id=v_program.id AND item.status='completed' AND item.outcome_code IS NOT NULL
  ), evidence AS (
    SELECT target.outcome_id,mastered.answer_id,mastered.attempt_id,mastered.difficulty_weighted_earned,mastered.difficulty_weighted_possible,answer.answered_at
    FROM targets target LEFT JOIN public.mastery_outcome_evidence mastered ON mastered.outcome_id=target.outcome_id AND mastered.user_id=v_program.student_id
    LEFT JOIN public.session_answers answer ON answer.id=mastered.answer_id AND answer.answered_at>=v_baseline_start AND answer.answered_at<v_current_end
  ), windows AS (
    SELECT outcome_id,count(DISTINCT answer_id) FILTER(WHERE answered_at>=v_baseline_start AND answered_at<v_baseline_end)::integer AS baseline_evidence,
      count(DISTINCT attempt_id) FILTER(WHERE answered_at>=v_baseline_start AND answered_at<v_baseline_end)::integer AS baseline_attempts,
      sum(difficulty_weighted_earned) FILTER(WHERE answered_at>=v_baseline_start AND answered_at<v_baseline_end) AS baseline_earned,
      sum(difficulty_weighted_possible) FILTER(WHERE answered_at>=v_baseline_start AND answered_at<v_baseline_end) AS baseline_possible,
      count(DISTINCT answer_id) FILTER(WHERE answered_at>=v_current_start AND answered_at<v_current_end)::integer AS current_evidence,
      count(DISTINCT attempt_id) FILTER(WHERE answered_at>=v_current_start AND answered_at<v_current_end)::integer AS current_attempts,
      sum(difficulty_weighted_earned) FILTER(WHERE answered_at>=v_current_start AND answered_at<v_current_end) AS current_earned,
      sum(difficulty_weighted_possible) FILTER(WHERE answered_at>=v_current_start AND answered_at<v_current_end) AS current_possible FROM evidence GROUP BY outcome_id
  ), scored AS (SELECT outcome_id,100.0*baseline_earned/baseline_possible baseline_score,100.0*current_earned/current_possible current_score FROM windows
    WHERE baseline_evidence>=3 AND baseline_attempts>=2 AND current_evidence>=3 AND current_attempts>=2 AND baseline_possible>0 AND current_possible>0)
  SELECT (SELECT count(*)::integer FROM targets),count(*)::integer,count(*) FILTER(WHERE current_score>=baseline_score+5 OR (baseline_score>=80 AND current_score>=80))::integer,count(*) FILTER(WHERE current_score<=baseline_score-5)::integer
  INTO v_targeted,v_assessed,v_improved,v_declined FROM scored;
  v_suggestion:=CASE WHEN v_assessed=0 THEN 'insufficient' WHEN v_improved*1.0/v_assessed>=0.60 THEN 'observed_improvement' WHEN v_improved>0 THEN 'mixed_observation' ELSE 'no_observed_improvement' END;
  RETURN jsonb_build_object('modelVersion','institution-program-review-v2','baselineWindowStart',v_baseline_start,'baselineWindowEnd',v_baseline_end,'currentWindowStart',v_current_start,'currentWindowEnd',v_current_end,'targetedOutcomeCount',v_targeted,'assessedOutcomeCount',v_assessed,'improvedOutcomeCount',v_improved,'declinedOutcomeCount',v_declined,'insufficientOutcomeCount',v_targeted-v_assessed,'systemSuggestion',v_suggestion,'causalClaim',false);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_institution_student_diagnostic_sources(
  p_user_id uuid,p_classroom_id uuid,p_member_ref text,p_game text,p_display_exam_ref text,p_window_end timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE
  v_scope jsonb;
  v_student_id uuid;
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_membership public.teacher_classroom_memberships%ROWTYPE;
  v_staff_role text;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_window_end IS NULL
    OR p_member_ref IS NULL OR p_member_ref !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'invalid institution diagnostic analysis request' USING ERRCODE='22023';
  END IF;
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  IF p_window_end IS NULL OR p_window_end>clock_timestamp()+interval '5 minutes' THEN
    RAISE EXCEPTION 'invalid diagnostic analysis window' USING ERRCODE='22023';
  END IF;
  v_scope:=public.institution_scope_capability_snapshot(p_game,p_display_exam_ref,'analysis');
  SELECT * INTO v_classroom FROM public.teacher_classrooms
    WHERE id=p_classroom_id AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'classroom not found' USING ERRCODE='P0002'; END IF;
  SELECT membership.role INTO v_staff_role
  FROM public.pilot_institution_memberships membership
  JOIN public.pilot_institutions institution ON institution.id=membership.institution_id AND institution.status IN ('pilot','active')
  JOIN public.profiles profile ON profile.id=membership.user_id AND profile.deleted_at IS NULL
  WHERE membership.user_id=p_user_id AND membership.institution_id=v_classroom.institution_id
    AND membership.status='active' AND membership.role IN ('manager','teacher');
  IF v_staff_role IS NULL OR (v_staff_role='teacher' AND v_classroom.teacher_id<>p_user_id) THEN
    RAISE EXCEPTION 'institution classroom access required' USING ERRCODE='42501';
  END IF;
  SELECT membership.* INTO v_membership FROM public.teacher_classroom_memberships membership
    JOIN public.profiles profile ON profile.id=membership.student_id AND profile.deleted_at IS NULL
    WHERE membership.classroom_id=p_classroom_id AND membership.member_ref=p_member_ref AND membership.status='active'
      AND NOT public.teacher_classroom_is_blocked(v_classroom.teacher_id,membership.student_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'active classroom member not found' USING ERRCODE='P0002'; END IF;
  IF p_window_end<=v_membership.accepted_at THEN
    RAISE EXCEPTION 'analysis window must follow membership acceptance' USING ERRCODE='22023';
  END IF;
  v_student_id:=v_membership.student_id;
  IF NOT COALESCE((v_scope->>'diagnosticEnabled')::boolean,false) THEN RETURN jsonb_build_object('sources',jsonb_build_array()); END IF;
  RETURN jsonb_build_object('sources',COALESCE((
    SELECT jsonb_agg(jsonb_build_object('outcomeCode',outcome.code,'completedSessionId',state.completed_session_id,'completedAt',session.completed_at,'attempts',state.attempts,'correctAttempts',state.correct_attempts,'score',state.score,'taxonomyVersion',session.taxonomy_version) ORDER BY outcome.sort_order,outcome.code)
    FROM public.user_diagnostic_outcome_state state
    JOIN public.adaptive_diagnostic_sessions session ON session.id=state.completed_session_id AND session.user_id=v_student_id AND session.status='completed'
      AND session.completed_at>=v_membership.accepted_at AND session.completed_at<p_window_end
      AND session.game=v_scope->>'game' AND session.exam_ref=v_scope->>'displayExamRef'
      AND session.question_exam_ref IS NOT DISTINCT FROM v_scope->>'questionExamRef'
      AND session.taxonomy_version=v_scope->>'taxonomyVersion'
    JOIN public.curriculum_outcomes outcome ON outcome.id=state.outcome_id AND outcome.game=v_scope->>'game' AND outcome.exam_ref=v_scope->>'displayExamRef' AND outcome.taxonomy_version=v_scope->>'taxonomyVersion'
    WHERE state.user_id=v_student_id
  ),'[]'::jsonb));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_my_institution_study_programs(
  p_user_id uuid,p_as_of_date date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE
  v_programs jsonb;
  v_today date := (pg_catalog.clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date;
BEGIN
  IF p_user_id IS NULL OR p_as_of_date IS NULL OR p_as_of_date<v_today-7 OR p_as_of_date>v_today+1 THEN
    RAISE EXCEPTION 'invalid student study program scope' USING ERRCODE='22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'student study program actor mismatch' USING ERRCODE='42501'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'programRef',program.program_ref,'classroomName',classroom.name,'teacherAlias',public.teacher_classroom_safe_alias(program.teacher_id),
    'weekStart',program.week_start,'dailyMinuteLimit',program.daily_minute_limit,'modelVersion',program.model_version,'publishedAt',program.published_at,
    'items',(SELECT jsonb_agg(jsonb_build_object(
      'position',item.position,'scheduledDate',item.scheduled_date,'taskType',item.task_type,'title',item.title,
      'reasonCode',item.reason_code,'outcomeCode',item.outcome_code,'durationMinutes',item.duration_minutes,
      'targetQuestionCount',item.target_question_count,'status',item.status,
      'canStart',item.status='pending' AND item.scheduled_date<=p_as_of_date
        AND item.task_type IN ('verified_questions','diagnostic')
        AND item.outcome_code IS NOT NULL
        AND COALESCE(item.target_question_count BETWEEN 1 AND 10,false)
    ) ORDER BY item.position) FROM public.institution_study_program_items item WHERE item.program_id=program.id)
  ) ORDER BY classroom.name,program.week_start),'[]'::jsonb) INTO v_programs
  FROM public.institution_study_programs program
  JOIN public.teacher_classrooms classroom ON classroom.id=program.classroom_id AND classroom.status='active'
  JOIN public.pilot_institutions institution ON institution.id=program.institution_id AND public.institution_pilot_is_operational(institution.id)
  JOIN public.teacher_classroom_memberships membership ON membership.id=program.membership_id AND membership.classroom_id=program.classroom_id AND membership.student_id=p_user_id AND membership.status='active'
  JOIN public.profiles profile ON profile.id=p_user_id AND profile.deleted_at IS NULL
  WHERE program.student_id=p_user_id AND program.status IN ('published','completed') AND program.published_at IS NOT NULL
    AND p_as_of_date>=program.week_start AND p_as_of_date<program.week_start+7
    AND NOT public.teacher_classroom_is_blocked(classroom.teacher_id,p_user_id);
  RETURN jsonb_build_object('asOfDate',p_as_of_date,'programs',v_programs);
END;
$fn$;

-- Preserve the v2 multi-scope shape while replacing its publication-only
-- review flag with the execution-backed Istanbul-day gate.
CREATE OR REPLACE FUNCTION public.get_institution_student_program_history_v2(
  p_user_id uuid,p_classroom_id uuid,p_member_ref text,p_game text,p_display_exam_ref text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_membership public.teacher_classroom_memberships%ROWTYPE;
  v_scope jsonb;
  v_programs jsonb;
  v_today date := (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_member_ref IS NULL OR p_member_ref !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'invalid institution program history scope' USING ERRCODE='22023';
  END IF;
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  v_scope:=public.institution_scope_capability_snapshot(p_game,p_display_exam_ref,'program');
  SELECT * INTO v_classroom FROM public.teacher_classrooms
    WHERE id=p_classroom_id AND teacher_id=p_user_id AND status='active';
  IF NOT FOUND OR NOT public.institution_pilot_has_role(p_user_id,v_classroom.institution_id,ARRAY['manager','teacher']::text[]) THEN
    RAISE EXCEPTION 'assigned institution teacher required' USING ERRCODE='42501';
  END IF;
  SELECT membership.* INTO v_membership FROM public.teacher_classroom_memberships membership
    JOIN public.profiles profile ON profile.id=membership.student_id AND profile.deleted_at IS NULL
    WHERE membership.classroom_id=p_classroom_id AND membership.member_ref=p_member_ref AND membership.status='active';
  IF NOT FOUND OR public.teacher_classroom_is_blocked(p_user_id,v_membership.student_id) THEN
    RAISE EXCEPTION 'active classroom member not found' USING ERRCODE='P0002';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'programRef',scoped.program_ref,
    'scope',jsonb_build_object('game',scoped.game,'examRef',scoped.display_exam_ref,'questionExamRef',scoped.question_exam_ref,'taxonomyVersion',scoped.taxonomy_version,'scopePolicyVersion',scoped.scope_policy_version),
    'status',scoped.status,'weekStart',scoped.week_start,'itemCount',scoped.item_count,'publishedAt',scoped.published_at,
    'reviewEligible',scoped.review_eligible,
    'review',CASE WHEN scoped.review_ref IS NULL THEN NULL ELSE jsonb_build_object('reviewRef',scoped.review_ref,'teacherResult',scoped.teacher_result,'systemSuggestion',scoped.system_suggestion,'evidence',scoped.evidence,'note',scoped.note,'reviewedAt',scoped.reviewed_at) END
  ) ORDER BY scoped.week_start DESC),'[]'::jsonb) INTO v_programs
  FROM (
    SELECT program.program_ref,program.game,program.display_exam_ref,program.question_exam_ref,program.taxonomy_version,program.scope_policy_version,program.status,program.week_start,program.item_count,program.published_at,
      public.institution_study_program_review_ready(program.id,v_today) AS review_eligible,
      review.review_ref,review.teacher_result,review.system_suggestion,review.evidence,review.note,review.reviewed_at
    FROM public.institution_study_programs program
    LEFT JOIN public.institution_study_program_reviews review ON review.program_id=program.id
    WHERE program.institution_id=v_classroom.institution_id AND program.classroom_id=p_classroom_id
      AND program.membership_id=v_membership.id AND program.student_id=v_membership.student_id AND program.teacher_id=p_user_id
      AND program.game=v_scope->>'game' AND program.display_exam_ref=v_scope->>'displayExamRef'
      AND program.question_exam_ref IS NOT DISTINCT FROM NULLIF(v_scope->>'questionExamRef','')
      AND program.taxonomy_version=v_scope->>'taxonomyVersion' AND program.scope_policy_version=v_scope->>'scopePolicyVersion'
      AND program.status IN ('published','completed')
    ORDER BY program.week_start DESC LIMIT 8
  ) scoped;
  RETURN jsonb_build_object('scope',jsonb_build_object('game',v_scope->>'game','examRef',v_scope->>'displayExamRef','questionExamRef',v_scope->'questionExamRef','taxonomyVersion',v_scope->>'taxonomyVersion','scopePolicyVersion',v_scope->>'scopePolicyVersion'),'programs',v_programs);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.preview_institution_study_program_review(
  p_user_id uuid,p_program_ref text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_program public.institution_study_programs%ROWTYPE;
  v_today date := (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date;
BEGIN
  IF p_user_id IS NULL OR p_program_ref IS NULL OR p_program_ref!~'^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'invalid institution program review preview' USING ERRCODE='22023';
  END IF;
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution program review actor mismatch' USING ERRCODE='42501';
  END IF;
  SELECT program.* INTO v_program
  FROM public.institution_study_programs program
  JOIN public.teacher_classroom_memberships membership
    ON membership.id=program.membership_id AND membership.classroom_id=program.classroom_id
    AND membership.student_id=program.student_id AND membership.status='active'
  JOIN public.teacher_classrooms classroom
    ON classroom.id=program.classroom_id AND classroom.institution_id=program.institution_id
    AND classroom.status='active'
  JOIN public.pilot_institutions institution
    ON institution.id=program.institution_id AND public.institution_pilot_is_operational(institution.id)
  JOIN public.profiles profile ON profile.id=program.student_id AND profile.deleted_at IS NULL
  WHERE program.program_ref=p_program_ref AND program.teacher_id=p_user_id AND program.status='published'
    AND NOT public.teacher_classroom_is_blocked(classroom.teacher_id,program.student_id);
  IF NOT FOUND OR NOT public.institution_pilot_has_role(p_user_id,v_program.institution_id,ARRAY['manager','teacher']::text[]) THEN
    RAISE EXCEPTION 'published teacher program not found' USING ERRCODE='P0002';
  END IF;
  IF NOT public.institution_study_program_review_ready(v_program.id,v_today) THEN
    RAISE EXCEPTION 'program review requires a mature completed execution' USING ERRCODE='22023';
  END IF;
  RETURN public.institution_study_program_review_evidence(v_program.id);
END;
$fn$;

-- The 160 wrapper previously delegated directly to a legacy body. Check the
-- replay ledger first; otherwise enforce the execution-backed gate before
-- delegating, with the legacy calendar expression evaluated in Istanbul too.
CREATE OR REPLACE FUNCTION public.review_institution_study_program(
  p_user_id uuid,p_program_ref text,p_teacher_result text,p_note text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE
  v_program public.institution_study_programs%ROWTYPE;
  v_has_replay boolean := false;
  v_today date := (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_program_ref IS NULL OR p_program_ref!~'^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'invalid institution program review' USING ERRCODE='22023';
  END IF;
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution program review actor mismatch' USING ERRCODE='42501';
  END IF;
  SELECT program.* INTO v_program
  FROM public.institution_study_programs program
  JOIN public.teacher_classroom_memberships membership
    ON membership.id=program.membership_id AND membership.classroom_id=program.classroom_id
    AND membership.student_id=program.student_id AND membership.status='active'
  JOIN public.teacher_classrooms classroom
    ON classroom.id=program.classroom_id AND classroom.institution_id=program.institution_id
    AND classroom.status='active'
  JOIN public.pilot_institutions institution
    ON institution.id=program.institution_id AND public.institution_pilot_is_operational(institution.id)
  JOIN public.profiles profile ON profile.id=program.student_id AND profile.deleted_at IS NULL
  WHERE program.program_ref=p_program_ref AND program.teacher_id=p_user_id
    AND program.status IN ('published','completed')
    AND NOT public.teacher_classroom_is_blocked(classroom.teacher_id,program.student_id)
  FOR UPDATE OF program;
  IF NOT FOUND OR NOT public.institution_pilot_has_role(p_user_id,v_program.institution_id,ARRAY['manager','teacher']::text[]) THEN
    RAISE EXCEPTION 'published teacher program not found' USING ERRCODE='P0002';
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.pilot_institution_requests request
    WHERE request.user_id=p_user_id AND request.operation='review_study_program' AND request.request_id=p_request_id)
  INTO v_has_replay;
  IF NOT v_has_replay THEN
    IF v_program.status<>'published' THEN
      RAISE EXCEPTION 'published teacher program not found' USING ERRCODE='P0002';
    END IF;
    IF NOT public.institution_study_program_review_ready(v_program.id,v_today) THEN
      RAISE EXCEPTION 'program review requires a mature completed execution' USING ERRCODE='22023';
    END IF;
  END IF;
  PERFORM set_config('TimeZone','Europe/Istanbul',true);
  RETURN public.free_pilot_legacy_program_review(p_user_id,p_program_ref,p_teacher_result,p_note,p_request_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.institution_program_reconciliation_immutable(),public.assert_institution_program_startable(uuid),public.enforce_institution_program_startable(),public.institution_program_execution_immutable_fields(),public.institution_study_program_review_ready(uuid,date),public.institution_program_start_target(text,text,text,text,text),public.start_my_institution_study_program_item(uuid,text,smallint,uuid),public.complete_institution_program_item_from_verified_attempt(),public.complete_institution_program_item_from_diagnostic(),public.get_institution_student_diagnostic_sources(uuid,uuid,text,text,text,timestamptz),public.get_my_institution_study_programs(uuid,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.start_my_institution_study_program_item(uuid,text,smallint,uuid),public.get_institution_student_diagnostic_sources(uuid,uuid,text,text,text,timestamptz),public.get_my_institution_study_programs(uuid,date),public.get_institution_student_program_history_v2(uuid,uuid,text,text,text),public.preview_institution_study_program_review(uuid,text),public.review_institution_study_program(uuid,text,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_institution_student_diagnostic_sources(uuid,uuid,text,text,text,timestamptz) TO authenticated;

-- Migration-local release gate.  A privilege or trigger regression must abort
-- this transaction rather than leave production in a partially safe state.
DO $postcheck$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('institution_study_program_item_executions'::text),
      ('institution_program_item_reconciliations'::text)
    ) AS expected(relname)
    LEFT JOIN pg_catalog.pg_class relation
      ON relation.oid=pg_catalog.to_regclass('public.'||expected.relname)
    WHERE relation.oid IS NULL OR NOT relation.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'migration 201 postcheck failed: private execution tables need RLS'
      USING ERRCODE='23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES ('public'::text),('anon'::text),('authenticated'::text),('service_role'::text)) AS role_name(value)
    CROSS JOIN (VALUES
      ('public.institution_study_program_item_executions'::text),
      ('public.institution_program_item_reconciliations'::text)
    ) AS relation_name(value)
    CROSS JOIN (VALUES
      ('SELECT'::text),('INSERT'::text),('UPDATE'::text),('DELETE'::text),
      ('TRUNCATE'::text),('REFERENCES'::text),('TRIGGER'::text)
    ) AS privilege_name(value)
    WHERE pg_catalog.has_table_privilege(
      role_name.value,relation_name.value,privilege_name.value
    )
  ) THEN
    RAISE EXCEPTION 'migration 201 postcheck failed: private execution table grant leaked'
      USING ERRCODE='23514';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
      'service_role','public.start_my_institution_study_program_item(uuid,text,smallint,uuid)','EXECUTE'
    ) OR pg_catalog.has_function_privilege(
      'public','public.start_my_institution_study_program_item(uuid,text,smallint,uuid)','EXECUTE'
    ) OR pg_catalog.has_function_privilege(
      'anon','public.start_my_institution_study_program_item(uuid,text,smallint,uuid)','EXECUTE'
    ) OR pg_catalog.has_function_privilege(
      'authenticated','public.start_my_institution_study_program_item(uuid,text,smallint,uuid)','EXECUTE'
    ) OR NOT pg_catalog.has_function_privilege(
      'service_role','public.get_my_institution_study_programs(uuid,date)','EXECUTE'
    ) OR pg_catalog.has_function_privilege(
      'public','public.get_my_institution_study_programs(uuid,date)','EXECUTE'
    ) OR pg_catalog.has_function_privilege(
      'anon','public.get_my_institution_study_programs(uuid,date)','EXECUTE'
    ) OR pg_catalog.has_function_privilege(
      'authenticated','public.get_my_institution_study_programs(uuid,date)','EXECUTE'
    ) THEN
    RAISE EXCEPTION 'migration 201 postcheck failed: student program RPC ACL mismatch'
      USING ERRCODE='23514';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
      'authenticated','public.get_institution_student_diagnostic_sources(uuid,uuid,text,text,text,timestamptz)','EXECUTE'
    ) OR NOT pg_catalog.has_function_privilege(
      'service_role','public.get_institution_student_diagnostic_sources(uuid,uuid,text,text,text,timestamptz)','EXECUTE'
    ) OR pg_catalog.has_function_privilege(
      'public','public.get_institution_student_diagnostic_sources(uuid,uuid,text,text,text,timestamptz)','EXECUTE'
    ) OR pg_catalog.has_function_privilege(
      'anon','public.get_institution_student_diagnostic_sources(uuid,uuid,text,text,text,timestamptz)','EXECUTE'
    ) THEN
    RAISE EXCEPTION 'migration 201 postcheck failed: diagnostic source RPC ACL mismatch'
      USING ERRCODE='23514';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
      'service_role','public.get_institution_student_reports_v2(uuid,uuid,text,text,text)','EXECUTE'
    ) OR pg_catalog.has_function_privilege(
      'public','public.get_institution_student_reports_v2(uuid,uuid,text,text,text)','EXECUTE'
    ) OR pg_catalog.has_function_privilege(
      'anon','public.get_institution_student_reports_v2(uuid,uuid,text,text,text)','EXECUTE'
    ) OR pg_catalog.has_function_privilege(
      'authenticated','public.get_institution_student_reports_v2(uuid,uuid,text,text,text)','EXECUTE'
    ) OR pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(
        'public.get_institution_student_reports_v2(uuid,uuid,text,text,text)'::pg_catalog.regprocedure
      ),
      'profile.deleted_at IS NULL'
    )=0 THEN
    RAISE EXCEPTION 'migration 201 postcheck failed: tombstoned report reader boundary mismatch'
      USING ERRCODE='23514';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_trigger AS pg_trigger_row
    JOIN pg_catalog.pg_class relation ON relation.oid=pg_trigger_row.tgrelid
    JOIN pg_catalog.pg_proc AS pg_function ON pg_function.oid=pg_trigger_row.tgfoid
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='public' AND NOT pg_trigger_row.tgisinternal AND (
      (relation.relname='verified_attempts'
        AND pg_trigger_row.tgname='zzz_institution_program_verified_attempt_completion'
        AND pg_function.proname='complete_institution_program_item_from_verified_attempt')
      OR (relation.relname='adaptive_diagnostic_sessions'
        AND pg_trigger_row.tgname='institution_program_diagnostic_completion'
        AND pg_function.proname='complete_institution_program_item_from_diagnostic')
      OR (relation.relname='institution_program_item_reconciliations'
        AND pg_trigger_row.tgname='institution_program_reconciliation_immutable'
        AND pg_function.proname='institution_program_reconciliation_immutable')
      OR (relation.relname='institution_study_programs'
        AND pg_trigger_row.tgname='institution_program_startable_contract'
        AND pg_function.proname='enforce_institution_program_startable'
        AND pg_trigger_row.tgdeferrable AND pg_trigger_row.tginitdeferred)
      OR (relation.relname='institution_study_program_items'
        AND pg_trigger_row.tgname='institution_program_item_startable_contract'
        AND pg_function.proname='enforce_institution_program_startable'
        AND pg_trigger_row.tgdeferrable AND pg_trigger_row.tginitdeferred)
    )
  )<>5 THEN
    RAISE EXCEPTION 'migration 201 postcheck failed: completion/reconciliation trigger mismatch'
      USING ERRCODE='23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.institution_study_programs program
    JOIN public.institution_study_program_items item ON item.program_id=program.id
    WHERE program.status='published' AND item.status='pending' AND item.task_type='diagnostic'
    GROUP BY program.id
    HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'migration 201 postcheck failed: duplicate published diagnostics remain'
      USING ERRCODE='23514';
  END IF;

  PERFORM public.assert_institution_program_startable(program.id)
  FROM public.institution_study_programs AS program
  WHERE program.status='published';
END;
$postcheck$;

NOTIFY pgrst,'reload schema';
COMMIT;
