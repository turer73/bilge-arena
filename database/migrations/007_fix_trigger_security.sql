-- Migration 007: Trigger fonksiyonlarina SECURITY DEFINER ekle
-- RLS aktif tablolarda trigger'lar UPDATE/INSERT yapabilmeli
-- SECURITY DEFINER = fonksiyonu TANIMLAYANIN yetkileriyle calistirir (superuser)

-- 1) update_question_stats: session_answers INSERT'inde questions tablosunu gunceller
--    questions tablosunda sadece SELECT RLS var, UPDATE yok → trigger basarisiz olur
CREATE OR REPLACE FUNCTION update_question_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE questions SET
    times_answered = times_answered + 1,
    times_correct  = times_correct + (CASE WHEN NEW.is_correct THEN 1 ELSE 0 END)
  WHERE id = NEW.question_id;

  -- Soru gecmisini kaydet
  INSERT INTO user_question_history (user_id, question_id, times_seen, times_correct, last_seen_at)
  VALUES (NEW.user_id, NEW.question_id, 1, CASE WHEN NEW.is_correct THEN 1 ELSE 0 END, NOW())
  ON CONFLICT (user_id, question_id) DO UPDATE SET
    times_seen    = user_question_history.times_seen + 1,
    times_correct = user_question_history.times_correct + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
    last_seen_at  = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2) update_weekly_leaderboard: game_sessions UPDATE'inde
--    leaderboard_weekly ve profiles tablolarini gunceller
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

    -- Streak guncelle
    PERFORM update_streak(NEW.user_id);

    -- Profil stat guncelle
    UPDATE profiles SET
      total_sessions  = total_sessions + 1,
      total_questions = total_questions + NEW.total_questions,
      correct_answers = correct_answers + NEW.correct_count
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3) apply_xp_to_profile: xp_log INSERT'inde profiles tablosunu gunceller
CREATE OR REPLACE FUNCTION apply_xp_to_profile()
RETURNS TRIGGER AS $$
DECLARE
  new_total INT;
  new_level INT;
  new_name  VARCHAR(32);
BEGIN
  UPDATE profiles
  SET total_xp = total_xp + NEW.xp_amount
  WHERE id = NEW.user_id
  RETURNING total_xp INTO new_total;

  -- Seviye hesapla
  IF new_total >= 20000 THEN
    new_level := 5; new_name := 'Efsane';
  ELSIF new_total >= 10000 THEN
    new_level := 4; new_name := 'Usta';
  ELSIF new_total >= 4000 THEN
    new_level := 3; new_name := 'Uzman';
  ELSIF new_total >= 1000 THEN
    new_level := 2; new_name := 'Cirak';
  ELSE
    new_level := 1; new_name := 'Acemi';
  END IF;

  UPDATE profiles
  SET level = new_level, level_name = new_name
  WHERE id = NEW.user_id AND (level != new_level);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4) update_streak: profiles tablosunu gunceller
CREATE OR REPLACE FUNCTION update_streak(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_last_played   TIMESTAMPTZ;
  v_today         DATE := CURRENT_DATE;
  v_yesterday     DATE := CURRENT_DATE - 1;
BEGIN
  SELECT last_played_at INTO v_last_played FROM profiles WHERE id = p_user_id;

  IF v_last_played IS NULL OR v_last_played::DATE < v_yesterday THEN
    UPDATE profiles
    SET current_streak = 1, last_played_at = NOW()
    WHERE id = p_user_id;
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5) handle_new_user: auth.users INSERT'inde profiles tablosuna kayit ekler
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_username VARCHAR(32);
BEGIN
  v_username := LOWER(SPLIT_PART(NEW.email, '@', 1));
  v_username := LEFT(v_username, 24) || '_' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    v_username,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', v_username),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', NULL)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
