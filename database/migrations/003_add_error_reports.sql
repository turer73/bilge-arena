-- Migration 003: Hata raporlama sistemi
-- error_reports tablosu

CREATE TYPE public.report_type AS ENUM (
  'wrong_answer',
  'typo',
  'unclear',
  'duplicate',
  'offensive',
  'other'
);

CREATE TYPE public.report_status AS ENUM (
  'pending',
  'reviewed',
  'resolved',
  'rejected'
);

CREATE TABLE IF NOT EXISTS public.error_reports (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  report_type public.report_type NOT NULL,
  description TEXT CHECK (char_length(description) <= 1000),
  status      public.report_status DEFAULT 'pending',
  admin_note  TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Indexler
CREATE INDEX idx_error_reports_question ON public.error_reports(question_id);
CREATE INDEX idx_error_reports_status ON public.error_reports(status) WHERE status = 'pending';
CREATE INDEX idx_error_reports_user ON public.error_reports(user_id);

-- RLS
ALTER TABLE public.error_reports ENABLE ROW LEVEL SECURITY;

-- Kullanici kendi raporlarini gorebilir
CREATE POLICY "error_reports_select_own" ON public.error_reports
  FOR SELECT USING (auth.uid() = user_id);

-- Giris yapmis kullanici rapor olusturabilir
CREATE POLICY "error_reports_insert" ON public.error_reports
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admin tum raporlari gorebilir
CREATE POLICY "error_reports_select_admin" ON public.error_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admin rapor durumunu guncelleyebilir
CREATE POLICY "error_reports_update_admin" ON public.error_reports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
