-- ============================================================
-- BİLGE ARENA — Supabase PostgreSQL Şeması
-- Versiyon: 1.0.0 | Tarih: 2026-03-07
-- ============================================================

-- UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. KULLANICI PROFİLLERİ
-- (Supabase auth.users ile bağlantılı)
-- ============================================================
CREATE TABLE profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username        VARCHAR(32) UNIQUE NOT NULL,
  display_name    VARCHAR(64),
  avatar_url      TEXT,
  city            VARCHAR(64),
  grade           SMALLINT CHECK (grade BETWEEN 9 AND 13),  -- 9-12 lise, 13 mezun
  
  -- XP & Seviye
  total_xp        INTEGER DEFAULT 0 CHECK (total_xp >= 0),
  level           SMALLINT DEFAULT 1,
  level_name      VARCHAR(20) DEFAULT 'Acemi',  -- Acemi/Öğrenci/Azimli/Uzman/Efsane
  
  -- Streak (günlük seri)
  current_streak  SMALLINT DEFAULT 0,
  longest_streak  SMALLINT DEFAULT 0,
  last_played_at  TIMESTAMPTZ,
  
  -- İstatistik
  total_questions INTEGER DEFAULT 0,
  correct_answers INTEGER DEFAULT 0,
  total_sessions  INTEGER DEFAULT 0,
  
  -- Tercihler
  preferred_theme VARCHAR(10) DEFAULT 'dark' CHECK (preferred_theme IN ('dark', 'light')),
  notifications   BOOLEAN DEFAULT TRUE,
  
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. SORULAR
-- Tüm oyunlar ortak soru tablosu
-- ============================================================
CREATE TABLE questions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id     VARCHAR(20) UNIQUE,  -- vocabulary_001, g_orig_001 gibi
  
  -- Sınıflandırma
  game            VARCHAR(20) NOT NULL CHECK (game IN (
                    'wordquest',    -- İngilizce
                    'matematik',    -- Matematik
                    'turkce',       -- Türkçe
                    'fen'           -- Fen & Sosyal
                  )),
  category        VARCHAR(30) NOT NULL,  -- vocabulary, grammar, paragraf, denklem...
  subcategory     VARCHAR(50),
  topic           VARCHAR(100),
  
  -- Zorluk
  difficulty      SMALLINT DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 5),
  -- 1=Çok Kolay, 2=Kolay, 3=Orta, 4=Zor, 5=Boss
  level_tag       VARCHAR(5) CHECK (level_tag IN ('A1','A2','B1','B2','C1','C2')),
  
  -- Soru içeriği (JSONB — esnek format)
  content         JSONB NOT NULL,
  -- Örnek:
  -- {
  --   "type": "multiple_choice",
  --   "sentence": "By the time...",
  --   "options": ["A","B","C","D","E"],
  --   "correct": 1,
  --   "explanation": "Past perfect continuous...",
  --   "hint": "Zaman zarfı..."
  -- }
  
  -- Puan
  base_points     SMALLINT GENERATED ALWAYS AS (difficulty * 10) STORED,
  
  -- Meta
  is_active       BOOLEAN DEFAULT TRUE,
  is_boss         BOOLEAN DEFAULT FALSE,  -- Boss soru mu?
  times_answered  INTEGER DEFAULT 0,
  times_correct   INTEGER DEFAULT 0,
  
  -- Kaynak
  source          VARCHAR(50) DEFAULT 'original',  -- original, derived
  exam_ref        VARCHAR(20),  -- YKS, YDT referansı (opsiyonel)
  
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. OYUN OTURUMLARI
-- Her oyun seansı = 1 kayıt
-- ============================================================
CREATE TABLE game_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Oyun bilgisi
  game            VARCHAR(20) NOT NULL CHECK (game IN ('wordquest','matematik','turkce','fen')),
  mode            VARCHAR(20) DEFAULT 'classic' CHECK (mode IN (
                    'classic',    -- Standart 10 soru
                    'blitz',      -- Hızlı 5 soru
                    'marathon',   -- Uzun 20 soru
                    'boss',       -- Sadece boss sorular
                    'practice'    -- Pratik (puan yok)
                  )),
  
  -- Sonuç
  status          VARCHAR(15) DEFAULT 'active' CHECK (status IN ('active','completed','abandoned')),
  total_questions SMALLINT DEFAULT 0,
  correct_count   SMALLINT DEFAULT 0,
  wrong_count     SMALLINT DEFAULT 0,
  skipped_count   SMALLINT DEFAULT 0,
  
  -- Puanlama
  base_xp         INTEGER DEFAULT 0,
  bonus_xp        INTEGER DEFAULT 0,   -- Streak, hız bonusu
  total_xp        INTEGER DEFAULT 0,
  
  -- Zaman
  time_spent_sec  INTEGER DEFAULT 0,
  avg_time_sec    NUMERIC(5,1),
  
  -- Streak bilgisi (oturum anındaki)
  streak_at_start SMALLINT DEFAULT 0,
  
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  
  -- Filtreler (oturum başında seçilen)
  filter_category VARCHAR(30),
  filter_difficulty SMALLINT
);

-- ============================================================
-- 4. OTURUM DETAYLARI (Her soru = 1 satır)
-- ============================================================
CREATE TABLE session_answers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  question_id     UUID NOT NULL REFERENCES questions(id),
  user_id         UUID NOT NULL REFERENCES profiles(id),
  
  -- Cevap
  selected_option SMALLINT,           -- 0-4 (şık indeksi)
  is_correct      BOOLEAN NOT NULL,
  is_skipped      BOOLEAN DEFAULT FALSE,
  
  -- Zaman
  time_taken_sec  NUMERIC(5,1),
  is_fast         BOOLEAN DEFAULT FALSE,  -- < 10 sn mi?
  
  -- Puan
  xp_earned       SMALLINT DEFAULT 0,
  
  -- Sıra
  question_order  SMALLINT,
  
  answered_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. HAFTALIK LIDERBOARD
-- ============================================================
CREATE TABLE leaderboard_weekly (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  week_start      DATE NOT NULL,   -- Pazartesi
  week_end        DATE NOT NULL,   -- Pazar
  
  xp_earned       INTEGER DEFAULT 0,
  sessions_played SMALLINT DEFAULT 0,
  correct_answers INTEGER DEFAULT 0,
  accuracy_pct    NUMERIC(5,2),
  
  rank            INTEGER,          -- Haftalık sıra (hesaplanan)
  
  UNIQUE(user_id, week_start)
);

-- Genel sıralama view (dinamik rank)
CREATE VIEW leaderboard_weekly_ranked AS
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
-- 6. ROZETLER / BAŞARILAR
-- ============================================================
CREATE TABLE badges (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug            VARCHAR(50) UNIQUE NOT NULL,
  name            VARCHAR(80) NOT NULL,
  description     TEXT,
  icon            VARCHAR(10),         -- Emoji
  color           VARCHAR(10),         -- Hex renk
  category        VARCHAR(20) CHECK (category IN (
                    'streak',           -- Seri rozetleri
                    'accuracy',         -- Doğruluk
                    'speed',            -- Hız
                    'volume',           -- Soru sayısı
                    'level',            -- Seviye
                    'special'           -- Özel
                  )),
  
  -- Kazanma koşulu (JSONB — esnek)
  condition       JSONB NOT NULL,
  -- Örnek: {"type": "streak", "value": 7}
  -- Örnek: {"type": "correct_total", "value": 100}
  -- Örnek: {"type": "accuracy", "value": 90, "min_questions": 50}
  
  rarity          VARCHAR(10) DEFAULT 'common' CHECK (rarity IN ('common','rare','epic','legendary')),
  xp_reward       SMALLINT DEFAULT 0,
  is_active       BOOLEAN DEFAULT TRUE,
  
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Kullanıcı rozetleri
CREATE TABLE user_badges (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id        UUID NOT NULL REFERENCES badges(id),
  
  earned_at       TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, badge_id)
);

-- ============================================================
-- 7. KONU İLERLEMESİ
-- Kullanıcının her kategori/konudaki performansı
-- ============================================================
CREATE TABLE user_topic_progress (
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
  -- 0=Görülmedi, 1=Başlangıç, 2=Gelişiyor, 3=Yetkin, 4=Uzman, 5=Ustalaştı
  
  last_seen_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, game, category)
);

-- ============================================================
-- 8. GÜNLÜK GÖREVLER
-- ============================================================
CREATE TABLE daily_quests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug            VARCHAR(50) UNIQUE NOT NULL,
  title           VARCHAR(100) NOT NULL,
  description     TEXT,
  icon            VARCHAR(10),
  
  quest_type      VARCHAR(20) CHECK (quest_type IN (
                    'play_sessions',    -- X oturum oyna
                    'correct_answers',  -- X doğru cevap
                    'streak_maintain',  -- Seriyi koru
                    'accuracy',         -- % doğruluk
                    'specific_game'     -- Belirli oyunu oyna
                  )),
  target_value    INTEGER NOT NULL,
  target_game     VARCHAR(20),  -- Belirli oyun için
  
  xp_reward       SMALLINT DEFAULT 50,
  is_active       BOOLEAN DEFAULT TRUE
);

-- Kullanıcı günlük görev takibi
CREATE TABLE user_daily_quests (
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
-- 9. XP KAYITLARI (Audit log)
-- ============================================================
CREATE TABLE xp_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  amount          SMALLINT NOT NULL,   -- + veya -
  reason          VARCHAR(50) NOT NULL CHECK (reason IN (
                    'correct_answer',
                    'streak_bonus',
                    'speed_bonus',
                    'session_complete',
                    'badge_earned',
                    'daily_quest',
                    'level_up_bonus',
                    'admin'
                  )),
  
  reference_id    UUID,  -- session_id veya badge_id
  
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 10. SORUDAN KAÇINMA (Görülmüş soru takibi)
-- Aynı soru kısa sürede tekrar çıkmasın
-- ============================================================
CREATE TABLE user_question_history (
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question_id     UUID NOT NULL REFERENCES questions(id),
  
  times_seen      SMALLINT DEFAULT 1,
  times_correct   SMALLINT DEFAULT 0,
  last_seen_at    TIMESTAMPTZ DEFAULT NOW(),
  
  PRIMARY KEY (user_id, question_id)
);

-- ============================================================
-- INDEKSLERİ
-- ============================================================

-- Sorular
CREATE INDEX idx_questions_game         ON questions(game);
CREATE INDEX idx_questions_category     ON questions(game, category);
CREATE INDEX idx_questions_difficulty   ON questions(difficulty);
CREATE INDEX idx_questions_active       ON questions(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_questions_boss         ON questions(is_boss) WHERE is_boss = TRUE;

-- Oturumlar
CREATE INDEX idx_sessions_user          ON game_sessions(user_id);
CREATE INDEX idx_sessions_game          ON game_sessions(game);
CREATE INDEX idx_sessions_completed     ON game_sessions(completed_at DESC);
CREATE INDEX idx_sessions_status        ON game_sessions(status);

-- Cevaplar
CREATE INDEX idx_answers_session        ON session_answers(session_id);
CREATE INDEX idx_answers_user           ON session_answers(user_id);
CREATE INDEX idx_answers_question       ON session_answers(question_id);

-- Liderboard
CREATE INDEX idx_lb_week                ON leaderboard_weekly(week_start);
CREATE INDEX idx_lb_xp                  ON leaderboard_weekly(xp_earned DESC);

-- Profil
CREATE INDEX idx_profiles_xp            ON profiles(total_xp DESC);
CREATE INDEX idx_profiles_username      ON profiles(username);

-- Konu ilerlemesi
CREATE INDEX idx_topic_user_game        ON user_topic_progress(user_id, game);

-- XP log
CREATE INDEX idx_xp_user_date           ON xp_log(user_id, created_at DESC);

-- Soru geçmişi
CREATE INDEX idx_qhist_user_last        ON user_question_history(user_id, last_seen_at);

-- ============================================================
-- FONKSİYONLAR & TETİKLEYİCİLER
-- ============================================================

-- updated_at otomatik güncelleme
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated     BEFORE UPDATE ON profiles          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_questions_updated    BEFORE UPDATE ON questions          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_topic_updated        BEFORE UPDATE ON user_topic_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- XP eklendiğinde profili güncelle + seviye hesapla
CREATE OR REPLACE FUNCTION apply_xp_to_profile()
RETURNS TRIGGER AS $$
DECLARE
  new_total  INTEGER;
  new_level  SMALLINT;
  new_name   VARCHAR(20);
BEGIN
  -- Toplam XP güncelle
  UPDATE profiles
  SET total_xp = total_xp + NEW.amount,
      updated_at = NOW()
  WHERE id = NEW.user_id
  RETURNING total_xp INTO new_total;

  -- Seviye hesapla
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
    WHEN 2 THEN 'Öğrenci'
    ELSE 'Acemi'
  END;

  UPDATE profiles
  SET level = new_level, level_name = new_name
  WHERE id = NEW.user_id AND (level != new_level);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_xp_apply
  AFTER INSERT ON xp_log
  FOR EACH ROW EXECUTE FUNCTION apply_xp_to_profile();

-- Streak güncelleme (her gün ilk oturum tamamlandığında)
CREATE OR REPLACE FUNCTION update_streak(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_last_played   TIMESTAMPTZ;
  v_today         DATE := CURRENT_DATE;
  v_yesterday     DATE := CURRENT_DATE - 1;
BEGIN
  SELECT last_played_at INTO v_last_played FROM profiles WHERE id = p_user_id;

  IF v_last_played IS NULL OR v_last_played::DATE < v_yesterday THEN
    -- Seri kırıldı
    UPDATE profiles
    SET current_streak = 1, last_played_at = NOW()
    WHERE id = p_user_id;
  ELSIF v_last_played::DATE = v_yesterday THEN
    -- Seri devam ediyor
    UPDATE profiles
    SET current_streak = current_streak + 1,
        longest_streak = GREATEST(longest_streak, current_streak + 1),
        last_played_at = NOW()
    WHERE id = p_user_id;
  ELSIF v_last_played::DATE = v_today THEN
    -- Bugün zaten oynadı, sadece timestamp güncelle
    UPDATE profiles SET last_played_at = NOW() WHERE id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Oturum tamamlandığında liderboard güncelle
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
    
    -- Streak güncelle
    PERFORM update_streak(NEW.user_id);
    
    -- Profil stat güncelle
    UPDATE profiles SET
      total_sessions  = total_sessions + 1,
      total_questions = total_questions + NEW.total_questions,
      correct_answers = correct_answers + NEW.correct_count
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_session_complete
  AFTER UPDATE ON game_sessions
  FOR EACH ROW EXECUTE FUNCTION update_weekly_leaderboard();

-- Soru istatistiği güncelle
CREATE OR REPLACE FUNCTION update_question_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE questions SET
    times_answered = times_answered + 1,
    times_correct  = times_correct + (CASE WHEN NEW.is_correct THEN 1 ELSE 0 END)
  WHERE id = NEW.question_id;
  
  -- Soru geçmişini kaydet
  INSERT INTO user_question_history (user_id, question_id, times_seen, times_correct, last_seen_at)
  VALUES (NEW.user_id, NEW.question_id, 1, CASE WHEN NEW.is_correct THEN 1 ELSE 0 END, NOW())
  ON CONFLICT (user_id, question_id) DO UPDATE SET
    times_seen    = user_question_history.times_seen + 1,
    times_correct = user_question_history.times_correct + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
    last_seen_at  = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_answer_stats
  AFTER INSERT ON session_answers
  FOR EACH ROW EXECUTE FUNCTION update_question_stats();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_answers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_topic_progress  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_daily_quests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE xp_log               ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_question_history ENABLE ROW LEVEL SECURITY;

-- Profil: herkes okuyabilir, sadece kendi profilini düzenleyebilir
CREATE POLICY "profiles_select_all"  ON profiles FOR SELECT USING (TRUE);
CREATE POLICY "profiles_update_own"  ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own"  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Oturumlar: sadece kendi oturumları
CREATE POLICY "sessions_own"         ON game_sessions        FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "answers_own"          ON session_answers      FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "badges_own"           ON user_badges          FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "topic_own"            ON user_topic_progress  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "daily_own"            ON user_daily_quests    FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "xp_own"               ON xp_log               FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "qhist_own"            ON user_question_history FOR ALL USING (auth.uid() = user_id);

-- Sorular: herkes okuyabilir, sadece admin yazabilir
ALTER TABLE questions             ENABLE ROW LEVEL SECURITY;
CREATE POLICY "questions_select_all" ON questions FOR SELECT USING (is_active = TRUE);

-- Liderboard: herkes görebilir
ALTER TABLE leaderboard_weekly    ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lb_select_all"        ON leaderboard_weekly FOR SELECT USING (TRUE);
CREATE POLICY "lb_own"               ON leaderboard_weekly FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "lb_own_update"        ON leaderboard_weekly FOR UPDATE USING (auth.uid() = user_id);

-- Rozetler ve görevler: herkes okuyabilir
ALTER TABLE badges                ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_quests          ENABLE ROW LEVEL SECURITY;
CREATE POLICY "badges_read"          ON badges        FOR SELECT USING (is_active = TRUE);
CREATE POLICY "quests_read"          ON daily_quests  FOR SELECT USING (is_active = TRUE);

-- ============================================================
-- BAŞLANGIÇ VERİLERİ
-- ============================================================

-- Rozetler
INSERT INTO badges (slug, name, description, icon, color, category, condition, rarity, xp_reward) VALUES
  ('streak_3',       '3 Günlük Seri',      '3 gün üst üste oyna',                    '🔥', '#EF4444', 'streak',   '{"type":"streak","value":3}',           'common',    30),
  ('streak_7',       'Hafta Boyu',          '7 gün üst üste oyna',                    '🔥', '#F59E0B', 'streak',   '{"type":"streak","value":7}',           'rare',      100),
  ('streak_30',      'Aylık Efsane',        '30 gün üst üste oyna',                   '👑', '#7C3AED', 'streak',   '{"type":"streak","value":30}',          'legendary', 500),
  ('correct_10',     'İlk 10',              '10 doğru cevap ver',                     '✅', '#10B981', 'volume',   '{"type":"correct_total","value":10}',   'common',    20),
  ('correct_100',    'Yüzlük Kulüp',        '100 doğru cevap ver',                    '💯', '#2563EB', 'volume',   '{"type":"correct_total","value":100}',  'rare',      150),
  ('correct_1000',   'Bin Doğru',           '1000 doğru cevap ver',                   '🏆', '#D97706', 'volume',   '{"type":"correct_total","value":1000}', 'legendary', 1000),
  ('accuracy_80',    'Keskin Nişancı',      '80% ve üzeri doğruluk (min 50 soru)',    '🎯', '#3B82F6', 'accuracy', '{"type":"accuracy","value":80,"min":50}','rare',     200),
  ('accuracy_90',    'Mükemmeliyetçi',      '90% ve üzeri doğruluk (min 100 soru)',   '💎', '#8B5CF6', 'accuracy', '{"type":"accuracy","value":90,"min":100}','epic',    400),
  ('speed_10',       'Hız Ustası',          '10 soruyu <10 saniyede doğru yanıtla',   '⚡', '#F59E0B', 'speed',    '{"type":"fast_correct","value":10}',    'rare',      150),
  ('first_session',  'İlk Adım',            'İlk oyun oturumunu tamamla',             '🚀', '#2563EB', 'special',  '{"type":"sessions","value":1}',         'common',    50),
  ('level_expert',   'Uzman',               'Uzman seviyesine ulaş',                  '🛡️','#D97706', 'level',    '{"type":"level","value":4}',            'epic',      300),
  ('level_legend',   'Efsane',              'Efsane seviyesine ulaş',                 '👑', '#7C3AED', 'level',    '{"type":"level","value":5}',            'legendary', 1000),
  ('boss_slayer',    'Boss Katili',         'Bir boss soruyu doğru yanıtla',          '⚔️','#EF4444', 'special',  '{"type":"boss_correct","value":1}',     'rare',      100),
  ('all_games',      'Arena Savaşçısı',     '4 farklı oyunu oyna',                    '🏛️','#2563EB', 'special',  '{"type":"unique_games","value":4}',     'epic',      500);

-- Günlük görevler
INSERT INTO daily_quests (slug, title, description, icon, quest_type, target_value, xp_reward) VALUES
  ('play_1',         '1 Oturum Oyna',       'Herhangi bir oyunda 1 oturum tamamla',   '🎮', 'play_sessions',  1,  30),
  ('play_3',         '3 Oturum Oyna',       'Bugün 3 oturum tamamla',                 '🎮', 'play_sessions',  3,  80),
  ('correct_10',     '10 Doğru Cevap',      'Bugün 10 doğru cevap ver',               '✅', 'correct_answers',10, 50),
  ('correct_30',     '30 Doğru Cevap',      'Bugün 30 doğru cevap ver',               '💪', 'correct_answers',30, 150),
  ('streak_keep',    'Serini Koru',         'Bugün en az 1 oturum tamamla',           '🔥', 'streak_maintain',1,  40),
  ('wordquest',      'İngilizce Zamanı',    'Kelime Atölyesi\'nde 1 oturum tamamla',  '📖', 'specific_game',  1,  60),
  ('accuracy_70',    '%70 Doğruluk',        'Bugün en az %70 doğrulukla oyna',        '🎯', 'accuracy',       70, 70);
