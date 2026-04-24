-- Migration 034: auto_enable_rls_trg tum tablo olusturma varyantlarini kapsar
--
-- Kaynak: Codex review PR #25 (P1 bulgu, 2026-04-24)
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
-- Fix:
--   1) WHEN TAG clause'unu genislet: ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
--   2) object_type filtresini genislet: ('table', 'partitioned table')
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
--   -- 1) Trigger WHEN TAG guncel mi:
--   SELECT evttags FROM pg_event_trigger WHERE evtname='auto_enable_rls_trg';
--   -- beklenen: {"CREATE TABLE","CREATE TABLE AS","SELECT INTO"}
--
--   -- 2) Fonksiyon body guncel mi (search_path pinli):
--   SELECT p.proconfig, pg_get_functiondef(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
--   WHERE n.nspname='public' AND p.proname='auto_enable_rls_on_create';
--
--   -- 3) Davranis testi (CREATE TABLE AS coverage):
--   CREATE TABLE public._rls_test_cta AS SELECT 1 AS n;
--   SELECT relrowsecurity FROM pg_class
--     WHERE relname='_rls_test_cta' AND relnamespace='public'::regnamespace;
--   -- beklenen: t
--   DROP TABLE public._rls_test_cta;
--
--   -- 4) Davranis testi (SELECT INTO coverage):
--   SELECT 1 AS n INTO public._rls_test_si;
--   SELECT relrowsecurity FROM pg_class
--     WHERE relname='_rls_test_si' AND relnamespace='public'::regnamespace;
--   -- beklenen: t
--   DROP TABLE public._rls_test_si;


BEGIN;

-- 1) Fonksiyon: command_tag ve object_type filtrelerini genislet
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
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table', 'partitioned table')
      AND schema_name = 'public'
  LOOP
    EXECUTE 'ALTER TABLE ' || obj.object_identity || ' ENABLE ROW LEVEL SECURITY';
  END LOOP;
END;
$$;

-- 2) Event trigger WHEN TAG clause'unu genislet
--    (PostgreSQL DROP + CREATE gerektirir, ALTER EVENT TRIGGER sadece enable/disable yapar)
DROP EVENT TRIGGER IF EXISTS auto_enable_rls_trg;

CREATE EVENT TRIGGER auto_enable_rls_trg
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.auto_enable_rls_on_create();

COMMIT;
