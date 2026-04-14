-- Migration 023: Soft delete + anonymize (CASCADE yerine)
-- profiles → auth.users FK'yi CASCADE'den RESTRICT'e cevirir.
-- Kullanici silme isteginde veriyi anonymize eder, 30 gun sonra hard delete yapilabilir.

-- 1. deleted_at kolonu ekle
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at ON profiles (deleted_at) WHERE deleted_at IS NOT NULL;

-- 2. FK'yi CASCADE → RESTRICT yap
-- (Supabase dashboard'dan yanlislikla silmeyi engeller)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE RESTRICT;

-- 3. Soft delete + anonymize RPC
CREATE OR REPLACE FUNCTION soft_delete_user(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_anon_name TEXT;
BEGIN
  v_anon_name := 'silinmis_' || LEFT(p_user_id::text, 8);

  -- Profili anonymize et
  UPDATE profiles SET
    username     = v_anon_name,
    display_name = 'Silinmis Kullanici',
    avatar_url   = NULL,
    city         = NULL,
    grade        = NULL,
    deleted_at   = NOW()
  WHERE id = p_user_id AND deleted_at IS NULL;

  -- Yorumlari anonymize et
  UPDATE comments SET
    content    = '[silindi]',
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Arkadas iliskilerini kaldir
  DELETE FROM friendships WHERE user_id = p_user_id OR friend_id = p_user_id;

  -- Push subscription'lari kaldir
  DELETE FROM push_subscriptions WHERE user_id = p_user_id;
END;
$$;

-- Sadece service_role kullanabilsin
REVOKE ALL ON FUNCTION soft_delete_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION soft_delete_user(UUID) TO service_role;

-- 4. Hard delete (30 gun sonra cron ile calistirilabilir)
CREATE OR REPLACE FUNCTION hard_delete_expired_users()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
  v_user_id UUID;
BEGIN
  v_count := 0;
  FOR v_user_id IN
    SELECT id FROM profiles
    WHERE deleted_at IS NOT NULL
      AND deleted_at < NOW() - INTERVAL '30 days'
  LOOP
    -- Cocuk tablolari sil (artik CASCADE yok)
    DELETE FROM session_answers WHERE user_id = v_user_id;
    DELETE FROM game_sessions WHERE user_id = v_user_id;
    DELETE FROM xp_log WHERE user_id = v_user_id;
    DELETE FROM user_achievements WHERE user_id = v_user_id;
    DELETE FROM user_daily_quests WHERE user_id = v_user_id;
    DELETE FROM user_topic_progress WHERE user_id = v_user_id;
    DELETE FROM user_question_history WHERE user_id = v_user_id;
    DELETE FROM comments WHERE user_id = v_user_id;
    DELETE FROM comment_likes WHERE user_id = v_user_id;
    DELETE FROM question_bookmarks WHERE user_id = v_user_id;
    DELETE FROM error_reports WHERE user_id = v_user_id;
    DELETE FROM referrals WHERE referrer_id = v_user_id OR referred_id = v_user_id;
    DELETE FROM challenges WHERE challenger_id = v_user_id OR opponent_id = v_user_id;
    DELETE FROM profiles WHERE id = v_user_id;

    -- Auth user'i sil (Supabase admin API ile yapilmali, SQL'den degil)
    -- Bu satir opsiyonel: auth.users'dan silmek icin Supabase Admin API kullanin
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION hard_delete_expired_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hard_delete_expired_users() TO service_role;
