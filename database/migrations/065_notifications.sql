-- Migration 065: In-app bildirim sistemi (UGC Faz-2)
--
-- Onaylanan/reddedilen UGC gonderimi gibi olaylarda kullaniciya in-app
-- bildirim. RLS: kullanici yalnizca KENDI bildirimlerini okur; yazma (insert)
-- ve okundu-isaretleme yalnizca service-role (Madde 9 proxy paterni —
-- okundu API server-side auth + ownership dogrular).

BEGIN;

CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- 'submission_approved' | 'submission_rejected' | ... (genisletilebilir)
  type       text NOT NULL,
  title      text NOT NULL,
  body       text,
  -- in-app deep link (ornek: /arena/soru-gonder veya /arena/profil)
  link       text,
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Yazma yalnizca service-role; client SELECT-only
REVOKE ALL ON public.notifications FROM anon;
REVOKE ALL ON public.notifications FROM authenticated;
GRANT SELECT ON public.notifications TO authenticated;

COMMIT;
