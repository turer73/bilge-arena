-- Independent, read-only postcheck for migration 213; never changes a ledger.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL search_path = pg_catalog;

DO $verify$
DECLARE
  v_table constant oid := 'public.adaptive_diagnostic_sessions'::regclass;
  v_expected record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=v_table AND (
      conname='adaptive_diagnostic_sessions_check' OR (contype='c'
        AND conname NOT IN ('adaptive_diagnostic_session_dynamic_counter_check',
          'adaptive_diagnostic_session_state_check')
        AND (SELECT attnum FROM pg_attribute WHERE attrelid=v_table
          AND attname='covered_outcomes' AND NOT attisdropped)=ANY(conkey)))) THEN
    RAISE EXCEPTION 'diagnostic coverage postcheck: legacy constraint remains';
  END IF;
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
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conrelid=v_table AND conname=v_expected.name
        AND contype='c' AND convalidated AND conislocal AND coninhcount=0 AND NOT connoinherit
        AND regexp_replace(pg_get_expr(conbin,conrelid),'\s+','','g')
          =regexp_replace(v_expected.expression,'\s+','','g')
    ) THEN
      RAISE EXCEPTION 'diagnostic coverage postcheck: required constraint mismatch';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_attribute WHERE attrelid=v_table
      AND attname IN ('question_count','outcome_count','max_per_outcome','answered_count','covered_outcomes')
      AND attnotnull AND NOT attisdropped AND atttypid='smallint'::regtype)<>5
    OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=v_table AND relkind='r' AND relrowsecurity)
    OR EXISTS (SELECT 1 FROM pg_inherits WHERE inhrelid=v_table OR inhparent=v_table) THEN
    RAISE EXCEPTION 'diagnostic coverage postcheck: table or column drift';
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
      RAISE EXCEPTION 'diagnostic coverage postcheck: required trigger drift';
    END IF;
  END LOOP;
END;
$verify$;

SELECT 'passed'::text AS diagnostic_coverage_postcheck,
  current_setting('transaction_read_only') AS transaction_read_only,
  current_setting('server_version_num') AS server_version_num;
ROLLBACK;
