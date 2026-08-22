-- Migration 144: staged cutover from legacy error_reports to the governed
-- question_appeals authority.
--
-- Migration-first remains safe: legacy intake stays open while enforcement is
-- off. First enforcement imports every remaining pending legacy report in the
-- same transaction, then permanently latches authenticated legacy intake off.
BEGIN;

ALTER TABLE public.content_governance_runtime
  ADD COLUMN IF NOT EXISTS legacy_report_intake_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.legacy_error_report_intake_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
  SELECT COALESCE((
    SELECT runtime.legacy_report_intake_enabled
    FROM public.content_governance_runtime runtime
    WHERE runtime.singleton
  ),false)
$fn$;

REVOKE ALL ON FUNCTION public.legacy_error_report_intake_enabled()
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.legacy_error_report_intake_enabled()
  TO authenticated;

DROP POLICY IF EXISTS "error_reports_insert" ON public.error_reports;
ALTER TABLE public.error_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "error_reports_insert" ON public.error_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid())=user_id
    AND public.legacy_error_report_intake_enabled()
  );

CREATE OR REPLACE FUNCTION public.set_content_governance_enforcement(
  p_user_id uuid,
  p_enforced boolean,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
DECLARE
  h text;
  old public.content_governance_requests%ROWTYPE;
  out jsonb;
  imported_count integer:=0;
  unimportable_count integer:=0;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.enforcement.manage') THEN
    RAISE EXCEPTION 'content enforcement permission required' USING ERRCODE='42501';
  END IF;
  IF p_enforced IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'invalid content enforcement request' USING ERRCODE='22023';
  END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'set_enforcement',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object('enforced',p_enforced));
  PERFORM pg_advisory_xact_lock(hashtextextended('content-governance-enforcement',106));
  SELECT * INTO old
  FROM public.content_governance_requests
  WHERE user_id=p_user_id AND operation='set_enforcement' AND request_id=p_request_id;
  IF FOUND THEN
    IF old.payload_hash<>h THEN
      RAISE EXCEPTION 'content enforcement payload mismatch' USING ERRCODE='22023';
    END IF;
    RETURN old.result||jsonb_build_object('replayed',true);
  END IF;

  IF p_enforced THEN
    -- A report may have been imported by migration 106 and then decided in the
    -- old admin during the rollout window. Carry that terminal/review state
    -- forward so cutover does not reopen already-decided work.
    WITH synchronized AS (
      UPDATE public.question_appeals appeal
      SET status=CASE report.status::text
          WHEN 'reviewed' THEN 'investigating'
          WHEN 'resolved' THEN 'resolved'
          WHEN 'rejected' THEN 'rejected'
          ELSE appeal.status
        END,
        acknowledged_at=CASE WHEN report.status::text IN ('reviewed','resolved','rejected')
          THEN COALESCE(appeal.acknowledged_at,clock_timestamp()) ELSE appeal.acknowledged_at END,
        resolved_at=CASE WHEN report.status::text IN ('resolved','rejected')
          THEN COALESCE(appeal.resolved_at,clock_timestamp()) ELSE appeal.resolved_at END
      FROM public.error_reports report
      WHERE appeal.legacy_error_report_id=report.id
        AND appeal.status IN ('submitted','acknowledged','investigating')
        AND report.status::text IN ('reviewed','resolved','rejected')
      RETURNING appeal.id,appeal.status
    )
    INSERT INTO public.question_appeal_events(appeal_id,event_type,public_message)
    SELECT synchronized.id,synchronized.status,
      'Eski rapor durumu yönetişim geçişinde eşitlendi.'
    FROM synchronized;

    WITH imported AS (
      INSERT INTO public.question_appeals(
        legacy_error_report_id,user_id,question_id,session_answer_id,revision_id,
        reason_code,description,status,submitted_at,ack_due_at,resolve_due_at
      )
      SELECT report.id,report.user_id,report.question_id,NULL,question.published_revision_id,
        CASE report.report_type::text
          WHEN 'wrong_answer' THEN 'wrong_key'
          WHEN 'unclear' THEN 'ambiguous'
          WHEN 'typo' THEN 'invalid_content'
          WHEN 'offensive' THEN 'invalid_content'
          ELSE 'other'
        END,
        left(COALESCE(report.description,''),1000),'submitted',report.created_at,
        report.created_at+interval '48 hours',report.created_at+interval '14 days'
      FROM public.error_reports report
      JOIN public.profiles profile ON profile.id=report.user_id
      JOIN public.questions question ON question.id=report.question_id
        AND question.published_revision_id IS NOT NULL
      WHERE report.status::text='pending'
      ON CONFLICT(legacy_error_report_id) DO NOTHING
      RETURNING id,user_id
    )
    INSERT INTO public.question_appeal_events(appeal_id,actor_id,event_type,public_message)
    SELECT imported.id,imported.user_id,'submitted',
      'Önceki soru bildiriminiz inceleme kuyruğuna taşındı.'
    FROM imported;
    GET DIAGNOSTICS imported_count=ROW_COUNT;

    SELECT count(*)::integer INTO unimportable_count
    FROM public.error_reports report
    LEFT JOIN public.question_appeals appeal
      ON appeal.legacy_error_report_id=report.id
    WHERE report.status::text='pending' AND appeal.id IS NULL;
    IF unimportable_count<>0 THEN
      RAISE EXCEPTION 'pending legacy reports could not be imported'
        USING ERRCODE='23514',DETAIL=unimportable_count::text;
    END IF;
  END IF;

  UPDATE public.content_governance_runtime
  SET enforce_direct_mutation=p_enforced,
    legacy_report_intake_enabled=CASE
      WHEN p_enforced THEN false ELSE legacy_report_intake_enabled
    END,
    updated_by=p_user_id,updated_at=clock_timestamp()
  WHERE singleton;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'content governance runtime row missing' USING ERRCODE='P0002';
  END IF;
  out:=jsonb_build_object(
    'enforced',p_enforced,'importedLegacyReports',imported_count,'replayed',false
  );
  INSERT INTO public.content_governance_requests
  VALUES(p_user_id,'set_enforcement',p_request_id,h,out,clock_timestamp());
  RETURN out;
END
$fn$;

CREATE OR REPLACE FUNCTION public.get_question_quality_appeal_counts(
  p_user_id uuid,
  p_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
DECLARE out jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'invalid question quality signal limit' USING ERRCODE='22023';
  END IF;
  IF NOT (
    public.content_governance_has_permission(p_user_id,'admin.questions.view')
    OR public.content_governance_has_permission(p_user_id,'content.prepare')
    OR public.content_governance_has_permission(p_user_id,'content.review.stage1')
    OR public.content_governance_has_permission(p_user_id,'content.review.stage2')
    OR public.content_governance_has_permission(p_user_id,'content.publish')
    OR public.content_governance_has_permission(p_user_id,'content.appeals.manage')
  ) THEN
    RAISE EXCEPTION 'question quality permission required' USING ERRCODE='42501';
  END IF;

  WITH grouped AS MATERIALIZED (
    SELECT appeal.question_id,count(*)::integer AS open_count,
      count(*) FILTER (
        WHERE appeal.evidence_kind IN ('verified_session','issued_attempt')
      )::integer AS verified_open_count
    FROM public.question_appeals appeal
    WHERE appeal.status IN ('submitted','acknowledged','investigating')
    GROUP BY appeal.question_id
    ORDER BY count(*) DESC,appeal.question_id
    LIMIT p_limit+1
  ), projected AS (
    SELECT * FROM grouped ORDER BY open_count DESC,question_id LIMIT p_limit
  )
  SELECT jsonb_build_object(
    'items',COALESCE(jsonb_agg(jsonb_build_object(
      'questionId',projected.question_id,
      'openCount',projected.open_count,
      'verifiedOpenCount',projected.verified_open_count
    ) ORDER BY projected.open_count DESC,projected.question_id),'[]'::jsonb),
    'capped',(SELECT count(*)>p_limit FROM grouped)
  ) INTO out
  FROM projected;
  RETURN out;
END
$fn$;

CREATE OR REPLACE FUNCTION public.finalize_legacy_question_appeal_transition(
  p_user_id uuid,
  p_appeal_id uuid,
  p_coins integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
DECLARE
  appeal public.question_appeals%ROWTYPE;
  report public.error_reports%ROWTYPE;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.appeals.manage') THEN
    RAISE EXCEPTION 'appeal management permission required' USING ERRCODE='42501';
  END IF;
  IF p_appeal_id IS NULL OR p_coins IS NULL OR p_coins NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'invalid legacy appeal transition' USING ERRCODE='22023';
  END IF;
  SELECT * INTO appeal FROM public.question_appeals WHERE id=p_appeal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'appeal not found' USING ERRCODE='P0002';
  END IF;
  IF appeal.legacy_error_report_id IS NULL THEN
    RETURN jsonb_build_object(
      'legacy',false,'awarded',false,'replayed',false,'coins',0,'userId',NULL
    );
  END IF;

  SELECT * INTO report
  FROM public.error_reports
  WHERE id=appeal.legacy_error_report_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'legacy error report missing' USING ERRCODE='P0002';
  END IF;

  UPDATE public.error_reports
  SET status=(CASE
      WHEN appeal.status IN ('acknowledged','investigating') THEN 'reviewed'
      WHEN appeal.status='resolved' THEN 'resolved'
      WHEN appeal.status IN ('rejected','withdrawn') THEN 'rejected'
      ELSE 'pending'
    END)::public.report_status,
    resolved_by=CASE WHEN appeal.status='resolved' THEN p_user_id ELSE NULL END,
    updated_at=clock_timestamp()
  WHERE id=report.id;

  IF appeal.status<>'resolved' THEN
    RETURN jsonb_build_object(
      'legacy',true,'awarded',false,'replayed',false,'coins',0,'userId',report.user_id
    );
  END IF;
  IF report.rewarded_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'legacy',true,'awarded',false,'replayed',true,
      'coins',COALESCE(report.rewarded_coins,0),'userId',report.user_id
    );
  END IF;
  IF report.user_id=p_user_id THEN
    RETURN jsonb_build_object(
      'legacy',true,'awarded',false,'replayed',false,'coins',0,'userId',report.user_id
    );
  END IF;

  PERFORM public.increment_coins(report.user_id,p_coins);
  UPDATE public.error_reports
  SET rewarded_at=clock_timestamp(),rewarded_coins=p_coins
  WHERE id=report.id;
  RETURN jsonb_build_object(
    'legacy',true,'awarded',true,'replayed',false,'coins',p_coins,'userId',report.user_id
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.get_question_quality_appeal_counts(uuid,integer)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_question_quality_appeal_counts(uuid,integer)
  TO service_role;
REVOKE ALL ON FUNCTION public.finalize_legacy_question_appeal_transition(uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.finalize_legacy_question_appeal_transition(uuid,uuid,integer)
  TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
