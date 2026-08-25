-- Migration 157: soru cevap anahtarini `authenticated` rolunden kapat.
--
-- Guvenlik denetimi 2026-08-25 (disc#1626): uygulama katmani cevap anahtarini
-- bilerek kirpiyor (toPublicQuestionContent), veritabani ise ayni anahtari giris
-- yapmis herkese uc bagimsiz yoldan aciyordu. Kanit: `SET LOCAL ROLE authenticated`
-- + gercek bir rol-atamasiz kullanicinin jwt claim'i ile 4409 aktif sorunun
-- content alani (answer + solution dahil) okunabildi; search_questions 100
-- satir/sayfa + total_count=4409 dondu; select_random_questions SETOF questions.
--
-- Kapatilan yollar:
--   1. public.questions tablosunda `content` sutunu    -> sutun bazli grant
--   2. public.search_questions(...)                    -> admin olmayan dalda kirpma
--   3. public.select_random_questions(...)             -> EXECUTE geri alindi
--
-- Yan bulgular:
--   disc#1627: misafirde /api/questions 500 veriyordu (anon'un search_questions
--              EXECUTE hakki migration 041'de alinmisti, route ise cookie
--              client ile cagiriyor). Icerik artik kirpildigi icin anon EXECUTE
--              guvenle geri veriliyor.
--   disc#1628: has_permission / has_any_role aktor kontrolu tasimiyordu.
--   disc#1629: role_permissions + roles anon'a aciktir.
--
-- Tuketici denetimi (kor REVOKE uygulamayi kirardi, hepsi tek tek tarandi):
--   - `.from('questions')` cagrilarinin tamami service-role; iki istisna vardi:
--     admin/generate-questions few-shot + duplicate okumasi (ayni PR'da
--     service-role'e tasindi) ve questions/route.ts PATCH'i (`WHERE id` icin
--     yalniz SELECT(id) gerekir, o hak korunuyor).
--   - teacher/classrooms/[id]/assignments cookie client ile `.select('id')`
--     yapiyor (route-context'te `admin` adi yaniltici, aslinda cookie client) ->
--     sutun bazli revoke bu yuzden sart, tablo geneli revoke onu kirardi.
--   - select_random_questions cagrilarinin hepsi `admin.rpc` (service-role).
--   - role_permissions/roles: tum yazma-okuma `svc` uzerinden; ANCAK
--     checkPermission/getUserPermissions cookie client ile okuyor -> yalniz
--     `anon` revoke edildi, `authenticated` korunuyor.
--
-- Sira notu: bu migration, `parsePublicQuestionContent` iceren uygulama surumu
-- YAYINLANDIKTAN SONRA uygulanmalidir. Eski surum `answer` alanini zorunlu
-- gordugu icin kirpilmis icerikte soru listesi bosalir.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) has_permission / has_any_role: aktor kontrolu (disc#1628)
--
-- p_user_id alan, authenticated'a acik 54 SECURITY DEFINER fonksiyonun 52'sinde
-- bu kontrol zaten vardi; korumasiz kalan ikisi buydu. EXECUTE geri ALINAMAZ:
-- her ikisi de RLS politikalarinin (questions_select, user_roles_select,
-- role_permissions_manage_*) icinden cagriliyor ve politika ifadeleri cagiran
-- rolun yetkisiyle degerlendirilir.
--
-- RAISE yerine `false` donuyoruz: politika icinde exception butun sorguyu
-- patlatirdi; false ise politikanin dogal "yetki yok" dali.
-- Service-role yolunda auth.uid() NULL oldugu icin kontrol devre disi kalir;
-- politika yolunda auth.uid() = p_user_id oldugu icin davranis degismez.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_permission(p_user_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT (auth.uid() IS NULL OR auth.uid() = p_user_id)
    AND EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN role_permissions rp ON rp.role_id = ur.role_id
      WHERE ur.user_id = p_user_id AND rp.permission = p_permission
    );
$fn$;

CREATE OR REPLACE FUNCTION public.has_any_role(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT (auth.uid() IS NULL OR auth.uid() = p_user_id)
    AND EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = p_user_id
    );
$fn$;

-- ---------------------------------------------------------------------------
-- 2) search_questions: admin olmayan dalda cevap anahtarini kirp
--
-- admin_view=TRUE dali degismedi (admin.dashboard.view izni zorunlu, pasif
-- sorulari ve ham icerigi gorur). admin_view=FALSE dali artik answer/correct/
-- solution/explanation/hint anahtarlarini icerikten dusurur; arama ifadeleri
-- ham q.content uzerinde calismaya devam eder (fonksiyon definer, tablo
-- yetkisinden bagimsiz).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.search_questions(
  search_q text DEFAULT NULL::text,
  game_filter text DEFAULT NULL::text,
  category_filter text DEFAULT NULL::text,
  difficulty_filter integer DEFAULT NULL::integer,
  active_filter boolean DEFAULT NULL::boolean,
  admin_view boolean DEFAULT false,
  result_offset integer DEFAULT 0,
  result_limit integer DEFAULT 20
)
RETURNS TABLE(
  id uuid, external_id character varying, game character varying,
  category character varying, subcategory character varying, topic character varying,
  difficulty smallint, level_tag character varying, content jsonb,
  is_active boolean, is_boss boolean, source character varying,
  exam_ref character varying, times_answered integer, times_correct integer,
  created_at timestamp with time zone, total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  -- Defense-in-depth: admin_view=TRUE requires admin.dashboard.view permission
  IF admin_view = TRUE THEN
    IF auth.uid() IS NULL OR NOT EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN role_permissions rp ON rp.role_id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND rp.permission = 'admin.dashboard.view'
    ) THEN
      RAISE EXCEPTION 'admin_view requires admin privileges' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
    SELECT
      q.id,
      q.external_id,
      q.game,
      q.category,
      q.subcategory,
      q.topic,
      q.difficulty,
      q.level_tag,
      -- Migration 157: cevap anahtari yalniz admin projeksiyonunda cikar.
      CASE
        WHEN admin_view = TRUE THEN q.content
        ELSE q.content - 'answer' - 'correct' - 'solution' - 'explanation' - 'hint'
      END AS content,
      q.is_active,
      q.is_boss,
      q.source,
      q.exam_ref,
      q.times_answered,
      q.times_correct,
      q.created_at,
      COUNT(*) OVER() AS total_count
    FROM questions q
    WHERE
      (game_filter IS NULL OR q.game = game_filter)
      AND (category_filter IS NULL OR q.category = category_filter)
      AND (difficulty_filter IS NULL OR q.difficulty = difficulty_filter)
      -- FIX: active_filter HER ZAMAN uygulanir (NULL ise skip; admin_view'dan bagimsiz)
      AND (active_filter IS NULL OR q.is_active = active_filter)
      -- Admin pasifleri gorebilir; anon sadece aktifleri
      AND (admin_view = TRUE OR q.is_active = TRUE)
      AND (
        search_q IS NULL OR search_q = ''
        OR immutable_unaccent(q.content->>'question') ILIKE immutable_unaccent('%' || search_q || '%')
        OR immutable_unaccent(q.content->>'sentence') ILIKE immutable_unaccent('%' || search_q || '%')
      )
    ORDER BY q.created_at DESC
    OFFSET GREATEST(result_offset, 0)
    LIMIT LEAST(GREATEST(result_limit, 1), 100);
END
$fn$;

-- Icerik artik kirpildigi icin misafir listelemesi guvenle geri aciliyor
-- (disc#1627: canlida HTTP 500 veriyordu).
GRANT EXECUTE ON FUNCTION public.search_questions(text,text,text,integer,boolean,boolean,integer,integer)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) select_random_questions: SETOF questions donuyor, cagiranlarin hepsi
--    service-role. anon/authenticated'in bu fonksiyona hic ihtiyaci yok.
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.select_random_questions(text,integer,text,integer,uuid[],text)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) questions.content: sutun bazli grant.
--
-- Postgres tablo-geneli GRANT'tan tek sutunu REVOKE etmeye izin vermez
-- (uyari verip hicbir sey yapmaz). Dogru yol: tablo grantini kaldirip
-- content DISINDAKI sutunlari yeniden vermek.
-- ---------------------------------------------------------------------------

REVOKE SELECT ON public.questions FROM authenticated;

GRANT SELECT (
  id, external_id, game, category, subcategory, topic, difficulty, level_tag,
  is_active, is_boss, source, exam_ref, times_answered, times_correct,
  base_points, published_revision_id, created_at, updated_at
) ON public.questions TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Yetki matrisi anonim okunmasin (disc#1629). `authenticated` KORUNUYOR:
--    checkPermission/getUserPermissions bu iki tabloyu cookie client ile okur.
-- ---------------------------------------------------------------------------

REVOKE SELECT ON public.role_permissions FROM anon;
REVOKE SELECT ON public.roles FROM anon;

-- ---------------------------------------------------------------------------
-- 6) Dogrulama: migration kendi iddiasini ispatlamadan commit etmesin.
-- ---------------------------------------------------------------------------

DO $verify$
BEGIN
  IF has_column_privilege('authenticated', 'public.questions', 'content', 'SELECT') THEN
    RAISE EXCEPTION '157 dogrulama: authenticated hala questions.content okuyabiliyor';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.questions', 'id', 'SELECT') THEN
    RAISE EXCEPTION '157 dogrulama: questions.id grant kayboldu (PATCH yolu kirilir)';
  END IF;
  IF has_function_privilege('authenticated',
       'public.select_random_questions(text,integer,text,integer,uuid[],text)', 'EXECUTE') THEN
    RAISE EXCEPTION '157 dogrulama: select_random_questions hala authenticated a acik';
  END IF;
  IF NOT has_function_privilege('anon',
       'public.search_questions(text,text,text,integer,boolean,boolean,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION '157 dogrulama: anon search_questions calistiramiyor (misafir 500 devam eder)';
  END IF;
  IF has_table_privilege('anon', 'public.role_permissions', 'SELECT') THEN
    RAISE EXCEPTION '157 dogrulama: role_permissions hala anon a acik';
  END IF;
END
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';
