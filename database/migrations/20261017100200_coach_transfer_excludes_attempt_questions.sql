-- Koc transfer sorusu ayni denemenin sorularindan secilmez
-- (derin inceleme 2026-10-15 §4.2, §9 aksiyon 9)
--
-- Sorun: advance_verified_coach_stage cozum asamasinda (4) transfer sorusunu
-- ayni kazanim ve oyundaki ilk uygun aday olarak secer (ORDER BY id LIMIT 1).
-- Aday kumesi ogrencinin aktif denemesindeki sorulari dislamiyordu. Transfer
-- cevabi answer_verified_coach_transfer ile dogru sikki ve cozumu actigi icin,
-- denemedeki bir soru transfer olarak gelirse ogrenci onun cevabini notlamadan
-- once ogrenip ilk secim kilidini atlatabiliyordu.
--
-- Bu migration fonksiyonu 099'daki tanimla ayni imza ve govdeyle yeniden kurar;
-- tek fark aday sorgusunda denemenin question_ids kumesinin dislanmasi. Baska
-- aday yoksa davranis 099 ile ayni: 23514 'no eligible deterministic transfer
-- question exists'.
--
-- Uygulama tarafi (route) ayni durumda transfer belirteci vermiyor, yani bu
-- migration uygulanmadan once de sizinti kapali; migration akisin calismaya
-- devam etmesini (baska bir aday secilmesini) saglar.
--
-- Geri alma: 099_verified_coach_flow.sql icindeki advance_verified_coach_stage
-- tanimini yeniden uygulamak.

BEGIN;

CREATE OR REPLACE FUNCTION public.advance_verified_coach_stage(
  p_session_id uuid,
  p_user_id uuid,
  p_stage smallint,
  p_request_id uuid,
  p_response_text text,
  p_source text,
  p_evaluation_passed boolean,
  p_policy_version text,
  p_content_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_session public.verified_coach_sessions%ROWTYPE;
  v_event public.verified_coach_stage_events%ROWTYPE;
  v_source_question record;
  v_outcome_id uuid;
  v_transfer_question_id uuid;
  v_policy_version text;
  v_primary_count integer;
  v_attempt_question_ids uuid[];
BEGIN
  IF p_session_id IS NULL OR p_user_id IS NULL OR p_stage IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'session, user, stage and request are required' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_session FROM public.verified_coach_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'coach session owner mismatch' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_event FROM public.verified_coach_stage_events
  WHERE session_id=p_session_id AND request_id=p_request_id;
  IF FOUND THEN
    IF v_event.stage IS DISTINCT FROM p_stage THEN RAISE EXCEPTION 'request id is bound to another stage' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object(
      'stage',v_event.stage,'responseText',v_event.response_text,'source',v_event.source,
      'evaluationPassed',v_event.evaluation_passed,'policyVersion',v_event.policy_version,
      'contentSha256',v_event.content_sha256,'transferQuestionId',v_session.transfer_question_id,'replayed',true
    );
  END IF;
  IF p_source IS NULL OR p_evaluation_passed IS NULL OR p_policy_version IS NULL OR p_content_sha256 IS NULL THEN
    RAISE EXCEPTION 'required coach stage payload is missing' USING ERRCODE='22023';
  END IF;
  v_policy_version := trim(p_policy_version);
  IF p_stage NOT BETWEEN 1 AND 4
    OR char_length(v_policy_version) NOT BETWEEN 1 AND 80
    OR p_content_sha256 !~ '^[0-9a-f]{64}$'
    OR (p_stage BETWEEN 1 AND 3 AND (p_source NOT IN ('authored','ai','fallback')
      OR p_response_text IS NULL OR char_length(trim(p_response_text)) NOT BETWEEN 1 AND 1000))
    OR (p_stage = 4 AND (p_response_text IS NOT NULL OR p_source <> 'solution')) THEN
    RAISE EXCEPTION 'invalid coach stage payload' USING ERRCODE='22023';
  END IF;
  IF v_session.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'coach session expired' USING ERRCODE='22023';
  END IF;
  IF p_stage <> v_session.stage + 1 THEN
    RAISE EXCEPTION 'coach stages must advance in order' USING ERRCODE='22023';
  END IF;

  IF p_stage = 4 THEN
    SELECT question.game::text AS game,question.exam_ref::text AS exam_ref
    INTO v_source_question
    FROM public.questions question
    WHERE question.id=v_session.question_id AND question.is_active=true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'source question is no longer active' USING ERRCODE='22023';
    END IF;
    SELECT count(*) INTO v_primary_count
    FROM public.question_outcomes mapping
    JOIN public.curriculum_outcomes outcome ON outcome.id=mapping.outcome_id
    WHERE mapping.question_id=v_session.question_id AND mapping.is_primary=true AND outcome.is_active=true;
    IF v_primary_count <> 1 THEN
      RAISE EXCEPTION 'source question requires exactly one active primary outcome' USING ERRCODE='22023';
    END IF;
    SELECT mapping.outcome_id INTO v_outcome_id
    FROM public.question_outcomes mapping
    JOIN public.curriculum_outcomes outcome ON outcome.id=mapping.outcome_id
    WHERE mapping.question_id=v_session.question_id AND mapping.is_primary=true AND outcome.is_active=true;
    -- Transfer cevabi dogru sikki acar. Ayni denemenin bir sorusu transfer olursa
    -- ogrenci onun cevabini notlamadan once ogrenir; o sorular aday olamaz.
    SELECT attempt.question_ids INTO v_attempt_question_ids
    FROM public.verified_attempts attempt
    WHERE attempt.id=v_session.attempt_id;
    SELECT candidate.id INTO v_transfer_question_id
    FROM public.questions candidate
    JOIN public.question_outcomes mapping ON mapping.question_id=candidate.id
      AND mapping.outcome_id=v_outcome_id AND mapping.is_primary=true
    WHERE candidate.is_active=true
      AND candidate.id <> v_session.question_id
      AND NOT (candidate.id = ANY(COALESCE(v_attempt_question_ids, ARRAY[]::uuid[])))
      AND candidate.game::text = v_source_question.game
      AND candidate.exam_ref IS NOT DISTINCT FROM v_source_question.exam_ref
      AND public.verified_coach_correct_option(candidate.content) IS NOT NULL
      AND jsonb_typeof(candidate.content->'solution')='string'
      AND char_length(trim(candidate.content->>'solution')) BETWEEN 1 AND 2000
      AND 1 = (
        SELECT count(*)
        FROM public.question_outcomes candidate_primary
        JOIN public.curriculum_outcomes candidate_outcome ON candidate_outcome.id=candidate_primary.outcome_id
        WHERE candidate_primary.question_id=candidate.id
          AND candidate_primary.is_primary=true AND candidate_outcome.is_active=true
      )
    ORDER BY candidate.id
    LIMIT 1;
    IF v_transfer_question_id IS NULL THEN
      RAISE EXCEPTION 'no eligible deterministic transfer question exists' USING ERRCODE='23514';
    END IF;
  END IF;

  INSERT INTO public.verified_coach_stage_events(
    session_id,stage,request_id,response_text,source,evaluation_passed,policy_version,content_sha256
  ) VALUES (
    p_session_id,p_stage,p_request_id,p_response_text,p_source,p_evaluation_passed,v_policy_version,p_content_sha256
  );

  UPDATE public.verified_coach_sessions
  SET stage=p_stage,transfer_question_id=CASE WHEN p_stage=4 THEN v_transfer_question_id ELSE NULL END,
      updated_at=clock_timestamp()
  WHERE id=p_session_id;

  RETURN jsonb_build_object(
    'stage',p_stage,'responseText',p_response_text,'source',p_source,
    'evaluationPassed',p_evaluation_passed,'policyVersion',v_policy_version,
    'contentSha256',p_content_sha256,'transferQuestionId',v_transfer_question_id,'replayed',false
  );
END $fn$;

REVOKE ALL ON FUNCTION public.advance_verified_coach_stage(uuid,uuid,smallint,uuid,text,text,boolean,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_verified_coach_stage(uuid,uuid,smallint,uuid,text,text,boolean,text,text)
  TO service_role;

DO $verify$
BEGIN
  IF has_function_privilege('authenticated', 'public.advance_verified_coach_stage(uuid,uuid,smallint,uuid,text,text,boolean,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.advance_verified_coach_stage(uuid,uuid,smallint,uuid,text,text,boolean,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'coach transfer: client roles must not execute advance_verified_coach_stage';
  END IF;
  IF position('v_attempt_question_ids' IN pg_get_functiondef('public.advance_verified_coach_stage(uuid,uuid,smallint,uuid,text,text,boolean,text,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'coach transfer: attempt question exclusion missing';
  END IF;
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
