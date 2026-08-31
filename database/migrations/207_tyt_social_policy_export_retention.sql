-- Migration 207: TYT Social candidate-policy DSAR and retention boundary.
--
-- Candidate policy events intentionally store only the selected printed
-- question range. Even that neutral code can support a sensitive inference,
-- so the generic account export must not dump the raw row (especially the
-- replay request id). This migration adds a minimized, explicit projection.
--
-- The policy event and its attempt/plan snapshots are immutable provenance.
-- A tombstoned profile therefore keeps its pseudonymous UUID while a signed
-- retention decision is absent. No physical erase or mutable "anonymization"
-- of those facts is introduced here; migration 203's hard-delete boundary
-- remains fail closed.

BEGIN;

CREATE OR REPLACE FUNCTION public.export_tyt_social_candidate_policy_data(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_selection_events jsonb;
  v_attempt_provenance jsonb;
  v_daily_plan_provenance jsonb;
  v_policy_provenance jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'account export subject required' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'eventId', event_row.id,
        'policyVersion', event_row.policy_version,
        'variant', event_row.variant_code,
        'noticeVersion', event_row.notice_version,
        'supersedesEventId', event_row.supersedes_event_id,
        'effectiveAt', event_row.effective_at,
        'recordedAt', event_row.recorded_at
      ) ORDER BY event_row.effective_at, event_row.id
    ),
    '[]'::jsonb
  )
  INTO v_selection_events
  FROM public.candidate_exam_policy_events AS event_row
  WHERE event_row.user_id = p_user_id;

  -- Export proof that an immutable attempt used a particular policy/event,
  -- but do not expose the internal replay request id or semantic role map.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'attemptId', snapshot_row.attempt_id,
        'artifactKind', snapshot_row.artifact_kind,
        'sourcePlanId', snapshot_row.source_plan_id,
        'policyVersion', snapshot_row.policy_version,
        'variant', snapshot_row.variant_code,
        'selectionEventId', snapshot_row.selection_event_id,
        'selectionEffectiveAt', snapshot_row.selection_effective_at,
        'rulesSha256', snapshot_row.rules_sha256,
        'questionSetSha256', snapshot_row.question_set_sha256,
        'compositionSha256', encode(
          extensions.digest(snapshot_row.composition::text, 'sha256'),
          'hex'
        ),
        'resolvedAt', snapshot_row.resolved_at
      ) ORDER BY snapshot_row.resolved_at, snapshot_row.attempt_id
    ),
    '[]'::jsonb
  )
  INTO v_attempt_provenance
  FROM public.verified_attempt_candidate_policy_snapshots AS snapshot_row
  WHERE snapshot_row.user_id = p_user_id;

  -- Daily-plan provenance uses a digest of the immutable ordered question and
  -- revision set. Raw exam-role labels are deliberately not part of the DSAR
  -- projection because the neutral variant already describes the choice.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'planId', snapshot_row.plan_id,
        'policyVersion', snapshot_row.policy_version,
        'variant', snapshot_row.variant_code,
        'selectionEventId', snapshot_row.selection_event_id,
        'selectionEffectiveAt', snapshot_row.selection_effective_at,
        'rulesSha256', snapshot_row.rules_sha256,
        'questionSetSha256', COALESCE(
          (
            SELECT encode(
              extensions.digest(
                COALESCE(
                  string_agg(
                    question_row.position::text || ':' ||
                    question_row.question_id::text || ':' ||
                    question_row.revision_id::text,
                    '|' ORDER BY question_row.position
                  ),
                  ''
                ),
                'sha256'
              ),
              'hex'
            )
            FROM public.daily_plan_question_exam_role_snapshots AS question_row
            WHERE question_row.plan_id = snapshot_row.plan_id
              AND question_row.policy_version = snapshot_row.policy_version
          ),
          encode(extensions.digest(''::text, 'sha256'), 'hex')
        ),
        'resolvedAt', snapshot_row.resolved_at
      ) ORDER BY snapshot_row.resolved_at, snapshot_row.plan_id
    ),
    '[]'::jsonb
  )
  INTO v_daily_plan_provenance
  FROM public.daily_plan_candidate_policy_snapshots AS snapshot_row
  WHERE snapshot_row.user_id = p_user_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'policyVersion', policy_row.policy_version,
        'taxonomyVersion', policy_row.taxonomy_version,
        'validFrom', policy_row.valid_from,
        'validUntil', policy_row.valid_until,
        'rulesSha256', policy_row.rules_sha256,
        'officialSourceUrl', policy_row.official_source_url
      ) ORDER BY policy_row.valid_from, policy_row.policy_version
    ),
    '[]'::jsonb
  )
  INTO v_policy_provenance
  FROM public.exam_candidate_policy_versions AS policy_row
  WHERE EXISTS (
    SELECT 1
    FROM public.candidate_exam_policy_events AS event_row
    WHERE event_row.user_id = p_user_id
      AND event_row.policy_version = policy_row.policy_version
  );

  RETURN jsonb_build_object(
    'selectionEvents', v_selection_events,
    'attemptProvenance', v_attempt_provenance,
    'dailyPlanProvenance', v_daily_plan_provenance,
    'policyProvenance', v_policy_provenance,
    'selectionMeaning', 'printed_question_range_only',
    'containsReasonReligionOrDocument', false
  );
END;
$function$;

COMMENT ON FUNCTION public.export_tyt_social_candidate_policy_data(uuid) IS
  'Service-only minimized DSAR projection. Exports neutral range selections and immutable provenance; never replay ids, belief/exemption reasons, school data or documents.';

-- Keep migration 156's privacy treatment for reports, while excluding all
-- direct-user candidate-policy tables from the generic to_jsonb dump.
CREATE OR REPLACE FUNCTION public.export_account_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_table record;
  v_predicate text;
  v_rows jsonb;
  v_tables jsonb := '{}'::jsonb;
  v_candidate_policy jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'account export subject required' USING ERRCODE = '22023';
  END IF;

  FOR v_table IN
    SELECT relation.relname,
           array_agg(attribute.attname::text ORDER BY attribute.attnum) AS link_columns
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid = relation.oid
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND relation.relname <> ALL (ARRAY[
        'user_reports',
        'candidate_exam_policy_events',
        'verified_attempt_candidate_policy_snapshots',
        'daily_plan_candidate_policy_snapshots'
      ]::text[])
      AND attribute.attnum > 0 AND NOT attribute.attisdropped
      AND attribute.atttypid = 'uuid'::regtype
      AND (
        attribute.attname = ANY (ARRAY[
          'user_id','student_id','owner_id','target_user_id','manager_user_id',
          'previous_manager_user_id','blocker_id','blocked_id','friend_id',
          'recipient_id','sender_id'
        ])
        OR (relation.relname = 'profiles' AND attribute.attname = 'id')
      )
    GROUP BY relation.oid, relation.relname
    ORDER BY relation.relname
  LOOP
    SELECT string_agg(format('subject_row.%I = $1', link_column), ' OR ')
      INTO v_predicate
      FROM unnest(v_table.link_columns) AS link_column;

    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(to_jsonb(subject_row)), ''[]''::jsonb) FROM public.%I AS subject_row WHERE %s',
      v_table.relname,
      v_predicate
    ) INTO v_rows USING p_user_id;
    IF jsonb_array_length(v_rows) > 0 THEN
      v_tables := v_tables || jsonb_build_object(v_table.relname, v_rows);
    END IF;
  END LOOP;

  EXECUTE
    'SELECT COALESCE(jsonb_agg(to_jsonb(answer_row)), ''[]''::jsonb)
       FROM public.session_answers AS answer_row
       JOIN public.game_sessions AS session_row ON session_row.id = answer_row.session_id
      WHERE session_row.user_id = $1'
    INTO v_rows USING p_user_id;
  IF jsonb_array_length(v_rows) > 0 THEN
    v_tables := v_tables || jsonb_build_object('session_answers', v_rows);
  END IF;

  EXECUTE
    'SELECT COALESCE(jsonb_agg(to_jsonb(item_row)), ''[]''::jsonb)
       FROM public.teacher_assignment_submission_items AS item_row
       JOIN public.teacher_assignment_submissions AS submission_row
         ON submission_row.id = item_row.submission_id
      WHERE submission_row.student_id = $1'
    INTO v_rows USING p_user_id;
  IF jsonb_array_length(v_rows) > 0 THEN
    v_tables := v_tables || jsonb_build_object('teacher_assignment_submission_items', v_rows);
  END IF;

  IF to_regclass('public.user_reports') IS NOT NULL THEN
    EXECUTE
      'SELECT COALESCE(
         jsonb_agg(
           jsonb_build_object(
             ''id'', report_row.id,
             ''reportedUserId'', report_row.reported_user_id,
             ''reportType'', report_row.report_type,
             ''reason'', report_row.reason,
             ''status'', report_row.status,
             ''createdAt'', report_row.created_at,
             ''updatedAt'', report_row.updated_at
           ) ORDER BY report_row.created_at, report_row.id
         ),
         ''[]''::jsonb
       )
       FROM public.user_reports AS report_row
       WHERE report_row.reporter_id = $1'
      INTO v_rows USING p_user_id;
    IF jsonb_array_length(v_rows) > 0 THEN
      v_tables := v_tables || jsonb_build_object('user_reports', v_rows);
    END IF;
  END IF;

  v_candidate_policy := public.export_tyt_social_candidate_policy_data(p_user_id);
  IF jsonb_array_length(v_candidate_policy -> 'selectionEvents') > 0
     OR jsonb_array_length(v_candidate_policy -> 'attemptProvenance') > 0
     OR jsonb_array_length(v_candidate_policy -> 'dailyPlanProvenance') > 0 THEN
    v_tables := v_tables || jsonb_build_object(
      'tyt_social_candidate_policy',
      v_candidate_policy
    );
  END IF;

  RETURN jsonb_build_object(
    'tables', v_tables,
    'coverage', jsonb_build_object(
      'directSubjectColumns', true,
      'relatedTables', jsonb_build_array(
        'session_answers',
        'teacher_assignment_submission_items',
        'user_reports_safe_projection',
        'tyt_social_candidate_policy_safe_projection'
      )
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.preview_tyt_social_candidate_policy_retention(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_deleted_at timestamptz;
  v_event_count integer;
  v_attempt_snapshot_count integer;
  v_plan_snapshot_count integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'retention subject required' USING ERRCODE = '22023';
  END IF;

  SELECT profile_row.deleted_at
    INTO v_deleted_at
    FROM public.profiles AS profile_row
   WHERE profile_row.id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'retention subject profile unavailable' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer
    INTO v_event_count
    FROM public.candidate_exam_policy_events AS event_row
   WHERE event_row.user_id = p_user_id;
  SELECT count(*)::integer
    INTO v_attempt_snapshot_count
    FROM public.verified_attempt_candidate_policy_snapshots AS snapshot_row
   WHERE snapshot_row.user_id = p_user_id;
  SELECT count(*)::integer
    INTO v_plan_snapshot_count
    FROM public.daily_plan_candidate_policy_snapshots AS snapshot_row
   WHERE snapshot_row.user_id = p_user_id;

  RETURN jsonb_build_object(
    'subjectState', CASE WHEN v_deleted_at IS NULL THEN 'active' ELSE 'tombstoned' END,
    'deletedAt', v_deleted_at,
    'selectionEventCount', v_event_count,
    'attemptSnapshotCount', v_attempt_snapshot_count,
    'dailyPlanSnapshotCount', v_plan_snapshot_count,
    'immutableEvidencePresent', v_attempt_snapshot_count > 0 OR v_plan_snapshot_count > 0,
    'disposition', CASE
      WHEN v_deleted_at IS NULL THEN 'active_subject'
      ELSE 'pseudonymous_subject_key_retained'
    END,
    'physicalErasureEnabled', false,
    'legalDecisionRequired', true,
    'containsReasonReligionOrDocument', false
  );
END;
$function$;

COMMENT ON FUNCTION public.preview_tyt_social_candidate_policy_retention(uuid) IS
  'Service-only count-first retention preview. It performs no delete/update, preserves immutable attempt and plan evidence, and does not claim legal purge authority.';

REVOKE ALL ON FUNCTION public.export_tyt_social_candidate_policy_data(uuid),
  public.export_account_data(uuid),
  public.preview_tyt_social_candidate_policy_retention(uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.export_tyt_social_candidate_policy_data(uuid),
  public.export_account_data(uuid),
  public.preview_tyt_social_candidate_policy_retention(uuid)
TO service_role;

DO $postcheck$
DECLARE
  v_export_config text[];
  v_policy_export_config text[];
  v_retention_config text[];
  v_export_definition text;
  v_policy_export_definition text;
  v_hard_delete_definition text;
  v_bad_private_columns integer;
  v_append_only_count integer;
  v_restrictive_subject_fk boolean;
BEGIN
  SELECT procedure_row.proconfig, pg_get_functiondef(procedure_row.oid)
    INTO v_export_config, v_export_definition
    FROM pg_catalog.pg_proc AS procedure_row
   WHERE procedure_row.oid = 'public.export_account_data(uuid)'::regprocedure;
  SELECT procedure_row.proconfig, pg_get_functiondef(procedure_row.oid)
    INTO v_policy_export_config, v_policy_export_definition
    FROM pg_catalog.pg_proc AS procedure_row
   WHERE procedure_row.oid = 'public.export_tyt_social_candidate_policy_data(uuid)'::regprocedure;
  SELECT procedure_row.proconfig
    INTO v_retention_config
    FROM pg_catalog.pg_proc AS procedure_row
   WHERE procedure_row.oid = 'public.preview_tyt_social_candidate_policy_retention(uuid)'::regprocedure;
  SELECT pg_get_functiondef(procedure_row.oid)
    INTO v_hard_delete_definition
    FROM pg_catalog.pg_proc AS procedure_row
   WHERE procedure_row.oid = 'public.hard_delete_expired_users()'::regprocedure;

  IF NOT ('search_path=pg_catalog' = ANY(COALESCE(v_export_config, ARRAY[]::text[])))
     OR NOT ('search_path=pg_catalog' = ANY(COALESCE(v_policy_export_config, ARRAY[]::text[])))
     OR NOT ('search_path=pg_catalog' = ANY(COALESCE(v_retention_config, ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'TYT Social export/retention function search_path is not hardened';
  END IF;

  IF pg_catalog.has_function_privilege('anon', 'public.export_account_data(uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'public.export_account_data(uuid)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', 'public.export_account_data(uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.export_tyt_social_candidate_policy_data(uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'public.export_tyt_social_candidate_policy_data(uuid)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', 'public.export_tyt_social_candidate_policy_data(uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.preview_tyt_social_candidate_policy_retention(uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'public.preview_tyt_social_candidate_policy_retention(uuid)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', 'public.preview_tyt_social_candidate_policy_retention(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TYT Social export/retention RPC grants are not service-role-only';
  END IF;

  IF pg_catalog.strpos(v_export_definition, 'candidate_exam_policy_events') = 0
     OR pg_catalog.strpos(v_export_definition, 'verified_attempt_candidate_policy_snapshots') = 0
     OR pg_catalog.strpos(v_export_definition, 'daily_plan_candidate_policy_snapshots') = 0
     OR pg_catalog.strpos(v_export_definition, 'export_tyt_social_candidate_policy_data') = 0
     OR pg_catalog.strpos(v_policy_export_definition, 'request_id') <> 0 THEN
    RAISE EXCEPTION 'TYT Social DSAR projection is not minimized or raw-table exclusion drifted';
  END IF;

  SELECT count(*)::integer
    INTO v_bad_private_columns
    FROM information_schema.columns AS column_row
   WHERE column_row.table_schema = 'public'
     AND column_row.table_name = 'candidate_exam_policy_events'
     AND column_row.column_name ~ '(religion|belief|exemption|reason|document|school)';
  IF v_bad_private_columns <> 0 THEN
    RAISE EXCEPTION 'candidate policy event schema contains prohibited private-reason fields';
  END IF;

  SELECT count(*)::integer
    INTO v_append_only_count
    FROM pg_catalog.pg_trigger AS trigger_row
   WHERE trigger_row.tgrelid IN (
       'public.candidate_exam_policy_events'::regclass,
       'public.verified_attempt_candidate_policy_snapshots'::regclass,
       'public.verified_attempt_question_exam_role_snapshots'::regclass,
       'public.daily_plan_candidate_policy_snapshots'::regclass,
       'public.daily_plan_question_exam_role_snapshots'::regclass
     )
     AND trigger_row.tgname LIKE 'trg_%_append_only'
     AND NOT trigger_row.tgisinternal
     AND trigger_row.tgenabled <> 'D';
  IF v_append_only_count <> 5 THEN
    RAISE EXCEPTION 'candidate policy immutable evidence append-only triggers drifted';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.candidate_exam_policy_events'::regclass
      AND constraint_row.confrelid = 'public.profiles'::regclass
      AND constraint_row.contype = 'f'
      AND constraint_row.confdeltype IN ('a', 'r')
  ) INTO v_restrictive_subject_fk;
  IF NOT v_restrictive_subject_fk THEN
    RAISE EXCEPTION 'candidate policy subject relation must remain restrictive';
  END IF;

  IF v_hard_delete_definition IS NULL
     OR pg_catalog.strpos(
       v_hard_delete_definition,
       'hard account erasure is disabled pending a signed retention decision'
     ) = 0
     OR pg_catalog.strpos(pg_catalog.upper(v_hard_delete_definition), 'DELETE FROM') <> 0 THEN
    RAISE EXCEPTION 'legacy hard-delete boundary no longer fails closed';
  END IF;
END;
$postcheck$;

NOTIFY pgrst, 'reload schema';

COMMIT;
