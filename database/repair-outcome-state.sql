-- Migration 086 SONRASI, AYRI ONAYLA calistirilacak tarihsel mastery backfill.
-- Migration'a gomulmemistir: session_answers buyudukce tablo kilidi deploy
-- suresini belirsizlestirmesin. Bu script idempotenttir; tum mevcut kaniti
-- yeniden hesaplayip ayni user/outcome satirlarini SET eder (toplamaz).
--
-- Prod uygulama notu:
--   1) once 086 migration
--   2) dusuk trafikte bu script (lock_timeout 5s; kilit alamazsa guvenli fail)
--   3) smoke: attempts/correct/delayed tutarlilik kontrolleri

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Snapshot ile trigger UPSERT'in birbirini ezdigi race'i engeller. Kilit
-- alinana kadar yeni session_answers INSERT'leri en fazla 5s bekler; alinmazsa
-- transaction hata ile tamamen geri doner.
LOCK TABLE public.session_answers IN SHARE ROW EXCLUSIVE MODE;

-- Aktif outcome kapsamini once temizleyip ayni transaction'da tam snapshot'i
-- kur. Esleme kaldirilmis/degismis eski state satirlari boylece hayalet kanit
-- olarak kalmaz; herhangi bir hata tum DELETE+INSERT'i rollback eder.
DELETE FROM public.user_outcome_state AS state
USING public.curriculum_outcomes AS outcome
WHERE state.outcome_id = outcome.id
  AND outcome.is_active = TRUE;

WITH evidence AS (
  SELECT
    answer.user_id,
    mapping.outcome_id,
    COUNT(*)::INTEGER AS attempts,
    COUNT(*) FILTER (WHERE answer.is_correct)::INTEGER AS correct_attempts,
    COALESCE(SUM(mapping.weight) FILTER (WHERE answer.is_correct), 0) AS weighted_earned,
    COALESCE(SUM(mapping.weight), 0) AS weighted_possible,
    COUNT(*) FILTER (
      WHERE answer.is_correct
        AND EXISTS (
          SELECT 1
          FROM public.session_answers AS previous_answer
          WHERE previous_answer.user_id = answer.user_id
            AND previous_answer.question_id = answer.question_id
            AND previous_answer.id <> answer.id
            AND previous_answer.answered_at <= answer.answered_at - INTERVAL '24 hours'
        )
    )::INTEGER AS delayed_correct,
    MAX(answer.answered_at) AS last_answered_at
  FROM public.session_answers AS answer
  JOIN public.question_outcomes AS mapping ON mapping.question_id = answer.question_id
  JOIN public.curriculum_outcomes AS outcome ON outcome.id = mapping.outcome_id
  WHERE outcome.is_active = TRUE
  GROUP BY answer.user_id, mapping.outcome_id
)
INSERT INTO public.user_outcome_state (
  user_id,
  outcome_id,
  attempts,
  correct_attempts,
  weighted_earned,
  weighted_possible,
  delayed_correct,
  last_answered_at,
  updated_at
)
SELECT
  user_id,
  outcome_id,
  attempts,
  correct_attempts,
  weighted_earned,
  weighted_possible,
  delayed_correct,
  last_answered_at,
  NOW()
FROM evidence
ON CONFLICT (user_id, outcome_id) DO UPDATE SET
  attempts = EXCLUDED.attempts,
  correct_attempts = EXCLUDED.correct_attempts,
  weighted_earned = EXCLUDED.weighted_earned,
  weighted_possible = EXCLUDED.weighted_possible,
  delayed_correct = EXCLUDED.delayed_correct,
  last_answered_at = EXCLUDED.last_answered_at,
  updated_at = NOW();

COMMIT;

-- Read-only smoke sorgulari (script sonrasi ayri calistirilabilir):
-- SELECT COUNT(*) AS state_rows FROM public.user_outcome_state;
-- SELECT COUNT(*) AS invalid_rows FROM public.user_outcome_state
-- WHERE correct_attempts > attempts
--    OR delayed_correct > correct_attempts
--    OR weighted_earned > weighted_possible;
