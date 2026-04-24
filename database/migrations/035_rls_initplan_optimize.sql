-- Migration 035: auth_rls_initplan performans optimizasyonu (PR-P.1) v3
--
-- Sorun (Supabase Advisor lint=0003 "auth_rls_initplan"):
--   RLS policy'lerinde auth.uid() / auth.role() / auth.jwt() direkt cagrildiginda
--   PostgreSQL planner her satir icin yeniden cagirir. (select auth.uid()) ile
--   sarildiginda planner bunu InitPlan node olarak isaretler ve SORGU BASINA
--   bir kez calistirir. Buyuk tablolarda (questions, user_question_history,
--   xp_log) bu fark belirgin.
--
--   Resmi referans:
--   https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- v1 -> v2 -> v3 evolution:
--   v1 (39f9db3): Iki ayri DO block + CREATE TEMP TABLE ON COMMIT DROP. Prod
--     apply'inda verification 57 unwrapped buldu, transaction rollback.
--     Hipotez: Supabase Dashboard SQL Editor BEGIN..COMMIT script'ini parcalayip
--     her statement'i kendi auto-transaction'inda calistiriyor olabilir. O
--     durumda CREATE TEMP TABLE ON COMMIT DROP -> ilk transaction commit -> tablo
--     drop edilir. Sonraki DO block temp table'i goremez, snapshot 0 satir,
--     fix_count=0, verification orijinal 57 unwrapped'i tekrar bulur.
--
--   v2 (commit edilmedi): 57 explicit ALTER POLICY repo isimleri tahmininde.
--     Local test ettigimde "policy comments_insert_own does not exist" hatasi
--     ile patladi (42704). Repo guess yanlisti, gercek migration 002 isimleri
--     "comments_insert/update/delete" idi (suffix "_own" yok). Repo-canli drift
--     riskine karsi explicit ALTER POLICY yaklasimi savunulamaz.
--
--   v3 (bu versiyon): TEK DO block icinde introspection + fix + verification.
--     - Temp table yok (Dashboard cross-statement temp table sorununa karsi
--       bagisik)
--     - pg_policy dogrudan FOR loop'ta query (snapshot semantigi PL/pgSQL'de
--       loop start anindaki state'i alir)
--     - Her iteration BEGIN..EXCEPTION..END sub-block (savepoint) ile hangi
--       policy'de basarisiz oldugu RAISE EXCEPTION'da bildirilir
--     - Verification ayni DO block icinde, son adimda
--     - Atomic: tum block ya hep ya hic; DO block exception otomatik rollback
--
-- Yaklasim:
--   1) FOR loop pg_policy'den auth.X() iceren, henuz (select auth.X()) ile
--      sarilmamis tum public RLS policy'lerini surveyler.
--   2) Her policy icin: regex_replace ile auth.X() -> (select auth.X()),
--      DROP POLICY + CREATE POLICY aynisini yeni qual/with_check ile yarat.
--   3) Loop sonu RAISE NOTICE fix_count'u bildirir.
--   4) Verification: hala unwrapped auth.X() iceren policy varsa EXCEPTION ->
--      tum migration rollback.
--
-- Davranis degisikligi YOK:
--   (select auth.uid()) literal olarak ayni UUID'i dondurur (sadece sorgu basina
--   bir kez degil her satir icin yerine bir kez). RLS karari ayni kalir.
--
-- Etkilenen scope (Advisor 2026-04-25 raporu, 57 policy):
--   profiles, game_sessions, session_answers, user_badges, user_topic_progress,
--   user_daily_quests, xp_log, user_question_history, leaderboard_weekly
--   (schema.sql); comments, comment_likes, question_likes (002); error_reports
--   (003 + 025); consent_logs (010); push_subscriptions (013); friendships
--   (014); referral_rewards (015); challenges (020); questions (029);
--   user_roles, role_permissions, roles, admin_logs, site_settings,
--   homepage_sections, homepage_elements (016b).
--
-- Rollback:
--   pg_get_expr donen orijinal qual/with_check tabloda kaydedilmedi. Rollback
--   icin migration history'den (002, 003, 010, 013, 014, 015, 016b, 020, 025,
--   029) ilgili CREATE POLICY'ler manuel re-run edilmeli. Production'da
--   rollback ihtiyaci dusuk: davranis aynidir, sadece performans daha iyidir.
--
-- Dogrulama (apply sonrasi):
--   -- Hala unwrapped auth.X() iceren policy:
--   SELECT n.nspname, c.relname, p.polname,
--          pg_get_expr(p.polqual, p.polrelid) AS qual,
--          pg_get_expr(p.polwithcheck, p.polrelid) AS with_check
--   FROM pg_policy p
--   JOIN pg_class c ON p.polrelid = c.oid
--   JOIN pg_namespace n ON c.relnamespace = n.oid
--   WHERE n.nspname = 'public'
--     AND (
--       (pg_get_expr(p.polqual, p.polrelid) ~ 'auth\.(uid|role|jwt)\(\)'
--        AND pg_get_expr(p.polqual, p.polrelid) !~* '\(\s*select\s+auth\.')
--       OR
--       (pg_get_expr(p.polwithcheck, p.polrelid) ~ 'auth\.(uid|role|jwt)\(\)'
--        AND pg_get_expr(p.polwithcheck, p.polrelid) !~* '\(\s*select\s+auth\.')
--     );
--   -- beklenen: 0 satir
--
--   -- Advisor: Database -> Advisors -> Performance -> Rerun
--   -- beklenen: auth_rls_initplan uyarilari sayisi 0


BEGIN;

DO $$
DECLARE
  pol record;
  new_qual text;
  new_check text;
  cmd_keyword text;
  permissive_keyword text;
  roles_clause text;
  using_clause text;
  check_clause text;
  drop_stmt text;
  create_stmt text;
  fix_count int := 0;
  remaining_count int;
BEGIN
  -- 1) Fix loop: auth.X() iceren ve henuz sarilmamis tum policy'ler
  FOR pol IN
    SELECT
      n.nspname AS schemaname,
      c.relname AS tablename,
      p.polname AS policyname,
      p.polcmd,
      p.polpermissive,
      p.polroles,
      pg_get_expr(p.polqual, p.polrelid) AS qual,
      pg_get_expr(p.polwithcheck, p.polrelid) AS with_check
    FROM pg_policy p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND (
        (pg_get_expr(p.polqual, p.polrelid) ~ 'auth\.(uid|role|jwt)\(\)'
         AND pg_get_expr(p.polqual, p.polrelid) !~* '\(\s*select\s+auth\.')
        OR
        (pg_get_expr(p.polwithcheck, p.polrelid) ~ 'auth\.(uid|role|jwt)\(\)'
         AND pg_get_expr(p.polwithcheck, p.polrelid) !~* '\(\s*select\s+auth\.')
      )
    ORDER BY n.nspname, c.relname, p.polname
  LOOP
    BEGIN
      -- auth.X() -> (select auth.X()) donusumu
      new_qual := pol.qual;
      new_check := pol.with_check;

      IF new_qual IS NOT NULL THEN
        new_qual := regexp_replace(new_qual, 'auth\.uid\(\)',  '(select auth.uid())',  'g');
        new_qual := regexp_replace(new_qual, 'auth\.role\(\)', '(select auth.role())', 'g');
        new_qual := regexp_replace(new_qual, 'auth\.jwt\(\)',  '(select auth.jwt())',  'g');
      END IF;

      IF new_check IS NOT NULL THEN
        new_check := regexp_replace(new_check, 'auth\.uid\(\)',  '(select auth.uid())',  'g');
        new_check := regexp_replace(new_check, 'auth\.role\(\)', '(select auth.role())', 'g');
        new_check := regexp_replace(new_check, 'auth\.jwt\(\)',  '(select auth.jwt())',  'g');
      END IF;

      -- CMD keyword (polcmd: '*'=ALL, 'r'=SELECT, 'a'=INSERT, 'w'=UPDATE, 'd'=DELETE)
      cmd_keyword := CASE pol.polcmd
        WHEN '*' THEN 'ALL'
        WHEN 'r' THEN 'SELECT'
        WHEN 'a' THEN 'INSERT'
        WHEN 'w' THEN 'UPDATE'
        WHEN 'd' THEN 'DELETE'
      END;

      -- PERMISSIVE / RESTRICTIVE
      permissive_keyword := CASE WHEN pol.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END;

      -- TO roles clause (polroles: PUBLIC ise NULL veya {0}, atlanmaz; default PUBLIC)
      IF pol.polroles IS NULL OR pol.polroles = '{0}'::oid[] OR array_length(pol.polroles, 1) IS NULL THEN
        roles_clause := '';
      ELSE
        SELECT ' TO ' || string_agg(quote_ident(rolname), ', ' ORDER BY rolname)
          INTO roles_clause
          FROM pg_roles
          WHERE oid = ANY(pol.polroles);
        IF roles_clause IS NULL THEN roles_clause := ''; END IF;
      END IF;

      -- USING / WITH CHECK clauses
      using_clause := CASE WHEN new_qual IS NOT NULL THEN ' USING (' || new_qual || ')' ELSE '' END;
      check_clause := CASE WHEN new_check IS NOT NULL THEN ' WITH CHECK (' || new_check || ')' ELSE '' END;

      drop_stmt := format('DROP POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);

      create_stmt := format('CREATE POLICY %I ON %I.%I AS %s FOR %s%s%s%s',
        pol.policyname,
        pol.schemaname,
        pol.tablename,
        permissive_keyword,
        cmd_keyword,
        roles_clause,
        using_clause,
        check_clause
      );

      EXECUTE drop_stmt;
      EXECUTE create_stmt;
      fix_count := fix_count + 1;

    EXCEPTION
      WHEN OTHERS THEN
        RAISE EXCEPTION 'PR-P.1 failed at %.%.%: % - %  | drop_stmt=[%]  | create_stmt=[%]',
          pol.schemaname, pol.tablename, pol.policyname, SQLSTATE, SQLERRM, drop_stmt, create_stmt;
    END;
  END LOOP;

  RAISE NOTICE 'PR-P.1: % policies migrated to (select auth.X()) pattern', fix_count;

  -- 2) Verification (ayni DO block, ayni transaction)
  SELECT count(*) INTO remaining_count
  FROM pg_policy p
  JOIN pg_class c ON p.polrelid = c.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = 'public'
    AND (
      (pg_get_expr(p.polqual, p.polrelid) ~ 'auth\.(uid|role|jwt)\(\)'
       AND pg_get_expr(p.polqual, p.polrelid) !~* '\(\s*select\s+auth\.')
      OR
      (pg_get_expr(p.polwithcheck, p.polrelid) ~ 'auth\.(uid|role|jwt)\(\)'
       AND pg_get_expr(p.polwithcheck, p.polrelid) !~* '\(\s*select\s+auth\.')
    );

  IF remaining_count > 0 THEN
    RAISE EXCEPTION 'PR-P.1 INCOMPLETE: % policies still have unwrapped auth.X() calls', remaining_count;
  END IF;

  RAISE NOTICE 'PR-P.1 verification PASSED: 0 unwrapped auth.X() policies remain';
END $$;

COMMIT;

-- =============================================================================
-- Not (2026-04-25, PR-P.1 v3): Bu dosyanin v1 versiyonu (commit 39f9db3) prod
-- apply'inda basarisiz oldu. Verification "PR-P.1 INCOMPLETE: 57 policies still
-- have unwrapped auth.X() calls" donerek transaction rollback yapti. Tani:
-- v1 iki ayri DO block ve CREATE TEMP TABLE ON COMMIT DROP kullaniyordu.
-- Dashboard SQL Editor multi-statement script'i muhtemelen her statement'i
-- kendi auto-transaction'inda calistiriyor (ON COMMIT DROP -> ilk statement
-- transaction'i kapaninca temp table dusuyor, sonraki DO block snapshot'i
-- bos goruyor).
--
-- v2 yaklasimi (commit edilmedi): 57 explicit ALTER POLICY repo'daki policy
-- ismi tahminleriyle. Test sirasinda "policy comments_insert_own does not
-- exist" (42704) hatasiyla patladi -- repo'daki gercek isim "comments_insert"
-- idi, suffix "_own" yok. Repo-canli drift'e karsi explicit isim yaklasimi
-- guvenilmez.
--
-- v3 (bu versiyon): Tek DO block, temp table yok, introspection + fix +
-- verification ayni transaction'da. Dashboard'in transaction wrap davranisi
-- ne olursa olsun atomic. Her iteration BEGIN..EXCEPTION..END sub-block ile
-- hangi policy'de hata olursa SQLSTATE/SQLERRM ile rapor edilir.
-- =============================================================================
