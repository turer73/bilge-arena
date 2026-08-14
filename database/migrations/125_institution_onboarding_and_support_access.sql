-- Migration 125: platform-admin institution onboarding and manager-controlled
-- temporary support access. Support access is default-off, read-only, expires
-- automatically, and can be revoked immediately by the institution manager.
BEGIN;

INSERT INTO public.role_permissions (role_id, permission)
SELECT role.id, 'institution.support.access'
FROM public.roles AS role
WHERE role.slug = 'super_admin'
ON CONFLICT (role_id, permission) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.institution_support_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_ref text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(16), 'hex')
    CHECK (grant_ref ~ '^[0-9a-f]{32}$'),
  institution_id uuid NOT NULL REFERENCES public.pilot_institutions(id) ON DELETE RESTRICT,
  granted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  scope text NOT NULL DEFAULT 'read_only' CHECK (scope = 'read_only'),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 500),
  granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  CHECK (expires_at > granted_at AND expires_at <= granted_at + interval '24 hours'),
  CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revoked_at >= granted_at)
  )
);

CREATE INDEX IF NOT EXISTS institution_support_grants_tenant_window
  ON public.institution_support_grants (institution_id, expires_at DESC)
  WHERE revoked_at IS NULL;

ALTER TABLE public.institution_support_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.institution_support_grants
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.institution_support_has_access(
  p_admin_user_id uuid,
  p_institution_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT EXISTS (
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
      SELECT count(*)::integer
      FROM public.pilot_institution_memberships AS staff
      WHERE staff.institution_id = institution.id AND staff.status = 'active'
    ),
    'classroomCount', (
      SELECT count(*)::integer
      FROM public.teacher_classrooms AS classroom
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
      AND membership.status = 'active'
      AND membership.role = 'manager'
    LIMIT 1
  ) AS manager ON true
  LEFT JOIN LATERAL (
    SELECT support_grant.expires_at, support_grant.reason
    FROM public.institution_support_grants AS support_grant
    WHERE support_grant.institution_id = institution.id
      AND support_grant.revoked_at IS NULL
      AND support_grant.expires_at > clock_timestamp()
    ORDER BY support_grant.expires_at DESC
    LIMIT 1
  ) AS support_grant ON true
  WHERE institution.status IN ('pilot', 'active', 'suspended');

  RETURN jsonb_build_object('institutions', v_institutions);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_institution_support_directory(
  p_admin_user_id uuid,
  p_institution_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_institution public.pilot_institutions%ROWTYPE;
  v_grant public.institution_support_grants%ROWTYPE;
  v_classrooms jsonb;
BEGIN
  IF p_admin_user_id IS NULL OR p_institution_id IS NULL THEN
    RAISE EXCEPTION 'institution support directory actor required' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_admin_user_id THEN
    RAISE EXCEPTION 'institution support directory actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.institution_support_has_access(p_admin_user_id, p_institution_id) THEN
    RAISE EXCEPTION 'active institution support grant required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO STRICT v_institution
  FROM public.pilot_institutions
  WHERE id = p_institution_id AND status IN ('pilot', 'active');
  SELECT * INTO STRICT v_grant
  FROM public.institution_support_grants
  WHERE institution_id = p_institution_id
    AND revoked_at IS NULL
    AND expires_at > clock_timestamp()
  ORDER BY expires_at DESC
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', classroom.id,
    'name', classroom.name,
    'teacherAlias', public.teacher_classroom_safe_alias(classroom.teacher_id),
    'activeStudentCount', (
      SELECT count(*)::integer
      FROM public.teacher_classroom_memberships AS student_membership
      JOIN public.profiles AS student_profile
        ON student_profile.id = student_membership.student_id
        AND student_profile.deleted_at IS NULL
      WHERE student_membership.classroom_id = classroom.id
        AND student_membership.status = 'active'
        AND NOT public.teacher_classroom_is_blocked(classroom.teacher_id, student_membership.student_id)
    ),
    'students', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'memberRef', student_membership.member_ref,
        'alias', public.teacher_classroom_safe_alias(student_membership.student_id),
        'joinedAt', student_membership.accepted_at
      ) ORDER BY student_membership.accepted_at, student_membership.member_ref)
      FROM public.teacher_classroom_memberships AS student_membership
      JOIN public.profiles AS student_profile
        ON student_profile.id = student_membership.student_id
        AND student_profile.deleted_at IS NULL
      WHERE student_membership.classroom_id = classroom.id
        AND student_membership.status = 'active'
        AND NOT public.teacher_classroom_is_blocked(classroom.teacher_id, student_membership.student_id)
    ), '[]'::jsonb)
  ) ORDER BY classroom.created_at, classroom.id), '[]'::jsonb)
  INTO v_classrooms
  FROM public.teacher_classrooms AS classroom
  WHERE classroom.institution_id = p_institution_id
    AND classroom.status = 'active';

  RETURN jsonb_build_object(
    'institution', jsonb_build_object(
      'id', v_institution.id,
      'name', v_institution.name,
      'status', v_institution.status
    ),
    'access', jsonb_build_object(
      'scope', v_grant.scope,
      'reason', v_grant.reason,
      'expiresAt', v_grant.expires_at
    ),
    'classrooms', v_classrooms
  );
EXCEPTION WHEN NO_DATA_FOUND THEN
  RAISE EXCEPTION 'active institution support grant required' USING ERRCODE = '42501';
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
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution support actor mismatch' USING ERRCODE = '42501';
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

CREATE OR REPLACE FUNCTION public.grant_my_institution_support_access(
  p_user_id uuid,
  p_duration_minutes integer,
  p_reason text,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_institution_id uuid;
  v_reason text := btrim(p_reason);
  v_now timestamptz := clock_timestamp();
  v_hash text;
  v_request public.pilot_institution_requests%ROWTYPE;
  v_grant public.institution_support_grants%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL
    OR p_duration_minutes IS NULL OR p_duration_minutes < 15 OR p_duration_minutes > 1440
    OR v_reason IS NULL OR char_length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'invalid institution support grant' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution support actor mismatch' USING ERRCODE = '42501';
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

  v_hash := public.institution_pilot_payload_hash(jsonb_build_object(
    'institutionId', v_institution_id,
    'durationMinutes', p_duration_minutes,
    'reason', v_reason,
    'scope', 'read_only'
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_user_id::text || ':institution-support-grant:' || p_request_id::text, 0
  ));
  SELECT * INTO v_request
  FROM public.pilot_institution_requests
  WHERE user_id = p_user_id
    AND operation = 'grant_support_access'
    AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'institution support request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;

  UPDATE public.institution_support_grants
  SET revoked_at = v_now, revoked_by = p_user_id
  WHERE institution_id = v_institution_id AND revoked_at IS NULL;

  INSERT INTO public.institution_support_grants(
    institution_id, granted_by, reason, granted_at, expires_at
  ) VALUES (
    v_institution_id, p_user_id, v_reason, v_now,
    v_now + make_interval(mins => p_duration_minutes)
  ) RETURNING * INTO v_grant;

  v_result := jsonb_build_object(
    'institutionId', v_institution_id,
    'active', true,
    'grantRef', v_grant.grant_ref,
    'scope', v_grant.scope,
    'reason', v_grant.reason,
    'grantedAt', v_grant.granted_at,
    'expiresAt', v_grant.expires_at,
    'replayed', false
  );
  INSERT INTO public.pilot_institution_requests(
    user_id, operation, request_id, payload_hash, result
  ) VALUES (
    p_user_id, 'grant_support_access', p_request_id, v_hash, v_result
  );
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.revoke_my_institution_support_access(
  p_user_id uuid,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_institution_id uuid;
  v_now timestamptz := clock_timestamp();
  v_hash text;
  v_request public.pilot_institution_requests%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'invalid institution support revoke' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution support actor mismatch' USING ERRCODE = '42501';
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

  v_hash := public.institution_pilot_payload_hash(jsonb_build_object(
    'institutionId', v_institution_id,
    'active', false
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_user_id::text || ':institution-support-revoke:' || p_request_id::text, 0
  ));
  SELECT * INTO v_request
  FROM public.pilot_institution_requests
  WHERE user_id = p_user_id
    AND operation = 'revoke_support_access'
    AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'institution support request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;

  UPDATE public.institution_support_grants
  SET revoked_at = v_now, revoked_by = p_user_id
  WHERE institution_id = v_institution_id
    AND revoked_at IS NULL;

  v_result := jsonb_build_object(
    'institutionId', v_institution_id,
    'active', false,
    'grantRef', NULL,
    'scope', 'read_only',
    'reason', NULL,
    'grantedAt', NULL,
    'expiresAt', NULL,
    'replayed', false
  );
  INSERT INTO public.pilot_institution_requests(
    user_id, operation, request_id, payload_hash, result
  ) VALUES (
    p_user_id, 'revoke_support_access', p_request_id, v_hash, v_result
  );
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION
  public.institution_support_has_access(uuid,uuid),
  public.list_pilot_institutions(uuid),
  public.get_institution_support_directory(uuid,uuid),
  public.get_my_institution_support_access(uuid),
  public.grant_my_institution_support_access(uuid,integer,text,uuid),
  public.revoke_my_institution_support_access(uuid,uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.institution_support_has_access(uuid,uuid),
  public.list_pilot_institutions(uuid),
  public.get_institution_support_directory(uuid,uuid),
  public.get_my_institution_support_access(uuid),
  public.grant_my_institution_support_access(uuid,integer,text,uuid),
  public.revoke_my_institution_support_access(uuid,uuid)
TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
