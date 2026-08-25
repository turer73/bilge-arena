-- Migration 154: close the institution production review findings that require
-- forward database changes: invite audit resolution, archived tenant directory
-- visibility, and a catalog-driven account-data export.

BEGIN;

CREATE OR REPLACE FUNCTION public.audit_teacher_classroom_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_event_type text;
  v_classroom_id uuid;
  v_institution_id uuid;
  v_target_ref text;
  v_assignment_id uuid;
  v_metadata jsonb := '{}'::jsonb;
BEGIN
  v_event_type := CASE NEW.operation
    WHEN 'create_classroom' THEN 'classroom_created'
    WHEN 'issue_invite' THEN 'invite_issued'
    WHEN 'revoke_invite' THEN 'invite_revoked'
    WHEN 'accept_invite' THEN 'student_joined'
    WHEN 'withdraw_membership' THEN 'student_withdrawn'
    WHEN 'remove_member' THEN 'student_removed'
    WHEN 'publish_assignment' THEN 'assignment_published'
    WHEN 'submit_assignment' THEN 'assignment_submitted'
    WHEN 'set_bilge_tahta' THEN 'board_access_changed'
    WHEN 'set_exam_mode' THEN 'exam_mode_changed'
    ELSE NULL
  END;
  IF v_event_type IS NULL THEN RETURN NEW; END IF;

  IF NEW.result #>> '{classroom,id}' ~* '^[0-9a-f-]{36}$' THEN
    v_classroom_id := (NEW.result #>> '{classroom,id}')::uuid;
  ELSIF NEW.result ->> 'classroomId' ~* '^[0-9a-f-]{36}$' THEN
    v_classroom_id := (NEW.result ->> 'classroomId')::uuid;
  END IF;
  IF v_classroom_id IS NULL AND NEW.result ->> 'assignmentId' ~* '^[0-9a-f-]{36}$' THEN
    v_assignment_id := (NEW.result ->> 'assignmentId')::uuid;
    SELECT classroom_id INTO v_classroom_id
    FROM public.teacher_assignments WHERE id = v_assignment_id;
  END IF;
  IF v_classroom_id IS NULL AND NEW.result ->> 'inviteRef' ~* '^[0-9a-f]{32}$' THEN
    SELECT classroom_id INTO v_classroom_id
    FROM public.teacher_classroom_invites
    WHERE invite_ref = NEW.result ->> 'inviteRef';
  END IF;
  IF v_classroom_id IS NULL THEN RETURN NEW; END IF;
  SELECT institution_id INTO v_institution_id
  FROM public.teacher_classrooms WHERE id = v_classroom_id;
  IF v_institution_id IS NULL THEN RETURN NEW; END IF;

  v_target_ref := COALESCE(NEW.result ->> 'memberRef', NEW.result ->> 'inviteRef');
  IF v_event_type IN ('student_joined','student_withdrawn') THEN
    SELECT member_ref INTO v_target_ref
    FROM public.teacher_classroom_memberships
    WHERE classroom_id = v_classroom_id AND student_id = NEW.user_id
    ORDER BY accepted_at DESC LIMIT 1;
  END IF;
  IF v_target_ref IS NOT NULL AND v_target_ref !~ '^[0-9a-f]{32}$' THEN
    v_target_ref := NULL;
  END IF;
  IF NEW.operation = 'set_bilge_tahta' THEN
    v_metadata := jsonb_build_object('enabled', COALESCE((NEW.result ->> 'enabled')::boolean, false));
  ELSIF NEW.operation = 'set_exam_mode' THEN
    v_metadata := jsonb_build_object('expiresAt', NEW.result ->> 'expiresAt');
  ELSIF v_assignment_id IS NOT NULL THEN
    v_metadata := jsonb_build_object('assignmentId', v_assignment_id);
  END IF;

  INSERT INTO public.institution_operation_events(
    institution_id, actor_user_id, event_type, target_ref, classroom_id,
    source, request_id, metadata
  ) VALUES (
    v_institution_id, NEW.user_id, v_event_type, v_target_ref, v_classroom_id,
    'classroom_request', NEW.request_id, v_metadata
  ) ON CONFLICT (source, actor_user_id, event_type, request_id) DO NOTHING;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.list_pilot_institutions(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_institutions jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'institution platform actor required' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution platform actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.institution_pilot_is_platform_admin(p_user_id) THEN
    RAISE EXCEPTION 'institution platform permission required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', institution.id,
    'name', institution.name,
    'status', institution.status,
    'studentLimit', institution.student_limit,
    'staffLimit', institution.staff_limit,
    'staffCount', (
      SELECT count(*)::integer FROM public.pilot_institution_memberships AS staff
      WHERE staff.institution_id = institution.id AND staff.status = 'active'
    ),
    'classroomCount', (
      SELECT count(*)::integer FROM public.teacher_classrooms AS classroom
      WHERE classroom.institution_id = institution.id AND classroom.status = 'active'
    ),
    'studentCount', (
      SELECT count(DISTINCT student.student_id)::integer
      FROM public.teacher_classrooms AS classroom
      JOIN public.teacher_classroom_memberships AS student
        ON student.classroom_id = classroom.id AND student.status = 'active'
      JOIN public.profiles AS student_profile
        ON student_profile.id = student.student_id AND student_profile.deleted_at IS NULL
      WHERE classroom.institution_id = institution.id AND classroom.status = 'active'
    ),
    'manager', CASE WHEN manager.user_id IS NULL THEN NULL ELSE jsonb_build_object(
      'userId', manager.user_id,
      'alias', public.teacher_classroom_safe_alias(manager.user_id)
    ) END,
    'supportAccess', jsonb_build_object(
      'active', support_grant.expires_at IS NOT NULL,
      'expiresAt', support_grant.expires_at,
      'reason', support_grant.reason
    ),
    'createdAt', institution.created_at
  ) ORDER BY institution.created_at DESC, institution.id), '[]'::jsonb)
  INTO v_institutions
  FROM public.pilot_institutions AS institution
  LEFT JOIN LATERAL (
    SELECT membership.user_id
    FROM public.pilot_institution_memberships AS membership
    WHERE membership.institution_id = institution.id
      AND membership.status = 'active' AND membership.role = 'manager'
    LIMIT 1
  ) AS manager ON true
  LEFT JOIN LATERAL (
    SELECT support_grant.expires_at, support_grant.reason
    FROM public.institution_support_grants AS support_grant
    WHERE support_grant.institution_id = institution.id
      AND support_grant.revoked_at IS NULL
      AND support_grant.expires_at > clock_timestamp()
    ORDER BY support_grant.expires_at DESC LIMIT 1
  ) AS support_grant ON true
  WHERE institution.status IN ('pilot', 'active', 'suspended', 'archived');

  RETURN jsonb_build_object('institutions', v_institutions);
END;
$fn$;

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

  -- Catalog-driven coverage prevents newer directly user-linked tables (for
  -- example verified_attempts, review_cards/logs and classroom submissions)
  -- from silently falling out of the export when the product grows.
  FOR v_table IN
    SELECT relation.relname,
           array_agg(attribute.attname::text ORDER BY attribute.attnum) AS link_columns
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid = relation.oid
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND attribute.attnum > 0 AND NOT attribute.attisdropped
      AND attribute.atttypid = 'uuid'::regtype
      AND (
        attribute.attname = ANY (ARRAY[
          'user_id','student_id','teacher_id','owner_id','created_by','admin_id',
          'actor_user_id','target_user_id','manager_user_id','previous_manager_user_id',
          'assigned_by','reviewer_id','reported_user_id','blocker_id','blocked_id',
          'friend_id','recipient_id','sender_id'
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

  -- Rows owned through a parent relation have no direct subject UUID column.
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

  RETURN jsonb_build_object(
    'tables', v_tables,
    'coverage', jsonb_build_object(
      'directSubjectColumns', true,
      'relatedTables', jsonb_build_array('session_answers', 'teacher_assignment_submission_items')
    )
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.audit_teacher_classroom_request() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_pilot_institutions(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.list_pilot_institutions(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.export_account_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.export_account_data(uuid) TO service_role;

COMMIT;
