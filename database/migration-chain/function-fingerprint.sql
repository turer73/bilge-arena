-- public semasindaki fonksiyonlarin parmak izi: imza, govde md5'i, SECURITY DEFINER,
-- proconfig ve ACL. Ayni sorgu uretimde (salt okuma) ve tam zincirde kosar;
-- database/apply-migration-chain.mjs ikisini karsilastirir. Eklenti fonksiyonlari
-- (pg_trgm, unaccent ...) haric: onlar migration'in degil eklentinin tanimidir.
-- Govde CR'siz ozetlenir: uretimdeki 167 govde Windows'tan CRLF ile uygulanmis
-- (2026-10-17 olcumu); satir sonu farki tanim farki sayilmaz.
-- Cikti: psql -X -A -t -F '|' ile satir basina signature|body_md5|secdef|config|acl
SELECT p.oid::regprocedure::text,
       md5(replace(p.prosrc, chr(13), '')),
       p.prosecdef,
       coalesce(array_to_string(p.proconfig, ','), ''),
       coalesce(p.proacl::text, '')
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_depend d
    WHERE d.classid = 'pg_catalog.pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
  )
ORDER BY 1;
