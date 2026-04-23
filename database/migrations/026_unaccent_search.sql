-- Migration 026: Accent-insensitive arama (unaccent + RPC)
-- Amac: "ozkan" aramasi "Ozkan" profili bulsun, "cozum" "cozum" soru bulsun
--
-- Yaklasim:
--   1. unaccent extension
--   2. IMMUTABLE wrapper (index icin, vanilla unaccent() STABLE)
--   3. GIN+trigram indexler (profiles + questions)
--   4. 3 RPC: search_profiles, search_profiles_admin, search_questions
--
-- Rollback:
--   DROP FUNCTION IF EXISTS search_profiles(TEXT, UUID, INT);
--   DROP FUNCTION IF EXISTS search_profiles_admin(TEXT, INT, INT);
--   DROP FUNCTION IF EXISTS search_questions(TEXT, TEXT, TEXT, INT, BOOLEAN, BOOLEAN, INT, INT);
--   DROP INDEX IF EXISTS idx_profiles_display_name_unaccent_trgm;
--   DROP INDEX IF EXISTS idx_profiles_username_unaccent_trgm;
--   DROP INDEX IF EXISTS idx_questions_question_unaccent_trgm;
--   DROP INDEX IF EXISTS idx_questions_sentence_unaccent_trgm;
--   DROP FUNCTION IF EXISTS immutable_unaccent(TEXT);


-- 1. EXTENSION
-- ------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS unaccent;


-- 2. IMMUTABLE WRAPPER
-- ------------------------------------------------------------
-- Vanilla public.unaccent() STABLE; expression index'te kullanilamaz.
-- Extension dosyalari degismedigi surece sonuc sabit -- IMMUTABLE guvenli.

CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE STRICT
AS $func$
  SELECT public.unaccent('public.unaccent', $1)
$func$;


-- 3. INDEXLER
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_profiles_display_name_unaccent_trgm
  ON profiles USING gin (immutable_unaccent(display_name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_username_unaccent_trgm
  ON profiles USING gin (immutable_unaccent(username) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_questions_question_unaccent_trgm
  ON questions USING gin (immutable_unaccent(content->>'question') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_questions_sentence_unaccent_trgm
  ON questions USING gin (immutable_unaccent(content->>'sentence') gin_trgm_ops);


-- 4. RPC: search_profiles
-- ------------------------------------------------------------
-- users/search endpoint, arkadas arama.
-- deleted_at IS NULL: soft-deleted hesaplari haric tut.
-- SECURITY INVOKER: caller RLS kurallari uygulanir.

CREATE OR REPLACE FUNCTION search_profiles(
  q TEXT,
  exclude_id UUID DEFAULT NULL,
  result_limit INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  username VARCHAR,
  display_name VARCHAR,
  avatar_url TEXT,
  total_xp INTEGER
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $func$
  SELECT p.id, p.username, p.display_name, p.avatar_url, p.total_xp
  FROM profiles p
  WHERE (
    immutable_unaccent(p.display_name) ILIKE immutable_unaccent('%' || q || '%')
    OR immutable_unaccent(p.username) ILIKE immutable_unaccent('%' || q || '%')
  )
  AND (exclude_id IS NULL OR p.id <> exclude_id)
  AND p.deleted_at IS NULL
  ORDER BY p.total_xp DESC NULLS LAST
  LIMIT LEAST(GREATEST(result_limit, 1), 50)
$func$;


-- 5. RPC: search_profiles_admin
-- ------------------------------------------------------------
-- admin/users endpoint. Admin soft-deleted dahil tum profilleri gorur.
-- total_count: pagination icin COUNT(*) OVER() penceresi.
-- SECURITY DEFINER: RLS bypass; yetki guard route'ta (checkPermission).

CREATE OR REPLACE FUNCTION search_profiles_admin(
  q TEXT DEFAULT NULL,
  result_offset INT DEFAULT 0,
  result_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  username VARCHAR,
  display_name VARCHAR,
  avatar_url TEXT,
  total_xp INTEGER,
  level SMALLINT,
  current_streak SMALLINT,
  created_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  role TEXT,
  total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.total_xp,
    p.level,
    p.current_streak,
    p.created_at,
    p.deleted_at,
    p.role,
    COUNT(*) OVER() AS total_count
  FROM profiles p
  WHERE (
    q IS NULL OR q = ''
    OR immutable_unaccent(p.display_name) ILIKE immutable_unaccent('%' || q || '%')
    OR immutable_unaccent(p.username) ILIKE immutable_unaccent('%' || q || '%')
  )
  ORDER BY p.created_at DESC
  OFFSET GREATEST(result_offset, 0)
  LIMIT LEAST(GREATEST(result_limit, 1), 100)
$func$;


-- 6. RPC: search_questions
-- ------------------------------------------------------------
-- questions endpoint. admin_view=TRUE: pasif sorulari da getir (is_active filter bypass).
-- SECURITY DEFINER: admin_view bypass; yetki guard route'ta (checkAdmin).

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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
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
    AND (
      admin_view = TRUE
      OR active_filter IS NULL
      OR q.is_active = active_filter
    )
    AND (admin_view = TRUE OR q.is_active = TRUE)
    AND (
      search_q IS NULL OR search_q = ''
      OR immutable_unaccent(q.content->>'question') ILIKE immutable_unaccent('%' || search_q || '%')
      OR immutable_unaccent(q.content->>'sentence') ILIKE immutable_unaccent('%' || search_q || '%')
    )
  ORDER BY q.created_at DESC
  OFFSET GREATEST(result_offset, 0)
  LIMIT LEAST(GREATEST(result_limit, 1), 100)
$func$;


-- 7. YETKILENDIRME
-- ------------------------------------------------------------

REVOKE ALL ON FUNCTION search_profiles(TEXT, UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION search_profiles(TEXT, UUID, INT) TO authenticated;

REVOKE ALL ON FUNCTION search_profiles_admin(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION search_profiles_admin(TEXT, INT, INT) TO authenticated;

REVOKE ALL ON FUNCTION search_questions(TEXT, TEXT, TEXT, INT, BOOLEAN, BOOLEAN, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION search_questions(TEXT, TEXT, TEXT, INT, BOOLEAN, BOOLEAN, INT, INT) TO authenticated, anon;


-- 8. DOGRULAMA (manuel calistirma icin, migration'in parcasi degil)
-- ------------------------------------------------------------
-- SELECT immutable_unaccent('Ozkan Cografya');
-- SELECT * FROM search_profiles('ozkan', NULL, 10);
-- SELECT * FROM search_questions('cozum', NULL, NULL, NULL, NULL, FALSE, 0, 20);
