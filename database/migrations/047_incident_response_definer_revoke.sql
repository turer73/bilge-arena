-- Migration 047: Incident response — SECURITY DEFINER fonksiyon anon REVOKE
--
-- Olay (2026-05-16/17):
--   Saldirgan publishable anon key + REST API ile profiles tablosundan 191
--   kullanici PII'sini dump etti (rest-profiles.json 174KB). Eszamanli olarak
--   25 lunix_NNNN + 1 jilij_NNNN bot hesabi 70 saniyede kayit edildi.
--   Olay sonrasi klipper dogrudan Supabase SQL Editor uzerinden 8 SECURITY
--   DEFINER fonksiyonun anon EXECUTE yetkisini kaldirdi. Bu migration o
--   degisikligi versionlar (drift kapanir) ve `db reset` sonrasi geri gelmesini
--   garanti eder.
--
-- Gercek drift (3 fonksiyon — REVOKE FROM PUBLIC mevcut migration'da yoktu):
--   - update_streak(uuid)             — 007_fix_trigger_security.sql
--   - has_permission(uuid, text)      — 016b_fix_rls_recursion.sql
--   - has_any_role(uuid)              — 016b_fix_rls_recursion.sql
--
-- Defense-in-depth (5 fonksiyon — zaten REVOKE PUBLIC vardi, ama belt+suspender):
--   - soft_delete_user(uuid)                              — 023
--   - hard_delete_expired_users()                         — 023
--   - increment_xp(uuid, integer)                         — 012
--   - increment_question_stats(uuid, integer, integer)    — 018
--   - batch_increment_question_stats(uuid[], boolean[])   — 022
--
--   Bu bes fonksiyonun REVOKE'unu idempotent olarak tekrar uyguluyoruz; bir
--   sonraki CREATE OR REPLACE FUNCTION cagrisinda grant'ler korunsa da
--   tutarliligi garanti altina aliyoruz.
--
-- NOT: Asil saldiri vektoru bu fonksiyonlar DEGILDI. 191 PII dump'i anon role'un
--   profiles tablosuna dogrudan SELECT yetkisi olmasi sayesinde yapildi
--   (migration 040 prod'da uygulanmamis idi, 2026-05-17'de uygulandi).
--   Bu migration ek katman — definer fonksiyon EXECUTE'leri uzerinden
--   kazima/manipulasyon vektorlerini kapatir.
--
-- KALAN ACIK (bu migration kapsami DEGIL — ayri planlar):
--   - Madde 9: browser->Supabase proxy refactor (authenticated dump vektor)
--   - Bot vektor: Supabase Auth Captcha (Turnstile) + disposable email block
--   - Service-role JWT key rotation (eski 10-yillik format, sb_secret_'a gec)
--   - KVKK 191 PII bildirim degerlendirmesi (avukat)
--
-- Rollback (gereksiz olmali, ama):
--   BEGIN;
--     GRANT EXECUTE ON FUNCTION public.update_streak(uuid) TO PUBLIC;
--     GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO PUBLIC;
--     GRANT EXECUTE ON FUNCTION public.has_any_role(uuid) TO PUBLIC;
--     -- diger 5 fonksiyon icin gerek yok (zaten REVOKE PUBLIC idi)
--   COMMIT;
--
-- Dogrulama:
--   SELECT n.nspname || '.' || p.proname AS fn,
--          array_to_string(p.proacl, E'\n') AS acl
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('update_streak','has_permission','has_any_role',
--                       'soft_delete_user','hard_delete_expired_users',
--                       'increment_xp','increment_question_stats',
--                       'batch_increment_question_stats')
--   ORDER BY p.proname;
--   -- Beklenen: acl listesinde =X/postgres (PUBLIC), anon=X/postgres SATIRI YOK


BEGIN;

-- ── Gercek drift: 3 fonksiyon PUBLIC EXECUTE'a sahipti ──

REVOKE EXECUTE ON FUNCTION public.update_streak(uuid)         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text)  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid)          FROM PUBLIC;

GRANT  EXECUTE ON FUNCTION public.update_streak(uuid)         TO authenticated;
GRANT  EXECUTE ON FUNCTION public.has_permission(uuid, text)  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.has_any_role(uuid)          TO authenticated;

-- ── Defense-in-depth: 5 fonksiyon (idempotent re-REVOKE) ──

REVOKE EXECUTE ON FUNCTION public.soft_delete_user(uuid)                                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hard_delete_expired_users()                               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.increment_xp(uuid, integer)                               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.increment_question_stats(uuid, integer, integer)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.batch_increment_question_stats(uuid[], boolean[])         FROM PUBLIC, anon;

-- Grant'leri tekrar uygula (varolan grant'i etkilemez, eksikse ekler)
GRANT  EXECUTE ON FUNCTION public.soft_delete_user(uuid)                                    TO service_role;
GRANT  EXECUTE ON FUNCTION public.hard_delete_expired_users()                               TO service_role;
GRANT  EXECUTE ON FUNCTION public.increment_xp(uuid, integer)                               TO service_role, authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_question_stats(uuid, integer, integer)          TO service_role, authenticated;
GRANT  EXECUTE ON FUNCTION public.batch_increment_question_stats(uuid[], boolean[])         TO service_role, authenticated;

COMMIT;
