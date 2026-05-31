-- 058_purchase_frame_atomic.sql
-- TOCTOU duzeltmesi: profil cercevesi satin almayi TEK atomik islemde yapar.
--
-- Onceki akis (src/app/api/profile/frames/purchase/route.ts) 3 ayri adimdi:
--   1) read owned_frames + coin_balance
--   2) "zaten sahip mi" + "yeterli coin mi" kontrol (uygulama tarafinda)
--   3) spend_coins RPC (debit) + ayri UPDATE owned_frames = [...prev, frame]
-- Eszamanli 2 istek bu pencerede:
--   (A) ayni frame  -> her ikisi de "sahip degil" gorur -> spend_coins 2x = CIFT HARCAMA
--   (B) farkli frame -> her ikisi [X] okur -> biri [X,A] biri [X,B] yazar = ARRAY CLOBBER
--
-- Cozum: ownership-check + bakiye-kontrol + debit + append'i tek UPDATE statement'inda
-- yap. WHERE kosulu (NOT already-owned AND balance>=cost) statement'i atomik kilar;
-- 0 satir etkilenirse zaten-sahip VEYA yetersiz-bakiye demektir (route ayirt eder).
-- array_append + kolon aritmetigi tek satirda calistigi icin ek FOR UPDATE gerekmez.
--
-- NOT: 42702 (ambiguous column) tuzagindan kacinmak icin OUT kolonlari tablo
-- kolonlarindan FARKLI adlandirildi (new_balance/new_owned) ve RETURN QUERY kullanildi
-- (SELECT ... INTO degil). Yine de prod'a apply oncesi staging'de exec-test edilmeli.

CREATE OR REPLACE FUNCTION purchase_frame(p_user_id uuid, p_frame_id text, p_cost integer)
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
      owned_frames = array_append(owned_frames, p_frame_id)
  WHERE id = p_user_id
    AND NOT (p_frame_id = ANY(owned_frames))
    AND coin_balance >= p_cost
  RETURNING coin_balance, owned_frames;
END;
$$;

REVOKE ALL ON FUNCTION purchase_frame(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purchase_frame(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION purchase_frame(uuid, text, integer) TO service_role;
