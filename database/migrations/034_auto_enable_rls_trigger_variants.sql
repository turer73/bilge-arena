-- Migration 034: auto_enable_rls_trg tum tablo olusturma varyantlarini kapsar
--
-- Kaynak: Codex review PR #25 (P1 bulgu, 2026-04-24)
-- Workaround: PR-S.2e (2026-04-25, Dashboard parser bug)
--
-- Sorun:
--   Migration 033 event trigger filtresi dar tutulmustu:
--     WHEN TAG IN ('CREATE TABLE')
--     WHERE object_type = 'table'
--   Bu filtre asagidaki yollarla olusturulan tablolari KAPSAMAZ:
--     1. CREATE TABLE foo AS SELECT ...           -> tag='CREATE TABLE AS'
--     2. SELECT ... INTO foo                      -> tag='SELECT INTO'
--     3. CREATE TABLE foo (...) PARTITION BY ...  -> type='partitioned table'
--   Defense-in-depth fail-closed kurali ile celisir: bir developer CREATE TABLE
--   AS ile yeni tablo olusturursa trigger tetiklenmez ve tablo RLS-disabled
--   kalir, Advisor yeniden uyari verir, kritik durumlarda veri erisim
--   kaidesine donusur.
--
-- Fix (PR #27 ana cozum + PR-S.2e Dashboard parser-bug workaround):
--   1) command_tag IN listesini genislet: ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
--      ANCAK: 'CREATE TABLE AS' ve 'SELECT INTO' literallari Supabase Dashboard
--      SQL Editor splitter bug'ini tetikledi (42P01 relation 'AS' / 'INTO' does
--      not exist). Cozum: runtime string concat ile literal pattern parse-zamani
--      gizlenir, execution-zamani ayni stringe cozulur:
--        'CREATE TABLE' || ' AS'  -> 'CREATE TABLE AS'
--        'SELECT' || ' INTO'      -> 'SELECT INTO'
--   2) object_type filtresini genislet: ('table', 'partitioned table')
--   3) CREATE EVENT TRIGGER WHEN TAG clause kaldirildi (ayni parser bug ailesi).
--      Trigger her ddl_command_end olayinda tetiklenir, filtreleme function
--      body'sinde yapilir. Performans etkisi ihmal edilebilir: function ilk
--      satirda WHERE filter ile erken cikis yapar.
--
-- Kapsamda kalmaya devam eden doniker:
--   - CREATE UNLOGGED TABLE (tag='CREATE TABLE', type='table')
--   - CREATE TABLE ... PARTITION OF ... (tag='CREATE TABLE', type='table' - bireysel partition)
--
-- Kapsam disi (bilincli):
--   - CREATE TEMP TABLE (schema pg_temp_*, filtre disi)
--   - CREATE FOREIGN TABLE (RLS dogal desteklemez)
--   - CREATE MATERIALIZED VIEW (object_type='materialized view', RLS yok)
--
-- Rollback:
--   Migration 033 son hali (PR-S.2c sonrasi) geri yukle. Rollback SQL'i
--   DROP + eski CREATE OR REPLACE ile ayni deseni tutar.
--
-- Dogrulama (prod apply sonrasi):
--   -- 1) Trigger ayakta mi:
--   SELECT evtname, evtenabled, evtevent, evttags
--   FROM pg_event_trigger WHERE evtname='auto_enable_rls_trg';
--   -- beklenen: 1 satir, evtenabled='O', evttags=NULL (WHEN TAG kaldirildi)
--
--   -- 2) Fonksiyon body guncel mi (search_path pinli):
--   SELECT p.proconfig, pg_get_functiondef(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
--   WHERE n.nspname='public' AND p.proname='auto_enable_rls_on_create';
--
--   -- 3+4) Davranis testleri DO block + EXECUTE wrapping ile
--   --      (Dashboard splitter bypass icin gerekli, ayrintisi PR-S.2e):
--   DROP TABLE IF EXISTS public._rls_test_results;
--   CREATE TABLE public._rls_test_results (test_name text, rls_enabled bool);
--   DO $$
--   DECLARE v bool;
--   BEGIN
--     EXECUTE 'CREATE TABLE public._rls_test_cta AS SELECT 1 AS n';
--     SELECT relrowsecurity INTO v FROM pg_class
--       WHERE relname='_rls_test_cta' AND relnamespace='public'::regnamespace;
--     INSERT INTO public._rls_test_results VALUES ('CREATE TABLE AS', v);
--     EXECUTE 'DROP TABLE public._rls_test_cta';
--
--     EXECUTE 'CREATE TABLE public._rls_test_plain (id int)';
--     SELECT relrowsecurity INTO v FROM pg_class
--       WHERE relname='_rls_test_plain' AND relnamespace='public'::regnamespace;
--     INSERT INTO public._rls_test_results VALUES ('CREATE TABLE plain', v);
--     EXECUTE 'DROP TABLE public._rls_test_plain';
--   END $$;
--   SELECT * FROM public._rls_test_results;
--   -- beklenen: 2 satir, ikisi de rls_enabled=t
--   DROP TABLE public._rls_test_results;
--
--   -- 5) SELECT INTO ayri sekmede tek-statement (plpgsql EXECUTE INTO yasak):
--   SELECT 1 AS n INTO public._rls_test_si;
--   SELECT relrowsecurity FROM pg_class
--     WHERE relname='_rls_test_si' AND relnamespace='public'::regnamespace;
--   -- beklenen: t
--   DROP TABLE public._rls_test_si;


BEGIN;

-- 1) Fonksiyon: command_tag ve object_type filtrelerini genislet
--    NOT: 'CREATE TABLE AS' ve 'SELECT INTO' string concat ile yazildi
--    (Supabase Dashboard SQL Editor parser bug workaround).
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
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE' || ' AS', 'SELECT' || ' INTO')
      AND object_type IN ('table', 'partitioned table')
      AND schema_name = 'public'
  LOOP
    EXECUTE 'ALTER TABLE ' || obj.object_identity || ' ENABLE ROW LEVEL SECURITY';
  END LOOP;
END;
$$;

-- 2) Event trigger (WHEN TAG kaldirildi: Dashboard parser bug workaround)
--    Trigger her DDL command end'de tetiklenir, filtreleme function body'de.
DROP EVENT TRIGGER IF EXISTS auto_enable_rls_trg;

CREATE EVENT TRIGGER auto_enable_rls_trg
  ON ddl_command_end
  EXECUTE FUNCTION public.auto_enable_rls_on_create();

COMMIT;

-- =============================================================================
-- Not (2026-04-25, PR-S.2e): Bu dosyanin onceki versiyonunda CREATE EVENT TRIGGER
-- ifadesinde WHEN TAG IN clause'u vardi ve fonksiyon body'sinde de ayni literal
-- liste duz string olarak yazilmisti. Supabase Dashboard SQL Editor'un client-side
-- statement splitter'i bu literal'lar icindeki SQL keyword'leri (AS, INTO) yanlis
-- parse edip "42P01 relation 'AS' does not exist" hatasi uretti. Migration 033'teki
-- ayni bug ailesi (sonrasi keyword) PR-S.2c ile cozulmustu.
--
-- Workaround pattern (production verified 2026-04-25):
--   1) Function body command_tag IN listesinde string concat
--   2) CREATE EVENT TRIGGER WHEN TAG clause kaldirildi
--
-- Pattern transparenttir: PostgreSQL string concat operatorunu execution-zamani
-- cozer, command_tag karsilastirmasi ayni stringe ulasir. WHEN TAG kaldirilmasi
-- trigger overhead'ini bir miktar artirir (her ddl_command_end'de fonksiyon
-- cagrilir) ama function body ilk satirda WHERE filter ile erken cikis yapar.
-- DDL frequency dusuk oldugu icin pratikte performans farki yok.
--
-- Davranis testi (prod apply 2026-04-25 sonrasi tum testler PASSED):
--   - CREATE TABLE x (id int)        -> RLS true
--   - CREATE TABLE x AS SELECT 1     -> RLS true
--   - SELECT 1 INTO x                -> RLS true
--
-- Alternatif yaklasim: psql veya supabase db push ile apply edilirse orijinal
-- temiz versiyon (WHEN TAG IN clause'lu) calisir. Ama Bilge Arena deploy
-- disiplini Dashboard-paste oldugu icin repo dosyasi prod ile drift olmamasi
-- icin bu workaround pattern'inda durur.
-- =============================================================================
