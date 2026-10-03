-- PostgreSQL 16 focused compatibility fixture for migrations 205-210.
--
-- This is deliberately not a Supabase or production clone.  It models the
-- pre-205 relation/function contracts that the unchanged migration bodies use,
-- starts with no TYT Social source pool, and therefore must remain fail-closed.

DROP SCHEMA IF EXISTS auth CASCADE;
DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS extensions CASCADE;
DROP SCHEMA IF EXISTS supabase_migrations CASCADE;

CREATE SCHEMA auth;
CREATE SCHEMA public;
CREATE SCHEMA extensions;
CREATE SCHEMA supabase_migrations;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $roles$
BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$roles$;
DO $roles$
BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$roles$;
DO $roles$
BEGIN
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN
  ALTER ROLE service_role BYPASSRLS;
END
$roles$;
DO $roles$
BEGIN
  CREATE ROLE authenticator NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$roles$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role, authenticator;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $function$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$function$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $function$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  )
$function$;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);

CREATE TABLE public.questions (
  id uuid PRIMARY KEY,
  game text NOT NULL,
  category text NOT NULL,
  difficulty integer NOT NULL DEFAULT 1,
  exam_ref text,
  is_active boolean NOT NULL DEFAULT true,
  published_revision_id uuid
);

CREATE TABLE public.question_content_revisions (
  id uuid PRIMARY KEY,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  game text NOT NULL,
  category text NOT NULL,
  difficulty integer NOT NULL DEFAULT 1,
  exam_ref text,
  status text NOT NULL,
  revision_no integer NOT NULL DEFAULT 1,
  content_sha256 text NOT NULL DEFAULT repeat('0',64),
  change_kind text NOT NULL DEFAULT 'legacy_import',
  prepared_by uuid,
  outcomes_prepared_by uuid,
  prepared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  published_at timestamptz
);

CREATE TABLE public.question_revision_sources (
  revision_id uuid PRIMARY KEY
    REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  source_kind text NOT NULL,
  source_title text NOT NULL,
  license_code text NOT NULL,
  provenance_ref text
);

CREATE TABLE public.question_revision_approvals (
  revision_id uuid NOT NULL
    REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  stage smallint NOT NULL,
  reviewer_id uuid NOT NULL,
  decision text NOT NULL,
  PRIMARY KEY (revision_id, stage)
);

CREATE TABLE public.game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT
);

CREATE TABLE public.session_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  question_revision_id uuid,
  is_skipped boolean NOT NULL DEFAULT false
);

CREATE TABLE public.verified_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  game text NOT NULL,
  mode text NOT NULL DEFAULT 'classic',
  question_ids uuid[] NOT NULL,
  duration_sec integer NOT NULL,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  session_id uuid REFERENCES public.game_sessions(id) ON DELETE RESTRICT
);

CREATE TABLE public.verified_attempt_question_revisions (
  attempt_id uuid NOT NULL REFERENCES public.verified_attempts(id) ON DELETE RESTRICT,
  position smallint NOT NULL,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  game text NOT NULL,
  category text NOT NULL,
  exam_ref text,
  PRIMARY KEY (attempt_id, position),
  UNIQUE (attempt_id, question_id)
);

CREATE TABLE public.daily_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  game text NOT NULL,
  plan_date date NOT NULL,
  exam_ref text,
  question_ids uuid[] NOT NULL,
  completed_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE NULLS NOT DISTINCT (user_id, game, plan_date, exam_ref)
);

CREATE TABLE public.daily_plan_items (
  plan_id uuid NOT NULL REFERENCES public.daily_plan(id) ON DELETE RESTRICT,
  position smallint NOT NULL,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  slot_type text NOT NULL,
  source_type text NOT NULL,
  source_ref text,
  completed_at timestamptz,
  PRIMARY KEY (plan_id, position),
  UNIQUE (plan_id, question_id)
);

CREATE TABLE public.verified_exam_attempts (
  attempt_id uuid PRIMARY KEY REFERENCES public.verified_attempts(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  game text NOT NULL,
  exam_ref text,
  blueprint_version text NOT NULL,
  question_set_hash text NOT NULL,
  planned_duration_sec integer NOT NULL,
  issue_request_id uuid NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  started_at timestamptz,
  deadline_at timestamptz,
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'issued',
  session_id uuid REFERENCES public.game_sessions(id) ON DELETE RESTRICT,
  start_request_id uuid,
  finalize_request_id uuid,
  UNIQUE (user_id, issue_request_id)
);

CREATE UNIQUE INDEX verified_exam_attempts_open_scope_idx
  ON public.verified_exam_attempts(user_id, game, COALESCE(exam_ref, ''))
  WHERE status IN ('issued', 'active');

CREATE TABLE public.verified_exam_attempt_items (
  attempt_id uuid NOT NULL REFERENCES public.verified_exam_attempts(attempt_id) ON DELETE RESTRICT,
  position smallint NOT NULL,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  source_bucket text NOT NULL,
  PRIMARY KEY (attempt_id, position),
  UNIQUE (attempt_id, question_id)
);

CREATE TABLE public.curriculum_outcomes (
  id uuid PRIMARY KEY,
  game text NOT NULL,
  category text,
  exam_ref text,
  taxonomy_version text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.curriculum_nodes (
  id uuid PRIMARY KEY,
  game text NOT NULL,
  category text,
  exam_ref text,
  taxonomy_version text NOT NULL
);

CREATE TABLE public.question_outcomes (
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  outcome_id uuid NOT NULL REFERENCES public.curriculum_outcomes(id) ON DELETE RESTRICT,
  is_primary boolean NOT NULL DEFAULT false,
  PRIMARY KEY (question_id, outcome_id)
);

CREATE TABLE public.curriculum_scope_releases (
  game text NOT NULL,
  display_exam_ref text NOT NULL,
  question_exam_ref text NOT NULL,
  taxonomy_version text NOT NULL,
  release_status text NOT NULL,
  diagnostic_enabled boolean NOT NULL DEFAULT false,
  released_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (game, display_exam_ref, question_exam_ref, taxonomy_version)
);

CREATE TABLE public.curriculum_scope_source_policy_evidence (
  game text NOT NULL,
  display_exam_ref text NOT NULL,
  taxonomy_version text NOT NULL,
  source_policy_version text NOT NULL,
  evidence_sha256 text NOT NULL,
  evidence_manifest jsonb NOT NULL,
  approved_question_count integer NOT NULL,
  required_category_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (
    game,display_exam_ref,taxonomy_version,source_policy_version,evidence_sha256
  )
);

CREATE TABLE public.mastery_materialized_attempts (
  attempt_id uuid PRIMARY KEY REFERENCES public.verified_attempts(id) ON DELETE RESTRICT,
  materialized_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.mastery_outcome_evidence (
  answer_id uuid NOT NULL,
  outcome_id uuid NOT NULL REFERENCES public.curriculum_outcomes(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE RESTRICT,
  attempt_id uuid NOT NULL REFERENCES public.verified_attempts(id) ON DELETE RESTRICT,
  verified_completed_at timestamptz NOT NULL,
  is_correct boolean NOT NULL,
  mapping_weight numeric NOT NULL,
  delayed_correct boolean NOT NULL DEFAULT false,
  difficulty_weighted_earned numeric NOT NULL DEFAULT 0,
  difficulty_weighted_possible numeric NOT NULL DEFAULT 0,
  time_taken_sec numeric,
  fast_wrong boolean NOT NULL DEFAULT false,
  max_hint_stage smallint NOT NULL DEFAULT 0,
  evidence_day_tr date NOT NULL,
  PRIMARY KEY (answer_id, outcome_id)
);

CREATE TABLE public.mastery_outcome_evidence_days (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  outcome_id uuid NOT NULL REFERENCES public.curriculum_outcomes(id) ON DELETE RESTRICT,
  evidence_day_tr date NOT NULL,
  first_verified_completed_at timestamptz NOT NULL,
  first_answer_id uuid NOT NULL,
  first_attempt_id uuid NOT NULL REFERENCES public.verified_attempts(id) ON DELETE RESTRICT,
  first_question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, outcome_id, evidence_day_tr),
  FOREIGN KEY (first_answer_id, outcome_id)
    REFERENCES public.mastery_outcome_evidence(answer_id, outcome_id) ON DELETE RESTRICT
);

CREATE TABLE public.review_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id uuid NOT NULL
);

CREATE TABLE public.review_error_annotations (
  review_log_id uuid NOT NULL REFERENCES public.review_logs(id) ON DELETE RESTRICT,
  reason_code text NOT NULL
);

CREATE TABLE public.teacher_assignment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT
);

CREATE TABLE public.teacher_assignment_submission_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.teacher_assignment_submissions(id) ON DELETE RESTRICT
);

CREATE TABLE public.content_governance_requests (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  operation text NOT NULL,
  request_id uuid NOT NULL,
  payload_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, operation, request_id)
);

CREATE OR REPLACE FUNCTION public.question_outcome_mapping_actor_has_aal2(uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT false
$function$;

CREATE OR REPLACE FUNCTION public.content_governance_has_permission(uuid, text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT false
$function$;

CREATE OR REPLACE FUNCTION public.content_governance_lock_request(uuid, text, uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  NULL;
END
$function$;

CREATE OR REPLACE FUNCTION public.content_governance_hash(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT encode(extensions.digest(p_payload::text, 'sha256'), 'hex')
$function$;

CREATE OR REPLACE FUNCTION public.tyt_social_source_policy_integrity(
  p_game text,
  p_exam_ref text,
  p_taxonomy_version text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT jsonb_build_object(
    'game', p_game,
    'examRef', p_exam_ref,
    'taxonomyVersion', p_taxonomy_version,
    'sourceReady', false,
    'ready', false,
    'reason', 'compatibility-fixture-has-no-source-pool'
  )
$function$;

CREATE OR REPLACE FUNCTION public.curriculum_scope_integrity(
  p_game text,
  p_exam_ref text,
  p_taxonomy_version text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT jsonb_build_object(
    'game',p_game,
    'examRef',p_exam_ref,
    'taxonomyVersion',p_taxonomy_version,
    'total',0,
    'mapped',0,
    'unmapped',0,
    'scopeMismatch',0,
    'nodeOrphan',0,
    'outcomeOrphan',0,
    'primaryMismatch',0,
    'emptyOutcome',0
  )
$function$;

CREATE OR REPLACE FUNCTION public.verified_attempt_private_snapshot(uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT '{}'::jsonb
$function$;

CREATE OR REPLACE FUNCTION public.verified_exam_private_snapshot(uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT '{}'::jsonb
$function$;

CREATE OR REPLACE FUNCTION public.hard_delete_expired_users()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION
    'hard account erasure is disabled pending a signed retention decision and processor/auth/storage deletion plan'
    USING ERRCODE = '55000';
END
$function$;

REVOKE ALL ON FUNCTION public.hard_delete_expired_users()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hard_delete_expired_users()
TO service_role;

CREATE TABLE supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text,
  created_by text,
  idempotency_key text UNIQUE,
  rollback text[]
);

INSERT INTO auth.users(id)
VALUES ('00000000-0000-4000-8000-000000000205');
INSERT INTO public.profiles(id, deleted_at)
VALUES ('00000000-0000-4000-8000-000000000205', NULL);
INSERT INTO public.curriculum_scope_releases(
  game, display_exam_ref, question_exam_ref, taxonomy_version,
  release_status, diagnostic_enabled, released_at
) VALUES (
  'sosyal', 'TYT', 'TYT', 'ba-tyt-sosyal-v1',
  'draft', false, NULL
);
