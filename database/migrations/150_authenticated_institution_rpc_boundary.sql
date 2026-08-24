-- Migration 150: institution/classroom RPCs execute with the caller JWT.
-- The allowlist is deliberately explicit. Every exposed SECURITY DEFINER
-- function must contain an auth.uid() actor binding before it can be granted.
BEGIN;

DO $do$
DECLARE
  v_name text;
  v_proc record;
  v_names text[] := ARRAY[
    'list_pilot_institutions','provision_pilot_institution',
    'get_institution_support_directory',
    'get_my_institution_operation_events','create_my_institution_classroom',
    'set_my_institution_role_assignment','update_my_institution_role',
    'delete_my_institution_role','get_my_institution_role_directory',
    'create_my_institution_role','remove_pilot_institution_teacher',
    'transfer_my_pilot_institution_manager','set_my_institution_manager_teacher_role',
    'add_my_institution_teacher_by_email','get_my_institution_support_access',
    'grant_my_institution_support_access','revoke_my_institution_support_access',
    'get_institution_classroom_growth_metrics','get_institution_tracking_directory',
    'get_institution_student_learning_analysis','get_institution_classroom_published_program_members',
    'get_institution_classroom_followup_metrics','get_institution_student_followups',
    'resolve_institution_student_followup','open_institution_student_followup',
    'publish_institution_study_program','preview_institution_study_program_review',
    'review_institution_study_program','update_institution_study_program_draft',
    'create_institution_study_program_draft','get_institution_student_program_history',
    'get_institution_student_reports','create_institution_student_report',
    'get_my_pilot_institution','get_my_teacher_assignment','submit_teacher_assignment',
    'get_my_teacher_assignments','publish_teacher_assignment',
    'get_my_classroom_bilge_tahta_access','set_teacher_classroom_bilge_tahta',
    'get_my_classroom_exam_mode','set_teacher_classroom_exam_mode',
    'issue_teacher_classroom_invite','remove_teacher_classroom_member',
    'get_my_teacher_classroom_overview','withdraw_teacher_classroom_membership',
    'get_my_teacher_classrooms','create_teacher_classroom',
    'accept_teacher_classroom_invite','preview_teacher_classroom_invite',
    'revoke_teacher_classroom_invite','get_my_teacher_classroom_memberships'
  ];
BEGIN
  FOREACH v_name IN ARRAY v_names LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc AS p
      JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_name
    ) THEN
      RAISE EXCEPTION 'authenticated RPC allowlist function missing: %', v_name;
    END IF;

    FOR v_proc IN
      SELECT p.oid::regprocedure AS signature, p.prosrc
      FROM pg_catalog.pg_proc AS p
      JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_name
    LOOP
      IF position('auth.uid()' IN v_proc.prosrc) = 0 THEN
        RAISE EXCEPTION 'RPC lacks auth.uid actor binding: %', v_proc.signature;
      END IF;
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_proc.signature);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_proc.signature);
    END LOOP;
  END LOOP;
END;
$do$;

NOTIFY pgrst, 'reload schema';
COMMIT;
