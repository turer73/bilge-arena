-- Migration 004: Admin panel altyapisi
-- profiles.role kolonu, admin_logs, site_settings

-- =============================================
-- 1. profiles tablosuna role kolonu ekle
-- =============================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user'
  CHECK (role IN ('user', 'admin'));

-- =============================================
-- 2. ADMIN_LOGS TABLOSU
-- =============================================
CREATE TABLE IF NOT EXISTS public.admin_logs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id    UUID NOT NULL REFERENCES auth.users(id),
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL, -- 'question', 'user', 'report', 'setting'
  target_id   TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_admin_logs_admin ON public.admin_logs(admin_id, created_at DESC);
CREATE INDEX idx_admin_logs_action ON public.admin_logs(action, created_at DESC);

ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

-- Sadece adminler gorebilir
CREATE POLICY "admin_logs_select" ON public.admin_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Sadece adminler ekleyebilir
CREATE POLICY "admin_logs_insert" ON public.admin_logs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================
-- 3. SITE_SETTINGS TABLOSU
-- =============================================
CREATE TABLE IF NOT EXISTS public.site_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Herkes okuyabilir
CREATE POLICY "site_settings_select" ON public.site_settings
  FOR SELECT USING (true);

-- Sadece admin guncelleyebilir
CREATE POLICY "site_settings_update" ON public.site_settings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "site_settings_insert" ON public.site_settings
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Varsayilan ayarlar
INSERT INTO public.site_settings (key, value) VALUES
  ('maintenance_mode', 'false'::jsonb),
  ('registration_enabled', 'true'::jsonb),
  ('daily_quest_count', '3'::jsonb),
  ('max_chat_messages_guest', '5'::jsonb),
  ('max_chat_messages_user', '20'::jsonb)
ON CONFLICT (key) DO NOTHING;
