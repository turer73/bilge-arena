-- Migration 159: close direct RPC paths when a bounded free canary expires.
--
-- Migration 150 intentionally made tenant RPCs callable with user JWTs. A few
-- older SECURITY DEFINER functions still checked only status='pilot|active'
-- and therefore did not inherit the operational review_due_at boundary added
-- in migration 158. Keep their established implementations, but place a
-- single fail-closed AAL2 + operational-tenant guard in front of every direct
-- path. The renamed implementations are private and cannot be invoked through
-- PostgREST.
BEGIN;

CREATE OR REPLACE FUNCTION public.institution_pilot_assert_operational_actor(
  p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_institution_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'institution actor required' USING ERRCODE = '22023';
  END IF;
  IF (auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id)
    OR NOT public.institution_rpc_actor_has_aal2(p_user_id) THEN
    RAISE EXCEPTION 'institution actor mismatch or AAL2 required'
      USING ERRCODE = '42501';
  END IF;

  v_institution_id := public.institution_pilot_active_institution(p_user_id);
  IF v_institution_id IS NULL THEN
    RAISE EXCEPTION 'operational institution membership required'
      USING ERRCODE = '42501';
  END IF;
  RETURN v_institution_id;
END;
$fn$;

DO $block$
DECLARE
  v_function record;
BEGIN
  FOR v_function IN
    SELECT * FROM (VALUES
      ('get_institution_tracking_directory(uuid)',
       'free_pilot_legacy_tracking_directory(uuid)',
       'free_pilot_legacy_tracking_directory'),
      ('get_institution_student_learning_analysis(uuid,uuid,text,text,text,timestamptz)',
       'free_pilot_legacy_learning_analysis(uuid,uuid,text,text,text,timestamptz)',
       'free_pilot_legacy_learning_analysis'),
      ('get_institution_classroom_published_program_members(uuid,uuid,timestamptz,timestamptz)',
       'free_pilot_legacy_program_members(uuid,uuid,timestamptz,timestamptz)',
       'free_pilot_legacy_program_members'),
      ('get_institution_classroom_growth_metrics(uuid,uuid,timestamptz)',
       'free_pilot_legacy_growth_metrics(uuid,uuid,timestamptz)',
       'free_pilot_legacy_growth_metrics'),
      ('get_institution_classroom_followup_metrics(uuid,uuid,timestamptz,timestamptz)',
       'free_pilot_legacy_followup_metrics(uuid,uuid,timestamptz,timestamptz)',
       'free_pilot_legacy_followup_metrics'),
      ('get_my_institution_support_access(uuid)',
       'free_pilot_legacy_support_read(uuid)',
       'free_pilot_legacy_support_read'),
      ('grant_my_institution_support_access(uuid,integer,text,uuid)',
       'free_pilot_legacy_support_grant(uuid,integer,text,uuid)',
       'free_pilot_legacy_support_grant'),
      ('publish_institution_study_program(uuid,text,uuid)',
       'free_pilot_legacy_program_publish(uuid,text,uuid)',
       'free_pilot_legacy_program_publish'),
      ('update_institution_study_program_draft(uuid,text,date,integer,jsonb,uuid)',
       'free_pilot_legacy_program_update(uuid,text,date,integer,jsonb,uuid)',
       'free_pilot_legacy_program_update'),
      ('get_my_classroom_exam_mode(uuid,uuid,uuid)',
       'free_pilot_legacy_exam_mode(uuid,uuid,uuid)',
       'free_pilot_legacy_exam_mode')
    ) AS functions(original_signature, legacy_signature, legacy_name)
  LOOP
    IF to_regprocedure('public.' || v_function.legacy_signature) IS NULL THEN
      EXECUTE format(
        'ALTER FUNCTION public.%s RENAME TO %I',
        v_function.original_signature,
        v_function.legacy_name
      );
    END IF;
  END LOOP;
END;
$block$;

CREATE OR REPLACE FUNCTION public.get_institution_tracking_directory(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  RETURN public.free_pilot_legacy_tracking_directory(p_user_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_institution_student_learning_analysis(
  p_user_id uuid,
  p_classroom_id uuid,
  p_member_ref text,
  p_game text,
  p_exam_ref text,
  p_window_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  RETURN public.free_pilot_legacy_learning_analysis(
    p_user_id, p_classroom_id, p_member_ref, p_game, p_exam_ref, p_window_end
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_institution_classroom_published_program_members(
  p_user_id uuid,
  p_classroom_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  RETURN public.free_pilot_legacy_program_members(
    p_user_id, p_classroom_id, p_window_start, p_window_end
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_institution_classroom_growth_metrics(
  p_user_id uuid,
  p_classroom_id uuid,
  p_window_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  RETURN public.free_pilot_legacy_growth_metrics(
    p_user_id, p_classroom_id, p_window_end
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_institution_classroom_followup_metrics(
  p_user_id uuid,
  p_classroom_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  RETURN public.free_pilot_legacy_followup_metrics(
    p_user_id, p_classroom_id, p_window_start, p_window_end
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_my_institution_support_access(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  RETURN public.free_pilot_legacy_support_read(p_user_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.grant_my_institution_support_access(
  p_user_id uuid,
  p_duration_minutes integer,
  p_reason text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  RETURN public.free_pilot_legacy_support_grant(
    p_user_id, p_duration_minutes, p_reason, p_request_id
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.publish_institution_study_program(
  p_user_id uuid,
  p_program_ref text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  RETURN public.free_pilot_legacy_program_publish(
    p_user_id, p_program_ref, p_request_id
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.update_institution_study_program_draft(
  p_user_id uuid,
  p_program_ref text,
  p_week_start date,
  p_daily_minute_limit integer,
  p_items jsonb,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  PERFORM public.institution_pilot_assert_operational_actor(p_user_id);
  RETURN public.free_pilot_legacy_program_update(
    p_user_id, p_program_ref, p_week_start, p_daily_minute_limit,
    p_items, p_request_id
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_my_classroom_exam_mode(
  p_user_id uuid,
  p_classroom_id uuid,
  p_institution_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_institution_id uuid;
BEGIN
  v_institution_id := public.institution_pilot_assert_operational_actor(p_user_id);
  IF v_institution_id IS DISTINCT FROM p_institution_id THEN
    RAISE EXCEPTION 'operational institution mismatch' USING ERRCODE = '42501';
  END IF;
  RETURN public.free_pilot_legacy_exam_mode(
    p_user_id, p_classroom_id, p_institution_id
  );
END;
$fn$;

-- Renamed implementations are an internal detail. Only the guarded public
-- names remain callable by JWT users and server-side route clients.
REVOKE ALL ON FUNCTION
  public.institution_pilot_assert_operational_actor(uuid),
  public.free_pilot_legacy_tracking_directory(uuid),
  public.free_pilot_legacy_learning_analysis(uuid, uuid, text, text, text, timestamptz),
  public.free_pilot_legacy_program_members(uuid, uuid, timestamptz, timestamptz),
  public.free_pilot_legacy_growth_metrics(uuid, uuid, timestamptz),
  public.free_pilot_legacy_followup_metrics(uuid, uuid, timestamptz, timestamptz),
  public.free_pilot_legacy_support_read(uuid),
  public.free_pilot_legacy_support_grant(uuid, integer, text, uuid),
  public.free_pilot_legacy_program_publish(uuid, text, uuid),
  public.free_pilot_legacy_program_update(uuid, text, date, integer, jsonb, uuid),
  public.free_pilot_legacy_exam_mode(uuid, uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.get_institution_tracking_directory(uuid),
  public.get_institution_student_learning_analysis(uuid, uuid, text, text, text, timestamptz),
  public.get_institution_classroom_published_program_members(uuid, uuid, timestamptz, timestamptz),
  public.get_institution_classroom_growth_metrics(uuid, uuid, timestamptz),
  public.get_institution_classroom_followup_metrics(uuid, uuid, timestamptz, timestamptz),
  public.get_my_institution_support_access(uuid),
  public.grant_my_institution_support_access(uuid, integer, text, uuid),
  public.publish_institution_study_program(uuid, text, uuid),
  public.update_institution_study_program_draft(uuid, text, date, integer, jsonb, uuid),
  public.get_my_classroom_exam_mode(uuid, uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.get_institution_tracking_directory(uuid),
  public.get_institution_student_learning_analysis(uuid, uuid, text, text, text, timestamptz),
  public.get_institution_classroom_published_program_members(uuid, uuid, timestamptz, timestamptz),
  public.get_institution_classroom_growth_metrics(uuid, uuid, timestamptz),
  public.get_institution_classroom_followup_metrics(uuid, uuid, timestamptz, timestamptz),
  public.get_my_institution_support_access(uuid),
  public.grant_my_institution_support_access(uuid, integer, text, uuid),
  public.publish_institution_study_program(uuid, text, uuid),
  public.update_institution_study_program_draft(uuid, text, date, integer, jsonb, uuid),
  public.get_my_classroom_exam_mode(uuid, uuid, uuid)
TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
