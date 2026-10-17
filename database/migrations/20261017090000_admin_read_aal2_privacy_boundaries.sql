-- 2026-10-17: derin inceleme (2026-10-15) aksiyon 8 - yetki ve veri gizliligi.
--
-- 1. Admin OKUMALARI AAL2 ister. 161 ve 171 admin yazmalarini kapatti; okuma
--    politikalari ise yalniz has_permission'a bakiyordu. Parolasi calinmis ama
--    TOTP'si calinmamis bir admin hesabi AAL1 JWT ve anon anahtarla
--    /rest/v1/admin_logs (e-postalar, kurum islemleri), baskalarinin
--    error_reports ve user_roles satirlarini ve site_settings'i okuyabiliyordu.
--    Kendi satirlari (error_reports, user_roles) AAL1'de okunmaya devam eder:
--    checkPermission ve hata raporu akisi bunlara dayanir. Uygulamanin admin
--    okumalari /admin ve /api/admin altinda proxy'nin AAL2 kapisindan gectigi
--    icin bu degisiklik onlari etkilemez.
-- 2. search_profiles_admin (silinmis hesaplar dahil profil arama) AAL2 ister.
-- 3. search_questions'in admin olmayan dali kara liste yerine beyaz liste
--    kullanir. Kara liste coach, misconceptions, hint1, hint2 ve miniExample'i
--    birakiyordu; misconceptions dizisindeki null indeks dogru siktir. Beyaz
--    liste uygulamanin public projeksiyonuyla (question-public.ts) aynidir.
-- 4. comments tablosuna istemci yazamaz. Tum okuma ve yazma /api/comments
--    route'larinda service-role ile yapilir; anon ve authenticated'daki
--    INSERT/UPDATE/DELETE/TRUNCATE (ve anon SELECT) PostgREST ile route'taki
--    limit ve tekrar engelini atlatiyordu (created_at 2099, likes_count 9999).
--    Kalip: 075 comment_likes.
-- 5. anon'un admin tablolarindaki artik SELECT grant'leri kaldirilir.
--    Politikalar anon'a zaten satir dondurmuyordu; savunma derinligi.

BEGIN;

-- 1. Admin okuma politikalari: izin + AAL2. Kendi satiri AAL1'de kalir.
DROP POLICY IF EXISTS "admin_logs_select_rbac" ON public.admin_logs;
CREATE POLICY "admin_logs_select_rbac" ON public.admin_logs
  FOR SELECT
  USING (
    (SELECT coalesce(auth.jwt() ->> 'aal', 'aal1')) = 'aal2'
    AND (SELECT public.has_permission((SELECT auth.uid()), 'admin.logs.view'))
  );

DROP POLICY IF EXISTS "error_reports_select" ON public.error_reports;
CREATE POLICY "error_reports_select" ON public.error_reports
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR (
      (SELECT coalesce(auth.jwt() ->> 'aal', 'aal1')) = 'aal2'
      AND (SELECT public.has_permission((SELECT auth.uid()), 'admin.reports.view'))
    )
  );

DROP POLICY IF EXISTS "site_settings_select_rbac" ON public.site_settings;
CREATE POLICY "site_settings_select_rbac" ON public.site_settings
  FOR SELECT
  USING (
    (SELECT coalesce(auth.jwt() ->> 'aal', 'aal1')) = 'aal2'
    AND (SELECT public.has_permission((SELECT auth.uid()), 'admin.settings.view'))
  );

DROP POLICY IF EXISTS "user_roles_select" ON public.user_roles;
CREATE POLICY "user_roles_select" ON public.user_roles
  FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    OR (
      (SELECT coalesce(auth.jwt() ->> 'aal', 'aal1')) = 'aal2'
      AND (SELECT public.has_permission((SELECT auth.uid()), 'admin.roles.view'))
    )
  );

-- 5. anon admin tablolarini hic okumaz.
REVOKE SELECT ON TABLE public.admin_logs, public.error_reports, public.site_settings, public.user_roles
  FROM PUBLIC, anon;

-- 2. Profil aramasi: izin + AAL2 (165'teki search_questions kalibi).
CREATE OR REPLACE FUNCTION public.search_profiles_admin(
  q text DEFAULT NULL::text,
  result_offset integer DEFAULT 0,
  result_limit integer DEFAULT 20
)
RETURNS TABLE(
  id uuid, username character varying, display_name character varying, avatar_url text,
  total_xp integer, level smallint, current_streak smallint, correct_answers integer,
  total_questions integer, created_at timestamp with time zone,
  deleted_at timestamp with time zone, role text, total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  -- Silinmis hesaplar dahil profil listesi ayricalikli okumadir. Rol tek basina
  -- yetmez; AAL2 olmadan dogrudan PostgREST cagrisi da fail-closed reddedilir.
  IF COALESCE(auth.jwt() ->> 'aal', 'aal1') <> 'aal2'
    OR auth.uid() IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role_id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND rp.permission = 'admin.users.view'
    ) THEN
    RAISE EXCEPTION 'admin privileges with aal2 required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      p.id, p.username, p.display_name, p.avatar_url, p.total_xp, p.level,
      p.current_streak, p.correct_answers, p.total_questions, p.created_at,
      p.deleted_at, p.role,
      COUNT(*) OVER() AS total_count
    FROM public.profiles p
    WHERE (
      q IS NULL OR q = ''
      OR public.immutable_unaccent(p.display_name) ILIKE public.immutable_unaccent('%' || q || '%')
      OR public.immutable_unaccent(p.username) ILIKE public.immutable_unaccent('%' || q || '%')
    )
    AND p.username NOT LIKE '\_\_honeypot\_%\_\_' ESCAPE '\'
    ORDER BY p.created_at DESC
    OFFSET GREATEST(result_offset, 0)
    LIMIT LEAST(GREATEST(result_limit, 1), 100);
END
$fn$;

REVOKE ALL ON FUNCTION public.search_profiles_admin(text, integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_profiles_admin(text, integer, integer)
  TO authenticated, service_role;

-- 3. Soru aramasi: admin olmayan dal yalniz bu alanlari tasir.
CREATE OR REPLACE FUNCTION public.search_questions(
  search_q text DEFAULT NULL::text,
  game_filter text DEFAULT NULL::text,
  category_filter text DEFAULT NULL::text,
  difficulty_filter integer DEFAULT NULL::integer,
  active_filter boolean DEFAULT NULL::boolean,
  admin_view boolean DEFAULT false,
  result_offset integer DEFAULT 0,
  result_limit integer DEFAULT 20
)
RETURNS TABLE(
  id uuid, external_id character varying, game character varying,
  category character varying, subcategory character varying, topic character varying,
  difficulty smallint, level_tag character varying, content jsonb,
  is_active boolean, is_boss boolean, source character varying,
  exam_ref character varying, times_answered integer, times_correct integer,
  created_at timestamp with time zone, total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  -- Ham cevap projeksiyonu ayricalikli okumadir. Rol tek basina yetmez; JWT
  -- AAL2 olmadan dogrudan PostgREST RPC cagrisi da fail-closed reddedilir.
  IF admin_view = TRUE THEN
    IF COALESCE(auth.jwt() ->> 'aal','aal1') <> 'aal2'
      OR auth.uid() IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.role_permissions rp ON rp.role_id = ur.role_id
        WHERE ur.user_id = auth.uid()
          AND rp.permission = 'admin.dashboard.view'
      ) THEN
      RAISE EXCEPTION 'admin_view requires aal2 admin privileges'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
    SELECT
      q.id,q.external_id,q.game,q.category,q.subcategory,q.topic,q.difficulty,
      q.level_tag,
      CASE WHEN admin_view = TRUE THEN q.content
        WHEN jsonb_typeof(q.content) <> 'object' THEN '{}'::jsonb
        -- Beyaz liste: cevap anahtari, cozum, ipucu ve coach icerigi hicbir
        -- kosulda bu daldan cikmaz; yeni bir icerik alani da varsayilan olarak
        -- disarida kalir.
        ELSE COALESCE((
          SELECT jsonb_object_agg(field.key, field.value)
          FROM jsonb_each(q.content) AS field
          WHERE field.key IN ('question','options','sentence','passage','context','type')
        ), '{}'::jsonb)
      END AS content,
      q.is_active,q.is_boss,q.source,q.exam_ref,q.times_answered,q.times_correct,
      q.created_at,COUNT(*) OVER() AS total_count
    FROM public.questions q
    WHERE (game_filter IS NULL OR q.game = game_filter)
      AND (category_filter IS NULL OR q.category = category_filter)
      AND (difficulty_filter IS NULL OR q.difficulty = difficulty_filter)
      AND (active_filter IS NULL OR q.is_active = active_filter)
      AND (admin_view = TRUE OR q.is_active = TRUE)
      AND (
        search_q IS NULL OR search_q = ''
        OR public.immutable_unaccent(q.content->>'question')
          ILIKE public.immutable_unaccent('%' || search_q || '%')
        OR public.immutable_unaccent(q.content->>'sentence')
          ILIKE public.immutable_unaccent('%' || search_q || '%')
      )
    ORDER BY q.created_at DESC
    OFFSET GREATEST(result_offset,0)
    LIMIT LEAST(GREATEST(result_limit,1),100);
END
$fn$;

REVOKE ALL ON FUNCTION public.search_questions(text,text,text,integer,boolean,boolean,integer,integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_questions(text,text,text,integer,boolean,boolean,integer,integer)
  TO authenticated, service_role;

-- 4. Yorumlar yalniz service-role route'larindan yazilir ve okunur.
REVOKE ALL ON TABLE public.comments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.comments TO service_role;

DO $verify$
DECLARE
  v_table text;
  v_policy record;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['admin_logs','error_reports','site_settings','user_roles'] LOOP
    IF has_table_privilege('anon', format('public.%I', v_table), 'SELECT') THEN
      RAISE EXCEPTION '20261017090000 verification: anon still reads %', v_table;
    END IF;
  END LOOP;

  FOR v_policy IN
    SELECT tablename, policyname, qual
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND (tablename, policyname) IN (
        ('admin_logs','admin_logs_select_rbac'), ('error_reports','error_reports_select'),
        ('site_settings','site_settings_select_rbac'), ('user_roles','user_roles_select')
      )
  LOOP
    IF v_policy.qual !~ 'aal2' THEN
      RAISE EXCEPTION '20261017090000 verification: % read policy lacks aal2', v_policy.tablename;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_catalog.pg_policies WHERE schemaname = 'public'
      AND policyname IN ('admin_logs_select_rbac','error_reports_select','site_settings_select_rbac','user_roles_select')) <> 4 THEN
    RAISE EXCEPTION '20261017090000 verification: admin read policies missing';
  END IF;

  IF has_table_privilege('anon', 'public.comments', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    OR has_table_privilege('authenticated', 'public.comments', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    OR NOT has_table_privilege('service_role', 'public.comments', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.comments', 'INSERT')
    OR NOT has_table_privilege('service_role', 'public.comments', 'UPDATE')
    OR NOT has_table_privilege('service_role', 'public.comments', 'DELETE') THEN
    RAISE EXCEPTION '20261017090000 verification: comments grants invalid';
  END IF;

  IF has_function_privilege('anon', 'public.search_profiles_admin(text,integer,integer)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.search_questions(text,text,text,integer,boolean,boolean,integer,integer)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.search_questions(text,text,text,integer,boolean,boolean,integer,integer)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.search_questions(text,text,text,integer,boolean,boolean,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION '20261017090000 verification: search RPC grants invalid';
  END IF;
END
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';
