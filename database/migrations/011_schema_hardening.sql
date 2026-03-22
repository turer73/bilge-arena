-- ============================================================
-- Migration 011: Schema Hardening
-- CHECK constraints, CASCADE fixes, composite indexes, GIN index
-- ============================================================

-- ─── 1. CHECK CONSTRAINTS ────────────────────────────────

-- session_answers: selected_option 0-4 arasi olmali
ALTER TABLE session_answers
  ADD CONSTRAINT chk_selected_option CHECK (selected_option BETWEEN 0 AND 4);

-- session_answers: xp_earned negatif olamaz
ALTER TABLE session_answers
  ADD CONSTRAINT chk_answer_xp_nonneg CHECK (xp_earned >= 0);

-- game_sessions: XP alanları negatif olamaz
ALTER TABLE game_sessions
  ADD CONSTRAINT chk_session_base_xp CHECK (base_xp >= 0),
  ADD CONSTRAINT chk_session_bonus_xp CHECK (bonus_xp >= 0),
  ADD CONSTRAINT chk_session_total_xp CHECK (total_xp >= 0);

-- game_sessions: sayac alanlari negatif olamaz
ALTER TABLE game_sessions
  ADD CONSTRAINT chk_session_correct CHECK (correct_count >= 0),
  ADD CONSTRAINT chk_session_wrong CHECK (wrong_count >= 0),
  ADD CONSTRAINT chk_session_skipped CHECK (skipped_count >= 0);

-- leaderboard_weekly: week_start <= week_end
ALTER TABLE leaderboard_weekly
  ADD CONSTRAINT chk_week_order CHECK (week_start <= week_end);

-- profiles: streak negatif olamaz
ALTER TABLE profiles
  ADD CONSTRAINT chk_streak_nonneg CHECK (current_streak >= 0),
  ADD CONSTRAINT chk_longest_streak_nonneg CHECK (longest_streak >= 0);

-- profiles: istatistikler negatif olamaz
ALTER TABLE profiles
  ADD CONSTRAINT chk_total_questions_nonneg CHECK (total_questions >= 0),
  ADD CONSTRAINT chk_correct_answers_nonneg CHECK (correct_answers >= 0),
  ADD CONSTRAINT chk_total_sessions_nonneg CHECK (total_sessions >= 0);

-- questions: times_answered >= times_correct
ALTER TABLE questions
  ADD CONSTRAINT chk_correct_lte_answered CHECK (times_correct <= times_answered);

-- user_topic_progress: correct <= questions_seen
ALTER TABLE user_topic_progress
  ADD CONSTRAINT chk_topic_correct_lte_seen CHECK (correct <= questions_seen);

-- ─── 2. CASCADE FIXES ────────────────────────────────────

-- session_answers.question_id: silinen soru → orphan cevaplar kalmaz
ALTER TABLE session_answers
  DROP CONSTRAINT IF EXISTS session_answers_question_id_fkey,
  ADD CONSTRAINT session_answers_question_id_fkey
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE;

-- user_badges.badge_id: silinen rozet → user_badges de silinir
ALTER TABLE user_badges
  DROP CONSTRAINT IF EXISTS user_badges_badge_id_fkey,
  ADD CONSTRAINT user_badges_badge_id_fkey
    FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE;

-- user_question_history.question_id: silinen soru → gecmis de silinir
ALTER TABLE user_question_history
  DROP CONSTRAINT IF EXISTS user_question_history_question_id_fkey,
  ADD CONSTRAINT user_question_history_question_id_fkey
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE;

-- ─── 3. COMPOSITE INDEXES ────────────────────────────────

-- Kullanicinin oyun bazli oturumlari (profil sayfasi)
CREATE INDEX IF NOT EXISTS idx_sessions_user_game
  ON game_sessions(user_id, game);

-- Kullanicinin tamamlanmis oturumlari (istatistik sorgulari)
CREATE INDEX IF NOT EXISTS idx_sessions_user_completed
  ON game_sessions(user_id, completed_at DESC)
  WHERE status = 'completed';

-- Liderboard: kullanici + hafta composite
CREATE INDEX IF NOT EXISTS idx_lb_user_week
  ON leaderboard_weekly(user_id, week_start);

-- session_answers: user + correct (dogruluk istatistikleri)
CREATE INDEX IF NOT EXISTS idx_answers_user_correct
  ON session_answers(user_id, is_correct)
  WHERE is_correct = TRUE;

-- Premium kullanicilar (premium ozellik sorgulari)
CREATE INDEX IF NOT EXISTS idx_profiles_premium
  ON profiles(is_premium)
  WHERE is_premium = TRUE;

-- ─── 4. GIN INDEX — JSONB soru icerigi ───────────────────

-- Soru icerigi uzerinde full-text arama icin
CREATE INDEX IF NOT EXISTS idx_questions_content_gin
  ON questions USING gin (content jsonb_path_ops);

-- ─── 5. JSONB CONTENT VALIDATION ─────────────────────────

-- questions.content icinde 'question' ve 'options' ve 'answer' zorunlu
ALTER TABLE questions
  ADD CONSTRAINT chk_content_required_fields CHECK (
    content ? 'question' AND
    content ? 'options' AND
    content ? 'answer'
  );
