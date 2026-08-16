-- Migration 130: satin alma defteri.
--
-- SORUN. Odul tarafinin defteri var (reward_ledger, migration 093) ama harcama
-- tarafinin yok. Sahiplik yalnizca profiles.owned_backgrounds / owned_frames /
-- owned_nameplates / owned_cosmetic_badges / owned_avatar_decorations text[]
-- dizilerinde duruyor; dizide zaman damgasi ve fiyat yok. Sonuc:
--   * bir urunun NE ZAMAN alindigi bilinemiyor
--   * KACA alindigi bilinemiyor (fiyat sonradan degisirse iz kaybolur)
--   * "son 30 gunde kac satin alma oldu" sorusu CEVAPLANAMIYOR
--
-- Bu somut bir zarar verdi: 2026-08-15 tarihli magaza ekonomisi plani
-- "toplam satin alma 0" olcumu uzerine kuruldu, gercek 1'di. Diziyi acmadan
-- sorulan sorgu varsayilanlarla gercek alimi ayirt edememisti. Faz 4 olcumu
-- de ayni sebeple "30 gun icinde" kriterini ancak yaklasik degerlendirebilir.
--
-- COZUM. reward_ledger deseninde bir defter + bes satin alma RPC'sine ayni
-- islemde INSERT. RPC'ler data-modifying CTE ile yeniden yazildi: PostgreSQL
-- WITH icindeki INSERT'i, ana sorgu ciktisini okusa da okumasa da TAM OLARAK
-- BIR KEZ ve eksiksiz calistirir. Boylece defter kaydi satin almanin kendisiyle
-- ayni atomik islemde olur - basarisiz alim (yetersiz bakiye / zaten sahip)
-- hicbir satir yazmaz, cunku UPDATE hicbir satir dondurmez.
--
-- DURUSTLUK. Mevcut sahiplikler geriye donuk deftere gecirilir ama gercek
-- fiyat ve tarih BILINMIYOR - bu yuzden iki ayri kolon var:
--   purchased_at NULL + cost NULL  ->  geriye donuk kayit, gercegi bilinmiyor
--   recorded_at                    ->  satirin deftere yazildigi an (her zaman dolu)
-- Backfill satirlarini gercek alimlarla karistirmamak icin bu ayrim sart;
-- tek kolonla "sanki o an alinmis" gibi gorunurdu.
BEGIN;

CREATE TABLE IF NOT EXISTS public.purchase_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN (
    'background', 'frame', 'nameplate', 'cosmetic_badge', 'avatar_decoration'
  )),
  item_id text NOT NULL,
  -- NULL yalniz geriye donuk kayitlarda: gercek fiyat bilinmiyor.
  cost integer CHECK (cost IS NULL OR cost >= 0),
  -- NULL yalniz geriye donuk kayitlarda: gercek alim ani bilinmiyor.
  purchased_at timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- Ayni kullanici ayni urunu iki kez alamaz (RPC'deki sahiplik kontrolunun
  -- defter tarafindaki aynasi). Backfill'in tekrar kosulmasi da zararsiz olur.
  CONSTRAINT purchase_ledger_identity_unique UNIQUE (user_id, category, item_id)
);

CREATE INDEX IF NOT EXISTS purchase_ledger_user_recorded_idx
  ON public.purchase_ledger (user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS purchase_ledger_purchased_at_idx
  ON public.purchase_ledger (purchased_at DESC) WHERE purchased_at IS NOT NULL;

-- reward_ledger (093) ile ayni erisim modeli: kullanici kendi kaydini okur,
-- yazma yalnizca SECURITY DEFINER satin alma RPC'lerinden gecer.
ALTER TABLE public.purchase_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_ledger_self_read ON public.purchase_ledger;
CREATE POLICY purchase_ledger_self_read ON public.purchase_ledger
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.purchase_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.purchase_ledger TO authenticated;

-- ── Bes satin alma RPC'si: ayni islemde defter kaydi ──────────────────
-- Imza, donus tipi ve yetkiler DEGISMEDI; yalniz govde CTE'ye cevrildi.

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
  WITH purchased AS (
    UPDATE profiles
    SET coin_balance = coin_balance - p_cost,
        owned_backgrounds = array_append(owned_backgrounds, p_background_id)
    WHERE id = p_user_id
      AND NOT (p_background_id = ANY(owned_backgrounds))
      AND coin_balance >= p_cost
    RETURNING coin_balance, owned_backgrounds
  ), logged AS (
    INSERT INTO purchase_ledger (user_id, category, item_id, cost, purchased_at)
    SELECT p_user_id, 'background', p_background_id, p_cost, clock_timestamp()
    FROM purchased
    ON CONFLICT (user_id, category, item_id) DO NOTHING
  )
  SELECT * FROM purchased;
END;
$$;

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
  WITH purchased AS (
    UPDATE profiles
    SET coin_balance = coin_balance - p_cost,
        owned_frames = array_append(owned_frames, p_frame_id)
    WHERE id = p_user_id
      AND NOT (p_frame_id = ANY(owned_frames))
      AND coin_balance >= p_cost
    RETURNING coin_balance, owned_frames
  ), logged AS (
    INSERT INTO purchase_ledger (user_id, category, item_id, cost, purchased_at)
    SELECT p_user_id, 'frame', p_frame_id, p_cost, clock_timestamp()
    FROM purchased
    ON CONFLICT (user_id, category, item_id) DO NOTHING
  )
  SELECT * FROM purchased;
END;
$$;

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
  WITH purchased AS (
    UPDATE profiles
    SET coin_balance = coin_balance - p_cost,
        owned_nameplates = array_append(owned_nameplates, p_nameplate_id)
    WHERE id = p_user_id
      AND NOT (p_nameplate_id = ANY(owned_nameplates))
      AND coin_balance >= p_cost
    RETURNING coin_balance, owned_nameplates
  ), logged AS (
    INSERT INTO purchase_ledger (user_id, category, item_id, cost, purchased_at)
    SELECT p_user_id, 'nameplate', p_nameplate_id, p_cost, clock_timestamp()
    FROM purchased
    ON CONFLICT (user_id, category, item_id) DO NOTHING
  )
  SELECT * FROM purchased;
END;
$$;

CREATE OR REPLACE FUNCTION purchase_cosmetic_badge(p_user_id uuid, p_badge_id text, p_cost integer)
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
  WITH purchased AS (
    UPDATE profiles
    SET coin_balance = coin_balance - p_cost,
        owned_cosmetic_badges = array_append(owned_cosmetic_badges, p_badge_id)
    WHERE id = p_user_id
      AND NOT (p_badge_id = ANY(owned_cosmetic_badges))
      AND coin_balance >= p_cost
    RETURNING coin_balance, owned_cosmetic_badges
  ), logged AS (
    INSERT INTO purchase_ledger (user_id, category, item_id, cost, purchased_at)
    SELECT p_user_id, 'cosmetic_badge', p_badge_id, p_cost, clock_timestamp()
    FROM purchased
    ON CONFLICT (user_id, category, item_id) DO NOTHING
  )
  SELECT * FROM purchased;
END;
$$;

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
  WITH purchased AS (
    UPDATE profiles
    SET coin_balance = coin_balance - p_cost,
        owned_avatar_decorations = array_append(owned_avatar_decorations, p_decoration_id)
    WHERE id = p_user_id
      AND NOT (p_decoration_id = ANY(owned_avatar_decorations))
      AND coin_balance >= p_cost
    RETURNING coin_balance, owned_avatar_decorations
  ), logged AS (
    INSERT INTO purchase_ledger (user_id, category, item_id, cost, purchased_at)
    SELECT p_user_id, 'avatar_decoration', p_decoration_id, p_cost, clock_timestamp()
    FROM purchased
    ON CONFLICT (user_id, category, item_id) DO NOTHING
  )
  SELECT * FROM purchased;
END;
$$;

-- Yetkiler 058/063/067/068/069'daki haliyle korunur (CREATE OR REPLACE mevcut
-- ACL'i degistirmez, ama acikca tekrar edilmesi drift'e karsi ucuz sigorta).
REVOKE ALL ON FUNCTION purchase_background(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION purchase_frame(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION purchase_nameplate(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION purchase_cosmetic_badge(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION purchase_avatar_decoration(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION purchase_background(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION purchase_frame(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION purchase_nameplate(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION purchase_cosmetic_badge(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION purchase_avatar_decoration(uuid, text, integer) TO service_role;

-- ── Geriye donuk kayit ────────────────────────────────────────────────
-- Mevcut sahiplikler deftere gecirilir. cost ve purchased_at BILEREK NULL:
-- gercek fiyat ve tarih hicbir yerde tutulmadigi icin uydurulamaz.
-- Varsayilan (hediye) urunler alim degildir, disarida birakilir:
--   backgrounds: none, gece-mavisi   |  frames: none, mavi   |  nameplates: none
-- avatar_decorations ve cosmetic_badges varsayilani bos dizi (mig 068/069).
INSERT INTO public.purchase_ledger (user_id, category, item_id, cost, purchased_at)
SELECT p.id, 'background', item, NULL, NULL
FROM public.profiles p, unnest(p.owned_backgrounds) AS item
WHERE item NOT IN ('none', 'gece-mavisi')
ON CONFLICT (user_id, category, item_id) DO NOTHING;

INSERT INTO public.purchase_ledger (user_id, category, item_id, cost, purchased_at)
SELECT p.id, 'frame', item, NULL, NULL
FROM public.profiles p, unnest(p.owned_frames) AS item
WHERE item NOT IN ('none', 'mavi')
ON CONFLICT (user_id, category, item_id) DO NOTHING;

INSERT INTO public.purchase_ledger (user_id, category, item_id, cost, purchased_at)
SELECT p.id, 'nameplate', item, NULL, NULL
FROM public.profiles p, unnest(p.owned_nameplates) AS item
WHERE item NOT IN ('none')
ON CONFLICT (user_id, category, item_id) DO NOTHING;

INSERT INTO public.purchase_ledger (user_id, category, item_id, cost, purchased_at)
SELECT p.id, 'cosmetic_badge', item, NULL, NULL
FROM public.profiles p, unnest(p.owned_cosmetic_badges) AS item
ON CONFLICT (user_id, category, item_id) DO NOTHING;

INSERT INTO public.purchase_ledger (user_id, category, item_id, cost, purchased_at)
SELECT p.id, 'avatar_decoration', item, NULL, NULL
FROM public.profiles p, unnest(p.owned_avatar_decorations) AS item
ON CONFLICT (user_id, category, item_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;
