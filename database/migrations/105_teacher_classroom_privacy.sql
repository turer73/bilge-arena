-- Migration 105: private, opt-in teacher classroom and assignment pilot.
-- Raw invite tokens, legal text/config, email and student answer details never
-- enter teacher-facing responses. This migration writes no reward/mastery data.
BEGIN;

INSERT INTO public.roles (slug, name, description, is_system)
VALUES (
  'teacher_pilot',
  'Öğretmen Pilotu',
  'Varsayılan kapalı sınıf ve ödev pilotu',
  true
)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_system = true;

INSERT INTO public.role_permissions (role_id, permission)
SELECT role.id, 'teacher.classrooms.manage'
FROM public.roles AS role
WHERE role.slug = 'teacher_pilot'
ON CONFLICT (role_id, permission) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.teacher_classrooms (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 60),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  archived_at timestamptz,
  CHECK (
    (status = 'active' AND archived_at IS NULL)
    OR (status = 'archived' AND archived_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.teacher_classroom_requests (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  operation text NOT NULL CHECK (char_length(operation) BETWEEN 1 AND 80),
  request_id uuid NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, operation, request_id)
);

CREATE TABLE IF NOT EXISTS public.teacher_classroom_invites (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  invite_ref text NOT NULL UNIQUE DEFAULT encode(public.gen_random_bytes(16), 'hex')
    CHECK (invite_ref ~ '^[0-9a-f]{32}$'),
  classroom_id uuid NOT NULL REFERENCES public.teacher_classrooms(id) ON DELETE RESTRICT,
  issuer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  token_digest text NOT NULL UNIQUE CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  max_uses smallint NOT NULL CHECK (max_uses BETWEEN 1 AND 40),
  used_count smallint NOT NULL DEFAULT 0,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (used_count BETWEEN 0 AND max_uses),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '7 days')
);

CREATE TABLE IF NOT EXISTS public.teacher_classroom_memberships (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES public.teacher_classrooms(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  member_ref text NOT NULL UNIQUE DEFAULT encode(public.gen_random_bytes(16), 'hex')
    CHECK (member_ref ~ '^[0-9a-f]{32}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'withdrawn', 'removed')),
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ended_at timestamptz,
  UNIQUE (id, student_id, classroom_id),
  CHECK (
    (status = 'active' AND ended_at IS NULL)
    OR (status IN ('withdrawn', 'removed') AND ended_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS teacher_classroom_one_active_member
  ON public.teacher_classroom_memberships (classroom_id, student_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS teacher_classroom_memberships_student
  ON public.teacher_classroom_memberships (student_id, classroom_id, status);

CREATE TABLE IF NOT EXISTS public.teacher_classroom_privacy_events (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES public.teacher_classroom_memberships(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (
    event_type IN ('notice_acknowledged', 'sharing_consented', 'sharing_withdrawn', 'removed')
  ),
  version text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (
    (event_type IN ('notice_acknowledged', 'sharing_consented')
      AND version IS NOT NULL
      AND char_length(version) BETWEEN 1 AND 100
      AND version ~ '^[A-Za-z0-9._:-]+$')
    OR (event_type IN ('sharing_withdrawn', 'removed') AND version IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.teacher_assignments (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES public.teacher_classrooms(id) ON DELETE RESTRICT,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'closed', 'cancelled')),
  available_at timestamptz NOT NULL,
  due_at timestamptz NOT NULL,
  item_count smallint NOT NULL CHECK (item_count BETWEEN 1 AND 30),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, classroom_id),
  CHECK (due_at > available_at AND due_at <= available_at + interval '30 days')
);

CREATE INDEX IF NOT EXISTS teacher_assignments_classroom_due
  ON public.teacher_assignments (classroom_id, due_at DESC);

CREATE TABLE IF NOT EXISTS public.teacher_assignment_items (
  assignment_id uuid NOT NULL REFERENCES public.teacher_assignments(id) ON DELETE RESTRICT,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 30),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  game text NOT NULL,
  category text,
  topic text,
  difficulty smallint NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  content jsonb NOT NULL,
  correct_option integer NOT NULL CHECK (correct_option BETWEEN 0 AND 9),
  PRIMARY KEY (assignment_id, position),
  UNIQUE (assignment_id, question_id)
);

CREATE TABLE IF NOT EXISTS public.teacher_assignment_recipients (
  assignment_id uuid NOT NULL,
  classroom_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  student_id uuid NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (assignment_id, membership_id),
  UNIQUE (assignment_id, membership_id, student_id),
  FOREIGN KEY (assignment_id, classroom_id)
    REFERENCES public.teacher_assignments(id, classroom_id) ON DELETE RESTRICT,
  FOREIGN KEY (membership_id, student_id, classroom_id)
    REFERENCES public.teacher_classroom_memberships(id, student_id, classroom_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS teacher_assignment_recipients_student
  ON public.teacher_assignment_recipients (student_id, assignment_id);

CREATE TABLE IF NOT EXISTS public.teacher_assignment_submissions (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  assignment_id uuid NOT NULL,
  recipient_membership_id uuid NOT NULL,
  student_id uuid NOT NULL,
  answered_count smallint NOT NULL CHECK (answered_count BETWEEN 0 AND 30),
  correct_count smallint NOT NULL CHECK (correct_count BETWEEN 0 AND answered_count),
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (assignment_id, recipient_membership_id),
  UNIQUE (id, assignment_id),
  FOREIGN KEY (assignment_id, recipient_membership_id, student_id)
    REFERENCES public.teacher_assignment_recipients(assignment_id, membership_id, student_id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.teacher_assignment_submission_items (
  submission_id uuid NOT NULL,
  assignment_id uuid NOT NULL,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 30),
  selected_option integer CHECK (selected_option BETWEEN 0 AND 9),
  is_correct boolean,
  PRIMARY KEY (submission_id, position),
  FOREIGN KEY (submission_id, assignment_id)
    REFERENCES public.teacher_assignment_submissions(id, assignment_id) ON DELETE RESTRICT,
  FOREIGN KEY (assignment_id, position)
    REFERENCES public.teacher_assignment_items(assignment_id, position) ON DELETE RESTRICT,
  CHECK (
    (selected_option IS NULL AND is_correct IS NULL)
    OR (selected_option IS NOT NULL AND is_correct IS NOT NULL)
  )
);

ALTER TABLE public.teacher_classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_classroom_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_classroom_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_classroom_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_classroom_privacy_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_assignment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_assignment_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_assignment_submission_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.teacher_classrooms,
  public.teacher_classroom_requests,
  public.teacher_classroom_invites,
  public.teacher_classroom_memberships,
  public.teacher_classroom_privacy_events,
  public.teacher_assignments,
  public.teacher_assignment_items,
  public.teacher_assignment_recipients,
  public.teacher_assignment_submissions,
  public.teacher_assignment_submission_items
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.teacher_classroom_payload_hash(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT encode(public.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');
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
    JOIN public.roles AS role ON role.id = user_role.role_id
    JOIN public.role_permissions AS permission ON permission.role_id = role.id
    JOIN public.profiles AS profile ON profile.id = user_role.user_id
    WHERE user_role.user_id = p_user_id
      AND role.slug = 'teacher_pilot'
      AND permission.permission = 'teacher.classrooms.manage'
      AND profile.deleted_at IS NULL
  );
$fn$;

CREATE OR REPLACE FUNCTION public.teacher_classroom_is_blocked(p_first uuid, p_second uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.friendships AS friendship
    WHERE friendship.status = 'blocked'
      AND (
        (friendship.user_id = p_first AND friendship.friend_id = p_second)
        OR (friendship.user_id = p_second AND friendship.friend_id = p_first)
      )
  );
$fn$;

CREATE OR REPLACE FUNCTION public.teacher_classroom_safe_alias(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT CASE
    WHEN profile.deleted_at IS NOT NULL THEN 'Gizli Arenacı'
    ELSE left(
      COALESCE(
        NULLIF(btrim(profile.display_name), ''),
        NULLIF(btrim(profile.username), ''),
        'Arenacı'
      ),
      80
    )
  END
  FROM public.profiles AS profile
  WHERE profile.id = p_user_id;
$fn$;

CREATE OR REPLACE FUNCTION public.create_teacher_classroom(
  p_user_id uuid,
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
  v_hash text;
  v_request public.teacher_classroom_requests%ROWTYPE;
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL
    OR v_name IS NULL OR char_length(v_name) NOT BETWEEN 2 AND 60 THEN
    RAISE EXCEPTION 'invalid classroom request' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'classroom actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.teacher_classroom_is_teacher(p_user_id) THEN
    RAISE EXCEPTION 'teacher permission required' USING ERRCODE = '42501';
  END IF;

  v_hash := public.teacher_classroom_payload_hash(jsonb_build_object('name', v_name));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'teacher-request:' || p_user_id::text || ':create:' || p_request_id::text, 0
  ));
  SELECT * INTO v_request
  FROM public.teacher_classroom_requests
  WHERE user_id = p_user_id AND operation = 'create_classroom' AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'classroom request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;

  INSERT INTO public.teacher_classrooms (teacher_id, name)
  VALUES (p_user_id, v_name)
  RETURNING * INTO v_classroom;

  v_result := jsonb_build_object(
    'classroom', jsonb_build_object(
      'id', v_classroom.id,
      'name', v_classroom.name,
      'status', v_classroom.status,
      'createdAt', v_classroom.created_at
    ),
    'replayed', false
  );
  INSERT INTO public.teacher_classroom_requests(user_id, operation, request_id, payload_hash, result)
  VALUES (p_user_id, 'create_classroom', p_request_id, v_hash, v_result);
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_my_teacher_classrooms(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user required' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'classroom actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.teacher_classroom_is_teacher(p_user_id) THEN
    RAISE EXCEPTION 'teacher permission required' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'classrooms', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', classroom.id,
        'name', classroom.name,
        'status', classroom.status,
        'activeStudentCount', (
          SELECT count(*)
          FROM public.teacher_classroom_memberships AS membership
          JOIN public.profiles AS profile ON profile.id = membership.student_id
          WHERE membership.classroom_id = classroom.id
            AND membership.status = 'active'
            AND profile.deleted_at IS NULL
            AND NOT public.teacher_classroom_is_blocked(p_user_id, membership.student_id)
        ),
        'assignmentCount', (
          SELECT count(*)
          FROM public.teacher_assignments AS assignment
          WHERE assignment.classroom_id = classroom.id
            AND assignment.teacher_id = p_user_id
        ),
        'createdAt', classroom.created_at
      ) ORDER BY classroom.created_at, classroom.id)
      FROM public.teacher_classrooms AS classroom
      WHERE classroom.teacher_id = p_user_id
    ), '[]'::jsonb)
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.issue_teacher_classroom_invite(
  p_user_id uuid,
  p_classroom_id uuid,
  p_token_digest text,
  p_expires_at timestamptz,
  p_max_uses smallint,
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
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_invite public.teacher_classroom_invites%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_request_id IS NULL
    OR p_token_digest IS NULL OR p_token_digest !~ '^[0-9a-f]{64}$'
    OR p_expires_at IS NULL OR p_expires_at <= v_now
    OR p_expires_at > v_now + interval '7 days'
    OR p_max_uses IS NULL OR p_max_uses NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'invalid invite request' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'invite actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.teacher_classroom_is_teacher(p_user_id) THEN
    RAISE EXCEPTION 'teacher permission required' USING ERRCODE = '42501';
  END IF;

  v_hash := public.teacher_classroom_payload_hash(jsonb_build_object(
    'classroomId', p_classroom_id,
    'tokenDigest', p_token_digest,
    'expiresAt', p_expires_at,
    'maxUses', p_max_uses
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'teacher-request:' || p_user_id::text || ':invite:' || p_request_id::text, 0
  ));
  SELECT * INTO v_request
  FROM public.teacher_classroom_requests
  WHERE user_id = p_user_id AND operation = 'issue_invite' AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'invite request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;

  SELECT * INTO v_classroom
  FROM public.teacher_classrooms
  WHERE id = p_classroom_id AND teacher_id = p_user_id AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'classroom not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.teacher_classroom_invites(
    classroom_id, issuer_id, token_digest, expires_at, max_uses
  )
  VALUES (p_classroom_id, p_user_id, p_token_digest, p_expires_at, p_max_uses)
  RETURNING * INTO v_invite;

  v_result := jsonb_build_object(
    'inviteRef', v_invite.invite_ref,
    'expiresAt', v_invite.expires_at,
    'maxUses', v_invite.max_uses,
    'usedCount', v_invite.used_count,
    'replayed', false
  );
  INSERT INTO public.teacher_classroom_requests(user_id, operation, request_id, payload_hash, result)
  VALUES (p_user_id, 'issue_invite', p_request_id, v_hash, v_result);
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.revoke_teacher_classroom_invite(
  p_user_id uuid,
  p_invite_ref text,
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
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL
    OR p_invite_ref IS NULL OR p_invite_ref !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'invalid invite revoke request' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'invite actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.teacher_classroom_is_teacher(p_user_id) THEN
    RAISE EXCEPTION 'teacher permission required' USING ERRCODE = '42501';
  END IF;
  v_hash := public.teacher_classroom_payload_hash(jsonb_build_object('inviteRef', p_invite_ref));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'teacher-request:' || p_user_id::text || ':revoke:' || p_request_id::text, 0
  ));
  SELECT * INTO v_request
  FROM public.teacher_classroom_requests
  WHERE user_id = p_user_id AND operation = 'revoke_invite' AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'invite revoke payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;

  SELECT invite.* INTO v_invite
  FROM public.teacher_classroom_invites AS invite
  JOIN public.teacher_classrooms AS classroom ON classroom.id = invite.classroom_id
  WHERE invite.invite_ref = p_invite_ref AND classroom.teacher_id = p_user_id
  FOR UPDATE OF invite;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite not found' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.teacher_classroom_invites
  SET revoked_at = COALESCE(revoked_at, clock_timestamp())
  WHERE id = v_invite.id
  RETURNING * INTO v_invite;
  v_result := jsonb_build_object(
    'inviteRef', v_invite.invite_ref,
    'revokedAt', v_invite.revoked_at,
    'replayed', false
  );
  INSERT INTO public.teacher_classroom_requests(user_id, operation, request_id, payload_hash, result)
  VALUES (p_user_id, 'revoke_invite', p_request_id, v_hash, v_result);
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.preview_teacher_classroom_invite(
  p_user_id uuid,
  p_token_digest text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_invite public.teacher_classroom_invites%ROWTYPE;
  v_classroom public.teacher_classrooms%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_token_digest IS NULL OR p_token_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid invite preview' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'invite actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_invite
  FROM public.teacher_classroom_invites
  WHERE token_digest = p_token_digest;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_classroom
  FROM public.teacher_classrooms
  WHERE id = v_invite.classroom_id;
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
  RETURN jsonb_build_object(
    'classroomName', v_classroom.name,
    'teacherAlias', public.teacher_classroom_safe_alias(v_classroom.teacher_id),
    'expiresAt', v_invite.expires_at
  );
END;
$fn$;

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
  v_membership public.teacher_classroom_memberships%ROWTYPE;
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

CREATE OR REPLACE FUNCTION public.get_my_teacher_classroom_memberships(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user required' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'membership actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'classrooms', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', classroom.id,
        'name', classroom.name,
        'teacherAlias', public.teacher_classroom_safe_alias(classroom.teacher_id),
        'joinedAt', membership.accepted_at
      ) ORDER BY membership.accepted_at, classroom.id)
      FROM public.teacher_classroom_memberships AS membership
      JOIN public.teacher_classrooms AS classroom ON classroom.id = membership.classroom_id
      WHERE membership.student_id = p_user_id
        AND membership.status = 'active'
        AND classroom.status = 'active'
        AND public.teacher_classroom_is_teacher(classroom.teacher_id)
        AND NOT public.teacher_classroom_is_blocked(p_user_id, classroom.teacher_id)
    ), '[]'::jsonb)
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.withdraw_teacher_classroom_membership(
  p_user_id uuid,
  p_classroom_id uuid,
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
  v_membership public.teacher_classroom_memberships%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'invalid membership withdrawal' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'membership actor mismatch' USING ERRCODE = '42501';
  END IF;
  v_hash := public.teacher_classroom_payload_hash(jsonb_build_object('classroomId', p_classroom_id));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'teacher-request:' || p_user_id::text || ':withdraw:' || p_request_id::text, 0
  ));
  SELECT * INTO v_request
  FROM public.teacher_classroom_requests
  WHERE user_id = p_user_id AND operation = 'withdraw_membership' AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'withdraw request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('teacher-class:' || p_classroom_id::text, 0));
  SELECT * INTO v_membership
  FROM public.teacher_classroom_memberships
  WHERE classroom_id = p_classroom_id AND student_id = p_user_id AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active membership not found' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.teacher_classroom_memberships
  SET status = 'withdrawn', ended_at = clock_timestamp()
  WHERE id = v_membership.id
  RETURNING * INTO v_membership;
  INSERT INTO public.teacher_classroom_privacy_events(
    membership_id, student_id, event_type, version
  ) VALUES (v_membership.id, p_user_id, 'sharing_withdrawn', NULL);
  v_result := jsonb_build_object(
    'classroomId', p_classroom_id,
    'membershipStatus', 'withdrawn',
    'endedAt', v_membership.ended_at,
    'replayed', false
  );
  INSERT INTO public.teacher_classroom_requests(user_id, operation, request_id, payload_hash, result)
  VALUES (p_user_id, 'withdraw_membership', p_request_id, v_hash, v_result);
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.remove_teacher_classroom_member(
  p_user_id uuid,
  p_classroom_id uuid,
  p_member_ref text,
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
  v_membership public.teacher_classroom_memberships%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_request_id IS NULL
    OR p_member_ref IS NULL OR p_member_ref !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'invalid member removal' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'classroom actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.teacher_classroom_is_teacher(p_user_id) THEN
    RAISE EXCEPTION 'teacher permission required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.teacher_classrooms
    WHERE id = p_classroom_id AND teacher_id = p_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'classroom not found' USING ERRCODE = 'P0002';
  END IF;
  v_hash := public.teacher_classroom_payload_hash(jsonb_build_object(
    'classroomId', p_classroom_id, 'memberRef', p_member_ref
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'teacher-request:' || p_user_id::text || ':remove:' || p_request_id::text, 0
  ));
  SELECT * INTO v_request
  FROM public.teacher_classroom_requests
  WHERE user_id = p_user_id AND operation = 'remove_member' AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'member removal payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('teacher-class:' || p_classroom_id::text, 0));
  SELECT * INTO v_membership
  FROM public.teacher_classroom_memberships
  WHERE classroom_id = p_classroom_id AND member_ref = p_member_ref AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active member not found' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.teacher_classroom_memberships
  SET status = 'removed', ended_at = clock_timestamp()
  WHERE id = v_membership.id
  RETURNING * INTO v_membership;
  INSERT INTO public.teacher_classroom_privacy_events(
    membership_id, student_id, event_type, version
  ) VALUES (v_membership.id, v_membership.student_id, 'removed', NULL);
  v_result := jsonb_build_object(
    'classroomId', p_classroom_id,
    'memberRef', p_member_ref,
    'membershipStatus', 'removed',
    'endedAt', v_membership.ended_at,
    'replayed', false
  );
  INSERT INTO public.teacher_classroom_requests(user_id, operation, request_id, payload_hash, result)
  VALUES (p_user_id, 'remove_member', p_request_id, v_hash, v_result);
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.publish_teacher_assignment(
  p_user_id uuid,
  p_classroom_id uuid,
  p_title text,
  p_items jsonb,
  p_available_at timestamptz,
  p_due_at timestamptz,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_title text := btrim(p_title);
  v_hash text;
  v_request public.teacher_classroom_requests%ROWTYPE;
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_assignment public.teacher_assignments%ROWTYPE;
  v_count integer;
  v_inserted integer;
  v_recipients integer;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_request_id IS NULL
    OR v_title IS NULL OR char_length(v_title) NOT BETWEEN 1 AND 160
    OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
    OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 30
    OR p_available_at IS NULL OR p_due_at IS NULL
    OR p_due_at <= p_available_at OR p_due_at > p_available_at + interval '30 days'
    OR p_due_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'invalid assignment request' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'assignment actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.teacher_classroom_is_teacher(p_user_id) THEN
    RAISE EXCEPTION 'teacher permission required' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS item
    WHERE CASE
      WHEN jsonb_typeof(item) <> 'object' THEN true
      WHEN (SELECT count(*) FROM jsonb_object_keys(item)) <> 2 THEN true
      WHEN NOT (item ? 'position' AND item ? 'questionId') THEN true
      WHEN jsonb_typeof(item->'position') <> 'number' THEN true
      WHEN (item->>'position') !~ '^[1-9]$|^[12][0-9]$|^30$' THEN true
      WHEN jsonb_typeof(item->'questionId') <> 'string' THEN true
      WHEN (item->>'questionId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN true
      ELSE false
    END
  ) THEN
    RAISE EXCEPTION 'assignment items must contain exact position and questionId' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_count FROM jsonb_array_elements(p_items);
  IF (
    SELECT count(DISTINCT (item->>'position')::integer) <> v_count
      OR count(DISTINCT lower(item->>'questionId')) <> v_count
      OR min((item->>'position')::integer) <> 1
      OR max((item->>'position')::integer) <> v_count
    FROM jsonb_array_elements(p_items) AS item
  ) THEN
    RAISE EXCEPTION 'assignment items must be contiguous and unique' USING ERRCODE = '22023';
  END IF;

  v_hash := public.teacher_classroom_payload_hash(jsonb_build_object(
    'classroomId', p_classroom_id,
    'title', v_title,
    'items', p_items,
    'availableAt', p_available_at,
    'dueAt', p_due_at
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'teacher-request:' || p_user_id::text || ':publish:' || p_request_id::text, 0
  ));
  SELECT * INTO v_request
  FROM public.teacher_classroom_requests
  WHERE user_id = p_user_id AND operation = 'publish_assignment' AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'assignment request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('teacher-class:' || p_classroom_id::text, 0));
  SELECT * INTO v_classroom
  FROM public.teacher_classrooms
  WHERE id = p_classroom_id AND teacher_id = p_user_id AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'classroom not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.teacher_assignments(
    classroom_id, teacher_id, title, available_at, due_at, item_count
  ) VALUES (
    p_classroom_id, p_user_id, v_title, p_available_at, p_due_at, v_count
  ) RETURNING * INTO v_assignment;

  INSERT INTO public.teacher_assignment_items(
    assignment_id, position, question_id, game, category, topic, difficulty, content, correct_option
  )
  SELECT
    v_assignment.id,
    (item->>'position')::smallint,
    question.id,
    question.game,
    question.category,
    question.topic,
    question.difficulty,
    jsonb_strip_nulls(jsonb_build_object(
      'question', question.content->'question',
      'options', question.content->'options',
      'sentence', question.content->'sentence',
      'passage', question.content->'passage',
      'context', question.content->'context',
      'type', question.content->'type'
    )),
    (question.content->>'answer')::integer
  FROM jsonb_array_elements(p_items) AS item
  JOIN public.questions AS question ON question.id = (item->>'questionId')::uuid
  WHERE question.is_active
    AND question.difficulty BETWEEN 1 AND 5
    AND jsonb_typeof(question.content->'question') = 'string'
    AND char_length(btrim(question.content->>'question')) BETWEEN 1 AND 20000
    AND jsonb_typeof(question.content->'options') = 'array'
    AND jsonb_array_length(question.content->'options') BETWEEN 2 AND 10
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(question.content->'options') AS option
      WHERE jsonb_typeof(option) <> 'string' OR char_length(option #>> '{}') > 10000
    )
    AND (NOT question.content ? 'sentence'
      OR jsonb_typeof(question.content->'sentence') = 'string'
      AND char_length(question.content->>'sentence') <= 20000)
    AND (NOT question.content ? 'context'
      OR jsonb_typeof(question.content->'context') = 'string'
      AND char_length(question.content->>'context') <= 20000)
    AND (NOT question.content ? 'passage'
      OR jsonb_typeof(question.content->'passage') = 'string'
      AND char_length(question.content->>'passage') <= 50000)
    AND (NOT question.content ? 'type'
      OR jsonb_typeof(question.content->'type') = 'string'
      AND char_length(question.content->>'type') <= 80)
    AND (question.category IS NULL OR char_length(question.category) <= 120)
    AND (question.topic IS NULL OR char_length(question.topic) <= 200)
    AND (question.content->>'answer') ~ '^[0-9]$'
    AND (question.content->>'answer')::integer
      BETWEEN 0 AND jsonb_array_length(question.content->'options') - 1
  ORDER BY (item->>'position')::integer;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted <> v_count THEN
    RAISE EXCEPTION 'assignment contains inactive or invalid question' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.teacher_assignment_recipients(
    assignment_id, classroom_id, membership_id, student_id
  )
  SELECT v_assignment.id, p_classroom_id, membership.id, membership.student_id
  FROM public.teacher_classroom_memberships AS membership
  JOIN public.profiles AS profile ON profile.id = membership.student_id
  WHERE membership.classroom_id = p_classroom_id
    AND membership.status = 'active'
    AND profile.deleted_at IS NULL
    AND NOT public.teacher_classroom_is_blocked(p_user_id, membership.student_id);
  GET DIAGNOSTICS v_recipients = ROW_COUNT;
  IF v_recipients NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'assignment requires 1..40 active recipients' USING ERRCODE = '23514';
  END IF;

  v_result := jsonb_build_object(
    'assignmentId', v_assignment.id,
    'status', v_assignment.status,
    'availableAt', v_assignment.available_at,
    'dueAt', v_assignment.due_at,
    'questionCount', v_count,
    'recipientCount', v_recipients,
    'replayed', false
  );
  INSERT INTO public.teacher_classroom_requests(user_id, operation, request_id, payload_hash, result)
  VALUES (p_user_id, 'publish_assignment', p_request_id, v_hash, v_result);
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_my_teacher_classroom_overview(
  p_user_id uuid,
  p_classroom_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_active_students jsonb;
  v_assignments jsonb;
  v_hidden integer;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL THEN
    RAISE EXCEPTION 'user and classroom required' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'classroom actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.teacher_classroom_is_teacher(p_user_id) THEN
    RAISE EXCEPTION 'teacher permission required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_classroom
  FROM public.teacher_classrooms
  WHERE id = p_classroom_id AND teacher_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'classroom not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'memberRef', membership.member_ref,
    'alias', public.teacher_classroom_safe_alias(membership.student_id),
    'joinedAt', membership.accepted_at
  ) ORDER BY membership.accepted_at, membership.member_ref), '[]'::jsonb)
  INTO v_active_students
  FROM public.teacher_classroom_memberships AS membership
  JOIN public.profiles AS profile ON profile.id = membership.student_id
  WHERE membership.classroom_id = p_classroom_id
    AND membership.status = 'active'
    AND profile.deleted_at IS NULL
    AND NOT public.teacher_classroom_is_blocked(p_user_id, membership.student_id);

  SELECT count(*)::integer INTO v_hidden
  FROM public.teacher_classroom_memberships AS membership
  LEFT JOIN public.profiles AS profile ON profile.id = membership.student_id
  WHERE membership.classroom_id = p_classroom_id
    AND (
      membership.status <> 'active'
      OR profile.id IS NULL
      OR profile.deleted_at IS NOT NULL
      OR public.teacher_classroom_is_blocked(p_user_id, membership.student_id)
    );

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', assignment.id,
    'title', assignment.title,
    'status', assignment.status,
    'availableAt', assignment.available_at,
    'dueAt', assignment.due_at,
    'questionCount', assignment.item_count,
    'assignedCount', (
      SELECT count(*) FROM public.teacher_assignment_recipients AS recipient
      WHERE recipient.assignment_id = assignment.id
    ),
    'submittedCount', (
      SELECT count(*)
      FROM public.teacher_assignment_submissions AS submission
      JOIN public.teacher_classroom_memberships AS membership
        ON membership.id = submission.recipient_membership_id
      JOIN public.profiles AS profile ON profile.id = membership.student_id
      WHERE submission.assignment_id = assignment.id
        AND membership.status = 'active'
        AND profile.deleted_at IS NULL
        AND NOT public.teacher_classroom_is_blocked(p_user_id, membership.student_id)
    ),
    'students', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'memberRef', membership.member_ref,
        'alias', public.teacher_classroom_safe_alias(membership.student_id),
        'status', CASE WHEN submission.id IS NULL THEN 'assigned' ELSE 'submitted' END,
        'answeredCount', COALESCE(submission.answered_count, 0),
        'correctCount', COALESCE(submission.correct_count, 0),
        'submittedAt', submission.submitted_at
      ) ORDER BY membership.accepted_at, membership.member_ref)
      FROM public.teacher_assignment_recipients AS recipient
      JOIN public.teacher_classroom_memberships AS membership
        ON membership.id = recipient.membership_id
      JOIN public.profiles AS profile ON profile.id = membership.student_id
      LEFT JOIN public.teacher_assignment_submissions AS submission
        ON submission.assignment_id = recipient.assignment_id
        AND submission.recipient_membership_id = recipient.membership_id
      WHERE recipient.assignment_id = assignment.id
        AND membership.status = 'active'
        AND profile.deleted_at IS NULL
        AND NOT public.teacher_classroom_is_blocked(p_user_id, membership.student_id)
    ), '[]'::jsonb)
  ) ORDER BY assignment.created_at DESC), '[]'::jsonb)
  INTO v_assignments
  FROM public.teacher_assignments AS assignment
  WHERE assignment.classroom_id = p_classroom_id AND assignment.teacher_id = p_user_id;

  RETURN jsonb_build_object(
    'classroom', jsonb_build_object(
      'id', v_classroom.id,
      'name', v_classroom.name,
      'status', v_classroom.status,
      'activeStudentCount', jsonb_array_length(v_active_students),
      'hiddenRecipientCount', v_hidden,
      'createdAt', v_classroom.created_at
    ),
    'activeStudents', v_active_students,
    'assignments', v_assignments
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_my_teacher_assignments(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user required' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'assignment actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object(
    'assignments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', assignment.id,
        'title', assignment.title,
        'status', CASE
          WHEN assignment.status <> 'published' THEN assignment.status
          WHEN submission.id IS NOT NULL THEN 'submitted'
          WHEN assignment.due_at < clock_timestamp() THEN 'expired'
          WHEN assignment.available_at > clock_timestamp() THEN 'upcoming'
          ELSE 'active'
        END,
        'availableAt', assignment.available_at,
        'dueAt', assignment.due_at,
        'questionCount', assignment.item_count,
        'submittedAt', submission.submitted_at,
        'classroom', jsonb_build_object(
          'id', classroom.id,
          'name', classroom.name,
          'teacherAlias', public.teacher_classroom_safe_alias(classroom.teacher_id)
        )
      ) ORDER BY assignment.due_at, assignment.id)
      FROM public.teacher_assignment_recipients AS recipient
      JOIN public.teacher_assignments AS assignment ON assignment.id = recipient.assignment_id
      JOIN public.teacher_classrooms AS classroom ON classroom.id = assignment.classroom_id
      JOIN public.teacher_classroom_memberships AS membership
        ON membership.id = recipient.membership_id
      LEFT JOIN public.teacher_assignment_submissions AS submission
        ON submission.assignment_id = assignment.id
        AND submission.recipient_membership_id = membership.id
      WHERE recipient.student_id = p_user_id
        AND membership.student_id = p_user_id
        AND membership.status = 'active'
        AND classroom.status = 'active'
        AND public.teacher_classroom_is_teacher(classroom.teacher_id)
        AND NOT public.teacher_classroom_is_blocked(p_user_id, classroom.teacher_id)
    ), '[]'::jsonb)
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_my_teacher_assignment(
  p_user_id uuid,
  p_assignment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_assignment public.teacher_assignments%ROWTYPE;
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_membership public.teacher_classroom_memberships%ROWTYPE;
  v_submission public.teacher_assignment_submissions%ROWTYPE;
  v_items jsonb;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_assignment_id IS NULL THEN
    RAISE EXCEPTION 'user and assignment required' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'assignment actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT assignment.*
  INTO v_assignment
  FROM public.teacher_assignments AS assignment
  JOIN public.teacher_assignment_recipients AS recipient ON recipient.assignment_id = assignment.id
  JOIN public.teacher_classroom_memberships AS membership ON membership.id = recipient.membership_id
  WHERE assignment.id = p_assignment_id
    AND recipient.student_id = p_user_id
    AND membership.student_id = p_user_id
    AND membership.status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assignment not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT membership.*
  INTO v_membership
  FROM public.teacher_assignment_recipients AS recipient
  JOIN public.teacher_classroom_memberships AS membership ON membership.id = recipient.membership_id
  WHERE recipient.assignment_id = p_assignment_id
    AND recipient.student_id = p_user_id
    AND membership.student_id = p_user_id
    AND membership.status = 'active';
  SELECT * INTO v_classroom
  FROM public.teacher_classrooms
  WHERE id = v_assignment.classroom_id AND status = 'active';
  IF NOT FOUND OR NOT public.teacher_classroom_is_teacher(v_classroom.teacher_id)
    OR public.teacher_classroom_is_blocked(p_user_id, v_classroom.teacher_id) THEN
    RAISE EXCEPTION 'assignment not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_assignment.available_at > clock_timestamp() THEN
    RAISE EXCEPTION 'assignment is not available' USING ERRCODE = 'P0003';
  END IF;
  SELECT * INTO v_submission
  FROM public.teacher_assignment_submissions
  WHERE assignment_id = p_assignment_id AND recipient_membership_id = v_membership.id;

  SELECT jsonb_agg(jsonb_build_object(
    'position', item.position,
    'question', jsonb_build_object(
      'game', item.game,
      'category', item.category,
      'topic', item.topic,
      'difficulty', item.difficulty,
      'content', item.content
    )
  ) ORDER BY item.position)
  INTO v_items
  FROM public.teacher_assignment_items AS item
  WHERE item.assignment_id = p_assignment_id;

  v_result := jsonb_build_object(
    'id', v_assignment.id,
    'title', v_assignment.title,
    'status', CASE
      WHEN v_assignment.status <> 'published' THEN v_assignment.status
      WHEN v_submission.id IS NOT NULL THEN 'submitted'
      WHEN v_assignment.due_at < clock_timestamp() THEN 'expired'
      ELSE 'active'
    END,
    'availableAt', v_assignment.available_at,
    'dueAt', v_assignment.due_at,
    'classroom', jsonb_build_object(
      'id', v_classroom.id,
      'name', v_classroom.name,
      'teacherAlias', public.teacher_classroom_safe_alias(v_classroom.teacher_id)
    ),
    'items', v_items,
    'result', CASE WHEN v_submission.id IS NULL THEN NULL ELSE jsonb_build_object(
      'answeredCount', v_submission.answered_count,
      'correctCount', v_submission.correct_count,
      'items', (
        SELECT jsonb_agg(jsonb_build_object(
          'position', submission_item.position,
          'selectedOption', submission_item.selected_option,
          'isCorrect', submission_item.is_correct,
          'correctOption', assignment_item.correct_option
        ) ORDER BY submission_item.position)
        FROM public.teacher_assignment_submission_items AS submission_item
        JOIN public.teacher_assignment_items AS assignment_item
          ON assignment_item.assignment_id = submission_item.assignment_id
          AND assignment_item.position = submission_item.position
        WHERE submission_item.submission_id = v_submission.id
      )
    ) END,
    'reward', jsonb_build_object('xp', 0, 'coins', 0, 'socialPoints', 0)
  );
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.submit_teacher_assignment(
  p_user_id uuid,
  p_assignment_id uuid,
  p_answers jsonb,
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
  v_assignment public.teacher_assignments%ROWTYPE;
  v_membership public.teacher_classroom_memberships%ROWTYPE;
  v_submission public.teacher_assignment_submissions%ROWTYPE;
  v_count integer;
  v_answered integer;
  v_correct integer;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_assignment_id IS NULL OR p_request_id IS NULL
    OR p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array'
    OR jsonb_array_length(p_answers) NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'invalid assignment submission' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'assignment actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_answers) AS answer
    WHERE CASE
      WHEN jsonb_typeof(answer) <> 'object' THEN true
      WHEN (SELECT count(*) FROM jsonb_object_keys(answer)) <> 2 THEN true
      WHEN NOT (answer ? 'position' AND answer ? 'selectedOption') THEN true
      WHEN jsonb_typeof(answer->'position') <> 'number' THEN true
      WHEN (answer->>'position') !~ '^[1-9]$|^[12][0-9]$|^30$' THEN true
      WHEN jsonb_typeof(answer->'selectedOption') NOT IN ('number', 'null') THEN true
      WHEN jsonb_typeof(answer->'selectedOption') = 'number'
        AND (answer->>'selectedOption') !~ '^[0-9]$' THEN true
      ELSE false
    END
  ) THEN
    RAISE EXCEPTION 'answers require exact position and selectedOption' USING ERRCODE = '22023';
  END IF;

  v_hash := public.teacher_classroom_payload_hash(jsonb_build_object(
    'assignmentId', p_assignment_id, 'answers', p_answers
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'teacher-request:' || p_user_id::text || ':submit:' || p_request_id::text, 0
  ));
  SELECT * INTO v_request
  FROM public.teacher_classroom_requests
  WHERE user_id = p_user_id AND operation = 'submit_assignment' AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'assignment submission payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;

  SELECT assignment.*
  INTO v_assignment
  FROM public.teacher_assignments AS assignment
  JOIN public.teacher_assignment_recipients AS recipient ON recipient.assignment_id = assignment.id
  JOIN public.teacher_classroom_memberships AS membership ON membership.id = recipient.membership_id
  WHERE assignment.id = p_assignment_id
    AND recipient.student_id = p_user_id
    AND membership.student_id = p_user_id
    AND membership.status = 'active'
  FOR UPDATE OF assignment;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assignment not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT membership.*
  INTO v_membership
  FROM public.teacher_assignment_recipients AS recipient
  JOIN public.teacher_classroom_memberships AS membership ON membership.id = recipient.membership_id
  WHERE recipient.assignment_id = p_assignment_id
    AND recipient.student_id = p_user_id
    AND membership.student_id = p_user_id
    AND membership.status = 'active'
  FOR UPDATE OF membership;
  IF NOT public.teacher_classroom_is_teacher(v_assignment.teacher_id)
    OR public.teacher_classroom_is_blocked(p_user_id, v_assignment.teacher_id) THEN
    RAISE EXCEPTION 'assignment not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_assignment.status <> 'published'
    OR clock_timestamp() < v_assignment.available_at
    OR clock_timestamp() > v_assignment.due_at THEN
    RAISE EXCEPTION 'assignment is outside submission window' USING ERRCODE = 'P0003';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.teacher_assignment_submissions
    WHERE assignment_id = p_assignment_id AND recipient_membership_id = v_membership.id
  ) THEN
    RAISE EXCEPTION 'assignment already submitted' USING ERRCODE = '23505';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.teacher_assignment_items WHERE assignment_id = p_assignment_id;
  IF jsonb_array_length(p_answers) <> v_count
    OR EXISTS (
      SELECT (answer->>'position')::integer
      FROM jsonb_array_elements(p_answers) AS answer
      GROUP BY 1 HAVING count(*) <> 1
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_answers) AS answer
      LEFT JOIN public.teacher_assignment_items AS item
        ON item.assignment_id = p_assignment_id
        AND item.position = (answer->>'position')::integer
      WHERE item.position IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_answers) AS answer
      JOIN public.teacher_assignment_items AS item
        ON item.assignment_id = p_assignment_id
        AND item.position = (answer->>'position')::integer
      WHERE jsonb_typeof(answer->'selectedOption') = 'number'
        AND (answer->>'selectedOption')::integer >= jsonb_array_length(item.content->'options')
    ) THEN
    RAISE EXCEPTION 'answers must exactly match assignment positions and option bounds'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    count(*) FILTER (WHERE answer->>'selectedOption' IS NOT NULL),
    count(*) FILTER (
      WHERE answer->>'selectedOption' IS NOT NULL
        AND (answer->>'selectedOption')::integer = item.correct_option
    )
  INTO v_answered, v_correct
  FROM jsonb_array_elements(p_answers) AS answer
  JOIN public.teacher_assignment_items AS item
    ON item.assignment_id = p_assignment_id
    AND item.position = (answer->>'position')::integer;

  INSERT INTO public.teacher_assignment_submissions(
    assignment_id, recipient_membership_id, student_id, answered_count, correct_count
  ) VALUES (
    p_assignment_id, v_membership.id, p_user_id, v_answered, v_correct
  ) RETURNING * INTO v_submission;
  INSERT INTO public.teacher_assignment_submission_items(
    submission_id, assignment_id, position, selected_option, is_correct
  )
  SELECT
    v_submission.id,
    p_assignment_id,
    item.position,
    (answer->>'selectedOption')::integer,
    CASE WHEN answer->>'selectedOption' IS NULL THEN NULL
      ELSE (answer->>'selectedOption')::integer = item.correct_option END
  FROM jsonb_array_elements(p_answers) AS answer
  JOIN public.teacher_assignment_items AS item
    ON item.assignment_id = p_assignment_id
    AND item.position = (answer->>'position')::integer
  ORDER BY item.position;

  v_result := jsonb_build_object(
    'assignmentId', p_assignment_id,
    'answeredCount', v_answered,
    'correctCount', v_correct,
    'replayed', false
  );
  INSERT INTO public.teacher_classroom_requests(user_id, operation, request_id, payload_hash, result)
  VALUES (p_user_id, 'submit_assignment', p_request_id, v_hash, v_result);
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION
  public.teacher_classroom_payload_hash(jsonb),
  public.teacher_classroom_is_teacher(uuid),
  public.teacher_classroom_is_blocked(uuid, uuid),
  public.teacher_classroom_safe_alias(uuid),
  public.create_teacher_classroom(uuid, text, uuid),
  public.get_my_teacher_classrooms(uuid),
  public.issue_teacher_classroom_invite(uuid, uuid, text, timestamptz, smallint, uuid),
  public.revoke_teacher_classroom_invite(uuid, text, uuid),
  public.preview_teacher_classroom_invite(uuid, text),
  public.accept_teacher_classroom_invite(uuid, text, text, text, uuid),
  public.get_my_teacher_classroom_memberships(uuid),
  public.withdraw_teacher_classroom_membership(uuid, uuid, uuid),
  public.remove_teacher_classroom_member(uuid, uuid, text, uuid),
  public.publish_teacher_assignment(uuid, uuid, text, jsonb, timestamptz, timestamptz, uuid),
  public.get_my_teacher_classroom_overview(uuid, uuid),
  public.get_my_teacher_assignments(uuid),
  public.get_my_teacher_assignment(uuid, uuid),
  public.submit_teacher_assignment(uuid, uuid, jsonb, uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.create_teacher_classroom(uuid, text, uuid),
  public.get_my_teacher_classrooms(uuid),
  public.issue_teacher_classroom_invite(uuid, uuid, text, timestamptz, smallint, uuid),
  public.revoke_teacher_classroom_invite(uuid, text, uuid),
  public.preview_teacher_classroom_invite(uuid, text),
  public.accept_teacher_classroom_invite(uuid, text, text, text, uuid),
  public.get_my_teacher_classroom_memberships(uuid),
  public.withdraw_teacher_classroom_membership(uuid, uuid, uuid),
  public.remove_teacher_classroom_member(uuid, uuid, text, uuid),
  public.publish_teacher_assignment(uuid, uuid, text, jsonb, timestamptz, timestamptz, uuid),
  public.get_my_teacher_classroom_overview(uuid, uuid),
  public.get_my_teacher_assignments(uuid),
  public.get_my_teacher_assignment(uuid, uuid),
  public.submit_teacher_assignment(uuid, uuid, jsonb, uuid)
TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
