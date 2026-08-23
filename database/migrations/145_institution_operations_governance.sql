-- Migration 145: institution manager continuity, tenant-wide student quota,
-- and an immutable operation audit trail.
BEGIN;

CREATE TABLE IF NOT EXISTS public.institution_operation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_ref text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(16), 'hex')
    CHECK (event_ref ~ '^[0-9a-f]{32}$'),
  institution_id uuid NOT NULL REFERENCES public.pilot_institutions(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'institution_provisioned',
    'staff_added',
    'staff_removed',
    'manager_teaching_changed',
    'manager_transferred',
    'role_created',
    'role_updated',
    'role_deleted',
    'role_assignment_changed',
    'classroom_created',
    'student_joined',
    'student_withdrawn',
    'student_removed'
  )),
  target_ref text CHECK (target_ref IS NULL OR target_ref ~ '^[0-9a-f]{32}$'),
  classroom_id uuid REFERENCES public.teacher_classrooms(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source IN ('institution_request', 'classroom_request')),
  request_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (source, actor_user_id, event_type, request_id)
);

CREATE INDEX IF NOT EXISTS institution_operation_events_tenant_time
  ON public.institution_operation_events (institution_id, created_at DESC, id DESC);

ALTER TABLE public.institution_operation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.institution_operation_events
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.institution_operation_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  RAISE EXCEPTION 'institution operation events are immutable' USING ERRCODE = '42501';
END;
$fn$;

DROP TRIGGER IF EXISTS institution_operation_events_no_update
  ON public.institution_operation_events;
CREATE TRIGGER institution_operation_events_no_update
BEFORE UPDATE OR DELETE ON public.institution_operation_events
FOR EACH ROW EXECUTE FUNCTION public.institution_operation_events_immutable();

CREATE OR REPLACE FUNCTION public.audit_pilot_institution_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_event_type text;
  v_institution_id uuid;
  v_target_ref text;
  v_metadata jsonb := '{}'::jsonb;
BEGIN
  v_event_type := CASE NEW.operation
    WHEN 'provision' THEN 'institution_provisioned'
    WHEN 'add_teacher' THEN 'staff_added'
    WHEN 'remove_teacher' THEN 'staff_removed'
    WHEN 'set_manager_teacher_role' THEN 'manager_teaching_changed'
    WHEN 'transfer_manager' THEN 'manager_transferred'
    WHEN 'create_institution_role' THEN 'role_created'
    WHEN 'update_institution_role' THEN 'role_updated'
    WHEN 'delete_institution_role' THEN 'role_deleted'
    WHEN 'assign_institution_role' THEN 'role_assignment_changed'
    WHEN 'revoke_institution_role' THEN 'role_assignment_changed'
    ELSE NULL
  END;
  IF v_event_type IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.result #>> '{institution,id}' ~* '^[0-9a-f-]{36}$' THEN
    v_institution_id := (NEW.result #>> '{institution,id}')::uuid;
  ELSIF NEW.result ->> 'institutionId' ~* '^[0-9a-f-]{36}$' THEN
    v_institution_id := (NEW.result ->> 'institutionId')::uuid;
  ELSE
    SELECT membership.institution_id INTO v_institution_id
    FROM public.pilot_institution_memberships AS membership
    WHERE membership.user_id = NEW.user_id AND membership.status = 'active'
    ORDER BY (membership.role = 'manager') DESC, membership.joined_at
    LIMIT 1;
  END IF;
  IF v_institution_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_target_ref := COALESCE(
    NEW.result ->> 'memberRef',
    NEW.result ->> 'managerRef',
    NEW.result ->> 'roleRef'
  );
  IF v_target_ref IS NOT NULL AND v_target_ref !~ '^[0-9a-f]{32}$' THEN
    v_target_ref := NULL;
  END IF;
  IF NEW.operation = 'transfer_manager' THEN
    v_metadata := jsonb_build_object(
      'previousManagerRef', NEW.result ->> 'previousManagerRef',
      'managerRef', NEW.result ->> 'managerRef'
    );
  ELSIF NEW.operation = 'set_manager_teacher_role' THEN
    v_metadata := jsonb_build_object('enabled', COALESCE((NEW.result ->> 'enabled')::boolean, false));
  ELSIF NEW.operation IN ('assign_institution_role', 'revoke_institution_role') THEN
    v_metadata := jsonb_build_object('assigned', COALESCE((NEW.result ->> 'assigned')::boolean, false));
  END IF;

  INSERT INTO public.institution_operation_events(
    institution_id, actor_user_id, event_type, target_ref,
    source, request_id, metadata
  ) VALUES (
    v_institution_id, NEW.user_id, v_event_type, v_target_ref,
    'institution_request', NEW.request_id, v_metadata
  ) ON CONFLICT (source, actor_user_id, event_type, request_id) DO NOTHING;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS pilot_institution_requests_audit
  ON public.pilot_institution_requests;
CREATE TRIGGER pilot_institution_requests_audit
AFTER INSERT ON public.pilot_institution_requests
FOR EACH ROW EXECUTE FUNCTION public.audit_pilot_institution_request();

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
BEGIN
  v_event_type := CASE NEW.operation
    WHEN 'create_classroom' THEN 'classroom_created'
    WHEN 'accept_invite' THEN 'student_joined'
    WHEN 'withdraw_membership' THEN 'student_withdrawn'
    WHEN 'remove_member' THEN 'student_removed'
    ELSE NULL
  END;
  IF v_event_type IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.result #>> '{classroom,id}' ~* '^[0-9a-f-]{36}$' THEN
    v_classroom_id := (NEW.result #>> '{classroom,id}')::uuid;
  ELSIF NEW.result ->> 'classroomId' ~* '^[0-9a-f-]{36}$' THEN
    v_classroom_id := (NEW.result ->> 'classroomId')::uuid;
  END IF;
  IF v_classroom_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT classroom.institution_id INTO v_institution_id
  FROM public.teacher_classrooms AS classroom
  WHERE classroom.id = v_classroom_id;
  IF v_institution_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_target_ref := NEW.result ->> 'memberRef';
  IF v_event_type IN ('student_joined', 'student_withdrawn') THEN
    SELECT membership.member_ref INTO v_target_ref
    FROM public.teacher_classroom_memberships AS membership
    WHERE membership.classroom_id = v_classroom_id
      AND membership.student_id = NEW.user_id
    ORDER BY membership.accepted_at DESC
    LIMIT 1;
  END IF;
  IF v_target_ref IS NOT NULL AND v_target_ref !~ '^[0-9a-f]{32}$' THEN
    v_target_ref := NULL;
  END IF;

  INSERT INTO public.institution_operation_events(
    institution_id, actor_user_id, event_type, target_ref,
    classroom_id, source, request_id
  ) VALUES (
    v_institution_id, NEW.user_id, v_event_type, v_target_ref,
    v_classroom_id, 'classroom_request', NEW.request_id
  ) ON CONFLICT (source, actor_user_id, event_type, request_id) DO NOTHING;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS teacher_classroom_requests_audit
  ON public.teacher_classroom_requests;
CREATE TRIGGER teacher_classroom_requests_audit
AFTER INSERT ON public.teacher_classroom_requests
FOR EACH ROW EXECUTE FUNCTION public.audit_teacher_classroom_request();

CREATE OR REPLACE FUNCTION public.transfer_my_pilot_institution_manager(
  p_user_id uuid,
  p_new_manager_member_ref text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_hash text;
  v_request public.pilot_institution_requests%ROWTYPE;
  v_current public.pilot_institution_memberships%ROWTYPE;
  v_next public.pilot_institution_memberships%ROWTYPE;
  v_manager_role_id uuid;
  v_teacher_role_id uuid;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL
    OR p_new_manager_member_ref IS NULL
    OR p_new_manager_member_ref !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'invalid institution manager transfer' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution manager actor mismatch' USING ERRCODE = '42501';
  END IF;

  -- Replay must remain available to the previous manager after the first call
  -- has atomically removed that manager authority.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'institution-request:' || p_user_id::text || ':transfer-manager:' || p_request_id::text, 0
  ));
  SELECT * INTO v_request
  FROM public.pilot_institution_requests
  WHERE user_id = p_user_id AND operation = 'transfer_manager' AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    v_hash := public.institution_pilot_payload_hash(jsonb_build_object(
      'institutionId', (v_request.result ->> 'institutionId')::uuid,
      'newManagerMemberRef', p_new_manager_member_ref
    ));
    IF v_request.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'institution request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;

  SELECT membership.* INTO v_current
  FROM public.pilot_institution_memberships AS membership
  JOIN public.pilot_institutions AS institution
    ON institution.id = membership.institution_id
    AND institution.status IN ('pilot', 'active')
  JOIN public.profiles AS profile
    ON profile.id = membership.user_id AND profile.deleted_at IS NULL
  WHERE membership.user_id = p_user_id
    AND membership.status = 'active'
    AND membership.role = 'manager'
  FOR UPDATE OF membership;
  IF NOT FOUND OR NOT public.institution_member_has_permission(
    p_user_id, v_current.institution_id, 'institution.roles.manage'
  ) THEN
    RAISE EXCEPTION 'institution manager permission required' USING ERRCODE = '42501';
  END IF;

  v_hash := public.institution_pilot_payload_hash(jsonb_build_object(
    'institutionId', v_current.institution_id,
    'newManagerMemberRef', p_new_manager_member_ref
  ));

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'institution-manager:' || v_current.institution_id::text, 0
  ));
  SELECT membership.* INTO v_next
  FROM public.pilot_institution_memberships AS membership
  JOIN public.profiles AS profile
    ON profile.id = membership.user_id AND profile.deleted_at IS NULL
  WHERE membership.institution_id = v_current.institution_id
    AND membership.member_ref = p_new_manager_member_ref
    AND membership.status = 'active'
    AND membership.role = 'teacher'
  FOR UPDATE OF membership;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'new institution manager must be an active teacher'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT role.id INTO v_manager_role_id
  FROM public.institution_roles AS role
  WHERE role.institution_id = v_current.institution_id
    AND role.is_system AND role.role_key = 'manager';
  SELECT role.id INTO v_teacher_role_id
  FROM public.institution_roles AS role
  WHERE role.institution_id = v_current.institution_id
    AND role.is_system AND role.role_key = 'teacher';
  IF v_manager_role_id IS NULL OR v_teacher_role_id IS NULL THEN
    RAISE EXCEPTION 'institution system roles missing' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.pilot_institution_memberships
  SET role = 'teacher'
  WHERE id = v_current.id;
  UPDATE public.pilot_institution_memberships
  SET role = 'manager'
  WHERE id = v_next.id;

  DELETE FROM public.institution_membership_roles
  WHERE membership_id = v_current.id AND role_id = v_manager_role_id;
  INSERT INTO public.institution_membership_roles(
    membership_id, role_id, institution_id, assigned_by
  ) VALUES (
    v_current.id, v_teacher_role_id, v_current.institution_id, p_user_id
  ) ON CONFLICT (membership_id, role_id) DO NOTHING;
  INSERT INTO public.institution_membership_roles(
    membership_id, role_id, institution_id, assigned_by
  ) VALUES (
    v_next.id, v_manager_role_id, v_next.institution_id, p_user_id
  ) ON CONFLICT (membership_id, role_id) DO NOTHING;

  INSERT INTO public.user_roles(user_id, role_id, assigned_by)
  SELECT v_current.user_id, role.id, p_user_id
  FROM public.roles AS role
  WHERE role.slug IN ('teacher_pilot', 'institution_pilot_staff')
  ON CONFLICT (user_id, role_id) DO NOTHING;

  v_result := jsonb_build_object(
    'institutionId', v_current.institution_id,
    'previousManagerRef', v_current.member_ref,
    'managerRef', v_next.member_ref,
    'replayed', false
  );
  INSERT INTO public.pilot_institution_requests(
    user_id, operation, request_id, payload_hash, result
  ) VALUES (p_user_id, 'transfer_manager', p_request_id, v_hash, v_result);
  RETURN v_result;
END;
$fn$;

-- The institution quota counts distinct active students across all active
-- classrooms. Joining a second classroom in the same institution consumes no
-- additional seat. The institution advisory lock serializes concurrent joins.
CREATE OR REPLACE FUNCTION public.accept_teacher_classroom_invite(
  p_user_id uuid,
  p_token_digest text,
  p_notice_version text,
  p_consent_version text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_hash text;
  v_request public.teacher_classroom_requests%ROWTYPE;
  v_invite public.teacher_classroom_invites%ROWTYPE;
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_institution public.pilot_institutions%ROWTYPE;
  v_membership public.teacher_classroom_memberships%ROWTYPE;
  v_student_count integer;
  v_student_already_counted boolean;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL
    OR p_token_digest IS NULL OR p_token_digest !~ '^[0-9a-f]{64}$'
    OR p_notice_version IS NULL OR p_notice_version !~ '^[A-Za-z0-9._:-]{1,100}$'
    OR p_consent_version IS NULL OR p_consent_version !~ '^[A-Za-z0-9._:-]{1,100}$' THEN
    RAISE EXCEPTION 'invalid invite acceptance' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'invite actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = 'P0002';
  END IF;

  v_hash := public.teacher_classroom_payload_hash(jsonb_build_object(
    'tokenDigest', p_token_digest,
    'noticeVersion', p_notice_version,
    'consentVersion', p_consent_version
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'teacher-request:' || p_user_id::text || ':accept:' || p_request_id::text, 0
  ));
  SELECT * INTO v_request
  FROM public.teacher_classroom_requests
  WHERE user_id = p_user_id AND operation = 'accept_invite' AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'invite acceptance payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;

  SELECT * INTO v_invite
  FROM public.teacher_classroom_invites
  WHERE token_digest = p_token_digest
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'teacher-class:' || v_invite.classroom_id::text, 0
  ));
  SELECT * INTO v_classroom
  FROM public.teacher_classrooms
  WHERE id = v_invite.classroom_id
  FOR UPDATE;
  IF NOT FOUND OR v_classroom.status <> 'active'
    OR v_invite.revoked_at IS NOT NULL
    OR v_invite.expires_at <= clock_timestamp()
    OR v_invite.used_count >= v_invite.max_uses THEN
    RAISE EXCEPTION 'invite unavailable' USING ERRCODE = 'P0003';
  END IF;
  IF p_user_id = v_classroom.teacher_id
    OR NOT public.teacher_classroom_is_teacher(v_classroom.teacher_id)
    OR public.teacher_classroom_is_blocked(p_user_id, v_classroom.teacher_id) THEN
    RAISE EXCEPTION 'invite unavailable' USING ERRCODE = 'P0003';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.teacher_classroom_memberships
    WHERE classroom_id = v_classroom.id AND student_id = p_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'student is already an active member' USING ERRCODE = '23505';
  END IF;
  IF (
    SELECT count(*) FROM public.teacher_classroom_memberships
    WHERE classroom_id = v_classroom.id AND status = 'active'
  ) >= 40 THEN
    RAISE EXCEPTION 'classroom capacity reached' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'institution-students:' || v_classroom.institution_id::text, 0
  ));
  SELECT * INTO v_institution
  FROM public.pilot_institutions
  WHERE id = v_classroom.institution_id AND status IN ('pilot', 'active')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'institution not active' USING ERRCODE = 'P0003';
  END IF;
  SELECT EXISTS (
    SELECT 1
    FROM public.teacher_classroom_memberships AS membership
    JOIN public.teacher_classrooms AS classroom ON classroom.id = membership.classroom_id
    WHERE classroom.institution_id = v_institution.id
      AND classroom.status = 'active'
      AND membership.student_id = p_user_id
      AND membership.status = 'active'
  ) INTO v_student_already_counted;
  SELECT count(DISTINCT membership.student_id) INTO v_student_count
  FROM public.teacher_classroom_memberships AS membership
  JOIN public.teacher_classrooms AS classroom ON classroom.id = membership.classroom_id
  WHERE classroom.institution_id = v_institution.id
    AND classroom.status = 'active'
    AND membership.status = 'active';
  IF NOT v_student_already_counted AND v_student_count >= v_institution.student_limit THEN
    RAISE EXCEPTION 'institution student capacity reached' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.teacher_classroom_memberships(classroom_id, student_id)
  VALUES (v_classroom.id, p_user_id)
  RETURNING * INTO v_membership;
  INSERT INTO public.teacher_classroom_privacy_events(
    membership_id, student_id, event_type, version
  ) VALUES
    (v_membership.id, p_user_id, 'notice_acknowledged', p_notice_version),
    (v_membership.id, p_user_id, 'sharing_consented', p_consent_version);
  UPDATE public.teacher_classroom_invites
  SET used_count = used_count + 1
  WHERE id = v_invite.id;

  v_result := jsonb_build_object(
    'classroom', jsonb_build_object(
      'id', v_classroom.id,
      'name', v_classroom.name,
      'teacherAlias', public.teacher_classroom_safe_alias(v_classroom.teacher_id)
    ),
    'membershipStatus', 'active',
    'joinedAt', v_membership.accepted_at,
    'replayed', false
  );
  INSERT INTO public.teacher_classroom_requests(user_id, operation, request_id, payload_hash, result)
  VALUES (p_user_id, 'accept_invite', p_request_id, v_hash, v_result);
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_my_pilot_institution(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_membership public.pilot_institution_memberships%ROWTYPE;
  v_institution public.pilot_institutions%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user required' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution actor mismatch' USING ERRCODE = '42501';
  END IF;
  SELECT membership.* INTO v_membership
  FROM public.pilot_institution_memberships AS membership
  JOIN public.profiles AS profile ON profile.id = membership.user_id
  WHERE membership.user_id = p_user_id
    AND membership.status = 'active' AND profile.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'institution membership not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_institution FROM public.pilot_institutions
  WHERE id = v_membership.institution_id AND status IN ('pilot', 'active');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'institution not active' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object(
    'institution', jsonb_build_object(
      'id', v_institution.id,
      'name', v_institution.name,
      'status', v_institution.status,
      'studentLimit', v_institution.student_limit,
      'studentCount', (
        SELECT count(DISTINCT membership.student_id)
        FROM public.teacher_classroom_memberships AS membership
        JOIN public.teacher_classrooms AS classroom ON classroom.id = membership.classroom_id
        WHERE classroom.institution_id = v_institution.id
          AND classroom.status = 'active' AND membership.status = 'active'
      ),
      'staffLimit', v_institution.staff_limit,
      'staffCount', (
        SELECT count(*) FROM public.pilot_institution_memberships
        WHERE institution_id = v_institution.id AND status = 'active'
      ),
      'createdAt', v_institution.created_at
    ),
    'membership', jsonb_build_object(
      'memberRef', v_membership.member_ref,
      'role', v_membership.role,
      'joinedAt', v_membership.joined_at
    )
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_my_institution_operation_events(
  p_user_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_institution_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid institution audit request' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution audit actor mismatch' USING ERRCODE = '42501';
  END IF;
  SELECT membership.institution_id INTO v_institution_id
  FROM public.pilot_institution_memberships AS membership
  WHERE membership.user_id = p_user_id
    AND membership.status = 'active' AND membership.role = 'manager';
  IF NOT FOUND OR NOT public.institution_member_has_permission(
    p_user_id, v_institution_id, 'institution.roles.manage'
  ) THEN
    RAISE EXCEPTION 'institution manager permission required' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object('events', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'eventRef', event.event_ref,
      'eventType', event.event_type,
      'actorAlias', public.teacher_classroom_safe_alias(event.actor_user_id),
      'subjectAlias', COALESCE(
        public.teacher_classroom_safe_alias(staff.user_id),
        public.teacher_classroom_safe_alias(student.student_id)
      ),
      'classroomName', classroom.name,
      'createdAt', event.created_at
    ) ORDER BY event.created_at DESC, event.id DESC)
    FROM (
      SELECT * FROM public.institution_operation_events
      WHERE institution_id = v_institution_id
      ORDER BY created_at DESC, id DESC
      LIMIT p_limit
    ) AS event
    LEFT JOIN public.pilot_institution_memberships AS staff
      ON staff.institution_id = event.institution_id AND staff.member_ref = event.target_ref
    LEFT JOIN public.teacher_classroom_memberships AS student
      ON student.member_ref = event.target_ref
    LEFT JOIN public.teacher_classrooms AS classroom ON classroom.id = event.classroom_id
  ), '[]'::jsonb));
END;
$fn$;

REVOKE ALL ON FUNCTION
  public.institution_operation_events_immutable(),
  public.audit_pilot_institution_request(),
  public.audit_teacher_classroom_request(),
  public.transfer_my_pilot_institution_manager(uuid, text, uuid),
  public.accept_teacher_classroom_invite(uuid, text, text, text, uuid),
  public.get_my_pilot_institution(uuid),
  public.get_my_institution_operation_events(uuid, integer)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.transfer_my_pilot_institution_manager(uuid, text, uuid),
  public.accept_teacher_classroom_invite(uuid, text, text, text, uuid),
  public.get_my_pilot_institution(uuid),
  public.get_my_institution_operation_events(uuid, integer)
TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
