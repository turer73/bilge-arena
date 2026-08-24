-- Migration 155: close the second institution security-review pass.
-- Adds database-enforced AAL2 for privileged JWT actors, permanent hashed
-- request-id tombstones, subject-safe DSAR coverage and complete audit fields.

BEGIN;

CREATE OR REPLACE FUNCTION public.institution_rpc_actor_has_aal2(p_actor_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT
    auth.uid() IS NULL
    OR auth.uid() IS DISTINCT FROM p_actor_user_id
    OR (
      COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
      ->> 'aal'
    ) = 'aal2';
$fn$;

CREATE OR REPLACE FUNCTION public.institution_pilot_payload_hash(p_payload jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF auth.uid() IS NOT NULL
    AND NOT public.institution_rpc_actor_has_aal2(auth.uid()) THEN
    RAISE EXCEPTION 'institution staff AAL2 required' USING ERRCODE = '42501';
  END IF;
  RETURN encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');
END;
$fn$;

CREATE OR REPLACE FUNCTION public.teacher_classroom_payload_hash(p_payload jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.pilot_institution_memberships AS membership
      WHERE membership.user_id = auth.uid() AND membership.status = 'active'
    )
    AND NOT public.institution_rpc_actor_has_aal2(auth.uid()) THEN
    RAISE EXCEPTION 'institution teacher AAL2 required' USING ERRCODE = '42501';
  END IF;
  RETURN encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');
END;
$fn$;

CREATE OR REPLACE FUNCTION public.institution_pilot_is_platform_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT public.institution_rpc_actor_has_aal2(p_user_id) AND EXISTS (
    SELECT 1
    FROM public.user_roles AS user_role
    JOIN public.role_permissions AS permission ON permission.role_id = user_role.role_id
    JOIN public.profiles AS profile ON profile.id = user_role.user_id
    WHERE user_role.user_id = p_user_id
      AND permission.permission = 'institution.pilots.manage'
      AND profile.deleted_at IS NULL
  );
$fn$;

CREATE OR REPLACE FUNCTION public.institution_member_has_permission(
  p_user_id uuid,
  p_institution_id uuid,
  p_permission text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT public.institution_rpc_actor_has_aal2(p_user_id) AND EXISTS (
    SELECT 1
    FROM public.pilot_institution_memberships AS membership
    JOIN public.pilot_institutions AS institution
      ON institution.id = membership.institution_id
      AND institution.status IN ('pilot', 'active')
    JOIN public.profiles AS profile
      ON profile.id = membership.user_id AND profile.deleted_at IS NULL
    JOIN public.institution_membership_roles AS membership_role
      ON membership_role.membership_id = membership.id
      AND membership_role.institution_id = membership.institution_id
    JOIN public.institution_role_permissions AS role_permission
      ON role_permission.role_id = membership_role.role_id
      AND role_permission.institution_id = membership.institution_id
    WHERE membership.user_id = p_user_id
      AND membership.institution_id = p_institution_id
      AND membership.status = 'active'
      AND role_permission.permission = p_permission
  );
$fn$;

CREATE OR REPLACE FUNCTION public.institution_pilot_has_role(
  p_user_id uuid,
  p_institution_id uuid,
  p_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT public.institution_rpc_actor_has_aal2(p_user_id) AND EXISTS (
    SELECT 1
    FROM public.pilot_institution_memberships AS membership
    JOIN public.pilot_institutions AS institution ON institution.id = membership.institution_id
    JOIN public.profiles AS profile ON profile.id = membership.user_id
    WHERE membership.user_id = p_user_id
      AND membership.institution_id = p_institution_id
      AND membership.status = 'active'
      AND membership.role = ANY(p_roles)
      AND institution.status IN ('pilot', 'active')
      AND profile.deleted_at IS NULL
  );
$fn$;

CREATE OR REPLACE FUNCTION public.institution_pilot_active_institution(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT membership.institution_id
  FROM public.pilot_institution_memberships AS membership
  JOIN public.pilot_institutions AS institution ON institution.id = membership.institution_id
  JOIN public.profiles AS profile ON profile.id = membership.user_id
  WHERE public.institution_rpc_actor_has_aal2(p_user_id)
    AND membership.user_id = p_user_id
    AND membership.status = 'active'
    AND institution.status IN ('pilot', 'active')
    AND profile.deleted_at IS NULL
  ORDER BY (membership.role = 'manager') DESC, membership.joined_at
  LIMIT 1;
$fn$;

CREATE OR REPLACE FUNCTION public.institution_support_has_access(
  p_admin_user_id uuid,
  p_institution_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT public.institution_rpc_actor_has_aal2(p_admin_user_id) AND EXISTS (
    SELECT 1
    FROM public.user_roles AS user_role
    JOIN public.role_permissions AS permission ON permission.role_id = user_role.role_id
    JOIN public.profiles AS admin_profile ON admin_profile.id = user_role.user_id
    JOIN public.pilot_institutions AS institution ON institution.id = p_institution_id
    JOIN public.institution_support_grants AS support_grant
      ON support_grant.institution_id = institution.id
    WHERE user_role.user_id = p_admin_user_id
      AND permission.permission = 'institution.support.access'
      AND admin_profile.deleted_at IS NULL
      AND institution.status IN ('pilot', 'active')
      AND support_grant.revoked_at IS NULL
      AND support_grant.expires_at > clock_timestamp()
  );
$fn$;

CREATE OR REPLACE FUNCTION public.teacher_classroom_is_teacher(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT public.institution_rpc_actor_has_aal2(p_user_id) AND EXISTS (
    SELECT 1
    FROM public.user_roles AS user_role
    JOIN public.roles AS platform_role ON platform_role.id = user_role.role_id
    JOIN public.role_permissions AS permission ON permission.role_id = platform_role.id
    JOIN public.profiles AS profile ON profile.id = user_role.user_id
    JOIN public.pilot_institution_memberships AS membership
      ON membership.user_id = user_role.user_id
      AND membership.status = 'active'
    JOIN public.pilot_institutions AS institution
      ON institution.id = membership.institution_id
      AND institution.status IN ('pilot', 'active')
    WHERE user_role.user_id = p_user_id
      AND platform_role.slug = 'institution_pilot_staff'
      AND permission.permission = 'teacher.classrooms.manage'
      AND profile.deleted_at IS NULL
      AND (
        membership.role = 'teacher'
        OR EXISTS (
          SELECT 1
          FROM public.institution_membership_roles AS assignment
          JOIN public.institution_roles AS institution_role
            ON institution_role.id = assignment.role_id
            AND institution_role.institution_id = assignment.institution_id
          WHERE assignment.membership_id = membership.id
            AND assignment.institution_id = membership.institution_id
            AND institution_role.is_system
            AND institution_role.role_key = 'teacher'
        )
      )
  );
$fn$;

CREATE OR REPLACE FUNCTION public.teacher_classroom_is_blocked(p_first uuid, p_second uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF auth.uid() IS NOT NULL
    AND auth.uid() = p_first
    AND EXISTS (
      SELECT 1 FROM public.pilot_institution_memberships AS membership
      JOIN public.pilot_institutions AS institution ON institution.id = membership.institution_id
      WHERE membership.user_id = p_first
        AND membership.status = 'active'
        AND institution.status IN ('pilot', 'active')
    )
    AND NOT public.institution_rpc_actor_has_aal2(p_first) THEN
    RAISE EXCEPTION 'institution staff AAL2 required' USING ERRCODE = '42501';
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.friendships AS friendship
    WHERE friendship.status = 'blocked'
      AND (
        (friendship.user_id = p_first AND friendship.friend_id = p_second)
        OR (friendship.user_id = p_second AND friendship.friend_id = p_first)
      )
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_my_institution_support_access(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_institution_id uuid;
  v_grant public.institution_support_grants%ROWTYPE;
  v_active boolean := false;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'institution support actor required' USING ERRCODE = '22023';
  END IF;
  IF (auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id)
    OR NOT public.institution_rpc_actor_has_aal2(p_user_id) THEN
    RAISE EXCEPTION 'institution support actor mismatch or AAL2 required' USING ERRCODE = '42501';
  END IF;
  SELECT membership.institution_id INTO v_institution_id
  FROM public.pilot_institution_memberships AS membership
  JOIN public.pilot_institutions AS institution ON institution.id = membership.institution_id
    AND institution.status IN ('pilot', 'active')
  WHERE membership.user_id = p_user_id
    AND membership.status = 'active'
    AND membership.role = 'manager';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'institution manager permission required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_grant
  FROM public.institution_support_grants AS support_grant
  WHERE support_grant.institution_id = v_institution_id
    AND support_grant.revoked_at IS NULL
    AND support_grant.expires_at > clock_timestamp()
  ORDER BY support_grant.expires_at DESC
  LIMIT 1;
  v_active := FOUND;

  RETURN jsonb_build_object(
    'institutionId', v_institution_id,
    'active', v_active,
    'grantRef', CASE WHEN v_active THEN v_grant.grant_ref ELSE NULL END,
    'scope', CASE WHEN v_active THEN v_grant.scope ELSE 'read_only' END,
    'reason', CASE WHEN v_active THEN v_grant.reason ELSE NULL END,
    'grantedAt', CASE WHEN v_active THEN v_grant.granted_at ELSE NULL END,
    'expiresAt', CASE WHEN v_active THEN v_grant.expires_at ELSE NULL END
  );
END;
$fn$;

CREATE TABLE IF NOT EXISTS public.institution_request_tombstones (
  request_key text PRIMARY KEY CHECK (request_key ~ '^[0-9a-f]{32}$'),
  source text NOT NULL CHECK (source IN ('pilot_institution_requests', 'teacher_classroom_requests')),
  pruned_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.institution_request_tombstones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.institution_request_tombstones FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reject_reused_institution_request_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_request_key text;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() = NEW.user_id
    AND (
      TG_TABLE_NAME = 'pilot_institution_requests'
      OR EXISTS (
        SELECT 1 FROM public.pilot_institution_memberships AS membership
        WHERE membership.user_id = NEW.user_id AND membership.status = 'active'
      )
    )
    AND NOT public.institution_rpc_actor_has_aal2(NEW.user_id) THEN
    RAISE EXCEPTION 'institution request AAL2 required' USING ERRCODE = '42501';
  END IF;

  v_request_key := md5(format('%s:%s:%s', TG_TABLE_NAME, NEW.user_id, NEW.request_id));
  IF EXISTS (
    SELECT 1 FROM public.institution_request_tombstones AS tombstone
    WHERE tombstone.request_key = v_request_key
  ) THEN
    RAISE EXCEPTION 'institution request id expired and cannot be reused'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS pilot_institution_request_tombstone_guard
  ON public.pilot_institution_requests;
CREATE TRIGGER pilot_institution_request_tombstone_guard
BEFORE INSERT ON public.pilot_institution_requests
FOR EACH ROW EXECUTE FUNCTION public.reject_reused_institution_request_id();

DROP TRIGGER IF EXISTS teacher_classroom_request_tombstone_guard
  ON public.teacher_classroom_requests;
CREATE TRIGGER teacher_classroom_request_tombstone_guard
BEFORE INSERT ON public.teacher_classroom_requests
FOR EACH ROW EXECUTE FUNCTION public.reject_reused_institution_request_id();

CREATE OR REPLACE FUNCTION public.prune_institution_request_ledgers(
  p_cutoff timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_pilot_count integer;
  v_classroom_count integer;
  v_tombstone_count integer;
BEGIN
  IF p_cutoff IS NULL
    OR p_cutoff > clock_timestamp() - interval '30 days'
    OR p_cutoff < clock_timestamp() - interval '2 years' THEN
    RAISE EXCEPTION 'institution request ledger cutoff outside safe bounds'
      USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'institution request ledger maintenance requires service role'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('institution-request-ledger-retention', 0));

  INSERT INTO public.institution_request_tombstones(request_key, source)
  SELECT md5(format('%s:%s:%s', 'pilot_institution_requests', request.user_id, request.request_id)),
         'pilot_institution_requests'
  FROM public.pilot_institution_requests AS request
  WHERE request.created_at < p_cutoff
  UNION ALL
  SELECT md5(format('%s:%s:%s', 'teacher_classroom_requests', request.user_id, request.request_id)),
         'teacher_classroom_requests'
  FROM public.teacher_classroom_requests AS request
  WHERE request.created_at < p_cutoff
  ON CONFLICT (request_key) DO NOTHING;
  GET DIAGNOSTICS v_tombstone_count = ROW_COUNT;

  DELETE FROM public.pilot_institution_requests WHERE created_at < p_cutoff;
  GET DIAGNOSTICS v_pilot_count = ROW_COUNT;
  DELETE FROM public.teacher_classroom_requests WHERE created_at < p_cutoff;
  GET DIAGNOSTICS v_classroom_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'cutoff', p_cutoff,
    'pilotInstitutionRequestsDeleted', v_pilot_count,
    'teacherClassroomRequestsDeleted', v_classroom_count,
    'requestTombstonesCreated', v_tombstone_count
  );
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

  -- Only subject columns are eligible. Actor/author columns such as teacher_id,
  -- created_by and admin_id do not make the other person's complete row part of
  -- the actor's DSAR export.
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
          'user_id','student_id','owner_id','target_user_id','manager_user_id',
          'previous_manager_user_id','reported_user_id','blocker_id','blocked_id',
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

CREATE OR REPLACE FUNCTION public.audit_institution_pilot_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_event_type text;
  v_institution_id uuid;
  v_classroom_id uuid;
  v_target_ref text;
  v_metadata jsonb := '{}'::jsonb;
BEGIN
  v_event_type := CASE NEW.operation
    WHEN 'provision' THEN 'institution_provisioned'
    WHEN 'add_teacher_by_email' THEN 'staff_added'
    WHEN 'add_teacher' THEN 'staff_added'
    WHEN 'remove_teacher' THEN 'staff_removed'
    WHEN 'set_manager_teacher_role' THEN 'manager_teaching_changed'
    WHEN 'transfer_manager' THEN 'manager_transferred'
    WHEN 'create_institution_role' THEN 'role_created'
    WHEN 'update_institution_role' THEN 'role_updated'
    WHEN 'delete_institution_role' THEN 'role_deleted'
    WHEN 'assign_institution_role' THEN 'role_assignment_changed'
    WHEN 'revoke_institution_role' THEN 'role_assignment_changed'
    WHEN 'create_classroom' THEN 'classroom_created'
    WHEN 'create_study_program_draft' THEN 'study_program_created'
    WHEN 'update_study_program_draft' THEN 'study_program_updated'
    WHEN 'publish_study_program' THEN 'study_program_published'
    WHEN 'review_study_program' THEN 'study_program_reviewed'
    WHEN 'open_student_followup' THEN 'student_followup_opened'
    WHEN 'resolve_student_followup' THEN 'student_followup_resolved'
    WHEN 'create_student_report' THEN 'student_report_created'
    WHEN 'grant_support_access' THEN 'support_access_granted'
    WHEN 'revoke_support_access' THEN 'support_access_revoked'
    ELSE NULL
  END;
  IF v_event_type IS NULL THEN RETURN NEW; END IF;

  IF NEW.result #>> '{institution,id}' ~* '^[0-9a-f-]{36}$' THEN
    v_institution_id := (NEW.result #>> '{institution,id}')::uuid;
  ELSIF NEW.result ->> 'institutionId' ~* '^[0-9a-f-]{36}$' THEN
    v_institution_id := (NEW.result ->> 'institutionId')::uuid;
  END IF;
  IF NEW.result ->> 'classroomId' ~* '^[0-9a-f-]{36}$' THEN
    v_classroom_id := (NEW.result ->> 'classroomId')::uuid;
  ELSIF NEW.result #>> '{classroom,id}' ~* '^[0-9a-f-]{36}$' THEN
    v_classroom_id := (NEW.result #>> '{classroom,id}')::uuid;
  END IF;
  IF v_institution_id IS NULL AND v_classroom_id IS NOT NULL THEN
    SELECT institution_id INTO v_institution_id
    FROM public.teacher_classrooms WHERE id = v_classroom_id;
  END IF;
  IF v_institution_id IS NULL THEN
    SELECT membership.institution_id INTO v_institution_id
    FROM public.pilot_institution_memberships AS membership
    WHERE membership.user_id = NEW.user_id AND membership.status = 'active'
    ORDER BY (membership.role = 'manager') DESC, membership.joined_at LIMIT 1;
  END IF;
  IF v_institution_id IS NULL THEN RETURN NEW; END IF;

  v_target_ref := COALESCE(
    NEW.result ->> 'memberRef', NEW.result ->> 'managerRef',
    NEW.result ->> 'roleRef', NEW.result ->> 'programRef',
    NEW.result ->> 'reviewRef', NEW.result ->> 'followupRef',
    NEW.result ->> 'reportRef', NEW.result ->> 'grantRef'
  );
  IF v_target_ref IS NOT NULL AND v_target_ref !~ '^[0-9a-f]{32}$' THEN
    v_target_ref := NULL;
  END IF;

  IF NEW.operation = 'transfer_manager' THEN
    v_metadata := jsonb_build_object(
      'previousManagerRef', NEW.result ->> 'previousManagerRef',
      'managerRef', NEW.result ->> 'managerRef');
  ELSIF NEW.operation = 'set_manager_teacher_role' THEN
    v_metadata := jsonb_build_object('enabled', COALESCE((NEW.result ->> 'enabled')::boolean, false));
  ELSIF NEW.operation IN ('assign_institution_role','revoke_institution_role') THEN
    v_metadata := jsonb_build_object('assigned', COALESCE((NEW.result ->> 'assigned')::boolean, false));
  ELSIF NEW.operation IN ('grant_support_access','revoke_support_access') THEN
    v_metadata := jsonb_build_object('expiresAt', NEW.result ->> 'expiresAt');
  END IF;

  INSERT INTO public.institution_operation_events(
    institution_id, actor_user_id, event_type, target_ref, classroom_id,
    source, request_id, metadata
  ) VALUES (
    v_institution_id, NEW.user_id, v_event_type, v_target_ref, v_classroom_id,
    'institution_request', NEW.request_id, v_metadata
  ) ON CONFLICT (source, actor_user_id, event_type, request_id) DO NOTHING;
  RETURN NEW;
END;
$fn$;

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
    v_metadata := jsonb_build_object(
      'enabled', COALESCE((NEW.result ->> 'examMode')::boolean, false),
      'expiresAt', NEW.result ->> 'until'
    );
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

REVOKE ALL ON FUNCTION
  public.institution_rpc_actor_has_aal2(uuid),
  public.institution_pilot_payload_hash(jsonb),
  public.teacher_classroom_payload_hash(jsonb),
  public.institution_pilot_is_platform_admin(uuid),
  public.institution_pilot_has_role(uuid,uuid,text[]),
  public.institution_pilot_active_institution(uuid),
  public.institution_member_has_permission(uuid,uuid,text),
  public.institution_support_has_access(uuid,uuid),
  public.teacher_classroom_is_teacher(uuid),
  public.teacher_classroom_is_blocked(uuid,uuid),
  public.reject_reused_institution_request_id(),
  public.audit_institution_pilot_request(),
  public.audit_teacher_classroom_request()
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.export_account_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.export_account_data(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.prune_institution_request_ledgers(timestamptz)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_institution_request_ledgers(timestamptz)
TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
