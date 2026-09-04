-- Read-only production attestation for the legacy 178-180 ledger gap.
--
-- This proves current object, privilege, release, integrity and repair state.
-- It does NOT prove that the three historical SQL files were executed.
-- Keep the classification as state-equivalent until an exact execution receipt exists.

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';
SET LOCAL idle_in_transaction_session_timeout = '3min';

DO $verify$
DECLARE
  v_math_integrity jsonb;
  v_fen_integrity jsonb;
  v_missing_evidence bigint;
  v_repair_count integer;
BEGIN
  IF current_setting('transaction_read_only') <> 'on' THEN
    RAISE EXCEPTION 'legacy scope attestation must run in a read-only transaction';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version IN ('178', '179', '180')
       OR name IN (
         '178_curriculum_scope_release_registry',
         '179_release_tyt_fen_mastery_scope',
         '180_backfill_released_tyt_fen_mastery_evidence'
       )
  ) THEN
    RAISE EXCEPTION
      '178-180 ledger classification changed; stop and review migration history';
  END IF;

  IF to_regclass('public.curriculum_scope_releases') IS NULL
     OR to_regclass('public.curriculum_scope_evidence_repairs') IS NULL THEN
    RAISE EXCEPTION 'legacy curriculum scope objects are incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'curriculum_scope_releases',
        'curriculum_scope_evidence_repairs'
      )
      AND (
        relation.relkind <> 'r'
        OR NOT relation.relrowsecurity
        OR pg_get_userbyid(relation.relowner) <> 'postgres'
      )
  ) THEN
    RAISE EXCEPTION 'legacy curriculum scope table ownership or RLS drifted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('anon'::name),
      ('authenticated'::name),
      ('service_role'::name)
    ) AS checked_role(role_name)
    CROSS JOIN (VALUES
      ('public.curriculum_scope_releases'::text),
      ('public.curriculum_scope_evidence_repairs'::text)
    ) AS checked_table(table_name)
    WHERE has_table_privilege(
      checked_role.role_name,
      checked_table.table_name,
      'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
    )
  ) THEN
    RAISE EXCEPTION 'legacy curriculum scope table privilege boundary drifted';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index
    WHERE indexrelid =
      to_regclass('public.curriculum_scope_releases_question_scope_uidx')
      AND indisunique
      AND indisvalid
  ) THEN
    RAISE EXCEPTION 'curriculum scope release unique index is missing or invalid';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_proc AS routine
    JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.oid::regprocedure::text IN (
        'resolve_released_curriculum_scope(text,text)',
        'curriculum_scope_integrity(text,text,text)',
        'curriculum_graph_integrity()',
        'sync_taxonomy_auto_question_outcomes(uuid,text,text,text,boolean)',
        'materialize_verified_attempt_mastery(uuid)'
      )
      AND routine.prosecdef
      AND routine.proconfig @> ARRAY['search_path=pg_catalog']::text[]
      AND pg_get_userbyid(routine.proowner) = 'postgres'
  ) <> 5 THEN
    RAISE EXCEPTION 'legacy curriculum scope routine security metadata drifted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.resolve_released_curriculum_scope(text,text)'::text),
      ('public.curriculum_scope_integrity(text,text,text)'::text),
      ('public.curriculum_graph_integrity()'::text),
      ('public.sync_taxonomy_auto_question_outcomes(uuid,text,text,text,boolean)'::text),
      ('public.materialize_verified_attempt_mastery(uuid)'::text)
    ) AS routine(signature)
    CROSS JOIN (VALUES
      ('anon'::name),
      ('authenticated'::name)
    ) AS checked_role(role_name)
    WHERE has_function_privilege(
      checked_role.role_name,
      routine.signature,
      'EXECUTE'
    )
  ) THEN
    RAISE EXCEPTION 'anonymous or authenticated routine execution privilege drifted';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.resolve_released_curriculum_scope(text,text)',
    'EXECUTE'
  )
  OR NOT has_function_privilege(
    'service_role',
    'public.curriculum_scope_integrity(text,text,text)',
    'EXECUTE'
  )
  OR NOT has_function_privilege(
    'service_role',
    'public.curriculum_graph_integrity()',
    'EXECUTE'
  )
  OR has_function_privilege(
    'service_role',
    'public.sync_taxonomy_auto_question_outcomes(uuid,text,text,text,boolean)',
    'EXECUTE'
  )
  OR has_function_privilege(
    'service_role',
    'public.materialize_verified_attempt_mastery(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service-role routine execution boundary drifted';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.curriculum_scope_releases
    WHERE game = 'matematik'
      AND display_exam_ref = 'TYT'
      AND question_exam_ref = 'TYT'
      AND taxonomy_version = 'ba-tyt-math-v1'
      AND mapping_mode = 'category_proxy'
      AND release_status = 'released'
      AND diagnostic_enabled
      AND released_at IS NOT NULL
  )
  OR NOT EXISTS (
    SELECT 1
    FROM public.curriculum_scope_releases
    WHERE game = 'fen'
      AND display_exam_ref = 'TYT'
      AND question_exam_ref = 'TYT'
      AND taxonomy_version = 'ba-tyt-fen-v1'
      AND mapping_mode = 'category_proxy'
      AND release_status = 'released'
      AND diagnostic_enabled
      AND released_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'TYT Mathematics or Science release state drifted';
  END IF;

  v_math_integrity :=
    public.curriculum_scope_integrity('matematik', 'TYT', 'ba-tyt-math-v1');
  v_fen_integrity :=
    public.curriculum_scope_integrity('fen', 'TYT', 'ba-tyt-fen-v1');

  IF v_math_integrity IS NULL
     OR COALESCE((v_math_integrity->>'total')::integer, 0) <= 0
     OR (v_math_integrity->>'mapped')::integer
        <> (v_math_integrity->>'total')::integer
     OR COALESCE((v_math_integrity->>'unmapped')::integer, -1) <> 0
     OR COALESCE((v_math_integrity->>'scopeMismatch')::integer, -1) <> 0
     OR COALESCE((v_math_integrity->>'nodeOrphan')::integer, -1) <> 0
     OR COALESCE((v_math_integrity->>'outcomeOrphan')::integer, -1) <> 0
     OR COALESCE((v_math_integrity->>'primaryMismatch')::integer, -1) <> 0
     OR COALESCE((v_math_integrity->>'emptyOutcome')::integer, -1) <> 0 THEN
    RAISE EXCEPTION 'TYT Mathematics scope integrity drifted: %', v_math_integrity;
  END IF;

  IF v_fen_integrity IS NULL
     OR COALESCE((v_fen_integrity->>'total')::integer, 0) <= 0
     OR (v_fen_integrity->>'mapped')::integer
        <> (v_fen_integrity->>'total')::integer
     OR COALESCE((v_fen_integrity->>'unmapped')::integer, -1) <> 0
     OR COALESCE((v_fen_integrity->>'scopeMismatch')::integer, -1) <> 0
     OR COALESCE((v_fen_integrity->>'nodeOrphan')::integer, -1) <> 0
     OR COALESCE((v_fen_integrity->>'outcomeOrphan')::integer, -1) <> 0
     OR COALESCE((v_fen_integrity->>'primaryMismatch')::integer, -1) <> 0
     OR COALESCE((v_fen_integrity->>'emptyOutcome')::integer, -1) <> 0 THEN
    RAISE EXCEPTION 'TYT Science scope integrity drifted: %', v_fen_integrity;
  END IF;

  SELECT count(*)::integer
  INTO v_repair_count
  FROM public.curriculum_scope_evidence_repairs
  WHERE game = 'fen'
    AND display_exam_ref = 'TYT'
    AND taxonomy_version = 'ba-tyt-fen-v1'
    AND candidate_attempts = 9
    AND candidate_answers = 98
    AND candidate_evidence_rows = 98
    AND inserted_evidence_rows = 98
    AND affected_users = 5;

  IF v_repair_count <> 1 THEN
    RAISE EXCEPTION 'TYT Science evidence repair receipt drifted';
  END IF;

  SELECT count(*)
  INTO v_missing_evidence
  FROM public.verified_attempts AS attempt
  JOIN public.curriculum_scope_releases AS release
    ON release.game = 'fen'
   AND release.display_exam_ref = 'TYT'
   AND release.taxonomy_version = 'ba-tyt-fen-v1'
   AND release.release_status = 'released'
  JOIN public.session_answers AS answer
    ON answer.session_id = attempt.session_id
   AND answer.user_id = attempt.user_id
  JOIN public.questions AS question
    ON question.id = answer.question_id
  JOIN public.question_outcomes AS mapping
    ON mapping.question_id = question.id
   AND mapping.mapping_source = 'taxonomy_auto'
   AND mapping.is_primary
  JOIN public.curriculum_outcomes AS outcome
    ON outcome.id = mapping.outcome_id
   AND outcome.is_active
   AND outcome.game = 'fen'
   AND outcome.exam_ref = 'TYT'
   AND outcome.taxonomy_version = 'ba-tyt-fen-v1'
  JOIN public.curriculum_nodes AS node
    ON node.id = outcome.node_id
   AND node.is_active
   AND node.node_type = 'outcome'
  LEFT JOIN public.mastery_outcome_evidence AS existing
    ON existing.answer_id = answer.id
   AND existing.outcome_id = mapping.outcome_id
  WHERE attempt.game = 'fen'
    AND attempt.completed_at IS NOT NULL
    AND attempt.session_id IS NOT NULL
    AND answer.question_id = ANY(attempt.question_ids)
    AND NOT COALESCE(answer.is_skipped, false)
    AND question.game = 'fen'
    AND upper(COALESCE(question.exam_ref, '')) = 'TYT'
    AND question.is_active
    AND mapping.created_at > answer.answered_at
    AND existing.answer_id IS NULL;

  IF v_missing_evidence <> 0 THEN
    RAISE EXCEPTION
      'TYT Science legacy evidence repair has % missing rows',
      v_missing_evidence;
  END IF;
END
$verify$;

SELECT jsonb_build_object(
  'classification', 'ledger-absent, object-and-invariant-consistent',
  'verifiedAt', clock_timestamp(),
  'migrationSqlSha256', jsonb_build_object(
    '178', '1c20619814cff4a563ea895ca90fdea8d71e2e70345f8e0f07d89ca8e9d108d7',
    '179', 'e173d1c85217511bde1848ca8c331219c25c549ecbdcfbec194b828470cad060',
    '180', '3ea839b13954680c664c5a6e4eae529521e76bbc724197ff7ad68fd9d5564fb0'
  ),
  'ledgerRows', (
    SELECT count(*)
    FROM supabase_migrations.schema_migrations
    WHERE version IN ('178', '179', '180')
       OR name IN (
         '178_curriculum_scope_release_registry',
         '179_release_tyt_fen_mastery_scope',
         '180_backfill_released_tyt_fen_mastery_evidence'
       )
  ),
  'mathIntegrity',
    public.curriculum_scope_integrity('matematik', 'TYT', 'ba-tyt-math-v1'),
  'fenIntegrity',
    public.curriculum_scope_integrity('fen', 'TYT', 'ba-tyt-fen-v1'),
  'fenRepairReceipt', (
    SELECT to_jsonb(repair)
    FROM public.curriculum_scope_evidence_repairs AS repair
    WHERE game = 'fen'
      AND display_exam_ref = 'TYT'
      AND taxonomy_version = 'ba-tyt-fen-v1'
  ),
  'functionDefinitionMd5', (
    SELECT jsonb_object_agg(
      routine.oid::regprocedure::text,
      md5(pg_get_functiondef(routine.oid))
    )
    FROM pg_proc AS routine
    JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.oid::regprocedure::text IN (
        'resolve_released_curriculum_scope(text,text)',
        'curriculum_scope_integrity(text,text,text)',
        'curriculum_graph_integrity()',
        'sync_taxonomy_auto_question_outcomes(uuid,text,text,text,boolean)',
        'materialize_verified_attempt_mastery(uuid)'
      )
  )
) AS attestation;

ROLLBACK;
