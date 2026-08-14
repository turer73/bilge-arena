-- Migration 124: immutable, identifier-minimal student status report snapshots.
BEGIN;

CREATE TABLE IF NOT EXISTS public.institution_student_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_ref text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(16),'hex')
    CHECK (report_ref ~ '^[0-9a-f]{32}$'),
  institution_id uuid NOT NULL REFERENCES public.pilot_institutions(id) ON DELETE RESTRICT,
  classroom_id uuid NOT NULL REFERENCES public.teacher_classrooms(id) ON DELETE RESTRICT,
  membership_id uuid NOT NULL REFERENCES public.teacher_classroom_memberships(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  model_version text NOT NULL CHECK (model_version='institution-student-report-v1'),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL CHECK (period_end>period_start),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (membership_id,student_id,classroom_id)
    REFERENCES public.teacher_classroom_memberships(id,student_id,classroom_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS institution_student_reports_member_created
  ON public.institution_student_reports(membership_id,created_at DESC);
ALTER TABLE public.institution_student_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.institution_student_reports FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.create_institution_student_report(
  p_user_id uuid,p_classroom_id uuid,p_member_ref text,p_snapshot jsonb,p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE
  v_classroom public.teacher_classrooms%ROWTYPE;
  v_membership public.teacher_classroom_memberships%ROWTYPE;
  v_report public.institution_student_reports%ROWTYPE;
  v_request public.pilot_institution_requests%ROWTYPE;
  v_hash text;v_result jsonb;v_period_start timestamptz;v_period_end timestamptz;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_request_id IS NULL
    OR p_member_ref IS NULL OR p_member_ref!~'^[0-9a-f]{32}$'
    OR p_snapshot IS NULL OR jsonb_typeof(p_snapshot)<>'object'
    OR pg_column_size(p_snapshot)>100000
    OR p_snapshot->>'modelVersion' IS DISTINCT FROM 'institution-student-report-v1'
    OR NOT (p_snapshot?&ARRAY['generatedAt','periodStart','periodEnd','institutionName','classroomName','teacherAlias','studentAlias','scope','summary','outcomes'])
    OR p_snapshot::text ~ '"(studentId|userId|memberRef|email|phone|note|followupRef|programRef)"[[:space:]]*:' THEN
    RAISE EXCEPTION 'invalid institution student report snapshot' USING ERRCODE='22023'; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution report actor mismatch' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_classroom FROM public.teacher_classrooms
    WHERE id=p_classroom_id AND teacher_id=p_user_id AND status='active';
  IF NOT FOUND OR NOT public.institution_pilot_has_role(
    p_user_id,v_classroom.institution_id,ARRAY['manager','teacher']::text[]
  ) THEN RAISE EXCEPTION 'assigned institution teacher required' USING ERRCODE='42501'; END IF;
  SELECT membership.* INTO v_membership FROM public.teacher_classroom_memberships AS membership
  JOIN public.profiles AS profile ON profile.id=membership.student_id AND profile.deleted_at IS NULL
  WHERE membership.classroom_id=p_classroom_id AND membership.member_ref=p_member_ref AND membership.status='active';
  IF NOT FOUND OR public.teacher_classroom_is_blocked(p_user_id,v_membership.student_id) THEN
    RAISE EXCEPTION 'active classroom member not found' USING ERRCODE='P0002'; END IF;
  IF p_snapshot->>'classroomName' IS DISTINCT FROM v_classroom.name
    OR p_snapshot->>'studentAlias' IS DISTINCT FROM public.teacher_classroom_safe_alias(v_membership.student_id)
    OR p_snapshot->>'teacherAlias' IS DISTINCT FROM public.teacher_classroom_safe_alias(p_user_id) THEN
    RAISE EXCEPTION 'institution report identity mismatch' USING ERRCODE='22023'; END IF;
  BEGIN
    v_period_start:=(p_snapshot->>'periodStart')::timestamptz;
    v_period_end:=(p_snapshot->>'periodEnd')::timestamptz;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'invalid institution report period' USING ERRCODE='22023';
  END;
  IF v_period_end<=v_period_start OR v_period_end>clock_timestamp()+interval '5 minutes' THEN
    RAISE EXCEPTION 'invalid institution report period' USING ERRCODE='22023'; END IF;

  v_hash:=public.institution_pilot_payload_hash(jsonb_build_object(
    'classroomId',p_classroom_id,'memberRef',p_member_ref,'snapshot',p_snapshot));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text||':student-report:'||p_request_id::text,0));
  SELECT * INTO v_request FROM public.pilot_institution_requests
    WHERE user_id=p_user_id AND operation='create_student_report' AND request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash<>v_hash THEN RAISE EXCEPTION 'student report payload mismatch' USING ERRCODE='22023'; END IF;
    RETURN v_request.result||jsonb_build_object('replayed',true); END IF;
  INSERT INTO public.institution_student_reports(
    institution_id,classroom_id,membership_id,student_id,teacher_id,model_version,period_start,period_end,snapshot
  ) VALUES (
    v_classroom.institution_id,p_classroom_id,v_membership.id,v_membership.student_id,p_user_id,
    'institution-student-report-v1',v_period_start,v_period_end,p_snapshot
  ) RETURNING * INTO v_report;
  v_result:=jsonb_build_object('reportRef',v_report.report_ref,'snapshot',v_report.snapshot,'createdAt',v_report.created_at,'replayed',false);
  INSERT INTO public.pilot_institution_requests(user_id,operation,request_id,payload_hash,result)
    VALUES(p_user_id,'create_student_report',p_request_id,v_hash,v_result);
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_institution_student_reports(
  p_user_id uuid,p_classroom_id uuid,p_member_ref text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE v_classroom public.teacher_classrooms%ROWTYPE;v_membership public.teacher_classroom_memberships%ROWTYPE;v_reports jsonb;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_member_ref IS NULL OR p_member_ref!~'^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'invalid institution report scope' USING ERRCODE='22023'; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'institution report actor mismatch' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_classroom FROM public.teacher_classrooms WHERE id=p_classroom_id AND teacher_id=p_user_id AND status='active';
  IF NOT FOUND OR NOT public.institution_pilot_has_role(p_user_id,v_classroom.institution_id,ARRAY['manager','teacher']::text[]) THEN
    RAISE EXCEPTION 'assigned institution teacher required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_membership FROM public.teacher_classroom_memberships
    WHERE classroom_id=p_classroom_id AND member_ref=p_member_ref AND status='active';
  IF NOT FOUND OR public.teacher_classroom_is_blocked(p_user_id,v_membership.student_id) THEN RAISE EXCEPTION 'active classroom member not found' USING ERRCODE='P0002'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('reportRef',report.report_ref,'snapshot',report.snapshot,'createdAt',report.created_at)
    ORDER BY report.created_at DESC),'[]'::jsonb) INTO v_reports
  FROM (SELECT * FROM public.institution_student_reports WHERE institution_id=v_classroom.institution_id
    AND classroom_id=p_classroom_id AND membership_id=v_membership.id AND student_id=v_membership.student_id
    AND teacher_id=p_user_id ORDER BY created_at DESC LIMIT 10) AS report;
  RETURN jsonb_build_object('reports',v_reports);
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_institution_student_report(uuid,uuid,text,jsonb,uuid),
  public.get_institution_student_reports(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_institution_student_report(uuid,uuid,text,jsonb,uuid),
  public.get_institution_student_reports(uuid,uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
