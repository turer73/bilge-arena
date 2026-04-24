-- Migration 028: Add correct_answers + total_questions to search_profiles_admin
--
-- Bug: Admin /kullanicilar page renders Dogru/Toplam column as empty "/"
--   because the search_profiles_admin RPC RETURNS TABLE signature does not
--   include correct_answers or total_questions. The profiles table has both
--   columns (INTEGER DEFAULT 0), and the frontend (page.tsx:289) expects
--   `u.correct_answers/u.total_questions`, but receives undefined/undefined.
--
-- Root cause: When migration 026 was authored (unaccent search), the RPC
--   RETURNS TABLE list was not updated to include these two columns. 027
--   only added the defense-in-depth permission guard, not the columns.
--
-- Fix: Recreate search_profiles_admin with correct_answers INTEGER and
--   total_questions INTEGER in both the RETURNS TABLE and the SELECT list.
--   Defense-in-depth guard and grants remain identical to 027.
--
-- Compatibility: CREATE OR REPLACE FUNCTION does NOT allow changing the
--   return type, so DROP FUNCTION IF EXISTS is required. REVOKE/GRANT are
--   re-applied to keep the migration self-contained and idempotent.
--
-- Rollback: Re-run migration 027 to restore the previous signature (without
--   correct_answers + total_questions). The defense-in-depth guard stays.


DROP FUNCTION IF EXISTS search_profiles_admin(TEXT, INT, INT);

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
  correct_answers INTEGER,
  total_questions INTEGER,
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
  -- Defense-in-depth: require admin.users.view permission (same as 027)
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
      p.correct_answers,
      p.total_questions,
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


-- Grants (idempotent; same as 027 — repeated so migration is self-contained)
REVOKE ALL ON FUNCTION search_profiles_admin(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION search_profiles_admin(TEXT, INT, INT) TO authenticated;


-- Verification (manual, not part of migration)
-- As a non-admin session:
--   SELECT * FROM search_profiles_admin('x');
--   -- expected: ERROR: admin privileges required (ERRCODE 42501)
--
-- As an admin session:
--   SELECT correct_answers, total_questions FROM search_profiles_admin(NULL, 0, 5);
--   -- expected: rows with integer values (0 for users with no answers)
