-- Migration 157: bounded, invitation-only free institution canary.
-- This does not open paid onboarding or public/self-service tenant creation.
BEGIN;

ALTER TABLE public.pilot_institutions
  ADD COLUMN IF NOT EXISTS pilot_kind text NOT NULL DEFAULT 'legacy'
    CHECK (pilot_kind IN ('legacy', 'invitation_free', 'commercial'));

-- Existing rows are intentionally backfilled as legacy by the ADD COLUMN
-- default above. Future calls to the paid provisioning RPC omit pilot_kind,
-- so their database default must be commercial.
ALTER TABLE public.pilot_institutions
  ALTER COLUMN pilot_kind SET DEFAULT 'commercial';

ALTER TABLE public.pilot_institutions
  ADD COLUMN IF NOT EXISTS review_due_at timestamptz;

ALTER TABLE public.pilot_institutions
  ADD COLUMN IF NOT EXISTS approval_ref text;

DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.pilot_institutions'::regclass
      AND conname = 'pilot_institutions_free_review_due'
  ) THEN
    ALTER TABLE public.pilot_institutions
      ADD CONSTRAINT pilot_institutions_free_review_due
      CHECK (pilot_kind <> 'invitation_free' OR review_due_at IS NOT NULL);
  END IF;
END;
$block$;

-- Recreate the named constraint so a retry also repairs an earlier version
-- whose CHECK expression accepted NULL through SQL three-valued logic.
ALTER TABLE public.pilot_institutions
  DROP CONSTRAINT IF EXISTS pilot_institutions_free_approval_ref;
ALTER TABLE public.pilot_institutions
  ADD CONSTRAINT pilot_institutions_free_approval_ref
  CHECK (
    pilot_kind <> 'invitation_free'
    OR (
      approval_ref IS NOT NULL
      AND approval_ref ~ '^[A-Z0-9][A-Z0-9._/-]{5,63}$'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS pilot_institutions_free_approval_ref_unique
  ON public.pilot_institutions (approval_ref)
  WHERE pilot_kind = 'invitation_free';

-- The canary program deliberately has one open slot. This index is the final
-- race-safe invariant even for privileged/manual inserts. An expired row must
-- first be suspended or archived through the audited lifecycle flow.
CREATE UNIQUE INDEX IF NOT EXISTS pilot_institutions_one_open_free_pilot
  ON public.pilot_institutions (pilot_kind)
  WHERE pilot_kind = 'invitation_free'
    AND status IN ('pilot', 'active');

-- Paid and free provisioning use separate request-ledger operations. Preserve
-- that namespace in the immutable event key so reusing the same UUID across
-- the two domains cannot suppress either audit event.
ALTER TABLE public.institution_operation_events
  DROP CONSTRAINT IF EXISTS institution_operation_events_source_check;
ALTER TABLE public.institution_operation_events
  ADD CONSTRAINT institution_operation_events_source_check
  CHECK (source IN ('institution_request', 'free_pilot_request', 'classroom_request'));

CREATE TABLE IF NOT EXISTS public.institution_pilot_controls (
  control_key text PRIMARY KEY CHECK (control_key IN ('free_provisioning')),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO public.institution_pilot_controls(control_key, enabled)
VALUES ('free_provisioning', false)
ON CONFLICT (control_key) DO NOTHING;

ALTER TABLE public.institution_pilot_controls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.institution_pilot_controls
FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.institution_pilot_control_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  control_key text NOT NULL CHECK (control_key = 'free_provisioning'),
  previous_enabled boolean NOT NULL,
  enabled boolean NOT NULL,
  change_reference text NOT NULL
    CHECK (change_reference ~ '^[A-Z0-9][A-Z0-9._/-]{5,63}$'),
  database_actor text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (previous_enabled IS DISTINCT FROM enabled),
  UNIQUE (control_key, change_reference)
);

ALTER TABLE public.institution_pilot_control_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.institution_pilot_control_events
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.audit_institution_pilot_control_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_change_reference text := upper(btrim(
    current_setting('app.institution_control_change_ref', true)
  ));
BEGIN
  NEW.updated_at := clock_timestamp();
  IF NEW.enabled IS NOT DISTINCT FROM OLD.enabled THEN
    RETURN NEW;
  END IF;
  IF v_change_reference IS NULL
    OR v_change_reference !~ '^[A-Z0-9][A-Z0-9._/-]{5,63}$' THEN
    RAISE EXCEPTION 'institution pilot control change reference required'
      USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.institution_pilot_control_events(
    control_key, previous_enabled, enabled, change_reference, database_actor
  ) VALUES (
    NEW.control_key, OLD.enabled, NEW.enabled, v_change_reference, session_user
  );
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS institution_pilot_control_change_audit
  ON public.institution_pilot_controls;
CREATE TRIGGER institution_pilot_control_change_audit
BEFORE UPDATE ON public.institution_pilot_controls
FOR EACH ROW EXECUTE FUNCTION public.audit_institution_pilot_control_change();

REVOKE ALL ON FUNCTION public.audit_institution_pilot_control_change()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.institution_pilot_is_operational(
  p_institution_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.pilot_institutions AS institution
    WHERE institution.id = p_institution_id
      AND institution.status IN ('pilot', 'active')
      AND (
        institution.pilot_kind <> 'invitation_free'
        OR institution.review_due_at > statement_timestamp()
      )
  );
$fn$;

CREATE OR REPLACE FUNCTION public.enforce_free_pilot_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF NEW.pilot_kind = 'invitation_free'
    AND NEW.status IN ('pilot', 'active')
    AND (NEW.review_due_at IS NULL OR NEW.review_due_at <= clock_timestamp()) THEN
    RAISE EXCEPTION 'expired free institution pilot cannot be active'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS pilot_institutions_free_lifecycle_guard
  ON public.pilot_institutions;
CREATE TRIGGER pilot_institutions_free_lifecycle_guard
BEFORE INSERT OR UPDATE ON public.pilot_institutions
FOR EACH ROW EXECUTE FUNCTION public.enforce_free_pilot_lifecycle();

-- Every tenant authorization path converges on these helpers. Expired free
-- canaries remain visible to platform operators for suspension/export, but
-- tenant staff, students and support readers fail closed immediately.
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
      AND public.institution_pilot_is_operational(institution.id)
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
    JOIN public.pilot_institutions AS institution
      ON institution.id = membership.institution_id
      AND public.institution_pilot_is_operational(institution.id)
    JOIN public.profiles AS profile ON profile.id = membership.user_id
    WHERE membership.user_id = p_user_id
      AND membership.institution_id = p_institution_id
      AND membership.status = 'active'
      AND membership.role = ANY(p_roles)
      AND profile.deleted_at IS NULL
  );
$fn$;

CREATE OR REPLACE FUNCTION public.institution_pilot_active_institution(
  p_user_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT membership.institution_id
  FROM public.pilot_institution_memberships AS membership
  JOIN public.pilot_institutions AS institution
    ON institution.id = membership.institution_id
    AND public.institution_pilot_is_operational(institution.id)
  JOIN public.profiles AS profile ON profile.id = membership.user_id
  WHERE public.institution_rpc_actor_has_aal2(p_user_id)
    AND membership.user_id = p_user_id
    AND membership.status = 'active'
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
    JOIN public.pilot_institutions AS institution
      ON institution.id = p_institution_id
      AND public.institution_pilot_is_operational(institution.id)
    JOIN public.institution_support_grants AS support_grant
      ON support_grant.institution_id = institution.id
    WHERE user_role.user_id = p_admin_user_id
      AND permission.permission = 'institution.support.access'
      AND admin_profile.deleted_at IS NULL
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
      AND public.institution_pilot_is_operational(institution.id)
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
  IF (auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id)
    OR NOT public.institution_rpc_actor_has_aal2(p_user_id) THEN
    RAISE EXCEPTION 'institution actor mismatch or AAL2 required'
      USING ERRCODE = '42501';
  END IF;
  SELECT membership.* INTO v_membership
  FROM public.pilot_institution_memberships AS membership
  JOIN public.profiles AS profile ON profile.id = membership.user_id
  WHERE membership.user_id = p_user_id
    AND membership.status = 'active' AND profile.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'institution membership not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_institution
  FROM public.pilot_institutions AS institution
  WHERE institution.id = v_membership.institution_id
    AND public.institution_pilot_is_operational(institution.id);
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

  -- This RPC is deliberately browser-JWT only. A service-role caller or a
  -- caller trying to name another actor cannot provision a free tenant.
  IF auth.uid() IS NULL
    OR auth.uid() IS DISTINCT FROM p_user_id
    OR NOT public.institution_rpc_actor_has_aal2(p_user_id) THEN
    RAISE EXCEPTION 'free institution pilot actor mismatch or AAL2 required'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.institution_pilot_is_platform_admin(p_user_id) THEN
    RAISE EXCEPTION 'institution platform permission required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.institution_pilot_controls AS control
    WHERE control.control_key = 'free_provisioning' AND control.enabled
  ) THEN
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

  -- Serialize different managers/request IDs against the single canary slot.
  -- The unique partial index above remains the database-level backstop.
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
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pilot_institution_memberships
    WHERE user_id = p_manager_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'manager already belongs to an active institution'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.pilot_institutions(
    name, created_by, student_limit, staff_limit, pilot_kind, review_due_at,
    approval_ref
  ) VALUES (
    v_name,
    p_user_id,
    p_student_limit,
    p_staff_limit,
    'invitation_free',
    clock_timestamp() + (p_trial_days::integer * interval '1 day'),
    v_approval_ref
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

-- The existing general audit trigger intentionally ignores the new operation.
-- This focused trigger creates one immutable event with bounded, non-PII pilot
-- metadata; raw account identifiers never enter the metadata object.
CREATE OR REPLACE FUNCTION public.audit_free_pilot_institution_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_institution_id uuid;
BEGIN
  IF NEW.operation <> 'provision_free_pilot' THEN RETURN NEW; END IF;
  IF NEW.result #>> '{institution,id}' !~* '^[0-9a-f-]{36}$' THEN RETURN NEW; END IF;
  v_institution_id := (NEW.result #>> '{institution,id}')::uuid;

  INSERT INTO public.institution_operation_events(
    institution_id,
    actor_user_id,
    event_type,
    source,
    request_id,
    metadata
  ) VALUES (
    v_institution_id,
    NEW.user_id,
    'institution_provisioned',
    'free_pilot_request',
    NEW.request_id,
    jsonb_build_object(
      'pilotKind', 'invitation_free',
      'approvalReference', NEW.result #>> '{institution,approvalReference}',
      'studentLimit', (NEW.result #>> '{institution,studentLimit}')::integer,
      'staffLimit', (NEW.result #>> '{institution,staffLimit}')::integer,
      'reviewDueAt', NEW.result #>> '{institution,reviewDueAt}'
    )
  ) ON CONFLICT (source, actor_user_id, event_type, request_id) DO NOTHING;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS pilot_institution_free_request_audit
  ON public.pilot_institution_requests;
CREATE TRIGGER pilot_institution_free_request_audit
AFTER INSERT ON public.pilot_institution_requests
FOR EACH ROW EXECUTE FUNCTION public.audit_free_pilot_institution_request();

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
    'pilotKind', institution.pilot_kind,
    'approvalReference', institution.approval_ref,
    'reviewDueAt', institution.review_due_at,
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
      AND public.institution_pilot_is_operational(institution.id)
      AND support_grant.revoked_at IS NULL
      AND support_grant.expires_at > clock_timestamp()
    ORDER BY support_grant.expires_at DESC LIMIT 1
  ) AS support_grant ON true
  WHERE institution.status IN ('pilot', 'active', 'suspended', 'archived');

  RETURN jsonb_build_object(
    'institutions', v_institutions,
    'databaseControls', jsonb_build_object(
      'freePilotProvisioningEnabled', COALESCE((
        SELECT control.enabled
        FROM public.institution_pilot_controls AS control
        WHERE control.control_key = 'free_provisioning'
      ), false)
    )
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.provision_free_pilot_institution(
  uuid,text,uuid,text,smallint,smallint,smallint,uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.provision_free_pilot_institution(
  uuid,text,uuid,text,smallint,smallint,smallint,uuid
) TO authenticated;

REVOKE ALL ON FUNCTION public.audit_free_pilot_institution_request()
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.institution_pilot_is_operational(uuid),
  public.enforce_free_pilot_lifecycle(),
  public.institution_member_has_permission(uuid,uuid,text),
  public.institution_pilot_has_role(uuid,uuid,text[]),
  public.institution_pilot_active_institution(uuid),
  public.institution_support_has_access(uuid,uuid),
  public.teacher_classroom_is_teacher(uuid)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_my_pilot_institution(uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_pilot_institution(uuid)
TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_pilot_institutions(uuid)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.list_pilot_institutions(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
