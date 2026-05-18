-- Migration 054: check_honeypot_integrity() NULL drift fix
--
-- Codex PR #157 P2 bulgusu:
--   Migration 051/052 sonrasi `v_p.total_xp <> 0` predicate'i v_p.total_xp NULL
--   ise NULL deger doner. PL/pgSQL'de IF NULL THEN BRANCH yapilmaz - branch
--   atlanir ve fonksiyon `message='OK'` ile dusen birakir.
--
--   profiles.total_xp INTEGER DEFAULT 0 ama NOT NULL kisitlamasi yok. Saldirgan
--   honeypot satirinda total_xp'yi NULL'a cevirirse drift gozden kacar.
--
-- Fix: `IS DISTINCT FROM 0` ile NULL'i FALSE degil TRUE olarak ele al.
--   NULL IS DISTINCT FROM 0 = TRUE -> drift_detected dogru calisir.
--   Symmetrically `last_played_at IS NOT NULL` kontrolu zaten NULL-safe.
--
-- Apply: DROP+CREATE gerekmiyor (return type ayni); CREATE OR REPLACE yeterli.
--   Yine de 052 patterni izleyerek DROP+CREATE ile idempotent tutuyoruz.

BEGIN;

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

  -- Drift kontrol: honeypot UI'dan oynatilmaz, total_xp 0 + last_played_at NULL olmali.
  -- `IS DISTINCT FROM 0` NULL'i da drift sayar (Codex P2): saldirgan NULL'a cevirirse
  -- standart `<>` operatorunun NULL donmesi yuzunden gozden kacmasin.
  IF v_p.total_xp IS DISTINCT FROM 0 OR v_p.last_played_at IS NOT NULL THEN
    RETURN QUERY SELECT
      true, v_p.username::text, v_p.total_xp, v_p.last_played_at,
      true, 'Honeypot DEGISMIS — saldirgan veya bug'::text;
    RETURN;
  END IF;

  -- Username drift
  IF v_p.username NOT LIKE '\_\_honeypot\_%\_\_' ESCAPE '\' THEN
    RETURN QUERY SELECT
      true, v_p.username::text, v_p.total_xp, v_p.last_played_at,
      true, 'Honeypot username degismis'::text;
    RETURN;
  END IF;

  -- Saglikli
  RETURN QUERY SELECT
    true, v_p.username::text, v_p.total_xp, v_p.last_played_at,
    false, 'OK'::text;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_honeypot_integrity() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_honeypot_integrity() TO service_role;

COMMIT;

-- Apply sonrasi dogrulama:
--   -- Normal durum (drift yok)
--   SELECT drift_detected, message FROM check_honeypot_integrity();
--   -- Beklenen: false, 'OK'
--
--   -- Simulasyon: total_xp NULL'a cevir (sadece test ortaminda!)
--   -- UPDATE profiles SET total_xp = NULL WHERE id = 'ffffffff-eeee-4ddd-cccc-000000000001';
--   -- SELECT drift_detected, message FROM check_honeypot_integrity();
--   -- Beklenen: true, 'Honeypot DEGISMIS' (eskiden NULL idi false return ediyordu)
--   -- UPDATE profiles SET total_xp = 0 WHERE id = 'ffffffff-eeee-4ddd-cccc-000000000001';
