-- Migration 083: session_answers icin (user_id, answered_at) WHERE is_correct=false
-- partial index -- konu#7 karari S1/S2, opsiyonel performans katkisi
--
-- Iki mevcut sorgu deseni ayni filtreyi kullaniyor: WHERE user_id=? AND
-- is_correct=false ORDER BY answered_at DESC/ASC:
--   1. /api/review/wrong-answers (PR#273, migration'siz -- route kodu) --
--      "yanlis-cevap OLAYLARI" taramasi (WRONG_EVENTS_SCAN_LIMIT=1000)
--   2. questions/random fetchFsrsDueQuestions (bu PR, konu#7 S1 ts-fsrs fold) --
--      FSRS-review aday-taramasi (FSRS_WRONG_SCAN_LIMIT=1000)
--
-- Mevcut idx_answers_user_correct (full-schema.sql:803) SADECE is_correct=TRUE
-- icin partial index -- is_correct=FALSE taramasi hala idx_answers_user
-- (full-schema.sql:407, is_correct/answered_at'siz genel user_id index'i)
-- uzerinden calisiyor, yani kullanicinin TUM cevaplarini (dogru+yanlis) tarayip
-- sonra filtreliyor. Bu index dogru+yanlis'i kolonlarina ekleyerek Postgres'in
-- yalniz yanlis-cevaplari (ve answered_at sirali) taramasini saglar.
--
-- KAPSAM DISI: is_correct=TRUE tarafi zaten idx_answers_user_correct'te var,
-- buraya eklenmiyor. computeDueMap'in "TAM (dogru+yanlis) gecmis" sorgusu
-- (question_id IN (...) filtreli, user_id+is_correct filtresi YOK) bu index'i
-- kullanmaz -- o ayri bir erisim deseni (question_id bazli), idx_answers_question
-- (full-schema.sql:408) ile zaten destekleniyor.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_answers_user_wrong_time
  ON public.session_answers (user_id, answered_at)
  WHERE is_correct = false;

COMMIT;
