-- Migration 213: retire only the verified legacy six-outcome CHECK from 098.
-- 193 installed dynamic counters but assumed a column-derived CHECK name;
-- PostgreSQL names the multi-column 098 expression *_sessions_check instead.
-- No learner data, blueprint, RPC, release flag, privilege or policy is changed.
-- Rollback is NOT a blanket re-add: seven-outcome evidence can exist after this
-- repair. Stop the affected entry flow and investigate; never rewrite answers.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '60s';
SET LOCAL search_path = pg_catalog;

-- Acquire the DDL lock before reading the catalog to exclude concurrent drift.
LOCK TABLE ONLY public.adaptive_diagnostic_sessions IN ACCESS EXCLUSIVE MODE;

DO $repair$
DECLARE
  v_table constant oid := 'public.adaptive_diagnostic_sessions'::regclass;
  v_legacy constant text := 'adaptive_diagnostic_sessions_check';
  v_expected record;
  v_constraint record;
  v_before_constraints jsonb;
  v_before_triggers jsonb;
  v_before_security jsonb;
  v_after jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid=v_table AND relkind='r' AND relrowsecurity
  ) OR EXISTS (
    SELECT 1 FROM pg_inherits WHERE inhrelid=v_table OR inhparent=v_table
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='diagnostic coverage repair: table topology or RLS drift';
  END IF;

  -- Exact catalog expressions measured on production; normalize whitespace only.
  -- Do not accept a similarly named, weaker, NOT VALID, or inherited constraint.
  FOR v_expected IN SELECT * FROM (VALUES
    ('adaptive_diagnostic_session_dynamic_counter_check',
     '(((question_count >= 1) AND (question_count <= 50)) AND ((outcome_count >= 1) AND (outcome_count <= 50)) AND ((max_per_outcome >= 1) AND (max_per_outcome <= 10)) AND (question_count >= outcome_count) AND (question_count <= (outcome_count * max_per_outcome)) AND ((answered_count >= 0) AND (answered_count <= question_count)) AND ((covered_outcomes >= 0) AND (covered_outcomes <= outcome_count)) AND (covered_outcomes <= answered_count))'),
    ('adaptive_diagnostic_session_state_check',
     '(((status = ''active''::text) AND (current_question_id IS NOT NULL) AND (completed_at IS NULL)) OR ((status = ''completed''::text) AND (current_question_id IS NULL) AND (completed_at IS NOT NULL) AND (covered_outcomes = outcome_count) AND (answered_count = question_count)) OR ((status = ''abandoned''::text) AND (current_question_id IS NULL) AND (completed_at IS NULL)))'),
    ('adaptive_diagnostic_session_scope_snapshot_check',
     '((game = lower(btrim(game))) AND (exam_ref = upper(btrim(exam_ref))) AND ((question_exam_ref IS NULL) OR (question_exam_ref = upper(btrim(question_exam_ref)))) AND (taxonomy_version = btrim(taxonomy_version)) AND (policy_version = btrim(policy_version)))'),
    ('adaptive_diagnostic_sessions_check1', '(expires_at > started_at)')
  ) AS expected(name, expression)
  LOOP
    SELECT * INTO v_constraint FROM pg_constraint
    WHERE conrelid=v_table AND conname=v_expected.name;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='diagnostic coverage repair: required constraint missing';
    END IF;
    IF v_constraint.contype<>'c' OR NOT v_constraint.convalidated
      OR NOT v_constraint.conislocal OR v_constraint.coninhcount<>0 OR v_constraint.connoinherit
      OR regexp_replace(pg_get_expr(v_constraint.conbin,v_table),'\s+','','g')
        IS DISTINCT FROM regexp_replace(v_expected.expression,'\s+','','g') THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='diagnostic coverage repair: required constraint drift';
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM pg_attribute WHERE attrelid=v_table
      AND attname IN ('question_count','outcome_count','max_per_outcome','answered_count','covered_outcomes')
      AND attnotnull AND NOT attisdropped AND atttypid='smallint'::regtype)<>5 THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='diagnostic coverage repair: counter column drift';
  END IF;
  FOR v_expected IN SELECT * FROM (VALUES
    ('aaa_adaptive_diagnostic_session_release_gate',7,'public.tg_require_adaptive_diagnostic_release()',NULL),
    ('aab_adaptive_diagnostic_session_scope_immutable',19,'public.tg_adaptive_diagnostic_session_scope_immutable()',NULL),
    ('trg_adaptive_diagnostic_question_snapshot',23,'public.tg_adaptive_diagnostic_question_snapshot()','current_question_id')
  ) AS expected(name, event_type, function_name, update_column)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=v_table AND tgname=v_expected.name
        AND NOT tgisinternal AND tgenabled='O' AND tgtype=v_expected.event_type
        AND tgfoid=to_regprocedure(v_expected.function_name)
        AND tgnargs=0 AND tgargs=''::bytea AND tgqual IS NULL
        AND tgconstraint=0 AND NOT tgdeferrable AND NOT tginitdeferred
        AND tgattr::text=CASE WHEN v_expected.update_column IS NULL THEN '' ELSE (
          SELECT attnum::text FROM pg_attribute
          WHERE attrelid=v_table AND attname=v_expected.update_column AND NOT attisdropped
        ) END) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='diagnostic coverage repair: required trigger drift';
    END IF;
  END LOOP;

  -- Unknown coverage CHECKs are drift, not permission to drop another object.
  -- Use column dependencies: renames and rebuilt/parenthesized variants must
  -- fail closed without pretending text normalization is semantic SQL proof.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=v_table AND contype='c'
      AND conname NOT IN (v_legacy,'adaptive_diagnostic_session_dynamic_counter_check',
        'adaptive_diagnostic_session_state_check')
      AND (SELECT attnum FROM pg_attribute WHERE attrelid=v_table
        AND attname='covered_outcomes' AND NOT attisdropped)=ANY(conkey)) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='diagnostic coverage repair: renamed legacy constraint drift';
  END IF;

  SELECT * INTO v_constraint FROM pg_constraint WHERE conrelid=v_table AND conname=v_legacy;
  IF FOUND THEN
    IF v_constraint.contype<>'c' OR NOT v_constraint.convalidated
      OR NOT v_constraint.conislocal OR v_constraint.coninhcount<>0 OR v_constraint.connoinherit
      OR regexp_replace(pg_get_expr(v_constraint.conbin,v_table),'\s+','','g')
        IS DISTINCT FROM '(((covered_outcomes>=0)AND(covered_outcomes<=6))AND(covered_outcomes<=answered_count))' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='diagnostic coverage repair: legacy constraint drift';
    END IF;
  END IF;

  -- Protect every other constraint (including FKs), every trigger (including
  -- institution completion), policies, ownership, column ACLs and NOT NULLs.
  SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) INTO v_before_constraints
    FROM pg_constraint AS c WHERE c.conrelid=v_table AND c.conname<>v_legacy;
  SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) INTO v_before_triggers
    FROM pg_trigger AS t WHERE t.tgrelid=v_table;
  SELECT jsonb_build_object(
    'owner',c.relowner,'acl',c.relacl,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
    'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy AS p WHERE p.polrelid=v_table),
    'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attnum) FROM pg_attribute AS a WHERE a.attrelid=v_table)
  ) INTO v_before_security FROM pg_class AS c WHERE c.oid=v_table;

  -- The sole persistent mutation. Missing target is safe only after all gates.
  ALTER TABLE ONLY public.adaptive_diagnostic_sessions
    DROP CONSTRAINT IF EXISTS adaptive_diagnostic_sessions_check;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=v_table AND conname=v_legacy) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='diagnostic coverage repair: legacy constraint remains';
  END IF;
  SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) INTO v_after
    FROM pg_constraint AS c WHERE c.conrelid=v_table;
  IF v_after IS DISTINCT FROM v_before_constraints THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='diagnostic coverage repair: protected constraint changed';
  END IF;
  SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) INTO v_after
    FROM pg_trigger AS t WHERE t.tgrelid=v_table;
  IF v_after IS DISTINCT FROM v_before_triggers THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='diagnostic coverage repair: protected trigger changed';
  END IF;
  SELECT jsonb_build_object(
    'owner',c.relowner,'acl',c.relacl,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
    'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy AS p WHERE p.polrelid=v_table),
    'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attnum) FROM pg_attribute AS a WHERE a.attrelid=v_table)
  ) INTO v_after FROM pg_class AS c WHERE c.oid=v_table;
  IF v_after IS DISTINCT FROM v_before_security THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='diagnostic coverage repair: protected security changed';
  END IF;
END;
$repair$;

COMMIT;
