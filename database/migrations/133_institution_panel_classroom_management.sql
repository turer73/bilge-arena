-- Migration 133: institution-panel classroom creation owned by an active teacher.
-- Managers choose an opaque teacher membership from their own tenant; the
-- manager never becomes the classroom teacher implicitly.
BEGIN;

INSERT INTO public.institution_permission_catalog(permission, label, description, delegable)
VALUES (
  'institution.classrooms.manage',
  'Sınıf yönetimi',
  'Kurum yöneticisinin aktif bir kurum öğretmenine sınıf atamasını sağlar.',
  false
)
ON CONFLICT (permission) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  delegable = false;

INSERT INTO public.institution_role_permissions(role_id, institution_id, permission)
SELECT role.id, role.institution_id, 'institution.classrooms.manage'
FROM public.institution_roles AS role
WHERE role.is_system AND role.role_key = 'manager'
ON CONFLICT (role_id, permission) DO NOTHING;

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
    AND membership.role = 'teacher'
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

REVOKE ALL ON FUNCTION public.create_my_institution_classroom(uuid, text, text, uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_my_institution_classroom(uuid, text, text, uuid)
TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
