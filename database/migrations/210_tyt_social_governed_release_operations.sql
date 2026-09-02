-- Migration 210: TYT Social governed review operations and release control.
--
-- This migration does not release the scope and does not manufacture content,
-- source, outcome or exam-role approvals. It provides a privacy-minimised AAL2
-- review queue, closes stale-revision races in the role workflow, and installs
-- an explicitly invoked finalizer that remains fail-closed until every human
-- and technical proof is present.

BEGIN;

CREATE OR REPLACE FUNCTION public.tyt_social_revision_source_policy_ready(
  p_revision_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT p_revision_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.questions AS question
    JOIN public.question_content_revisions AS revision
      ON revision.id = question.published_revision_id
     AND revision.question_id = question.id
    JOIN public.question_revision_sources AS source
      ON source.revision_id = revision.id
    JOIN public.question_revision_approvals AS stage_one
      ON stage_one.revision_id = revision.id
     AND stage_one.stage = 1
     AND stage_one.decision = 'approved'
    JOIN public.question_revision_approvals AS stage_two
      ON stage_two.revision_id = revision.id
     AND stage_two.stage = 2
     AND stage_two.decision = 'approved'
    WHERE revision.id = p_revision_id
      AND question.is_active
      AND question.game::text = 'sosyal'
      AND upper(btrim(COALESCE(question.exam_ref::text, ''))) = 'TYT'
      AND revision.status = 'published'
      AND revision.published_at IS NOT NULL
      AND revision.change_kind <> 'legacy_import'
      AND revision.prepared_by IS NOT NULL
      AND revision.game IS NOT DISTINCT FROM question.game::text
      AND revision.category IS NOT DISTINCT FROM question.category::text
      AND upper(btrim(COALESCE(revision.exam_ref, ''))) = 'TYT'
      AND revision.difficulty IS NOT DISTINCT FROM question.difficulty
      AND revision.content_sha256 ~ '^[0-9a-f]{64}$'
      AND source.source_kind IN (
        'original','licensed','public_domain','user_generated','official_exam'
      )
      AND lower(source.license_code) <> 'legacy-import'
      AND NULLIF(btrim(COALESCE(source.provenance_ref, '')), '') IS NOT NULL
      AND lower(btrim(source.provenance_ref)) NOT LIKE 'legacy:%'
      AND stage_one.reviewer_id IS DISTINCT FROM stage_two.reviewer_id
      AND stage_one.reviewer_id IS DISTINCT FROM revision.prepared_by
      AND stage_two.reviewer_id IS DISTINCT FROM revision.prepared_by
      AND (
        revision.outcomes_prepared_by IS NULL
        OR (
          stage_one.reviewer_id IS DISTINCT FROM revision.outcomes_prepared_by
          AND stage_two.reviewer_id IS DISTINCT FROM revision.outcomes_prepared_by
        )
      )
  )
$fn$;

CREATE OR REPLACE FUNCTION public.prepare_tyt_social_exam_role(
  p_actor_user_id uuid,
  p_revision_id uuid,
  p_exam_role text,
  p_rationale text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_policy public.exam_candidate_policy_versions%ROWTYPE;
  v_revision public.question_content_revisions%ROWTYPE;
  v_candidate public.question_revision_exam_role_candidates%ROWTYPE;
  v_old public.content_governance_requests%ROWTYPE;
  v_hash text;
  v_result jsonb;
BEGIN
  IF NOT public.question_outcome_mapping_actor_has_aal2(p_actor_user_id)
    OR NOT public.content_governance_has_permission(p_actor_user_id,'content.prepare') THEN
    RAISE EXCEPTION 'AAL2 content prepare permission required' USING ERRCODE='42501';
  END IF;
  IF p_revision_id IS NULL OR p_request_id IS NULL
    OR char_length(btrim(COALESCE(p_rationale,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'invalid exam-role proposal' USING ERRCODE='22023';
  END IF;
  PERFORM public.content_governance_lock_request(
    p_actor_user_id,'prepare_tyt_social_exam_role',p_request_id
  );
  v_hash:=public.content_governance_hash(jsonb_build_object(
    'revisionId',p_revision_id,'examRole',p_exam_role,'rationale',btrim(p_rationale)
  ));
  SELECT * INTO v_old
  FROM public.content_governance_requests
  WHERE user_id=p_actor_user_id
    AND operation='prepare_tyt_social_exam_role'
    AND request_id=p_request_id;
  IF FOUND THEN
    IF v_old.payload_hash<>v_hash THEN
      RAISE EXCEPTION 'exam-role proposal replay differs' USING ERRCODE='22023';
    END IF;
    RETURN v_old.result||jsonb_build_object('replayed',true);
  END IF;

  SELECT * INTO v_policy
  FROM public.resolve_current_tyt_social_candidate_policy();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TYT Social policy unavailable' USING ERRCODE='55000';
  END IF;

  -- FOR SHARE prevents the question pointer or revision from being superseded
  -- between the current-published check and candidate insertion.
  SELECT revision.* INTO v_revision
  FROM public.questions AS question
  JOIN public.question_content_revisions AS revision
    ON revision.id=question.published_revision_id
   AND revision.question_id=question.id
  WHERE revision.id=p_revision_id
    AND question.is_active
    AND question.game::text='sosyal'
    AND upper(btrim(COALESCE(question.exam_ref::text,'')))='TYT'
    AND revision.status='published'
  FOR SHARE OF question,revision;

  IF NOT FOUND
    OR NOT public.tyt_social_revision_source_policy_ready(p_revision_id)
    OR NOT public.tyt_social_exam_role_compatible(v_revision.category,p_exam_role) THEN
    RAISE EXCEPTION 'current reviewed revision and compatible exam role required'
      USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.question_revision_exam_roles
    WHERE policy_version=v_policy.policy_version AND revision_id=p_revision_id
  ) THEN
    RAISE EXCEPTION 'revision exam role already approved' USING ERRCODE='23505';
  END IF;

  INSERT INTO public.question_revision_exam_role_candidates(
    policy_version,revision_id,proposed_role,rationale,prepared_by
  ) VALUES (
    v_policy.policy_version,p_revision_id,p_exam_role,btrim(p_rationale),p_actor_user_id
  ) RETURNING * INTO v_candidate;
  v_result:=jsonb_build_object(
    'candidateId',v_candidate.id,'revisionId',v_candidate.revision_id,
    'policyVersion',v_candidate.policy_version,'examRole',v_candidate.proposed_role,
    'status',v_candidate.status,'replayed',false
  );
  INSERT INTO public.content_governance_requests
  VALUES(
    p_actor_user_id,'prepare_tyt_social_exam_role',p_request_id,
    v_hash,v_result,clock_timestamp()
  );
  RETURN v_result;
END
$fn$;

CREATE OR REPLACE FUNCTION public.review_tyt_social_exam_role(
  p_actor_user_id uuid,
  p_candidate_id uuid,
  p_stage smallint,
  p_decision text,
  p_rationale text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_policy public.exam_candidate_policy_versions%ROWTYPE;
  v_candidate public.question_revision_exam_role_candidates%ROWTYPE;
  v_stage1 public.question_revision_exam_role_reviews%ROWTYPE;
  v_old public.content_governance_requests%ROWTYPE;
  v_hash text;
  v_result jsonb;
BEGIN
  IF NOT public.question_outcome_mapping_actor_has_aal2(p_actor_user_id)
    OR p_stage NOT IN (1,2)
    OR NOT public.content_governance_has_permission(
      p_actor_user_id,
      CASE p_stage
        WHEN 1 THEN 'content.review.stage1'
        ELSE 'content.review.stage2'
      END
    ) THEN
    RAISE EXCEPTION 'AAL2 content review permission required' USING ERRCODE='42501';
  END IF;
  IF p_candidate_id IS NULL OR p_request_id IS NULL
    OR p_decision NOT IN ('approved','rejected')
    OR char_length(btrim(COALESCE(p_rationale,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'invalid exam-role review' USING ERRCODE='22023';
  END IF;
  PERFORM public.content_governance_lock_request(
    p_actor_user_id,'review_tyt_social_exam_role',p_request_id
  );
  v_hash:=public.content_governance_hash(jsonb_build_object(
    'candidateId',p_candidate_id,'stage',p_stage,
    'decision',p_decision,'rationale',btrim(p_rationale)
  ));
  SELECT * INTO v_old
  FROM public.content_governance_requests
  WHERE user_id=p_actor_user_id
    AND operation='review_tyt_social_exam_role'
    AND request_id=p_request_id;
  IF FOUND THEN
    IF v_old.payload_hash<>v_hash THEN
      RAISE EXCEPTION 'exam-role review replay differs' USING ERRCODE='22023';
    END IF;
    RETURN v_old.result||jsonb_build_object('replayed',true);
  END IF;

  SELECT * INTO v_candidate
  FROM public.question_revision_exam_role_candidates
  WHERE id=p_candidate_id
  FOR UPDATE;
  IF NOT FOUND OR v_candidate.status IN ('approved','rejected')
    OR v_candidate.prepared_by=p_actor_user_id THEN
    RAISE EXCEPTION 'candidate is not reviewable by actor' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_policy
  FROM public.resolve_current_tyt_social_candidate_policy();
  IF NOT FOUND OR v_candidate.policy_version IS DISTINCT FROM v_policy.policy_version
    OR NOT public.tyt_social_revision_source_policy_ready(v_candidate.revision_id) THEN
    RAISE EXCEPTION 'candidate revision is no longer current and reviewed'
      USING ERRCODE='22023';
  END IF;
  -- Serialize against a concurrent publish that could supersede the revision.
  PERFORM 1
  FROM public.questions AS question
  JOIN public.question_content_revisions AS revision
    ON revision.id=question.published_revision_id
   AND revision.question_id=question.id
  WHERE revision.id=v_candidate.revision_id
  FOR SHARE OF question,revision;
  IF NOT FOUND OR NOT public.tyt_social_revision_source_policy_ready(v_candidate.revision_id) THEN
    RAISE EXCEPTION 'candidate revision is no longer current and reviewed'
      USING ERRCODE='22023';
  END IF;

  IF p_stage=1 AND v_candidate.status<>'pending' THEN
    RAISE EXCEPTION 'stage one review is out of order' USING ERRCODE='22023';
  END IF;
  IF p_stage=2 THEN
    SELECT * INTO v_stage1
    FROM public.question_revision_exam_role_reviews
    WHERE candidate_id=p_candidate_id AND stage=1 AND decision='approved';
    IF NOT FOUND OR v_candidate.status<>'stage1_approved'
      OR v_stage1.reviewer_id=p_actor_user_id THEN
      RAISE EXCEPTION 'stage two requires an independent stage one approval'
        USING ERRCODE='22023';
    END IF;
  END IF;

  INSERT INTO public.question_revision_exam_role_reviews(
    candidate_id,stage,reviewer_id,decision,rationale,request_id
  ) VALUES (
    p_candidate_id,p_stage,p_actor_user_id,p_decision,btrim(p_rationale),p_request_id
  );
  IF p_decision='rejected' THEN
    UPDATE public.question_revision_exam_role_candidates
    SET status='rejected',decided_at=clock_timestamp()
    WHERE id=p_candidate_id;
  ELSIF p_stage=1 THEN
    UPDATE public.question_revision_exam_role_candidates
    SET status='stage1_approved'
    WHERE id=p_candidate_id;
  ELSE
    INSERT INTO public.question_revision_exam_roles(
      policy_version,revision_id,exam_role,candidate_id,
      stage1_reviewer_id,stage2_reviewer_id
    ) VALUES (
      v_candidate.policy_version,v_candidate.revision_id,v_candidate.proposed_role,
      v_candidate.id,v_stage1.reviewer_id,p_actor_user_id
    );
    UPDATE public.question_revision_exam_role_candidates
    SET status='approved',decided_at=clock_timestamp()
    WHERE id=p_candidate_id;
  END IF;
  SELECT jsonb_build_object(
    'candidateId',candidate.id,'revisionId',candidate.revision_id,
    'policyVersion',candidate.policy_version,'examRole',candidate.proposed_role,
    'status',candidate.status,'replayed',false
  ) INTO v_result
  FROM public.question_revision_exam_role_candidates AS candidate
  WHERE candidate.id=p_candidate_id;
  INSERT INTO public.content_governance_requests
  VALUES(
    p_actor_user_id,'review_tyt_social_exam_role',p_request_id,
    v_hash,v_result,clock_timestamp()
  );
  RETURN v_result;
END
$fn$;

CREATE OR REPLACE FUNCTION public.get_tyt_social_release_operations(
  p_actor_user_id uuid,
  p_state text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_cursor uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_limit integer := GREATEST(1,LEAST(COALESCE(p_limit,50),100));
  v_source jsonb;
  v_candidate jsonb;
  v_combined jsonb;
  v_mapping jsonb;
  v_scope public.curriculum_scope_releases%ROWTYPE;
  v_evidence_recorded boolean := false;
  v_mapping_ready boolean := false;
  v_review_ready boolean := false;
  v_release_ready boolean := false;
  v_page jsonb;
BEGIN
  IF NOT public.question_outcome_mapping_actor_has_aal2(p_actor_user_id)
    OR NOT (
      public.content_governance_has_permission(p_actor_user_id,'content.prepare')
      OR public.content_governance_has_permission(p_actor_user_id,'content.review.stage1')
      OR public.content_governance_has_permission(p_actor_user_id,'content.review.stage2')
      OR public.content_governance_has_permission(p_actor_user_id,'content.publish')
    ) THEN
    RAISE EXCEPTION 'AAL2 content governance permission required' USING ERRCODE='42501';
  END IF;
  IF p_state IS NOT NULL AND p_state NOT IN (
    'source_prepare','content_stage1','content_stage2','content_publish',
    'role_prepare','role_stage1','role_stage2','ready','schema_drift'
  ) THEN
    RAISE EXCEPTION 'invalid TYT Social workflow state' USING ERRCODE='22023';
  END IF;

  v_source:=public.tyt_social_source_policy_integrity(
    'sosyal','TYT','ba-tyt-sosyal-v1'
  );
  v_candidate:=public.tyt_social_candidate_policy_integrity();
  v_combined:=public.tyt_social_combined_release_integrity();
  v_mapping:=public.curriculum_scope_integrity(
    'sosyal','TYT','ba-tyt-sosyal-v1'
  );
  SELECT * INTO v_scope
  FROM public.curriculum_scope_releases AS scope
  WHERE scope.game='sosyal'
    AND scope.display_exam_ref='TYT'
    AND scope.question_exam_ref='TYT'
    AND scope.taxonomy_version='ba-tyt-sosyal-v1';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TYT Social scope is not registered' USING ERRCODE='P0002';
  END IF;

  v_mapping_ready:=COALESCE((v_mapping->>'total')::integer,0)>0
    AND COALESCE((v_mapping->>'mapped')::integer,-1)=(v_mapping->>'total')::integer
    AND COALESCE((v_mapping->>'unmapped')::integer,-1)=0
    AND COALESCE((v_mapping->>'scopeMismatch')::integer,-1)=0
    AND COALESCE((v_mapping->>'nodeOrphan')::integer,-1)=0
    AND COALESCE((v_mapping->>'outcomeOrphan')::integer,-1)=0
    AND COALESCE((v_mapping->>'primaryMismatch')::integer,-1)=0
    AND COALESCE((v_mapping->>'emptyOutcome')::integer,-1)=0;
  SELECT EXISTS (
    SELECT 1
    FROM public.curriculum_scope_source_policy_evidence AS evidence
    WHERE evidence.game='sosyal'
      AND evidence.display_exam_ref='TYT'
      AND evidence.taxonomy_version='ba-tyt-sosyal-v1'
      AND evidence.source_policy_version=v_source->>'policyVersion'
      AND evidence.evidence_sha256=v_source->>'evidenceSha256'
  ) INTO v_evidence_recorded;
  v_review_ready:=COALESCE((v_combined->>'ready')::boolean,false)
    AND v_mapping_ready;
  v_release_ready:=v_review_ready
    AND v_evidence_recorded
    AND v_scope.release_status='released'
    AND NOT v_scope.diagnostic_enabled;

  WITH bank AS MATERIALIZED (
    SELECT question.id AS question_id,
      question.category::text AS category,
      question.difficulty,
      question.published_revision_id,
      COALESCE(work_revision.id,published.id) AS revision_id,
      COALESCE(work_revision.status,published.status) AS revision_status,
      COALESCE(work_revision.prepared_at,published.prepared_at) AS revision_created_at,
      public.tyt_social_revision_source_policy_ready(published.id) AS source_policy_ready,
      source.source_kind,
      source.source_title,
      source.license_code,
      NULLIF(btrim(COALESCE(source.provenance_ref,'')),'') IS NOT NULL
        AND lower(btrim(COALESCE(source.provenance_ref,''))) NOT LIKE 'legacy:%'
        AS provenance_ready,
      COALESCE(outcomes.outcome_count,0) AS outcome_count,
      role.exam_role,
      candidate.id AS candidate_id,
      candidate.proposed_role,
      candidate.status AS candidate_status
    FROM public.questions AS question
    LEFT JOIN public.question_content_revisions AS published
      ON published.id=question.published_revision_id
     AND published.question_id=question.id
    LEFT JOIN LATERAL (
      SELECT revision.*
      FROM public.question_content_revisions AS revision
      WHERE revision.question_id=question.id
        AND revision.status IN ('draft','stage1_approved','stage2_approved')
      ORDER BY revision.revision_no DESC,revision.id DESC
      LIMIT 1
    ) AS work_revision ON true
    LEFT JOIN public.question_revision_sources AS source
      ON source.revision_id=COALESCE(work_revision.id,published.id)
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS outcome_count
      FROM public.question_revision_outcomes AS mapping
      WHERE mapping.revision_id=COALESCE(work_revision.id,published.id)
    ) AS outcomes ON true
    LEFT JOIN public.resolve_current_tyt_social_candidate_policy() AS policy ON true
    LEFT JOIN public.question_revision_exam_roles AS role
      ON role.policy_version=policy.policy_version
     AND role.revision_id=published.id
    LEFT JOIN LATERAL (
      SELECT proposal.*
      FROM public.question_revision_exam_role_candidates AS proposal
      WHERE proposal.policy_version=policy.policy_version
        AND proposal.revision_id=published.id
        AND proposal.status IN ('pending','stage1_approved')
      ORDER BY proposal.prepared_at DESC,proposal.id DESC
      LIMIT 1
    ) AS candidate ON true
    WHERE question.is_active
      AND question.game::text='sosyal'
      AND upper(btrim(COALESCE(question.exam_ref::text,'')))='TYT'
      AND (p_cursor IS NULL OR question.id>p_cursor)
  ), classified AS MATERIALIZED (
    SELECT bank.*,
      CASE
        WHEN revision_id IS NULL OR published_revision_id IS NULL THEN 'schema_drift'
        WHEN revision_id IS DISTINCT FROM published_revision_id
          AND revision_status='draft' THEN 'content_stage1'
        WHEN revision_id IS DISTINCT FROM published_revision_id
          AND revision_status='stage1_approved' THEN 'content_stage2'
        WHEN revision_id IS DISTINCT FROM published_revision_id
          AND revision_status='stage2_approved' THEN 'content_publish'
        WHEN NOT source_policy_ready THEN 'source_prepare'
        WHEN exam_role IS NOT NULL THEN 'ready'
        WHEN candidate_status='pending' THEN 'role_stage1'
        WHEN candidate_status='stage1_approved' THEN 'role_stage2'
        ELSE 'role_prepare'
      END AS workflow_state,
      CASE category
        WHEN 'tarih' THEN jsonb_build_array('common_history')
        WHEN 'cografya' THEN jsonb_build_array('common_geography')
        WHEN 'din_kulturu' THEN jsonb_build_array('standard_religion')
        WHEN 'felsefe' THEN jsonb_build_array('common_philosophy','alternate_philosophy')
        WHEN 'sosyoloji' THEN jsonb_build_array('common_philosophy','alternate_philosophy')
        ELSE '[]'::jsonb
      END AS allowed_roles
    FROM bank
  ), page AS MATERIALIZED (
    SELECT * FROM classified
    WHERE p_state IS NULL OR workflow_state=p_state
    ORDER BY question_id
    LIMIT v_limit+1
  ), shown AS (
    SELECT * FROM page ORDER BY question_id LIMIT v_limit
  )
  SELECT jsonb_build_object(
    'items',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'questionId',item.question_id,
        'revisionId',item.revision_id,
        'publishedRevisionId',item.published_revision_id,
        'revisionStatus',item.revision_status,
        'revisionCreatedAt',item.revision_created_at,
        'category',item.category,
        'difficulty',item.difficulty,
        'workflowState',item.workflow_state,
        'sourcePolicyReady',item.source_policy_ready,
        'sourceKind',item.source_kind,
        'sourceTitle',item.source_title,
        'licenseCode',item.license_code,
        'provenanceReady',item.provenance_ready,
        'outcomeCount',item.outcome_count,
        'allowedRoles',item.allowed_roles,
        'candidateId',item.candidate_id,
        'proposedRole',item.proposed_role,
        'candidateStatus',item.candidate_status,
        'examRole',item.exam_role
      ) ORDER BY item.question_id)
      FROM shown AS item
    ),'[]'::jsonb),
    'nextCursor',CASE WHEN (SELECT count(*) FROM page)>v_limit
      THEN (SELECT item.question_id FROM shown AS item ORDER BY item.question_id DESC LIMIT 1)
      ELSE NULL END
  ) INTO v_page;

  RETURN v_page||jsonb_build_object(
    'readiness',jsonb_build_object(
      'policyVersion',v_candidate->>'policyVersion',
      'scopeStatus',v_scope.release_status,
      'diagnosticEnabled',v_scope.diagnostic_enabled,
      'activeQuestionCount',COALESCE((v_source->>'activeQuestionCount')::integer,0),
      'sourceApprovedQuestionCount',COALESCE((v_source->>'approvedQuestionCount')::integer,0),
      'sourceUnapprovedQuestionCount',COALESCE((v_source->>'unapprovedQuestionCount')::integer,0),
      'sourceEvidenceSha256',v_source->>'evidenceSha256',
      'sourceReady',COALESCE((v_source->>'sourceReady')::boolean,false),
      'assignedQuestionCount',COALESCE((v_candidate->>'assignedQuestionCount')::integer,0),
      'unassignedQuestionCount',COALESCE((v_candidate->>'unassignedQuestionCount')::integer,0),
      'invalidRoleCount',COALESCE((v_candidate->>'invalidRoleCount')::integer,0),
      'invalidApprovalProvenanceCount',
        COALESCE((v_candidate->>'invalidApprovalProvenanceCount')::integer,0),
      'roleCounts',COALESCE(v_candidate->'roleCounts','{}'::jsonb),
      'candidatePolicyReady',COALESCE((v_candidate->>'ready')::boolean,false),
      'masteryReaderReady',COALESCE((v_combined->>'masteryReaderReady')::boolean,false),
      'officialSectionComposerReady',
        COALESCE((v_combined->>'officialSectionComposerReady')::boolean,false),
      'mappingTotal',COALESCE((v_mapping->>'total')::integer,0),
      'mappingMapped',COALESCE((v_mapping->>'mapped')::integer,0),
      'mappingUnmapped',COALESCE((v_mapping->>'unmapped')::integer,0),
      'mappingScopeMismatch',COALESCE((v_mapping->>'scopeMismatch')::integer,0),
      'mappingNodeOrphan',COALESCE((v_mapping->>'nodeOrphan')::integer,0),
      'mappingOutcomeOrphan',COALESCE((v_mapping->>'outcomeOrphan')::integer,0),
      'mappingPrimaryMismatch',COALESCE((v_mapping->>'primaryMismatch')::integer,0),
      'mappingEmptyOutcome',COALESCE((v_mapping->>'emptyOutcome')::integer,0),
      'mappingReady',v_mapping_ready,
      'immutableSourceEvidenceRecorded',v_evidence_recorded,
      'reviewReady',v_review_ready,
      'releaseReady',v_release_ready
    )
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.release_tyt_social_mastery_scope(
  p_actor_user_id uuid,
  p_expected_source_evidence_sha256 text,
  p_expected_active_question_count integer,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_old public.content_governance_requests%ROWTYPE;
  v_hash text;
  v_source jsonb;
  v_candidate jsonb;
  v_combined jsonb;
  v_mapping jsonb;
  v_result jsonb;
  v_updated integer;
BEGIN
  IF NOT public.question_outcome_mapping_actor_has_aal2(p_actor_user_id)
    OR NOT public.content_governance_has_permission(p_actor_user_id,'content.publish') THEN
    RAISE EXCEPTION 'AAL2 content publish permission required' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL OR p_expected_active_question_count<=0
    OR p_expected_source_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid TYT Social release request' USING ERRCODE='22023';
  END IF;
  PERFORM public.content_governance_lock_request(
    p_actor_user_id,'release_tyt_social_mastery_scope',p_request_id
  );
  v_hash:=public.content_governance_hash(jsonb_build_object(
    'sourceEvidenceSha256',p_expected_source_evidence_sha256,
    'activeQuestionCount',p_expected_active_question_count
  ));
  SELECT * INTO v_old
  FROM public.content_governance_requests
  WHERE user_id=p_actor_user_id
    AND operation='release_tyt_social_mastery_scope'
    AND request_id=p_request_id;
  IF FOUND THEN
    IF v_old.payload_hash<>v_hash THEN
      RAISE EXCEPTION 'TYT Social release replay differs' USING ERRCODE='22023';
    END IF;
    RETURN v_old.result||jsonb_build_object('replayed',true);
  END IF;

  PERFORM set_config('lock_timeout','10s',true);
  PERFORM set_config('statement_timeout','15min',true);
  PERFORM pg_advisory_xact_lock(
    hashtextextended('tyt-social-governed-release:ba-tyt-sosyal-v1',210)
  );
  -- Fixed lock order closes TOCTOU between the full-bank proofs and release.
  LOCK TABLE public.curriculum_scope_releases IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.questions IN SHARE MODE;
  LOCK TABLE public.question_content_revisions IN SHARE MODE;
  LOCK TABLE public.question_revision_sources IN SHARE MODE;
  LOCK TABLE public.question_revision_approvals IN SHARE MODE;
  LOCK TABLE public.question_outcomes IN SHARE MODE;
  LOCK TABLE public.curriculum_outcomes IN SHARE MODE;
  LOCK TABLE public.curriculum_nodes IN SHARE MODE;
  LOCK TABLE public.question_revision_exam_role_candidates IN SHARE MODE;
  LOCK TABLE public.question_revision_exam_role_reviews IN SHARE MODE;
  LOCK TABLE public.question_revision_exam_roles IN SHARE MODE;
  LOCK TABLE public.exam_candidate_policy_versions IN SHARE MODE;
  LOCK TABLE public.exam_candidate_policy_variants IN SHARE MODE;
  LOCK TABLE public.mastery_outcome_evidence IN SHARE MODE;
  -- This transaction inserts the immutable release evidence below. Acquire the
  -- write-compatible lock in the fixed order up front instead of relying on a
  -- later lock upgrade that could race with another release transaction.
  LOCK TABLE public.curriculum_scope_source_policy_evidence IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.tyt_social_policy_capabilities IN SHARE MODE;

  IF NOT EXISTS (
    SELECT 1 FROM public.curriculum_scope_releases AS scope
    WHERE scope.game='sosyal'
      AND scope.display_exam_ref='TYT'
      AND scope.question_exam_ref='TYT'
      AND scope.taxonomy_version='ba-tyt-sosyal-v1'
      AND scope.release_status='validating'
      AND NOT scope.diagnostic_enabled
  ) THEN
    RAISE EXCEPTION 'TYT Social scope is not in the closed validating state'
      USING ERRCODE='55000';
  END IF;

  v_source:=public.tyt_social_source_policy_integrity(
    'sosyal','TYT','ba-tyt-sosyal-v1'
  );
  v_candidate:=public.tyt_social_candidate_policy_integrity();
  v_combined:=public.tyt_social_combined_release_integrity();
  v_mapping:=public.curriculum_scope_integrity(
    'sosyal','TYT','ba-tyt-sosyal-v1'
  );
  IF NOT COALESCE((v_source->>'sourceReady')::boolean,false)
    OR v_source->>'evidenceSha256' IS DISTINCT FROM p_expected_source_evidence_sha256
    OR COALESCE((v_source->>'activeQuestionCount')::integer,0)
      IS DISTINCT FROM p_expected_active_question_count
    OR COALESCE((v_source->>'approvedQuestionCount')::integer,0)
      IS DISTINCT FROM p_expected_active_question_count
    OR NOT COALESCE((v_candidate->>'ready')::boolean,false)
    OR NOT COALESCE((v_combined->>'ready')::boolean,false) THEN
    RAISE EXCEPTION 'TYT Social human or runtime release evidence is incomplete'
      USING ERRCODE='23514';
  END IF;
  IF COALESCE((v_mapping->>'total')::integer,0)<=0
    OR COALESCE((v_mapping->>'mapped')::integer,-1)<>(v_mapping->>'total')::integer
    OR COALESCE((v_mapping->>'unmapped')::integer,-1)<>0
    OR COALESCE((v_mapping->>'scopeMismatch')::integer,-1)<>0
    OR COALESCE((v_mapping->>'nodeOrphan')::integer,-1)<>0
    OR COALESCE((v_mapping->>'outcomeOrphan')::integer,-1)<>0
    OR COALESCE((v_mapping->>'primaryMismatch')::integer,-1)<>0
    OR COALESCE((v_mapping->>'emptyOutcome')::integer,-1)<>0 THEN
    RAISE EXCEPTION 'TYT Social curriculum mapping evidence is incomplete: %',v_mapping
      USING ERRCODE='23514';
  END IF;

  INSERT INTO public.curriculum_scope_source_policy_evidence(
    game,display_exam_ref,taxonomy_version,source_policy_version,
    evidence_sha256,evidence_manifest,approved_question_count,
    required_category_count
  ) VALUES (
    'sosyal','TYT','ba-tyt-sosyal-v1',v_source->>'policyVersion',
    v_source->>'evidenceSha256',v_source->'manifest',
    (v_source->>'approvedQuestionCount')::integer,
    (v_source->>'requiredCategoryCount')::integer
  ) ON CONFLICT (
    game,display_exam_ref,taxonomy_version,source_policy_version,evidence_sha256
  ) DO NOTHING;
  IF NOT EXISTS (
    SELECT 1 FROM public.curriculum_scope_source_policy_evidence AS evidence
    WHERE evidence.game='sosyal'
      AND evidence.display_exam_ref='TYT'
      AND evidence.taxonomy_version='ba-tyt-sosyal-v1'
      AND evidence.source_policy_version=v_source->>'policyVersion'
      AND evidence.evidence_sha256=v_source->>'evidenceSha256'
      AND evidence.evidence_manifest=v_source->'manifest'
      AND evidence.approved_question_count=p_expected_active_question_count
      AND evidence.required_category_count=(v_source->>'requiredCategoryCount')::integer
  ) THEN
    RAISE EXCEPTION 'TYT Social immutable source evidence was not recorded exactly'
      USING ERRCODE='23514';
  END IF;

  UPDATE public.curriculum_scope_releases AS scope
  SET release_status='released',diagnostic_enabled=false,
    released_at=COALESCE(scope.released_at,clock_timestamp()),
    updated_at=clock_timestamp()
  WHERE scope.game='sosyal'
    AND scope.display_exam_ref='TYT'
    AND scope.question_exam_ref='TYT'
    AND scope.taxonomy_version='ba-tyt-sosyal-v1'
    AND scope.release_status='validating'
    AND NOT scope.diagnostic_enabled;
  GET DIAGNOSTICS v_updated=ROW_COUNT;
  IF v_updated<>1 THEN
    RAISE EXCEPTION 'TYT Social scope release update was not exact'
      USING ERRCODE='23514';
  END IF;

  v_result:=jsonb_build_object(
    'scopeStatus','released','diagnosticEnabled',false,
    'activeQuestionCount',p_expected_active_question_count,
    'sourceEvidenceSha256',p_expected_source_evidence_sha256,
    'historicalEvidenceDisposition','not_backfilled',
    'replayed',false
  );
  INSERT INTO public.content_governance_requests
  VALUES(
    p_actor_user_id,'release_tyt_social_mastery_scope',p_request_id,
    v_hash,v_result,clock_timestamp()
  );
  RETURN v_result;
END
$fn$;

REVOKE ALL ON FUNCTION
  public.tyt_social_revision_source_policy_ready(uuid),
  public.prepare_tyt_social_exam_role(uuid,uuid,text,text,uuid),
  public.review_tyt_social_exam_role(uuid,uuid,smallint,text,text,uuid),
  public.get_tyt_social_release_operations(uuid,text,integer,uuid),
  public.release_tyt_social_mastery_scope(uuid,text,integer,uuid)
FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION
  public.prepare_tyt_social_exam_role(uuid,uuid,text,text,uuid),
  public.review_tyt_social_exam_role(uuid,uuid,smallint,text,text,uuid),
  public.get_tyt_social_release_operations(uuid,text,integer,uuid),
  public.release_tyt_social_mastery_scope(uuid,text,integer,uuid)
TO authenticated;

DO $postcheck$
DECLARE
  v_definition text;
  v_scope public.curriculum_scope_releases%ROWTYPE;
  v_operation oid;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.prepare_tyt_social_exam_role(uuid,uuid,text,text,uuid)'::regprocedure
  ) INTO v_definition;
  IF v_definition NOT LIKE '%tyt_social_revision_source_policy_ready%'
    OR v_definition NOT LIKE '%FOR SHARE OF question,revision%' THEN
    RAISE EXCEPTION 'TYT Social prepare stale-revision hardening is missing'
      USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_scope
  FROM public.curriculum_scope_releases AS scope
  WHERE scope.game='sosyal'
    AND scope.display_exam_ref='TYT'
    AND scope.question_exam_ref='TYT'
    AND scope.taxonomy_version='ba-tyt-sosyal-v1';
  IF NOT FOUND OR v_scope.release_status<>'validating'
    OR v_scope.diagnostic_enabled THEN
    RAISE EXCEPTION 'migration 210 must leave TYT Social closed in validating state'
      USING ERRCODE='23514';
  END IF;
  IF pg_catalog.has_function_privilege(
      'anon','public.tyt_social_revision_source_policy_ready(uuid)','EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'authenticated','public.tyt_social_revision_source_policy_ready(uuid)','EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'service_role','public.tyt_social_revision_source_policy_ready(uuid)','EXECUTE'
    ) THEN
    RAISE EXCEPTION 'TYT Social source-policy helper must remain private'
      USING ERRCODE='23514';
  END IF;
  FOREACH v_operation IN ARRAY ARRAY[
    'public.prepare_tyt_social_exam_role(uuid,uuid,text,text,uuid)'::regprocedure,
    'public.review_tyt_social_exam_role(uuid,uuid,smallint,text,text,uuid)'::regprocedure,
    'public.get_tyt_social_release_operations(uuid,text,integer,uuid)'::regprocedure,
    'public.release_tyt_social_mastery_scope(uuid,text,integer,uuid)'::regprocedure
  ] LOOP
    IF pg_catalog.has_function_privilege('anon',v_operation,'EXECUTE')
      OR NOT pg_catalog.has_function_privilege('authenticated',v_operation,'EXECUTE')
      OR pg_catalog.has_function_privilege('service_role',v_operation,'EXECUTE') THEN
      RAISE EXCEPTION 'TYT Social operation ACL drift: %',v_operation
        USING ERRCODE='23514';
    END IF;
    END LOOP;
  END
$postcheck$;

NOTIFY pgrst,'reload schema';
COMMIT;
