-- Migration 149: close the institution audit gaps for invitations,
-- assignments, classroom controls, support access and student-support flows.
BEGIN;

ALTER TABLE public.institution_operation_events
  DROP CONSTRAINT IF EXISTS institution_operation_events_event_type_check;
ALTER TABLE public.institution_operation_events
  ADD CONSTRAINT institution_operation_events_event_type_check CHECK (event_type IN (
    'institution_provisioned','staff_added','staff_removed',
    'manager_teaching_changed','manager_transferred',
    'role_created','role_updated','role_deleted','role_assignment_changed',
    'classroom_created','student_joined','student_withdrawn','student_removed',
    'invite_issued','invite_revoked','assignment_published','assignment_submitted',
    'board_access_changed','exam_mode_changed',
    'study_program_created','study_program_updated','study_program_published',
    'study_program_reviewed','student_followup_opened','student_followup_resolved',
    'student_report_created','support_access_granted','support_access_revoked'
  ));

CREATE OR REPLACE FUNCTION public.audit_pilot_institution_request()
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
    NEW.result ->> 'followupRef', NEW.result ->> 'reportRef',
    NEW.result ->> 'grantRef'
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

REVOKE ALL ON FUNCTION public.audit_pilot_institution_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_teacher_classroom_request() FROM PUBLIC, anon, authenticated;

COMMIT;
