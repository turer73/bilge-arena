-- Migration 035: auth_rls_initplan performans optimizasyonu (PR-P.1)
--
-- Sorun (Supabase Advisor lint=0003 "auth_rls_initplan"):
--   RLS policy'lerinde auth.uid() / auth.role() / auth.jwt() direkt cagrildiginda
--   PostgreSQL planner her satir icin yeniden cagirir. (SELECT auth.uid()) ile
--   sarildiginda planner bunu InitPlan node olarak isaretler ve SORGU BASINA
--   bir kez calistirir. Buyuk tablolarda (questions, user_question_history,
--   xp_log) bu fark belirgin.
--
--   Resmi referans:
--   https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- Etkilenen scope:
--   public schema'sindaki TUM RLS policy'ler. Yaklasik 50 policy etkili. Buton
--   tablolar:
--     - profiles, game_sessions, session_answers, user_badges,
--     - user_topic_progress, user_daily_quests, xp_log,
--     - user_question_history, leaderboard_weekly,
--     - comments, comment_likes, question_likes,
--     - error_reports, consent_logs, push_subscriptions,
--     - friendships, referral_rewards, challenges,
--     - questions, user_roles, role_permissions, roles,
--     - admin_logs, site_settings, homepage_sections, homepage_elements
--
-- Yaklasim (introspection-based):
--   1) pg_policy'den tum public RLS policy'lerini oku, auth.X() iceren ve
--      henuz (SELECT auth.X()) ile sarilmamis olanlari sec.
--   2) Snapshot'i temp table'a kaydet (FOR loop sirasinda pg_policy degisirse
--      re-evaluation problemi olmasin diye).
--   3) Her policy icin: DROP + CREATE yeni qual/with_check ile, pattern
--      regexp_replace ile auth.X() -> (SELECT auth.X()).
--   4) Verification DO block: hala unwrapped auth.X() iceren policy var mi
--      kontrol et, varsa migration EXCEPTION fail.
--
-- Neden enumerated yerine programmatic:
--   - 50 policy: 200+ satir DROP/CREATE vs 80 satir tek DO block
--   - Idempotent: WHERE filter zaten sarilmis policy'leri atlar, yeniden
--     calistirilirsa no-op
--   - Self-validating: Sona eklenen verification block uygulamayi sigortalar
--   - Insan hatasina karsi dirençli: yeni policy eklenirse ileri tarihte
--     re-run ile temizlenebilir
--
-- Davranis degisikligi YOK:
--   (SELECT auth.uid()) literal olarak ayni UUID'i dondurur (sadece bir kez
--   degil her satir icin yerine bir kez). RLS karari ayni kalir.
--
-- Rollback:
--   pg_get_expr donen orjinal qual/with_check tabloda kaydedilmedi. Rollback
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
--        AND pg_get_expr(p.polqual, p.polrelid) NOT LIKE '%(SELECT auth.%')
--       OR
--       (pg_get_expr(p.polwithcheck, p.polrelid) ~ 'auth\.(uid|role|jwt)\(\)'
--        AND pg_get_expr(p.polwithcheck, p.polrelid) NOT LIKE '%(SELECT auth.%')
--     );
--   -- beklenen: 0 satir
--
--   -- Advisor: Database -> Advisors -> Performance -> Rerun
--   -- beklenen: auth_rls_initplan uyarilari sayisi 0 (veya cok dusuk -- not
--   --           public schema'da kalmis edge case varsa)


BEGIN;

-- 1) Snapshot tablosu: looplama sirasinda pg_policy degisecegi icin
CREATE TEMP TABLE _pr_p1_targets ON COMMIT DROP AS
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
     AND pg_get_expr(p.polqual, p.polrelid) NOT LIKE '%(SELECT auth.%')
    OR
    (pg_get_expr(p.polwithcheck, p.polrelid) ~ 'auth\.(uid|role|jwt)\(\)'
     AND pg_get_expr(p.polwithcheck, p.polrelid) NOT LIKE '%(SELECT auth.%')
  );

-- 2) Her policy icin DROP + CREATE
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
  full_stmt text;
  fix_count int := 0;
BEGIN
  FOR pol IN SELECT * FROM _pr_p1_targets ORDER BY tablename, policyname LOOP
    -- auth.X() -> (SELECT auth.X()) donusumu
    new_qual := pol.qual;
    new_check := pol.with_check;

    IF new_qual IS NOT NULL THEN
      new_qual := regexp_replace(new_qual, 'auth\.uid\(\)', '(SELECT auth.uid())', 'g');
      new_qual := regexp_replace(new_qual, 'auth\.role\(\)', '(SELECT auth.role())', 'g');
      new_qual := regexp_replace(new_qual, 'auth\.jwt\(\)', '(SELECT auth.jwt())', 'g');
    END IF;

    IF new_check IS NOT NULL THEN
      new_check := regexp_replace(new_check, 'auth\.uid\(\)', '(SELECT auth.uid())', 'g');
      new_check := regexp_replace(new_check, 'auth\.role\(\)', '(SELECT auth.role())', 'g');
      new_check := regexp_replace(new_check, 'auth\.jwt\(\)', '(SELECT auth.jwt())', 'g');
    END IF;

    -- CMD keyword
    cmd_keyword := CASE pol.polcmd
      WHEN '*' THEN 'ALL'
      WHEN 'r' THEN 'SELECT'
      WHEN 'a' THEN 'INSERT'
      WHEN 'w' THEN 'UPDATE'
      WHEN 'd' THEN 'DELETE'
    END;

    -- PERMISSIVE / RESTRICTIVE
    permissive_keyword := CASE WHEN pol.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END;

    -- TO roles clause (oid 0 = PUBLIC, atlamali)
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

    -- DROP eski
    EXECUTE format('DROP POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);

    -- CREATE yeni
    full_stmt := format('CREATE POLICY %I ON %I.%I AS %s FOR %s%s%s%s',
      pol.policyname,
      pol.schemaname,
      pol.tablename,
      permissive_keyword,
      cmd_keyword,
      roles_clause,
      using_clause,
      check_clause
    );

    EXECUTE full_stmt;
    fix_count := fix_count + 1;
  END LOOP;

  RAISE NOTICE 'PR-P.1: % policies migrated to (SELECT auth.X()) pattern', fix_count;
END $$;

-- 3) Verification: hala unwrapped auth.X() iceren policy varsa migration FAIL
DO $$
DECLARE
  remaining_count int;
BEGIN
  SELECT count(*) INTO remaining_count
  FROM pg_policy p
  JOIN pg_class c ON p.polrelid = c.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = 'public'
    AND (
      (pg_get_expr(p.polqual, p.polrelid) ~ 'auth\.(uid|role|jwt)\(\)'
       AND pg_get_expr(p.polqual, p.polrelid) NOT LIKE '%(SELECT auth.%')
      OR
      (pg_get_expr(p.polwithcheck, p.polrelid) ~ 'auth\.(uid|role|jwt)\(\)'
       AND pg_get_expr(p.polwithcheck, p.polrelid) NOT LIKE '%(SELECT auth.%')
    );

  IF remaining_count > 0 THEN
    RAISE EXCEPTION 'PR-P.1 INCOMPLETE: % policies still have unwrapped auth.X() calls', remaining_count;
  END IF;

  RAISE NOTICE 'PR-P.1 verification PASSED: 0 unwrapped auth.X() policies remain';
END $$;

COMMIT;
