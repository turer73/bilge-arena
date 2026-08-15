-- Migration 128: kabul edilen hata raporu odulu.
--
-- Ogrenci bir soruda hata bildirir, admin raporu 'resolved' yapar ve
-- raporlayan altin kazanir. Oncesinde boyle bir akis YOKTU: admin rapor
-- ucu yalniz status/admin_note guncelliyordu.
--
-- Odul XP degil ALTIN: altin magazada harcanabiliyor, XP ise yalnizca
-- siralama/seviye besliyor. Ayrica akademik durum (mastery_outcome_evidence,
-- FSRS) XP'den bagimsiz oldugu icin odul hicbir olcumu kirletmiyor.
--
-- Odul tek RPC icinde verilir cunku altin ve odul izi ayni islemde
-- yazilmalidir; route'tan iki ayri cagri yapilsaydi biri basarisiz
-- oldugunda ogrenci odullenmis ama iz birakilmamis (ya da tersi) olurdu.
BEGIN;

-- Odul izi raporun kendisinde tutulur; ayri tablo gerekmez ve "bu rapor
-- odullendi mi" sorusu tek satirdan cevaplanir.
ALTER TABLE public.error_reports
  ADD COLUMN IF NOT EXISTS rewarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS rewarded_coins integer;

CREATE OR REPLACE FUNCTION public.award_error_report_reward(
  p_admin_id uuid,
  p_report_id uuid,
  p_coins integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_report public.error_reports%ROWTYPE;
  -- Miktar cagiran katmandan gelir (tek kaynak: src/lib/constants/rewards.ts)
  -- ama DB yine de ust sinir koyar; yanlis bir cagri hazineyi bosaltamaz.
  c_max_coins constant integer := 300;
BEGIN
  IF p_admin_id IS NULL OR p_report_id IS NULL OR p_coins IS NULL THEN
    RAISE EXCEPTION 'invalid reward request' USING ERRCODE = '22023';
  END IF;
  IF p_coins <= 0 OR p_coins > c_max_coins THEN
    RAISE EXCEPTION 'reward amount out of range' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(p_admin_id, 'admin.reports.manage') THEN
    RAISE EXCEPTION 'report permission required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_report
  FROM public.error_reports
  WHERE id = p_report_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'report not found' USING ERRCODE = 'P0002';
  END IF;

  -- Yalniz kabul edilen rapor odullendirilir; reddedilen veya bekleyen
  -- rapor odul uretmez.
  IF v_report.status <> 'resolved' THEN
    RAISE EXCEPTION 'report is not resolved' USING ERRCODE = 'P0003';
  END IF;

  -- Idempotency: ayni rapor ikinci kez odullendirilemez. Admin raporu
  -- resolved'dan cikarip geri getirse bile ikinci odul gitmez.
  IF v_report.rewarded_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'reportId', v_report.id,
      'awarded', false,
      'replayed', true,
      'coins', COALESCE(v_report.rewarded_coins, 0)
    );
  END IF;

  -- Anonim/silinmis raporlayanda odul verilecek hesap yoktur; admin de
  -- kendi raporunu odullendiremez.
  IF v_report.user_id IS NULL OR v_report.user_id = p_admin_id THEN
    RETURN jsonb_build_object(
      'reportId', v_report.id, 'awarded', false, 'replayed', false, 'coins', 0
    );
  END IF;

  PERFORM public.increment_coins(v_report.user_id, p_coins);

  UPDATE public.error_reports
  SET rewarded_at = now(), rewarded_coins = p_coins
  WHERE id = v_report.id;

  RETURN jsonb_build_object(
    'reportId', v_report.id,
    'awarded', true,
    'replayed', false,
    'coins', p_coins
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.award_error_report_reward(uuid, uuid, integer)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.award_error_report_reward(uuid, uuid, integer)
TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
