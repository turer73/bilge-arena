-- Migration 062: UGC soru gonderimi (flywheel Faz-1 MVP)
--
-- Amac: Topluluk soru onerebilsin; admin moderasyon kuyrugundan gecsin.
-- Onaylanan gonderi questions tablosuna source='ugc', is_active=false ile
-- kopyalanir — aktivasyon mevcut /admin/sorular kalite kapisindan gecer
-- (AI-uretim akisiyla ayni cift-kapi: format onayi != kalite onayi).
--
-- Guvenlik modeli (Madde 9 proxy paterni):
--   * INSERT yalnizca service-role uzerinden (/api/questions/submit:
--     auth + cift rate-limit + validation server-side). Browser->Supabase
--     direkt yazma YOK — anon/authenticated'a INSERT grant verilmiyor.
--   * SELECT: kullanici yalnizca KENDI gonderimlerini gorebilir (RLS).
--   * Moderasyon service-role ile (admin API checkPermission + RL).

BEGIN;

CREATE TABLE IF NOT EXISTS public.question_submissions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game         text NOT NULL CHECK (game IN ('matematik', 'turkce', 'fen', 'sosyal', 'wordquest')),
  category     text NOT NULL,
  difficulty   integer NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  -- { question, options[4-5], answer(int), solution? } — API server-side dogrular
  content      jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note  text,
  reviewed_by  uuid REFERENCES public.profiles(id),
  reviewed_at  timestamptz,
  -- Onaylaninca olusan questions kaydi (izlenebilirlik)
  question_id  uuid REFERENCES public.questions(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_question_submissions_status
  ON public.question_submissions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_question_submissions_user
  ON public.question_submissions (user_id, created_at DESC);

ALTER TABLE public.question_submissions ENABLE ROW LEVEL SECURITY;

-- Kullanici kendi gonderimlerini gorebilir (durum takibi)
DROP POLICY IF EXISTS question_submissions_select_own ON public.question_submissions;
CREATE POLICY question_submissions_select_own
  ON public.question_submissions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Yazma yetkileri yalnizca service-role (default grant'leri temizle)
REVOKE ALL ON public.question_submissions FROM anon;
REVOKE ALL ON public.question_submissions FROM authenticated;
GRANT SELECT ON public.question_submissions TO authenticated;

COMMIT;
