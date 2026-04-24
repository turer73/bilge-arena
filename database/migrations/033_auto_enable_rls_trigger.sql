-- Migration 033: public.* yeni tablolarda otomatik RLS acma event trigger'i
--
-- Amac (Defense in Depth):
--   PR-S.2a migration 020'den kaynaklanan "FOR ALL USING(true)" RLS delikini
--   kapatti. Ancak gelecekteki migration'larda bir developer RLS enable etmeyi
--   unutursa yine aciga dusulur. Bu event trigger her CREATE TABLE komutundan
--   sonra public schema'daki yeni tabloya otomatik ENABLE ROW LEVEL SECURITY
--   uygular. RLS enable olunca policy yoksa HICBIR role (anon/authenticated)
--   satira erisemez -- developer policy yazmak zorunda kalir, gozden kacan
--   default acik pencere olmaz.
--
-- Nasil calisir:
--   1. PostgreSQL event trigger (DDL seviyesinde) command_tag='CREATE TABLE'
--      olaylarini yakalar
--   2. pg_event_trigger_ddl_commands() ile yeni olusturulan tabloyu alir
--   3. Sadece public schema'daki tablolari hedefler (auth/storage/realtime
--      gibi Supabase ic schema'lari atlanir)
--   4. ALTER TABLE ... ENABLE ROW LEVEL SECURITY uygular (idempotent)
--
-- Guvenlik notu:
--   Fonksiyon SECURITY INVOKER (default) olarak calisir. CREATE TABLE komutunu
--   kim calistirdiysa onun yetkileriyle ALTER uygulanir. Bir role kendi yarattigi
--   tabloya ALTER yetkisi otomatik sahiptir (owner), dolayisiyla sorun yoktur.
--   search_path migration 030 standardina uygun pinlenmistir (pg_catalog, public).
--
-- Nelerin disinda kalir:
--   - CREATE TABLE AS (SELECT) -- command_tag farkli, bu migration kapsamiyor
--   - CREATE UNLOGGED TABLE -- teorik olarak yakalaniyor ama test edilmedi
--   - CREATE TEMP TABLE -- zaten public schema disi
--   - Supabase internal schemas (auth, storage, realtime, extensions, graphql)
--
-- Rollback:
--   BEGIN;
--     DROP EVENT TRIGGER IF EXISTS auto_enable_rls_trg;
--     DROP FUNCTION IF EXISTS public.auto_enable_rls_on_create();
--   COMMIT;
--
-- Uygulama notu (Supabase hosted):
--   Supabase `postgres` rolu event trigger yaratma yetkisine sahiptir. Eger
--   migration Supabase Dashboard SQL Editor'den uygulandiginda "permission
--   denied for event trigger" hatasi donerse, project setting'lerinde
--   "Database -> Extensions/Roles" bolumunde postgres user'in event trigger
--   yetkisini kontrol et veya Dashboard -> Authentication -> Policies altindaki
--   "Auto-enable RLS for new tables" toggle'ini kullan (Supabase kendi
--   mekanizmasi ile benzer davranis saglar).
--
-- Dogrulama (migration sonrasi):
--   -- 1) Event trigger olustu mu:
--   SELECT evtname, evtenabled, evtowner::regrole, evtevent, evttags
--   FROM pg_event_trigger WHERE evtname = 'auto_enable_rls_trg';
--   -- beklenen: 1 satir, evtenabled='O' (enabled), evttags={'CREATE TABLE'}
--
--   -- 2) Fonksiyon search_path pinli mi (Advisor re-flag edemesin):
--   SELECT p.proname, p.proconfig
--   FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
--   WHERE n.nspname='public' AND p.proname='auto_enable_rls_on_create';
--   -- beklenen: proconfig icinde 'search_path=public, pg_catalog'
--
--   -- 3) Davranis testi:
--   CREATE TABLE public.rls_test_dummy (id int);
--   SELECT relrowsecurity FROM pg_class WHERE relname='rls_test_dummy';
--   -- beklenen: t (true)
--   DROP TABLE public.rls_test_dummy;


BEGIN;

-- 1) Event trigger fonksiyonu
CREATE OR REPLACE FUNCTION public.auto_enable_rls_on_create()
RETURNS event_trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN
    SELECT object_identity, schema_name, object_type
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag = 'CREATE TABLE'
      AND object_type = 'table'
      AND schema_name = 'public'
  LOOP
    EXECUTE 'ALTER TABLE ' || obj.object_identity || ' ENABLE ROW LEVEL SECURITY';
    RAISE NOTICE 'auto_enable_rls: RLS enabled on %', obj.object_identity;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.auto_enable_rls_on_create() IS
  'Event trigger helper: public.* yeni tablolara otomatik ENABLE ROW LEVEL SECURITY uygular. Migration 033.';

-- 2) Event trigger (DDL sonrasi tetiklenir)
DROP EVENT TRIGGER IF EXISTS auto_enable_rls_trg;

CREATE EVENT TRIGGER auto_enable_rls_trg
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE')
  EXECUTE FUNCTION public.auto_enable_rls_on_create();

COMMENT ON EVENT TRIGGER auto_enable_rls_trg IS
  'CREATE TABLE sonrasi public.* tablolarina otomatik RLS acar. Defense in depth, PR-S.2a devami. Migration 033.';

COMMIT;
