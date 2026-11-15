-- Hazirlayan kendi yayimlanmamis taslagini geri cekebilir (owner karari, 2026-11-15).
-- Gerekce: hazirlayan kendi taslagini inceleyemez kurali (106/227) taslagi kapatmayi da
-- engelliyordu; kopya veya bayat taslaklar yalniz bir inceleyicinin reddiyle kapanabiliyordu.
-- Bu migration yalniz KAPATMA yolu acar: onay, yayin ve iki bagimsiz inceleme kurali degismez.
-- Geri cekilen taslak status='rejected' olur; question_revision_approvals'a satir yazilmaz
-- (inceleme istatistigi kirlenmez). Idempotent istek defteri content_governance_requests.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE OR REPLACE FUNCTION public.withdraw_question_content_revision(
  p_user_id uuid,p_revision_id uuid,p_rationale text,p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  r public.question_content_revisions%ROWTYPE;
  h text;
  old public.content_governance_requests%ROWTYPE;
  out jsonb;
BEGIN
  IF p_user_id IS NULL OR p_revision_id IS NULL OR p_request_id IS NULL
    OR char_length(btrim(COALESCE(p_rationale,''))) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'invalid withdrawal' USING ERRCODE='22023';
  END IF;
  IF NOT public.content_governance_has_permission(p_user_id,'content.prepare') THEN
    RAISE EXCEPTION 'content prepare permission required' USING ERRCODE='42501';
  END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'withdraw_revision',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object('revisionId',p_revision_id,'rationale',p_rationale));
  SELECT * INTO old FROM public.content_governance_requests
  WHERE user_id=p_user_id AND operation='withdraw_revision' AND request_id=p_request_id;
  IF FOUND THEN
    IF old.payload_hash<>h THEN
      RAISE EXCEPTION 'withdrawal request payload mismatch' USING ERRCODE='22023';
    END IF;
    RETURN old.result||jsonb_build_object('replayed',true);
  END IF;
  SELECT * INTO r FROM public.question_content_revisions WHERE id=p_revision_id FOR UPDATE;
  -- Yalniz kendi taslagi; stage2_approved yayina hazirdir, onu kapatmak inceleyicinin isi.
  IF NOT FOUND OR r.prepared_by IS DISTINCT FROM p_user_id
    OR r.status NOT IN ('draft','stage1_approved') THEN
    RAISE EXCEPTION 'revision is not withdrawable' USING ERRCODE='22023';
  END IF;
  UPDATE public.question_content_revisions SET status='rejected' WHERE id=p_revision_id;
  out:=jsonb_build_object('revisionId',p_revision_id,'status','rejected','withdrawn',true,'replayed',false);
  INSERT INTO public.content_governance_requests
  VALUES(p_user_id,'withdraw_revision',p_request_id,h,out,clock_timestamp());
  RETURN out;
END
$fn$;

REVOKE ALL ON FUNCTION public.withdraw_question_content_revision(uuid,uuid,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.withdraw_question_content_revision(uuid,uuid,text,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
