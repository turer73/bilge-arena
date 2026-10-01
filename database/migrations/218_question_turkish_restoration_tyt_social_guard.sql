-- Migration 218: 215 Turkce harf duzeltme yolu onayli TYT sosyal sorulara uygulanmaz.
--
-- TYT sosyal surum kapisi (191), yayin/aday akisi (210) ve kaynak politikasi
-- (tyt_social_revision_source_policy_ready, 217'de tek onaya genisletildi)
-- bir soruyu yalniz yayimli revizyonu onayliysa hazir sayar. 215 onaysiz bir
-- revizyon yayimladigi icin hazir bir TYT sosyal sorusuna uygulanan harf
-- duzeltmesi soruyu havuzdan dusururdu. Tabani onayli TYT sosyal sorusunda
-- duzeltme artik reddedilir ve onayli yoldan (iki asama ya da 217 tek onay)
-- gider. Diger her kural ve kayit 215 ile aynidir; veri degismez.
--
-- 2026-10-01 itibariyla 1316 aktif TYT sosyal sorusunun hicbiri hazir degil;
-- bu koruma ilk onayli TYT sosyal yayinindan once yerinde olmali.

BEGIN;

SET LOCAL lock_timeout = '10s';

CREATE OR REPLACE FUNCTION public.publish_question_turkish_restoration(
  p_user_id uuid,
  p_question_id uuid,
  p_base_revision_id uuid,
  p_content jsonb,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  q public.questions%ROWTYPE;
  base public.question_content_revisions%ROWTYPE;
  r public.question_content_revisions%ROWTYPE;
  d public.question_validation_decisions%ROWTYPE;
  old public.content_governance_requests%ROWTYPE;
  v_policy text;
  v_found boolean;
  v_words text[];
  h text;
  n integer;
  out jsonb;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.prepare')
    OR NOT public.content_governance_has_permission(p_user_id,'content.publish') THEN
    RAISE EXCEPTION 'content prepare and publish permissions required' USING ERRCODE='42501';
  END IF;
  IF p_question_id IS NULL OR p_base_revision_id IS NULL OR p_request_id IS NULL
    OR jsonb_typeof(p_content) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid Turkish restoration request' USING ERRCODE='22023';
  END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'turkish_restoration',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object(
    'questionId',p_question_id,'baseRevisionId',p_base_revision_id,'content',p_content
  ));
  SELECT * INTO old FROM public.content_governance_requests
  WHERE user_id=p_user_id AND operation='turkish_restoration' AND request_id=p_request_id;
  IF FOUND THEN
    IF old.payload_hash<>h THEN
      RAISE EXCEPTION 'Turkish restoration request payload mismatch' USING ERRCODE='22023';
    END IF;
    RETURN old.result||jsonb_build_object('replayed',true);
  END IF;
  -- Ayni kilit sirasi: create (content-revision) sonra publish (content-publish).
  PERFORM pg_advisory_xact_lock(hashtextextended('content-revision:'||p_question_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('content-publish:'||p_question_id::text,0));
  SELECT * INTO q FROM public.questions WHERE id=p_question_id FOR UPDATE;
  IF NOT FOUND OR q.published_revision_id IS DISTINCT FROM p_base_revision_id THEN
    RAISE EXCEPTION 'stale or unknown revision base' USING ERRCODE='22023';
  END IF;
  IF NOT q.is_active THEN
    RAISE EXCEPTION 'inactive question: use the two-stage revision path' USING ERRCODE='22023';
  END IF;
  SELECT * INTO base FROM public.question_content_revisions
  WHERE id=p_base_revision_id AND question_id=p_question_id AND status='published';
  IF NOT FOUND OR base.content IS DISTINCT FROM q.content THEN
    RAISE EXCEPTION 'published revision does not match live content' USING ERRCODE='22023';
  END IF;
  IF base.game='wordquest'
    OR (base.game='turkce' AND base.category='yazim_kurallari')
    OR public.question_turkish_restoration_fold(COALESCE(base.content->>'question',''))
       ~ '(yazim|yazil|imla|noktalama|buyuk harf|kucuk harf|kesme isaret|ses olay|unlu dus|unlu uyum|unsuz)' THEN
    RAISE EXCEPTION 'spelling-topic question: use the two-stage revision path' USING ERRCODE='22023';
  END IF;
  -- 191/210 (ve 217) TYT sosyal kapilari soruyu yalniz onayli yayimli
  -- revizyonla hazir sayar; onaysiz bir harf duzeltmesi hazir bir soruyu
  -- havuzdan dusururdu. Onayli tabanda duzeltme onayli yoldan gider.
  IF base.game='sosyal' AND upper(btrim(COALESCE(base.exam_ref,'')))='TYT'
    AND EXISTS (
      SELECT 1 FROM public.question_revision_approvals a
      WHERE a.revision_id=base.id AND a.decision='approved'
    ) THEN
    RAISE EXCEPTION 'approved TYT social revision: use the reviewed revision path' USING ERRCODE='22023';
  END IF;
  v_words:=public.question_turkish_restoration_words(base.content,p_content);
  IF v_words IS NULL OR cardinality(v_words)=0 THEN
    RAISE EXCEPTION 'not a pure Turkish letter restoration of listed stems: use the two-stage revision path'
      USING ERRCODE='22023';
  END IF;

  SELECT required_policy_version INTO v_policy
  FROM public.question_validation_runtime WHERE singleton;
  SELECT * INTO d FROM public.question_validation_decisions
  WHERE revision_id=base.id AND policy_version=v_policy AND verdict='APPROVED'
  ORDER BY decided_at DESC, created_at DESC
  LIMIT 1;
  v_found:=FOUND;
  IF v_policy IS NULL OR NOT v_found OR EXISTS (
    SELECT 1 FROM public.question_validation_decisions
    WHERE revision_id=base.id AND policy_version=v_policy AND verdict<>'APPROVED'
  ) THEN
    RAISE EXCEPTION 'base revision needs an APPROVED validation decision under the current policy'
      USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(max(revision_no),0)+1 INTO n
  FROM public.question_content_revisions WHERE question_id=p_question_id;
  INSERT INTO public.question_content_revisions(
    question_id,revision_no,base_revision_id,game,category,subcategory,topic,
    difficulty,level_tag,exam_ref,is_boss,content,content_sha256,change_kind,
    change_summary,prepared_by,outcomes_prepared_by
  ) VALUES (
    p_question_id,n,base.id,base.game,base.category,base.subcategory,base.topic,
    base.difficulty,base.level_tag,base.exam_ref,base.is_boss,p_content,
    encode(extensions.digest(p_content::text,'sha256'),'hex'),'edit',
    left('Turkce harf duzeltmesi (215, iki onay gerekmez): '||array_to_string(v_words,', '),500),
    p_user_id,base.outcomes_prepared_by
  ) RETURNING * INTO r;
  INSERT INTO public.question_revision_sources(
    revision_id,source_kind,source_title,source_url,license_code,license_url,
    attribution,provenance_ref
  )
  SELECT r.id,source_kind,source_title,source_url,license_code,license_url,
    attribution,provenance_ref
  FROM public.question_revision_sources WHERE revision_id=base.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'base revision source record missing' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.question_revision_outcomes(revision_id,outcome_id,weight,is_primary)
  SELECT r.id,outcome_id,weight,is_primary
  FROM public.question_revision_outcomes WHERE revision_id=base.id;
  INSERT INTO public.question_validation_decisions(
    question_id,revision_id,content_sha256,policy_version,verdict,findings,
    rationale,blind_consensus_index,blind_agreement_ratio,run_id,decided_at
  ) VALUES (
    p_question_id,r.id,r.content_sha256,v_policy,'APPROVED',d.findings,
    'Carried over from revision '||base.id::text
      ||' by migration 215 (Turkish letter restoration; content differs only by listed ASCII->Turkish letters). '
      ||d.rationale,
    d.blind_consensus_index,d.blind_agreement_ratio,d.run_id,clock_timestamp()
  );

  PERFORM public.content_governance_authorize_question_write(p_question_id,'publish');
  UPDATE public.questions SET content=r.content,published_revision_id=r.id
  WHERE id=p_question_id;
  PERFORM public.content_governance_clear_question_write(p_question_id);
  UPDATE public.question_content_revisions SET status='superseded'
  WHERE question_id=p_question_id AND status='published' AND id<>r.id;
  UPDATE public.question_content_revisions
  SET status='published',published_at=clock_timestamp() WHERE id=r.id;
  INSERT INTO public.question_governance_events(
    question_id,revision_id,actor_id,event_type,public_reason
  ) VALUES (
    p_question_id,r.id,p_user_id,'published',
    'Turkish letter restoration published without review (migration 215)'
  );
  INSERT INTO public.question_turkish_restorations(
    revision_id,question_id,base_revision_id,published_by,words,rule_version
  ) VALUES (r.id,p_question_id,base.id,p_user_id,v_words,'turkish-letter-restoration@1');
  out:=jsonb_build_object(
    'questionId',p_question_id,'revisionId',r.id,'status','published',
    'words',to_jsonb(v_words),'replayed',false
  );
  INSERT INTO public.content_governance_requests
  VALUES(p_user_id,'turkish_restoration',p_request_id,h,out,clock_timestamp());
  RETURN out;
END
$fn$;

REVOKE ALL ON FUNCTION public.publish_question_turkish_restoration(uuid,uuid,uuid,jsonb,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.publish_question_turkish_restoration(uuid,uuid,uuid,jsonb,uuid)
  TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
