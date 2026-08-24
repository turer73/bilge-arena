-- Migration 146: community corroboration for revision-bound question quality.
--
-- This layer produces evidence for the existing governance authority. It can
-- quarantine a published revision through the established RPC, but it can
-- never publish or silently edit question content. Model verdicts and option
-- statistics are private auxiliary evidence and never replace the human floor.
BEGIN;

CREATE TABLE IF NOT EXISTS public.question_quality_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  state text NOT NULL DEFAULT 'collecting'
    CHECK (state IN ('collecting','suspected','quarantined','confirmed','rejected','inconclusive')),
  posterior_defect_probability numeric(10,9),
  leading_reason_code text,
  leading_correction_fingerprint text CHECK (
    leading_correction_fingerprint IS NULL OR leading_correction_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  independent_user_count integer NOT NULL DEFAULT 0 CHECK (independent_user_count BETWEEN 0 AND 1000000),
  independent_cluster_count integer NOT NULL DEFAULT 0 CHECK (independent_cluster_count BETWEEN 0 AND 1000000),
  trusted_agreement_count integer NOT NULL DEFAULT 0 CHECK (trusted_agreement_count BETWEEN 0 AND 1000000),
  opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at timestamptz,
  UNIQUE(revision_id),
  UNIQUE(revision_id,content_sha256),
  UNIQUE(id,question_id,revision_id,content_sha256)
);

CREATE INDEX IF NOT EXISTS question_quality_cases_state_updated_idx
  ON public.question_quality_cases(state,updated_at);

CREATE TABLE IF NOT EXISTS public.question_quality_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL UNIQUE REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  expected_verdict text NOT NULL CHECK (expected_verdict IN ('clean','flawed')),
  expected_reason_code text,
  expected_answer_index smallint NOT NULL CHECK (expected_answer_index BETWEEN 0 AND 4),
  expected_correction_fingerprint text CHECK (
    expected_correction_fingerprint IS NULL OR expected_correction_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  proof_kind text NOT NULL CHECK (proof_kind IN ('deterministic','official_source','curator')),
  proof_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(id,question_id,revision_id,content_sha256),
  CHECK (
    (expected_verdict='clean' AND expected_reason_code IS NULL AND expected_correction_fingerprint IS NULL)
    OR (expected_verdict='flawed' AND expected_reason_code IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.question_quality_worker_profiles (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  domain text NOT NULL CHECK (char_length(domain) BETWEEN 1 AND 80),
  resolved_total integer NOT NULL DEFAULT 0 CHECK (resolved_total >= 0),
  flawed_controls integer NOT NULL DEFAULT 0 CHECK (flawed_controls >= 0),
  flawed_controls_correct integer NOT NULL DEFAULT 0 CHECK (flawed_controls_correct BETWEEN 0 AND flawed_controls),
  clean_controls integer NOT NULL DEFAULT 0 CHECK (clean_controls >= 0),
  clean_controls_correct integer NOT NULL DEFAULT 0 CHECK (clean_controls_correct BETWEEN 0 AND clean_controls),
  correction_checks integer NOT NULL DEFAULT 0 CHECK (correction_checks >= 0),
  correction_checks_correct integer NOT NULL DEFAULT 0 CHECK (correction_checks_correct BETWEEN 0 AND correction_checks),
  trust_state text NOT NULL DEFAULT 'new' CHECK (trust_state IN ('new','established','trusted','restricted')),
  last_resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,domain)
);

CREATE TABLE IF NOT EXISTS public.question_quality_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  case_id uuid REFERENCES public.question_quality_cases(id) ON DELETE RESTRICT,
  control_id uuid REFERENCES public.question_quality_controls(id) ON DELETE RESTRICT,
  appeal_id uuid UNIQUE REFERENCES public.question_appeals(id) ON DELETE RESTRICT,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  source text NOT NULL CHECK (source IN ('appeal','assigned_review')),
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','submitted','expired','cancelled')),
  independence_key text NOT NULL CHECK (independence_key ~ '^[0-9a-f]{64}$'),
  locked_answer_index smallint CHECK (locked_answer_index IS NULL OR locked_answer_index BETWEEN 0 AND 4),
  locked_at timestamptz,
  assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp() + interval '24 hours',
  submitted_at timestamptz,
  CHECK ((case_id IS NOT NULL)::integer + (control_id IS NOT NULL)::integer = 1),
  CHECK ((locked_answer_index IS NULL)=(locked_at IS NULL)),
  CHECK (expires_at > assigned_at),
  FOREIGN KEY(case_id,question_id,revision_id,content_sha256)
    REFERENCES public.question_quality_cases(id,question_id,revision_id,content_sha256) ON DELETE RESTRICT,
  FOREIGN KEY(control_id,question_id,revision_id,content_sha256)
    REFERENCES public.question_quality_controls(id,question_id,revision_id,content_sha256) ON DELETE RESTRICT,
  UNIQUE(id,user_id,revision_id,independence_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS question_quality_one_open_mission_user_revision
  ON public.question_quality_missions(user_id,revision_id)
  WHERE status='assigned';
CREATE INDEX IF NOT EXISTS question_quality_missions_case_status_idx
  ON public.question_quality_missions(case_id,status);

CREATE TABLE IF NOT EXISTS public.question_quality_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL UNIQUE REFERENCES public.question_quality_missions(id) ON DELETE RESTRICT,
  case_id uuid REFERENCES public.question_quality_cases(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  solved_answer_index smallint CHECK (solved_answer_index IS NULL OR solved_answer_index BETWEEN 0 AND 4),
  verdict text NOT NULL CHECK (verdict IN ('clean','flawed')),
  reason_code text CHECK (reason_code IS NULL OR reason_code IN ('wrong_key','ambiguous','invalid_content','outcome_mismatch','other')),
  proposed_answer_index smallint CHECK (proposed_answer_index IS NULL OR proposed_answer_index BETWEEN 0 AND 4),
  correction_text text CHECK (correction_text IS NULL OR char_length(btrim(correction_text)) BETWEEN 1 AND 1000),
  correction_fingerprint text CHECK (correction_fingerprint IS NULL OR correction_fingerprint ~ '^[0-9a-f]{64}$'),
  explanation text NOT NULL CHECK (char_length(btrim(explanation)) BETWEEN 0 AND 2000),
  confidence smallint NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  independence_key text NOT NULL CHECK (independence_key ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(mission_id,user_id,revision_id,independence_key)
    REFERENCES public.question_quality_missions(id,user_id,revision_id,independence_key) ON DELETE RESTRICT,
  CHECK (
    (verdict='clean' AND reason_code IS NULL AND correction_fingerprint IS NULL)
    OR (verdict='flawed' AND reason_code IS NOT NULL AND correction_fingerprint IS NOT NULL AND char_length(btrim(explanation)) >= 20)
  )
);

CREATE INDEX IF NOT EXISTS question_quality_claims_case_created_idx
  ON public.question_quality_claims(case_id,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS question_quality_claims_user_revision
  ON public.question_quality_claims(user_id,revision_id);

CREATE OR REPLACE FUNCTION public.tg_question_quality_mission_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.case_id IS DISTINCT FROM OLD.case_id
    OR NEW.control_id IS DISTINCT FROM OLD.control_id
    OR NEW.appeal_id IS DISTINCT FROM OLD.appeal_id
    OR NEW.question_id IS DISTINCT FROM OLD.question_id
    OR NEW.revision_id IS DISTINCT FROM OLD.revision_id
    OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
    OR NEW.source IS DISTINCT FROM OLD.source
    OR NEW.independence_key IS DISTINCT FROM OLD.independence_key
    OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'question quality mission evidence is immutable' USING ERRCODE='42501';
  END IF;
  IF OLD.locked_answer_index IS NOT NULL AND (
    NEW.locked_answer_index IS DISTINCT FROM OLD.locked_answer_index
    OR NEW.locked_at IS DISTINCT FROM OLD.locked_at
  ) THEN
    RAISE EXCEPTION 'locked quality mission answer is immutable' USING ERRCODE='42501';
  END IF;
  IF OLD.locked_answer_index IS NULL AND NEW.locked_answer_index IS NOT NULL
    AND (OLD.status<>'assigned' OR NEW.locked_at IS NULL) THEN
    RAISE EXCEPTION 'quality mission answer cannot be locked' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_question_quality_mission_immutable ON public.question_quality_missions;
CREATE TRIGGER trg_question_quality_mission_immutable
BEFORE UPDATE ON public.question_quality_missions
FOR EACH ROW EXECUTE FUNCTION public.tg_question_quality_mission_immutable();

CREATE OR REPLACE FUNCTION public.tg_question_quality_claim_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN
  RAISE EXCEPTION 'question quality claims are append-only' USING ERRCODE='42501';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_question_quality_claim_append_only ON public.question_quality_claims;
CREATE TRIGGER trg_question_quality_claim_append_only
BEFORE UPDATE OR DELETE ON public.question_quality_claims
FOR EACH ROW EXECUTE FUNCTION public.tg_question_quality_claim_append_only();

CREATE TABLE IF NOT EXISTS public.question_quality_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.question_quality_cases(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('model_a','model_b','research')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','ok','failed','skipped')),
  provider_id text,
  model_id text,
  prompt_version text,
  direction text CHECK (direction IS NULL OR direction IN ('supports_clean','supports_flaw','inconclusive')),
  strength numeric(5,4) CHECK (strength IS NULL OR strength BETWEEN 0 AND 1),
  predicted_answer_index smallint CHECK (predicted_answer_index IS NULL OR predicted_answer_index BETWEEN 0 AND 4),
  finding_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  input_sha256 text CHECK (input_sha256 IS NULL OR input_sha256 ~ '^[0-9a-f]{64}$'),
  started_at timestamptz,
  completed_at timestamptz,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  last_error text CHECK (last_error IS NULL OR char_length(last_error) <= 1000),
  UNIQUE(case_id,role)
);

CREATE INDEX IF NOT EXISTS question_quality_verifications_pending_idx
  ON public.question_quality_verifications(status,role)
  WHERE status IN ('pending','running');

CREATE TABLE IF NOT EXISTS public.question_quality_case_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.question_quality_cases(id) ON DELETE RESTRICT,
  proof_kind text NOT NULL CHECK (proof_kind IN ('deterministic','official_source','curator')),
  direction text NOT NULL CHECK (direction IN ('supports_clean','supports_flaw')),
  evidence jsonb NOT NULL,
  inputs_sha256 text NOT NULL CHECK (inputs_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(case_id,proof_kind,inputs_sha256)
);

CREATE TABLE IF NOT EXISTS public.question_quality_consensus_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.question_quality_cases(id) ON DELETE RESTRICT,
  policy_version text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('collecting','suspected','quarantine','confirmed','rejected','inconclusive')),
  posterior_defect_probability numeric(10,9) NOT NULL CHECK (posterior_defect_probability BETWEEN 0 AND 1),
  independent_user_count integer NOT NULL CHECK (independent_user_count BETWEEN 0 AND 1000000),
  independent_cluster_count integer NOT NULL CHECK (independent_cluster_count BETWEEN 0 AND 1000000),
  trusted_agreement_count integer NOT NULL CHECK (trusted_agreement_count BETWEEN 0 AND 1000000),
  leading_reason_code text CHECK (leading_reason_code IS NULL OR leading_reason_code IN ('wrong_key','ambiguous','invalid_content','outcome_mismatch','other')),
  leading_correction_fingerprint text CHECK (leading_correction_fingerprint IS NULL OR leading_correction_fingerprint ~ '^[0-9a-f]{64}$'),
  external_proof_kind text NOT NULL DEFAULT 'none'
    CHECK (external_proof_kind IN ('none','deterministic','official_source','curator')),
  inputs_sha256 text NOT NULL CHECK (inputs_sha256 ~ '^[0-9a-f]{64}$'),
  rationale text NOT NULL CHECK (char_length(btrim(rationale)) BETWEEN 1 AND 2000),
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(case_id,policy_version,inputs_sha256)
);

CREATE TABLE IF NOT EXISTS public.question_quality_consensus_queue (
  case_id uuid PRIMARY KEY REFERENCES public.question_quality_cases(id) ON DELETE CASCADE,
  dirty_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  claimed_at timestamptz,
  claimed_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10)
);

ALTER TABLE public.question_quality_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_quality_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_quality_worker_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_quality_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_quality_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_quality_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_quality_case_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_quality_consensus_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_quality_consensus_queue ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.question_quality_cases,public.question_quality_controls,
  public.question_quality_worker_profiles,public.question_quality_missions,
  public.question_quality_claims,public.question_quality_verifications,
  public.question_quality_case_proofs,public.question_quality_consensus_decisions,
  public.question_quality_consensus_queue FROM PUBLIC,anon,authenticated,service_role;

-- Only the learner's final mission/claim status is readable. Control identity,
-- peer reports, model evidence and option statistics remain hidden.
GRANT SELECT ON TABLE public.question_quality_worker_profiles TO authenticated;
DROP POLICY IF EXISTS question_quality_worker_profiles_own_select ON public.question_quality_worker_profiles;
CREATE POLICY question_quality_worker_profiles_own_select ON public.question_quality_worker_profiles
  FOR SELECT TO authenticated USING ((SELECT auth.uid())=user_id);

CREATE OR REPLACE FUNCTION public.question_quality_correction_fingerprint(
  p_reason_code text,p_proposed_answer_index integer,p_correction_text text
)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
  SELECT encode(extensions.digest(
    jsonb_build_object(
      'reasonCode',p_reason_code,
      'proposedAnswerIndex',p_proposed_answer_index,
      'correctionText',lower(replace(replace(
        normalize(regexp_replace(btrim(COALESCE(p_correction_text,'')),'\s+',' ','g'),NFKC),
        'İ','i'),'I','ı'))
    )::text,
    'sha256'
  ),'hex')
$fn$;

REVOKE ALL ON FUNCTION public.question_quality_correction_fingerprint(text,integer,text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.submit_question_quality_claim(
  p_user_id uuid,p_appeal_id uuid,p_solved_answer_index integer,p_verdict text,p_reason_code text,
  p_proposed_answer_index integer,p_correction_text text,p_explanation text,
  p_confidence integer,p_independence_key text,p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE
  appeal public.question_appeals%ROWTYPE;
  revision public.question_content_revisions%ROWTYPE;
  option_count integer;
  quality_case public.question_quality_cases%ROWTYPE;
  mission public.question_quality_missions%ROWTYPE;
  claim public.question_quality_claims%ROWTYPE;
  fingerprint text;
  domain_name text;
  old_request public.content_governance_requests%ROWTYPE;
  payload_hash text;
  result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_appeal_id IS NULL OR p_request_id IS NULL
    OR p_solved_answer_index NOT BETWEEN 0 AND 4
    OR p_verdict NOT IN ('clean','flawed')
    OR p_confidence NOT BETWEEN 0 AND 100
    OR p_independence_key !~ '^[0-9a-f]{64}$'
    OR (p_proposed_answer_index IS NOT NULL AND p_proposed_answer_index NOT BETWEEN 0 AND 4)
    OR char_length(btrim(COALESCE(p_correction_text,''))) > 1000
    OR char_length(btrim(COALESCE(p_explanation,''))) > 2000 THEN
    RAISE EXCEPTION 'invalid quality claim' USING ERRCODE='22023';
  END IF;
  IF p_verdict='flawed' AND (
    p_reason_code NOT IN ('wrong_key','ambiguous','invalid_content','outcome_mismatch','other')
    OR char_length(btrim(COALESCE(p_explanation,''))) < 20
    OR (p_proposed_answer_index IS NULL AND NULLIF(btrim(COALESCE(p_correction_text,'')),'') IS NULL)
  ) THEN RAISE EXCEPTION 'a flawed claim needs a structured reason and explanation' USING ERRCODE='22023'; END IF;
  IF p_verdict='clean' AND (p_reason_code IS NOT NULL OR p_proposed_answer_index IS NOT NULL OR NULLIF(btrim(COALESCE(p_correction_text,'')),'') IS NOT NULL) THEN
    RAISE EXCEPTION 'clean claim cannot include a correction' USING ERRCODE='22023';
  END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'quality_appeal_claim',p_request_id);
  payload_hash:=public.content_governance_hash(jsonb_build_object(
    'appealId',p_appeal_id,'solvedAnswerIndex',p_solved_answer_index,
    'verdict',p_verdict,'reasonCode',p_reason_code,
    'proposedAnswerIndex',p_proposed_answer_index,'correctionText',p_correction_text,
    'explanation',p_explanation,'confidence',p_confidence,'independenceKey',p_independence_key
  ));
  SELECT * INTO old_request FROM public.content_governance_requests
  WHERE user_id=p_user_id AND operation='quality_appeal_claim' AND request_id=p_request_id;
  IF FOUND THEN
    IF old_request.payload_hash<>payload_hash THEN RAISE EXCEPTION 'quality claim request payload mismatch' USING ERRCODE='22023'; END IF;
    RETURN old_request.result||jsonb_build_object('replayed',true);
  END IF;

  SELECT * INTO appeal FROM public.question_appeals
  WHERE id=p_appeal_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appeal owner mismatch' USING ERRCODE='42501'; END IF;
  IF appeal.revision_id IS NULL OR appeal.evidence_kind NOT IN ('issued_attempt','verified_session') THEN
    RAISE EXCEPTION 'revision-bound attempt evidence required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO revision FROM public.question_content_revisions
  WHERE id=appeal.revision_id AND question_id=appeal.question_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'appeal revision missing' USING ERRCODE='P0002'; END IF;
  option_count:=CASE WHEN jsonb_typeof(revision.content->'options')='array'
    THEN jsonb_array_length(revision.content->'options') ELSE 0 END;
  IF option_count<2 OR p_solved_answer_index>=option_count
    OR (p_proposed_answer_index IS NOT NULL AND p_proposed_answer_index>=option_count) THEN
    RAISE EXCEPTION 'quality claim answer is outside revision options' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.question_quality_cases(question_id,revision_id,content_sha256)
  VALUES(appeal.question_id,revision.id,revision.content_sha256)
  ON CONFLICT(revision_id) DO UPDATE SET updated_at=clock_timestamp()
  RETURNING * INTO quality_case;

  INSERT INTO public.question_quality_missions(
    user_id,case_id,appeal_id,question_id,revision_id,content_sha256,source,status,independence_key,submitted_at
  ) VALUES(
    p_user_id,quality_case.id,p_appeal_id,appeal.question_id,revision.id,revision.content_sha256,
    'appeal','submitted',p_independence_key,clock_timestamp()
  ) ON CONFLICT(appeal_id) DO UPDATE SET status='submitted',submitted_at=COALESCE(public.question_quality_missions.submitted_at,clock_timestamp())
  RETURNING * INTO mission;

  fingerprint:=CASE WHEN p_verdict='flawed' THEN public.question_quality_correction_fingerprint(
    p_reason_code,p_proposed_answer_index,p_correction_text
  ) ELSE NULL END;
  INSERT INTO public.question_quality_claims(
    mission_id,case_id,user_id,revision_id,solved_answer_index,verdict,reason_code,proposed_answer_index,
    correction_text,correction_fingerprint,explanation,confidence,independence_key
  ) VALUES(
    mission.id,quality_case.id,p_user_id,revision.id,p_solved_answer_index,p_verdict,
    CASE WHEN p_verdict='flawed' THEN p_reason_code ELSE NULL END,
    CASE WHEN p_verdict='flawed' THEN p_proposed_answer_index ELSE NULL END,
    CASE WHEN p_verdict='flawed' THEN NULLIF(btrim(COALESCE(p_correction_text,'')),'') ELSE NULL END,
    fingerprint,btrim(COALESCE(p_explanation,'')),p_confidence,p_independence_key
  ) ON CONFLICT(mission_id) DO NOTHING RETURNING * INTO claim;
  IF NOT FOUND THEN
    SELECT * INTO claim FROM public.question_quality_claims WHERE mission_id=mission.id;
    IF claim.solved_answer_index IS DISTINCT FROM p_solved_answer_index
      OR claim.verdict IS DISTINCT FROM p_verdict
      OR claim.reason_code IS DISTINCT FROM CASE WHEN p_verdict='flawed' THEN p_reason_code ELSE NULL END
      OR claim.proposed_answer_index IS DISTINCT FROM CASE WHEN p_verdict='flawed' THEN p_proposed_answer_index ELSE NULL END
      OR claim.correction_text IS DISTINCT FROM CASE WHEN p_verdict='flawed' THEN NULLIF(btrim(COALESCE(p_correction_text,'')),'') ELSE NULL END
      OR claim.explanation IS DISTINCT FROM btrim(COALESCE(p_explanation,''))
      OR claim.confidence IS DISTINCT FROM p_confidence THEN
      RAISE EXCEPTION 'quality appeal already has different evidence' USING ERRCODE='P0003';
    END IF;
  END IF;

  INSERT INTO public.question_quality_verifications(case_id,role)
  VALUES(quality_case.id,'model_a'),(quality_case.id,'model_b'),(quality_case.id,'research')
  ON CONFLICT(case_id,role) DO NOTHING;
  INSERT INTO public.question_quality_consensus_queue(case_id)
  VALUES(quality_case.id)
  ON CONFLICT(case_id) DO UPDATE SET
    dirty_at=clock_timestamp(),claimed_at=NULL,claimed_by=NULL,attempts=0;

  domain_name:=COALESCE(NULLIF(revision.game,''),'general');
  INSERT INTO public.question_quality_worker_profiles(user_id,domain)
  VALUES(p_user_id,domain_name) ON CONFLICT(user_id,domain) DO NOTHING;

  result:=jsonb_build_object(
    'caseId',quality_case.id,'claimId',claim.id,'missionId',mission.id,
    'state',quality_case.state,'rewardEligible',false,'replayed',false
  );
  INSERT INTO public.content_governance_requests VALUES(
    p_user_id,'quality_appeal_claim',p_request_id,payload_hash,result,clock_timestamp()
  );
  RETURN result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_next_question_quality_mission(
  p_user_id uuid,p_independence_key text,p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE
  old_request public.content_governance_requests%ROWTYPE;
  payload_hash text;
  mission public.question_quality_missions%ROWTYPE;
  quality_case public.question_quality_cases%ROWTYPE;
  control public.question_quality_controls%ROWTYPE;
  revision public.question_content_revisions%ROWTYPE;
  control_rate numeric:=0.20;
  choose_control boolean;
  result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_independence_key !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid quality mission request' USING ERRCODE='22023';
  END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'quality_mission_assign',p_request_id);
  payload_hash:=public.content_governance_hash(jsonb_build_object('independenceKey',p_independence_key));
  SELECT * INTO old_request FROM public.content_governance_requests
  WHERE user_id=p_user_id AND operation='quality_mission_assign' AND request_id=p_request_id;
  IF FOUND THEN
    IF old_request.payload_hash<>payload_hash THEN RAISE EXCEPTION 'quality mission request payload mismatch' USING ERRCODE='22023'; END IF;
    RETURN old_request.result||jsonb_build_object('replayed',true);
  END IF;

  SELECT * INTO mission FROM public.question_quality_missions
  WHERE user_id=p_user_id AND status='assigned' AND expires_at>clock_timestamp()
  ORDER BY assigned_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    SELECT * INTO revision FROM public.question_content_revisions WHERE id=mission.revision_id;
  ELSE
    IF EXISTS(SELECT 1 FROM public.question_quality_worker_profiles WHERE user_id=p_user_id AND trust_state='restricted') THEN control_rate:=0.35;
    ELSIF EXISTS(SELECT 1 FROM public.question_quality_worker_profiles WHERE user_id=p_user_id AND trust_state='trusted') THEN control_rate:=0.075;
    END IF;
    choose_control:=random()<control_rate;

    IF choose_control THEN
      SELECT c.* INTO control FROM public.question_quality_controls c
      WHERE c.active AND NOT EXISTS(
        SELECT 1 FROM public.question_quality_missions m WHERE m.user_id=p_user_id AND m.revision_id=c.revision_id
      ) ORDER BY random() LIMIT 1;
    END IF;
    IF control.id IS NULL THEN
      SELECT c.* INTO quality_case FROM public.question_quality_cases c
      WHERE c.state IN ('collecting','suspected')
        AND c.independent_user_count<11
        AND NOT EXISTS(SELECT 1 FROM public.question_quality_missions m WHERE m.user_id=p_user_id AND m.revision_id=c.revision_id)
      ORDER BY c.updated_at,c.id LIMIT 1 FOR UPDATE SKIP LOCKED;
    END IF;
    IF control.id IS NULL AND quality_case.id IS NULL THEN
      SELECT c.* INTO control FROM public.question_quality_controls c
      WHERE c.active AND NOT EXISTS(
        SELECT 1 FROM public.question_quality_missions m WHERE m.user_id=p_user_id AND m.revision_id=c.revision_id
      ) ORDER BY random() LIMIT 1;
    END IF;
    IF control.id IS NULL AND quality_case.id IS NULL THEN
      result:=jsonb_build_object('mission',NULL,'replayed',false);
      INSERT INTO public.content_governance_requests VALUES(
        p_user_id,'quality_mission_assign',p_request_id,payload_hash,result,clock_timestamp()
      );
      RETURN result;
    END IF;

    IF control.id IS NOT NULL THEN
      SELECT * INTO revision FROM public.question_content_revisions WHERE id=control.revision_id;
      INSERT INTO public.question_quality_missions(
        user_id,control_id,question_id,revision_id,content_sha256,source,independence_key
      ) VALUES(p_user_id,control.id,control.question_id,control.revision_id,control.content_sha256,'assigned_review',p_independence_key)
      RETURNING * INTO mission;
    ELSE
      SELECT * INTO revision FROM public.question_content_revisions WHERE id=quality_case.revision_id;
      INSERT INTO public.question_quality_missions(
        user_id,case_id,question_id,revision_id,content_sha256,source,independence_key
      ) VALUES(p_user_id,quality_case.id,quality_case.question_id,quality_case.revision_id,quality_case.content_sha256,'assigned_review',p_independence_key)
      RETURNING * INTO mission;
    END IF;
  END IF;

  result:=jsonb_build_object('mission',jsonb_build_object(
    'missionId',mission.id,'questionId',mission.question_id,'revisionId',mission.revision_id,
    'expiresAt',mission.expires_at,'examRef',revision.exam_ref,'subject',revision.category,
    'topic',revision.topic,'content',revision.content-ARRAY['answer','correct','solution','explanation']
  ),'replayed',false);
  INSERT INTO public.content_governance_requests VALUES(
    p_user_id,'quality_mission_assign',p_request_id,payload_hash,result,clock_timestamp()
  );
  RETURN result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.lock_question_quality_mission_answer(
  p_user_id uuid,p_mission_id uuid,p_selected_answer_index integer,p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE
  old_request public.content_governance_requests%ROWTYPE;
  payload_hash text;
  mission public.question_quality_missions%ROWTYPE;
  revision public.question_content_revisions%ROWTYPE;
  option_count integer;
  result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_mission_id IS NULL OR p_request_id IS NULL
    OR p_selected_answer_index NOT BETWEEN 0 AND 4 THEN
    RAISE EXCEPTION 'invalid quality mission answer lock' USING ERRCODE='22023';
  END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'quality_mission_answer_lock',p_request_id);
  payload_hash:=public.content_governance_hash(jsonb_build_object(
    'missionId',p_mission_id,'selectedAnswerIndex',p_selected_answer_index
  ));
  SELECT * INTO old_request FROM public.content_governance_requests
  WHERE user_id=p_user_id AND operation='quality_mission_answer_lock' AND request_id=p_request_id;
  IF FOUND THEN
    IF old_request.payload_hash<>payload_hash THEN
      RAISE EXCEPTION 'quality mission answer lock mismatch' USING ERRCODE='22023';
    END IF;
    RETURN old_request.result||jsonb_build_object('replayed',true);
  END IF;

  SELECT * INTO mission FROM public.question_quality_missions
  WHERE id=p_mission_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quality mission owner mismatch' USING ERRCODE='42501'; END IF;
  IF mission.status<>'assigned' OR mission.expires_at<=clock_timestamp() THEN
    UPDATE public.question_quality_missions SET status='expired'
    WHERE id=mission.id AND status='assigned' AND locked_answer_index IS NULL;
    RAISE EXCEPTION 'quality mission expired' USING ERRCODE='P0003';
  END IF;
  IF mission.locked_answer_index IS NOT NULL THEN
    IF mission.locked_answer_index<>p_selected_answer_index THEN
      RAISE EXCEPTION 'quality mission answer is already locked' USING ERRCODE='P0003';
    END IF;
    result:=jsonb_build_object('missionId',mission.id,'status','answer_locked','replayed',true);
    INSERT INTO public.content_governance_requests VALUES(
      p_user_id,'quality_mission_answer_lock',p_request_id,payload_hash,result,clock_timestamp()
    );
    RETURN result;
  END IF;

  SELECT * INTO revision FROM public.question_content_revisions WHERE id=mission.revision_id;
  option_count:=CASE WHEN jsonb_typeof(revision.content->'options')='array'
    THEN jsonb_array_length(revision.content->'options') ELSE 0 END;
  IF option_count<2 OR p_selected_answer_index>=option_count THEN
    RAISE EXCEPTION 'selected answer is outside revision options' USING ERRCODE='22023';
  END IF;

  UPDATE public.question_quality_missions SET
    locked_answer_index=p_selected_answer_index,locked_at=clock_timestamp()
  WHERE id=mission.id;
  result:=jsonb_build_object('missionId',mission.id,'status','answer_locked','replayed',false);
  INSERT INTO public.content_governance_requests VALUES(
    p_user_id,'quality_mission_answer_lock',p_request_id,payload_hash,result,clock_timestamp()
  );
  RETURN result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.submit_assigned_question_quality_mission(
  p_user_id uuid,p_mission_id uuid,p_selected_answer_index integer,p_verdict text,p_reason_code text,
  p_proposed_answer_index integer,p_correction_text text,p_explanation text,
  p_confidence integer,p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE
  old_request public.content_governance_requests%ROWTYPE;
  payload_hash text;
  mission public.question_quality_missions%ROWTYPE;
  control public.question_quality_controls%ROWTYPE;
  claim public.question_quality_claims%ROWTYPE;
  revision public.question_content_revisions%ROWTYPE;
  option_count integer;
  fingerprint text;
  claim_correct boolean:=false;
  correction_correct boolean:=false;
  domain_name text;
  result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_mission_id IS NULL OR p_request_id IS NULL
    OR p_selected_answer_index NOT BETWEEN 0 AND 4
    OR p_verdict NOT IN ('clean','flawed') OR p_confidence NOT BETWEEN 0 AND 100
    OR (p_proposed_answer_index IS NOT NULL AND p_proposed_answer_index NOT BETWEEN 0 AND 4)
    OR char_length(btrim(COALESCE(p_correction_text,'')))>1000
    OR char_length(btrim(COALESCE(p_explanation,'')))>2000 THEN
    RAISE EXCEPTION 'invalid quality mission submission' USING ERRCODE='22023';
  END IF;
  IF p_verdict='flawed' AND (
    p_reason_code NOT IN ('wrong_key','ambiguous','invalid_content','outcome_mismatch','other')
    OR char_length(btrim(COALESCE(p_explanation,'')))<20
    OR (p_proposed_answer_index IS NULL AND NULLIF(btrim(COALESCE(p_correction_text,'')),'') IS NULL)
  ) THEN RAISE EXCEPTION 'a flawed claim needs a structured reason and explanation' USING ERRCODE='22023'; END IF;
  IF p_verdict='clean' AND (p_reason_code IS NOT NULL OR p_proposed_answer_index IS NOT NULL OR NULLIF(btrim(COALESCE(p_correction_text,'')),'') IS NOT NULL) THEN
    RAISE EXCEPTION 'clean claim cannot include a correction' USING ERRCODE='22023';
  END IF;

  PERFORM public.content_governance_lock_request(p_user_id,'quality_mission_submit',p_request_id);
  payload_hash:=public.content_governance_hash(jsonb_build_object(
    'missionId',p_mission_id,'selectedAnswerIndex',p_selected_answer_index,
    'verdict',p_verdict,'reasonCode',p_reason_code,
    'proposedAnswerIndex',p_proposed_answer_index,'correctionText',p_correction_text,
    'explanation',p_explanation,'confidence',p_confidence
  ));
  SELECT * INTO old_request FROM public.content_governance_requests
  WHERE user_id=p_user_id AND operation='quality_mission_submit' AND request_id=p_request_id;
  IF FOUND THEN
    IF old_request.payload_hash<>payload_hash THEN RAISE EXCEPTION 'quality mission submission mismatch' USING ERRCODE='22023'; END IF;
    RETURN old_request.result||jsonb_build_object('replayed',true);
  END IF;

  SELECT * INTO mission FROM public.question_quality_missions
  WHERE id=p_mission_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quality mission owner mismatch' USING ERRCODE='42501'; END IF;
  IF mission.status='submitted' THEN
    SELECT * INTO claim FROM public.question_quality_claims WHERE mission_id=mission.id;
    IF claim.solved_answer_index IS DISTINCT FROM p_selected_answer_index
      OR claim.verdict IS DISTINCT FROM p_verdict
      OR claim.reason_code IS DISTINCT FROM CASE WHEN p_verdict='flawed' THEN p_reason_code ELSE NULL END
      OR claim.proposed_answer_index IS DISTINCT FROM CASE WHEN p_verdict='flawed' THEN p_proposed_answer_index ELSE NULL END
      OR claim.correction_text IS DISTINCT FROM CASE WHEN p_verdict='flawed' THEN NULLIF(btrim(COALESCE(p_correction_text,'')),'') ELSE NULL END
      OR claim.explanation IS DISTINCT FROM btrim(COALESCE(p_explanation,''))
      OR claim.confidence IS DISTINCT FROM p_confidence THEN
      RAISE EXCEPTION 'quality mission is already submitted with different evidence' USING ERRCODE='P0003';
    END IF;
    result:=jsonb_build_object('missionId',mission.id,'claimId',claim.id,'status','submitted','rewardEligible',false,'replayed',true);
    INSERT INTO public.content_governance_requests VALUES(p_user_id,'quality_mission_submit',p_request_id,payload_hash,result,clock_timestamp());
    RETURN result;
  END IF;
  IF mission.status<>'assigned' OR mission.expires_at<=clock_timestamp() THEN
    UPDATE public.question_quality_missions SET status='expired' WHERE id=mission.id AND status='assigned';
    RAISE EXCEPTION 'quality mission expired' USING ERRCODE='P0003';
  END IF;
  IF mission.locked_answer_index IS NULL OR mission.locked_at IS NULL
    OR mission.locked_answer_index<>p_selected_answer_index THEN
    RAISE EXCEPTION 'quality mission answer must be locked first' USING ERRCODE='P0003';
  END IF;
  SELECT * INTO revision FROM public.question_content_revisions WHERE id=mission.revision_id;
  option_count:=CASE WHEN jsonb_typeof(revision.content->'options')='array'
    THEN jsonb_array_length(revision.content->'options') ELSE 0 END;
  IF p_proposed_answer_index IS NOT NULL AND p_proposed_answer_index>=option_count THEN
    RAISE EXCEPTION 'proposed answer is outside revision options' USING ERRCODE='22023';
  END IF;
  fingerprint:=CASE WHEN p_verdict='flawed' THEN public.question_quality_correction_fingerprint(
    p_reason_code,p_proposed_answer_index,p_correction_text
  ) ELSE NULL END;
  IF mission.case_id IS NOT NULL THEN
    PERFORM 1 FROM public.question_quality_cases WHERE id=mission.case_id FOR UPDATE;
  END IF;
  INSERT INTO public.question_quality_claims(
    mission_id,case_id,user_id,revision_id,solved_answer_index,verdict,reason_code,proposed_answer_index,
    correction_text,correction_fingerprint,explanation,confidence,independence_key
  ) VALUES(
    mission.id,mission.case_id,p_user_id,mission.revision_id,mission.locked_answer_index,p_verdict,
    CASE WHEN p_verdict='flawed' THEN p_reason_code ELSE NULL END,
    CASE WHEN p_verdict='flawed' THEN p_proposed_answer_index ELSE NULL END,
    CASE WHEN p_verdict='flawed' THEN NULLIF(btrim(COALESCE(p_correction_text,'')),'') ELSE NULL END,
    fingerprint,btrim(COALESCE(p_explanation,'')),p_confidence,mission.independence_key
  ) RETURNING * INTO claim;
  UPDATE public.question_quality_missions SET status='submitted',submitted_at=clock_timestamp() WHERE id=mission.id;

  domain_name:=COALESCE(NULLIF(revision.game,''),'general');
  INSERT INTO public.question_quality_worker_profiles(user_id,domain)
  VALUES(p_user_id,domain_name) ON CONFLICT(user_id,domain) DO NOTHING;

  IF mission.control_id IS NOT NULL THEN
    SELECT * INTO control FROM public.question_quality_controls WHERE id=mission.control_id;
    claim_correct:=(control.expected_verdict=p_verdict)
      AND control.expected_answer_index=p_selected_answer_index AND (
      p_verdict='clean' OR (
        control.expected_reason_code=p_reason_code
        AND (control.expected_correction_fingerprint IS NULL OR control.expected_correction_fingerprint=fingerprint)
      )
    );
    correction_correct:=control.expected_verdict='flawed'
      AND control.expected_correction_fingerprint IS NOT NULL
      AND control.expected_correction_fingerprint=fingerprint;
    UPDATE public.question_quality_worker_profiles SET
      resolved_total=resolved_total+1,
      flawed_controls=flawed_controls+CASE WHEN control.expected_verdict='flawed' THEN 1 ELSE 0 END,
      flawed_controls_correct=flawed_controls_correct+CASE WHEN control.expected_verdict='flawed' AND claim_correct THEN 1 ELSE 0 END,
      clean_controls=clean_controls+CASE WHEN control.expected_verdict='clean' THEN 1 ELSE 0 END,
      clean_controls_correct=clean_controls_correct+CASE WHEN control.expected_verdict='clean' AND claim_correct THEN 1 ELSE 0 END,
      correction_checks=correction_checks+CASE WHEN control.expected_correction_fingerprint IS NOT NULL THEN 1 ELSE 0 END,
      correction_checks_correct=correction_checks_correct+CASE WHEN correction_correct THEN 1 ELSE 0 END,
      last_resolved_at=clock_timestamp(),updated_at=clock_timestamp()
    WHERE user_id=p_user_id AND domain=domain_name;
    UPDATE public.question_quality_worker_profiles SET trust_state=CASE
      WHEN trust_state='restricted' THEN 'restricted'
      WHEN resolved_total>=20 AND flawed_controls>=5 AND clean_controls>=5
        AND (flawed_controls_correct+2)::numeric/(flawed_controls+4)>=0.70
        AND (clean_controls_correct+2)::numeric/(clean_controls+4)>=0.80 THEN 'trusted'
      WHEN resolved_total>=10 THEN 'established' ELSE 'new' END
    WHERE user_id=p_user_id AND domain=domain_name;
  ELSE
    INSERT INTO public.question_quality_verifications(case_id,role)
    VALUES(mission.case_id,'model_a'),(mission.case_id,'model_b'),(mission.case_id,'research')
    ON CONFLICT(case_id,role) DO NOTHING;
    INSERT INTO public.question_quality_consensus_queue(case_id)
    VALUES(mission.case_id)
    ON CONFLICT(case_id) DO UPDATE SET
      dirty_at=clock_timestamp(),claimed_at=NULL,claimed_by=NULL,attempts=0;
  END IF;

  result:=jsonb_build_object('missionId',mission.id,'claimId',claim.id,'status','submitted','rewardEligible',false,'replayed',false);
  INSERT INTO public.content_governance_requests VALUES(p_user_id,'quality_mission_submit',p_request_id,payload_hash,result,clock_timestamp());
  RETURN result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_question_quality_case_evidence(
  p_actor_id uuid,p_case_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE result jsonb;
BEGIN
  IF NOT (
    public.content_governance_has_permission(p_actor_id,'content.appeals.manage')
    OR public.content_governance_has_permission(p_actor_id,'content.corrections.apply')
  ) THEN RAISE EXCEPTION 'quality evidence permission required' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'case',jsonb_build_object(
      'caseId',c.id,'questionId',c.question_id,'revisionId',c.revision_id,
      'contentSha256',c.content_sha256,'state',c.state,'content',r.content,
      'game',r.game,'category',r.category,'topic',r.topic,'examRef',r.exam_ref
    ),
    'claims',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'claimId',cl.id,'userId',cl.user_id,'independenceKey',cl.independence_key,
      'verdict',cl.verdict,'reasonCode',cl.reason_code,'correctionFingerprint',cl.correction_fingerprint,
      'confidence',cl.confidence,'createdAt',cl.created_at,
      'profile',jsonb_build_object(
        'resolvedTotal',COALESCE(w.resolved_total,0),'flawedControls',COALESCE(w.flawed_controls,0),
        'flawedControlsCorrect',COALESCE(w.flawed_controls_correct,0),'cleanControls',COALESCE(w.clean_controls,0),
        'cleanControlsCorrect',COALESCE(w.clean_controls_correct,0),'correctionChecks',COALESCE(w.correction_checks,0),
        'correctionChecksCorrect',COALESCE(w.correction_checks_correct,0),'trustState',COALESCE(w.trust_state,'new')
      )
    ) ORDER BY cl.created_at,cl.id)
      FROM public.question_quality_claims cl
      LEFT JOIN public.question_quality_worker_profiles w ON w.user_id=cl.user_id AND w.domain=COALESCE(NULLIF(r.game,''),'general')
      WHERE cl.case_id=c.id),'[]'::jsonb),
    'verifications',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'verificationId',v.id,'role',v.role,'status',v.status,'providerId',v.provider_id,
      'modelId',v.model_id,'promptVersion',v.prompt_version,'direction',v.direction,
      'strength',v.strength,'predictedAnswerIndex',v.predicted_answer_index,
      'findingCodes',v.finding_codes,'evidence',v.evidence,'sources',v.sources
    ) ORDER BY v.role) FROM public.question_quality_verifications v WHERE v.case_id=c.id),'[]'::jsonb)
  ) INTO result
  FROM public.question_quality_cases c
  JOIN public.question_content_revisions r ON r.id=c.revision_id
  WHERE c.id=p_case_id;
  IF result IS NULL THEN RAISE EXCEPTION 'quality case not found' USING ERRCODE='P0002'; END IF;
  RETURN result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.claim_question_quality_verification(
  p_actor_id uuid,p_role text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE verification public.question_quality_verifications%ROWTYPE; quality_case public.question_quality_cases%ROWTYPE; revision public.question_content_revisions%ROWTYPE;
BEGIN
  IF NOT public.content_governance_has_permission(p_actor_id,'content.appeals.manage')
    OR p_role NOT IN ('model_a','model_b','research') THEN
    RAISE EXCEPTION 'quality verification permission required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO verification FROM public.question_quality_verifications
  WHERE role=p_role AND attempts<10
    AND (status='pending' OR (status='running' AND started_at<clock_timestamp()-interval '15 minutes'))
  ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.question_quality_verifications SET status='running',started_at=clock_timestamp(),attempts=attempts+1,last_error=NULL
  WHERE id=verification.id RETURNING * INTO verification;
  SELECT * INTO quality_case FROM public.question_quality_cases WHERE id=verification.case_id;
  SELECT * INTO revision FROM public.question_content_revisions WHERE id=quality_case.revision_id;
  RETURN jsonb_build_object(
    'verificationId',verification.id,'role',verification.role,'caseId',quality_case.id,
    'questionId',quality_case.question_id,'revisionId',quality_case.revision_id,
    'contentSha256',quality_case.content_sha256,'content',revision.content,
    'game',revision.game,'category',revision.category,'topic',revision.topic,'examRef',revision.exam_ref
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.complete_question_quality_verification(
  p_actor_id uuid,p_verification_id uuid,p_status text,p_provider_id text,p_model_id text,
  p_prompt_version text,p_direction text,p_strength numeric,p_predicted_answer_index integer,
  p_finding_codes jsonb,p_evidence jsonb,p_sources jsonb,p_input_sha256 text,p_error text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE verification public.question_quality_verifications%ROWTYPE;
BEGIN
  IF NOT public.content_governance_has_permission(p_actor_id,'content.appeals.manage')
    OR p_status NOT IN ('ok','failed','skipped')
    OR (p_status='ok' AND (p_direction NOT IN ('supports_clean','supports_flaw','inconclusive') OR p_strength NOT BETWEEN 0 AND 1))
    OR (p_input_sha256 IS NOT NULL AND p_input_sha256 !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'invalid verification completion' USING ERRCODE='22023';
  END IF;
  UPDATE public.question_quality_verifications SET
    status=p_status,provider_id=p_provider_id,model_id=p_model_id,prompt_version=p_prompt_version,
    direction=CASE WHEN p_status='ok' THEN p_direction ELSE NULL END,
    strength=CASE WHEN p_status='ok' THEN p_strength ELSE NULL END,
    predicted_answer_index=p_predicted_answer_index,
    finding_codes=COALESCE(p_finding_codes,'[]'::jsonb),evidence=COALESCE(p_evidence,'{}'::jsonb),
    sources=COALESCE(p_sources,'[]'::jsonb),input_sha256=p_input_sha256,
    completed_at=clock_timestamp(),last_error=left(p_error,1000)
  WHERE id=p_verification_id AND status='running' RETURNING * INTO verification;
  IF NOT FOUND THEN RAISE EXCEPTION 'verification is not running' USING ERRCODE='P0003'; END IF;
  RETURN jsonb_build_object('verificationId',verification.id,'caseId',verification.case_id,'status',verification.status);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.claim_question_quality_consensus_job(p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE queued public.question_quality_consensus_queue%ROWTYPE;
BEGIN
  IF NOT public.content_governance_has_permission(p_actor_id,'content.corrections.apply') THEN
    RAISE EXCEPTION 'quality consensus worker permission required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO queued FROM public.question_quality_consensus_queue
  WHERE attempts<10 AND (claimed_at IS NULL OR claimed_at<clock_timestamp()-interval '15 minutes')
  ORDER BY dirty_at,case_id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.question_quality_consensus_queue SET
    claimed_at=clock_timestamp(),claimed_by=p_actor_id,attempts=attempts+1
  WHERE case_id=queued.case_id RETURNING * INTO queued;
  RETURN jsonb_build_object('caseId',queued.case_id,'dirtyAt',queued.dirty_at,'attempts',queued.attempts);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.compute_question_quality_consensus(p_case_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE
  quality_case public.question_quality_cases%ROWTYPE;
  domain_name text;
  independent_users integer:=0;
  independent_clusters integer:=0;
  leading_reason text;
  leading_fingerprint text;
  leading_total integer:=0;
  leading_clusters integer:=0;
  trusted_flaw integer:=0;
  trusted_clean integer:=0;
  human_llr numeric:=0;
  model_llr numeric:=0;
  proof_llr numeric:=0;
  posterior numeric;
  proof_kind text:='none';
  proof_direction text:='inconclusive';
  computed_decision text:='collecting';
  snapshot jsonb;
  inputs_sha text;
BEGIN
  SELECT * INTO quality_case FROM public.question_quality_cases WHERE id=p_case_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'quality case not found' USING ERRCODE='P0002'; END IF;
  SELECT COALESCE(NULLIF(r.game,''),'general') INTO domain_name
  FROM public.question_content_revisions r WHERE r.id=quality_case.revision_id;

  WITH scored AS (
    SELECT cl.*,
      ((COALESCE(w.resolved_total,0)>=20 AND COALESCE(w.flawed_controls,0)>=5 AND COALESCE(w.clean_controls,0)>=5
        AND (COALESCE(w.flawed_controls_correct,0)+2)::numeric/(COALESCE(w.flawed_controls,0)+4)>=0.70
        AND (COALESCE(w.clean_controls_correct,0)+2)::numeric/(COALESCE(w.clean_controls,0)+4)>=0.80)
       OR w.trust_state='trusted') AS trusted
    FROM public.question_quality_claims cl
    LEFT JOIN public.question_quality_worker_profiles w ON w.user_id=cl.user_id AND w.domain=domain_name
    WHERE cl.case_id=p_case_id
  ), leading AS (
    SELECT reason_code,correction_fingerprint,count(*)::integer AS total,
      count(DISTINCT independence_key)::integer AS clusters,
      count(*) FILTER(WHERE trusted)::integer AS trusted_total
    FROM scored WHERE verdict='flawed'
    GROUP BY reason_code,correction_fingerprint
    ORDER BY count(*) FILTER(WHERE trusted) DESC,count(*) DESC,reason_code,correction_fingerprint
    LIMIT 1
  )
  SELECT reason_code,correction_fingerprint,total,clusters,trusted_total
  INTO leading_reason,leading_fingerprint,leading_total,leading_clusters,trusted_flaw FROM leading;

  WITH scored AS (
    SELECT cl.*,
      ((COALESCE(w.resolved_total,0)>=20 AND COALESCE(w.flawed_controls,0)>=5 AND COALESCE(w.clean_controls,0)>=5
        AND (COALESCE(w.flawed_controls_correct,0)+2)::numeric/(COALESCE(w.flawed_controls,0)+4)>=0.70
        AND (COALESCE(w.clean_controls_correct,0)+2)::numeric/(COALESCE(w.clean_controls,0)+4)>=0.80)
       OR w.trust_state='trusted') AS trusted,
      GREATEST(0.51,LEAST(0.98,(COALESCE(w.flawed_controls_correct,0)+2)::numeric/(COALESCE(w.flawed_controls,0)+4))) AS sensitivity,
      GREATEST(0.51,LEAST(0.98,(COALESCE(w.clean_controls_correct,0)+2)::numeric/(COALESCE(w.clean_controls,0)+4))) AS specificity,
      GREATEST(0.50,LEAST(1.00,(COALESCE(w.correction_checks_correct,0)+2)::numeric/(COALESCE(w.correction_checks,0)+4))) AS correction_accuracy
    FROM public.question_quality_claims cl
    LEFT JOIN public.question_quality_worker_profiles w ON w.user_id=cl.user_id AND w.domain=domain_name
    WHERE cl.case_id=p_case_id
  )
  SELECT count(DISTINCT user_id)::integer,count(DISTINCT independence_key)::integer,
    count(*) FILTER(WHERE verdict='clean' AND trusted)::integer,
    COALESCE(sum(GREATEST(-3,LEAST(3,CASE WHEN verdict='flawed'
      THEN ln(sensitivity/(1-specificity))*correction_accuracy
      ELSE ln((1-sensitivity)/specificity) END))),0)
  INTO independent_users,independent_clusters,trusted_clean,human_llr FROM scored;

  SELECT GREATEST(-2.2,LEAST(2.2,COALESCE(sum(CASE
    WHEN direction='supports_flaw' THEN COALESCE(strength,0)*2.2
    WHEN direction='supports_clean' THEN COALESCE(strength,0)*-2.2 ELSE 0 END),0)))
  INTO model_llr FROM public.question_quality_verifications
  WHERE case_id=p_case_id AND role IN ('model_a','model_b','research') AND status='ok';

  SELECT p.proof_kind,p.direction INTO proof_kind,proof_direction
  FROM public.question_quality_case_proofs p WHERE p.case_id=p_case_id
  ORDER BY p.created_at DESC,p.id DESC LIMIT 1;
  IF proof_kind IS NULL THEN proof_kind:='none'; proof_direction:='inconclusive'; END IF;
  proof_llr:=CASE proof_direction WHEN 'supports_flaw' THEN 4.6 WHEN 'supports_clean' THEN -4.6 ELSE 0 END;
  posterior:=1/(1+exp(-(ln(0.02/0.98)+human_llr+model_llr+proof_llr)));

  IF independent_users>=5 AND independent_clusters>=5 AND leading_clusters>=3
    AND trusted_flaw>=3 AND leading_fingerprint IS NOT NULL THEN
    IF posterior>=0.995 AND proof_kind<>'none' AND proof_direction='supports_flaw' THEN computed_decision:='confirmed';
    ELSIF posterior>=0.98 THEN computed_decision:='quarantine';
    ELSE computed_decision:='suspected'; END IF;
  ELSIF independent_users>=5 AND independent_clusters>=5 AND trusted_clean>=3 AND posterior<=0.02 THEN
    computed_decision:='rejected';
  ELSIF independent_users>=11 THEN computed_decision:='inconclusive';
  END IF;

  snapshot:=jsonb_build_object(
    'caseId',p_case_id,'decision',computed_decision,'posterior',posterior,
    'independentUserCount',independent_users,'independentClusterCount',independent_clusters,
    'trustedAgreementCount',CASE WHEN leading_fingerprint IS NULL THEN trusted_clean ELSE trusted_flaw END,
    'leadingReasonCode',leading_reason,'leadingCorrectionFingerprint',leading_fingerprint,
    'leadingTotal',leading_total,'externalProofKind',proof_kind,'externalProofDirection',proof_direction,
    'humanLogLikelihood',human_llr,'modelLogLikelihood',model_llr,'proofLogLikelihood',proof_llr
  );
  inputs_sha:=encode(extensions.digest(snapshot::text,'sha256'),'hex');
  RETURN snapshot||jsonb_build_object('inputsSha256',inputs_sha);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.record_question_quality_external_proof(
  p_actor_id uuid,p_case_id uuid,p_proof_kind text,p_direction text,p_evidence jsonb,p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE inputs_sha text; proof public.question_quality_case_proofs%ROWTYPE; old_request public.content_governance_requests%ROWTYPE; payload_hash text; result jsonb;
BEGIN
  IF NOT public.content_governance_has_permission(p_actor_id,'content.corrections.apply')
    OR p_proof_kind NOT IN ('deterministic','official_source','curator')
    OR p_direction NOT IN ('supports_clean','supports_flaw')
    OR p_request_id IS NULL OR p_evidence IS NULL OR jsonb_typeof(p_evidence)<>'object' OR p_evidence='{}'::jsonb THEN
    RAISE EXCEPTION 'invalid external proof' USING ERRCODE='22023';
  END IF;
  PERFORM public.content_governance_lock_request(p_actor_id,'record_quality_proof',p_request_id);
  payload_hash:=public.content_governance_hash(jsonb_build_object(
    'caseId',p_case_id,'proofKind',p_proof_kind,'direction',p_direction,'evidence',p_evidence
  ));
  SELECT * INTO old_request FROM public.content_governance_requests
  WHERE user_id=p_actor_id AND operation='record_quality_proof' AND request_id=p_request_id;
  IF FOUND THEN
    IF old_request.payload_hash<>payload_hash THEN RAISE EXCEPTION 'quality proof request payload mismatch' USING ERRCODE='22023'; END IF;
    RETURN old_request.result||jsonb_build_object('replayed',true);
  END IF;
  PERFORM 1 FROM public.question_quality_cases WHERE id=p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quality case not found' USING ERRCODE='P0002'; END IF;
  inputs_sha:=encode(extensions.digest(jsonb_build_object(
    'caseId',p_case_id,'proofKind',p_proof_kind,'direction',p_direction,'evidence',p_evidence
  )::text,'sha256'),'hex');
  INSERT INTO public.question_quality_case_proofs(case_id,proof_kind,direction,evidence,inputs_sha256,created_by)
  VALUES(p_case_id,p_proof_kind,p_direction,p_evidence,inputs_sha,p_actor_id)
  ON CONFLICT(case_id,proof_kind,inputs_sha256) DO NOTHING RETURNING * INTO proof;
  IF NOT FOUND THEN SELECT * INTO proof FROM public.question_quality_case_proofs
    WHERE case_id=p_case_id AND proof_kind=p_proof_kind AND inputs_sha256=inputs_sha; END IF;
  INSERT INTO public.question_quality_consensus_queue(case_id)
  VALUES(p_case_id)
  ON CONFLICT(case_id) DO UPDATE SET
    dirty_at=clock_timestamp(),claimed_at=NULL,claimed_by=NULL,attempts=0;
  result:=jsonb_build_object('proofId',proof.id,'caseId',p_case_id,'inputsSha256',inputs_sha,'replayed',false);
  INSERT INTO public.content_governance_requests VALUES(
    p_actor_id,'record_quality_proof',p_request_id,payload_hash,result,clock_timestamp()
  );
  RETURN result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.record_question_quality_consensus(
  p_actor_id uuid,p_case_id uuid,p_policy_version text,p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE
  quality_case public.question_quality_cases%ROWTYPE;
  previous_state text;
  current_question public.questions%ROWTYPE;
  snapshot jsonb;
  computed_decision text;
  effective_decision text;
  decision_row public.question_quality_consensus_decisions%ROWTYPE;
  first_claim public.question_quality_claims%ROWTYPE;
  matching_claim public.question_quality_claims%ROWTYPE;
  old_request public.content_governance_requests%ROWTYPE;
  payload_hash text;
  result jsonb;
  inserted_reward uuid;
  reward_amount integer;
  daily_reward integer;
BEGIN
  IF NOT public.content_governance_has_permission(p_actor_id,'content.corrections.apply')
    OR p_case_id IS NULL OR p_request_id IS NULL OR p_policy_version<>'community-quality@1' THEN
    RAISE EXCEPTION 'invalid quality consensus request' USING ERRCODE='22023';
  END IF;
  PERFORM public.content_governance_lock_request(p_actor_id,'record_quality_consensus',p_request_id);
  payload_hash:=public.content_governance_hash(jsonb_build_object(
    'caseId',p_case_id,'policyVersion',p_policy_version
  ));
  SELECT * INTO old_request FROM public.content_governance_requests
  WHERE user_id=p_actor_id AND operation='record_quality_consensus' AND request_id=p_request_id;
  IF FOUND THEN
    IF old_request.payload_hash<>payload_hash THEN RAISE EXCEPTION 'quality consensus request payload mismatch' USING ERRCODE='22023'; END IF;
    RETURN old_request.result||jsonb_build_object('replayed',true);
  END IF;

  SELECT * INTO quality_case FROM public.question_quality_cases WHERE id=p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quality case not found' USING ERRCODE='P0002'; END IF;
  previous_state:=quality_case.state;
  snapshot:=public.compute_question_quality_consensus(p_case_id);
  computed_decision:=snapshot->>'decision';
  effective_decision:=computed_decision;
  SELECT * INTO current_question FROM public.questions WHERE id=quality_case.question_id FOR UPDATE;
  IF computed_decision='quarantine' AND (
    current_question.published_revision_id IS DISTINCT FROM quality_case.revision_id
    OR NOT EXISTS(SELECT 1 FROM public.question_content_revisions r WHERE r.id=quality_case.revision_id AND r.content_sha256=quality_case.content_sha256)
  ) THEN effective_decision:='inconclusive'; END IF;
  IF previous_state='confirmed' AND effective_decision<>'confirmed' THEN
    RAISE EXCEPTION 'confirmed quality case is terminal' USING ERRCODE='P0003';
  END IF;
  IF previous_state='quarantined' AND effective_decision NOT IN ('quarantine','confirmed') THEN
    RAISE EXCEPTION 'quarantined quality case cannot regress automatically' USING ERRCODE='P0003';
  END IF;

  INSERT INTO public.question_quality_consensus_decisions(
    case_id,policy_version,decision,posterior_defect_probability,independent_user_count,
    independent_cluster_count,trusted_agreement_count,leading_reason_code,
    leading_correction_fingerprint,external_proof_kind,inputs_sha256,rationale,actor_id
  ) VALUES(
    p_case_id,p_policy_version,effective_decision,(snapshot->>'posterior')::numeric,
    (snapshot->>'independentUserCount')::integer,(snapshot->>'independentClusterCount')::integer,
    (snapshot->>'trustedAgreementCount')::integer,snapshot->>'leadingReasonCode',
    snapshot->>'leadingCorrectionFingerprint',snapshot->>'externalProofKind',
    snapshot->>'inputsSha256',CASE WHEN effective_decision<>computed_decision
      THEN 'Stale revision; current published question was not quarantined.' ELSE snapshot::text END,p_actor_id
  ) ON CONFLICT(case_id,policy_version,inputs_sha256) DO NOTHING RETURNING * INTO decision_row;
  IF NOT FOUND THEN SELECT * INTO decision_row FROM public.question_quality_consensus_decisions
    WHERE case_id=p_case_id AND policy_version=p_policy_version AND inputs_sha256=snapshot->>'inputsSha256'; END IF;

  UPDATE public.question_quality_cases SET
    state=CASE WHEN effective_decision='quarantine' THEN 'quarantined' ELSE effective_decision END,
    posterior_defect_probability=(snapshot->>'posterior')::numeric,
    leading_reason_code=snapshot->>'leadingReasonCode',leading_correction_fingerprint=snapshot->>'leadingCorrectionFingerprint',
    independent_user_count=(snapshot->>'independentUserCount')::integer,
    independent_cluster_count=(snapshot->>'independentClusterCount')::integer,
    trusted_agreement_count=(snapshot->>'trustedAgreementCount')::integer,updated_at=clock_timestamp(),
    resolved_at=CASE WHEN effective_decision IN ('confirmed','rejected','inconclusive') THEN clock_timestamp() ELSE resolved_at END
  WHERE id=p_case_id RETURNING * INTO quality_case;

  IF effective_decision IN ('quarantine','confirmed')
    AND previous_state NOT IN ('quarantined','confirmed')
    AND current_question.published_revision_id=quality_case.revision_id AND current_question.is_active THEN
    PERFORM public.quarantine_question_content(
      p_actor_id,quality_case.question_id,'Topluluk kalite kaniti: '||p_policy_version||' / '||effective_decision,p_request_id
    );
  END IF;

  IF effective_decision='confirmed' AND previous_state<>'confirmed' THEN
    SELECT * INTO first_claim FROM public.question_quality_claims
    WHERE case_id=p_case_id AND verdict='flawed'
      AND correction_fingerprint=quality_case.leading_correction_fingerprint
    ORDER BY created_at,id LIMIT 1;
    FOR matching_claim IN
      SELECT DISTINCT ON (independence_key) * FROM public.question_quality_claims
      WHERE case_id=p_case_id AND verdict='flawed'
        AND correction_fingerprint=quality_case.leading_correction_fingerprint
      ORDER BY independence_key,created_at,id LIMIT 11
    LOOP
      reward_amount:=CASE WHEN matching_claim.id=first_claim.id THEN 75 ELSE 10 END;
      PERFORM pg_advisory_xact_lock(hashtextextended(
        'question-quality-reward:'||matching_claim.user_id::text||':'||
        (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date::text,146
      ));
      SELECT COALESCE(sum(amount),0)::integer INTO daily_reward FROM public.reward_ledger
      WHERE user_id=matching_claim.user_id AND source_type='question_quality_claim' AND reward_type='coin'
        AND (created_at AT TIME ZONE 'Europe/Istanbul')::date=(clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date;
      IF daily_reward+reward_amount<=300 THEN
        INSERT INTO public.reward_ledger(user_id,source_type,source_id,reward_type,reward_key,amount,metadata)
        VALUES(matching_claim.user_id,'question_quality_claim',matching_claim.id,'coin',
          CASE WHEN matching_claim.id=first_claim.id THEN 'confirmed_discovery' ELSE 'confirmed_corroboration' END,
          reward_amount,jsonb_build_object('caseId',p_case_id,'policyVersion',p_policy_version))
        ON CONFLICT(source_type,source_id,reward_type,reward_key) DO NOTHING RETURNING id INTO inserted_reward;
        IF inserted_reward IS NOT NULL THEN PERFORM public.increment_coins(matching_claim.user_id,reward_amount); END IF;
        inserted_reward:=NULL;
      END IF;
    END LOOP;
    IF first_claim.id IS NOT NULL AND (first_claim.proposed_answer_index IS NOT NULL OR first_claim.correction_text IS NOT NULL) THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(
        'question-quality-reward:'||first_claim.user_id::text||':'||
        (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date::text,146
      ));
      SELECT COALESCE(sum(amount),0)::integer INTO daily_reward FROM public.reward_ledger
      WHERE user_id=first_claim.user_id AND source_type='question_quality_claim' AND reward_type='coin'
        AND (created_at AT TIME ZONE 'Europe/Istanbul')::date=(clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date;
      IF daily_reward+125<=300 THEN
        INSERT INTO public.reward_ledger(user_id,source_type,source_id,reward_type,reward_key,amount,metadata)
        VALUES(first_claim.user_id,'question_quality_claim',first_claim.id,'coin','accepted_correction',125,
          jsonb_build_object('caseId',p_case_id,'policyVersion',p_policy_version))
        ON CONFLICT(source_type,source_id,reward_type,reward_key) DO NOTHING RETURNING id INTO inserted_reward;
        IF inserted_reward IS NOT NULL THEN PERFORM public.increment_coins(first_claim.user_id,125); END IF;
      END IF;
    END IF;
  END IF;

  DELETE FROM public.question_quality_consensus_queue WHERE case_id=p_case_id;

  result:=jsonb_build_object('caseId',quality_case.id,'state',quality_case.state,
    'decisionId',decision_row.id,'posterior',quality_case.posterior_defect_probability,
    'inputsSha256',snapshot->>'inputsSha256','replayed',false);
  INSERT INTO public.content_governance_requests VALUES(
    p_actor_id,'record_quality_consensus',p_request_id,payload_hash,result,clock_timestamp()
  );
  RETURN result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.submit_question_quality_claim(uuid,uuid,integer,text,text,integer,text,text,integer,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.submit_question_quality_claim(uuid,uuid,integer,text,text,integer,text,text,integer,text,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.get_next_question_quality_mission(uuid,text,uuid),
  public.lock_question_quality_mission_answer(uuid,uuid,integer,uuid),
  public.submit_assigned_question_quality_mission(uuid,uuid,integer,text,text,integer,text,text,integer,uuid),
  public.get_question_quality_case_evidence(uuid,uuid),
  public.claim_question_quality_verification(uuid,text),
  public.claim_question_quality_consensus_job(uuid),
  public.complete_question_quality_verification(uuid,uuid,text,text,text,text,text,numeric,integer,jsonb,jsonb,jsonb,text,text),
  public.record_question_quality_external_proof(uuid,uuid,text,text,jsonb,uuid),
  public.record_question_quality_consensus(uuid,uuid,text,uuid),
  public.compute_question_quality_consensus(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_next_question_quality_mission(uuid,text,uuid),
  public.lock_question_quality_mission_answer(uuid,uuid,integer,uuid),
  public.submit_assigned_question_quality_mission(uuid,uuid,integer,text,text,integer,text,text,integer,uuid),
  public.get_question_quality_case_evidence(uuid,uuid),
  public.claim_question_quality_verification(uuid,text),
  public.claim_question_quality_consensus_job(uuid),
  public.complete_question_quality_verification(uuid,uuid,text,text,text,text,text,numeric,integer,jsonb,jsonb,jsonb,text,text),
  public.record_question_quality_external_proof(uuid,uuid,text,text,jsonb,uuid),
  public.record_question_quality_consensus(uuid,uuid,text,uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.tg_question_quality_mission_immutable(),
  public.tg_question_quality_claim_append_only()
  FROM PUBLIC,anon,authenticated,service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
