-- Migration 036: multiple_permissive_policies konsolidasyonu (PR-P.2)
--
-- Sorun (Supabase Advisor lint=0006 "multiple_permissive_policies"):
--   Ayni (tablo, command, role) icin birden fazla PERMISSIVE policy varsa
--   PostgreSQL planner her birini ayri OR condition olarak query plan'ina
--   ekler. Tek birlesik policy daha az planner is yuku ve daha okunakli plan
--   demektir.
--
--   Resmi referans:
--   https://supabase.com/docs/guides/database/postgres/row-level-security#multiple-permissive-policies
--
-- Tani (Advisor 2026-04-25 raporu):
--   5 tabloda 5 SELECT-consolidation:
--     1) error_reports:        select_own + select_admin_rbac      -> birlestir
--     2) homepage_elements:    public_read + admin_read            -> birlestir
--     3) homepage_sections:    public_read + admin_read            -> birlestir
--     4) questions:            select_all + select_admin_rbac      -> birlestir
--     5) user_roles:           select_own + select_admin           -> birlestir
--
-- Yaklasim:
--   Her tablo icin: DROP eski iki SELECT policy + CREATE tek birlesik policy
--   USING (cond_owner OR cond_admin). Davranis aynidir (OR mantigi korunur),
--   planner tek policy gorur. Diger cmd policy'leri (INSERT/UPDATE/DELETE)
--   degismez.
--
-- v3 sonrasi durum:
--   Migration 035 v3 (PR-P.1) tum auth.X() cagrilarini (select auth.X()) ile
--   sardi. Bu migration o pattern'i koruyarak yazilir; yeni birlesik USING
--   ifadesi (select auth.uid()) = user_id formunda olur.
--
-- Davranis degisikligi YOK:
--   OR(P1, P2) mantigi PERMISSIVE policy'lerde zaten iki policy ile
--   sagleniyordu (her policy ayri ayri PERMISSIVE -> herhangi biri TRUE
--   ise satir gorunur). Tek policy USING (P1 OR P2) ayni satirlari dondurur.
--
-- Rollback:
--   Migration 003 (error_reports), 016b (user_roles, homepage_*), 029
--   (questions) original CREATE POLICY ifadeleri manuel re-run edilebilir.
--   Pratikte gerek yok: davranis aynidir.
--
-- Dogrulama (apply sonrasi):
--   -- Aynı (tablo, cmd, role) icin coklu permissive policy:
--   SELECT schemaname, tablename, cmd, roles, count(*) AS policy_count
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND permissive = 'PERMISSIVE'
--   GROUP BY schemaname, tablename, cmd, roles
--   HAVING count(*) > 1;
--   -- beklenen: 0 satir (5 hedef tabloda tek SELECT policy kaldi)
--
--   -- Advisor: Database -> Advisors -> Performance -> Rerun
--   -- beklenen: multiple_permissive_policies uyari sayisi 0


BEGIN;

-- =============================================================================
-- 1) error_reports: select_own + select_admin_rbac -> tek SELECT
-- =============================================================================
-- Eski policy'ler:
--   error_reports_select_own       (003): USING ((select auth.uid()) = user_id)
--   error_reports_select_admin_rbac(025): USING (has_permission((select auth.uid()), 'admin.reports.view'))
DROP POLICY IF EXISTS "error_reports_select_own"        ON public.error_reports;
DROP POLICY IF EXISTS "error_reports_select_admin_rbac" ON public.error_reports;

CREATE POLICY "error_reports_select" ON public.error_reports
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) = user_id
    OR public.has_permission((select auth.uid()), 'admin.reports.view')
  );


-- =============================================================================
-- 2) homepage_elements: public_read + admin_read -> tek SELECT
-- =============================================================================
-- Eski policy'ler (016b):
--   homepage_elements_public_read: USING (is_published = true)
--   homepage_elements_admin_read:  USING (has_permission((select auth.uid()), 'admin.homepage.view'))
DROP POLICY IF EXISTS "homepage_elements_public_read" ON public.homepage_elements;
DROP POLICY IF EXISTS "homepage_elements_admin_read"  ON public.homepage_elements;

CREATE POLICY "homepage_elements_select" ON public.homepage_elements
  FOR SELECT
  USING (
    is_published = true
    OR public.has_permission((select auth.uid()), 'admin.homepage.view')
  );


-- =============================================================================
-- 3) homepage_sections: public_read + admin_read -> tek SELECT
-- =============================================================================
-- Eski policy'ler (016b):
--   homepage_sections_public_read: USING (is_published = true)
--   homepage_sections_admin_read:  USING (has_permission((select auth.uid()), 'admin.homepage.view'))
DROP POLICY IF EXISTS "homepage_sections_public_read" ON public.homepage_sections;
DROP POLICY IF EXISTS "homepage_sections_admin_read"  ON public.homepage_sections;

CREATE POLICY "homepage_sections_select" ON public.homepage_sections
  FOR SELECT
  USING (
    is_published = true
    OR public.has_permission((select auth.uid()), 'admin.homepage.view')
  );


-- =============================================================================
-- 4) questions: select_all + select_admin_rbac -> tek SELECT
-- =============================================================================
-- Eski policy'ler:
--   questions_select_all       (schema.sql / 011): USING (is_active = true)
--   questions_select_admin_rbac(029):              USING (has_permission((select auth.uid()), 'admin.questions.view'))
DROP POLICY IF EXISTS "questions_select_all"        ON public.questions;
DROP POLICY IF EXISTS "questions_select_admin_rbac" ON public.questions;

CREATE POLICY "questions_select" ON public.questions
  FOR SELECT
  USING (
    is_active = true
    OR public.has_permission((select auth.uid()), 'admin.questions.view')
  );


-- =============================================================================
-- 5) user_roles: select_own + select_admin -> tek SELECT
-- =============================================================================
-- Eski policy'ler (016b):
--   user_roles_select_own:   USING (user_id = (select auth.uid()))
--   user_roles_select_admin: USING (has_permission((select auth.uid()), 'admin.roles.view'))
DROP POLICY IF EXISTS "user_roles_select_own"   ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_admin" ON public.user_roles;

CREATE POLICY "user_roles_select" ON public.user_roles
  FOR SELECT
  USING (
    user_id = (select auth.uid())
    OR public.has_permission((select auth.uid()), 'admin.roles.view')
  );


-- =============================================================================
-- Verification: Ayni (tablo, cmd, roles, permissive=true) icin coklu policy
-- kalmadiysa migration basarili.
-- =============================================================================
DO $$
DECLARE
  remaining_count int;
  conflict_row record;
BEGIN
  SELECT count(*) INTO remaining_count
  FROM (
    SELECT schemaname, tablename, cmd, roles
    FROM pg_policies
    WHERE schemaname = 'public'
      AND permissive = 'PERMISSIVE'
    GROUP BY schemaname, tablename, cmd, roles
    HAVING count(*) > 1
  ) AS conflicts;

  IF remaining_count > 0 THEN
    RAISE NOTICE 'PR-P.2 INCOMPLETE: % residual multiple_permissive_policies groups', remaining_count;
    FOR conflict_row IN
      SELECT schemaname, tablename, cmd, roles, count(*) AS pol_count
      FROM pg_policies
      WHERE schemaname = 'public'
        AND permissive = 'PERMISSIVE'
      GROUP BY schemaname, tablename, cmd, roles
      HAVING count(*) > 1
      ORDER BY tablename, cmd
    LOOP
      RAISE NOTICE '  - %.% cmd=% roles=% count=%',
        conflict_row.schemaname, conflict_row.tablename,
        conflict_row.cmd, conflict_row.roles, conflict_row.pol_count;
    END LOOP;
    -- Not fail-fast: Advisor olasi diger tablolari da raporlamis olabilir,
    -- bu migration sadece 5 hedef tablo icin yazildi. Loglayip devam et.
  ELSE
    RAISE NOTICE 'PR-P.2 verification PASSED: 0 multiple_permissive_policies groups remain';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- Not (2026-04-25, PR-P.2): Bu migration sadece 5 hedef tabloyu konsolide eder.
-- Eger Advisor rapor sonrasi farkli tablolarda hala uyari kalirsa, ek migration
-- (037) ile genisletilebilir. Verification block fail-fast yapmaz, sadece
-- residual gruplari log'lar -- prod-apply'i bloke etmeden gelecek migration
-- icin envanter saglar.
--
-- v3 (PR-P.1) sonrasi bu migration'i uygulamak guvenli: tum auth.X() cagrilari
-- zaten (select auth.X()) ile sarildi, yeni birlesik USING ifadeleri ayni
-- pattern'i korur.
-- =============================================================================
