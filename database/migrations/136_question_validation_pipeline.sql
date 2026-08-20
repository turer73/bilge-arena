-- Migration 136: replayable and cost-safe automated question validation.
--
-- This is deliberately a forward reconciliation migration. Some environments
-- may already contain the earlier, untracked question_validation_runs table;
-- every column/index operation below is therefore idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS public.question_validation_runs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  revision_id uuid,
  content_sha256 text NOT NULL CHECK (char_length(content_sha256) = 64),
  agent text NOT NULL CHECK (agent IN ('blind_solver','adversarial','solution_verifier')),
  sample_index smallint NOT NULL DEFAULT 0 CHECK (sample_index >= 0),
  provider_id text NOT NULL,
  model_id text NOT NULL,
  prompt_version text NOT NULL,
  policy_version text NOT NULL,
  generation_config_sha256 text NOT NULL CHECK (char_length(generation_config_sha256) = 64),
  generation_config jsonb NOT NULL,
  input_snapshot jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('ok','failed','skipped')),
  error_kind text CHECK (error_kind IN ('transport','schema','truncated','blocked','timeout')),
  error_message text,
  error_retryable boolean,
  skip_reason text,
  raw_output text,
  parsed_output jsonb,
  latency_ms integer CHECK (latency_ms >= 0),
  input_tokens integer CHECK (input_tokens >= 0),
  output_tokens integer CHECK (output_tokens >= 0),
  finish_reason text,
  run_id uuid NOT NULL,
  executed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT question_validation_runs_status_fields CHECK (
    (status = 'failed' AND error_kind IS NOT NULL AND skip_reason IS NULL)
    OR (status = 'skipped' AND skip_reason IS NOT NULL AND error_kind IS NULL)
    OR (status = 'ok' AND error_kind IS NULL AND skip_reason IS NULL)
  )
);

-- Reconcile the earlier prototype table without discarding any historical row.
ALTER TABLE public.question_validation_runs ADD COLUMN IF NOT EXISTS provider_id text;
ALTER TABLE public.question_validation_runs ADD COLUMN IF NOT EXISTS policy_version text;
ALTER TABLE public.question_validation_runs ADD COLUMN IF NOT EXISTS generation_config_sha256 text;
ALTER TABLE public.question_validation_runs ADD COLUMN IF NOT EXISTS generation_config jsonb;
ALTER TABLE public.question_validation_runs ADD COLUMN IF NOT EXISTS input_snapshot jsonb;
ALTER TABLE public.question_validation_runs ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.question_validation_runs ADD COLUMN IF NOT EXISTS error_retryable boolean;
ALTER TABLE public.question_validation_runs ADD COLUMN IF NOT EXISTS executed_at timestamptz;

-- NOT VALID preserves legacy prototype rows, while PostgreSQL still enforces
-- complete replay metadata for every row inserted after this migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'question_validation_runs_replay_metadata'
      AND conrelid = 'public.question_validation_runs'::regclass
  ) THEN
    ALTER TABLE public.question_validation_runs
      ADD CONSTRAINT question_validation_runs_replay_metadata CHECK (
        provider_id IS NOT NULL
        AND policy_version IS NOT NULL
        AND generation_config_sha256 IS NOT NULL
        AND char_length(generation_config_sha256) = 64
        AND generation_config IS NOT NULL
        AND input_snapshot IS NOT NULL
        AND executed_at IS NOT NULL
      ) NOT VALID;
  END IF;
END $$;

-- A failed result is not reusable: a later successful retry must replace it.
-- Config and provider are part of the key, so changing temperature/token limits
-- or transport implementation can never produce a false cache hit.
DROP INDEX IF EXISTS public.question_validation_runs_dedup;
CREATE UNIQUE INDEX IF NOT EXISTS question_validation_runs_dedup_v2
  ON public.question_validation_runs (
    question_id, content_sha256, agent, sample_index, provider_id, model_id,
    prompt_version, generation_config_sha256
  );

CREATE INDEX IF NOT EXISTS question_validation_runs_run
  ON public.question_validation_runs (run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS question_validation_runs_question
  ON public.question_validation_runs (question_id, created_at DESC);
CREATE INDEX IF NOT EXISTS question_validation_runs_failed
  ON public.question_validation_runs (created_at DESC) WHERE status = 'failed';

CREATE TABLE IF NOT EXISTS public.question_validation_runtime (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enforce_publish_gate boolean NOT NULL DEFAULT false,
  required_policy_version text NOT NULL DEFAULT 'question-quality@1',
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO public.question_validation_runtime(singleton) VALUES(true)
ON CONFLICT(singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.question_validation_decisions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id) ON DELETE CASCADE,
  content_sha256 text NOT NULL CHECK (char_length(content_sha256) = 64),
  policy_version text NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('APPROVED','REJECTED','NEEDS_REVIEW','INCONCLUSIVE')),
  findings jsonb NOT NULL CHECK (jsonb_typeof(findings) = 'array'),
  rationale text NOT NULL,
  blind_consensus_index smallint,
  blind_agreement_ratio numeric(8,6) CHECK (blind_agreement_ratio BETWEEN 0 AND 1),
  run_id uuid NOT NULL,
  decided_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(revision_id, content_sha256, policy_version)
);
CREATE INDEX IF NOT EXISTS question_validation_decisions_queue
  ON public.question_validation_decisions (verdict, decided_at DESC);

CREATE OR REPLACE FUNCTION public.tg_require_question_validation_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE
  v_revision public.question_content_revisions%ROWTYPE;
  v_policy text;
  v_enforce boolean;
  v_verdict text;
BEGIN
  IF NEW.published_revision_id IS NOT DISTINCT FROM OLD.published_revision_id
     OR NEW.published_revision_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT enforce_publish_gate, required_policy_version
    INTO v_enforce, v_policy
  FROM public.question_validation_runtime WHERE singleton;
  IF NOT COALESCE(v_enforce, false) THEN RETURN NEW; END IF;

  SELECT * INTO v_revision
  FROM public.question_content_revisions
  WHERE id = NEW.published_revision_id AND question_id = NEW.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'published revision does not belong to question' USING ERRCODE='22023';
  END IF;
  IF v_revision.change_kind = 'retire' THEN RETURN NEW; END IF;

  SELECT verdict INTO v_verdict
  FROM public.question_validation_decisions
  WHERE revision_id = v_revision.id
    AND content_sha256 = v_revision.content_sha256
    AND policy_version = v_policy;

  -- NEEDS_REVIEW is allowed only after the existing independent two-stage
  -- human approvals; this trigger runs inside that publish path. REJECTED and
  -- INCONCLUSIVE are always fail-closed.
  IF v_verdict IS NULL OR v_verdict NOT IN ('APPROVED','NEEDS_REVIEW') THEN
    RAISE EXCEPTION 'current automated validation decision required before publish'
      USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_question_validation_publish_gate ON public.questions;
CREATE TRIGGER trg_question_validation_publish_gate
BEFORE UPDATE OF published_revision_id ON public.questions
FOR EACH ROW EXECUTE FUNCTION public.tg_require_question_validation_decision();

-- Extend the existing governance detail projection with automated evidence.
-- The raw model output remains private; reviewers receive only typed findings
-- and the derived decision needed for an editorial action.
CREATE OR REPLACE FUNCTION public.get_question_content_revision(p_user_id uuid,p_revision_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE out jsonb;
BEGIN
 IF NOT (public.content_governance_has_permission(p_user_id,'content.prepare') OR public.content_governance_has_permission(p_user_id,'content.review.stage1') OR public.content_governance_has_permission(p_user_id,'content.review.stage2') OR public.content_governance_has_permission(p_user_id,'content.publish') OR public.content_governance_has_permission(p_user_id,'content.appeals.manage') OR public.content_governance_has_permission(p_user_id,'content.corrections.apply') OR public.content_governance_has_permission(p_user_id,'content.psychometrics.refresh')) THEN RAISE EXCEPTION 'governance permission required' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('revision',jsonb_build_object(
   'revisionId',r.id,'questionId',r.question_id,'revisionNo',r.revision_no,'status',r.status,
   'changeKind',r.change_kind,'summary',r.change_summary,'preparedAt',r.prepared_at,'publishedAt',r.published_at,
   'metadata',jsonb_strip_nulls(jsonb_build_object('game',r.game,'category',r.category,'subcategory',r.subcategory,'topic',r.topic,'difficulty',r.difficulty,'levelTag',r.level_tag,'examRef',r.exam_ref,'isBoss',r.is_boss)),
   'content',r.content,
   'source',jsonb_strip_nulls(jsonb_build_object('kind',s.source_kind,'title',s.source_title,'url',s.source_url,'licenseCode',s.license_code,'licenseUrl',s.license_url,'attribution',s.attribution,'provenanceRef',s.provenance_ref)),
   'outcomes',COALESCE((SELECT jsonb_agg(jsonb_build_object('outcomeId',o.outcome_id,'weight',o.weight,'primary',o.is_primary) ORDER BY o.is_primary DESC,o.outcome_id) FROM public.question_revision_outcomes o WHERE o.revision_id=r.id),'[]'::jsonb),
   'approvals',COALESCE((SELECT jsonb_agg(jsonb_build_object('stage',a.stage,'decision',a.decision,'decidedAt',a.decided_at) ORDER BY a.stage) FROM public.question_revision_approvals a WHERE a.revision_id=r.id),'[]'::jsonb),
   'validation',(SELECT jsonb_build_object('policyVersion',d.policy_version,'verdict',d.verdict,'findings',d.findings,'rationale',d.rationale,'blindConsensusIndex',d.blind_consensus_index,'blindAgreementRatio',d.blind_agreement_ratio,'decidedAt',d.decided_at) FROM public.question_validation_decisions d WHERE d.revision_id=r.id AND d.content_sha256=r.content_sha256 ORDER BY d.decided_at DESC LIMIT 1),
   'psychometrics',COALESCE((SELECT jsonb_agg(jsonb_build_object('windowStart',p.window_start,'windowEnd',p.window_end,'sampleN',p.sample_n,'correctN',p.correct_n,'pCorrect',p.p_correct,'wilsonLow',p.wilson_low,'wilsonHigh',p.wilson_high,'discrimination',p.discrimination,'materializedAt',p.materialized_at) ORDER BY p.window_end DESC) FROM (SELECT * FROM public.question_revision_psychometrics WHERE revision_id=r.id ORDER BY window_end DESC LIMIT 12) p),'[]'::jsonb),
   'incidents',COALESCE((SELECT jsonb_agg(jsonb_build_object('incidentId',i.id,'erroneousRevisionId',i.erroneous_revision_id,'correctedRevisionId',i.corrected_revision_id,'errorType',i.error_type,'status',i.status,'eligibleCount',i.eligible_count,'changedCount',i.changed_count,'manualRequiredCount',i.manual_required_count,'createdAt',i.created_at,'closedAt',i.closed_at) ORDER BY i.created_at DESC) FROM public.question_error_incidents i WHERE i.erroneous_revision_id=r.id OR i.corrected_revision_id=r.id),'[]'::jsonb)
 )) INTO out FROM public.question_content_revisions r LEFT JOIN public.question_revision_sources s ON s.revision_id=r.id WHERE r.id=p_revision_id;
 IF out IS NULL THEN RAISE EXCEPTION 'revision not found' USING ERRCODE='P0002'; END IF;
 RETURN out;
END $fn$;

DO $$
BEGIN
  IF to_regclass('public.question_content_revisions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'question_validation_runs_revision_fkey'
         AND conrelid = 'public.question_validation_runs'::regclass
     ) THEN
    ALTER TABLE public.question_validation_runs
      ADD CONSTRAINT question_validation_runs_revision_fkey
      FOREIGN KEY (revision_id) REFERENCES public.question_content_revisions(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

ALTER TABLE public.question_validation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_validation_runtime ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_validation_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.question_validation_runs, public.question_validation_runtime,
  public.question_validation_decisions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.question_validation_runs TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.question_validation_decisions TO service_role;
GRANT SELECT, UPDATE ON TABLE public.question_validation_runtime TO service_role;

-- The batch runner uses the service role through PostgREST. Governance migration
-- 106 intentionally revoked table-wide access, so expose only the columns the
-- validator snapshots; publishing and all other revision mutations stay revoked.
GRANT SELECT (id, question_id, game, category, subcategory, topic, exam_ref,
  difficulty, content, content_sha256, status)
  ON TABLE public.question_content_revisions TO service_role;
GRANT SELECT (id, game, category, subcategory, topic, exam_ref, difficulty,
  content, published_revision_id, is_active)
  ON TABLE public.questions TO service_role;

COMMIT;
