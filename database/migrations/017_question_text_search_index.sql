-- Migration 017: Soru metni arama indexi
-- Admin panelde ILIKE ile arama yapildiginda full table scan yerine index kulllanilsin.
-- pg_trgm extension + trigram index — ILIKE '%text%' sorgularini hizlandirir.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- content->>question text olarak cikarilip trigram indexlenir
CREATE INDEX IF NOT EXISTS idx_questions_question_trgm
  ON questions USING gin ((content->>'question') gin_trgm_ops);

-- WordQuest sorulari content->>sentence kullaniyor
CREATE INDEX IF NOT EXISTS idx_questions_sentence_trgm
  ON questions USING gin ((content->>'sentence') gin_trgm_ops);
