-- Migration 067: Profil isim paneli (Nameplate) — Faz-2 kozmetik genişleme
--
-- Discord'un en yüksek-görünürlük kozmetiği. 063 (backgrounds) deseninin aynası
-- AMA kritik fark: SEÇİM DB'de tutulur (selected_nameplate), localStorage'da DEĞİL.
-- Çünkü nameplate sıralama/düelloda BAŞKALARINA görünür → seçimin sunucuda olması
-- hem sosyal görünürlük hem bypass-güvenlik sağlar.
--
-- Sahiplik: profiles.owned_nameplates text[] (frames/backgrounds gibi).
-- purchase_nameplate RPC: ownership + bakiye + debit + append TEK atomik UPDATE
-- (058/063 dersi: TOCTOU çift-harcama / array-clobber'a kapalı).
-- GÜVENLİK: yalnız service_role EXECUTE (059/060 dersi — authenticated p_user_id
-- ile başkasının coinini harcatabilir; API server-side auth'tan sonra çağırır).

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS owned_nameplates text[] NOT NULL DEFAULT ARRAY['none']::text[],
  ADD COLUMN IF NOT EXISTS selected_nameplate text NOT NULL DEFAULT 'none';

CREATE OR REPLACE FUNCTION purchase_nameplate(p_user_id uuid, p_nameplate_id text, p_cost integer)
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
      owned_nameplates = array_append(owned_nameplates, p_nameplate_id)
  WHERE id = p_user_id
    AND NOT (p_nameplate_id = ANY(owned_nameplates))
    AND coin_balance >= p_cost
  RETURNING coin_balance, owned_nameplates;
END;
$$;

REVOKE ALL ON FUNCTION purchase_nameplate(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION purchase_nameplate(uuid, text, integer) FROM anon;
REVOKE ALL ON FUNCTION purchase_nameplate(uuid, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION purchase_nameplate(uuid, text, integer) TO service_role;

COMMIT;
