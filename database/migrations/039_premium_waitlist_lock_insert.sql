-- ============================================================
-- Migration 039: premium_waitlist INSERT policy lock to service_role
-- ============================================================
-- 2026-04-26 (Codex P1 fix): Migration 037'de policy
--   CREATE POLICY "premium_waitlist_insert_anyone"
--     ON premium_waitlist FOR INSERT
--     WITH CHECK (true);
-- "TO <role>" clause olmadan tanimlandi. Postgres bunu default
-- olarak "TO PUBLIC" sayar; PUBLIC supabase'de anon dahildir.
--
-- SONUC (Codex review):
--   Saldirgan, /rest/v1/premium_waitlist endpoint'ini anon API key
--   ile dogrudan POST'layabilir; rate-limit (5 req/dk IP) ve
--   Zod validation (KVKK + email + plan) bypass edilir.
--   Insertlerde kvkk_consent_at, ip_address gibi audit alanlari
--   client kontrolune gecer; KVKK durust audit kanitini bozar.
--
-- IKI KATMANLI FIX:
--   1. (BU MIGRATION) Policy DROP + service_role'e kilitle.
--   2. /api/premium/waitlist route service_role client kullanir
--      (createServiceRoleClient -- RLS bypass'a yetkili).
-- Sonuc: tek INSERT yolu app route'u olur; KVKK + rate-limit
-- + Zod tek kapida kalir.
--
-- Idempotent: DROP POLICY IF EXISTS + CREATE POLICY tekrar
-- uygulanabilir; ikinci kosumda DROP no-op, CREATE bireysel
-- ad cakismasi olabilir -- bunu da once DROP ile koruyoruz.
-- ============================================================

-- ── Eski policy'yi kaldir ───────────────────────────────────
-- DROP POLICY IF EXISTS migration tekrar calistirilirsa hata
-- vermez (no policy = no-op).
DROP POLICY IF EXISTS "premium_waitlist_insert_anyone" ON premium_waitlist;

-- ── Yeni policy: yalnizca service_role ──────────────────────
-- TO service_role: PostgREST anon ve authenticated rolleri bu
-- policy'i hic gormez; INSERT denemesi RLS hatasi (42501) doner.
-- service_role API key'i sadece sunucu tarafi (env var) -- client'a
-- expose edilmez. Boylece /api/premium/waitlist tek kapi olur.
CREATE POLICY "premium_waitlist_insert_service_role_only"
  ON premium_waitlist FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ============================================================
-- Dogrulama (uygulamadan sonra Supabase Dashboard SQL Editor):
--   -- 1. Eski policy gitti mi?
--   SELECT policyname FROM pg_policies
--   WHERE tablename = 'premium_waitlist'
--     AND policyname = 'premium_waitlist_insert_anyone';
--   -- Beklenen: 0 satir
--
--   -- 2. Yeni policy var mi ve service_role'e mi bagli?
--   SELECT policyname, roles, cmd
--   FROM pg_policies
--   WHERE tablename = 'premium_waitlist'
--     AND policyname = 'premium_waitlist_insert_service_role_only';
--   -- Beklenen: 1 satir, roles = {service_role}, cmd = INSERT
--
--   -- 3. Anon INSERT artik bloklaniyor mu? (smoke test)
--   -- Supabase REST: curl -X POST .../rest/v1/premium_waitlist
--   --   -H "apikey: <anon_key>" -H "Authorization: Bearer <anon_key>"
--   --   -d '{"email":"x@y.com","plan":"monthly","kvkk_consent_at":...}'
--   -- Beklenen: 401/403 (RLS violation), eskiden 201 idi.
-- ============================================================
