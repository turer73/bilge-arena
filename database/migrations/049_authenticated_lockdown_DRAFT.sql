-- Migration 049: Authenticated SELECT REVOKE (Madde 9 final lockdown)
--
-- ⚠️ DRAFT — DOĞRUDAN APPLY ETME ⚠️
--
-- Bu migration ROLLBACK ile sariliyor cunku prod'a uygulanmadan once asagidaki
-- KONTROL LISTESI tamamlanmali. Yanlis zamanda apply edilirse site kirilir
-- (profile dropdown, leaderboard, quiz, admin paneli vs.).
--
-- ON KOSUL: Tum Madde 9 PR'lari (5-9) merge VE prod'da deploy edilmis olmali:
--   - #74 landing leaderboard
--   - #75 sidebar leaderboard
--   - #81 siralama
--   - #86 topic-strengths
--   - #146 use-auth (profile + sync)
--   - #147 questions/random
--   - #148 profile-stats + difficulty
--   - #149 comments
--   - #150 duello
--
-- VE: docs/runbooks/2026-05-17-madde9-final-lockdown.md'de listelenen smoke
-- test (login + quiz + leaderboard + profil + admin + duello + yorum) prod'da
-- gecmis olmali.
--
-- HALEN AUDIT EDILMESI GEREKEN SERVER-SIDE CAGRILAR (REVOKE oncesi):
--   - src/app/page.tsx           questions.count(*)        (landing ISR)
--   - src/lib/supabase/admin.ts  user_roles + role_permissions (admin check)
--   - src/proxy.ts               user_roles (middleware admin RBAC)
--   - src/app/api/admin/**       (cesitli)
--   - src/app/api/badges/        (BADGE_EVAL)
--   - src/app/api/cron/**        (cesitli)
--
-- Bunlar server-side createClient (cookie/JWT based) kullanir. Authenticated
-- context'inde calisirlar. REVOKE'tan ETKILENIR. Once service-role'a gecirilmeli.
--
-- ROLLBACK PATTERN: Asagidaki BEGIN/EXCEPTION blok'u her zaman ROLLBACK ile
-- biter; hiçbir kalici degisiklik yapilmaz. Apply karari verince son satirdaki
-- "ROLLBACK;"i "COMMIT;" ile degistirin VE asamali apply icin runbook'u takip
-- edin.


-- ============================================================================
--  AUDIT (SAFE — read-only, prod'da koşulabilir)
-- ============================================================================
--
-- Aşağıdaki sorgular hangi tabloda authenticated SELECT GRANT'i var göstermek
-- için. ROLLBACK öncesi koşturun, sonucu runbook'a not düşün.

-- 1) Hangi tablolarda authenticated SELECT var?
SELECT
  table_schema,
  table_name,
  string_agg(privilege_type, ',') AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'authenticated'
  AND privilege_type = 'SELECT'
GROUP BY table_schema, table_name
ORDER BY table_name;

-- 2) Hangi tablolarda anon SELECT var?
SELECT
  table_name,
  string_agg(privilege_type, ',') AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'anon'
  AND privilege_type = 'SELECT'
GROUP BY table_name
ORDER BY table_name;


-- ============================================================================
--  PLANNED REVOKE — DRAFT (BEGIN/ROLLBACK ile sarili)
-- ============================================================================

BEGIN;

-- Faz 1: Kritik PII (saldiri vektoru — 191 dump kaynaginiydi)
-- ---------------------------------------------------------------
-- profiles tablosu: Sprint #5 (use-auth) ile API proxy'ye gecti.
-- Tum profile okumalari /api/profile + /api/profile/sync + /api/profile/stats
-- + /api/profile/difficulty + /api/profile/topic-strengths + /api/profile/avatar
-- uzerinden. Authenticated dump vektoru burada kapanir.
REVOKE SELECT ON public.profiles FROM authenticated;
-- NOT: anon zaten REVOKE'lu (migration 040 column-level grant ile sadece
--      public sutunlar; bunu da tamamen REVOKE edebiliriz cunku /api/leaderboard
--      uzerinden okunuyor)
-- REVOKE SELECT ON public.profiles FROM anon;

-- Faz 2: User-spesifik veri (kullanici kazima vektorleri)
-- ---------------------------------------------------------------
-- Sprint #6 + #7 ile API proxy'ye gecti.
REVOKE SELECT ON public.session_answers          FROM authenticated;
REVOKE SELECT ON public.game_sessions            FROM authenticated;
REVOKE SELECT ON public.user_topic_progress      FROM authenticated;
REVOKE SELECT ON public.user_question_history    FROM authenticated;

-- Faz 3: Social tablolar
-- ---------------------------------------------------------------
-- Sprint #8 ile API proxy'ye gecti.
REVOKE SELECT ON public.comments       FROM authenticated;
REVOKE SELECT ON public.comment_likes  FROM authenticated;

-- Faz 4: Multiplayer (duello)
-- ---------------------------------------------------------------
-- Sprint #9 ile API proxy'ye gecti.
REVOKE SELECT ON public.challenges     FROM authenticated;

-- Faz 5: Questions (anon zaten 041'de REVOKE)
-- ---------------------------------------------------------------
-- Sprint #6 ile authenticated quiz play API proxy'ye gecti.
-- DİKKAT: src/app/page.tsx landing ISR'da count(*) yapiyor —
--   server-side createClient cookie-based, anon hit'inde de calisabilir.
--   ISR cache 5dk; authenticated context degil. Bu yine de service-role'a
--   gecirilmeli ya da bu satir ATLANMALI.
-- REVOKE SELECT ON public.questions FROM authenticated;

-- Faz 6: RBAC tablolari
-- ---------------------------------------------------------------
-- DIKKAT: admin.ts ve proxy.ts server-side authenticated context'te
--   user_roles'a dokunuyor. Bunlar service-role'a gecirilmedikce REVOKE
--   admin paneli + middleware admin check'i kirar. ATLANIYOR.
-- REVOKE SELECT ON public.user_roles       FROM authenticated;
-- REVOKE SELECT ON public.role_permissions FROM authenticated;


-- ============================================================================
--  ROLLBACK — DRAFT modunda hicbir degisiklik kalici degil
-- ============================================================================
ROLLBACK;

-- Apply icin: 'ROLLBACK;' satirini 'COMMIT;' ile degistir ve runbook'u izle.
