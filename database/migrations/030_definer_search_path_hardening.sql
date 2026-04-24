-- Migration 030: SECURITY DEFINER fonksiyonlari icin search_path hardening
--
-- Sorun (Supabase Advisor): "Function Search Path Mutable" — 18 SECURITY DEFINER
--   fonksiyon SET search_path olmadan tanimlanmis. Bu, fonksiyon calisirken
--   search_path'in session'dan geldigi anlamina geliyor. Eger bir saldirgan
--   public schema'da CREATE yetkisine sahipse, ayni isimli bir fonksiyon/
--   tablo yaratip search_path'i kendi schema'sini onceleyecek sekilde
--   ayarlayarak SECURITY DEFINER fonksiyonun icindeki unqualified referanslari
--   kendi malicious objelerine yonlendirebilir — yani fonksiyon sahibinin
--   (genelde postgres superuser) yetkisiyle saldirgan kodu calistirilabilir.
--
--   Supabase'de anon/authenticated rollerine public schema'da CREATE yetkisi
--   varsayilan olarak verilmez, dolayisiyla exploit pratik degil ama
--   Defense-in-Depth gereksinimi. Advisor Warning kategorisinde, Error degil.
--
-- Advisor cikti (26 Warning'den 18'i):
--   public.update_homepage_updated_at
--   public.check_premium_status
--   public.has_permission
--   public.has_any_role
--   public.increment_xp
--   public.generate_referral_code
--   public.increment_question_stats
--   public.batch_increment_question_stats
--   public.soft_delete_user
--   public.hard_delete_expired_users
--   public.immutable_unaccent
--   public.handle_new_user
--   public.update_updated_at
--   public.apply_xp_to_profile
--   public.update_comment_likes_count
--   public.update_question_stats
--   public.update_weekly_leaderboard
--   public.update_streak
--
-- Fix: `SET search_path = public` — tum fonksiyonlar unqualified tablo
--   referansi kullandigi icin (ornek: "UPDATE questions" → "public.questions")
--   public'e sabitlemek mevcut davranisi korur. Bos string ('') daha sert
--   (schema-qualification zorunlu) ama mevcut fonksiyon govdelerini bozar.
--
-- Yaklasim: imzalari tek tek listelemek yerine pg_proc'tan dinamik bulup
--   ALTER FUNCTION ... SET search_path = public uygula. Boylece:
--   - Imza farklari / overloading ile ugrasmiyoruz
--   - Gelecekte bir fonksiyon eklenip ayni gap'i yaratirsa bu migration'i
--     tekrar calistirarak kapatilabilir (idempotent: ikinci calistirmada
--     NOT EXISTS filtresi ile hicbir fonksiyon bulunmaz, NO-OP)
--   - Advisor'in flag'ledigi fonksiyonlar dogrudan kapsama girer
--
-- Notlar:
--   - Sadece SECURITY DEFINER + public schema + search_path atanmamis
--     fonksiyonlar alter edilir. SECURITY INVOKER (default) fonksiyonlar
--     advisor flag'i almaz, dokunulmaz.
--   - ALTER FUNCTION ... SET search_path fonksiyon govdesini DEGISTIRMEZ,
--     sadece calisma zamani GUC atamasi ekler. Zero-impact, zero-downtime.
--
-- Rollback:
--   BEGIN;
--     DO $$
--     DECLARE f RECORD;
--     BEGIN
--       FOR f IN
--         SELECT n.nspname, p.proname,
--                pg_get_function_identity_arguments(p.oid) AS args
--         FROM pg_proc p
--         JOIN pg_namespace n ON n.oid = p.pronamespace
--         WHERE n.nspname = 'public'
--           AND p.prosecdef = true
--           AND EXISTS (
--             SELECT 1 FROM unnest(p.proconfig) AS cfg
--             WHERE cfg = 'search_path=public'
--           )
--       LOOP
--         EXECUTE format(
--           'ALTER FUNCTION %I.%I(%s) RESET search_path',
--           f.nspname, f.proname, f.args
--         );
--       END LOOP;
--     END $$;
--   COMMIT;
--
-- Dogrulama (manuel):
--   SELECT proname,
--          (SELECT string_agg(cfg, ', ') FROM unnest(proconfig) AS cfg) AS config
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.prosecdef = true
--   ORDER BY proname;
--   -- Beklenen: tum satirlarda config sutununda 'search_path=public' gorulmeli
--
-- Advisor sonrasi:
--   1. Migration'i prod'da calistir
--   2. Supabase Dashboard -> Database -> Advisors -> Security -> Rerun linter
--   3. "Function Search Path Mutable" uyarilari 18 -> 0 dusmeli (26 -> 8 warning)


BEGIN;

DO $migration$
DECLARE
  f RECORD;
  altered_count INT := 0;
BEGIN
  FOR f IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS func_name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true  -- SECURITY DEFINER
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(COALESCE(p.proconfig, ARRAY[]::TEXT[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public',
      f.schema_name, f.func_name, f.args
    );
    altered_count := altered_count + 1;
    RAISE NOTICE 'Hardened: %.%(%)', f.schema_name, f.func_name, f.args;
  END LOOP;

  RAISE NOTICE 'Migration 030: % SECURITY DEFINER function(s) altered.', altered_count;
END
$migration$;

COMMIT;
