-- Migration 127: sinif bazli sinav modu.
--
-- Sinav modu, ogretmenin sinifin tamami icin gecici olarak butun AI
-- yardimcilarini kapatmasidir (Bilge Tahta, Bilge Can kocu, Bilge Asistan).
-- Tekil ogrenci kapatmasi bilerek yoktur: sinav sinifin tamamini kapsar.
--
-- Durum ayri bir boolean ile degil, `exam_mode_expires_at` ile tutulur.
-- "Aktif" demek `exam_mode_expires_at > now()` demektir. Boylece otomatik
-- sure sonu veritabani seviyesinde saglanir; ogretmen kapatmayi unutursa
-- sinif suresiz yardimcisiz kalmaz ve temizlik cron'u gerekmez.
--
-- Politika okumasi EKRAN bazli degil KIMLIK bazlidir: ogrencinin aktif
-- uyeligi bulunan herhangi bir sinifta sinav modu aciksa yardimcilar
-- platformun her yerinde kapanir. Aksi halde ogrenci ikinci sekmede serbest
-- oyuna gecip yardimcilari kullanabilirdi.
BEGIN;

ALTER TABLE public.teacher_classrooms
  ADD COLUMN IF NOT EXISTS exam_mode_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS exam_mode_started_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Aktif sinav modundaki siniflari ararken kismi indeks yeterli; kapali
-- siniflar indekse girmez.
CREATE INDEX IF NOT EXISTS teacher_classrooms_exam_mode_idx
  ON public.teacher_classrooms (exam_mode_expires_at)
  WHERE exam_mode_expires_at IS NOT NULL;

-- Ogrencinin gordugu yardimci politikasi. Fail-closed davranis cagiran
-- katmanin sorumlulugundadir: bu fonksiyon hata verirse istemci yardimcilari
-- kapali saymalidir.
CREATE OR REPLACE FUNCTION public.get_my_assistance_policy(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_until timestamptz;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user required' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'assistance actor mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT max(classroom.exam_mode_expires_at) INTO v_until
  FROM public.teacher_classroom_memberships AS membership
  JOIN public.teacher_classrooms AS classroom
    ON classroom.id = membership.classroom_id
  JOIN public.profiles AS profile
    ON profile.id = membership.student_id
  WHERE membership.student_id = p_user_id
    AND membership.status = 'active'
    AND classroom.status = 'active'
    AND profile.deleted_at IS NULL
    AND classroom.exam_mode_expires_at IS NOT NULL
    AND classroom.exam_mode_expires_at > now();

  RETURN jsonb_build_object(
    'examMode', v_until IS NOT NULL,
    'board', v_until IS NULL,
    'coach', v_until IS NULL,
    'assistant', v_until IS NULL,
    'until', v_until
  );
END;
$fn$;

-- Ogretmenin kendi sinifinin sinav modu durumunu okumasi. Ogretmen paneli
-- sayfa yenilendiginde acik pencereyi ve kalan sureyi gosterebilsin diye
-- gerekli; yazma ucunun donusu tek basina yeterli degildir.
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
  v_classroom public.teacher_classrooms%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_institution_id IS NULL THEN
    RAISE EXCEPTION 'user and classroom required' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'classroom actor mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_classroom
  FROM public.teacher_classrooms
  WHERE id = p_classroom_id
    AND teacher_id = p_user_id
    AND institution_id = p_institution_id
    AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'classroom not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'classroomId', v_classroom.id,
    'examMode', v_classroom.exam_mode_expires_at IS NOT NULL
      AND v_classroom.exam_mode_expires_at > now(),
    'until', CASE
      WHEN v_classroom.exam_mode_expires_at > now() THEN v_classroom.exam_mode_expires_at
      ELSE NULL
    END
  );
END;
$fn$;

-- Ogretmenin sinif icin sinav modunu acip kapatmasi. Migration 113'teki
-- set_teacher_classroom_bilge_tahta ile ayni idempotency ve yetki kalibi.
CREATE OR REPLACE FUNCTION public.set_teacher_classroom_exam_mode(
  p_user_id uuid,
  p_classroom_id uuid,
  p_institution_id uuid,
  p_enabled boolean,
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
  v_result jsonb;
  v_institution_id uuid;
  v_until timestamptz;
  -- Ogretmen kapatmayi unutursa sinif en fazla bu kadar kilitli kalir.
  c_max_window constant interval := interval '4 hours';
BEGIN
  IF p_user_id IS NULL OR p_classroom_id IS NULL OR p_institution_id IS NULL
    OR p_enabled IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'invalid exam mode setting' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'classroom actor mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.teacher_classroom_is_teacher(p_user_id) THEN
    RAISE EXCEPTION 'teacher permission required' USING ERRCODE = '42501';
  END IF;
  v_institution_id := public.institution_pilot_active_institution(p_user_id);
  IF v_institution_id IS NULL OR v_institution_id <> p_institution_id THEN
    RAISE EXCEPTION 'institution membership required' USING ERRCODE = '42501';
  END IF;

  v_hash := public.teacher_classroom_payload_hash(jsonb_build_object(
    'classroomId', p_classroom_id,
    'institutionId', p_institution_id,
    'enabled', p_enabled
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'teacher-request:' || p_user_id::text || ':exam-mode:' || p_request_id::text, 0
  ));
  SELECT * INTO v_request
  FROM public.teacher_classroom_requests
  WHERE user_id = p_user_id
    AND operation = 'set_exam_mode'
    AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_request.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'exam mode request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_request.result || jsonb_build_object('replayed', true);
  END IF;

  SELECT * INTO v_classroom
  FROM public.teacher_classrooms
  WHERE id = p_classroom_id
    AND teacher_id = p_user_id
    AND institution_id = v_institution_id
    AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'classroom not found' USING ERRCODE = 'P0002';
  END IF;

  -- Kapatma aninda sure now()'a cekilir; boylece okuma tarafindaki
  -- `> now()` kosulu tek kural olarak kalir.
  v_until := CASE WHEN p_enabled THEN now() + c_max_window ELSE now() END;

  UPDATE public.teacher_classrooms
  SET exam_mode_expires_at = v_until,
      exam_mode_started_by = CASE WHEN p_enabled THEN p_user_id ELSE NULL END
  WHERE id = v_classroom.id;

  v_result := jsonb_build_object(
    'classroomId', v_classroom.id,
    'examMode', p_enabled,
    'until', CASE WHEN p_enabled THEN v_until ELSE NULL END,
    'replayed', false
  );
  INSERT INTO public.teacher_classroom_requests(user_id, operation, request_id, payload_hash, result)
  VALUES (p_user_id, 'set_exam_mode', p_request_id, v_hash, v_result);
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION
  public.get_my_assistance_policy(uuid),
  public.get_my_classroom_exam_mode(uuid, uuid, uuid),
  public.set_teacher_classroom_exam_mode(uuid, uuid, uuid, boolean, uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.get_my_assistance_policy(uuid),
  public.get_my_classroom_exam_mode(uuid, uuid, uuid),
  public.set_teacher_classroom_exam_mode(uuid, uuid, uuid, boolean, uuid)
TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
