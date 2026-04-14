-- Migration 024: Eksik indexler
-- Sik sorgulanan ama index'siz alanlar.

-- Referral kod aramasi (POST /api/referral)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_referral_code
  ON profiles (referral_code) WHERE referral_code IS NOT NULL;

-- Arkadas sorgulamasi (GET/POST /api/friends)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_friendships_user_status
  ON friendships (user_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_friendships_friend_status
  ON friendships (friend_id, status);

-- Duello sorgulamasi (GET /api/challenges)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_challenges_challenger
  ON challenges (challenger_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_challenges_opponent
  ON challenges (opponent_id, status);

-- Soft-deleted profilleri filtreleme
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_active
  ON profiles (total_xp DESC) WHERE deleted_at IS NULL;
