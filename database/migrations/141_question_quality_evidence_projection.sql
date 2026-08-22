-- Migration 141: one revision-centred read model for quality evidence.
-- This is a reviewer projection only; it grants no automatic publish, reject
-- or quarantine authority to psychometrics, appeals or model verdicts.
BEGIN;

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
   'psychometrics',COALESCE((SELECT jsonb_agg(jsonb_build_object(
     'windowStart',p.window_start,'windowEnd',p.window_end,'sampleN',p.sample_n,'correctN',p.correct_n,
     'omittedN',p.omitted_n,'pCorrect',p.p_correct,'wilsonLow',p.wilson_low,'wilsonHigh',p.wilson_high,
     'discrimination',p.discrimination,'medianResponseTimeSec',p.median_response_time_sec,
     'fastResponseRate',p.fast_response_rate,'eligibilityPolicy',p.eligibility_policy,
     'materializedAt',p.materialized_at
   ) ORDER BY p.window_end DESC) FROM (SELECT * FROM public.question_revision_psychometrics WHERE revision_id=r.id ORDER BY window_end DESC LIMIT 12) p),'[]'::jsonb),
   'optionStatistics',COALESCE((
     SELECT jsonb_agg(jsonb_build_object(
       'windowStart',option_stat.window_start,'windowEnd',option_stat.window_end,
       'optionIndex',option_stat.option_index,'selectedN',option_stat.selected_n,
       'selectedRate',option_stat.selected_rate,'correctOption',option_stat.is_correct_option,
       'discrimination',option_stat.discrimination,'eligibilityPolicy',option_stat.eligibility_policy
     ) ORDER BY option_stat.option_index)
     FROM public.question_option_statistics option_stat
     WHERE option_stat.revision_id=r.id
       AND (option_stat.window_start,option_stat.window_end)=(
         SELECT latest.window_start,latest.window_end
         FROM public.question_option_statistics latest
         WHERE latest.revision_id=r.id
         ORDER BY latest.window_end DESC,latest.window_start DESC LIMIT 1
       )
   ),'[]'::jsonb),
   'appealSignals',jsonb_build_object(
     'openCount',(SELECT count(*)::int FROM public.question_appeals appeal WHERE appeal.revision_id=r.id AND appeal.status IN ('submitted','acknowledged','investigating')),
     'verifiedOpenCount',(SELECT count(*)::int FROM public.question_appeals appeal WHERE appeal.revision_id=r.id AND appeal.status IN ('submitted','acknowledged','investigating') AND appeal.evidence_kind IN ('verified_session','issued_attempt')),
     'byReason',COALESCE((SELECT jsonb_object_agg(signal.reason_code,signal.signal_count) FROM (
       SELECT appeal.reason_code,count(*)::int AS signal_count
       FROM public.question_appeals appeal
       WHERE appeal.revision_id=r.id AND appeal.status IN ('submitted','acknowledged','investigating')
       GROUP BY appeal.reason_code ORDER BY appeal.reason_code
     ) signal),'{}'::jsonb)
   ),
   'incidents',COALESCE((SELECT jsonb_agg(jsonb_build_object('incidentId',i.id,'erroneousRevisionId',i.erroneous_revision_id,'correctedRevisionId',i.corrected_revision_id,'errorType',i.error_type,'status',i.status,'eligibleCount',i.eligible_count,'changedCount',i.changed_count,'manualRequiredCount',i.manual_required_count,'createdAt',i.created_at,'closedAt',i.closed_at) ORDER BY i.created_at DESC) FROM public.question_error_incidents i WHERE i.erroneous_revision_id=r.id OR i.corrected_revision_id=r.id),'[]'::jsonb)
 )) INTO out FROM public.question_content_revisions r LEFT JOIN public.question_revision_sources s ON s.revision_id=r.id WHERE r.id=p_revision_id;
 IF out IS NULL THEN RAISE EXCEPTION 'revision not found' USING ERRCODE='P0002'; END IF;
 RETURN out;
END
$fn$;

REVOKE ALL ON FUNCTION public.get_question_content_revision(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_question_content_revision(uuid,uuid)
  TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
