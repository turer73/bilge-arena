-- Migration 152: bounded retention for request/idempotency ledgers.
-- The immutable institution operation event stream is intentionally separate
-- and is not deleted here. A cutoff newer than 30 days is rejected.
BEGIN;

CREATE INDEX IF NOT EXISTS pilot_institution_requests_retention
  ON public.pilot_institution_requests (created_at);
CREATE INDEX IF NOT EXISTS teacher_classroom_requests_retention
  ON public.teacher_classroom_requests (created_at);

CREATE OR REPLACE FUNCTION public.prune_institution_request_ledgers(
  p_cutoff timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_pilot_count integer;
  v_classroom_count integer;
BEGIN
  IF p_cutoff IS NULL
    OR p_cutoff > clock_timestamp() - interval '30 days'
    OR p_cutoff < clock_timestamp() - interval '2 years' THEN
    RAISE EXCEPTION 'institution request ledger cutoff outside safe bounds'
      USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'institution request ledger maintenance requires service role'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('institution-request-ledger-retention', 0));
  DELETE FROM public.pilot_institution_requests WHERE created_at < p_cutoff;
  GET DIAGNOSTICS v_pilot_count = ROW_COUNT;
  DELETE FROM public.teacher_classroom_requests WHERE created_at < p_cutoff;
  GET DIAGNOSTICS v_classroom_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'cutoff', p_cutoff,
    'pilotInstitutionRequestsDeleted', v_pilot_count,
    'teacherClassroomRequestsDeleted', v_classroom_count
  );
END;
$fn$;

-- Migration 136 created this trigger-only SECURITY DEFINER function without
-- removing PostgreSQL's default PUBLIC EXECUTE privilege.
REVOKE ALL ON FUNCTION public.tg_require_question_validation_decision()
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.prune_institution_request_ledgers(timestamptz)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_institution_request_ledgers(timestamptz)
TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
