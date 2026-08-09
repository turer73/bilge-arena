-- Migration 106: immutable content governance and safe verified-result overlays.
-- This migration intentionally never rewrites historical scoring, rewards, mastery,
-- FSRS, league, or session-answer correctness.  Corrections are append-only facts.
BEGIN;

-- RBAC seeds.  Only administrators assign these roles; no client-side role grant is
-- introduced here.
INSERT INTO public.role_permissions(role_id, permission)
SELECT r.id, p.permission
FROM public.roles r
CROSS JOIN (VALUES
  ('content.prepare'), ('content.review.stage1'), ('content.review.stage2'),
  ('content.publish'), ('content.appeals.manage'), ('content.corrections.apply'),
  ('content.psychometrics.refresh'), ('content.enforcement.manage')
) p(permission)
WHERE r.slug = 'super_admin'
ON CONFLICT (role_id, permission) DO NOTHING;

INSERT INTO public.role_permissions(role_id, permission)
SELECT r.id, 'content.prepare' FROM public.roles r WHERE r.slug = 'editor'
ON CONFLICT (role_id, permission) DO NOTHING;
INSERT INTO public.role_permissions(role_id, permission)
SELECT r.id, 'content.appeals.manage' FROM public.roles r WHERE r.slug = 'moderator'
ON CONFLICT (role_id, permission) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.content_governance_runtime (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enforce_direct_mutation boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO public.content_governance_runtime(singleton,enforce_direct_mutation)
VALUES(true,false) ON CONFLICT(singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.content_governance_requests (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  operation text NOT NULL CHECK (char_length(operation) BETWEEN 1 AND 80),
  request_id uuid NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, operation, request_id)
);

CREATE TABLE IF NOT EXISTS public.question_content_revisions (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  revision_no integer NOT NULL CHECK (revision_no >= 1),
  base_revision_id uuid REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  game text NOT NULL CHECK (game IN ('wordquest','matematik','turkce','fen','sosyal')),
  category text NOT NULL CHECK (char_length(btrim(category)) BETWEEN 1 AND 120),
  subcategory text CHECK (subcategory IS NULL OR char_length(subcategory) <= 120),
  topic text CHECK (topic IS NULL OR char_length(topic) <= 200),
  difficulty smallint NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  level_tag text CHECK (level_tag IS NULL OR level_tag IN ('A1','A2','B1','B2','C1','C2')),
  exam_ref text CHECK (exam_ref IS NULL OR char_length(exam_ref) <= 20),
  is_boss boolean NOT NULL DEFAULT false,
  content jsonb NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  change_kind text NOT NULL CHECK (change_kind IN ('legacy_import','create','edit','correct_answer','retire')),
  change_summary text NOT NULL CHECK (char_length(btrim(change_summary)) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','stage1_approved','stage2_approved','published','rejected','superseded')),
  prepared_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  prepared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  published_at timestamptz,
  UNIQUE(question_id, revision_no),
  CHECK ((change_kind = 'legacy_import') = (prepared_by IS NULL) OR prepared_by IS NOT NULL)
);

ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS published_revision_id uuid;
DO $fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='questions_published_revision_id_fkey') THEN
    ALTER TABLE public.questions ADD CONSTRAINT questions_published_revision_id_fkey
      FOREIGN KEY (published_revision_id) REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT;
  END IF;
END $fk$;

CREATE TABLE IF NOT EXISTS public.question_revision_outcomes (
  revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  outcome_id uuid NOT NULL REFERENCES public.curriculum_outcomes(id) ON DELETE RESTRICT,
  weight numeric(6,3) NOT NULL CHECK (weight > 0 AND weight <= 1),
  is_primary boolean NOT NULL DEFAULT false,
  PRIMARY KEY(revision_id, outcome_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS question_revision_one_primary_outcome
  ON public.question_revision_outcomes(revision_id) WHERE is_primary;

CREATE TABLE IF NOT EXISTS public.question_revision_sources (
  revision_id uuid PRIMARY KEY REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  source_kind text NOT NULL CHECK (source_kind IN ('original','licensed','public_domain','user_generated','official_exam')),
  source_title text NOT NULL CHECK (char_length(btrim(source_title)) BETWEEN 1 AND 200),
  source_url text CHECK (source_url IS NULL OR source_url ~ '^https://'),
  license_code text NOT NULL CHECK (license_code ~ '^[A-Za-z0-9._-]{1,80}$'),
  license_url text CHECK (license_url IS NULL OR license_url ~ '^https://'),
  attribution text CHECK (attribution IS NULL OR char_length(attribution) <= 1000),
  provenance_ref text CHECK (provenance_ref IS NULL OR char_length(provenance_ref) <= 500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.question_revision_approvals (
  revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  stage smallint NOT NULL CHECK (stage IN (1,2)),
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('approved','rejected')),
  rationale text NOT NULL CHECK (char_length(btrim(rationale)) BETWEEN 1 AND 1000),
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(revision_id, stage)
);

CREATE TABLE IF NOT EXISTS public.question_governance_events (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  revision_id uuid REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('published','quarantined','incident_created','incident_closed')),
  public_reason text CHECK (public_reason IS NULL OR char_length(public_reason) <= 500),
  private_note text CHECK (private_note IS NULL OR char_length(private_note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.question_appeals (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  legacy_error_report_id uuid UNIQUE REFERENCES public.error_reports(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  session_answer_id uuid REFERENCES public.session_answers(id) ON DELETE RESTRICT,
  revision_id uuid REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  reason_code text NOT NULL CHECK (reason_code IN ('wrong_key','ambiguous','invalid_content','outcome_mismatch','other')),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 0 AND 1000),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','acknowledged','investigating','resolved','rejected','withdrawn')),
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  ack_due_at timestamptz NOT NULL DEFAULT clock_timestamp() + interval '48 hours',
  resolve_due_at timestamptz NOT NULL DEFAULT clock_timestamp() + interval '14 days',
  sla_breached_at timestamptz,
  CHECK (resolve_due_at > ack_due_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS question_appeals_one_open_owner_question
  ON public.question_appeals(user_id,question_id) WHERE status IN ('submitted','acknowledged','investigating');

CREATE TABLE IF NOT EXISTS public.question_appeal_events (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  appeal_id uuid NOT NULL REFERENCES public.question_appeals(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('submitted','acknowledged','investigating','resolved','rejected','withdrawn','sla_breached')),
  public_message text CHECK (public_message IS NULL OR char_length(public_message) <= 1000),
  internal_note text CHECK (internal_note IS NULL OR char_length(internal_note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.verified_attempt_question_revisions (
  attempt_id uuid NOT NULL REFERENCES public.verified_attempts(id) ON DELETE RESTRICT,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 100),
  revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  content jsonb NOT NULL,
  correct_option smallint NOT NULL CHECK (correct_option BETWEEN 0 AND 4),
  game text NOT NULL CHECK (game IN ('wordquest','matematik','turkce','fen','sosyal')),
  category text,
  subcategory text,
  topic text,
  difficulty smallint NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  level_tag text,
  exam_ref text,
  base_points smallint NOT NULL CHECK (base_points IN (10,20,30,50)),
  PRIMARY KEY(attempt_id,question_id),
  UNIQUE(attempt_id,position)
);
ALTER TABLE public.session_answers ADD COLUMN IF NOT EXISTS question_revision_id uuid;
DO $fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='session_answers_question_revision_id_fkey') THEN
    ALTER TABLE public.session_answers ADD CONSTRAINT session_answers_question_revision_id_fkey
      FOREIGN KEY(question_revision_id) REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT;
  END IF;
END $fk$;

CREATE TABLE IF NOT EXISTS public.question_error_incidents (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  erroneous_revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  corrected_revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  error_type text NOT NULL CHECK (error_type IN ('wrong_key','ambiguous','invalid_content','outcome_mismatch')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','applied','superseded','closed')),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  closed_at timestamptz,
  eligible_count integer NOT NULL DEFAULT 0 CHECK (eligible_count >= 0),
  changed_count integer NOT NULL DEFAULT 0 CHECK (changed_count >= 0),
  manual_required_count integer NOT NULL DEFAULT 0 CHECK (manual_required_count >= 0),
  UNIQUE(question_id, erroneous_revision_id, corrected_revision_id, error_type)
);

CREATE TABLE IF NOT EXISTS public.question_result_corrections (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.question_error_incidents(id) ON DELETE RESTRICT,
  session_answer_id uuid NOT NULL REFERENCES public.session_answers(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  old_is_correct boolean NOT NULL,
  new_is_correct boolean NOT NULL,
  score_delta smallint NOT NULL CHECK (score_delta IN (-1,1)),
  presented_revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  corrected_revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(incident_id, session_answer_id),
  CHECK (old_is_correct IS DISTINCT FROM new_is_correct),
  CHECK ((score_delta = 1) = new_is_correct)
);

CREATE TABLE IF NOT EXISTS public.question_revision_psychometrics (
  revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  materialization_hash text NOT NULL CHECK (materialization_hash ~ '^[0-9a-f]{64}$'),
  sample_n integer NOT NULL CHECK (sample_n >= 0),
  correct_n integer NOT NULL CHECK (correct_n BETWEEN 0 AND sample_n),
  p_correct numeric(8,6),
  wilson_low numeric(8,6),
  wilson_high numeric(8,6),
  discrimination numeric(10,6),
  materialized_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(revision_id,window_start,window_end),
  CHECK (window_end > window_start),
  CHECK ((sample_n = 0 AND p_correct IS NULL) OR (sample_n > 0 AND p_correct BETWEEN 0 AND 1)),
  CHECK (discrimination IS NULL OR discrimination BETWEEN -1 AND 1)
);

-- Legacy pointer/backfill is intentionally evidence-labelled.  It does not make
-- historical answers eligible for automatic correction.
DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.questions q
    WHERE jsonb_typeof(q.content->'options') <> 'array'
       OR jsonb_array_length(q.content->'options') NOT BETWEEN 2 AND 5
       OR jsonb_typeof(q.content->'answer') <> 'number'
       OR (q.content->>'answer') !~ '^[0-4]$'
       OR (q.content->>'answer')::integer >= jsonb_array_length(q.content->'options')
  ) THEN
    RAISE EXCEPTION '106 preflight failed: existing question option/answer shape is incompatible; repair or quarantine before governance backfill'
      USING ERRCODE='22023';
  END IF;
END $preflight$;

INSERT INTO public.question_content_revisions(
  question_id,revision_no,game,category,subcategory,topic,difficulty,level_tag,exam_ref,is_boss,
  content,content_sha256,change_kind,change_summary,status,prepared_by,published_at
)
SELECT q.id,1,q.game,q.category,q.subcategory,q.topic,q.difficulty,q.level_tag,q.exam_ref,q.is_boss,
  q.content,encode(public.digest(q.content::text,'sha256'),'hex'),'legacy_import','Pre-106 legacy import','published',NULL,clock_timestamp()
FROM public.questions q
WHERE q.published_revision_id IS NULL
ON CONFLICT(question_id,revision_no) DO NOTHING;

INSERT INTO public.question_revision_sources(revision_id,source_kind,source_title,license_code,attribution,provenance_ref)
SELECT r.id,'original','Legacy import','legacy-import','Legacy content; licence review required','legacy:' || r.question_id::text
FROM public.question_content_revisions r
LEFT JOIN public.question_revision_sources s ON s.revision_id=r.id
WHERE r.change_kind='legacy_import' AND s.revision_id IS NULL;

UPDATE public.questions q SET published_revision_id=r.id
FROM public.question_content_revisions r
WHERE r.question_id=q.id AND r.revision_no=1 AND q.published_revision_id IS NULL;

-- Preserve legacy reports in place for flag-off rollback, while also making
-- every pending report visible in the governed queue.  They deliberately have
-- no session-answer evidence and therefore can never trigger auto-correction.
INSERT INTO public.question_appeals(
  legacy_error_report_id,user_id,question_id,session_answer_id,revision_id,reason_code,description,
  status,submitted_at,ack_due_at,resolve_due_at
)
SELECT e.id,e.user_id,e.question_id,NULL,q.published_revision_id,
  CASE e.report_type::text WHEN 'wrong_answer' THEN 'wrong_key' WHEN 'unclear' THEN 'ambiguous'
    WHEN 'typo' THEN 'invalid_content' WHEN 'offensive' THEN 'invalid_content' ELSE 'other' END,
  left(COALESCE(e.description,''),1000),'submitted',e.created_at,e.created_at+interval '48 hours',e.created_at+interval '14 days'
FROM public.error_reports e
JOIN public.profiles p ON p.id=e.user_id
JOIN public.questions q ON q.id=e.question_id
WHERE e.status::text='pending'
ON CONFLICT(legacy_error_report_id) DO NOTHING;

INSERT INTO public.question_appeal_events(appeal_id,actor_id,event_type,public_message)
SELECT a.id,a.user_id,'submitted','Önceki soru bildiriminiz inceleme kuyruğuna taşındı.'
FROM public.question_appeals a
WHERE a.legacy_error_report_id IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM public.question_appeal_events e WHERE e.appeal_id=a.id AND e.event_type='submitted');

CREATE OR REPLACE FUNCTION public.content_governance_hash(p_payload jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT encode(public.digest(COALESCE(p_payload,'null'::jsonb)::text,'sha256'),'hex')
$$;

CREATE OR REPLACE FUNCTION public.content_governance_lock_request(p_user_id uuid,p_operation text,p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR char_length(btrim(COALESCE(p_operation,''))) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'invalid content governance request key' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('content-governance-request:'||p_user_id::text||':'||p_operation||':'||p_request_id::text,106));
END $fn$;

CREATE OR REPLACE FUNCTION public.content_governance_has_permission(p_user_id uuid,p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT p_user_id IS NOT NULL AND public.has_permission(p_user_id,p_permission)
$$;

CREATE OR REPLACE FUNCTION public.content_governance_validate_payload(p_payload jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_content jsonb; v_meta jsonb; v_source jsonb; v_outcomes jsonb;
BEGIN
  IF jsonb_typeof(p_payload) <> 'object'
    OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_payload) key)
       IS DISTINCT FROM ARRAY['changeKind','content','metadata','outcomes','source','summary'] THEN RETURN false; END IF;
  v_content:=p_payload->'content'; v_meta:=p_payload->'metadata'; v_source:=p_payload->'source'; v_outcomes:=p_payload->'outcomes';
  IF jsonb_typeof(v_content)<>'object' OR jsonb_typeof(v_meta)<>'object' OR jsonb_typeof(v_source)<>'object' OR jsonb_typeof(v_outcomes)<>'array'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_content) k WHERE k NOT IN ('question','options','answer','solution','explanation','hint','sentence','passage','context','type'))
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_meta) k WHERE k NOT IN ('game','category','subcategory','topic','difficulty','levelTag','examRef','isBoss'))
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_source) k WHERE k NOT IN ('kind','title','url','licenseCode','licenseUrl','attribution','provenanceRef'))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_outcomes) o WHERE jsonb_typeof(o)<>'object'
      OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(o) key) IS DISTINCT FROM ARRAY['outcomeId','primary','weight']) THEN RETURN false; END IF;
  IF jsonb_typeof(v_content->'question')<>'string' OR char_length(btrim(v_content->>'question')) NOT BETWEEN 1 AND 20000
    OR jsonb_typeof(v_content->'options')<>'array' OR jsonb_array_length(v_content->'options') NOT BETWEEN 2 AND 5
    OR jsonb_typeof(v_content->'answer')<>'number' OR (v_content->>'answer') !~ '^[0-4]$'
    OR (v_content->>'answer')::integer >= jsonb_array_length(v_content->'options') THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_content->'options') o WHERE jsonb_typeof(o)<>'string' OR char_length(o#>>'{}')>10000) THEN RETURN false; END IF;
  IF jsonb_typeof(v_meta->'game')<>'string' OR COALESCE(v_meta->>'game','') NOT IN ('wordquest','matematik','turkce','fen','sosyal')
    OR jsonb_typeof(v_meta->'category')<>'string' OR char_length(btrim(COALESCE(v_meta->>'category',''))) NOT BETWEEN 1 AND 120
    OR jsonb_typeof(v_meta->'difficulty')<>'number' OR (v_meta->>'difficulty') !~ '^[1-5]$' THEN RETURN false; END IF;
  IF COALESCE(p_payload->>'changeKind','') NOT IN ('create','edit','correct_answer','retire') OR char_length(btrim(COALESCE(p_payload->>'summary',''))) NOT BETWEEN 1 AND 500 THEN RETURN false; END IF;
  IF jsonb_array_length(v_outcomes) NOT BETWEEN 1 AND 5
    OR (SELECT count(*) FROM jsonb_array_elements(v_outcomes) o WHERE jsonb_typeof(o->'outcomeId') IS DISTINCT FROM 'string'
      OR (o->>'outcomeId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR jsonb_typeof(o->'weight') IS DISTINCT FROM 'number'
      OR (o->>'weight') !~ '^(0([.][0-9]{1,3})?|1([.]0{1,3})?)$'
      OR (o->>'weight')::numeric <= 0
      OR jsonb_typeof(o->'primary') IS DISTINCT FROM 'boolean') <> 0
    OR (SELECT count(*) FROM jsonb_array_elements(v_outcomes) o WHERE jsonb_typeof(o->'primary')='boolean' AND (o->>'primary')='true') <> 1
    OR (SELECT count(DISTINCT o->>'outcomeId') FROM jsonb_array_elements(v_outcomes) o) <> jsonb_array_length(v_outcomes) THEN RETURN false; END IF;
  IF COALESCE(v_source->>'kind','') NOT IN ('original','licensed','public_domain','user_generated','official_exam')
    OR char_length(btrim(COALESCE(v_source->>'title',''))) NOT BETWEEN 1 AND 200 OR COALESCE(v_source->>'licenseCode','') !~ '^[A-Za-z0-9._-]{1,80}$' THEN RETURN false; END IF;
  IF (v_source ? 'url' AND (jsonb_typeof(v_source->'url')<>'string' OR v_source->>'url' !~ '^https://'))
    OR (v_source ? 'licenseUrl' AND (jsonb_typeof(v_source->'licenseUrl')<>'string' OR v_source->>'licenseUrl' !~ '^https://'))
    OR (v_source ? 'attribution' AND (jsonb_typeof(v_source->'attribution')<>'string' OR char_length(v_source->>'attribution')>1000))
    OR (v_source ? 'provenanceRef' AND (jsonb_typeof(v_source->'provenanceRef')<>'string' OR char_length(v_source->>'provenanceRef')>500)) THEN RETURN false; END IF;
  IF COALESCE(v_source->>'kind','')<>'original' AND (COALESCE(v_source->>'licenseCode','') NOT IN ('CC-BY-4.0','CC-BY-SA-4.0','CC0-1.0','PUBLIC-DOMAIN','PERMISSION','OFFICIAL-LICENSED') OR char_length(btrim(COALESCE(v_source->>'attribution',''))) NOT BETWEEN 1 AND 1000) THEN RETURN false; END IF;
  RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END $fn$;

CREATE OR REPLACE FUNCTION public.set_content_governance_enforcement(p_user_id uuid,p_enforced boolean,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE h text; old public.content_governance_requests%ROWTYPE; out jsonb;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.enforcement.manage') THEN RAISE EXCEPTION 'content enforcement permission required' USING ERRCODE='42501'; END IF;
  IF p_enforced IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'invalid content enforcement request' USING ERRCODE='22023'; END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'set_enforcement',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object('enforced',p_enforced)); PERFORM pg_advisory_xact_lock(hashtextextended('content-governance-enforcement',106));
  SELECT * INTO old FROM public.content_governance_requests WHERE user_id=p_user_id AND operation='set_enforcement' AND request_id=p_request_id;
  IF FOUND THEN IF old.payload_hash<>h THEN RAISE EXCEPTION 'content enforcement payload mismatch' USING ERRCODE='22023'; END IF; RETURN old.result||jsonb_build_object('replayed',true); END IF;
  UPDATE public.content_governance_runtime SET enforce_direct_mutation=p_enforced,updated_by=p_user_id,updated_at=clock_timestamp() WHERE singleton;
  IF NOT FOUND THEN RAISE EXCEPTION 'content governance runtime row missing' USING ERRCODE='P0002'; END IF;
  out:=jsonb_build_object('enforced',p_enforced,'replayed',false); INSERT INTO public.content_governance_requests VALUES(p_user_id,'set_enforcement',p_request_id,h,out,clock_timestamp()); RETURN out;
END $fn$;

CREATE OR REPLACE FUNCTION public.get_content_governance_enforcement(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE out jsonb;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.enforcement.manage') THEN RAISE EXCEPTION 'content enforcement permission required' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('enforced',enforce_direct_mutation,'updatedAt',updated_at) INTO out FROM public.content_governance_runtime WHERE singleton;
  IF out IS NULL THEN RAISE EXCEPTION 'content governance runtime row missing' USING ERRCODE='P0002'; END IF; RETURN out;
END $fn$;

CREATE OR REPLACE FUNCTION public.tg_question_content_direct_mutation_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
BEGIN
  IF COALESCE((SELECT enforce_direct_mutation FROM public.content_governance_runtime WHERE singleton),true)
    AND current_setting('app.content_governance_publish',true) IS DISTINCT FROM 'on'
    AND (NEW.content,NEW.game,NEW.category,NEW.subcategory,NEW.topic,NEW.difficulty,NEW.level_tag,NEW.exam_ref,NEW.is_boss,NEW.is_active,NEW.published_revision_id)
        IS DISTINCT FROM (OLD.content,OLD.game,OLD.category,OLD.subcategory,OLD.topic,OLD.difficulty,OLD.level_tag,OLD.exam_ref,OLD.is_boss,OLD.is_active,OLD.published_revision_id) THEN
    RAISE EXCEPTION 'direct question content or activation mutation is disabled; publish or quarantine a revision' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.tg_question_direct_insert_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
BEGIN
  IF COALESCE((SELECT enforce_direct_mutation FROM public.content_governance_runtime WHERE singleton),true)
    AND current_setting('app.content_governance_publish',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'direct question insert is disabled; create a governed draft' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_question_content_direct_mutation_guard ON public.questions;
CREATE TRIGGER trg_question_content_direct_mutation_guard BEFORE UPDATE ON public.questions
FOR EACH ROW EXECUTE FUNCTION public.tg_question_content_direct_mutation_guard();
DROP TRIGGER IF EXISTS trg_question_direct_insert_guard ON public.questions;
CREATE TRIGGER trg_question_direct_insert_guard BEFORE INSERT ON public.questions
FOR EACH ROW EXECUTE FUNCTION public.tg_question_direct_insert_guard();

CREATE OR REPLACE FUNCTION public.create_governed_question(p_user_id uuid,p_payload jsonb,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE qid uuid:=public.gen_random_uuid(); r public.question_content_revisions%ROWTYPE; h text; old public.content_governance_requests%ROWTYPE; out jsonb;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.prepare') THEN RAISE EXCEPTION 'content prepare permission required' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL OR NOT public.content_governance_validate_payload(p_payload) OR p_payload->>'changeKind'<>'create' THEN RAISE EXCEPTION 'invalid governed question payload' USING ERRCODE='22023'; END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'create_question',p_request_id);
  h:=public.content_governance_hash(p_payload); SELECT * INTO old FROM public.content_governance_requests WHERE user_id=p_user_id AND operation='create_question' AND request_id=p_request_id;
  IF FOUND THEN IF old.payload_hash<>h THEN RAISE EXCEPTION 'question creation request payload mismatch' USING ERRCODE='22023'; END IF; RETURN old.result||jsonb_build_object('replayed',true); END IF;
  PERFORM set_config('app.content_governance_publish','on',true);
  INSERT INTO public.questions(id,game,category,subcategory,topic,difficulty,level_tag,exam_ref,is_boss,content,is_active,published_revision_id)
  VALUES(qid,p_payload->'metadata'->>'game',p_payload->'metadata'->>'category',NULLIF(p_payload->'metadata'->>'subcategory',''),NULLIF(p_payload->'metadata'->>'topic',''),(p_payload->'metadata'->>'difficulty')::smallint,NULLIF(p_payload->'metadata'->>'levelTag',''),NULLIF(p_payload->'metadata'->>'examRef',''),COALESCE((p_payload->'metadata'->>'isBoss')::boolean,false),p_payload->'content',false,NULL);
  INSERT INTO public.question_content_revisions(question_id,revision_no,game,category,subcategory,topic,difficulty,level_tag,exam_ref,is_boss,content,content_sha256,change_kind,change_summary,prepared_by)
  VALUES(qid,1,p_payload->'metadata'->>'game',p_payload->'metadata'->>'category',NULLIF(p_payload->'metadata'->>'subcategory',''),NULLIF(p_payload->'metadata'->>'topic',''),(p_payload->'metadata'->>'difficulty')::smallint,NULLIF(p_payload->'metadata'->>'levelTag',''),NULLIF(p_payload->'metadata'->>'examRef',''),COALESCE((p_payload->'metadata'->>'isBoss')::boolean,false),p_payload->'content',encode(public.digest((p_payload->'content')::text,'sha256'),'hex'),'create',p_payload->>'summary',p_user_id) RETURNING * INTO r;
  INSERT INTO public.question_revision_sources(revision_id,source_kind,source_title,source_url,license_code,license_url,attribution,provenance_ref)
  VALUES(r.id,p_payload->'source'->>'kind',p_payload->'source'->>'title',NULLIF(p_payload->'source'->>'url',''),p_payload->'source'->>'licenseCode',NULLIF(p_payload->'source'->>'licenseUrl',''),NULLIF(p_payload->'source'->>'attribution',''),NULLIF(p_payload->'source'->>'provenanceRef',''));
  INSERT INTO public.question_revision_outcomes(revision_id,outcome_id,weight,is_primary)
  SELECT r.id,(o->>'outcomeId')::uuid,(o->>'weight')::numeric,COALESCE((o->>'primary')::boolean,false) FROM jsonb_array_elements(p_payload->'outcomes') o JOIN public.curriculum_outcomes co ON co.id=(o->>'outcomeId')::uuid AND co.is_active;
  IF (SELECT count(*) FROM public.question_revision_outcomes WHERE revision_id=r.id) <> jsonb_array_length(p_payload->'outcomes') THEN RAISE EXCEPTION 'outcomes must be active and unique' USING ERRCODE='22023'; END IF;
  out:=jsonb_build_object('questionId',qid,'revisionId',r.id,'revisionNo',1,'status','draft','replayed',false); INSERT INTO public.content_governance_requests VALUES(p_user_id,'create_question',p_request_id,h,out,clock_timestamp()); RETURN out;
END $fn$;

CREATE OR REPLACE FUNCTION public.create_question_content_revision(p_user_id uuid,p_question_id uuid,p_base_revision_id uuid,p_payload jsonb,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE q public.questions%ROWTYPE; r public.question_content_revisions%ROWTYPE; h text; old public.content_governance_requests%ROWTYPE; n integer; out jsonb;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.prepare') THEN RAISE EXCEPTION 'content prepare permission required' USING ERRCODE='42501'; END IF;
  IF p_question_id IS NULL OR p_request_id IS NULL OR NOT public.content_governance_validate_payload(p_payload) THEN RAISE EXCEPTION 'invalid revision payload' USING ERRCODE='22023'; END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'create_revision',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object('questionId',p_question_id,'baseRevisionId',p_base_revision_id,'payload',p_payload)); PERFORM pg_advisory_xact_lock(hashtextextended('content-revision:'||p_question_id::text,0));
  SELECT * INTO old FROM public.content_governance_requests WHERE user_id=p_user_id AND operation='create_revision' AND request_id=p_request_id;
  IF FOUND THEN IF old.payload_hash<>h THEN RAISE EXCEPTION 'revision request payload mismatch' USING ERRCODE='22023'; END IF; RETURN old.result || jsonb_build_object('replayed',true); END IF;
  SELECT * INTO q FROM public.questions WHERE id=p_question_id FOR UPDATE; IF NOT FOUND OR q.published_revision_id IS DISTINCT FROM p_base_revision_id THEN RAISE EXCEPTION 'stale or unknown revision base' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(max(revision_no),0)+1 INTO n FROM public.question_content_revisions WHERE question_id=p_question_id;
  INSERT INTO public.question_content_revisions(question_id,revision_no,base_revision_id,game,category,subcategory,topic,difficulty,level_tag,exam_ref,is_boss,content,content_sha256,change_kind,change_summary,prepared_by)
  VALUES(p_question_id,n,p_base_revision_id,p_payload->'metadata'->>'game',p_payload->'metadata'->>'category',NULLIF(p_payload->'metadata'->>'subcategory',''),NULLIF(p_payload->'metadata'->>'topic',''),(p_payload->'metadata'->>'difficulty')::smallint,NULLIF(p_payload->'metadata'->>'levelTag',''),NULLIF(p_payload->'metadata'->>'examRef',''),COALESCE((p_payload->'metadata'->>'isBoss')::boolean,false),p_payload->'content',encode(public.digest((p_payload->'content')::text,'sha256'),'hex'),p_payload->>'changeKind',p_payload->>'summary',p_user_id) RETURNING * INTO r;
  INSERT INTO public.question_revision_sources(revision_id,source_kind,source_title,source_url,license_code,license_url,attribution,provenance_ref)
  VALUES(r.id,p_payload->'source'->>'kind',p_payload->'source'->>'title',NULLIF(p_payload->'source'->>'url',''),p_payload->'source'->>'licenseCode',NULLIF(p_payload->'source'->>'licenseUrl',''),NULLIF(p_payload->'source'->>'attribution',''),NULLIF(p_payload->'source'->>'provenanceRef',''));
  INSERT INTO public.question_revision_outcomes(revision_id,outcome_id,weight,is_primary)
  SELECT r.id,(o->>'outcomeId')::uuid,(o->>'weight')::numeric,COALESCE((o->>'primary')::boolean,false) FROM jsonb_array_elements(p_payload->'outcomes') o JOIN public.curriculum_outcomes co ON co.id=(o->>'outcomeId')::uuid AND co.is_active;
  IF (SELECT count(*) FROM public.question_revision_outcomes WHERE revision_id=r.id) <> jsonb_array_length(p_payload->'outcomes') THEN RAISE EXCEPTION 'outcomes must be active and unique' USING ERRCODE='22023'; END IF;
  out:=jsonb_build_object('revisionId',r.id,'questionId',p_question_id,'revisionNo',r.revision_no,'status','draft','replayed',false);
  INSERT INTO public.content_governance_requests VALUES(p_user_id,'create_revision',p_request_id,h,out,clock_timestamp()); RETURN out;
END $fn$;

CREATE OR REPLACE FUNCTION public.review_question_content_revision(p_user_id uuid,p_revision_id uuid,p_stage smallint,p_decision text,p_rationale text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE r public.question_content_revisions%ROWTYPE; prior public.question_revision_approvals%ROWTYPE; h text; old public.content_governance_requests%ROWTYPE; out jsonb;
BEGIN
  IF p_stage NOT IN (1,2) OR p_decision NOT IN ('approved','rejected') OR char_length(btrim(COALESCE(p_rationale,''))) NOT BETWEEN 1 AND 1000 OR p_request_id IS NULL THEN RAISE EXCEPTION 'invalid review' USING ERRCODE='22023'; END IF;
  IF NOT public.content_governance_has_permission(p_user_id,CASE WHEN p_stage=1 THEN 'content.review.stage1' ELSE 'content.review.stage2' END) THEN RAISE EXCEPTION 'review permission required' USING ERRCODE='42501'; END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'review_revision',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object('revisionId',p_revision_id,'stage',p_stage,'decision',p_decision,'rationale',p_rationale));
  SELECT * INTO old FROM public.content_governance_requests WHERE user_id=p_user_id AND operation='review_revision' AND request_id=p_request_id; IF FOUND THEN IF old.payload_hash<>h THEN RAISE EXCEPTION 'review request payload mismatch' USING ERRCODE='22023'; END IF; RETURN old.result||jsonb_build_object('replayed',true); END IF;
  SELECT * INTO r FROM public.question_content_revisions WHERE id=p_revision_id FOR UPDATE; IF NOT FOUND OR r.status NOT IN ('draft','stage1_approved') OR r.prepared_by IS NULL OR r.prepared_by=p_user_id THEN RAISE EXCEPTION 'revision is not reviewable' USING ERRCODE='22023'; END IF;
  IF p_stage=2 THEN SELECT * INTO prior FROM public.question_revision_approvals WHERE revision_id=p_revision_id AND stage=1; IF NOT FOUND OR prior.decision<>'approved' OR prior.reviewer_id=p_user_id THEN RAISE EXCEPTION 'independent stage one approval required' USING ERRCODE='22023'; END IF; END IF;
  INSERT INTO public.question_revision_approvals VALUES(p_revision_id,p_stage,p_user_id,p_decision,p_rationale,clock_timestamp());
  UPDATE public.question_content_revisions SET status=CASE WHEN p_decision='rejected' THEN 'rejected' WHEN p_stage=1 THEN 'stage1_approved' ELSE 'stage2_approved' END WHERE id=p_revision_id;
  out:=jsonb_build_object('revisionId',p_revision_id,'stage',p_stage,'decision',p_decision,'replayed',false); INSERT INTO public.content_governance_requests VALUES(p_user_id,'review_revision',p_request_id,h,out,clock_timestamp()); RETURN out;
END $fn$;

CREATE OR REPLACE FUNCTION public.publish_question_content_revision(p_user_id uuid,p_revision_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE r public.question_content_revisions%ROWTYPE; q public.questions%ROWTYPE; h text; old public.content_governance_requests%ROWTYPE; out jsonb;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.publish') THEN RAISE EXCEPTION 'content publish permission required' USING ERRCODE='42501'; END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'publish_revision',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object('revisionId',p_revision_id)); SELECT * INTO old FROM public.content_governance_requests WHERE user_id=p_user_id AND operation='publish_revision' AND request_id=p_request_id; IF FOUND THEN IF old.payload_hash<>h THEN RAISE EXCEPTION 'publish request payload mismatch' USING ERRCODE='22023'; END IF; RETURN old.result||jsonb_build_object('replayed',true); END IF;
  SELECT * INTO r FROM public.question_content_revisions WHERE id=p_revision_id FOR UPDATE; IF NOT FOUND OR r.status<>'stage2_approved' THEN RAISE EXCEPTION 'two-stage approved revision required' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.question_revision_approvals a JOIN public.question_revision_approvals b ON b.revision_id=a.revision_id WHERE a.revision_id=r.id AND a.stage=1 AND b.stage=2 AND a.decision='approved' AND b.decision='approved' AND a.reviewer_id<>b.reviewer_id AND a.reviewer_id<>r.prepared_by AND b.reviewer_id<>r.prepared_by) THEN RAISE EXCEPTION 'independent approvals required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('content-publish:'||r.question_id::text,0)); SELECT * INTO q FROM public.questions WHERE id=r.question_id FOR UPDATE;
  IF q.published_revision_id IS DISTINCT FROM r.base_revision_id THEN RAISE EXCEPTION 'stale revision cannot publish' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM public.question_revision_outcomes WHERE revision_id=r.id) NOT BETWEEN 1 AND 5 OR NOT EXISTS(SELECT 1 FROM public.question_revision_outcomes WHERE revision_id=r.id AND is_primary) OR NOT EXISTS(SELECT 1 FROM public.question_revision_sources WHERE revision_id=r.id) THEN RAISE EXCEPTION 'revision evidence incomplete' USING ERRCODE='22023'; END IF;
  PERFORM set_config('app.content_governance_publish','on',true);
  UPDATE public.questions SET content=r.content,game=r.game,category=r.category,subcategory=r.subcategory,topic=r.topic,difficulty=r.difficulty,level_tag=r.level_tag,exam_ref=r.exam_ref,is_boss=r.is_boss,is_active=(r.change_kind<>'retire'),published_revision_id=r.id WHERE id=r.question_id;
  DELETE FROM public.question_outcomes WHERE question_id=r.question_id; INSERT INTO public.question_outcomes(question_id,outcome_id,weight,is_primary) SELECT r.question_id,outcome_id,weight,is_primary FROM public.question_revision_outcomes WHERE revision_id=r.id;
  UPDATE public.question_content_revisions SET status='superseded' WHERE question_id=r.question_id AND status='published' AND id<>r.id; UPDATE public.question_content_revisions SET status='published',published_at=clock_timestamp() WHERE id=r.id;
  INSERT INTO public.question_governance_events(question_id,revision_id,actor_id,event_type,public_reason) VALUES(r.question_id,r.id,p_user_id,'published','Two-stage approved revision published');
  out:=jsonb_build_object('questionId',r.question_id,'revisionId',r.id,'status','published','replayed',false); INSERT INTO public.content_governance_requests VALUES(p_user_id,'publish_revision',p_request_id,h,out,clock_timestamp()); RETURN out;
END $fn$;

CREATE OR REPLACE FUNCTION public.quarantine_question_content(p_user_id uuid,p_question_id uuid,p_reason text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE q public.questions%ROWTYPE; h text; old public.content_governance_requests%ROWTYPE; out jsonb;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.corrections.apply') OR char_length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid quarantine' USING ERRCODE='22023'; END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'quarantine_question',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object('questionId',p_question_id,'reason',p_reason)); SELECT * INTO old FROM public.content_governance_requests WHERE user_id=p_user_id AND operation='quarantine_question' AND request_id=p_request_id; IF FOUND THEN IF old.payload_hash<>h THEN RAISE EXCEPTION 'quarantine request payload mismatch' USING ERRCODE='22023'; END IF; RETURN old.result||jsonb_build_object('replayed',true); END IF;
  SELECT * INTO q FROM public.questions WHERE id=p_question_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'question not found' USING ERRCODE='P0002'; END IF; PERFORM set_config('app.content_governance_publish','on',true); UPDATE public.questions SET is_active=false WHERE id=p_question_id; INSERT INTO public.question_governance_events(question_id,revision_id,actor_id,event_type,public_reason) VALUES(p_question_id,q.published_revision_id,p_user_id,'quarantined',p_reason); out:=jsonb_build_object('questionId',p_question_id,'status','quarantined','replayed',false); INSERT INTO public.content_governance_requests VALUES(p_user_id,'quarantine_question',p_request_id,h,out,clock_timestamp()); RETURN out;
END $fn$;

CREATE OR REPLACE FUNCTION public.trg_snapshot_verified_attempt_revisions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
BEGIN
  INSERT INTO public.verified_attempt_question_revisions(attempt_id,question_id,position,revision_id,content_sha256,content,correct_option,game,category,subcategory,topic,difficulty,level_tag,exam_ref,base_points)
  SELECT NEW.id,x.question_id,x.position,r.id,r.content_sha256,r.content,(r.content->>'answer')::smallint,r.game,r.category,r.subcategory,r.topic,r.difficulty,r.level_tag,r.exam_ref,CASE WHEN r.difficulty=1 THEN 10 WHEN r.difficulty=2 THEN 20 WHEN r.difficulty=3 THEN 30 ELSE 50 END
  FROM unnest(NEW.question_ids) WITH ORDINALITY x(question_id,position)
  JOIN public.questions q ON q.id=x.question_id AND q.game=NEW.game AND q.is_active
  JOIN public.question_content_revisions r ON r.id=q.published_revision_id AND r.status='published'
  WHERE jsonb_typeof(r.content->'answer')='number' AND (r.content->>'answer') ~ '^[0-9]$' AND (r.content->>'answer')::integer BETWEEN 0 AND jsonb_array_length(r.content->'options')-1;
  IF (SELECT count(*) FROM public.verified_attempt_question_revisions WHERE attempt_id=NEW.id)<>cardinality(NEW.question_ids) THEN RAISE EXCEPTION 'verified attempt requires published revision snapshots' USING ERRCODE='22023'; END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_snapshot_verified_attempt_revisions ON public.verified_attempts;
CREATE TRIGGER trg_snapshot_verified_attempt_revisions AFTER INSERT ON public.verified_attempts FOR EACH ROW EXECUTE FUNCTION public.trg_snapshot_verified_attempt_revisions();

CREATE OR REPLACE FUNCTION public.trg_validate_and_bind_verified_completion_revisions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_total integer; v_correct integer; v_wrong integer; v_xp integer; v_base integer; v_bonus integer;
BEGIN
  IF EXISTS(SELECT 1 FROM public.session_answers a LEFT JOIN public.verified_attempt_question_revisions s ON s.attempt_id=NEW.id AND s.question_id=a.question_id WHERE a.session_id=NEW.session_id AND (s.question_id IS NULL OR a.is_correct IS DISTINCT FROM (NOT COALESCE(a.is_skipped,false) AND a.selected_option=s.correct_option)))
    OR EXISTS(SELECT 1 FROM public.session_answers a WHERE a.session_id=NEW.session_id AND NOT a.question_id=ANY(NEW.question_ids)) THEN RAISE EXCEPTION 'verified completion does not match immutable revision snapshot' USING ERRCODE='22023'; END IF;
  WITH ordered AS (
    SELECT a.id,a.is_correct,a.xp_earned,s.position,s.base_points,
      sum(CASE WHEN a.is_correct THEN 0 ELSE 1 END) OVER (ORDER BY s.position) AS wrong_group
    FROM public.session_answers a JOIN public.verified_attempt_question_revisions s ON s.attempt_id=NEW.id AND s.question_id=a.question_id
    WHERE a.session_id=NEW.session_id
  ), scored AS (
    SELECT *,count(*) FILTER (WHERE is_correct) OVER (PARTITION BY wrong_group ORDER BY position) AS streak
    FROM ordered
  ), expected AS (
    SELECT *,CASE WHEN is_correct THEN base_points + CASE WHEN streak>=5 THEN 10 ELSE 0 END ELSE 0 END AS expected_xp FROM scored
  )
  SELECT count(*)::int,count(*) FILTER (WHERE is_correct)::int,count(*) FILTER (WHERE NOT is_correct)::int,COALESCE(sum(expected_xp),0)::int
  INTO v_total,v_correct,v_wrong,v_xp FROM expected;
  v_base:=floor(v_xp::numeric*0.7)::int; v_bonus:=v_xp-v_base;
  IF EXISTS (
    WITH ordered AS (
      SELECT a.id,a.is_correct,a.xp_earned,s.position,s.base_points,sum(CASE WHEN a.is_correct THEN 0 ELSE 1 END) OVER (ORDER BY s.position) AS wrong_group
      FROM public.session_answers a JOIN public.verified_attempt_question_revisions s ON s.attempt_id=NEW.id AND s.question_id=a.question_id WHERE a.session_id=NEW.session_id
    ), scored AS (SELECT *,count(*) FILTER (WHERE is_correct) OVER (PARTITION BY wrong_group ORDER BY position) AS streak FROM ordered)
    SELECT 1 FROM scored WHERE xp_earned IS DISTINCT FROM CASE WHEN is_correct THEN base_points+CASE WHEN streak>=5 THEN 10 ELSE 0 END ELSE 0 END
  ) OR EXISTS (SELECT 1 FROM public.game_sessions gs WHERE gs.id=NEW.session_id AND (gs.total_questions IS DISTINCT FROM v_total OR gs.correct_count IS DISTINCT FROM v_correct OR gs.wrong_count IS DISTINCT FROM v_wrong OR gs.total_xp IS DISTINCT FROM v_xp OR gs.base_xp IS DISTINCT FROM v_base OR gs.bonus_xp IS DISTINCT FROM v_bonus)) THEN
    RAISE EXCEPTION 'verified completion score does not match immutable revision snapshot' USING ERRCODE='22023';
  END IF;
  UPDATE public.session_answers a SET question_revision_id=s.revision_id FROM public.verified_attempt_question_revisions s WHERE a.session_id=NEW.session_id AND s.attempt_id=NEW.id AND s.question_id=a.question_id;
  IF (SELECT count(*) FROM public.session_answers WHERE session_id=NEW.session_id AND question_revision_id IS NULL)>0 THEN RAISE EXCEPTION 'verified completion revision binding failed' USING ERRCODE='22023'; END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS aaa_validate_and_bind_verified_completion_revisions ON public.verified_attempts;
CREATE TRIGGER aaa_validate_and_bind_verified_completion_revisions AFTER UPDATE OF completed_at,session_id ON public.verified_attempts FOR EACH ROW WHEN (OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL AND OLD.session_id IS NULL AND NEW.session_id IS NOT NULL) EXECUTE FUNCTION public.trg_validate_and_bind_verified_completion_revisions();

-- These are deliberately server-only objects.  `content` includes the answer and
-- solution when present, so HTTP code must strip it before any browser response.
CREATE OR REPLACE FUNCTION public.verified_attempt_private_snapshot(p_attempt_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object('items',COALESCE(jsonb_agg(jsonb_build_object('position',s.position,'questionId',s.question_id,'revisionId',s.revision_id,'contentSha256',s.content_sha256,'content',s.content,'correctOption',s.correct_option,'metadata',jsonb_strip_nulls(jsonb_build_object('game',s.game,'category',s.category,'subcategory',s.subcategory,'topic',s.topic,'difficulty',s.difficulty,'levelTag',s.level_tag,'examRef',s.exam_ref,'basePoints',s.base_points))) ORDER BY s.position),'[]'::jsonb))
  FROM public.verified_attempt_question_revisions s WHERE s.attempt_id=p_attempt_id
$$;

CREATE OR REPLACE FUNCTION public.verified_exam_private_snapshot(p_attempt_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object('items',COALESCE(jsonb_agg(jsonb_build_object('position',e.position,'questionId',e.question_id,'sourceBucket',e.source_bucket,'revisionId',s.revision_id,'contentSha256',s.content_sha256,'content',s.content,'correctOption',s.correct_option,'metadata',jsonb_strip_nulls(jsonb_build_object('game',s.game,'category',s.category,'subcategory',s.subcategory,'topic',s.topic,'difficulty',s.difficulty,'levelTag',s.level_tag,'examRef',s.exam_ref,'basePoints',s.base_points))) ORDER BY e.position),'[]'::jsonb))
  FROM public.verified_exam_attempt_items e JOIN public.verified_attempt_question_revisions s ON s.attempt_id=e.attempt_id AND s.question_id=e.question_id WHERE e.attempt_id=p_attempt_id
$$;

CREATE OR REPLACE FUNCTION public.get_verified_attempt_question_snapshots(p_attempt_id uuid,p_user_id uuid,p_require_active boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE a public.verified_attempts%ROWTYPE;
BEGIN
  IF p_require_active IS NULL THEN RAISE EXCEPTION 'snapshot active requirement is required' USING ERRCODE='22023'; END IF;
  SELECT * INTO a FROM public.verified_attempts WHERE id=p_attempt_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'verified attempt not found' USING ERRCODE='P0002'; END IF;
  IF a.user_id IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'verified attempt owner mismatch' USING ERRCODE='42501'; END IF;
  IF p_require_active AND (a.completed_at IS NOT NULL OR a.session_id IS NOT NULL OR a.expires_at<=clock_timestamp()) THEN RAISE EXCEPTION 'verified attempt is inactive' USING ERRCODE='22023'; END IF;
  IF NOT p_require_active AND a.completed_at IS NULL AND a.session_id IS NULL AND a.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'verified attempt is expired before completion' USING ERRCODE='22023'; END IF;
  RETURN public.verified_attempt_private_snapshot(p_attempt_id);
END $fn$;

CREATE OR REPLACE FUNCTION public.issue_verified_attempt(p_user_id uuid,p_game text,p_mode text,p_question_ids uuid[],p_duration_sec integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_expires_at timestamptz; v_attempt_id uuid; v_count integer;
BEGIN
  IF p_user_id IS NULL OR p_game NOT IN ('wordquest','matematik','turkce','fen','sosyal') OR p_mode NOT IN ('classic','blitz','marathon','boss','practice','deneme') OR p_duration_sec NOT BETWEEN 5 AND 7200 OR p_question_ids IS NULL OR cardinality(p_question_ids) NOT BETWEEN 1 AND 100 OR EXISTS(SELECT 1 FROM unnest(p_question_ids) q WHERE q IS NULL) OR cardinality(p_question_ids)<>(SELECT count(DISTINCT q) FROM unnest(p_question_ids) q) THEN RAISE EXCEPTION 'invalid verified attempt issuance' USING ERRCODE='22023'; END IF;
  SELECT count(*) INTO v_count FROM public.questions q WHERE q.id=ANY(p_question_ids) AND q.game=p_game AND q.is_active; IF v_count<>cardinality(p_question_ids) THEN RAISE EXCEPTION 'all questions must be active and match game' USING ERRCODE='22023'; END IF;
  v_expires_at:=clock_timestamp()+make_interval(secs=>p_duration_sec); INSERT INTO public.verified_attempts(user_id,game,mode,question_ids,duration_sec,started_at,expires_at) VALUES(p_user_id,p_game,p_mode,p_question_ids,p_duration_sec,clock_timestamp(),v_expires_at) RETURNING id INTO v_attempt_id;
  RETURN jsonb_build_object('attemptId',v_attempt_id,'expiresAt',v_expires_at,'snapshot',public.verified_attempt_private_snapshot(v_attempt_id));
END $fn$;

CREATE OR REPLACE FUNCTION public.issue_verified_exam_attempt(p_user_id uuid,p_game text,p_exam_ref text,p_blueprint_version text,p_items jsonb,p_duration_sec integer,p_planned_duration_sec integer,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_now timestamptz:=clock_timestamp(); v_ids uuid[]; v_hash text; v_attempt uuid; v_existing public.verified_exam_attempts%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_game NOT IN ('matematik','turkce','fen','sosyal') OR p_blueprint_version IS NULL OR char_length(btrim(p_blueprint_version)) NOT BETWEEN 1 AND 80 OR p_duration_sec NOT BETWEEN p_planned_duration_sec+1 AND 7200 OR p_planned_duration_sec NOT BETWEEN 5 AND 7200 OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)<>40 THEN RAISE EXCEPTION 'invalid verified exam issuance' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) e WHERE jsonb_typeof(e)<>'object' OR (e->>'position') !~ '^([0-9]|[1-3][0-9])$' OR (e->>'questionId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' OR e->>'sourceBucket' NOT IN ('wrong','weak','coverage')) THEN RAISE EXCEPTION 'invalid verified exam items' USING ERRCODE='22023'; END IF;
  SELECT array_agg((e->>'questionId')::uuid ORDER BY (e->>'position')::integer) INTO v_ids FROM jsonb_array_elements(p_items) e;
  IF (SELECT count(DISTINCT (e->>'position')::integer) FROM jsonb_array_elements(p_items)e)<>40 OR (SELECT min((e->>'position')::integer) FROM jsonb_array_elements(p_items)e)<>0 OR (SELECT max((e->>'position')::integer) FROM jsonb_array_elements(p_items)e)<>39 OR cardinality(ARRAY(SELECT DISTINCT unnest(v_ids)))<>40 THEN RAISE EXCEPTION 'items must be unique and contiguous' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM public.questions q WHERE q.id=ANY(v_ids) AND q.is_active AND q.game=p_game AND q.exam_ref IS NOT DISTINCT FROM p_exam_ref)<>40 THEN RAISE EXCEPTION 'questions do not match verified exam scope' USING ERRCODE='22023'; END IF;
  v_hash:=encode(public.digest(array_to_string(v_ids,','),'sha256'),'hex'); PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_game||':'||coalesce(p_exam_ref,''),100)); SELECT * INTO v_existing FROM public.verified_exam_attempts WHERE user_id=p_user_id AND issue_request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.game IS DISTINCT FROM p_game OR v_existing.exam_ref IS DISTINCT FROM p_exam_ref OR v_existing.question_set_hash<>v_hash OR v_existing.blueprint_version<>p_blueprint_version OR v_existing.planned_duration_sec<>p_planned_duration_sec OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_items)e JOIN public.verified_exam_attempt_items i ON i.attempt_id=v_existing.attempt_id AND i.position=(e->>'position')::smallint WHERE i.question_id<>(e->>'questionId')::uuid OR i.source_bucket<>(e->>'sourceBucket')) THEN RAISE EXCEPTION 'issuance replay payload differs' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('attemptId',v_existing.attempt_id,'expiresAt',(SELECT expires_at FROM public.verified_attempts WHERE id=v_existing.attempt_id),'plannedDurationSec',v_existing.planned_duration_sec,'status',v_existing.status,'snapshot',public.verified_exam_private_snapshot(v_existing.attempt_id),'replayed',true);
  END IF;
  UPDATE public.verified_exam_attempts e SET status='expired' FROM public.verified_attempts a WHERE e.attempt_id=a.id AND e.user_id=p_user_id AND e.game=p_game AND e.exam_ref IS NOT DISTINCT FROM p_exam_ref AND e.status IN ('issued','active') AND (a.expires_at<=v_now OR (e.status='active' AND e.deadline_at<=v_now)); SELECT * INTO v_existing FROM public.verified_exam_attempts WHERE user_id=p_user_id AND game=p_game AND exam_ref IS NOT DISTINCT FROM p_exam_ref AND status IN ('issued','active') FOR UPDATE;
  IF FOUND THEN IF v_existing.question_set_hash=v_hash AND v_existing.blueprint_version=p_blueprint_version AND v_existing.planned_duration_sec=p_planned_duration_sec AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_items)e JOIN public.verified_exam_attempt_items i ON i.attempt_id=v_existing.attempt_id AND i.position=(e->>'position')::smallint WHERE i.question_id<>(e->>'questionId')::uuid OR i.source_bucket<>(e->>'sourceBucket')) THEN RETURN jsonb_build_object('attemptId',v_existing.attempt_id,'expiresAt',(SELECT expires_at FROM public.verified_attempts WHERE id=v_existing.attempt_id),'plannedDurationSec',v_existing.planned_duration_sec,'status',v_existing.status,'snapshot',public.verified_exam_private_snapshot(v_existing.attempt_id),'replayed',true); END IF; RAISE EXCEPTION 'an open verified exam has a different snapshot' USING ERRCODE='23505'; END IF;
  INSERT INTO public.verified_attempts(user_id,game,mode,question_ids,duration_sec,started_at,expires_at) VALUES(p_user_id,p_game,'deneme',v_ids,p_duration_sec,v_now,v_now+make_interval(secs=>p_duration_sec)) RETURNING id INTO v_attempt; INSERT INTO public.verified_exam_attempts(attempt_id,user_id,game,exam_ref,blueprint_version,question_set_hash,planned_duration_sec,issue_request_id) VALUES(v_attempt,p_user_id,p_game,p_exam_ref,p_blueprint_version,v_hash,p_planned_duration_sec,p_request_id); INSERT INTO public.verified_exam_attempt_items(attempt_id,position,question_id,source_bucket) SELECT v_attempt,(e->>'position')::smallint,(e->>'questionId')::uuid,e->>'sourceBucket' FROM jsonb_array_elements(p_items)e;
  RETURN jsonb_build_object('attemptId',v_attempt,'expiresAt',v_now+make_interval(secs=>p_duration_sec),'plannedDurationSec',p_planned_duration_sec,'status','issued','snapshot',public.verified_exam_private_snapshot(v_attempt),'replayed',false);
END $fn$;

CREATE OR REPLACE FUNCTION public.submit_question_appeal(p_user_id uuid,p_question_id uuid,p_session_answer_id uuid,p_reason text,p_description text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE a public.session_answers%ROWTYPE; r uuid; h text; old public.content_governance_requests%ROWTYPE; appeal public.question_appeals%ROWTYPE; out jsonb;
BEGIN
  IF p_user_id IS NULL OR p_question_id IS NULL OR p_request_id IS NULL OR p_reason NOT IN ('wrong_key','ambiguous','invalid_content','outcome_mismatch','other') OR char_length(btrim(COALESCE(p_description,''))) NOT BETWEEN 0 AND 1000 THEN RAISE EXCEPTION 'invalid appeal' USING ERRCODE='22023'; END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'submit_appeal',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object('questionId',p_question_id,'sessionAnswerId',p_session_answer_id,'reason',p_reason,'description',p_description)); SELECT * INTO old FROM public.content_governance_requests WHERE user_id=p_user_id AND operation='submit_appeal' AND request_id=p_request_id; IF FOUND THEN IF old.payload_hash<>h THEN RAISE EXCEPTION 'appeal request payload mismatch' USING ERRCODE='22023'; END IF; RETURN old.result||jsonb_build_object('replayed',true); END IF;
  IF p_session_answer_id IS NOT NULL THEN SELECT * INTO a FROM public.session_answers WHERE id=p_session_answer_id AND user_id=p_user_id AND question_id=p_question_id; IF NOT FOUND THEN RAISE EXCEPTION 'appeal answer owner mismatch' USING ERRCODE='42501'; END IF; r:=a.question_revision_id; ELSE SELECT published_revision_id INTO r FROM public.questions WHERE id=p_question_id; END IF;
  INSERT INTO public.question_appeals(user_id,question_id,session_answer_id,revision_id,reason_code,description) VALUES(p_user_id,p_question_id,p_session_answer_id,r,p_reason,p_description) RETURNING * INTO appeal; INSERT INTO public.question_appeal_events(appeal_id,actor_id,event_type,public_message) VALUES(appeal.id,p_user_id,'submitted','Your appeal was received.'); out:=jsonb_build_object('appealId',appeal.id,'status','submitted','ackDueAt',appeal.ack_due_at,'resolveDueAt',appeal.resolve_due_at,'replayed',false); INSERT INTO public.content_governance_requests VALUES(p_user_id,'submit_appeal',p_request_id,h,out,clock_timestamp()); RETURN out;
END $fn$;

CREATE OR REPLACE FUNCTION public.get_my_question_appeals(p_user_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object('appeals',COALESCE(jsonb_agg(jsonb_build_object('status',a.status,'submittedAt',a.submitted_at,'acknowledgmentDueAt',a.ack_due_at,'resolutionDueAt',a.resolve_due_at,'publicMessage',(SELECT e.public_message FROM public.question_appeal_events e WHERE e.appeal_id=a.id AND e.public_message IS NOT NULL ORDER BY e.created_at DESC,e.id DESC LIMIT 1)) ORDER BY a.submitted_at DESC),'[]'::jsonb)) FROM public.question_appeals a WHERE a.user_id=p_user_id
$$;

CREATE OR REPLACE FUNCTION public.get_question_appeal_queue(p_user_id uuid,p_status text,p_limit integer,p_cursor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_limit integer:=GREATEST(1,LEAST(COALESCE(p_limit,50),100)); v_cursor_time timestamptz; v_cursor_id uuid;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.appeals.manage') THEN RAISE EXCEPTION 'appeal management permission required' USING ERRCODE='42501'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('submitted','acknowledged','investigating','resolved','rejected','withdrawn') THEN RAISE EXCEPTION 'invalid appeal queue status' USING ERRCODE='22023'; END IF;
  IF NULLIF(p_cursor,'') IS NOT NULL THEN
    BEGIN
      IF split_part(p_cursor,'|',1)='' OR split_part(p_cursor,'|',2)='' OR split_part(p_cursor,'|',3)<>'' THEN RAISE EXCEPTION 'invalid cursor'; END IF;
      v_cursor_time:=split_part(p_cursor,'|',1)::timestamptz;
      v_cursor_id:=split_part(p_cursor,'|',2)::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'invalid appeal queue cursor' USING ERRCODE='22023';
    END;
  END IF;
  RETURN (
    WITH page AS MATERIALIZED (
      SELECT a.id,a.question_id,a.revision_id,a.reason_code,a.description,a.status,a.submitted_at,
        a.ack_due_at,a.resolve_due_at,a.sla_breached_at,a.session_answer_id IS NOT NULL AS has_session_evidence,
        (SELECT e.public_message FROM public.question_appeal_events e WHERE e.appeal_id=a.id AND e.public_message IS NOT NULL ORDER BY e.created_at DESC,e.id DESC LIMIT 1) AS latest_public_message,
        (SELECT e.internal_note FROM public.question_appeal_events e WHERE e.appeal_id=a.id AND e.internal_note IS NOT NULL ORDER BY e.created_at DESC,e.id DESC LIMIT 1) AS latest_internal_note
      FROM public.question_appeals a
      WHERE (p_status IS NULL OR a.status=p_status)
        AND (v_cursor_time IS NULL OR (a.submitted_at,a.id)<(v_cursor_time,v_cursor_id))
      ORDER BY a.submitted_at DESC,a.id DESC LIMIT v_limit+1
    ), shown AS (SELECT * FROM page ORDER BY submitted_at DESC,id DESC LIMIT v_limit)
    SELECT jsonb_build_object(
      'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'appealId',s.id,'questionId',s.question_id,'revisionId',s.revision_id,'reasonCode',s.reason_code,
        'description',s.description,'status',s.status,'submittedAt',s.submitted_at,'ackDueAt',s.ack_due_at,
        'resolveDueAt',s.resolve_due_at,'slaBreachedAt',s.sla_breached_at,'hasSessionEvidence',s.has_session_evidence,
        'latestPublicMessage',s.latest_public_message,'latestInternalNote',s.latest_internal_note
      ) ORDER BY s.submitted_at DESC,s.id DESC) FROM shown s),'[]'::jsonb),
      'nextCursor',CASE WHEN (SELECT count(*) FROM page)>v_limit THEN (SELECT s.submitted_at::text||'|'||s.id::text FROM shown s ORDER BY s.submitted_at ASC,s.id ASC LIMIT 1) ELSE NULL END
    )
  );
END $fn$;

CREATE OR REPLACE FUNCTION public.resolve_question_appeal(p_user_id uuid,p_appeal_id uuid,p_status text,p_public_message text,p_internal_note text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE a public.question_appeals%ROWTYPE; h text; old public.content_governance_requests%ROWTYPE; out jsonb;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.appeals.manage') OR p_status NOT IN ('acknowledged','investigating','resolved','rejected') OR char_length(btrim(COALESCE(p_public_message,''))) NOT BETWEEN 1 AND 1000 OR char_length(COALESCE(p_internal_note,''))>2000 THEN RAISE EXCEPTION 'invalid appeal resolution' USING ERRCODE='22023'; END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'resolve_appeal',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object('appealId',p_appeal_id,'status',p_status,'publicMessage',p_public_message,'internalNote',p_internal_note)); SELECT * INTO old FROM public.content_governance_requests WHERE user_id=p_user_id AND operation='resolve_appeal' AND request_id=p_request_id; IF FOUND THEN IF old.payload_hash<>h THEN RAISE EXCEPTION 'appeal resolution payload mismatch' USING ERRCODE='22023'; END IF; RETURN old.result||jsonb_build_object('replayed',true); END IF; SELECT * INTO a FROM public.question_appeals WHERE id=p_appeal_id FOR UPDATE; IF NOT FOUND OR a.status IN ('resolved','rejected','withdrawn') THEN RAISE EXCEPTION 'appeal is not resolvable' USING ERRCODE='22023'; END IF;
  UPDATE public.question_appeals SET status=p_status,acknowledged_at=CASE WHEN p_status IN ('acknowledged','investigating','resolved','rejected') THEN COALESCE(acknowledged_at,clock_timestamp()) ELSE acknowledged_at END,resolved_at=CASE WHEN p_status IN ('resolved','rejected') THEN clock_timestamp() ELSE NULL END WHERE id=a.id; INSERT INTO public.question_appeal_events(appeal_id,actor_id,event_type,public_message,internal_note) VALUES(a.id,p_user_id,p_status,p_public_message,NULLIF(p_internal_note,'')); out:=jsonb_build_object('appealId',a.id,'status',p_status,'replayed',false); INSERT INTO public.content_governance_requests VALUES(p_user_id,'resolve_appeal',p_request_id,h,out,clock_timestamp()); RETURN out;
END $fn$;

CREATE OR REPLACE FUNCTION public.sweep_question_appeal_sla(p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE n integer;
BEGIN
  IF p_now IS NULL THEN RAISE EXCEPTION 'sweep time required' USING ERRCODE='22023'; END IF; WITH changed AS (UPDATE public.question_appeals SET sla_breached_at=p_now WHERE sla_breached_at IS NULL AND status NOT IN ('resolved','rejected','withdrawn') AND (ack_due_at<p_now OR resolve_due_at<p_now) RETURNING id) INSERT INTO public.question_appeal_events(appeal_id,event_type,public_message) SELECT id,'sla_breached','Review deadline exceeded.' FROM changed; GET DIAGNOSTICS n=ROW_COUNT; RETURN jsonb_build_object('breached',n);
END $fn$;

CREATE OR REPLACE FUNCTION public.create_question_error_incident(p_user_id uuid,p_question_id uuid,p_erroneous_revision_id uuid,p_corrected_revision_id uuid,p_error_type text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE i public.question_error_incidents%ROWTYPE; h text; old public.content_governance_requests%ROWTYPE; out jsonb; eligible integer:=0; manual integer:=0; corrected smallint;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.corrections.apply') THEN RAISE EXCEPTION 'incident permission required' USING ERRCODE='42501'; END IF; IF p_error_type NOT IN ('wrong_key','ambiguous','invalid_content','outcome_mismatch') OR p_request_id IS NULL THEN RAISE EXCEPTION 'incident type or request invalid' USING ERRCODE='22023'; END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'create_incident',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object('questionId',p_question_id,'erroneousRevisionId',p_erroneous_revision_id,'correctedRevisionId',p_corrected_revision_id,'errorType',p_error_type)); SELECT * INTO old FROM public.content_governance_requests WHERE user_id=p_user_id AND operation='create_incident' AND request_id=p_request_id; IF FOUND THEN IF old.payload_hash<>h THEN RAISE EXCEPTION 'incident request payload mismatch' USING ERRCODE='22023'; END IF; RETURN old.result||jsonb_build_object('replayed',true); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.question_content_revisions e JOIN public.question_content_revisions c ON c.question_id=e.question_id WHERE e.id=p_erroneous_revision_id AND c.id=p_corrected_revision_id AND e.id<>c.id AND e.question_id=p_question_id AND e.status IN ('published','superseded') AND c.status='published') THEN RAISE EXCEPTION 'incident requires historical evidence and a published corrected revision for this question' USING ERRCODE='22023'; END IF;
  IF p_error_type='wrong_key' THEN SELECT (content->>'answer')::smallint INTO corrected FROM public.question_content_revisions WHERE id=p_corrected_revision_id; IF corrected IS NULL THEN RAISE EXCEPTION 'corrected answer unavailable' USING ERRCODE='22023'; END IF; SELECT count(*) INTO eligible FROM public.session_answers a JOIN public.verified_attempts va ON va.session_id=a.session_id AND va.completed_at IS NOT NULL JOIN public.verified_attempt_question_revisions s ON s.attempt_id=va.id AND s.question_id=a.question_id WHERE a.question_id=p_question_id AND a.question_revision_id=p_erroneous_revision_id AND s.revision_id=p_erroneous_revision_id AND NOT COALESCE(a.is_skipped,false) AND a.selected_option IS NOT NULL AND (a.selected_option=corrected) IS DISTINCT FROM a.is_correct; END IF;
  SELECT count(*) INTO manual FROM public.session_answers a JOIN public.game_sessions gs ON gs.id=a.session_id AND gs.status='completed' WHERE a.question_id=p_question_id AND a.question_revision_id IS NULL;
  INSERT INTO public.question_error_incidents(question_id,erroneous_revision_id,corrected_revision_id,error_type,created_by,eligible_count,manual_required_count) VALUES(p_question_id,p_erroneous_revision_id,p_corrected_revision_id,p_error_type,p_user_id,eligible,manual) RETURNING * INTO i; INSERT INTO public.question_governance_events(question_id,revision_id,actor_id,event_type,public_reason) VALUES(p_question_id,p_erroneous_revision_id,p_user_id,'incident_created',p_error_type); out:=jsonb_build_object('incidentId',i.id,'status','open','eligibleCount',eligible,'manualRequiredCount',manual,'replayed',false); INSERT INTO public.content_governance_requests VALUES(p_user_id,'create_incident',p_request_id,h,out,clock_timestamp()); RETURN out;
END $fn$;

CREATE OR REPLACE FUNCTION public.apply_question_result_corrections(p_user_id uuid,p_incident_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE i public.question_error_incidents%ROWTYPE; corrected smallint; h text; old public.content_governance_requests%ROWTYPE; changed integer; eligible integer; manual integer; out jsonb;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.corrections.apply') THEN RAISE EXCEPTION 'correction permission required' USING ERRCODE='42501'; END IF; PERFORM public.content_governance_lock_request(p_user_id,'apply_corrections',p_request_id); h:=public.content_governance_hash(jsonb_build_object('incidentId',p_incident_id)); SELECT * INTO old FROM public.content_governance_requests WHERE user_id=p_user_id AND operation='apply_corrections' AND request_id=p_request_id; IF FOUND THEN IF old.payload_hash<>h THEN RAISE EXCEPTION 'correction request payload mismatch' USING ERRCODE='22023'; END IF; RETURN old.result||jsonb_build_object('replayed',true); END IF; SELECT * INTO i FROM public.question_error_incidents WHERE id=p_incident_id FOR UPDATE; IF NOT FOUND OR i.error_type<>'wrong_key' THEN RAISE EXCEPTION 'only wrong-key incidents are automatically correctable' USING ERRCODE='22023'; END IF;
  SELECT (content->>'answer')::smallint INTO corrected FROM public.question_content_revisions WHERE id=i.corrected_revision_id; IF corrected IS NULL THEN RAISE EXCEPTION 'corrected answer unavailable' USING ERRCODE='22023'; END IF;
  SELECT count(*) INTO eligible FROM public.session_answers a JOIN public.verified_attempts va ON va.session_id=a.session_id AND va.completed_at IS NOT NULL JOIN public.verified_attempt_question_revisions s ON s.attempt_id=va.id AND s.question_id=a.question_id WHERE a.question_id=i.question_id AND a.question_revision_id=i.erroneous_revision_id AND s.revision_id=i.erroneous_revision_id AND NOT COALESCE(a.is_skipped,false) AND a.selected_option IS NOT NULL AND (a.selected_option=corrected) IS DISTINCT FROM a.is_correct;
  INSERT INTO public.question_result_corrections(incident_id,session_answer_id,user_id,old_is_correct,new_is_correct,score_delta,presented_revision_id,corrected_revision_id)
  SELECT i.id,a.id,a.user_id,a.is_correct,(a.selected_option=corrected),CASE WHEN a.selected_option=corrected THEN 1 ELSE -1 END,i.erroneous_revision_id,i.corrected_revision_id FROM public.session_answers a JOIN public.verified_attempts va ON va.session_id=a.session_id AND va.completed_at IS NOT NULL JOIN public.verified_attempt_question_revisions s ON s.attempt_id=va.id AND s.question_id=a.question_id WHERE a.question_id=i.question_id AND a.question_revision_id=i.erroneous_revision_id AND s.revision_id=i.erroneous_revision_id AND NOT COALESCE(a.is_skipped,false) AND a.selected_option IS NOT NULL AND (a.selected_option=corrected) IS DISTINCT FROM a.is_correct ON CONFLICT(incident_id,session_answer_id) DO NOTHING;
  GET DIAGNOSTICS changed=ROW_COUNT; SELECT count(*) INTO manual FROM public.session_answers a JOIN public.game_sessions gs ON gs.id=a.session_id AND gs.status='completed' WHERE a.question_id=i.question_id AND a.question_revision_id IS NULL; SELECT count(*) INTO changed FROM public.question_result_corrections WHERE incident_id=i.id; UPDATE public.question_error_incidents SET status='applied',eligible_count=eligible,changed_count=changed,manual_required_count=manual,closed_at=clock_timestamp() WHERE id=i.id; INSERT INTO public.question_governance_events(question_id,revision_id,actor_id,event_type,public_reason) VALUES(i.question_id,i.erroneous_revision_id,p_user_id,'incident_closed','Correction overlay applied'); out:=jsonb_build_object('incidentId',i.id,'eligibleCount',eligible,'changedCount',changed,'manualRequiredCount',manual,'replayed',false); INSERT INTO public.content_governance_requests VALUES(p_user_id,'apply_corrections',p_request_id,h,out,clock_timestamp()); RETURN out;
END $fn$;

CREATE OR REPLACE FUNCTION public.get_my_question_result_corrections(p_user_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT jsonb_build_object('corrections',COALESCE(jsonb_agg(jsonb_build_object('sessionDate',s.completed_at::date,'reason','verified_question_error','scoreDelta',c.score_delta,'correctedAt',c.applied_at) ORDER BY c.applied_at DESC),'[]'::jsonb)) FROM public.question_result_corrections c JOIN public.session_answers a ON a.id=c.session_answer_id JOIN public.game_sessions s ON s.id=a.session_id WHERE c.user_id=p_user_id
$$;

CREATE OR REPLACE FUNCTION public.materialize_question_revision_psychometrics(p_user_id uuid,p_revision_id uuid,p_window_start timestamptz,p_window_end timestamptz,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE n integer; good integer; disc numeric; h text; old public.content_governance_requests%ROWTYPE; out jsonb;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.psychometrics.refresh') THEN RAISE EXCEPTION 'psychometric permission required' USING ERRCODE='42501'; END IF; IF p_window_start IS NULL OR p_window_end IS NULL OR p_window_end<=p_window_start OR p_request_id IS NULL THEN RAISE EXCEPTION 'invalid psychometric request' USING ERRCODE='22023'; END IF; PERFORM public.content_governance_lock_request(p_user_id,'materialize_psychometrics',p_request_id); h:=public.content_governance_hash(jsonb_build_object('revisionId',p_revision_id,'windowStart',p_window_start,'windowEnd',p_window_end)); SELECT * INTO old FROM public.content_governance_requests WHERE user_id=p_user_id AND operation='materialize_psychometrics' AND request_id=p_request_id; IF FOUND THEN IF old.payload_hash<>h THEN RAISE EXCEPTION 'psychometric request payload mismatch' USING ERRCODE='22023'; END IF; RETURN old.result||jsonb_build_object('replayed',true); END IF;
  SELECT count(*)::int,count(*) FILTER(WHERE a.is_correct)::int,corr((a.is_correct)::int::double precision,(s.correct_count-(a.is_correct)::int)::double precision) INTO n,good,disc FROM public.session_answers a JOIN public.verified_attempts va ON va.session_id=a.session_id AND va.completed_at IS NOT NULL JOIN public.verified_attempt_question_revisions snap ON snap.attempt_id=va.id AND snap.question_id=a.question_id AND snap.revision_id=a.question_revision_id JOIN public.game_sessions s ON s.id=a.session_id AND s.status='completed' WHERE a.question_revision_id=p_revision_id AND a.answered_at>=p_window_start AND a.answered_at<p_window_end;
  INSERT INTO public.question_revision_psychometrics(revision_id,window_start,window_end,materialization_hash,sample_n,correct_n,p_correct,wilson_low,wilson_high,discrimination) VALUES(p_revision_id,p_window_start,p_window_end,h,n,good,CASE WHEN n=0 THEN NULL ELSE good::numeric/n END,CASE WHEN n=0 THEN NULL ELSE GREATEST(0,(good::numeric/n)-1.96*sqrt((good::numeric/n)*(1-good::numeric/n)/n)) END,CASE WHEN n=0 THEN NULL ELSE LEAST(1,(good::numeric/n)+1.96*sqrt((good::numeric/n)*(1-good::numeric/n)/n)) END,CASE WHEN n<30 THEN NULL ELSE disc END) ON CONFLICT(revision_id,window_start,window_end) DO UPDATE SET materialization_hash=EXCLUDED.materialization_hash,sample_n=EXCLUDED.sample_n,correct_n=EXCLUDED.correct_n,p_correct=EXCLUDED.p_correct,wilson_low=EXCLUDED.wilson_low,wilson_high=EXCLUDED.wilson_high,discrimination=EXCLUDED.discrimination,materialized_at=clock_timestamp(); out:=jsonb_build_object('revisionId',p_revision_id,'sampleN',n,'correctN',good,'pCorrect',CASE WHEN n=0 THEN NULL ELSE good::numeric/n END,'wilsonLow',CASE WHEN n=0 THEN NULL ELSE GREATEST(0,(good::numeric/n)-1.96*sqrt((good::numeric/n)*(1-good::numeric/n)/n)) END,'wilsonHigh',CASE WHEN n=0 THEN NULL ELSE LEAST(1,(good::numeric/n)+1.96*sqrt((good::numeric/n)*(1-good::numeric/n)/n)) END,'discrimination',CASE WHEN n<30 THEN NULL ELSE disc END,'replayed',false); INSERT INTO public.content_governance_requests VALUES(p_user_id,'materialize_psychometrics',p_request_id,h,out,clock_timestamp()); RETURN out;
END $fn$;

-- Governance queue/detail are permission-scoped; neither is a public content API.
CREATE OR REPLACE FUNCTION public.get_question_content_governance_queue(p_user_id uuid,p_status text,p_limit integer,p_cursor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_limit integer:=GREATEST(1,LEAST(COALESCE(p_limit,50),100)); v_cursor_time timestamptz; v_cursor_id uuid;
BEGIN
 IF NOT (public.content_governance_has_permission(p_user_id,'content.prepare') OR public.content_governance_has_permission(p_user_id,'content.review.stage1') OR public.content_governance_has_permission(p_user_id,'content.review.stage2') OR public.content_governance_has_permission(p_user_id,'content.publish') OR public.content_governance_has_permission(p_user_id,'content.appeals.manage') OR public.content_governance_has_permission(p_user_id,'content.corrections.apply') OR public.content_governance_has_permission(p_user_id,'content.psychometrics.refresh')) THEN RAISE EXCEPTION 'governance permission required' USING ERRCODE='42501'; END IF;
 IF p_status IS NOT NULL AND p_status NOT IN ('draft','stage1_approved','stage2_approved','published','rejected','superseded') THEN RAISE EXCEPTION 'invalid governance queue status' USING ERRCODE='22023'; END IF;
 IF NULLIF(p_cursor,'') IS NOT NULL THEN BEGIN IF split_part(p_cursor,'|',1)='' OR split_part(p_cursor,'|',2)='' OR split_part(p_cursor,'|',3)<>'' THEN RAISE EXCEPTION 'invalid cursor'; END IF; v_cursor_time:=split_part(p_cursor,'|',1)::timestamptz; v_cursor_id:=split_part(p_cursor,'|',2)::uuid; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'invalid governance queue cursor' USING ERRCODE='22023'; END; END IF;
 RETURN (
   WITH page AS MATERIALIZED (
     SELECT * FROM public.question_content_revisions r
     WHERE (p_status IS NULL OR r.status=p_status) AND (v_cursor_time IS NULL OR (r.prepared_at,r.id)<(v_cursor_time,v_cursor_id))
     ORDER BY r.prepared_at DESC,r.id DESC LIMIT v_limit+1
   ), shown AS (SELECT * FROM page ORDER BY prepared_at DESC,id DESC LIMIT v_limit)
   SELECT jsonb_build_object(
     'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('revisionId',r.id,'questionId',r.question_id,'status',r.status,'createdAt',r.prepared_at) ORDER BY r.prepared_at DESC,r.id DESC) FROM shown r),'[]'::jsonb),
     'nextCursor',CASE WHEN (SELECT count(*) FROM page)>v_limit THEN (SELECT r.prepared_at::text||'|'||r.id::text FROM shown r ORDER BY r.prepared_at ASC,r.id ASC LIMIT 1) ELSE NULL END
   )
 );
END $fn$;
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
   'psychometrics',COALESCE((SELECT jsonb_agg(jsonb_build_object('windowStart',p.window_start,'windowEnd',p.window_end,'sampleN',p.sample_n,'correctN',p.correct_n,'pCorrect',p.p_correct,'wilsonLow',p.wilson_low,'wilsonHigh',p.wilson_high,'discrimination',p.discrimination,'materializedAt',p.materialized_at) ORDER BY p.window_end DESC) FROM (SELECT * FROM public.question_revision_psychometrics WHERE revision_id=r.id ORDER BY window_end DESC LIMIT 12) p),'[]'::jsonb),
   'incidents',COALESCE((SELECT jsonb_agg(jsonb_build_object('incidentId',i.id,'erroneousRevisionId',i.erroneous_revision_id,'correctedRevisionId',i.corrected_revision_id,'errorType',i.error_type,'status',i.status,'eligibleCount',i.eligible_count,'changedCount',i.changed_count,'manualRequiredCount',i.manual_required_count,'createdAt',i.created_at,'closedAt',i.closed_at) ORDER BY i.created_at DESC) FROM public.question_error_incidents i WHERE i.erroneous_revision_id=r.id OR i.corrected_revision_id=r.id),'[]'::jsonb)
 )) INTO out FROM public.question_content_revisions r LEFT JOIN public.question_revision_sources s ON s.revision_id=r.id WHERE r.id=p_revision_id;
 IF out IS NULL THEN RAISE EXCEPTION 'revision not found' USING ERRCODE='P0002'; END IF;
 RETURN out;
END $fn$;

CREATE OR REPLACE FUNCTION public.get_published_question_content_revision(p_user_id uuid,p_question_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE revision_id uuid;
BEGIN
 SELECT published_revision_id INTO revision_id FROM public.questions WHERE id=p_question_id;
 IF revision_id IS NULL THEN RAISE EXCEPTION 'published question revision not found' USING ERRCODE='P0002'; END IF;
 RETURN public.get_question_content_revision(p_user_id,revision_id);
END $fn$;

ALTER TABLE public.content_governance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_governance_runtime ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_content_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_revision_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_revision_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_revision_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_governance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_appeal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verified_attempt_question_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_error_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_result_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_revision_psychometrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.content_governance_runtime,public.content_governance_requests,public.question_content_revisions,public.question_revision_outcomes,public.question_revision_sources,public.question_revision_approvals,public.question_governance_events,public.question_appeals,public.question_appeal_events,public.verified_attempt_question_revisions,public.question_error_incidents,public.question_result_corrections,public.question_revision_psychometrics FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.content_governance_lock_request(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.content_governance_hash(jsonb),public.content_governance_has_permission(uuid,text),public.content_governance_validate_payload(jsonb),public.tg_question_content_direct_mutation_guard(),public.tg_question_direct_insert_guard(),public.trg_snapshot_verified_attempt_revisions(),public.trg_validate_and_bind_verified_completion_revisions(),public.verified_attempt_private_snapshot(uuid),public.verified_exam_private_snapshot(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.set_content_governance_enforcement(uuid,boolean,uuid),public.get_content_governance_enforcement(uuid),public.create_governed_question(uuid,jsonb,uuid),public.create_question_content_revision(uuid,uuid,uuid,jsonb,uuid),public.review_question_content_revision(uuid,uuid,smallint,text,text,uuid),public.publish_question_content_revision(uuid,uuid,uuid),public.quarantine_question_content(uuid,uuid,text,uuid),public.get_question_content_governance_queue(uuid,text,integer,text),public.get_question_content_revision(uuid,uuid),public.get_published_question_content_revision(uuid,uuid),public.submit_question_appeal(uuid,uuid,uuid,text,text,uuid),public.get_my_question_appeals(uuid),public.get_question_appeal_queue(uuid,text,integer,text),public.resolve_question_appeal(uuid,uuid,text,text,text,uuid),public.sweep_question_appeal_sla(timestamptz),public.create_question_error_incident(uuid,uuid,uuid,uuid,text,uuid),public.apply_question_result_corrections(uuid,uuid,uuid),public.get_my_question_result_corrections(uuid),public.materialize_question_revision_psychometrics(uuid,uuid,timestamptz,timestamptz,uuid),public.get_verified_attempt_question_snapshots(uuid,uuid,boolean),public.issue_verified_attempt(uuid,text,text,uuid[],integer),public.issue_verified_exam_attempt(uuid,text,text,text,jsonb,integer,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_content_governance_enforcement(uuid,boolean,uuid),public.get_content_governance_enforcement(uuid),public.create_governed_question(uuid,jsonb,uuid),public.create_question_content_revision(uuid,uuid,uuid,jsonb,uuid),public.review_question_content_revision(uuid,uuid,smallint,text,text,uuid),public.publish_question_content_revision(uuid,uuid,uuid),public.quarantine_question_content(uuid,uuid,text,uuid),public.get_question_content_governance_queue(uuid,text,integer,text),public.get_question_content_revision(uuid,uuid),public.get_published_question_content_revision(uuid,uuid),public.submit_question_appeal(uuid,uuid,uuid,text,text,uuid),public.get_my_question_appeals(uuid),public.get_question_appeal_queue(uuid,text,integer,text),public.resolve_question_appeal(uuid,uuid,text,text,text,uuid),public.sweep_question_appeal_sla(timestamptz),public.create_question_error_incident(uuid,uuid,uuid,uuid,text,uuid),public.apply_question_result_corrections(uuid,uuid,uuid),public.get_my_question_result_corrections(uuid),public.materialize_question_revision_psychometrics(uuid,uuid,timestamptz,timestamptz,uuid),public.get_verified_attempt_question_snapshots(uuid,uuid,boolean),public.issue_verified_attempt(uuid,text,text,uuid[],integer),public.issue_verified_exam_attempt(uuid,text,text,text,jsonb,integer,integer,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
