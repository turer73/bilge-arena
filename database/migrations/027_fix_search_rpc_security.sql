-- Migration 027: RPC privilege escalation fix (Codex PR #14 review, P1)
--
-- Issue 1: search_profiles_admin is SECURITY DEFINER + GRANT EXECUTE TO authenticated.
--   Any logged-in user can call it via supabase.rpc() and bypass the
--   /api/admin/users route's checkPermission('admin.users.view') guard.
--   Exposes full profile data including deleted_at + role fields.
--
-- Issue 2: search_questions has caller-controlled admin_view boolean + SECURITY
--   DEFINER + GRANT EXECUTE TO authenticated, anon. Any caller can set
--   admin_view=true to read inactive (hidden) questions, bypassing the
--   /api/questions route's checkAdmin.
--
-- Fix: Convert both functions to PL/pgSQL. Guard body with auth.uid() +
-- role_permissions lookup. Defense-in-depth — SQL denies access even if
-- the route guard is bypassed.
--
-- Compatibility: CREATE OR REPLACE does not drop existing grants/indexes.
-- If migration 026 was already applied, this migration rewrites the
-- function bodies only. If 026 was never applied, running 026 followed by
-- 027 yields the same final state.
--
-- Rollback:
--   See migration 026 to restore the original (vulnerable) bodies.


-- 1. search_profiles_admin — require admin.users.view permission
-- ------------------------------------------------------------

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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  -- Defense-in-depth: require admin.users.view permission
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND rp.permission = 'admin.users.view'
  ) THEN
    RAISE EXCEPTION 'admin privileges required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
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
    LIMIT LEAST(GREATEST(result_limit, 1), 100);
END
$func$;


-- 2. search_questions — require admin.dashboard.view when admin_view=TRUE
-- ------------------------------------------------------------
-- Non-admin path (admin_view=FALSE, default) remains available to anon +
-- authenticated for the quiz UI; inactive rows are filtered out by the
-- existing is_active predicate.

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
    LIMIT LEAST(GREATEST(result_limit, 1), 100);
END
$func$;


-- 3. Grants (idempotent; same as 026 — repeated so migration is self-contained)
-- ------------------------------------------------------------

REVOKE ALL ON FUNCTION search_profiles_admin(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION search_profiles_admin(TEXT, INT, INT) TO authenticated;

REVOKE ALL ON FUNCTION search_questions(TEXT, TEXT, TEXT, INT, BOOLEAN, BOOLEAN, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION search_questions(TEXT, TEXT, TEXT, INT, BOOLEAN, BOOLEAN, INT, INT) TO authenticated, anon;


-- 4. Verification (manual, not part of migration)
-- ------------------------------------------------------------
-- As a non-admin session:
--   SELECT * FROM search_profiles_admin('x');
--   -- expected: ERROR: admin privileges required
--
--   SELECT * FROM search_questions('x', NULL, NULL, NULL, NULL, TRUE, 0, 5);
--   -- expected: ERROR: admin_view requires admin privileges
--
--   SELECT * FROM search_questions('x', NULL, NULL, NULL, NULL, FALSE, 0, 5);
--   -- expected: OK (active rows only)
