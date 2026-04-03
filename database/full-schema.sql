-- ============================================================
-- BILGE ARENA — Konsolide Schema + Migrations (015 dahil)
-- Son guncelleme: Migration 015 — Referral System
-- ============================================================

-- UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. KULLANICI PROFILLERI
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username        VARCHAR(32) UNIQUE NOT NULL,
  display_name    VARCHAR(64),
  avatar_url      TEXT,
  city            VARCHAR(64),
  grade           SMALLINT CHECK (grade BETWEEN 9 AND 13),

  total_xp        INTEGER DEFAULT 0 CHECK (total_xp >= 0),
  level           SMALLINT DEFAULT 1,
  level_name      VARCHAR(20) DEFAULT 'Acemi',

  current_streak  SMALLINT DEFAULT 0,
  longest_streak  SMALLINT DEFAULT 0,
  last_played_at  TIMESTAMPTZ,

  total_questions INTEGER DEFAULT 0,
  correct_answers INTEGER DEFAULT 0,
  total_sessions  INTEGER DEFAULT 0,

  preferred_theme VARCHAR(10) DEFAULT 'dark' CHECK (preferred_theme IN ('dark', 'light')),
  notifications   BOOLEAN DEFAULT TRUE,
  role            TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),

  -- Premium (Migration 009)
  is_premium      BOOLEAN DEFAULT FALSE,
  premium_until   TIMESTAMPTZ DEFAULT NULL,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  -- CHECK constraints (Migration 011)
  CONSTRAINT chk_streak_nonneg CHECK (current_streak >= 0),
  CONSTRAINT chk_longest_streak_nonneg CHECK (longest_streak >= 0),
  CONSTRAINT chk_total_questions_nonneg CHECK (total_questions >= 0),
  CONSTRAINT chk_correct_answers_nonneg CHECK (correct_answers >= 0),
  CONSTRAINT chk_total_sessions_nonneg CHECK (total_sessions >= 0)
);

-- ============================================================
-- 2. SORULAR
-- ============================================================
CREATE TABLE IF NOT EXISTS questions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id     VARCHAR(20) UNIQUE,

  game            VARCHAR(20) NOT NULL CHECK (game IN (
                    'wordquest', 'matematik', 'turkce', 'fen', 'sosyal'
                  )),
  category        VARCHAR(30) NOT NULL,
  subcategory     VARCHAR(50),
  topic           VARCHAR(100),

  difficulty      SMALLINT DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 5),
  level_tag       VARCHAR(5) CHECK (level_tag IN ('A1','A2','B1','B2','C1','C2')),

  content         JSONB NOT NULL,

  base_points     SMALLINT GENERATED ALWAYS AS (difficulty * 10) STORED,

  is_active       BOOLEAN DEFAULT TRUE,
  is_boss         BOOLEAN DEFAULT FALSE,
  times_answered  INTEGER DEFAULT 0,
  times_correct   INTEGER DEFAULT 0,

  source          VARCHAR(50) DEFAULT 'original',
  exam_ref        VARCHAR(20),

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  -- JSONB content validation (Migration 011)
  CONSTRAINT chk_content_required_fields CHECK (
    content ? 'question' AND content ? 'options' AND content ? 'answer'
  ),
  -- Tutarlilik: times_correct <= times_answered
  CONSTRAINT chk_correct_lte_answered CHECK (times_correct <= times_answered)
);

-- ============================================================
-- 3. OYUN OTURUMLARI
-- ============================================================
CREATE TABLE IF NOT EXISTS game_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  game            VARCHAR(20) NOT NULL CHECK (game IN (
                    'wordquest', 'matematik', 'turkce', 'fen', 'sosyal'
                  )),
  mode            VARCHAR(20) DEFAULT 'classic' CHECK (mode IN (
                    'classic', 'blitz', 'marathon', 'boss', 'practice', 'deneme'
                  )),

  status          VARCHAR(15) DEFAULT 'active' CHECK (status IN ('active','completed','abandoned')),
  total_questions SMALLINT DEFAULT 0,
  correct_count   SMALLINT DEFAULT 0,
  wrong_count     SMALLINT DEFAULT 0,
  skipped_count   SMALLINT DEFAULT 0,

  base_xp         INTEGER DEFAULT 0,
  bonus_xp        INTEGER DEFAULT 0,
  total_xp        INTEGER DEFAULT 0,

  time_spent_sec  INTEGER DEFAULT 0,
  avg_time_sec    NUMERIC(5,1),

  streak_at_start SMALLINT DEFAULT 0,

  started_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,

  filter_category VARCHAR(30),
  filter_difficulty SMALLINT,

  -- CHECK constraints (Migration 011)
  CONSTRAINT chk_session_base_xp CHECK (base_xp >= 0),
  CONSTRAINT chk_session_bonus_xp CHECK (bonus_xp >= 0),
  CONSTRAINT chk_session_total_xp CHECK (total_xp >= 0),
  CONSTRAINT chk_session_correct CHECK (correct_count >= 0),
  CONSTRAINT chk_session_wrong CHECK (wrong_count >= 0),
  CONSTRAINT chk_session_skipped CHECK (skipped_count >= 0)
);

-- ============================================================
-- 4. OTURUM DETAYLARI
-- ============================================================
CREATE TABLE IF NOT EXISTS session_answers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  question_id     UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id),

  selected_option SMALLINT,
  is_correct      BOOLEAN NOT NULL,
  is_skipped      BOOLEAN DEFAULT FALSE,

  time_taken_sec  NUMERIC(5,1),
  is_fast         BOOLEAN DEFAULT FALSE,

  xp_earned       SMALLINT DEFAULT 0,
  question_order  SMALLINT,

  answered_at     TIMESTAMPTZ DEFAULT NOW(),

  -- CHECK constraints (Migration 011)
  CONSTRAINT chk_selected_option CHECK (selected_option BETWEEN 0 AND 4),
  CONSTRAINT chk_answer_xp_nonneg CHECK (xp_earned >= 0)
);

-- ============================================================
-- 5. HAFTALIK LIDERBOARD
-- ============================================================
CREATE TABLE IF NOT EXISTS leaderboard_weekly (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  week_start      DATE NOT NULL,
  week_end        DATE NOT NULL,

  xp_earned       INTEGER DEFAULT 0,
  sessions_played SMALLINT DEFAULT 0,
  correct_answers INTEGER DEFAULT 0,
  accuracy_pct    NUMERIC(5,2),

  rank            INTEGER,

  UNIQUE(user_id, week_start),

  -- CHECK constraint (Migration 011)
  CONSTRAINT chk_week_order CHECK (week_start <= week_end)
);

-- Ranked view
CREATE OR REPLACE VIEW leaderboard_weekly_ranked AS
SELECT
  lw.*,
  p.username,
  p.display_name,
  p.avatar_url,
  p.city,
  p.level_name,
  p.current_streak,
  RANK() OVER (
    PARTITION BY lw.week_start
    ORDER BY lw.xp_earned DESC
  ) AS current_rank
FROM leaderboard_weekly lw
JOIN profiles p ON lw.user_id = p.id
WHERE lw.week_start = date_trunc('week', NOW())::DATE;

-- ============================================================
-- 6. ROZETLER
-- ============================================================
CREATE TABLE IF NOT EXISTS badges (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug            VARCHAR(50) UNIQUE NOT NULL,
  name            VARCHAR(80) NOT NULL,
  description     TEXT,
  icon            VARCHAR(10),
  color           VARCHAR(10),
  category        VARCHAR(20) CHECK (category IN (
                    'streak', 'accuracy', 'speed', 'volume', 'level', 'special'
                  )),
  condition       JSONB NOT NULL,
  rarity          VARCHAR(10) DEFAULT 'common' CHECK (rarity IN ('common','rare','epic','legendary')),
  xp_reward       SMALLINT DEFAULT 0,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_badges (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id        UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, badge_id)
);

-- ============================================================
-- 7. KONU ILERLEMESI
-- ============================================================
CREATE TABLE IF NOT EXISTS user_topic_progress (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  game            VARCHAR(20) NOT NULL,
  category        VARCHAR(30) NOT NULL,

  questions_seen  INTEGER DEFAULT 0,
  correct         INTEGER DEFAULT 0,
  accuracy_pct    NUMERIC(5,2) GENERATED ALWAYS AS (
                    CASE WHEN questions_seen = 0 THEN 0
                    ELSE ROUND((correct::NUMERIC / questions_seen) * 100, 2) END
                  ) STORED,

  mastery_level   SMALLINT DEFAULT 0 CHECK (mastery_level BETWEEN 0 AND 5),
  last_seen_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, game, category),

  -- CHECK constraint (Migration 011)
  CONSTRAINT chk_topic_correct_lte_seen CHECK (correct <= questions_seen)
);

-- ============================================================
-- 8. GUNLUK GOREVLER
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_quests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug            VARCHAR(50) UNIQUE NOT NULL,
  title           VARCHAR(100) NOT NULL,
  description     TEXT,
  icon            VARCHAR(10),
  quest_type      VARCHAR(20) CHECK (quest_type IN (
                    'play_sessions', 'correct_answers', 'streak_maintain',
                    'accuracy', 'specific_game'
                  )),
  target_value    INTEGER NOT NULL,
  target_game     VARCHAR(20),
  xp_reward       SMALLINT DEFAULT 50,
  is_active       BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS user_daily_quests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  quest_id        UUID NOT NULL REFERENCES daily_quests(id),
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  current_value   INTEGER DEFAULT 0,
  is_completed    BOOLEAN DEFAULT FALSE,
  completed_at    TIMESTAMPTZ,
  xp_claimed      BOOLEAN DEFAULT FALSE,
  UNIQUE(user_id, quest_id, date)
);

-- ============================================================
-- 9. XP KAYITLARI
-- ============================================================
CREATE TABLE IF NOT EXISTS xp_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount          SMALLINT NOT NULL,
  reason          VARCHAR(50) NOT NULL CHECK (reason IN (
                    'correct_answer', 'streak_bonus', 'speed_bonus',
                    'session_complete', 'badge_earned', 'daily_quest',
                    'level_up_bonus', 'admin'
                  )),
  reference_id    UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 10. SORU GECMISI
-- ============================================================
CREATE TABLE IF NOT EXISTS user_question_history (
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question_id     UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  times_seen      SMALLINT DEFAULT 1,
  times_correct   SMALLINT DEFAULT 0,
  last_seen_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, question_id)
);

-- ============================================================
-- 11. YORUM SISTEMI (Migration 002)
-- ============================================================
CREATE TABLE IF NOT EXISTS comments (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  content     TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  parent_id   UUID REFERENCES comments(id) ON DELETE CASCADE,
  is_deleted  BOOLEAN DEFAULT false,
  likes_count INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comment_likes (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, comment_id)
);

CREATE TABLE IF NOT EXISTS question_likes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, question_id)
);

-- ============================================================
-- 12. HATA RAPORLARI (Migration 003)
-- ============================================================
DO $$ BEGIN
  CREATE TYPE report_type AS ENUM ('wrong_answer','typo','unclear','duplicate','offensive','other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE report_status AS ENUM ('pending','reviewed','resolved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS error_reports (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  report_type report_type NOT NULL,
  description TEXT CHECK (char_length(description) <= 1000),
  status      report_status DEFAULT 'pending',
  admin_note  TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 13. ADMIN TABLOLARI (Migration 004)
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_logs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id    UUID NOT NULL REFERENCES auth.users(id),
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- ============================================================
-- INDEKSLER
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_questions_game         ON questions(game);
CREATE INDEX IF NOT EXISTS idx_questions_category     ON questions(game, category);
CREATE INDEX IF NOT EXISTS idx_questions_difficulty   ON questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_questions_active       ON questions(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_questions_boss         ON questions(is_boss) WHERE is_boss = TRUE;

CREATE INDEX IF NOT EXISTS idx_sessions_user          ON game_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_game          ON game_sessions(game);
CREATE INDEX IF NOT EXISTS idx_sessions_completed     ON game_sessions(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_status        ON game_sessions(status);

CREATE INDEX IF NOT EXISTS idx_answers_session        ON session_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_answers_user           ON session_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_answers_question       ON session_answers(question_id);

CREATE INDEX IF NOT EXISTS idx_lb_week                ON leaderboard_weekly(week_start);
CREATE INDEX IF NOT EXISTS idx_lb_xp                  ON leaderboard_weekly(xp_earned DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_xp            ON profiles(total_xp DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_username      ON profiles(username);

CREATE INDEX IF NOT EXISTS idx_topic_user_game        ON user_topic_progress(user_id, game);
CREATE INDEX IF NOT EXISTS idx_xp_user_date           ON xp_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qhist_user_last        ON user_question_history(user_id, last_seen_at);

CREATE INDEX IF NOT EXISTS idx_comments_question      ON comments(question_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_user          ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent        ON comments(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment  ON comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_question_likes_question ON question_likes(question_id);

CREATE INDEX IF NOT EXISTS idx_error_reports_question ON error_reports(question_id);
CREATE INDEX IF NOT EXISTS idx_error_reports_status   ON error_reports(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_error_reports_user     ON error_reports(user_id);

CREATE INDEX IF NOT EXISTS idx_admin_logs_admin       ON admin_logs(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action      ON admin_logs(action, created_at DESC);

-- ============================================================
-- FONKSIYONLAR & TETIKLEYICILER
-- ============================================================

-- updated_at otomatik guncelleme
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated ON profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_questions_updated ON questions;
CREATE TRIGGER trg_questions_updated BEFORE UPDATE ON questions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_topic_updated ON user_topic_progress;
CREATE TRIGGER trg_topic_updated BEFORE UPDATE ON user_topic_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- XP profil guncelleme + seviye hesaplama
CREATE OR REPLACE FUNCTION apply_xp_to_profile()
RETURNS TRIGGER AS $$
DECLARE
  new_total  INTEGER;
  new_level  SMALLINT;
  new_name   VARCHAR(20);
BEGIN
  UPDATE profiles
  SET total_xp = total_xp + NEW.amount, updated_at = NOW()
  WHERE id = NEW.user_id
  RETURNING total_xp INTO new_total;

  new_level := CASE
    WHEN new_total >= 10000 THEN 5
    WHEN new_total >= 5000  THEN 4
    WHEN new_total >= 2000  THEN 3
    WHEN new_total >= 500   THEN 2
    ELSE 1
  END;

  new_name := CASE new_level
    WHEN 5 THEN 'Efsane'
    WHEN 4 THEN 'Uzman'
    WHEN 3 THEN 'Azimli'
    WHEN 2 THEN 'Ogrenci'
    ELSE 'Acemi'
  END;

  UPDATE profiles SET level = new_level, level_name = new_name
  WHERE id = NEW.user_id AND (level != new_level);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_xp_apply ON xp_log;
CREATE TRIGGER trg_xp_apply AFTER INSERT ON xp_log FOR EACH ROW EXECUTE FUNCTION apply_xp_to_profile();

-- Streak guncelleme
CREATE OR REPLACE FUNCTION update_streak(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_last_played   TIMESTAMPTZ;
  v_today         DATE := CURRENT_DATE;
  v_yesterday     DATE := CURRENT_DATE - 1;
BEGIN
  SELECT last_played_at INTO v_last_played FROM profiles WHERE id = p_user_id;

  IF v_last_played IS NULL OR v_last_played::DATE < v_yesterday THEN
    UPDATE profiles SET current_streak = 1, last_played_at = NOW() WHERE id = p_user_id;
  ELSIF v_last_played::DATE = v_yesterday THEN
    UPDATE profiles
    SET current_streak = current_streak + 1,
        longest_streak = GREATEST(longest_streak, current_streak + 1),
        last_played_at = NOW()
    WHERE id = p_user_id;
  ELSIF v_last_played::DATE = v_today THEN
    UPDATE profiles SET last_played_at = NOW() WHERE id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Oturum tamamlandiginda liderboard guncelle
CREATE OR REPLACE FUNCTION update_weekly_leaderboard()
RETURNS TRIGGER AS $$
DECLARE
  v_week_start  DATE := date_trunc('week', NOW())::DATE;
  v_week_end    DATE := v_week_start + 6;
BEGIN
  IF NEW.status = 'completed' AND OLD.status = 'active' THEN
    INSERT INTO leaderboard_weekly (user_id, week_start, week_end, xp_earned, sessions_played, correct_answers)
    VALUES (NEW.user_id, v_week_start, v_week_end, NEW.total_xp, 1, NEW.correct_count)
    ON CONFLICT (user_id, week_start) DO UPDATE SET
      xp_earned       = leaderboard_weekly.xp_earned + NEW.total_xp,
      sessions_played = leaderboard_weekly.sessions_played + 1,
      correct_answers = leaderboard_weekly.correct_answers + NEW.correct_count,
      accuracy_pct    = ROUND(
        (leaderboard_weekly.correct_answers + NEW.correct_count)::NUMERIC /
        NULLIF(leaderboard_weekly.sessions_played * 10, 0) * 100, 2
      );

    PERFORM update_streak(NEW.user_id);

    UPDATE profiles SET
      total_sessions  = total_sessions + 1,
      total_questions = total_questions + NEW.total_questions,
      correct_answers = correct_answers + NEW.correct_count
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_session_complete ON game_sessions;
CREATE TRIGGER trg_session_complete AFTER UPDATE ON game_sessions FOR EACH ROW EXECUTE FUNCTION update_weekly_leaderboard();

-- Soru istatistigi guncelle
CREATE OR REPLACE FUNCTION update_question_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE questions SET
    times_answered = times_answered + 1,
    times_correct  = times_correct + (CASE WHEN NEW.is_correct THEN 1 ELSE 0 END)
  WHERE id = NEW.question_id;

  INSERT INTO user_question_history (user_id, question_id, times_seen, times_correct, last_seen_at)
  VALUES (NEW.user_id, NEW.question_id, 1, CASE WHEN NEW.is_correct THEN 1 ELSE 0 END, NOW())
  ON CONFLICT (user_id, question_id) DO UPDATE SET
    times_seen    = user_question_history.times_seen + 1,
    times_correct = user_question_history.times_correct + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
    last_seen_at  = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_answer_stats ON session_answers;
CREATE TRIGGER trg_answer_stats AFTER INSERT ON session_answers FOR EACH ROW EXECUTE FUNCTION update_question_stats();

-- Yorum begeni sayisi guncelle
CREATE OR REPLACE FUNCTION update_comment_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE comments SET likes_count = likes_count - 1 WHERE id = OLD.comment_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_comment_likes_count ON comment_likes;
CREATE TRIGGER trg_comment_likes_count AFTER INSERT OR DELETE ON comment_likes FOR EACH ROW EXECUTE FUNCTION update_comment_likes_count();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_answers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_topic_progress  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_daily_quests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE xp_log               ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_question_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_weekly   ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges               ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_quests         ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_likes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_reports        ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings        ENABLE ROW LEVEL SECURITY;

-- Profil
DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Sorular
DROP POLICY IF EXISTS "questions_select_all" ON questions;
CREATE POLICY "questions_select_all" ON questions FOR SELECT USING (is_active = TRUE);

-- Oturumlar
DROP POLICY IF EXISTS "sessions_own" ON game_sessions;
CREATE POLICY "sessions_own" ON game_sessions FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "answers_own" ON session_answers;
CREATE POLICY "answers_own" ON session_answers FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "badges_own" ON user_badges;
CREATE POLICY "badges_own" ON user_badges FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "topic_own" ON user_topic_progress;
CREATE POLICY "topic_own" ON user_topic_progress FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "daily_own" ON user_daily_quests;
CREATE POLICY "daily_own" ON user_daily_quests FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "xp_own" ON xp_log;
CREATE POLICY "xp_own" ON xp_log FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "qhist_own" ON user_question_history;
CREATE POLICY "qhist_own" ON user_question_history FOR ALL USING (auth.uid() = user_id);

-- Liderboard
DROP POLICY IF EXISTS "lb_select_all" ON leaderboard_weekly;
CREATE POLICY "lb_select_all" ON leaderboard_weekly FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "lb_own" ON leaderboard_weekly;
CREATE POLICY "lb_own" ON leaderboard_weekly FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "lb_own_update" ON leaderboard_weekly;
CREATE POLICY "lb_own_update" ON leaderboard_weekly FOR UPDATE USING (auth.uid() = user_id);

-- Rozetler & Gorevler
DROP POLICY IF EXISTS "badges_read" ON badges;
CREATE POLICY "badges_read" ON badges FOR SELECT USING (is_active = TRUE);
DROP POLICY IF EXISTS "quests_read" ON daily_quests;
CREATE POLICY "quests_read" ON daily_quests FOR SELECT USING (is_active = TRUE);

-- Yorumlar
DROP POLICY IF EXISTS "comments_select" ON comments;
CREATE POLICY "comments_select" ON comments FOR SELECT USING (is_deleted = false);
DROP POLICY IF EXISTS "comments_insert" ON comments;
CREATE POLICY "comments_insert" ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "comments_update" ON comments;
CREATE POLICY "comments_update" ON comments FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "comments_delete" ON comments;
CREATE POLICY "comments_delete" ON comments FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "comment_likes_select" ON comment_likes;
CREATE POLICY "comment_likes_select" ON comment_likes FOR SELECT USING (true);
DROP POLICY IF EXISTS "comment_likes_insert" ON comment_likes;
CREATE POLICY "comment_likes_insert" ON comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "comment_likes_delete" ON comment_likes;
CREATE POLICY "comment_likes_delete" ON comment_likes FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "question_likes_select" ON question_likes;
CREATE POLICY "question_likes_select" ON question_likes FOR SELECT USING (true);
DROP POLICY IF EXISTS "question_likes_insert" ON question_likes;
CREATE POLICY "question_likes_insert" ON question_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "question_likes_delete" ON question_likes;
CREATE POLICY "question_likes_delete" ON question_likes FOR DELETE USING (auth.uid() = user_id);

-- Hata raporlari
DROP POLICY IF EXISTS "error_reports_select_own" ON error_reports;
CREATE POLICY "error_reports_select_own" ON error_reports FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "error_reports_insert" ON error_reports;
CREATE POLICY "error_reports_insert" ON error_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "error_reports_select_admin" ON error_reports;
CREATE POLICY "error_reports_select_admin" ON error_reports FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
DROP POLICY IF EXISTS "error_reports_update_admin" ON error_reports;
CREATE POLICY "error_reports_update_admin" ON error_reports FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Admin tablolari
DROP POLICY IF EXISTS "admin_logs_select" ON admin_logs;
CREATE POLICY "admin_logs_select" ON admin_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
DROP POLICY IF EXISTS "admin_logs_insert" ON admin_logs;
CREATE POLICY "admin_logs_insert" ON admin_logs FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "site_settings_select" ON site_settings;
CREATE POLICY "site_settings_select" ON site_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "site_settings_update" ON site_settings;
CREATE POLICY "site_settings_update" ON site_settings FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
DROP POLICY IF EXISTS "site_settings_insert" ON site_settings;
CREATE POLICY "site_settings_insert" ON site_settings FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================================
-- BASLANGIC VERILERI
-- ============================================================

-- Rozetler
INSERT INTO badges (slug, name, description, icon, color, category, condition, rarity, xp_reward) VALUES
  ('streak_3',       '3 Gunluk Seri',      '3 gun ust uste oyna',                    '🔥', '#EF4444', 'streak',   '{"type":"streak","value":3}',           'common',    30),
  ('streak_7',       'Hafta Boyu',          '7 gun ust uste oyna',                    '🔥', '#F59E0B', 'streak',   '{"type":"streak","value":7}',           'rare',      100),
  ('streak_30',      'Aylik Efsane',        '30 gun ust uste oyna',                   '👑', '#7C3AED', 'streak',   '{"type":"streak","value":30}',          'legendary', 500),
  ('correct_10',     'Ilk 10',              '10 dogru cevap ver',                     '✅', '#10B981', 'volume',   '{"type":"correct_total","value":10}',   'common',    20),
  ('correct_100',    'Yuzluk Kulup',        '100 dogru cevap ver',                    '💯', '#2563EB', 'volume',   '{"type":"correct_total","value":100}',  'rare',      150),
  ('correct_1000',   'Bin Dogru',           '1000 dogru cevap ver',                   '🏆', '#D97706', 'volume',   '{"type":"correct_total","value":1000}', 'legendary', 1000),
  ('accuracy_80',    'Keskin Nisanci',      '80%% ve uzeri dogruluk (min 50 soru)',    '🎯', '#3B82F6', 'accuracy', '{"type":"accuracy","value":80,"min":50}','rare',     200),
  ('accuracy_90',    'Mukemmeliyetci',      '90%% ve uzeri dogruluk (min 100 soru)',   '💎', '#8B5CF6', 'accuracy', '{"type":"accuracy","value":90,"min":100}','epic',    400),
  ('speed_10',       'Hiz Ustasi',          '10 soruyu <10 saniyede dogru yanitla',   '⚡', '#F59E0B', 'speed',    '{"type":"fast_correct","value":10}',    'rare',      150),
  ('first_session',  'Ilk Adim',            'Ilk oyun oturumunu tamamla',             '🚀', '#2563EB', 'special',  '{"type":"sessions","value":1}',         'common',    50),
  ('level_expert',   'Uzman',               'Uzman seviyesine ulas',                  '🛡️','#D97706', 'level',    '{"type":"level","value":4}',            'epic',      300),
  ('level_legend',   'Efsane',              'Efsane seviyesine ulas',                 '👑', '#7C3AED', 'level',    '{"type":"level","value":5}',            'legendary', 1000),
  ('boss_slayer',    'Boss Katili',         'Bir boss soruyu dogru yanitla',          '⚔️','#EF4444', 'special',  '{"type":"boss_correct","value":1}',     'rare',      100),
  ('all_games',      'Arena Savascisi',     '4 farkli oyunu oyna',                    '🏛️','#2563EB', 'special',  '{"type":"unique_games","value":4}',     'epic',      500)
ON CONFLICT (slug) DO NOTHING;

-- Gunluk gorevler
INSERT INTO daily_quests (slug, title, description, icon, quest_type, target_value, xp_reward) VALUES
  ('play_1',         '1 Oturum Oyna',       'Herhangi bir oyunda 1 oturum tamamla',   '🎮', 'play_sessions',  1,  30),
  ('play_3',         '3 Oturum Oyna',       'Bugun 3 oturum tamamla',                 '🎮', 'play_sessions',  3,  80),
  ('correct_10',     '10 Dogru Cevap',      'Bugun 10 dogru cevap ver',               '✅', 'correct_answers',10, 50),
  ('correct_30',     '30 Dogru Cevap',      'Bugun 30 dogru cevap ver',               '💪', 'correct_answers',30, 150),
  ('streak_keep',    'Serini Koru',         'Bugun en az 1 oturum tamamla',           '🔥', 'streak_maintain',1,  40),
  ('wordquest',      'Ingilizce Zamani',    'Kelime Atolyesinde 1 oturum tamamla',    '📖', 'specific_game',  1,  60),
  ('accuracy_70',    '%70 Dogruluk',        'Bugun en az %70 dogrulukla oyna',        '🎯', 'accuracy',       70, 70)
ON CONFLICT (slug) DO NOTHING;

-- Site ayarlari
INSERT INTO site_settings (key, value) VALUES
  ('maintenance_mode', 'false'::jsonb),
  ('registration_enabled', 'true'::jsonb),
  ('daily_quest_count', '3'::jsonb),
  ('max_chat_messages_guest', '5'::jsonb),
  ('max_chat_messages_user', '20'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 14. CONSENT / KVKK (Migration 010)
-- ============================================================
CREATE TABLE IF NOT EXISTS consent_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  consent_type text NOT NULL CHECK (consent_type IN ('cookie', 'terms', 'kvkk')),
  consent_value jsonb NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_consent_logs_user_id ON consent_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_consent_logs_type ON consent_logs(consent_type);

ALTER TABLE consent_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert consent logs" ON consent_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can read own consent logs" ON consent_logs FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- Premium trigger (Migration 009)
-- ============================================================
CREATE OR REPLACE FUNCTION check_premium_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.premium_until IS NOT NULL AND NEW.premium_until < NOW() THEN
    NEW.is_premium := false;
    NEW.premium_until := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_premium ON profiles;
CREATE TRIGGER trg_check_premium
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION check_premium_status();

-- ============================================================
-- Migration 011: Ek indexler
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_sessions_user_game ON game_sessions(user_id, game);
CREATE INDEX IF NOT EXISTS idx_sessions_user_completed ON game_sessions(user_id, completed_at DESC) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_lb_user_week ON leaderboard_weekly(user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_answers_user_correct ON session_answers(user_id, is_correct) WHERE is_correct = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_premium ON profiles(is_premium) WHERE is_premium = TRUE;
CREATE INDEX IF NOT EXISTS idx_questions_content_gin ON questions USING gin (content jsonb_path_ops);

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

-- ============================================================
-- 013: Push Notification Subscriptions
-- Web Push API abonelikleri icin tablo
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_sub_user ON push_subscriptions(user_id);

-- RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_own" ON push_subscriptions;
CREATE POLICY "push_own" ON push_subscriptions FOR ALL USING (auth.uid() = user_id);

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

-- ============================================================
-- 015: Referral System (Davet Sistemi)
-- Her kullaniciya benzersiz davet kodu. Davet edilen kayit olunca
-- her iki tarafa XP odulu.
-- ============================================================

-- Profiles tablosuna referral_code kolonu ekle
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS referral_code VARCHAR(8) UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES profiles(id);

-- Referral log tablosu
CREATE TABLE IF NOT EXISTS referral_rewards (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  xp_awarded    SMALLINT NOT NULL DEFAULT 100,
  created_at    TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(referrer_id, referred_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_referrer ON referral_rewards(referrer_id);

-- RLS
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referral_own" ON referral_rewards;
CREATE POLICY "referral_own" ON referral_rewards
  FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- Mevcut kullanicilara referral_code ata (8 karakter alfanumerik)
-- Bu bir kerelik migration — yeni kullanicilar icin trigger oluturacagiz
UPDATE profiles
SET referral_code = UPPER(SUBSTR(MD5(RANDOM()::TEXT || id::TEXT), 1, 8))
WHERE referral_code IS NULL;

-- Yeni kullanicilara otomatik referral_code ata
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := UPPER(SUBSTR(MD5(RANDOM()::TEXT || NEW.id::TEXT), 1, 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_referral_code ON profiles;
CREATE TRIGGER trg_referral_code
  BEFORE INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION generate_referral_code();