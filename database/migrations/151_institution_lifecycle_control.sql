-- Migration 151: platform-controlled institution lifecycle changes.
-- Suspension immediately closes tenant operations because tenant RPCs accept
-- only pilot/active institutions. Archive is terminal and remains visible in
-- the immutable institution operation event stream.
BEGIN;

ALTER TABLE public.institution_operation_events
  DROP CONSTRAINT IF EXISTS institution_operation_events_event_type_check;
ALTER TABLE public.institution_operation_events
  ADD CONSTRAINT institution_operation_events_event_type_check CHECK (event_type IN (
    'institution_provisioned','institution_status_changed',
    'staff_added','staff_removed','manager_teaching_changed','manager_transferred',
    'role_created','role_updated','role_deleted','role_assignment_changed',
    'classroom_created','student_joined','student_withdrawn','student_removed',
    'invite_issued','invite_revoked','assignment_published','assignment_submitted',
    'board_access_changed','exam_mode_changed',
    'study_program_created','study_program_updated','study_program_published',
    'study_program_reviewed','student_followup_opened','student_followup_resolved',
    'student_report_created','support_access_granted','support_access_revoked'
  ));

CREATE OR REPLACE FUNCTION public.set_pilot_institution_status(
  p_user_id uuid,
  p_institution_id uuid,
  p_status text,
  p_reason text,
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
  v_institution public.pilot_institutions%ROWTYPE;
  v_reason text := btrim(p_reason);
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_institution_id IS NULL OR p_request_id IS NULL
    OR p_status IS NULL OR p_status NOT IN ('pilot', 'active', 'suspended', 'archived')
    OR v_reason IS NULL OR char_length(v_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'invalid institution lifecycle request' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution platform actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.institution_pilot_is_platform_admin(p_user_id) THEN
    RAISE EXCEPTION 'institution platform permission required' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'institution-request:' || p_user_id::text || ':set-status:' || p_request_id::text, 0
  ));
  v_hash := public.institution_pilot_payload_hash(jsonb_build_object(
    'institutionId', p_institution_id,
    'status', p_status,
    'reason', v_reason
  ));
  SELECT * INTO v_request
  FROM public.pilot_institution_requests
  WHERE user_id = p_user_id AND operation = 'set_institution_status'
    AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'institution request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'institution-lifecycle:' || p_institution_id::text, 0
  ));
  SELECT * INTO v_institution
  FROM public.pilot_institutions
  WHERE id = p_institution_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'institution not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_institution.status = 'archived' AND p_status <> 'archived' THEN
    RAISE EXCEPTION 'archived institution lifecycle is terminal' USING ERRCODE = '22023';
  END IF;

  UPDATE public.pilot_institutions
  SET status = p_status,
      archived_at = CASE WHEN p_status = 'archived' THEN COALESCE(archived_at, clock_timestamp()) ELSE NULL END
  WHERE id = p_institution_id;

  v_result := jsonb_build_object(
    'institutionId', p_institution_id,
    'previousStatus', v_institution.status,
    'status', p_status,
    'changed', v_institution.status IS DISTINCT FROM p_status,
    'replayed', false
  );
  INSERT INTO public.pilot_institution_requests(
    user_id, operation, request_id, payload_hash, result
  ) VALUES (
    p_user_id, 'set_institution_status', p_request_id, v_hash, v_result
  );
  INSERT INTO public.institution_operation_events(
    institution_id, actor_user_id, event_type, source, request_id, metadata
  ) VALUES (
    p_institution_id, p_user_id, 'institution_status_changed',
    'institution_request', p_request_id,
    jsonb_build_object(
      'previousStatus', v_institution.status,
      'status', p_status,
      'reason', v_reason,
      'changed', v_institution.status IS DISTINCT FROM p_status
    )
  ) ON CONFLICT (source, actor_user_id, event_type, request_id) DO NOTHING;

  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_pilot_institution_status(uuid,uuid,text,text,uuid)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_pilot_institution_status(uuid,uuid,text,text,uuid)
TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
