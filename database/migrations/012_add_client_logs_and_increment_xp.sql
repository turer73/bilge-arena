-- ============================================================
-- Migration 012: client_logs tablosu + increment_xp RPC
-- ============================================================

-- ─── 1. CLIENT_LOGS TABLOSU ────────────────────────────────
-- Frontend hata loglarini kalici olarak saklar (/api/log endpointi)

CREATE TABLE IF NOT EXISTS client_logs (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type        text NOT NULL DEFAULT 'error',
  message     text NOT NULL,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  meta        text,
  created_at  timestamptz DEFAULT now() NOT NULL
);

-- RLS: sadece service role yazabilir (API route server-side client kullanir)
ALTER TABLE client_logs ENABLE ROW LEVEL SECURITY;

-- Kimse okuyamaz (admin Supabase dashboard'dan okur)
-- INSERT sadece authenticated + service_role
CREATE POLICY "Service can insert logs"
  ON client_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Index: zamana gore sorgulama
CREATE INDEX IF NOT EXISTS idx_client_logs_created
  ON client_logs(created_at DESC);

-- Index: kullaniciya gore filtreleme
CREATE INDEX IF NOT EXISTS idx_client_logs_user
  ON client_logs(user_id)
  WHERE user_id IS NOT NULL;

-- ─── 2. INCREMENT_XP RPC ───────────────────────────────────
-- Atomik XP artirma fonksiyonu. Race condition onler.
-- Kullanim: supabase.rpc('increment_xp', { p_user_id: '...', p_amount: 50 })

CREATE OR REPLACE FUNCTION increment_xp(p_user_id uuid, p_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Negatif XP eklemeyi engelle
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'XP miktari pozitif olmali: %', p_amount;
  END IF;

  UPDATE profiles
  SET total_xp = COALESCE(total_xp, 0) + p_amount
  WHERE id = p_user_id;

  -- Kullanici bulunamadiysa hata ver
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil bulunamadi: %', p_user_id;
  END IF;
END;
$$;

-- RPC'yi sadece authenticated kullanicilar cagirabilsin
REVOKE ALL ON FUNCTION increment_xp(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_xp(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_xp(uuid, integer) TO service_role;
