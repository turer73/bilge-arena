-- Migration 086: Kazanim / hakimiyet haritasi pilotu (konu#7 Faz-2 P1)
--
-- AMAC: kategori yuzdesinden daha aciklanabilir bir ogrenme kaniti katmani
-- kurmak. Bu ilk dilim yalniz TYT Matematik / sayilar kategorisini tek, kaba
-- bir pilot kazanimla esler. MAT-SAY-01 bir MEB taksonomisi iddiasi DEGILDIR;
-- veri akisini dogrulamak icin gecici kategori-seviyesi kanittir.
--
-- VERI AKISI:
--   complete_game_session -> session_answers INSERT -> trg_record_outcome_evidence
--   -> user_outcome_state UPSERT
-- Trigger ayni complete_game_session transaction'i icinde calistigi icin oturum
-- kaydi rollback olursa kazanim kaniti da rollback olur.
--
-- Gecikmeli kanit: mevcut cevap dogruysa ve ayni soru en az 24 saat once daha
-- once gorulmusse 1 artar. Onceki cevabin dogru olmasi aranmaz; olculen sey,
-- aradan zaman gectikten sonraki BASARILI geri getirmedir.
--
-- NOT: Bu migration tarihsel session_answers verisini backfill etmez. Backfill
-- ayri, gozlenebilir bir prod-write olarak uygulanmalidir. Boylece migration
-- kisa surer ve buyuk tablo kilidi gizlice deploy'a girmez.

BEGIN;

CREATE TABLE IF NOT EXISTS public.curriculum_outcomes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(40) NOT NULL UNIQUE,
  game        VARCHAR(20) NOT NULL CHECK (game IN (
                'wordquest', 'matematik', 'turkce', 'fen', 'sosyal'
              )),
  category    VARCHAR(30) NOT NULL,
  title       VARCHAR(160) NOT NULL,
  description TEXT,
  exam_ref    VARCHAR(20),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_curriculum_outcomes_game_exam_active
  ON public.curriculum_outcomes (game, exam_ref, sort_order)
  WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS public.question_outcomes (
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  outcome_id  UUID NOT NULL REFERENCES public.curriculum_outcomes(id) ON DELETE CASCADE,
  weight      NUMERIC(6,3) NOT NULL DEFAULT 1 CHECK (weight > 0),
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (question_id, outcome_id)
);

CREATE INDEX IF NOT EXISTS idx_question_outcomes_outcome
  ON public.question_outcomes (outcome_id, question_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_question_outcomes_one_primary
  ON public.question_outcomes (question_id)
  WHERE is_primary = TRUE;

CREATE TABLE IF NOT EXISTS public.user_outcome_state (
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  outcome_id        UUID NOT NULL REFERENCES public.curriculum_outcomes(id) ON DELETE CASCADE,
  attempts          INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  correct_attempts  INTEGER NOT NULL DEFAULT 0 CHECK (
                      correct_attempts >= 0 AND correct_attempts <= attempts
                    ),
  weighted_earned   NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (weighted_earned >= 0),
  weighted_possible NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (
                      weighted_possible >= 0 AND weighted_earned <= weighted_possible
                    ),
  delayed_correct   INTEGER NOT NULL DEFAULT 0 CHECK (
                      delayed_correct >= 0 AND delayed_correct <= correct_attempts
                    ),
  last_answered_at  TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, outcome_id)
);

CREATE INDEX IF NOT EXISTS idx_user_outcome_state_outcome
  ON public.user_outcome_state (outcome_id, user_id);

-- Delayed-evidence EXISTS sorgusu her cevapta user+soru+zaman arar. Tek-kolon
-- indexleri birlestirmeye guvenmek yerine hot-path'e uygun composite index.
CREATE INDEX IF NOT EXISTS idx_answers_user_question_time
  ON public.session_answers (user_id, question_id, answered_at DESC);

ALTER TABLE public.curriculum_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_outcome_state ENABLE ROW LEVEL SECURITY;

-- Browser bu tablolara dogrudan gitmez; /api/profile/mastery yalniz auth.uid()
-- icin service-role ile okur. DML ise sadece trigger/service-role yoludur.
REVOKE ALL ON public.curriculum_outcomes FROM anon, authenticated;
REVOKE ALL ON public.question_outcomes FROM anon, authenticated;
REVOKE ALL ON public.user_outcome_state FROM anon, authenticated;
GRANT ALL ON public.curriculum_outcomes TO service_role;
GRANT ALL ON public.question_outcomes TO service_role;
GRANT ALL ON public.user_outcome_state TO service_role;

CREATE OR REPLACE FUNCTION public.record_outcome_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_delayed_correct BOOLEAN;
BEGIN
  v_is_delayed_correct := NEW.is_correct AND EXISTS (
    SELECT 1
    FROM public.session_answers AS previous_answer
    WHERE previous_answer.user_id = NEW.user_id
      AND previous_answer.question_id = NEW.question_id
      AND previous_answer.id <> NEW.id
      AND previous_answer.answered_at <= NEW.answered_at - INTERVAL '24 hours'
  );

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
    NEW.user_id,
    mapping.outcome_id,
    1,
    CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
    CASE WHEN NEW.is_correct THEN mapping.weight ELSE 0 END,
    mapping.weight,
    CASE WHEN v_is_delayed_correct THEN 1 ELSE 0 END,
    NEW.answered_at,
    NOW()
  FROM public.question_outcomes AS mapping
  JOIN public.curriculum_outcomes AS outcome ON outcome.id = mapping.outcome_id
  WHERE mapping.question_id = NEW.question_id
    AND outcome.is_active = TRUE
  ON CONFLICT (user_id, outcome_id) DO UPDATE SET
    attempts = public.user_outcome_state.attempts + EXCLUDED.attempts,
    correct_attempts = public.user_outcome_state.correct_attempts + EXCLUDED.correct_attempts,
    weighted_earned = public.user_outcome_state.weighted_earned + EXCLUDED.weighted_earned,
    weighted_possible = public.user_outcome_state.weighted_possible + EXCLUDED.weighted_possible,
    delayed_correct = public.user_outcome_state.delayed_correct + EXCLUDED.delayed_correct,
    last_answered_at = GREATEST(
      public.user_outcome_state.last_answered_at,
      EXCLUDED.last_answered_at
    ),
    updated_at = NOW();

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_outcome_evidence() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_outcome_evidence() TO service_role;

DROP TRIGGER IF EXISTS trg_record_outcome_evidence ON public.session_answers;
CREATE TRIGGER trg_record_outcome_evidence
  AFTER INSERT ON public.session_answers
  FOR EACH ROW EXECUTE FUNCTION public.record_outcome_evidence();

-- Kaba pilot outcome. ON CONFLICT UPDATE ile metin/etiket duzeltmeleri migration
-- tekrarinda guvenli bicimde tek satirda kalir.
INSERT INTO public.curriculum_outcomes (
  code, game, category, title, description, exam_ref, sort_order, is_active
)
VALUES (
  'MAT-SAY-01',
  'matematik',
  'sayilar',
  'Sayılar ve işlem becerisi (pilot)',
  'TYT Matematik sayılar kategorisi için geçici, kategori-seviyesi pilot kanıt. Resmî kazanım taksonomisi değildir.',
  'TYT',
  10,
  TRUE
)
ON CONFLICT (code) DO UPDATE SET
  game = EXCLUDED.game,
  category = EXCLUDED.category,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  exam_ref = EXCLUDED.exam_ref,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

INSERT INTO public.question_outcomes (question_id, outcome_id, weight, is_primary)
SELECT
  question.id,
  outcome.id,
  1,
  NOT EXISTS (
    SELECT 1
    FROM public.question_outcomes AS existing_primary
    WHERE existing_primary.question_id = question.id
      AND existing_primary.is_primary = TRUE
      AND existing_primary.outcome_id <> outcome.id
  )
FROM public.questions AS question
JOIN public.curriculum_outcomes AS outcome ON outcome.code = 'MAT-SAY-01'
WHERE question.game = 'matematik'
  AND question.category = 'sayilar'
  AND UPPER(question.exam_ref) = 'TYT'
  AND question.is_active = TRUE
ON CONFLICT (question_id, outcome_id) DO UPDATE SET
  weight = EXCLUDED.weight,
  is_primary = EXCLUDED.is_primary;

NOTIFY pgrst, 'reload schema';

COMMIT;
