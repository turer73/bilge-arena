-- Operator adimi, 148'den once: topluluk kalite worker kimligi.
--
-- Uretimde bu kimlik migration ile degil, Supabase Admin API ile acildi; 148
-- kimlik yoksa 55000 ile durur. Tam zincir yalniz kimligin VARLIGINI taklit
-- eder (sabit test UUID'si, .invalid alan adi, parolasiz). Gercek bir ortam
-- kurulurken bu dosya degil, docs'taki worker kurulum adimi izlenir.
DO $operator$
DECLARE
  v_worker uuid := '00000000-0000-4000-8000-00000000c148';
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (v_worker, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'community-quality-worker@bilgearena.invalid', '{}'::jsonb, '{}'::jsonb, now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, username)
  VALUES (v_worker, 'quality_worker_chain')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role_id)
  SELECT v_worker, role.id FROM public.roles role WHERE role.slug = 'question_quality_worker'
  ON CONFLICT (user_id, role_id) DO NOTHING;
END
$operator$;
