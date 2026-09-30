-- Migration 215: isolated four-domain discovery, not a released TYT diagnostic.
-- Requires profiles, questions, question_content_revisions and extensions.digest.
-- Does not alter 178/193, approve sources, seed a release, or write mastery.
-- Operator-only release: record a separately accepted source package and actor
-- reference, then set a draft pack to released. All 24 pins are checked atomically.
BEGIN;

CREATE TABLE IF NOT EXISTS public.social_discovery_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE CHECK (btrim(version) <> ''),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','released','retired')),
  policy_version text NOT NULL DEFAULT 'social-four-domain-pilot-v1'
    CHECK (policy_version = 'social-four-domain-pilot-v1'),
  source_package_sha256 text CHECK (source_package_sha256 ~ '^[a-f0-9]{64}$'),
  accepted_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  acceptance_reference text CHECK (btrim(acceptance_reference) <> ''),
  accepted_at timestamptz,
  manifest_sha256 text CHECK (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (status <> 'released' OR (source_package_sha256 IS NOT NULL
    AND accepted_by IS NOT NULL AND acceptance_reference IS NOT NULL
    AND accepted_at IS NOT NULL AND manifest_sha256 IS NOT NULL AND released_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS social_discovery_one_released_pack_idx
  ON public.social_discovery_packs ((true)) WHERE status = 'released';

CREATE TABLE IF NOT EXISTS public.social_discovery_pack_candidates (
  pack_id uuid NOT NULL REFERENCES public.social_discovery_packs(id) ON DELETE RESTRICT,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  category text NOT NULL CHECK (category IN ('tarih','cografya','felsefe','sosyoloji')),
  difficulty smallint NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  subcategory text,
  topic text,
  level_tag text,
  content_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (pack_id,question_id),
  UNIQUE (pack_id,revision_id),
  UNIQUE (pack_id,content_sha256)
);

CREATE TABLE IF NOT EXISTS public.social_discovery_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  pack_id uuid NOT NULL REFERENCES public.social_discovery_packs(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','abandoned')),
  answered_count smallint NOT NULL DEFAULT 0 CHECK (answered_count BETWEEN 0 AND 12),
  current_question_id uuid,
  issued_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '30 minutes'),
  completed_at timestamptz,
  UNIQUE (id,pack_id),
  FOREIGN KEY (pack_id,current_question_id)
    REFERENCES public.social_discovery_pack_candidates(pack_id,question_id) ON DELETE RESTRICT,
  CHECK ((status = 'active' AND current_question_id IS NOT NULL AND issued_at IS NOT NULL
      AND answered_count < 12 AND completed_at IS NULL)
    OR (status = 'completed' AND current_question_id IS NULL AND issued_at IS NULL
      AND answered_count = 12 AND completed_at IS NOT NULL)
    OR (status = 'abandoned' AND current_question_id IS NULL AND issued_at IS NULL
      AND completed_at IS NULL)),
  CHECK (expires_at > started_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS social_discovery_one_active_session_idx
  ON public.social_discovery_sessions(user_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.social_discovery_answers (
  session_id uuid NOT NULL,
  pack_id uuid NOT NULL,
  sequence smallint NOT NULL CHECK (sequence BETWEEN 1 AND 12),
  question_id uuid NOT NULL,
  request_id uuid NOT NULL,
  selected_option smallint NOT NULL CHECK (selected_option BETWEEN 0 AND 4),
  is_correct boolean NOT NULL,
  response_time_ms integer NOT NULL CHECK (response_time_ms BETWEEN 100 AND 600000),
  server_response_time_ms integer NOT NULL CHECK (server_response_time_ms >= 0),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  result_after jsonb NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (session_id,sequence),
  UNIQUE (session_id,question_id),
  UNIQUE (session_id,request_id),
  FOREIGN KEY (session_id,pack_id)
    REFERENCES public.social_discovery_sessions(id,pack_id) ON DELETE RESTRICT,
  FOREIGN KEY (pack_id,question_id)
    REFERENCES public.social_discovery_pack_candidates(pack_id,question_id) ON DELETE RESTRICT
);

ALTER TABLE public.social_discovery_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_discovery_pack_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_discovery_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_discovery_answers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.social_discovery_packs,
  public.social_discovery_pack_candidates,public.social_discovery_sessions,
  public.social_discovery_answers FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.social_discovery_valid_content(p_content jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $fn$
BEGIN
  IF jsonb_typeof(p_content) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_content->'options') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_content->'question') IS DISTINCT FROM 'string'
    OR btrim(COALESCE(p_content->>'question','')) = '' THEN RETURN false; END IF;
  IF jsonb_array_length(p_content->'options') <> 5
    OR jsonb_typeof(p_content->'answer') IS DISTINCT FROM 'number'
    OR COALESCE(p_content->>'answer','') !~ '^[0-4]$' THEN RETURN false; END IF;
  RETURN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_content->'options') AS option
    WHERE jsonb_typeof(option) IS DISTINCT FROM 'string' OR btrim(option#>>'{}') = '')
    AND (SELECT count(DISTINCT btrim(option#>>'{}'))
      FROM jsonb_array_elements(p_content->'options') AS option) = 5;
END $fn$;

-- This is pin/capacity integrity only. Source acceptance is separately supplied
-- by an operator with table authority; the service API has no release privilege.
CREATE OR REPLACE FUNCTION public.validate_social_discovery_pack(p_pack_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.social_discovery_pack_candidates WHERE pack_id=p_pack_id;
  IF v_count <> 24 OR (SELECT count(*) FROM (
    SELECT category,CASE WHEN difficulty <= 2 THEN 'easy'
      WHEN difficulty = 3 THEN 'medium' ELSE 'hard' END AS band
    FROM public.social_discovery_pack_candidates WHERE pack_id=p_pack_id
    GROUP BY category,band HAVING count(*)=2
  ) AS quota) <> 12 THEN
    RAISE EXCEPTION 'discovery pack requires 24 candidates and exact four-domain band quotas'
      USING ERRCODE='23514';
  END IF;
  -- Freeze current publication/activity while validating every candidate.
  PERFORM question.id FROM public.social_discovery_pack_candidates AS candidate
  JOIN public.questions AS question ON question.id=candidate.question_id
  JOIN public.question_content_revisions AS revision ON revision.id=candidate.revision_id
  WHERE candidate.pack_id=p_pack_id ORDER BY question.id
  FOR SHARE OF question,revision;
  IF EXISTS (
    SELECT 1 FROM public.social_discovery_pack_candidates AS candidate
    JOIN public.questions AS question ON question.id=candidate.question_id
    JOIN public.question_content_revisions AS revision ON revision.id=candidate.revision_id
    WHERE candidate.pack_id=p_pack_id AND (
      NOT question.is_active OR question.game::text <> 'sosyal' OR question.exam_ref IS DISTINCT FROM 'TYT'
      OR question.published_revision_id IS DISTINCT FROM candidate.revision_id
      OR revision.question_id IS DISTINCT FROM question.id OR revision.status <> 'published'
      OR revision.game <> 'sosyal' OR revision.exam_ref IS DISTINCT FROM 'TYT'
      OR question.category::text IS DISTINCT FROM candidate.category
      OR revision.category IS DISTINCT FROM candidate.category
      OR question.difficulty IS DISTINCT FROM candidate.difficulty
      OR revision.difficulty IS DISTINCT FROM candidate.difficulty
      OR question.content IS DISTINCT FROM revision.content
      OR candidate.content_snapshot IS DISTINCT FROM revision.content
      OR candidate.subcategory IS DISTINCT FROM revision.subcategory
      OR candidate.topic IS DISTINCT FROM revision.topic
      OR candidate.level_tag IS DISTINCT FROM revision.level_tag
      OR candidate.content_sha256 IS DISTINCT FROM revision.content_sha256
      OR revision.content_sha256 IS DISTINCT FROM encode(extensions.digest(revision.content::text,'sha256'),'hex')
      OR NOT public.social_discovery_valid_content(revision.content)
    )
  ) THEN RAISE EXCEPTION 'discovery pack published revision/hash integrity failed' USING ERRCODE='23514'; END IF;
END $fn$;

CREATE OR REPLACE FUNCTION public.tg_social_discovery_candidate_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_pack public.social_discovery_packs%ROWTYPE; v_revision public.question_content_revisions%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' AND NEW.pack_id IS DISTINCT FROM OLD.pack_id THEN
    RAISE EXCEPTION 'candidate pack identity is immutable' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_pack FROM public.social_discovery_packs
    WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.pack_id ELSE NEW.pack_id END FOR UPDATE;
  IF NOT FOUND OR v_pack.status <> 'draft' OR v_pack.released_at IS NOT NULL THEN
    RAISE EXCEPTION 'sealed discovery candidates are immutable' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  SELECT revision.* INTO v_revision FROM public.question_content_revisions AS revision
    JOIN public.questions AS question ON question.id=revision.question_id
    WHERE revision.id=NEW.revision_id AND revision.question_id=NEW.question_id
      AND revision.status='published' AND question.is_active
      AND question.published_revision_id=revision.id
      AND question.game::text='sosyal' AND question.exam_ref='TYT'
      AND revision.game='sosyal' AND revision.exam_ref='TYT'
      AND question.category::text=NEW.category AND revision.category=NEW.category
      AND question.difficulty=NEW.difficulty AND revision.difficulty=NEW.difficulty
      AND question.content=revision.content
    FOR SHARE OF question,revision;
  IF NOT FOUND OR v_revision.content_sha256 IS DISTINCT FROM NEW.content_sha256
    OR NEW.content_sha256 IS DISTINCT FROM encode(extensions.digest(v_revision.content::text,'sha256'),'hex')
    OR NOT public.social_discovery_valid_content(v_revision.content) THEN
    RAISE EXCEPTION 'candidate requires exact published revision/hash' USING ERRCODE='23514';
  END IF;
  NEW.content_snapshot:=v_revision.content;
  NEW.subcategory:=v_revision.subcategory; NEW.topic:=v_revision.topic; NEW.level_tag:=v_revision.level_tag;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_social_discovery_candidate_snapshot ON public.social_discovery_pack_candidates;
CREATE TRIGGER trg_social_discovery_candidate_snapshot BEFORE INSERT OR UPDATE OR DELETE
  ON public.social_discovery_pack_candidates FOR EACH ROW
  EXECUTE FUNCTION public.tg_social_discovery_candidate_snapshot();

CREATE OR REPLACE FUNCTION public.tg_social_discovery_pack_release()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_manifest text;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.status <> 'draft' OR OLD.released_at IS NOT NULL THEN
      RAISE EXCEPTION 'sealed discovery pack cannot be deleted' USING ERRCODE='42501';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.released_at IS NOT NULL THEN
      RAISE EXCEPTION 'create a draft before accepting and releasing a discovery pack' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'discovery pack identity is immutable' USING ERRCODE='42501';
  END IF;
  IF OLD.status <> 'draft' OR OLD.released_at IS NOT NULL THEN
    IF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status')
      OR (NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status='released' AND NEW.status='retired')) THEN
      RAISE EXCEPTION 'sealed discovery pack metadata is immutable' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status='released' THEN
    IF NEW.source_package_sha256 IS NULL OR NEW.accepted_by IS NULL
      OR NEW.acceptance_reference IS NULL OR NEW.accepted_at IS NULL THEN
      RAISE EXCEPTION 'separately accepted source package actor/reference required' USING ERRCODE='23514';
    END IF;
    PERFORM public.validate_social_discovery_pack(NEW.id);
    SELECT encode(extensions.digest(jsonb_build_object(
      'policyVersion',NEW.policy_version,'sourcePackageSha256',NEW.source_package_sha256,
      'acceptedBy',NEW.accepted_by,'acceptanceReference',NEW.acceptance_reference,
      'acceptedAt',NEW.accepted_at,'questionCount',12,'maxPerCategory',3,
      'candidates',jsonb_agg(jsonb_build_object('questionId',question_id,'revisionId',revision_id,
        'contentSha256',content_sha256,'category',category,'difficulty',difficulty) ORDER BY question_id)
    )::text,'sha256'),'hex') INTO v_manifest
    FROM public.social_discovery_pack_candidates WHERE pack_id=NEW.id;
    IF NEW.manifest_sha256 IS NOT NULL AND NEW.manifest_sha256 <> v_manifest THEN
      RAISE EXCEPTION 'discovery manifest hash mismatch' USING ERRCODE='23514';
    END IF;
    NEW.manifest_sha256:=v_manifest; NEW.released_at:=clock_timestamp();
  ELSIF NEW.released_at IS NOT NULL THEN
    RAISE EXCEPTION 'draft release timestamp is invalid' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_social_discovery_pack_release ON public.social_discovery_packs;
CREATE TRIGGER trg_social_discovery_pack_release BEFORE INSERT OR UPDATE OR DELETE
  ON public.social_discovery_packs FOR EACH ROW EXECUTE FUNCTION public.tg_social_discovery_pack_release();

CREATE OR REPLACE FUNCTION public.tg_social_discovery_session_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
BEGIN
  IF TG_OP='DELETE' OR (NEW.id,NEW.user_id,NEW.pack_id,NEW.started_at,NEW.expires_at)
    IS DISTINCT FROM (OLD.id,OLD.user_id,OLD.pack_id,OLD.started_at,OLD.expires_at) THEN
    RAISE EXCEPTION 'discovery session identity and snapshot are immutable' USING ERRCODE='42501';
  END IF;
  IF OLD.status <> 'active' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'finished discovery session is immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_social_discovery_session_immutable ON public.social_discovery_sessions;
CREATE TRIGGER trg_social_discovery_session_immutable BEFORE UPDATE OR DELETE
  ON public.social_discovery_sessions FOR EACH ROW EXECUTE FUNCTION public.tg_social_discovery_session_immutable();

CREATE OR REPLACE FUNCTION public.tg_social_discovery_answers_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
BEGIN RAISE EXCEPTION 'discovery answers are append-only' USING ERRCODE='42501'; END $fn$;
DROP TRIGGER IF EXISTS trg_social_discovery_answers_append_only ON public.social_discovery_answers;
CREATE TRIGGER trg_social_discovery_answers_append_only BEFORE UPDATE OR DELETE
  ON public.social_discovery_answers FOR EACH ROW EXECUTE FUNCTION public.tg_social_discovery_answers_append_only();

-- Private, answer-bearing projection: never return these rows to the browser.
CREATE OR REPLACE FUNCTION public.social_discovery_pilot_rows(p_pack_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',question_id,'published_revision_id',revision_id,'content_sha256',content_sha256,
    'game','sosyal','exam_ref','TYT','category',category,'difficulty',difficulty,
    'subcategory',subcategory,'topic',topic,'level_tag',level_tag,'content',content_snapshot
  ) ORDER BY question_id),'[]'::jsonb)
  FROM public.social_discovery_pack_candidates WHERE pack_id=p_pack_id
$fn$;

CREATE OR REPLACE FUNCTION public.social_discovery_pilot_session_context(p_user_id uuid,p_session_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
  SELECT CASE WHEN pack.status <> 'released' OR (session.status='active'
    AND session.expires_at>clock_timestamp() AND NOT EXISTS (
      SELECT 1 FROM public.questions WHERE id=session.current_question_id AND is_active
    )) THEN
    jsonb_build_object('enabled',false,'packId',NULL,'rows','[]'::jsonb,'session',NULL)
  ELSE jsonb_build_object(
    'enabled',true,'rows',public.social_discovery_pilot_rows(session.pack_id),
    'packId',session.pack_id,'session',jsonb_build_object(
      'id',session.id,'status',CASE WHEN session.status='active' AND session.expires_at<=clock_timestamp()
        THEN 'expired' ELSE session.status END,
      'expiresAt',session.expires_at,'currentQuestionId',CASE WHEN session.status='active'
        AND session.expires_at>clock_timestamp() THEN session.current_question_id ELSE NULL END,
      'answeredCount',session.answered_count,'rows',public.social_discovery_pilot_rows(session.pack_id),
      'responses',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'questionId',answer.question_id,'revisionId',candidate.revision_id,
        'contentSha256',candidate.content_sha256,'selectedOptionIndex',answer.selected_option
      ) ORDER BY answer.sequence) FROM public.social_discovery_answers AS answer
      JOIN public.social_discovery_pack_candidates AS candidate
        ON candidate.pack_id=answer.pack_id AND candidate.question_id=answer.question_id
      WHERE answer.session_id=session.id),'[]'::jsonb)
    )
  ) END FROM public.social_discovery_sessions AS session
  JOIN public.social_discovery_packs AS pack ON pack.id=session.pack_id
  WHERE session.id=p_session_id AND session.user_id=p_user_id
$fn$;

CREATE OR REPLACE FUNCTION public.get_social_discovery_pilot_context(
  p_user_id uuid,p_session_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_session_id uuid; v_pack_id uuid;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user required' USING ERRCODE='22023'; END IF;
  IF p_session_id IS NOT NULL THEN
    PERFORM id FROM public.social_discovery_sessions WHERE id=p_session_id AND user_id=p_user_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'discovery session owner mismatch' USING ERRCODE='42501';
    END IF;
    PERFORM question.id FROM public.questions AS question
      JOIN public.social_discovery_sessions AS session ON session.current_question_id=question.id
      WHERE session.id=p_session_id FOR SHARE OF question;
    RETURN public.social_discovery_pilot_session_context(p_user_id,p_session_id);
  END IF;
  SELECT id INTO v_session_id FROM public.social_discovery_sessions
    WHERE user_id=p_user_id AND status='active' AND expires_at>clock_timestamp() FOR SHARE;
  IF FOUND THEN RETURN public.get_social_discovery_pilot_context(p_user_id,v_session_id); END IF;
  SELECT id INTO v_pack_id FROM public.social_discovery_packs WHERE status='released';
  IF NOT FOUND THEN RETURN jsonb_build_object('enabled',false,'packId',NULL,'rows','[]'::jsonb,'session',NULL); END IF;
  SELECT id INTO v_session_id FROM public.social_discovery_sessions
    WHERE user_id=p_user_id AND pack_id=v_pack_id ORDER BY started_at DESC,id DESC LIMIT 1 FOR SHARE;
  IF FOUND THEN RETURN public.get_social_discovery_pilot_context(p_user_id,v_session_id); END IF;
  RETURN jsonb_build_object('enabled',true,'packId',v_pack_id,'session',NULL,
    'rows',public.social_discovery_pilot_rows(v_pack_id));
END $fn$;

CREATE OR REPLACE FUNCTION public.start_social_discovery_pilot(
  p_user_id uuid,p_session_id uuid,p_pack_id uuid,p_first_question_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE v_existing public.social_discovery_sessions%ROWTYPE; v_pack public.social_discovery_packs%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR p_pack_id IS NULL OR p_first_question_id IS NULL THEN
    RAISE EXCEPTION 'user session pack and first question required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text||':social-discovery-pilot',215));
  SELECT * INTO v_existing FROM public.social_discovery_sessions WHERE id=p_session_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.user_id IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'discovery session owner mismatch' USING ERRCODE='42501'; END IF;
    IF v_existing.pack_id IS DISTINCT FROM p_pack_id THEN
      RAISE EXCEPTION 'discovery start payload mismatch' USING ERRCODE='55000'; END IF;
    RETURN public.social_discovery_pilot_session_context(p_user_id,v_existing.id);
  END IF;
  SELECT * INTO v_existing FROM public.social_discovery_sessions
    WHERE user_id=p_user_id AND status='active' FOR UPDATE;
  IF FOUND THEN
    IF v_existing.expires_at>clock_timestamp() THEN
      RETURN public.social_discovery_pilot_session_context(p_user_id,v_existing.id);
    END IF;
    UPDATE public.social_discovery_sessions SET status='abandoned',current_question_id=NULL,issued_at=NULL
      WHERE id=v_existing.id;
  END IF;
  SELECT * INTO v_pack FROM public.social_discovery_packs WHERE id=p_pack_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'discovery pack not found' USING ERRCODE='P0002'; END IF;
  IF v_pack.status <> 'released' THEN RAISE EXCEPTION 'discovery pack unavailable' USING ERRCODE='55000'; END IF;
  PERFORM public.validate_social_discovery_pack(p_pack_id);
  IF NOT EXISTS (SELECT 1 FROM public.social_discovery_pack_candidates
    WHERE pack_id=p_pack_id AND question_id=p_first_question_id AND category='tarih' AND difficulty=3) THEN
    RAISE EXCEPTION 'first discovery question is not a pinned initial history question' USING ERRCODE='22023'; END IF;
  INSERT INTO public.social_discovery_sessions(id,user_id,pack_id,current_question_id,issued_at)
    VALUES(p_session_id,p_user_id,p_pack_id,p_first_question_id,clock_timestamp());
  RETURN public.social_discovery_pilot_session_context(p_user_id,p_session_id);
END $fn$;

CREATE OR REPLACE FUNCTION public.record_social_discovery_pilot_answer(
  p_user_id uuid,p_session_id uuid,p_question_id uuid,p_selected_option smallint,
  p_response_time_ms integer,p_request_id uuid,p_expected_answered_count smallint,p_next_question_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE
  v_session public.social_discovery_sessions%ROWTYPE;
  v_candidate public.social_discovery_pack_candidates%ROWTYPE;
  v_next public.social_discovery_pack_candidates%ROWTYPE;
  v_existing public.social_discovery_answers%ROWTYPE;
  v_hash text; v_result jsonb; v_response jsonb; v_attempts integer; v_server_ms integer;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR p_question_id IS NULL
    OR p_selected_option IS NULL OR p_response_time_ms IS NULL OR p_request_id IS NULL
    OR p_expected_answered_count IS NULL OR p_selected_option NOT BETWEEN 0 AND 4
    OR p_response_time_ms NOT BETWEEN 100 AND 600000 OR p_expected_answered_count NOT BETWEEN 0 AND 12 THEN
    RAISE EXCEPTION 'invalid discovery answer' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_session FROM public.social_discovery_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'discovery session owner mismatch' USING ERRCODE='42501'; END IF;
  -- Expected progress and next question are server-derived, not client payload.
  v_hash:=encode(extensions.digest(jsonb_build_object('sessionId',p_session_id,
    'questionId',p_question_id,'selectedOption',p_selected_option,'responseTimeMs',p_response_time_ms
    )::text,'sha256'),'hex');
  SELECT * INTO v_existing FROM public.social_discovery_answers
    WHERE session_id=p_session_id AND request_id=p_request_id;
  IF FOUND THEN
    IF v_existing.payload_sha256 <> v_hash THEN
      RAISE EXCEPTION 'discovery request payload mismatch' USING ERRCODE='55000'; END IF;
    -- A replay never regrades, but returns current progress so delayed network
    -- retries cannot rewind a completed or subsequently advanced UI.
    PERFORM question.id FROM public.questions AS question
      WHERE question.id=v_session.current_question_id FOR SHARE;
    RETURN public.social_discovery_pilot_session_context(p_user_id,p_session_id);
  END IF;
  IF v_session.status <> 'active' OR v_session.answered_count <> p_expected_answered_count
    OR v_session.current_question_id IS DISTINCT FROM p_question_id THEN
    RAISE EXCEPTION 'discovery expected progress/current question mismatch' USING ERRCODE='40001'; END IF;
  IF v_session.expires_at<=clock_timestamp() THEN
    UPDATE public.social_discovery_sessions SET status='abandoned',current_question_id=NULL,issued_at=NULL
      WHERE id=p_session_id;
    RETURN public.social_discovery_pilot_session_context(p_user_id,p_session_id);
  END IF;
  PERFORM id FROM public.social_discovery_packs WHERE id=v_session.pack_id AND status='released' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'discovery pack unavailable' USING ERRCODE='55000'; END IF;
  -- Publication may supersede a revision without changing this immutable pack.
  -- Quarantine/activity is a live kill switch, serialized against publication
  -- and quarantine writers. Stable ordering avoids opposing question lock order.
  PERFORM question.id FROM public.questions AS question
    WHERE question.id IN (p_question_id,p_next_question_id) ORDER BY question.id FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM public.questions WHERE id=p_question_id AND is_active)
    OR EXISTS (SELECT 1 FROM public.questions WHERE id=p_next_question_id AND NOT is_active) THEN
    RAISE EXCEPTION 'discovery question is inactive/quarantined' USING ERRCODE='55000'; END IF;
  SELECT * INTO STRICT v_candidate FROM public.social_discovery_pack_candidates
    WHERE pack_id=v_session.pack_id AND question_id=p_question_id;
  IF EXISTS (SELECT 1 FROM public.social_discovery_answers WHERE session_id=p_session_id AND question_id=p_question_id) THEN
    RAISE EXCEPTION 'discovery question already answered' USING ERRCODE='55000'; END IF;
  SELECT count(*) INTO v_attempts FROM public.social_discovery_answers AS answer
    JOIN public.social_discovery_pack_candidates AS candidate
      ON candidate.pack_id=answer.pack_id AND candidate.question_id=answer.question_id
    WHERE answer.session_id=p_session_id AND candidate.category=v_candidate.category;
  IF v_attempts>=3 THEN RAISE EXCEPTION 'discovery category quota exceeded' USING ERRCODE='23514'; END IF;
  IF v_session.answered_count=11 THEN
    IF p_next_question_id IS NOT NULL THEN
      RAISE EXCEPTION 'discovery completion cannot issue another question' USING ERRCODE='22023'; END IF;
    IF (SELECT count(*) FROM (
      SELECT category FROM (
        SELECT candidate.category FROM public.social_discovery_answers AS answer
        JOIN public.social_discovery_pack_candidates AS candidate
          ON candidate.pack_id=answer.pack_id AND candidate.question_id=answer.question_id
        WHERE answer.session_id=p_session_id UNION ALL SELECT v_candidate.category
      ) AS measured GROUP BY category HAVING count(*)=3
    ) AS complete_categories) <> 4 THEN
      RAISE EXCEPTION 'discovery completion requires three observations per domain' USING ERRCODE='23514'; END IF;
  ELSE
    IF p_next_question_id IS NULL OR p_next_question_id=p_question_id THEN
      RAISE EXCEPTION 'next pinned discovery question required' USING ERRCODE='22023'; END IF;
    SELECT * INTO v_next FROM public.social_discovery_pack_candidates
      WHERE pack_id=v_session.pack_id AND question_id=p_next_question_id;
    IF NOT FOUND OR EXISTS (SELECT 1 FROM public.social_discovery_answers
      WHERE session_id=p_session_id AND question_id=p_next_question_id) THEN
      RAISE EXCEPTION 'next discovery question is not an unused pinned candidate' USING ERRCODE='22023'; END IF;
    SELECT count(*)+CASE WHEN v_next.category=v_candidate.category THEN 1 ELSE 0 END
      INTO v_attempts FROM public.social_discovery_answers AS answer
      JOIN public.social_discovery_pack_candidates AS candidate
        ON candidate.pack_id=answer.pack_id AND candidate.question_id=answer.question_id
      WHERE answer.session_id=p_session_id AND candidate.category=v_next.category;
    IF v_attempts>=3 OR (v_session.answered_count<3 AND v_attempts>0) THEN
      RAISE EXCEPTION 'next discovery category violates coverage/quota' USING ERRCODE='23514'; END IF;
  END IF;
  v_server_ms:=least(2147483647,greatest(0,floor(extract(epoch FROM
    (clock_timestamp()-v_session.issued_at))*1000)))::integer;
  UPDATE public.social_discovery_sessions SET answered_count=answered_count+1,
    current_question_id=p_next_question_id,
    issued_at=CASE WHEN p_next_question_id IS NULL THEN NULL ELSE clock_timestamp() END,
    status=CASE WHEN p_next_question_id IS NULL THEN 'completed' ELSE 'active' END,
    completed_at=CASE WHEN p_next_question_id IS NULL THEN clock_timestamp() ELSE NULL END
    WHERE id=p_session_id;
  v_result:=public.social_discovery_pilot_session_context(p_user_id,p_session_id);
  v_response:=jsonb_build_object('questionId',p_question_id,'revisionId',v_candidate.revision_id,
    'contentSha256',v_candidate.content_sha256,'selectedOptionIndex',p_selected_option);
  v_result:=jsonb_set(v_result,'{session,responses}',(v_result#>'{session,responses}')||jsonb_build_array(v_response));
  INSERT INTO public.social_discovery_answers(session_id,pack_id,sequence,question_id,request_id,
    selected_option,is_correct,response_time_ms,server_response_time_ms,payload_sha256,result_after)
  VALUES(p_session_id,v_session.pack_id,v_session.answered_count+1,p_question_id,p_request_id,
    p_selected_option,p_selected_option=(v_candidate.content_snapshot->>'answer')::smallint,
    p_response_time_ms,v_server_ms,v_hash,v_result);
  RETURN v_result;
END $fn$;

REVOKE ALL ON FUNCTION public.social_discovery_valid_content(jsonb),
  public.validate_social_discovery_pack(uuid),public.tg_social_discovery_candidate_snapshot(),
  public.tg_social_discovery_pack_release(),public.tg_social_discovery_session_immutable(),
  public.tg_social_discovery_answers_append_only(),public.social_discovery_pilot_rows(uuid),
  public.social_discovery_pilot_session_context(uuid,uuid),
  public.get_social_discovery_pilot_context(uuid,uuid),
  public.start_social_discovery_pilot(uuid,uuid,uuid,uuid),
  public.record_social_discovery_pilot_answer(uuid,uuid,uuid,smallint,integer,uuid,smallint,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_social_discovery_pilot_context(uuid,uuid),
  public.start_social_discovery_pilot(uuid,uuid,uuid,uuid),
  public.record_social_discovery_pilot_answer(uuid,uuid,uuid,smallint,integer,uuid,smallint,uuid)
  TO service_role;

DO $fn$
DECLARE v_table text; v_function text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['social_discovery_packs','social_discovery_pack_candidates',
    'social_discovery_sessions','social_discovery_answers'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||v_table)::regclass)
      OR has_table_privilege('anon','public.'||v_table,'SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege('authenticated','public.'||v_table,'SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege('service_role','public.'||v_table,'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'discovery table ACL postcheck failed: %',v_table;
    END IF;
  END LOOP;
  FOREACH v_function IN ARRAY ARRAY['get_social_discovery_pilot_context(uuid,uuid)',
    'start_social_discovery_pilot(uuid,uuid,uuid,uuid)',
    'record_social_discovery_pilot_answer(uuid,uuid,uuid,smallint,integer,uuid,smallint,uuid)'] LOOP
    IF has_function_privilege('anon','public.'||v_function,'EXECUTE')
      OR has_function_privilege('authenticated','public.'||v_function,'EXECUTE')
      OR NOT has_function_privilege('service_role','public.'||v_function,'EXECUTE') THEN
      RAISE EXCEPTION 'discovery function ACL postcheck failed: %',v_function;
    END IF;
  END LOOP;
END $fn$;
COMMIT;
