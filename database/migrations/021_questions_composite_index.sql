-- Migration 021: questions tablosuna composite index
-- fetchQuizQuestions: WHERE game = ? AND is_active = true AND category = ? AND difficulty = ?
-- Bu sorgu her quiz basinda calisir, full table scan yerine index scan kullanmali.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_questions_game_active_cat_diff
  ON questions (game, is_active, category, difficulty);

-- Duello soru secimi: WHERE game = ? AND is_active = true (category opsiyonel)
-- Yukaridaki composite index bunu da kapsar (leftmost prefix).
