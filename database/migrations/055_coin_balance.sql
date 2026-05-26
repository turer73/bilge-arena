-- ============================================================
-- Migration 055: coin_balance + increment_coins + spend_coins
-- Bilge Arena oyununda kazanılan in-game para birimi
-- ============================================================

-- ─── 1. profiles tablosuna coin_balance kolonu ───────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS coin_balance INTEGER NOT NULL DEFAULT 0;

ALTER TABLE profiles
  ADD CONSTRAINT coin_balance_non_negative
  CHECK (coin_balance >= 0);

-- ─── 2. INCREMENT_COINS RPC ──────────────────────────────────
-- Atomik coin artırma. Race condition önler.
-- Kullanım: supabase.rpc('increment_coins', { p_user_id: '...', p_amount: 5 })

CREATE OR REPLACE FUNCTION increment_coins(p_user_id uuid, p_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Coin miktari pozitif olmali: %', p_amount;
  END IF;

  UPDATE profiles
  SET coin_balance = COALESCE(coin_balance, 0) + p_amount
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil bulunamadi: %', p_user_id;
  END IF;
END;
$$;

-- Sadece service_role ve authenticated çağırabilir
REVOKE ALL ON FUNCTION increment_coins(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_coins(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_coins(uuid, integer) TO service_role;

-- ─── 3. SPEND_COINS RPC ──────────────────────────────────────
-- Atomik coin harcama. Yetersiz bakiye için EXCEPTION.

CREATE OR REPLACE FUNCTION spend_coins(p_user_id uuid, p_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Harcanacak miktar pozitif olmali: %', p_amount;
  END IF;

  SELECT coin_balance INTO v_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil bulunamadi: %', p_user_id;
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Yetersiz coin: sahip=%, gerekli=%', v_balance, p_amount;
  END IF;

  UPDATE profiles
  SET coin_balance = coin_balance - p_amount
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION spend_coins(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION spend_coins(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION spend_coins(uuid, integer) TO service_role;
