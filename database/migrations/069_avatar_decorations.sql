-- Migration 069: Avatar süsleri ekonomisi (Faz 3b) — 067 (nameplate) deseni AMA
-- ÇOKLU seçim (kullanıcı birden fazla süs takabilir → selected DİZİ).
--
-- Faz 3a'da süsler ücretsiz + localStorage (dizi) seçimdi. Faz 3b: coin ekonomisi
-- + seçim DB'de (selected_avatar_decorations text[]) → süs sıralama/profilde
-- BAŞKALARINA görünür. Sahiplik: owned_avatar_decorations text[].
--
-- Ücretsiz süs (coinCost undefined, örn. konfeti) owned gerektirmez (her zaman
-- seçilebilir); ücretliler owned'da olmalı. purchase_avatar_decoration RPC:
-- ownership + bakiye + debit + append TEK atomik UPDATE (TOCTOU-güvenli). Yalnız
-- service_role EXECUTE (authenticated p_user_id ile başkasının coinini harcatamasın).

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS owned_avatar_decorations text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS selected_avatar_decorations text[] NOT NULL DEFAULT ARRAY[]::text[];

CREATE OR REPLACE FUNCTION purchase_avatar_decoration(p_user_id uuid, p_decoration_id text, p_cost integer)
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
      owned_avatar_decorations = array_append(owned_avatar_decorations, p_decoration_id)
  WHERE id = p_user_id
    AND NOT (p_decoration_id = ANY(owned_avatar_decorations))
    AND coin_balance >= p_cost
  RETURNING coin_balance, owned_avatar_decorations;
END;
$$;

REVOKE ALL ON FUNCTION purchase_avatar_decoration(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION purchase_avatar_decoration(uuid, text, integer) FROM anon;
REVOKE ALL ON FUNCTION purchase_avatar_decoration(uuid, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION purchase_avatar_decoration(uuid, text, integer) TO service_role;

-- GUVENLIK (Codex P1 — SISTEMIK, sadece sus degil): profiles UPDATE grant'ini
-- authenticated + anon'dan cek. Mevcut profiles_update_own RLS politikasi kolon
-- KISITLAMIYOR (WITH CHECK yok) ve UPDATE grant aciksti => giris yapmis kullanici
-- PostgREST ile kendi satirinin coin_balance / total_xp / owned_* / selected_*
-- kolonlarini DOGRUDAN UPDATE edip purchase RPC'yi ve tum ekonomiyi/ilerlemeyi
-- bypass edebiliyordu (bedava coin/XP/kozmetik). TUM profil yazmalari server-side
-- service-role uzerinden yapiliyor (20 API route denetlendi; tarayici dogrudan
-- profil yazmiyor) => authenticated UPDATE'e ihtiyac yok. service_role UPDATE'i
-- (BYPASSRLS + grant) korunur, mesru yazmalar etkilenmez. Geri alinabilir (re-grant).
REVOKE UPDATE ON public.profiles FROM authenticated;
REVOKE UPDATE ON public.profiles FROM anon;

COMMIT;
