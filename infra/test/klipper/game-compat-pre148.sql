DO $$ BEGIN
  IF current_database() <> 'academy_game_test' THEN RAISE EXCEPTION 'Test only'; END IF;
END $$;
-- Required by the repository's private quality-control seed. This identity
-- has no password/provider and is banned; it is not an interactive test login.
INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,banned_until,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
VALUES ('aca00000-0000-4000-8000-000000000148','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'community-quality-worker@bilgearena.invalid',NULL,'2099-01-01',now(),now(),'{}','{"full_name":"Isolated quality seed identity"}');
INSERT INTO public.user_roles(user_id,role_id)
SELECT 'aca00000-0000-4000-8000-000000000148',id FROM public.roles WHERE slug='question_quality_worker';
