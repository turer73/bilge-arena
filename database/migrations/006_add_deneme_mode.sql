-- Migration 006: 'deneme' modunu game_sessions CHECK constraint'ine ekle
-- Deneme sinavi modu (TYT formatinda) destegi icin

-- Eski constraint'i kaldir
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_mode_check;

-- Yeni constraint ('deneme' dahil)
ALTER TABLE game_sessions
  ADD CONSTRAINT game_sessions_mode_check
  CHECK (mode IN ('classic', 'blitz', 'marathon', 'boss', 'practice', 'deneme'));
