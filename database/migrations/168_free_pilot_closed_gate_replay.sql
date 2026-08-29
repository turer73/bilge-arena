-- Migration 168: preserve historical idempotency after the single-use free
-- pilot provisioning gate is closed. New requests still fail closed.

BEGIN;

CREATE OR REPLACE FUNCTION public.provision_free_pilot_institution(
  p_user_id uuid,
  p_name text,
  p_manager_user_id uuid,
  p_approval_ref text,
  p_student_limit smallint,
  p_staff_limit smallint,
  p_trial_days smallint,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_name text := btrim(p_name);
  v_approval_ref text := upper(btrim(p_approval_ref));
  v_hash text;
  v_request public.pilot_institution_requests%ROWTYPE;
  v_institution public.pilot_institutions%ROWTYPE;
  v_membership public.pilot_institution_memberships%ROWTYPE;
  v_result jsonb;
  v_free_provisioning_enabled boolean;
  v_created_at timestamptz;
BEGIN
  IF p_user_id IS NULL OR p_manager_user_id IS NULL OR p_request_id IS NULL
    OR p_manager_user_id = p_user_id
    OR v_name IS NULL OR char_length(v_name) NOT BETWEEN 2 AND 120
    OR v_approval_ref IS NULL
    OR v_approval_ref !~ '^[A-Z0-9][A-Z0-9._/-]{5,63}$'
    OR p_student_limit IS NULL OR p_student_limit NOT BETWEEN 1 AND 40
    OR p_staff_limit IS NULL OR p_staff_limit NOT BETWEEN 1 AND 2
    OR p_trial_days IS NULL OR p_trial_days NOT BETWEEN 14 AND 60 THEN
    RAISE EXCEPTION 'invalid free institution pilot request' USING ERRCODE = '22023';
  END IF;

  -- Replay is still bound to the original browser actor, current AAL2 and the
  -- platform permission. Closing the creation gate never weakens actor checks.
  IF auth.uid() IS NULL
    OR auth.uid() IS DISTINCT FROM p_user_id
    OR NOT public.institution_rpc_actor_has_aal2(p_user_id) THEN
    RAISE EXCEPTION 'free institution pilot actor mismatch or AAL2 required'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.institution_pilot_is_platform_admin(p_user_id) THEN
    RAISE EXCEPTION 'institution platform permission required' USING ERRCODE = '42501';
  END IF;

  v_hash := public.institution_pilot_payload_hash(jsonb_build_object(
    'pilotKind', 'invitation_free',
    'name', v_name,
    'managerUserId', p_manager_user_id,
    'approvalReference', v_approval_ref,
    'studentLimit', p_student_limit,
    'staffLimit', p_staff_limit,
    'trialDays', p_trial_days
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'institution-request:' || p_user_id::text || ':provision-free-pilot:' || p_request_id::text,
    0
  ));
  SELECT * INTO v_request
  FROM public.pilot_institution_requests
  WHERE user_id = p_user_id
    AND operation = 'provision_free_pilot'
    AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'institution request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;

  -- Only a genuinely new request consumes the short-lived database gate.
  SELECT control.enabled
  INTO v_free_provisioning_enabled
  FROM public.institution_pilot_controls AS control
  WHERE control.control_key = 'free_provisioning'
  FOR UPDATE;
  IF NOT FOUND OR v_free_provisioning_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'free institution pilot database gate is closed'
      USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN auth.users AS account ON account.id = profile.id
    WHERE profile.id = p_manager_user_id
      AND profile.deleted_at IS NULL
      AND account.deleted_at IS NULL
      AND account.email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'confirmed institution manager not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'institution-free-pilot-open-slot',
    0
  ));
  IF EXISTS (
    SELECT 1
    FROM public.pilot_institutions AS institution
    WHERE institution.pilot_kind = 'invitation_free'
      AND institution.status IN ('pilot', 'active')
  ) THEN
    RAISE EXCEPTION 'another open invitation-free institution pilot already exists'
      USING ERRCODE = '23505',
        CONSTRAINT = 'pilot_institutions_one_open_free_pilot';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pilot_institution_memberships
    WHERE user_id = p_manager_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'manager already belongs to an active institution'
      USING ERRCODE = '23505';
  END IF;

  v_created_at := clock_timestamp();
  INSERT INTO public.pilot_institutions(
    name, created_by, student_limit, staff_limit, pilot_kind, review_due_at,
    approval_ref, created_at
  ) VALUES (
    v_name,
    p_user_id,
    p_student_limit,
    p_staff_limit,
    'invitation_free',
    v_created_at + (p_trial_days::integer * interval '1 day'),
    v_approval_ref,
    v_created_at
  )
  RETURNING * INTO v_institution;

  INSERT INTO public.pilot_institution_memberships(
    institution_id, user_id, role, assigned_by
  ) VALUES (
    v_institution.id, p_manager_user_id, 'manager', p_user_id
  ) RETURNING * INTO v_membership;

  INSERT INTO public.user_roles(user_id, role_id, assigned_by)
  SELECT p_manager_user_id, role.id, p_user_id
  FROM public.roles AS role
  WHERE role.slug = 'institution_pilot_staff'
  ON CONFLICT (user_id, role_id) DO NOTHING;

  v_result := jsonb_build_object(
    'institution', jsonb_build_object(
      'id', v_institution.id,
      'name', v_institution.name,
      'status', v_institution.status,
      'studentLimit', v_institution.student_limit,
      'staffLimit', v_institution.staff_limit,
      'pilotKind', v_institution.pilot_kind,
      'approvalReference', v_institution.approval_ref,
      'reviewDueAt', v_institution.review_due_at,
      'createdAt', v_institution.created_at
    ),
    'membership', jsonb_build_object(
      'memberRef', v_membership.member_ref,
      'role', v_membership.role,
      'joinedAt', v_membership.joined_at
    ),
    'replayed', false
  );

  INSERT INTO public.pilot_institution_requests(
    user_id, operation, request_id, payload_hash, result
  ) VALUES (
    p_user_id, 'provision_free_pilot', p_request_id, v_hash, v_result
  );
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.provision_free_pilot_institution(
  uuid,text,uuid,text,smallint,smallint,smallint,uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.provision_free_pilot_institution(
  uuid,text,uuid,text,smallint,smallint,smallint,uuid
) TO authenticated;

DO $verify$
BEGIN
  IF NOT has_function_privilege(
    'authenticated',
    'public.provision_free_pilot_institution(uuid,text,uuid,text,smallint,smallint,smallint,uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.provision_free_pilot_institution(uuid,text,uuid,text,smallint,smallint,smallint,uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'service_role',
    'public.provision_free_pilot_institution(uuid,text,uuid,text,smallint,smallint,smallint,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'free pilot replay function grants are unsafe';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
    WHERE namespace.nspname='public'
      AND procedure.proname='provision_free_pilot_institution'
      AND procedure.prosecdef
      AND procedure.proconfig @> ARRAY['search_path=pg_catalog']::text[]
  ) THEN
    RAISE EXCEPTION 'free pilot replay function must stay hardened';
  END IF;
END;
$verify$;

NOTIFY pgrst, 'reload schema';
COMMIT;
