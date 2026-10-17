-- 2026-10-17: derin inceleme (2026-10-15) 4.1 - kurum personeli e-posta
-- numaralandirmasi.
--
-- add_my_institution_teacher_by_email her ret nedenini ayri kodla donduruyordu:
-- e-posta yoksa P0002, kisi baska kurumdaysa 23505, baska kurumda sinifi varsa
-- 23514, personel siniri doluysa P0003. Sinir yalniz e-posta bulunduktan sonra
-- kontrol edildigi icin dolu bir kurumda yonetici, kimseyi eklemeden bir
-- e-postanin kayitli olup olmadigini ogrenebiliyordu. Fonksiyon authenticated'a
-- acik oldugundan route'taki hiz siniri de dogrudan PostgREST ile atlanabiliyor.
--
-- Simdi:
-- * Sinir, e-postaya bakilmadan once kontrol edilir: dolu kurumda her e-posta
--   ayni P0003'u alir.
-- * "Hesap yok", "baska kurumda" ve "baska kurumda sinifi var" ayni P0002 ve
--   ayni mesajla doner.
-- * Daha once islenmis bir request_id sinir on kontrolune takilmaz; kurumu
--   dolduran istegin tekrari replay sonucunu almaya devam eder.
--
-- Kalan (urun karari, bu migration'da degil): basari yaniti hesabin var
-- oldugunu hala gosterir ve kisi rizasi olmadan ogretmen yapilir. Davet ve
-- kabul akisi ile kisinin kendi istegiyle ayrilmasi ayri is.

BEGIN;

CREATE OR REPLACE FUNCTION public.add_my_institution_teacher_by_email(
  p_user_id uuid,
  p_teacher_email text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_email text := lower(btrim(p_teacher_email));
  v_institution_id uuid;
  v_staff_limit integer;
  v_teacher_user_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR v_email IS NULL
    OR char_length(v_email) NOT BETWEEN 3 AND 254
    OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'invalid institution teacher email request' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'institution teacher actor mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT membership.institution_id, institution.staff_limit
    INTO v_institution_id, v_staff_limit
  FROM public.pilot_institution_memberships AS membership
  JOIN public.pilot_institutions AS institution
    ON institution.id = membership.institution_id
    AND institution.status IN ('pilot', 'active')
  JOIN public.profiles AS profile
    ON profile.id = membership.user_id AND profile.deleted_at IS NULL
  WHERE membership.user_id = p_user_id
    AND membership.status = 'active'
    AND membership.role = 'manager';
  IF NOT FOUND OR NOT public.institution_member_has_permission(
    p_user_id, v_institution_id, 'institution.staff.manage'
  ) THEN
    RAISE EXCEPTION 'institution staff manager required' USING ERRCODE = '42501';
  END IF;

  -- Sinir e-postadan bagimsizdir; e-postaya bakmadan once soylenir. Islenmis
  -- bir istegin tekrari bu kontrolu atlar, sonucu asagidaki cagri dondurur.
  IF NOT EXISTS (
    SELECT 1 FROM public.pilot_institution_requests AS request
    WHERE request.user_id = p_user_id
      AND request.operation = 'add_teacher'
      AND request.request_id = p_request_id
  ) AND (
    SELECT count(*) FROM public.pilot_institution_memberships AS staff
    WHERE staff.institution_id = v_institution_id AND staff.status = 'active'
  ) >= v_staff_limit THEN
    RAISE EXCEPTION 'institution staff capacity reached' USING ERRCODE = 'P0003';
  END IF;

  SELECT auth_user.id INTO v_teacher_user_id
  FROM auth.users AS auth_user
  JOIN public.profiles AS profile
    ON profile.id = auth_user.id AND profile.deleted_at IS NULL
  WHERE lower(auth_user.email) = v_email
    AND auth_user.email_confirmed_at IS NOT NULL
    AND auth_user.deleted_at IS NULL
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'institution teacher cannot be added' USING ERRCODE = 'P0002';
  END IF;

  BEGIN
    RETURN public.add_pilot_institution_teacher(
      p_user_id,
      v_institution_id,
      v_teacher_user_id,
      p_request_id
    );
  EXCEPTION
    -- Kisi baska bir kurumda ya da baska kurumda sinifi var: hesabin var
    -- olmadigi durumla ayni yanit.
    WHEN unique_violation OR check_violation THEN
      RAISE EXCEPTION 'institution teacher cannot be added' USING ERRCODE = 'P0002';
  END;
END;
$fn$;

REVOKE ALL ON FUNCTION public.add_my_institution_teacher_by_email(uuid, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_my_institution_teacher_by_email(uuid, text, uuid)
  TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
