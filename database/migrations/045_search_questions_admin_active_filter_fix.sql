-- Migration 045: search_questions admin active_filter bug fix
--
-- Sorun:
--   /admin/sorular sayfasinda filter dropdown'unda "Pasif" secilse bile sonuc
--   tablosu hepsi "Aktif" gosteriyordu. Admin baska filtreleme yapamadi.
--
--   Migration 027'deki search_questions RPC mantik hatasi:
--
--   AND (
--     admin_view = TRUE     -- ← BUG: admin TRUE ise active_filter atlaniyor
--     OR active_filter IS NULL
--     OR q.is_active = active_filter
--   )
--   AND (admin_view = TRUE OR q.is_active = TRUE)
--
--   Ilk WHERE'de admin_view=TRUE ilk OR'u eslesip active_filter pas geciyor.
--   Yani admin "Pasif" filtreli arasa bile is_active filtresi uygulanmiyor,
--   her zaman tum sorular doner (admin_view=TRUE oldugu icin ikinci satirda
--   da is_active=TRUE kontrolu atlanip ham havuz doner).
--
-- Cozum:
--   - Active filter HER ZAMAN uygulanir (admin_view'dan bagimsiz).
--     active_filter NULL ise zaten skip, NULL degilse esitlik kontrolu yap.
--   - admin_view sadece "pasif gormeye yetki var mi" kontrolu icin (ikinci
--     WHERE satiri). Admin pasif gorebilir, anon goremez — ama admin "Pasif"
--     secerse sadece pasifleri gorur (active_filter=false uygulanir).
--
-- Test sonrasi:
--   admin "Pasif" -> sadece is_active=false olan sorular doner
--   admin "Aktif" -> sadece is_active=true olan sorular doner
--   admin "Tum"   -> hem aktif hem pasif doner (active_filter=NULL)
--   anon          -> her zaman sadece is_active=true (admin_view ikinci satir)

BEGIN;

CREATE OR REPLACE FUNCTION search_questions(
  search_q TEXT DEFAULT NULL,
  game_filter TEXT DEFAULT NULL,
  category_filter TEXT DEFAULT NULL,
  difficulty_filter INT DEFAULT NULL,
  active_filter BOOLEAN DEFAULT NULL,
  admin_view BOOLEAN DEFAULT FALSE,
  result_offset INT DEFAULT 0,
  result_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  external_id VARCHAR,
  game VARCHAR,
  category VARCHAR,
  subcategory VARCHAR,
  topic VARCHAR,
  difficulty SMALLINT,
  level_tag VARCHAR,
  content JSONB,
  is_active BOOLEAN,
  is_boss BOOLEAN,
  source VARCHAR,
  exam_ref VARCHAR,
  times_answered INTEGER,
  times_correct INTEGER,
  created_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
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
      q.content,
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
$func$;

-- Grants ayni (migration 041 pattern: anon EXECUTE REVOKE)
REVOKE ALL ON FUNCTION search_questions(TEXT, TEXT, TEXT, INT, BOOLEAN, BOOLEAN, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION search_questions(TEXT, TEXT, TEXT, INT, BOOLEAN, BOOLEAN, INT, INT) FROM anon;
GRANT EXECUTE ON FUNCTION search_questions(TEXT, TEXT, TEXT, INT, BOOLEAN, BOOLEAN, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION search_questions(TEXT, TEXT, TEXT, INT, BOOLEAN, BOOLEAN, INT, INT) TO service_role;

COMMIT;
