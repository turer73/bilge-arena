-- Migration 135: let an institution manager explicitly hold the teacher
-- system role without creating a duplicate tenant membership.
BEGIN;

CREATE OR REPLACE FUNCTION public.set_my_institution_manager_teacher_role(
  p_user_id uuid,
  p_enabled boolean,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_membership public.pilot_institution_memberships%ROWTYPE;
  v_teacher_role public.institution_roles%ROWTYPE;
  v_hash text;
  v_request public.pilot_institution_requests%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_enabled IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'invalid manager teacher role request' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'manager teacher role actor mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT membership.* INTO v_membership
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
    p_user_id, v_membership.institution_id, 'institution.roles.manage'
  ) THEN
    RAISE EXCEPTION 'institution role manager required' USING ERRCODE = '42501';
  END IF;

  SELECT role.* INTO v_teacher_role
  FROM public.institution_roles AS role
  WHERE role.institution_id = v_membership.institution_id
    AND role.is_system
    AND role.role_key = 'teacher';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'institution teacher role not found' USING ERRCODE = 'P0002';
  END IF;

  v_hash := public.institution_pilot_payload_hash(jsonb_build_object(
    'institutionId', v_membership.institution_id,
    'memberRef', v_membership.member_ref,
    'enabled', p_enabled
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'institution-request:' || p_user_id::text || ':manager-teacher:' || p_request_id::text,
    0
  ));
  SELECT * INTO v_request
  FROM public.pilot_institution_requests
  WHERE user_id = p_user_id
    AND operation = 'set_manager_teacher_role'
    AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'manager teacher role payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;

  IF p_enabled THEN
    INSERT INTO public.institution_membership_roles(
      membership_id, role_id, institution_id, assigned_by
    ) VALUES (
      v_membership.id, v_teacher_role.id, v_membership.institution_id, p_user_id
    )
    ON CONFLICT (membership_id, role_id) DO NOTHING;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM public.teacher_classrooms AS classroom
      WHERE classroom.institution_id = v_membership.institution_id
        AND classroom.teacher_id = p_user_id
        AND classroom.status = 'active'
    ) THEN
      RAISE EXCEPTION 'manager teacher has active classrooms' USING ERRCODE = 'P0003';
    END IF;
    DELETE FROM public.institution_membership_roles
    WHERE membership_id = v_membership.id
      AND role_id = v_teacher_role.id
      AND institution_id = v_membership.institution_id;
  END IF;

  v_result := jsonb_build_object(
    'memberRef', v_membership.member_ref,
    'enabled', p_enabled,
    'replayed', false
  );
  INSERT INTO public.pilot_institution_requests(
    user_id, operation, request_id, payload_hash, result
  ) VALUES (
    p_user_id, 'set_manager_teacher_role', p_request_id, v_hash, v_result
  );
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.teacher_classroom_is_teacher(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT EXISTS (
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

CREATE OR REPLACE FUNCTION public.create_my_institution_classroom(
  p_user_id uuid,
  p_teacher_member_ref text,
  p_name text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_name text := btrim(p_name);
  v_actor public.pilot_institution_memberships%ROWTYPE;
  v_teacher public.pilot_institution_memberships%ROWTYPE;
  v_hash text;
  v_request public.pilot_institution_requests%ROWTYPE;
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL
    OR p_teacher_member_ref IS NULL
    OR p_teacher_member_ref !~ '^[0-9a-f]{32}$'
    OR v_name IS NULL OR char_length(v_name) NOT BETWEEN 2 AND 60 THEN
    RAISE EXCEPTION 'invalid institution classroom request' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution classroom actor mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT membership.* INTO v_actor
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
    p_user_id, v_actor.institution_id, 'institution.classrooms.manage'
  ) THEN
    RAISE EXCEPTION 'institution classroom manager required' USING ERRCODE = '42501';
  END IF;

  SELECT membership.* INTO v_teacher
  FROM public.pilot_institution_memberships AS membership
  JOIN public.profiles AS profile
    ON profile.id = membership.user_id AND profile.deleted_at IS NULL
  WHERE membership.institution_id = v_actor.institution_id
    AND membership.member_ref = p_teacher_member_ref
    AND membership.status = 'active'
    AND (
      membership.role = 'teacher'
      OR EXISTS (
        SELECT 1
        FROM public.institution_membership_roles AS assignment
        JOIN public.institution_roles AS role
          ON role.id = assignment.role_id
          AND role.institution_id = assignment.institution_id
        WHERE assignment.membership_id = membership.id
          AND assignment.institution_id = membership.institution_id
          AND role.is_system
          AND role.role_key = 'teacher'
      )
    )
  FOR UPDATE OF membership;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active institution teacher not found' USING ERRCODE = 'P0002';
  END IF;

  v_hash := public.institution_pilot_payload_hash(jsonb_build_object(
    'institutionId', v_actor.institution_id,
    'teacherMemberRef', p_teacher_member_ref,
    'name', v_name
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'institution-request:' || p_user_id::text || ':create-classroom:' || p_request_id::text,
    0
  ));
  SELECT * INTO v_request
  FROM public.pilot_institution_requests
  WHERE user_id = p_user_id
    AND operation = 'create_classroom'
    AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'institution classroom request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'institution-classroom-name:' || v_actor.institution_id::text || ':' || lower(v_name),
    0
  ));
  IF EXISTS (
    SELECT 1
    FROM public.teacher_classrooms AS classroom
    WHERE classroom.institution_id = v_actor.institution_id
      AND classroom.status = 'active'
      AND lower(btrim(classroom.name)) = lower(v_name)
  ) THEN
    RAISE EXCEPTION 'active institution classroom name already exists' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.teacher_classrooms(institution_id, teacher_id, name)
  VALUES (v_actor.institution_id, v_teacher.user_id, v_name)
  RETURNING * INTO v_classroom;

  v_result := jsonb_build_object(
    'classroom', jsonb_build_object(
      'id', v_classroom.id,
      'name', v_classroom.name,
      'status', v_classroom.status,
      'createdAt', v_classroom.created_at
    ),
    'teacher', jsonb_build_object(
      'memberRef', v_teacher.member_ref,
      'alias', public.teacher_classroom_safe_alias(v_teacher.user_id)
    ),
    'replayed', false
  );
  INSERT INTO public.pilot_institution_requests(
    user_id, operation, request_id, payload_hash, result
  ) VALUES (
    p_user_id, 'create_classroom', p_request_id, v_hash, v_result
  );
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_institution_tracking_directory(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_institution_id uuid;
  v_membership_role text;
  v_institution_name text;
  v_institution_status text;
  v_can_view_all boolean;
  v_can_teach boolean;
  v_classrooms jsonb;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'institution tracking actor required' USING ERRCODE = '22023'; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'institution tracking actor mismatch' USING ERRCODE = '42501'; END IF;
  SELECT membership.institution_id, membership.role, institution.name, institution.status
  INTO v_institution_id, v_membership_role, v_institution_name, v_institution_status
  FROM public.pilot_institution_memberships AS membership
  JOIN public.pilot_institutions AS institution ON institution.id = membership.institution_id AND institution.status IN ('pilot', 'active')
  JOIN public.profiles AS profile ON profile.id = membership.user_id AND profile.deleted_at IS NULL
  WHERE membership.user_id = p_user_id AND membership.status = 'active' AND membership.role IN ('manager', 'teacher');
  IF NOT FOUND THEN RAISE EXCEPTION 'active institution membership required' USING ERRCODE = '42501'; END IF;
  v_can_view_all := public.institution_member_has_permission(p_user_id, v_institution_id, 'institution.classrooms.view_all');
  v_can_teach := public.teacher_classroom_is_teacher(p_user_id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', classroom.id,
    'name', classroom.name,
    'teacherAlias', public.teacher_classroom_safe_alias(classroom.teacher_id),
    'canAnalyze', (v_membership_role = 'manager' OR classroom.teacher_id = p_user_id),
    'canManagePrograms', (v_can_teach AND classroom.teacher_id = p_user_id),
    'activeStudentCount', (
      SELECT count(*) FROM public.teacher_classroom_memberships AS student_membership
      JOIN public.profiles AS student_profile ON student_profile.id = student_membership.student_id AND student_profile.deleted_at IS NULL
      WHERE student_membership.classroom_id = classroom.id AND student_membership.status = 'active'
        AND NOT public.teacher_classroom_is_blocked(classroom.teacher_id, student_membership.student_id)
    ),
    'students', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'memberRef', student_membership.member_ref,
        'alias', public.teacher_classroom_safe_alias(student_membership.student_id),
        'joinedAt', student_membership.accepted_at
      ) ORDER BY student_membership.accepted_at, student_membership.member_ref)
      FROM public.teacher_classroom_memberships AS student_membership
      JOIN public.profiles AS student_profile ON student_profile.id = student_membership.student_id AND student_profile.deleted_at IS NULL
      WHERE student_membership.classroom_id = classroom.id AND student_membership.status = 'active'
        AND NOT public.teacher_classroom_is_blocked(classroom.teacher_id, student_membership.student_id)
    ), '[]'::jsonb)
  ) ORDER BY classroom.created_at, classroom.id), '[]'::jsonb)
  INTO v_classrooms
  FROM public.teacher_classrooms AS classroom
  WHERE classroom.institution_id = v_institution_id AND classroom.status = 'active'
    AND (v_can_view_all OR classroom.teacher_id = p_user_id);
  RETURN jsonb_build_object(
    'institution', jsonb_build_object('name', v_institution_name, 'status', v_institution_status),
    'membership', jsonb_build_object('role', v_membership_role, 'teacherEnabled', v_can_teach),
    'classrooms', v_classrooms
  );
END;
$fn$;

REVOKE ALL ON FUNCTION
  public.set_my_institution_manager_teacher_role(uuid, boolean, uuid),
  public.teacher_classroom_is_teacher(uuid),
  public.create_my_institution_classroom(uuid, text, text, uuid),
  public.get_institution_tracking_directory(uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.set_my_institution_manager_teacher_role(uuid, boolean, uuid),
  public.teacher_classroom_is_teacher(uuid),
  public.create_my_institution_classroom(uuid, text, text, uuid),
  public.get_institution_tracking_directory(uuid)
TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
