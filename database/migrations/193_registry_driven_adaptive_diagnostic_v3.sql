-- Migration 193: registry-driven, versioned adaptive screening contracts.
--
-- This migration generalizes the database boundary without publishing a new
-- subject.  The already-proven TYT Mathematics pilot is the only released
-- blueprint.  Every future scope needs its own forward proof migration which
-- inserts a new immutable blueprint after the curriculum and candidate gates
-- are clean.
-- Prerequisites: 098 session/evidence tables, 140 revision snapshots, 178
-- release registry/integrity, and 184 registry write-gate triggers.
--
-- Emergency disable is data-only and reversible: set the exact registry row's
-- diagnostic_enabled=false.  Schema rollback is deliberately not provided;
-- follow-up changes must be forward migrations so historical session/evidence
-- snapshots remain readable.

BEGIN;

CREATE TABLE IF NOT EXISTS public.adaptive_diagnostic_blueprints (
  blueprint_version text PRIMARY KEY
    CHECK (blueprint_version ~ '^ba-[a-z0-9-]+-diagnostic-v[0-9]+$'),
  game varchar(20) NOT NULL,
  display_exam_ref varchar(20) NOT NULL
    CHECK (display_exam_ref ~ '^[A-Z0-9-]{2,10}$'),
  question_exam_ref varchar(20)
    CHECK (question_exam_ref IS NULL OR question_exam_ref ~ '^[A-Z0-9-]{2,10}$'),
  taxonomy_version text NOT NULL
    CHECK (taxonomy_version ~ '^ba-[a-z0-9-]+-v[0-9]+$'),
  policy_version text NOT NULL
    CHECK (policy_version ~ '^[a-z0-9-]+-v[0-9]+$'),
  question_count smallint NOT NULL CHECK (question_count BETWEEN 1 AND 50),
  outcome_count smallint NOT NULL CHECK (outcome_count BETWEEN 1 AND 50),
  max_per_outcome smallint NOT NULL CHECK (max_per_outcome BETWEEN 1 AND 10),
  candidate_gate_version text NOT NULL DEFAULT 'exact-single-outcome-v1'
    CHECK (candidate_gate_version ~ '^[a-z0-9-]+-v[0-9]+$'),
  requires_revision_snapshot boolean NOT NULL DEFAULT true
    CHECK (requires_revision_snapshot),
  capability_status text NOT NULL DEFAULT 'draft'
    CHECK (capability_status IN ('draft','validating','released','retired')),
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT adaptive_diagnostic_blueprint_capacity_check CHECK (
    question_count >= outcome_count
    AND question_count <= outcome_count * max_per_outcome
  ),
  CONSTRAINT adaptive_diagnostic_blueprint_release_check CHECK (
    capability_status <> 'released' OR released_at IS NOT NULL
  ),
  CONSTRAINT adaptive_diagnostic_blueprint_scope_fkey
    FOREIGN KEY (game,display_exam_ref)
    REFERENCES public.curriculum_scope_releases(game,display_exam_ref)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS adaptive_diagnostic_one_released_blueprint_idx
  ON public.adaptive_diagnostic_blueprints(game,display_exam_ref)
  WHERE capability_status='released';
CREATE UNIQUE INDEX IF NOT EXISTS adaptive_diagnostic_blueprint_exact_scope_uidx
  ON public.adaptive_diagnostic_blueprints(
    game,display_exam_ref,COALESCE(question_exam_ref,'__NULL__'),taxonomy_version,policy_version
  );

ALTER TABLE public.adaptive_diagnostic_blueprints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.adaptive_diagnostic_blueprints
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.tg_adaptive_diagnostic_blueprint_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.capability_status IN ('released','retired') THEN
      RAISE EXCEPTION 'released diagnostic blueprints are immutable'
        USING ERRCODE='42501';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.capability_status IN ('released','retired') AND (
    NEW.blueprint_version IS DISTINCT FROM OLD.blueprint_version
    OR NEW.game IS DISTINCT FROM OLD.game
    OR NEW.display_exam_ref IS DISTINCT FROM OLD.display_exam_ref
    OR NEW.question_exam_ref IS DISTINCT FROM OLD.question_exam_ref
    OR NEW.taxonomy_version IS DISTINCT FROM OLD.taxonomy_version
    OR NEW.policy_version IS DISTINCT FROM OLD.policy_version
    OR NEW.question_count IS DISTINCT FROM OLD.question_count
    OR NEW.outcome_count IS DISTINCT FROM OLD.outcome_count
    OR NEW.max_per_outcome IS DISTINCT FROM OLD.max_per_outcome
    OR NEW.candidate_gate_version IS DISTINCT FROM OLD.candidate_gate_version
    OR NEW.requires_revision_snapshot IS DISTINCT FROM OLD.requires_revision_snapshot
    OR NEW.released_at IS DISTINCT FROM OLD.released_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.capability_status NOT IN (OLD.capability_status,'retired')
  ) THEN
    RAISE EXCEPTION 'released diagnostic blueprint fields are immutable'
      USING ERRCODE='42501';
  END IF;

  IF OLD.capability_status='retired' AND NEW.capability_status<>'retired' THEN
    RAISE EXCEPTION 'retired diagnostic blueprints cannot be reactivated'
      USING ERRCODE='42501';
  END IF;
  NEW.updated_at:=clock_timestamp();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_adaptive_diagnostic_blueprint_immutable
  ON public.adaptive_diagnostic_blueprints;
CREATE TRIGGER trg_adaptive_diagnostic_blueprint_immutable
  BEFORE UPDATE OR DELETE ON public.adaptive_diagnostic_blueprints
  FOR EACH ROW EXECUTE FUNCTION public.tg_adaptive_diagnostic_blueprint_immutable();

-- The gate reports capacity after limiting each outcome to the blueprint's
-- maximum.  A large pile of questions in one category can therefore never
-- hide an empty or under-supplied outcome.
CREATE OR REPLACE FUNCTION public.adaptive_diagnostic_scope_integrity(
  p_game text,
  p_display_exam_ref text,
  p_blueprint_version text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_blueprint public.adaptive_diagnostic_blueprints%ROWTYPE;
  v_curriculum jsonb;
  v_actual_outcome_count integer;
  v_eligible_question_count integer;
  v_candidate_capacity integer;
  v_empty_candidate_outcome integer;
  v_clean boolean;
BEGIN
  SELECT blueprint.* INTO v_blueprint
  FROM public.adaptive_diagnostic_blueprints AS blueprint
  JOIN public.curriculum_scope_releases AS scope
    ON scope.game=blueprint.game
   AND scope.display_exam_ref=blueprint.display_exam_ref
   AND scope.question_exam_ref IS NOT DISTINCT FROM blueprint.question_exam_ref
   AND scope.taxonomy_version=blueprint.taxonomy_version
  WHERE blueprint.blueprint_version=btrim(p_blueprint_version)
    AND blueprint.game=lower(btrim(p_game))
    AND blueprint.display_exam_ref=upper(btrim(p_display_exam_ref));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'diagnostic blueprint is not registered for the exact scope'
      USING ERRCODE='P0002';
  END IF;

  v_curriculum:=public.curriculum_scope_integrity(
    v_blueprint.game,v_blueprint.display_exam_ref,v_blueprint.taxonomy_version
  );

  WITH scope_outcomes AS (
    SELECT outcome.id
    FROM public.curriculum_outcomes AS outcome
    JOIN public.curriculum_nodes AS node ON node.id=outcome.node_id
    WHERE outcome.is_active
      AND node.is_active
      AND node.node_type='outcome'
      AND outcome.game=v_blueprint.game
      AND upper(COALESCE(outcome.exam_ref,''))=v_blueprint.display_exam_ref
      AND outcome.taxonomy_version=v_blueprint.taxonomy_version
      AND node.game IS NOT DISTINCT FROM outcome.game
      AND node.exam_ref IS NOT DISTINCT FROM outcome.exam_ref
      AND node.taxonomy_version IS NOT DISTINCT FROM outcome.taxonomy_version
      AND node.category IS NOT DISTINCT FROM outcome.category
  ), exact_question AS (
    SELECT question.id,
      min(outcome.id::text)::uuid AS outcome_id
    FROM public.questions AS question
    JOIN public.question_outcomes AS mapping
      ON mapping.question_id=question.id
     AND mapping.is_primary
     AND mapping.mapping_source='taxonomy_auto'
    JOIN public.curriculum_outcomes AS outcome ON outcome.id=mapping.outcome_id
    JOIN public.curriculum_nodes AS node ON node.id=outcome.node_id
    JOIN public.question_content_revisions AS revision
      ON revision.id=question.published_revision_id
     AND revision.question_id=question.id
     AND revision.status='published'
     AND revision.game IS NOT DISTINCT FROM question.game::text
     AND revision.category IS NOT DISTINCT FROM question.category::text
     AND revision.difficulty IS NOT DISTINCT FROM question.difficulty
     AND (
       (v_blueprint.question_exam_ref IS NOT NULL
         AND NULLIF(upper(btrim(COALESCE(revision.exam_ref,''))),'')
           IS NOT DISTINCT FROM v_blueprint.question_exam_ref)
       OR (v_blueprint.question_exam_ref IS NULL AND (
         NULLIF(upper(btrim(COALESCE(revision.exam_ref,''))),'') IS NULL
         OR upper(btrim(revision.exam_ref))=v_blueprint.display_exam_ref
       ))
     )
    WHERE question.is_active
      AND question.game=v_blueprint.game
      AND NULLIF(upper(btrim(COALESCE(question.exam_ref,''))),'')
        IS NOT DISTINCT FROM v_blueprint.question_exam_ref
      AND outcome.is_active
      AND node.is_active
      AND node.node_type='outcome'
      AND outcome.game=v_blueprint.game
      AND upper(COALESCE(outcome.exam_ref,''))=v_blueprint.display_exam_ref
      AND outcome.taxonomy_version=v_blueprint.taxonomy_version
      AND outcome.category IS NOT DISTINCT FROM question.category::text
      AND node.game IS NOT DISTINCT FROM outcome.game
      AND node.exam_ref IS NOT DISTINCT FROM outcome.exam_ref
      AND node.taxonomy_version IS NOT DISTINCT FROM outcome.taxonomy_version
      AND node.category IS NOT DISTINCT FROM outcome.category
      AND revision.content_sha256 IS NOT NULL
      AND btrim(revision.content_sha256)<>''
      AND CASE WHEN jsonb_typeof(revision.content->'options')='array'
        THEN jsonb_array_length(revision.content->'options') BETWEEN 2 AND 10
        ELSE false END
      AND CASE WHEN COALESCE(revision.content->>'answer','') ~ '^[0-9]{1,2}$'
        AND jsonb_typeof(revision.content->'options')='array'
        THEN (revision.content->>'answer')::integer
          BETWEEN 0 AND jsonb_array_length(revision.content->'options')-1
        ELSE false END
    GROUP BY question.id,question.category
    HAVING count(DISTINCT outcome.id)=1
      AND bool_and(outcome.category IS NOT DISTINCT FROM question.category::text)
  ), coverage AS (
    SELECT outcome.id,count(DISTINCT question.id)::integer AS candidate_count
    FROM scope_outcomes AS outcome
    LEFT JOIN exact_question AS question ON question.outcome_id=outcome.id
    GROUP BY outcome.id
  )
  SELECT
    (SELECT count(*)::integer FROM scope_outcomes),
    COALESCE(sum(coverage.candidate_count),0)::integer,
    COALESCE(sum(least(coverage.candidate_count,v_blueprint.max_per_outcome)),0)::integer,
    count(*) FILTER (WHERE coverage.candidate_count=0)::integer
  INTO v_actual_outcome_count,v_eligible_question_count,
    v_candidate_capacity,v_empty_candidate_outcome
  FROM coverage;

  v_clean:=v_curriculum IS NOT NULL
    AND jsonb_typeof(v_curriculum)='object'
    AND COALESCE((v_curriculum->>'total')::integer,0)>0
    AND COALESCE((v_curriculum->>'mapped')::integer,-1)=(v_curriculum->>'total')::integer
    AND COALESCE((v_curriculum->>'unmapped')::integer,-1)=0
    AND COALESCE((v_curriculum->>'scopeMismatch')::integer,-1)=0
    AND COALESCE((v_curriculum->>'nodeOrphan')::integer,-1)=0
    AND COALESCE((v_curriculum->>'outcomeOrphan')::integer,-1)=0
    AND COALESCE((v_curriculum->>'primaryMismatch')::integer,-1)=0
    AND COALESCE((v_curriculum->>'emptyOutcome')::integer,-1)=0
    AND v_actual_outcome_count=v_blueprint.outcome_count
    AND v_empty_candidate_outcome=0
    AND v_candidate_capacity>=v_blueprint.question_count;

  RETURN jsonb_build_object(
    'clean',v_clean,
    'curriculum',v_curriculum,
    'outcomeCount',v_actual_outcome_count,
    'expectedOutcomeCount',v_blueprint.outcome_count,
    'eligibleQuestionCount',v_eligible_question_count,
    'candidateCapacity',v_candidate_capacity,
    'requiredQuestionCount',v_blueprint.question_count,
    'emptyCandidateOutcome',v_empty_candidate_outcome
  );
END
$fn$;

-- Seed only the capability which was already live and independently proven.
INSERT INTO public.adaptive_diagnostic_blueprints(
  blueprint_version,game,display_exam_ref,question_exam_ref,taxonomy_version,
  policy_version,question_count,outcome_count,max_per_outcome,
  candidate_gate_version,requires_revision_snapshot,capability_status,released_at
)
SELECT
  'ba-tyt-math-diagnostic-v1','matematik','TYT','TYT','ba-tyt-math-v1',
  'adaptive-screening-v1',10,6,2,
  'exact-single-outcome-v1',true,'validating',NULL
FROM public.curriculum_scope_releases AS scope
WHERE scope.game='matematik'
  AND scope.display_exam_ref='TYT'
  AND scope.question_exam_ref='TYT'
  AND scope.taxonomy_version='ba-tyt-math-v1'
  AND scope.release_status='released'
  AND scope.diagnostic_enabled
ON CONFLICT (blueprint_version) DO NOTHING;

DO $fn$
DECLARE
  v_blueprint public.adaptive_diagnostic_blueprints%ROWTYPE;
  v_integrity jsonb;
BEGIN
  SELECT * INTO v_blueprint
  FROM public.adaptive_diagnostic_blueprints
  WHERE blueprint_version='ba-tyt-math-diagnostic-v1'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'released TYT Mathematics diagnostic prerequisite is missing'
      USING ERRCODE='55000';
  END IF;
  IF v_blueprint.game<>'matematik'
    OR v_blueprint.display_exam_ref<>'TYT'
    OR v_blueprint.question_exam_ref IS DISTINCT FROM 'TYT'
    OR v_blueprint.taxonomy_version<>'ba-tyt-math-v1'
    OR v_blueprint.policy_version<>'adaptive-screening-v1'
    OR v_blueprint.question_count<>10
    OR v_blueprint.outcome_count<>6
    OR v_blueprint.max_per_outcome<>2
    OR NOT v_blueprint.requires_revision_snapshot THEN
    RAISE EXCEPTION 'TYT Mathematics diagnostic blueprint drifted from its proof'
      USING ERRCODE='23514';
  END IF;

  IF v_blueprint.capability_status='validating' THEN
    v_integrity:=public.adaptive_diagnostic_scope_integrity(
      v_blueprint.game,v_blueprint.display_exam_ref,v_blueprint.blueprint_version
    );
    IF NOT COALESCE((v_integrity->>'clean')::boolean,false) THEN
      RAISE EXCEPTION 'TYT Mathematics diagnostic blueprint failed integrity: %',v_integrity
        USING ERRCODE='23514';
    END IF;
    UPDATE public.adaptive_diagnostic_blueprints
    SET capability_status='released',released_at=clock_timestamp(),updated_at=clock_timestamp()
    WHERE blueprint_version=v_blueprint.blueprint_version
      AND capability_status='validating';
  END IF;
END
$fn$;

-- Existing exam_ref is the display-exam snapshot.  Keep the column name for
-- application compatibility and add the distinct question-storage scope.
COMMENT ON COLUMN public.adaptive_diagnostic_sessions.exam_ref IS
  'Immutable display_exam_ref snapshot; question_exam_ref stores question-bank semantics.';

ALTER TABLE public.adaptive_diagnostic_sessions
  ADD COLUMN IF NOT EXISTS question_exam_ref text,
  ADD COLUMN IF NOT EXISTS diagnostic_blueprint_version text,
  ADD COLUMN IF NOT EXISTS policy_version text,
  ADD COLUMN IF NOT EXISTS question_count smallint,
  ADD COLUMN IF NOT EXISTS outcome_count smallint,
  ADD COLUMN IF NOT EXISTS max_per_outcome smallint;

UPDATE public.adaptive_diagnostic_sessions
SET question_exam_ref='TYT',
    diagnostic_blueprint_version='ba-tyt-math-diagnostic-v1',
    policy_version='adaptive-screening-v1',
    question_count=10,
    outcome_count=6,
    max_per_outcome=2
WHERE question_exam_ref IS NULL
   OR diagnostic_blueprint_version IS NULL
   OR policy_version IS NULL
   OR question_count IS NULL
   OR outcome_count IS NULL
   OR max_per_outcome IS NULL;

ALTER TABLE public.adaptive_diagnostic_sessions
  ALTER COLUMN question_exam_ref SET DEFAULT 'TYT',
  ALTER COLUMN diagnostic_blueprint_version SET DEFAULT 'ba-tyt-math-diagnostic-v1',
  ALTER COLUMN diagnostic_blueprint_version SET NOT NULL,
  ALTER COLUMN policy_version SET DEFAULT 'adaptive-screening-v1',
  ALTER COLUMN policy_version SET NOT NULL,
  ALTER COLUMN question_count SET DEFAULT 10,
  ALTER COLUMN question_count SET NOT NULL,
  ALTER COLUMN outcome_count SET DEFAULT 6,
  ALTER COLUMN outcome_count SET NOT NULL,
  ALTER COLUMN max_per_outcome SET DEFAULT 2,
  ALTER COLUMN max_per_outcome SET NOT NULL;

ALTER TABLE public.adaptive_diagnostic_sessions
  DROP CONSTRAINT IF EXISTS adaptive_diagnostic_sessions_game_check,
  DROP CONSTRAINT IF EXISTS adaptive_diagnostic_sessions_exam_ref_check,
  DROP CONSTRAINT IF EXISTS adaptive_diagnostic_sessions_taxonomy_version_check,
  DROP CONSTRAINT IF EXISTS adaptive_diagnostic_sessions_answered_count_check,
  DROP CONSTRAINT IF EXISTS adaptive_diagnostic_sessions_covered_outcomes_check,
  DROP CONSTRAINT IF EXISTS adaptive_diagnostic_session_state_check,
  DROP CONSTRAINT IF EXISTS adaptive_diagnostic_session_blueprint_fkey;

ALTER TABLE public.adaptive_diagnostic_sessions
  ADD CONSTRAINT adaptive_diagnostic_session_blueprint_fkey
    FOREIGN KEY (diagnostic_blueprint_version)
    REFERENCES public.adaptive_diagnostic_blueprints(blueprint_version)
    ON DELETE RESTRICT,
  ADD CONSTRAINT adaptive_diagnostic_session_scope_snapshot_check CHECK (
    game=lower(btrim(game))
    AND exam_ref=upper(btrim(exam_ref))
    AND (question_exam_ref IS NULL OR question_exam_ref=upper(btrim(question_exam_ref)))
    AND taxonomy_version=btrim(taxonomy_version)
    AND policy_version=btrim(policy_version)
  ),
  ADD CONSTRAINT adaptive_diagnostic_session_dynamic_counter_check CHECK (
    question_count BETWEEN 1 AND 50
    AND outcome_count BETWEEN 1 AND 50
    AND max_per_outcome BETWEEN 1 AND 10
    AND question_count>=outcome_count
    AND question_count<=outcome_count*max_per_outcome
    AND answered_count BETWEEN 0 AND question_count
    AND covered_outcomes BETWEEN 0 AND outcome_count
    AND covered_outcomes<=answered_count
  ),
  ADD CONSTRAINT adaptive_diagnostic_session_state_check CHECK (
    (status='active' AND current_question_id IS NOT NULL AND completed_at IS NULL)
    OR (
      status='completed' AND current_question_id IS NULL AND completed_at IS NOT NULL
      AND covered_outcomes=outcome_count AND answered_count=question_count
    )
    OR (status='abandoned' AND current_question_id IS NULL AND completed_at IS NULL)
  );

ALTER TABLE public.adaptive_diagnostic_answers
  DROP CONSTRAINT IF EXISTS adaptive_diagnostic_answers_sequence_check,
  DROP CONSTRAINT IF EXISTS adaptive_diagnostic_answers_covered_outcomes_after_check;
ALTER TABLE public.adaptive_diagnostic_answers
  ADD CONSTRAINT adaptive_diagnostic_answer_dynamic_counter_check CHECK (
    sequence>=1 AND covered_outcomes_after BETWEEN 1 AND sequence
  );

ALTER TABLE public.user_diagnostic_outcome_state
  DROP CONSTRAINT IF EXISTS user_diagnostic_outcome_state_attempts_check;
ALTER TABLE public.user_diagnostic_outcome_state
  ADD CONSTRAINT user_diagnostic_outcome_state_dynamic_attempts_check CHECK (
    attempts BETWEEN 1 AND 10
  );

CREATE OR REPLACE FUNCTION public.tg_adaptive_diagnostic_session_scope_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.game IS DISTINCT FROM OLD.game
    OR NEW.exam_ref IS DISTINCT FROM OLD.exam_ref
    OR NEW.question_exam_ref IS DISTINCT FROM OLD.question_exam_ref
    OR NEW.taxonomy_version IS DISTINCT FROM OLD.taxonomy_version
    OR NEW.diagnostic_blueprint_version IS DISTINCT FROM OLD.diagnostic_blueprint_version
    OR NEW.policy_version IS DISTINCT FROM OLD.policy_version
    OR NEW.question_count IS DISTINCT FROM OLD.question_count
    OR NEW.outcome_count IS DISTINCT FROM OLD.outcome_count
    OR NEW.max_per_outcome IS DISTINCT FROM OLD.max_per_outcome
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.started_at IS DISTINCT FROM OLD.started_at
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'diagnostic session scope and policy snapshot are immutable'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS aab_adaptive_diagnostic_session_scope_immutable
  ON public.adaptive_diagnostic_sessions;
CREATE TRIGGER aab_adaptive_diagnostic_session_scope_immutable
  BEFORE UPDATE ON public.adaptive_diagnostic_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_adaptive_diagnostic_session_scope_immutable();

CREATE OR REPLACE FUNCTION public.resolve_adaptive_diagnostic_question_v3(
  p_question_id uuid,
  p_game text,
  p_display_exam_ref text,
  p_question_exam_ref text,
  p_taxonomy_version text
) RETURNS TABLE(outcome_id uuid,difficulty smallint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT min(outcome.id::text)::uuid AS outcome_id,
    min(question.difficulty)::smallint AS difficulty
  FROM public.questions AS question
  JOIN public.question_outcomes AS mapping
    ON mapping.question_id=question.id
   AND mapping.is_primary
   AND mapping.mapping_source='taxonomy_auto'
  JOIN public.curriculum_outcomes AS outcome ON outcome.id=mapping.outcome_id
  JOIN public.curriculum_nodes AS node ON node.id=outcome.node_id
  WHERE question.id=p_question_id
    AND question.is_active
    AND question.game=lower(btrim(p_game))
    AND NULLIF(upper(btrim(COALESCE(question.exam_ref,''))),'')
      IS NOT DISTINCT FROM NULLIF(upper(btrim(COALESCE(p_question_exam_ref,''))),'')
    AND outcome.is_active
    AND outcome.game=lower(btrim(p_game))
    AND upper(COALESCE(outcome.exam_ref,''))=upper(btrim(p_display_exam_ref))
    AND outcome.taxonomy_version=btrim(p_taxonomy_version)
    AND outcome.category IS NOT DISTINCT FROM question.category::text
    AND node.is_active
    AND node.node_type='outcome'
    AND node.game IS NOT DISTINCT FROM outcome.game
    AND node.exam_ref IS NOT DISTINCT FROM outcome.exam_ref
    AND node.taxonomy_version IS NOT DISTINCT FROM outcome.taxonomy_version
    AND node.category IS NOT DISTINCT FROM outcome.category
  GROUP BY question.id,question.category
  HAVING count(DISTINCT outcome.id)=1
    AND bool_and(outcome.category IS NOT DISTINCT FROM question.category::text)
$fn$;

CREATE OR REPLACE FUNCTION public.resolve_released_diagnostic_scope(
  p_game text,
  p_display_exam_ref text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_blueprint public.adaptive_diagnostic_blueprints%ROWTYPE;
  v_integrity jsonb;
BEGIN
  SELECT blueprint.* INTO v_blueprint
  FROM public.curriculum_scope_releases AS scope
  JOIN public.adaptive_diagnostic_blueprints AS blueprint
    ON blueprint.game=scope.game
   AND blueprint.display_exam_ref=scope.display_exam_ref
   AND blueprint.question_exam_ref IS NOT DISTINCT FROM scope.question_exam_ref
   AND blueprint.taxonomy_version=scope.taxonomy_version
  WHERE scope.game=lower(btrim(p_game))
    AND scope.display_exam_ref=upper(btrim(p_display_exam_ref))
    AND scope.release_status='released'
    AND scope.diagnostic_enabled
    AND blueprint.capability_status='released';
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_integrity:=public.adaptive_diagnostic_scope_integrity(
    v_blueprint.game,v_blueprint.display_exam_ref,v_blueprint.blueprint_version
  );
  IF NOT COALESCE((v_integrity->>'clean')::boolean,false) THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'game',v_blueprint.game,
    'displayExamRef',v_blueprint.display_exam_ref,
    'questionExamRef',v_blueprint.question_exam_ref,
    'taxonomyVersion',v_blueprint.taxonomy_version,
    'policyVersion',v_blueprint.policy_version,
    'questionCount',v_blueprint.question_count,
    'outcomeCount',v_blueprint.outcome_count,
    'maxPerOutcome',v_blueprint.max_per_outcome
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.require_released_adaptive_diagnostic_blueprint(
  p_game text,
  p_display_exam_ref text,
  p_blueprint_version text DEFAULT NULL,
  p_verify_integrity boolean DEFAULT true
) RETURNS public.adaptive_diagnostic_blueprints
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_blueprint public.adaptive_diagnostic_blueprints%ROWTYPE;
  v_integrity jsonb;
BEGIN
  SELECT blueprint.* INTO v_blueprint
  FROM public.curriculum_scope_releases AS scope
  JOIN public.adaptive_diagnostic_blueprints AS blueprint
    ON blueprint.game=scope.game
   AND blueprint.display_exam_ref=scope.display_exam_ref
   AND blueprint.question_exam_ref IS NOT DISTINCT FROM scope.question_exam_ref
   AND blueprint.taxonomy_version=scope.taxonomy_version
  WHERE scope.game=lower(btrim(p_game))
    AND scope.display_exam_ref=upper(btrim(p_display_exam_ref))
    AND scope.release_status='released'
    AND scope.diagnostic_enabled
    AND blueprint.capability_status='released'
    AND (p_blueprint_version IS NULL OR blueprint.blueprint_version=btrim(p_blueprint_version))
  FOR SHARE OF scope,blueprint;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'adaptive diagnostic is unavailable for the exact released blueprint'
      USING ERRCODE='22023';
  END IF;

  IF p_verify_integrity THEN
    v_integrity:=public.adaptive_diagnostic_scope_integrity(
      v_blueprint.game,v_blueprint.display_exam_ref,v_blueprint.blueprint_version
    );
    IF NOT COALESCE((v_integrity->>'clean')::boolean,false) THEN
      RAISE EXCEPTION 'adaptive diagnostic candidate integrity is not clean: %',v_integrity
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN v_blueprint;
END
$fn$;

-- Replace migration 184's Math-only insert gate with the exact immutable
-- session snapshot.  Direct table DML is still unavailable to service_role,
-- but this protects every definer path as defense in depth.
CREATE OR REPLACE FUNCTION public.tg_require_adaptive_diagnostic_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_session public.adaptive_diagnostic_sessions%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='adaptive_diagnostic_sessions' THEN
    PERFORM public.require_released_adaptive_diagnostic_blueprint(
      NEW.game,NEW.exam_ref,NEW.diagnostic_blueprint_version,false
    );
  ELSE
    SELECT * INTO v_session
    FROM public.adaptive_diagnostic_sessions
    WHERE id=NEW.session_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'diagnostic session snapshot is missing' USING ERRCODE='22023';
    END IF;
    IF NEW.user_id IS DISTINCT FROM v_session.user_id
      OR NEW.sequence>v_session.question_count
      OR NEW.covered_outcomes_after>v_session.outcome_count THEN
      RAISE EXCEPTION 'diagnostic answer exceeds its immutable session policy'
        USING ERRCODE='23514';
    END IF;
    PERFORM public.require_released_adaptive_diagnostic_blueprint(
      v_session.game,v_session.exam_ref,v_session.diagnostic_blueprint_version,false
    );
  END IF;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.tg_adaptive_diagnostic_question_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_revision record;
  v_outcome_id uuid;
  v_difficulty smallint;
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
    SELECT revision.*,
      COALESCE(question.base_points,revision.difficulty*10)::smallint AS resolved_base_points
    INTO v_revision
    FROM public.questions AS question
    JOIN public.question_content_revisions AS revision
      ON revision.id=question.published_revision_id
     AND revision.question_id=question.id
     AND revision.status='published'
     AND revision.game IS NOT DISTINCT FROM question.game::text
     AND revision.category IS NOT DISTINCT FROM question.category::text
     AND revision.difficulty IS NOT DISTINCT FROM question.difficulty
     AND (
       (NEW.question_exam_ref IS NOT NULL
         AND NULLIF(upper(btrim(COALESCE(revision.exam_ref,''))),'')
           IS NOT DISTINCT FROM NEW.question_exam_ref)
       OR (NEW.question_exam_ref IS NULL AND (
         NULLIF(upper(btrim(COALESCE(revision.exam_ref,''))),'') IS NULL
         OR upper(btrim(revision.exam_ref))=NEW.exam_ref
       ))
     )
    WHERE question.id=NEW.current_question_id;
    IF NOT FOUND
      OR btrim(COALESCE(v_revision.content_sha256,''))=''
      OR jsonb_typeof(v_revision.content->'options') IS DISTINCT FROM 'array'
      OR jsonb_array_length(v_revision.content->'options') NOT BETWEEN 2 AND 10 THEN
      RAISE EXCEPTION 'diagnostic question requires a valid published revision snapshot'
        USING ERRCODE='23514';
    END IF;
    IF COALESCE(v_revision.content->>'answer','') !~ '^[0-9]{1,2}$' THEN
      RAISE EXCEPTION 'diagnostic question requires a valid published revision answer'
        USING ERRCODE='23514';
    END IF;
    IF (v_revision.content->>'answer')::integer NOT BETWEEN 0
      AND jsonb_array_length(v_revision.content->'options')-1 THEN
      RAISE EXCEPTION 'diagnostic question answer is outside its revision options'
        USING ERRCODE='23514';
    END IF;

    SELECT resolved.outcome_id,resolved.difficulty
    INTO v_outcome_id,v_difficulty
    FROM public.resolve_adaptive_diagnostic_question_v3(
      NEW.current_question_id,NEW.game,NEW.exam_ref,NEW.question_exam_ref,NEW.taxonomy_version
    ) AS resolved;
    IF NOT FOUND OR v_difficulty IS DISTINCT FROM v_revision.difficulty THEN
      RAISE EXCEPTION 'diagnostic question requires exact scope outcome and difficulty evidence'
        USING ERRCODE='23514';
    END IF;
    NEW.current_question_revision_id:=v_revision.id;
    NEW.current_question_content_sha256:=v_revision.content_sha256;
    NEW.current_question_correct_option:=(v_revision.content->>'answer')::smallint;
    NEW.current_question_option_count:=jsonb_array_length(v_revision.content->'options')::smallint;
    NEW.current_question_base_points:=v_revision.resolved_base_points;
    NEW.current_question_outcome_id:=v_outcome_id;
    NEW.current_question_difficulty:=v_difficulty;
    NEW.current_question_issued_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.start_adaptive_diagnostic_v3(
  p_user_id uuid,
  p_session_id uuid,
  p_game text,
  p_display_exam_ref text,
  p_first_question_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_blueprint public.adaptive_diagnostic_blueprints%ROWTYPE;
  v_existing public.adaptive_diagnostic_sessions%ROWTYPE;
  v_first record;
  v_kind text;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR p_game IS NULL
    OR p_display_exam_ref IS NULL OR p_first_question_id IS NULL THEN
    RAISE EXCEPTION 'user, session, scope and first question are required'
      USING ERRCODE='22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_user_id::text||':adaptive-diagnostic:'||lower(btrim(p_game))||':'||upper(btrim(p_display_exam_ref)),0
  ));
  v_blueprint:=public.require_released_adaptive_diagnostic_blueprint(
    p_game,p_display_exam_ref,NULL
  );

  SELECT * INTO v_existing
  FROM public.adaptive_diagnostic_sessions
  WHERE user_id=p_user_id
    AND game=v_blueprint.game
    AND exam_ref=v_blueprint.display_exam_ref
    AND taxonomy_version=v_blueprint.taxonomy_version
    AND status='active'
  FOR UPDATE;
  IF FOUND AND v_existing.expires_at<=clock_timestamp() THEN
    UPDATE public.adaptive_diagnostic_sessions
    SET status='abandoned',current_question_id=NULL,updated_at=clock_timestamp()
    WHERE id=v_existing.id;
    v_existing.id:=NULL;
  ELSIF FOUND THEN
    IF v_existing.question_exam_ref IS DISTINCT FROM v_blueprint.question_exam_ref
      OR v_existing.diagnostic_blueprint_version IS DISTINCT FROM v_blueprint.blueprint_version
      OR v_existing.policy_version IS DISTINCT FROM v_blueprint.policy_version
      OR v_existing.question_count IS DISTINCT FROM v_blueprint.question_count
      OR v_existing.outcome_count IS DISTINCT FROM v_blueprint.outcome_count
      OR v_existing.max_per_outcome IS DISTINCT FROM v_blueprint.max_per_outcome THEN
      RAISE EXCEPTION 'active diagnostic session does not match the released blueprint'
        USING ERRCODE='23514';
    END IF;
    RETURN jsonb_build_object(
      'sessionId',v_existing.id,'currentQuestionId',v_existing.current_question_id,
      'kind',v_existing.kind,'answeredCount',v_existing.answered_count,
      'coveredOutcomes',v_existing.covered_outcomes,'expiresAt',v_existing.expires_at,
      'policyVersion',v_existing.policy_version,'questionCount',v_existing.question_count,
      'outcomeCount',v_existing.outcome_count,'maxPerOutcome',v_existing.max_per_outcome,
      'resumed',true
    );
  END IF;

  SELECT * INTO v_first
  FROM public.resolve_adaptive_diagnostic_question_v3(
    p_first_question_id,v_blueprint.game,v_blueprint.display_exam_ref,
    v_blueprint.question_exam_ref,v_blueprint.taxonomy_version
  );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'first question is not an exact single-outcome question for the released blueprint'
      USING ERRCODE='22023';
  END IF;

  v_kind:=CASE WHEN EXISTS (
    SELECT 1 FROM public.adaptive_diagnostic_sessions AS previous
    WHERE previous.user_id=p_user_id
      AND previous.game=v_blueprint.game
      AND previous.exam_ref=v_blueprint.display_exam_ref
      AND previous.taxonomy_version=v_blueprint.taxonomy_version
      AND previous.status='completed'
  ) THEN 'recheck' ELSE 'initial' END;

  INSERT INTO public.adaptive_diagnostic_sessions(
    id,user_id,game,exam_ref,question_exam_ref,taxonomy_version,
    diagnostic_blueprint_version,policy_version,question_count,outcome_count,max_per_outcome,
    kind,status,current_question_id,answered_count,covered_outcomes,started_at,expires_at
  ) VALUES (
    p_session_id,p_user_id,v_blueprint.game,v_blueprint.display_exam_ref,
    v_blueprint.question_exam_ref,v_blueprint.taxonomy_version,
    v_blueprint.blueprint_version,v_blueprint.policy_version,
    v_blueprint.question_count,v_blueprint.outcome_count,v_blueprint.max_per_outcome,
    v_kind,'active',p_first_question_id,0,0,clock_timestamp(),clock_timestamp()+interval '30 minutes'
  ) RETURNING * INTO v_existing;

  RETURN jsonb_build_object(
    'sessionId',v_existing.id,'currentQuestionId',v_existing.current_question_id,
    'kind',v_existing.kind,'answeredCount',0,'coveredOutcomes',0,
    'expiresAt',v_existing.expires_at,'policyVersion',v_existing.policy_version,
    'questionCount',v_existing.question_count,'outcomeCount',v_existing.outcome_count,
    'maxPerOutcome',v_existing.max_per_outcome,'resumed',false
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.get_adaptive_diagnostic_question_v3(
  p_user_id uuid,
  p_session_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_result jsonb;
  v_session public.adaptive_diagnostic_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session
  FROM public.adaptive_diagnostic_sessions
  WHERE id=p_session_id AND user_id=p_user_id;
  IF NOT FOUND OR v_session.status<>'active' OR v_session.current_question_id IS NULL THEN
    RAISE EXCEPTION 'active diagnostic question snapshot not found' USING ERRCODE='P0002';
  END IF;
  PERFORM public.require_released_adaptive_diagnostic_blueprint(
    v_session.game,v_session.exam_ref,v_session.diagnostic_blueprint_version
  );

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
  FROM public.adaptive_diagnostic_sessions AS session
  JOIN public.question_content_revisions AS revision
    ON revision.id=session.current_question_revision_id
   AND revision.question_id=session.current_question_id
   AND revision.content_sha256=session.current_question_content_sha256
  WHERE session.id=p_session_id
    AND session.user_id=p_user_id
    AND session.status='active'
    AND session.current_question_id IS NOT NULL;
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'active diagnostic question snapshot not found' USING ERRCODE='P0002';
  END IF;
  RETURN v_result;
END
$fn$;

CREATE OR REPLACE FUNCTION public.record_adaptive_diagnostic_answer_v3(
  p_user_id uuid,
  p_session_id uuid,
  p_question_id uuid,
  p_selected_option smallint,
  p_response_time_ms integer,
  p_request_id uuid,
  p_next_question_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_session public.adaptive_diagnostic_sessions%ROWTYPE;
  v_blueprint public.adaptive_diagnostic_blueprints%ROWTYPE;
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
  IF p_selected_option NOT BETWEEN 0 AND 9
    OR p_response_time_ms NOT BETWEEN 100 AND 600000 THEN
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
  FROM public.adaptive_diagnostic_answers AS answer
  WHERE answer.session_id=p_session_id
    AND (answer.request_id=p_request_id OR answer.question_id=p_question_id)
  ORDER BY CASE WHEN answer.request_id=p_request_id THEN 0 ELSE 1 END
  LIMIT 1;
  IF FOUND THEN
    IF v_existing.question_id IS DISTINCT FROM p_question_id
      OR (v_existing.evidence_kind<>'legacy_unbound'
        AND v_existing.selected_option IS DISTINCT FROM p_selected_option)
      OR v_existing.response_time_ms IS DISTINCT FROM p_response_time_ms
      OR v_existing.next_question_id IS DISTINCT FROM p_next_question_id THEN
      RAISE EXCEPTION 'diagnostic request payload mismatch' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object(
      'alreadyProcessed',true,'status',v_existing.status_after,
      'nextQuestionId',v_existing.next_question_id,'answeredCount',v_existing.sequence,
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

  v_blueprint:=public.require_released_adaptive_diagnostic_blueprint(
    v_session.game,v_session.exam_ref,v_session.diagnostic_blueprint_version
  );
  IF v_session.question_exam_ref IS DISTINCT FROM v_blueprint.question_exam_ref
    OR v_session.taxonomy_version IS DISTINCT FROM v_blueprint.taxonomy_version
    OR v_session.policy_version IS DISTINCT FROM v_blueprint.policy_version
    OR v_session.question_count IS DISTINCT FROM v_blueprint.question_count
    OR v_session.outcome_count IS DISTINCT FROM v_blueprint.outcome_count
    OR v_session.max_per_outcome IS DISTINCT FROM v_blueprint.max_per_outcome THEN
    RAISE EXCEPTION 'diagnostic session policy snapshot drifted from its blueprint'
      USING ERRCODE='23514';
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
  v_server_response_time_ms:=least(
    2147483647,
    greatest(0,floor(extract(epoch FROM (clock_timestamp()-v_session.current_question_issued_at))*1000))
  )::integer;
  IF (SELECT count(*) FROM public.adaptive_diagnostic_answers AS answer
      WHERE answer.session_id=p_session_id
        AND answer.outcome_id=v_session.current_question_outcome_id)>=v_session.max_per_outcome THEN
    RAISE EXCEPTION 'an outcome reached the immutable per-outcome bound'
      USING ERRCODE='23514';
  END IF;

  v_sequence:=(v_session.answered_count+1)::smallint;
  SELECT count(DISTINCT measured.outcome_id)::smallint INTO v_covered
  FROM (
    SELECT answer.outcome_id
    FROM public.adaptive_diagnostic_answers AS answer
    WHERE answer.session_id=p_session_id
    UNION ALL SELECT v_session.current_question_outcome_id
  ) AS measured;

  IF p_next_question_id IS NOT NULL THEN
    IF v_sequence>=v_session.question_count
      OR p_next_question_id=p_question_id
      OR EXISTS (
        SELECT 1 FROM public.adaptive_diagnostic_answers AS answer
        WHERE answer.session_id=p_session_id AND answer.question_id=p_next_question_id
      ) THEN
      RAISE EXCEPTION 'next question is not eligible for this session' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_next
    FROM public.resolve_adaptive_diagnostic_question_v3(
      p_next_question_id,v_session.game,v_session.exam_ref,
      v_session.question_exam_ref,v_session.taxonomy_version
    );
    IF NOT FOUND THEN
      RAISE EXCEPTION 'next question is not an exact single-outcome blueprint question'
        USING ERRCODE='22023';
    END IF;
    SELECT count(*)+CASE
      WHEN v_next.outcome_id=v_session.current_question_outcome_id THEN 1 ELSE 0 END
    INTO v_next_outcome_attempts
    FROM public.adaptive_diagnostic_answers AS answer
    WHERE answer.session_id=p_session_id AND answer.outcome_id=v_next.outcome_id;
    IF v_next_outcome_attempts>=v_session.max_per_outcome THEN
      RAISE EXCEPTION 'next outcome reached the immutable per-outcome bound'
        USING ERRCODE='23514';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.curriculum_outcomes AS outcome
      JOIN public.curriculum_nodes AS node ON node.id=outcome.node_id
      WHERE outcome.is_active AND node.is_active AND node.node_type='outcome'
        AND outcome.game=v_session.game
        AND upper(COALESCE(outcome.exam_ref,''))=v_session.exam_ref
        AND outcome.taxonomy_version=v_session.taxonomy_version
        AND node.game IS NOT DISTINCT FROM outcome.game
        AND node.exam_ref IS NOT DISTINCT FROM outcome.exam_ref
        AND node.taxonomy_version IS NOT DISTINCT FROM outcome.taxonomy_version
        AND NOT EXISTS (
          SELECT 1 FROM public.adaptive_diagnostic_answers AS answer
          WHERE answer.session_id=p_session_id AND answer.outcome_id=outcome.id
        )
        AND outcome.id<>v_session.current_question_outcome_id
    ) INTO v_has_uncovered;
    IF v_has_uncovered AND EXISTS (
      SELECT 1 FROM public.adaptive_diagnostic_answers AS answer
      WHERE answer.session_id=p_session_id AND answer.outcome_id=v_next.outcome_id
      UNION ALL SELECT 1 WHERE v_next.outcome_id=v_session.current_question_outcome_id
    ) THEN
      RAISE EXCEPTION 'all blueprint outcomes must be covered before confirmation questions'
        USING ERRCODE='23514';
    END IF;
    v_status:='active';
  ELSE
    v_status:=CASE
      WHEN v_covered=v_session.outcome_count AND v_sequence=v_session.question_count
      THEN 'completed' ELSE 'abandoned' END;
  END IF;

  INSERT INTO public.adaptive_diagnostic_answers(
    session_id,user_id,question_id,outcome_id,sequence,difficulty,is_correct,
    response_time_ms,request_id,next_question_id,covered_outcomes_after,status_after,
    selected_option,question_revision_id,question_content_sha256,server_response_time_ms,
    response_time_source,evidence_kind
  ) VALUES (
    p_session_id,p_user_id,p_question_id,v_session.current_question_outcome_id,
    v_sequence,v_session.current_question_difficulty,v_is_correct,
    p_response_time_ms,p_request_id,p_next_question_id,v_covered,v_status,
    p_selected_option,v_session.current_question_revision_id,
    v_session.current_question_content_sha256,v_server_response_time_ms,
    'client_reported_with_server_elapsed','revision_snapshot'
  );

  UPDATE public.adaptive_diagnostic_sessions
  SET current_question_id=p_next_question_id,
      answered_count=v_sequence,
      covered_outcomes=v_covered,
      status=v_status,
      completed_at=CASE WHEN v_status='completed' THEN clock_timestamp() ELSE NULL END,
      updated_at=clock_timestamp()
  WHERE id=p_session_id;

  IF v_status='completed' THEN
    WITH aggregate_result AS (
      SELECT answer.outcome_id,count(*)::smallint AS attempts,
        count(*) FILTER (WHERE answer.is_correct)::smallint AS correct_attempts,
        sum(CASE WHEN answer.is_correct THEN answer.difficulty ELSE 0 END)::numeric(8,3) AS earned,
        sum(answer.difficulty)::numeric(8,3) AS possible
      FROM public.adaptive_diagnostic_answers AS answer
      WHERE answer.session_id=p_session_id
      GROUP BY answer.outcome_id
    ), latest AS (
      SELECT DISTINCT ON (answer.outcome_id)
        answer.outcome_id,answer.difficulty,answer.is_correct
      FROM public.adaptive_diagnostic_answers AS answer
      WHERE answer.session_id=p_session_id
      ORDER BY answer.outcome_id,answer.sequence DESC
    )
    INSERT INTO public.user_diagnostic_outcome_state(
      user_id,outcome_id,completed_session_id,attempts,correct_attempts,
      difficulty_weighted_earned,difficulty_weighted_possible,score,
      recommended_difficulty,last_diagnosed_at,updated_at
    )
    SELECT p_user_id,result.outcome_id,p_session_id,result.attempts,
      result.correct_attempts,result.earned,result.possible,
      round(100*result.earned/result.possible,2),
      least(5,greatest(1,latest.difficulty+CASE WHEN latest.is_correct THEN 1 ELSE -1 END))::smallint,
      clock_timestamp(),clock_timestamp()
    FROM aggregate_result AS result
    JOIN latest ON latest.outcome_id=result.outcome_id
    ON CONFLICT(user_id,outcome_id) DO UPDATE SET
      completed_session_id=EXCLUDED.completed_session_id,
      attempts=EXCLUDED.attempts,
      correct_attempts=EXCLUDED.correct_attempts,
      difficulty_weighted_earned=EXCLUDED.difficulty_weighted_earned,
      difficulty_weighted_possible=EXCLUDED.difficulty_weighted_possible,
      score=EXCLUDED.score,
      recommended_difficulty=EXCLUDED.recommended_difficulty,
      last_diagnosed_at=EXCLUDED.last_diagnosed_at,
      updated_at=clock_timestamp();
  END IF;

  RETURN jsonb_build_object(
    'alreadyProcessed',false,'status',v_status,'nextQuestionId',p_next_question_id,
    'answeredCount',v_sequence,'coveredOutcomes',v_covered
  );
END
$fn$;

-- Existing application names remain compatible while adopting the generic,
-- revision-bound implementation.  The original boolean-correctness RPC is
-- retained only for legacy service callers and cannot open a non-Math scope.
CREATE OR REPLACE FUNCTION public.start_adaptive_diagnostic(
  p_user_id uuid,p_session_id uuid,p_first_question_id uuid
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT public.start_adaptive_diagnostic_v3(
    p_user_id,p_session_id,'matematik','TYT',p_first_question_id
  )
$fn$;

CREATE OR REPLACE FUNCTION public.get_adaptive_diagnostic_question_v2(
  p_user_id uuid,p_session_id uuid
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT public.get_adaptive_diagnostic_question_v3(p_user_id,p_session_id)
$fn$;

CREATE OR REPLACE FUNCTION public.record_adaptive_diagnostic_answer_v2(
  p_user_id uuid,p_session_id uuid,p_question_id uuid,p_selected_option smallint,
  p_response_time_ms integer,p_request_id uuid,p_next_question_id uuid
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT public.record_adaptive_diagnostic_answer_v3(
    p_user_id,p_session_id,p_question_id,p_selected_option,
    p_response_time_ms,p_request_id,p_next_question_id
  )
$fn$;

REVOKE ALL ON FUNCTION public.tg_adaptive_diagnostic_blueprint_immutable(),
  public.tg_adaptive_diagnostic_session_scope_immutable(),
  public.tg_adaptive_diagnostic_question_snapshot(),
  public.tg_require_adaptive_diagnostic_release(),
  public.require_released_adaptive_diagnostic_blueprint(text,text,text,boolean)
  FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.adaptive_diagnostic_scope_integrity(text,text,text),
  public.resolve_adaptive_diagnostic_question_v3(uuid,text,text,text,text),
  public.resolve_released_diagnostic_scope(text,text),
  public.start_adaptive_diagnostic_v3(uuid,uuid,text,text,uuid),
  public.get_adaptive_diagnostic_question_v3(uuid,uuid),
  public.record_adaptive_diagnostic_answer_v3(uuid,uuid,uuid,smallint,integer,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.adaptive_diagnostic_scope_integrity(text,text,text),
  public.resolve_adaptive_diagnostic_question_v3(uuid,text,text,text,text),
  public.resolve_released_diagnostic_scope(text,text),
  public.start_adaptive_diagnostic_v3(uuid,uuid,text,text,uuid),
  public.get_adaptive_diagnostic_question_v3(uuid,uuid),
  public.record_adaptive_diagnostic_answer_v3(uuid,uuid,uuid,smallint,integer,uuid,uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.start_adaptive_diagnostic(uuid,uuid,uuid),
  public.get_adaptive_diagnostic_question_v2(uuid,uuid),
  public.record_adaptive_diagnostic_answer_v2(uuid,uuid,uuid,smallint,integer,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.start_adaptive_diagnostic(uuid,uuid,uuid),
  public.get_adaptive_diagnostic_question_v2(uuid,uuid),
  public.record_adaptive_diagnostic_answer_v2(uuid,uuid,uuid,smallint,integer,uuid,uuid)
  TO service_role;

DO $fn$
DECLARE
  v_math_count integer;
  v_trigger_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_math_count
  FROM public.adaptive_diagnostic_blueprints
  WHERE capability_status='released'
    AND game='matematik'
    AND display_exam_ref='TYT'
    AND question_exam_ref='TYT'
    AND taxonomy_version='ba-tyt-math-v1'
    AND blueprint_version='ba-tyt-math-diagnostic-v1';
  IF v_math_count<>1 THEN
    RAISE EXCEPTION 'migration 193 requires the proven TYT Mathematics blueprint release'
      USING ERRCODE='23514';
  END IF;

  SELECT count(*)::integer INTO v_trigger_count
  FROM pg_trigger
  WHERE NOT tgisinternal
    AND tgenabled IN ('O','A')
    AND (tgrelid,tgname) IN (
      ('public.adaptive_diagnostic_sessions'::regclass,'aaa_adaptive_diagnostic_session_release_gate'),
      ('public.adaptive_diagnostic_sessions'::regclass,'trg_adaptive_diagnostic_question_snapshot'),
      ('public.adaptive_diagnostic_answers'::regclass,'aaa_adaptive_diagnostic_answer_release_gate'),
      ('public.adaptive_diagnostic_answers'::regclass,'trg_adaptive_diagnostic_answers_append_only')
    );
  IF v_trigger_count<>4 THEN
    RAISE EXCEPTION 'adaptive diagnostic release/snapshot/append-only gates are incomplete'
      USING ERRCODE='55000';
  END IF;

  IF has_table_privilege('service_role','public.adaptive_diagnostic_blueprints','SELECT')
    OR has_function_privilege('anon','public.resolve_released_diagnostic_scope(text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.resolve_released_diagnostic_scope(text,text)','EXECUTE')
    OR has_function_privilege('anon','public.start_adaptive_diagnostic_v3(uuid,uuid,text,text,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.start_adaptive_diagnostic_v3(uuid,uuid,text,text,uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.resolve_released_diagnostic_scope(text,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.start_adaptive_diagnostic_v3(uuid,uuid,text,text,uuid)','EXECUTE')
    OR NOT has_function_privilege(
      'service_role',
      'public.record_adaptive_diagnostic_answer_v3(uuid,uuid,uuid,smallint,integer,uuid,uuid)',
      'EXECUTE'
    ) THEN
    RAISE EXCEPTION 'adaptive diagnostic v3 ACL postcheck failed' USING ERRCODE='42501';
  END IF;
END
$fn$;

NOTIFY pgrst,'reload schema';
COMMIT;
