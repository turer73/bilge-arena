-- Migration 163: questions tablosuna dogrudan istemci yazimini kapat.
--
-- Migration 161, admin yazma politikalarina AAL2 ekledi; ancak AAL2 bir admin
-- JWT'si yine de PostgREST uzerinden route yonetisimi, rate-limit ve admin_logs
-- kaydini atlayarak tabloya dogrudan yazabiliyordu. Soru mutasyonlari bundan
-- sonra yalniz SECURITY DEFINER icerik-yonetisimi RPC'lerinden yapilir.
-- service_role da dogrudan writer degildir: bu, HTTP fallback'lerini ve servis
-- anahtarli ad-hoc betikleri ayni DB sinirinda fail-closed tutar.

BEGIN;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.questions
  FROM PUBLIC, anon, authenticated, service_role;

-- Tablo ACL'sini kapatmak tek basina yeterli degildir: PostgREST, EXECUTE
-- verilmis bir SECURITY DEFINER writer'i de dogrudan sunabilir. Bu uc fonksiyon
-- yalniz AAL2/rate-limit/audit kapilarindan gecen sunucu route'lari tarafindan,
-- service_role ile cagrilir.
REVOKE ALL ON FUNCTION public.create_governed_question(uuid,jsonb,uuid),
  public.publish_question_content_revision(uuid,uuid,uuid),
  public.quarantine_question_content(uuid,uuid,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_governed_question(uuid,jsonb,uuid),
  public.publish_question_content_revision(uuid,uuid,uuid),
  public.quarantine_question_content(uuid,uuid,text,uuid)
  TO service_role;

-- Kullanilmayan istemci DML politikalarini da kaldir. Böylece ileride yanlislikla
-- GRANT verilse bile eski RBAC politikalari sessizce dogrudan yazimi acmaz.
DROP POLICY IF EXISTS "questions_update_admin_rbac" ON public.questions;
DROP POLICY IF EXISTS "questions_delete_admin_rbac" ON public.questions;

-- Migration kendi guvenlik iddiasini ispatlamadan commit etmesin.
DO $verify$
DECLARE
  v_write_policy_count integer;
  v_unexpected_grantees text;
  v_writer_rpc_count integer;
  v_invalid_writer_rpcs text;
BEGIN
  -- anon/authenticated kontrolleri bu rollerin PUBLIC'ten miras aldigi etkili
  -- yetkileri de kapsar.
  IF has_table_privilege('anon', 'public.questions', 'INSERT')
     OR has_table_privilege('anon', 'public.questions', 'UPDATE')
     OR has_table_privilege('anon', 'public.questions', 'DELETE')
     OR has_table_privilege('authenticated', 'public.questions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.questions', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.questions', 'DELETE')
     OR has_table_privilege('service_role', 'public.questions', 'INSERT')
     OR has_table_privilege('service_role', 'public.questions', 'UPDATE')
     OR has_table_privilege('service_role', 'public.questions', 'DELETE') THEN
    RAISE EXCEPTION
      '163 dogrulama: istemci/API rollerinde questions DML yetkisi hala acik';
  END IF;

  -- Tablo seviyesindeki REVOKE, beklenmeyen sutun bazli INSERT/UPDATE grantini
  -- kaldirmaz. Boylesi bir schema drift varsa migration fail-closed durur.
  IF has_any_column_privilege('anon', 'public.questions', 'INSERT')
     OR has_any_column_privilege('anon', 'public.questions', 'UPDATE')
     OR has_any_column_privilege('authenticated', 'public.questions', 'INSERT')
     OR has_any_column_privilege('authenticated', 'public.questions', 'UPDATE')
     OR has_any_column_privilege('service_role', 'public.questions', 'INSERT')
     OR has_any_column_privilege('service_role', 'public.questions', 'UPDATE') THEN
    RAISE EXCEPTION
      '163 dogrulama: istemci rolunde sutun bazli questions DML yetkisi bulundu';
  END IF;

  -- Repo disinda olusturulmus ozel bir API rolunde eski grant varsa sessizce
  -- birakma. Yalniz DB owner/altyapi rolleri haric her explicit DML grantee
  -- migration'i durdurur ve manuel inceleme ister.
  SELECT string_agg(DISTINCT grant_row.grantee, ',' ORDER BY grant_row.grantee)
    INTO v_unexpected_grantees
  FROM information_schema.role_table_grants grant_row
  WHERE grant_row.table_schema='public'
    AND grant_row.table_name='questions'
    AND grant_row.privilege_type IN ('INSERT','UPDATE','DELETE')
    AND grant_row.grantee NOT IN ('postgres','supabase_admin','dashboard_user');
  IF v_unexpected_grantees IS NOT NULL THEN
    RAISE EXCEPTION
      '163 dogrulama: beklenmeyen questions DML grantee rolleri: %',
      v_unexpected_grantees;
  END IF;

  SELECT count(*) INTO v_write_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'questions'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL');

  IF v_write_policy_count <> 0 THEN
    RAISE EXCEPTION
      '163 dogrulama: questions uzerinde % istemci yazma politikasi kaldi',
      v_write_policy_count;
  END IF;

  -- ACL kapandiktan sonra mesru yazma yolu yalniz bu definer RPC'leridir.
  -- Eksik, invoker veya bir API rolune ait fonksiyonla deploy yarim kalmasin.
  SELECT count(*),
    string_agg(p.oid::regprocedure::text, ',' ORDER BY p.oid::regprocedure::text)
      FILTER (WHERE NOT p.prosecdef
        OR owner_role.rolname NOT IN ('postgres','supabase_admin')
        OR NOT ('search_path=pg_catalog'=ANY(COALESCE(p.proconfig,ARRAY[]::text[]))))
    INTO v_writer_rpc_count,v_invalid_writer_rpcs
  FROM pg_proc p
  JOIN pg_roles owner_role ON owner_role.oid=p.proowner
  WHERE p.oid IN (
    to_regprocedure('public.create_governed_question(uuid,jsonb,uuid)'),
    to_regprocedure('public.publish_question_content_revision(uuid,uuid,uuid)'),
    to_regprocedure('public.quarantine_question_content(uuid,uuid,text,uuid)')
  );
  IF v_writer_rpc_count<>3 OR v_invalid_writer_rpcs IS NOT NULL THEN
    RAISE EXCEPTION
      '163 dogrulama: guvenli questions writer RPC sozlesmesi eksik/gecersiz: count=%, invalid=%',
      v_writer_rpc_count,COALESCE(v_invalid_writer_rpcs,'none');
  END IF;
  IF has_function_privilege('anon','public.create_governed_question(uuid,jsonb,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.create_governed_question(uuid,jsonb,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.publish_question_content_revision(uuid,uuid,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.publish_question_content_revision(uuid,uuid,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.quarantine_question_content(uuid,uuid,text,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.quarantine_question_content(uuid,uuid,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION
      '163 dogrulama: questions writer RPC istemci rolune acik';
  END IF;
  IF NOT has_function_privilege('service_role','public.create_governed_question(uuid,jsonb,uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.publish_question_content_revision(uuid,uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.quarantine_question_content(uuid,uuid,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION
      '163 dogrulama: service_role governed writer RPC yolu eksik';
  END IF;

  -- Migration 157'nin cevap-anahtari projeksiyonunu koru.
  IF NOT has_column_privilege('authenticated', 'public.questions', 'id', 'SELECT') THEN
    RAISE EXCEPTION
      '163 dogrulama: authenticated questions.id okuma yetkisi kayboldu';
  END IF;
  IF has_column_privilege('authenticated', 'public.questions', 'content', 'SELECT') THEN
    RAISE EXCEPTION
      '163 dogrulama: authenticated questions.content okuma yetkisi yeniden acildi';
  END IF;
END
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';
