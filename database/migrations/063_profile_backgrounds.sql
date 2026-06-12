-- Migration 063: Profil arka plani magazasi (Faz-1)
--
-- owned_frames/purchase_frame (057/058) deseninin birebir aynasi:
--   * profiles.owned_backgrounds text[] — sahip olunan arka plan id'leri
--   * purchase_background RPC — ownership + bakiye + debit + append TEK
--     atomik UPDATE (TOCTOU cift-harcama / array-clobber'a kapali, 058 dersi)
--   * Secili arka plan DB'de TUTULMAZ (frame deseniyle ayni: localStorage)
--
-- OUT kolon adlari tablo kolonlarindan farkli (42702 ambiguous guard).

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS owned_backgrounds TEXT[] NOT NULL DEFAULT ARRAY['none', 'gece-mavisi']::TEXT[];

CREATE OR REPLACE FUNCTION purchase_background(p_user_id uuid, p_background_id text, p_cost integer)
RETURNS TABLE (new_balance integer, new_owned text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_cost < 0 THEN
    RAISE EXCEPTION 'Gecersiz fiyat: %', p_cost;
  END IF;

  RETURN QUERY
  UPDATE profiles
  SET coin_balance = coin_balance - p_cost,
      owned_backgrounds = array_append(owned_backgrounds, p_background_id)
  WHERE id = p_user_id
    AND NOT (p_background_id = ANY(owned_backgrounds))
    AND coin_balance >= p_cost
  RETURNING coin_balance, owned_backgrounds;
END;
$$;

-- p_user_id parametreli SECURITY DEFINER: authenticated dogrudan cagirirsa
-- BASKASININ coinini harcatabilir (purchase_frame 059/060 dersi) —
-- YALNIZCA service_role (API server-side auth'tan sonra cagirir).
REVOKE ALL ON FUNCTION purchase_background(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION purchase_background(uuid, text, integer) FROM anon;
REVOKE ALL ON FUNCTION purchase_background(uuid, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION purchase_background(uuid, text, integer) TO service_role;

COMMIT;
