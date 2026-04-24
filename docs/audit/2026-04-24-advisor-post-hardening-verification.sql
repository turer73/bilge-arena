-- =============================================================================
-- Advisor Post-Hardening Verification Script
-- Tarih: 2026-04-24
-- Kapsam: PR-S.1a (migration 030) + PR-S.1b (031) + PR-S.2a (032) + PR-S.2b (033)
-- =============================================================================
-- Bu script'i Supabase Dashboard -> SQL Editor'de calistir. Her sorgu ayri bir
-- Advisor kontrolunu dogrular. Beklenen sonuclar her bolumun sonunda.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- CHECK 1: SECURITY DEFINER fonksiyonlar search_path pinlenmis mi?
-- -----------------------------------------------------------------------------
-- Advisor kurali: "Function Search Path Mutable"
-- Migration 030 sonrasi tum public schema SECURITY DEFINER fonksiyonlarin
-- search_path ayari olmalidir. Aksi halde attacker public'ten once gelen bir
-- schema ile fonksiyon govdesinin hedefini degistirebilir.
--
-- BEKLENEN: 0 satir (tum SECURITY DEFINER fonksiyonlar pinlenmis)
-- -----------------------------------------------------------------------------
SELECT
  n.nspname AS schema,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS is_security_definer,
  p.proconfig AS config
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true  -- SECURITY DEFINER
  AND (
    p.proconfig IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM unnest(p.proconfig) cfg
      WHERE cfg LIKE 'search_path=%'
    )
  )
ORDER BY p.proname;


-- -----------------------------------------------------------------------------
-- CHECK 2: Viewlar security_invoker modunda mi?
-- -----------------------------------------------------------------------------
-- Advisor kurali: "Security Definer View"
-- PostgreSQL 15+ oncesi tum view'lar default SECURITY DEFINER idi, yani
-- view'i tanimlayan kullanicinin yetkileri ile calisiyordu -> RLS bypass.
-- Migration 031 leaderboard_weekly_ranked view'ini security_invoker=true'a
-- cevirdi. Diger view'lar da ayni sekilde olmali.
--
-- BEKLENEN: 0 satir (tum public view'lar security_invoker modunda)
-- -----------------------------------------------------------------------------
SELECT
  n.nspname AS schema,
  c.relname AS view_name,
  c.reloptions AS options,
  CASE
    WHEN c.reloptions IS NULL THEN 'DEFINER (default, risky)'
    WHEN 'security_invoker=true' = ANY(c.reloptions) THEN 'INVOKER (safe)'
    WHEN 'security_invoker=on'   = ANY(c.reloptions) THEN 'INVOKER (safe)'
    ELSE 'DEFINER (explicit or missing flag)'
  END AS security_mode
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'v'  -- view
  AND NOT (
    c.reloptions IS NOT NULL
    AND (
      'security_invoker=true' = ANY(c.reloptions)
      OR 'security_invoker=on' = ANY(c.reloptions)
    )
  )
ORDER BY c.relname;


-- -----------------------------------------------------------------------------
-- CHECK 3: Permissive RLS policy'ler PUBLIC role'e USING(true) ile aciliyor mu?
-- -----------------------------------------------------------------------------
-- Advisor kurali: "RLS Policy Too Permissive" (implicit)
-- Migration 032 challenges_service policy'sini kaldirdi (anon dahil herkese
-- CRUD acan bug). Kalan policy'lerde benzeri yoksa kontrol et.
--
-- Dikkat: "Anyone can insert consent logs" (migration 010) ve "Service can
-- insert logs" (migration 012) AMACLANMISTIR, INSERT-only + WITH CHECK(true)
-- -- bu satirlari donduyor ama is bir tehdit olusturmuyor cunku:
--   - consent_logs: KVKK cookie onayi icin anon insert zorunlu
--   - client_logs: authenticated role, INSERT only, log toplama amacli
-- Bu iki policy filter disinda birakilmistir.
--
-- BEKLENEN: 0 satir (kritik FOR ALL USING(true) pattern yok)
-- -----------------------------------------------------------------------------
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual AS using_clause,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd = 'ALL'
  AND qual = 'true'
  AND 'public' = ANY(string_to_array(array_to_string(roles, ','), ','))
ORDER BY tablename, policyname;


-- -----------------------------------------------------------------------------
-- CHECK 4: public schema'da RLS kapali tablolar (posture check)
-- -----------------------------------------------------------------------------
-- Advisor kurali: "Policy Exists RLS Disabled" / "RLS Disabled in Public"
-- Her public tablo RLS acik olmalidir. Acik olmayanlar ya:
--   (a) application-critical bug (Advisor bunu yakalar), veya
--   (b) ornegin geriye donuk legacy/seed tablosu (beyaz listelenmeli)
--
-- BEKLENEN: Sadece beklenen tablolar (varsa) listede. Normalde 0.
-- -----------------------------------------------------------------------------
SELECT
  n.nspname AS schema,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  (SELECT count(*) FROM pg_policies p
     WHERE p.schemaname = n.nspname AND p.tablename = c.relname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'  -- normal table (views/matviews haric)
  AND c.relrowsecurity = false
ORDER BY c.relname;


-- -----------------------------------------------------------------------------
-- CHECK 5: Auto-enable RLS event trigger canli mi? (Migration 033 dogrulama)
-- -----------------------------------------------------------------------------
-- Gelecekteki CREATE TABLE komutlari otomatik RLS acmali. Migration 033
-- uygulandi ise bu sorgu 1 satir donmelidir.
--
-- BEKLENEN: 1 satir, evtenabled='O' (origin/enabled), evttags={'CREATE TABLE'}
-- -----------------------------------------------------------------------------
SELECT
  evtname,
  evtenabled,
  evtowner::regrole AS owner,
  evtevent,
  evttags,
  p.proname AS handler_function
FROM pg_event_trigger et
JOIN pg_proc p ON et.evtfoid = p.oid
WHERE et.evtname = 'auto_enable_rls_trg';


-- -----------------------------------------------------------------------------
-- CHECK 6: Ozet -- 3 PR'in etkisi tek bakista
-- -----------------------------------------------------------------------------
SELECT
  'SECURITY DEFINER fonksiyon (search_path eksik)' AS metric,
  (SELECT count(*) FROM pg_proc p
     JOIN pg_namespace n ON p.pronamespace=n.oid
     WHERE n.nspname='public' AND p.prosecdef=true
       AND (p.proconfig IS NULL OR NOT EXISTS (
         SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))) AS count,
  '0 olmasi beklenir (PR-S.1a)' AS expected
UNION ALL
SELECT
  'View SECURITY DEFINER (invoker=false)',
  (SELECT count(*) FROM pg_class c
     JOIN pg_namespace n ON c.relnamespace=n.oid
     WHERE n.nspname='public' AND c.relkind='v'
       AND NOT (c.reloptions IS NOT NULL AND (
         'security_invoker=true' = ANY(c.reloptions)
         OR 'security_invoker=on' = ANY(c.reloptions)))),
  '0 olmasi beklenir (PR-S.1b)'
UNION ALL
SELECT
  'FOR ALL USING(true) PUBLIC policy (kritik)',
  (SELECT count(*) FROM pg_policies
     WHERE schemaname='public' AND cmd='ALL' AND qual='true'
       AND 'public' = ANY(roles)),
  '0 olmasi beklenir (PR-S.2a)'
UNION ALL
SELECT
  'Auto-enable RLS event trigger aktif',
  (SELECT count(*) FROM pg_event_trigger
     WHERE evtname='auto_enable_rls_trg' AND evtenabled='O'),
  '1 olmasi beklenir (PR-S.2b / migration 033)';

-- =============================================================================
-- Notlar:
--   - Supabase Dashboard -> Advisors -> Security -> Rerun ile bu script'i
--     tamamlayici olarak calistir. Advisor UI'sinden screenshot al, burasi
--     raw SQL seviyesinde.
--   - HIBP (leaked password) kontrolu Supabase Pro Plan gerektirdigi icin
--     scope disidir (PR-S.3 blocked).
-- =============================================================================
