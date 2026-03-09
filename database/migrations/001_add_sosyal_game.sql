-- Migration 001: 'sosyal' oyun tipini schema'ya ekle
-- Mevcut CHECK constraint'i guncelleyerek sosyal bilimler oyun konsolunu destekle
--
-- NOT: leaderboard_weekly tablosunda 'game' kolonu yok
-- (tum oyunlari aggregate eder), bu yuzden constraint gerekmiyor.

-- Eski constraint'i kaldir
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_game_check;
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_game_check;

-- Yeni constraint'leri ekle ('sosyal' dahil)
ALTER TABLE questions
  ADD CONSTRAINT questions_game_check
  CHECK (game IN ('wordquest', 'matematik', 'turkce', 'fen', 'sosyal'));

ALTER TABLE game_sessions
  ADD CONSTRAINT game_sessions_game_check
  CHECK (game IN ('wordquest', 'matematik', 'turkce', 'fen', 'sosyal'));
