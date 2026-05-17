-- Migration 052: check_honeypot_integrity() hotfix
--
-- 051 prod'a apply edildikten sonra `SELECT * FROM check_honeypot_integrity()`
-- iki runtime hatasi verdi:
--   1) 42702 — OUT param `last_played_at` ile profiles.last_played_at column
--      ambiguous (PL/pgSQL ad cakismasi). Output adi `honeypot_last_played_at`
--      olarak rename + SELECT'lere `p.` alias.
--   2) 42804 — `profiles.username` varchar(32) returning text bekleyen OUT
--      param ile uyusmuyor. `v_p.username::text` cast.
--
-- 051 dosyasi geriye dogru fix'lendi (fresh-install icin dogru tanim). Bu
-- migration prod-side cleanup: OUT param adi degistigi icin CREATE OR REPLACE
-- yetmez (42P13 row type defined by OUT parameters is different), DROP +
-- CREATE gerek.

DROP FUNCTION IF EXISTS public.check_honeypot_integrity();

CREATE FUNCTION public.check_honeypot_integrity()
RETURNS TABLE (
  honeypot_exists boolean,
  honeypot_username text,
  honeypot_xp integer,
  honeypot_last_played_at timestamptz,
  drift_detected boolean,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := 'ffffffff-eeee-4ddd-cccc-000000000001';
  v_p record;
BEGIN
  SELECT p.id, p.username, p.total_xp, p.last_played_at
    INTO v_p
  FROM public.profiles p
  WHERE p.id = v_id;

  IF v_p IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, NULL::integer, NULL::timestamptz, true, 'Honeypot SILINMIS — saldiri belirtisi'::text;
    RETURN;
  END IF;

  IF v_p.total_xp <> 0 OR v_p.last_played_at IS NOT NULL THEN
    RETURN QUERY SELECT
      true, v_p.username::text, v_p.total_xp, v_p.last_played_at,
      true, 'Honeypot DEGISMIS — saldirgan veya bug'::text;
    RETURN;
  END IF;

  IF v_p.username NOT LIKE '\_\_honeypot\_%\_\_' ESCAPE '\' THEN
    RETURN QUERY SELECT
      true, v_p.username::text, v_p.total_xp, v_p.last_played_at,
      true, 'Honeypot username degismis'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    true, v_p.username::text, v_p.total_xp, v_p.last_played_at,
    false, 'OK'::text;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_honeypot_integrity() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_honeypot_integrity() TO service_role;

-- Apply sonrasi dogrulama (zaten prod'da kosuldu):
--   SELECT * FROM check_honeypot_integrity();
--   -- 1 satir: honeypot_exists=true, drift_detected=false, message='OK'
