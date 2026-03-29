-- ============================================================
-- 014: Friend System (Arkadas Sistemi)
-- Kullanicilar birbirini arkadas olarak ekleyebilir.
-- ============================================================

CREATE TABLE IF NOT EXISTS friendships (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  friend_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status      VARCHAR(10) NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),

  -- Ayni kisi ciftine tek istek
  UNIQUE(user_id, friend_id),
  -- Kendine istek gonderemez
  CHECK(user_id != friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id, status);

-- RLS
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- Kendi arkadasliklarini gorebilir (gonderilen veya alinan)
DROP POLICY IF EXISTS "friendships_select" ON friendships;
CREATE POLICY "friendships_select" ON friendships
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Istek gonderebilir (sadece kendi adina)
DROP POLICY IF EXISTS "friendships_insert" ON friendships;
CREATE POLICY "friendships_insert" ON friendships
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Kabul/reddet (alici taraf) veya iptal (gonderici taraf)
DROP POLICY IF EXISTS "friendships_update" ON friendships;
CREATE POLICY "friendships_update" ON friendships
  FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Arkadasligi sil (her iki taraf da yapabilir)
DROP POLICY IF EXISTS "friendships_delete" ON friendships;
CREATE POLICY "friendships_delete" ON friendships
  FOR DELETE USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Updated_at trigger
CREATE TRIGGER trg_friendships_updated
  BEFORE UPDATE ON friendships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
