-- Migration 156: keep account exports from disclosing reporters or moderation data.
-- user_reports is not a symmetric subject relation: the reported user must not
-- receive the reporter's row. Reporters receive only a safe projection of the
-- report they submitted; admin_note and resolved_by remain internal.

BEGIN;

CREATE OR REPLACE FUNCTION public.export_account_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_table record;
  v_predicate text;
  v_rows jsonb;
  v_tables jsonb := '{}'::jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'account export subject required' USING ERRCODE = '22023';
  END IF;

  -- Only subject columns are eligible. Actor/author columns such as teacher_id,
  -- created_by and admin_id do not make the other person's complete row part of
  -- the actor's DSAR export. user_reports is handled by a minimized projection
  -- below because reported_user_id must never reveal the reporter or moderation.
  FOR v_table IN
    SELECT relation.relname,
           array_agg(attribute.attname::text ORDER BY attribute.attnum) AS link_columns
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid = relation.oid
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND relation.relname <> 'user_reports'
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

  RETURN jsonb_build_object(
    'tables', v_tables,
    'coverage', jsonb_build_object(
      'directSubjectColumns', true,
      'relatedTables', jsonb_build_array(
        'session_answers',
        'teacher_assignment_submission_items',
        'user_reports_safe_projection'
      )
    )
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.export_account_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.export_account_data(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
