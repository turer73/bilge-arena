-- Migration 053: Honeypot filter — search_profiles + search_profiles_admin
--
-- Bug: Migration 051 yorumunda admin profil aramasinin
--   `NOT username LIKE '__honeypot_%__'` filtresiyle gizlenmesi gerektigi yazili
--   ama implement edilmedi. search_profiles_admin RPC ORDER BY created_at DESC
--   yaptigi icin honeypot (2026-05-17'de eklendi) admin /kullanicilar listesinde
--   en uste dustu. Arkadas arama RPC'si (search_profiles) de filtresiz; honeypot
--   display_name ile substring eslesmesi mumkun.
--
-- Fix:
--   1) search_profiles_admin — DROP+CREATE, WHERE NOT username LIKE pattern.
--      Return type degismedi; CREATE OR REPLACE da calisirdi ama 028 idempotent
--      DROP+CREATE patternini izledi, ayni stille devam.
--   2) search_profiles — ayni filtre, defense-in-depth.
--
-- Apply guvenlik: Iki RPC de 028+026'daki son tanimla birebir ayni; tek fark
--   sona eklenen `AND p.username NOT LIKE '\_\_honeypot\_%\_\_' ESCAPE '\\'`
--   satiri. Mevcut testler etkilenmez (test fixture'larda __honeypot_* yok).
--
-- Rollback: 028 + 026 sonundaki RPC tanimlarini yeniden apply et.

BEGIN;

-- 1) search_profiles_admin (admin /kullanicilar listesi)
DROP FUNCTION IF EXISTS search_profiles_admin(TEXT, INT, INT);

CREATE FUNCTION search_profiles_admin(
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
    AND p.username NOT LIKE '\_\_honeypot\_%\_\_' ESCAPE '\'
    ORDER BY p.created_at DESC
    OFFSET GREATEST(result_offset, 0)
    LIMIT LEAST(GREATEST(result_limit, 1), 100);
END
$func$;

REVOKE ALL ON FUNCTION search_profiles_admin(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION search_profiles_admin(TEXT, INT, INT) TO authenticated;


-- 2) search_profiles (arkadas arama)
DROP FUNCTION IF EXISTS search_profiles(TEXT, UUID, INT);

CREATE FUNCTION search_profiles(
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
  AND p.username NOT LIKE '\_\_honeypot\_%\_\_' ESCAPE '\'
  ORDER BY p.total_xp DESC NULLS LAST
  LIMIT LEAST(GREATEST(result_limit, 1), 50)
$func$;

REVOKE ALL ON FUNCTION search_profiles(TEXT, UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION search_profiles(TEXT, UUID, INT) TO authenticated;

COMMIT;


-- Apply sonrasi dogrulama:
--   -- admin/kullanicilar honeypot icermemeli
--   SELECT username FROM search_profiles_admin(NULL, 0, 5);
--   -- Beklenen: __honeypot_sentinel_2026_05_17__ YOK
--
--   -- arkadas arama honeypot icermemeli
--   SELECT username FROM search_profiles('honeypot', NULL, 10);
--   -- Beklenen: 0 satir (filtre ile)
--
--   -- admin/stats sayim honeypot DAHIL (kanarya integrity icin)
--   -- check_honeypot_integrity() honeypot kaydini hala goruyor
--   SELECT honeypot_exists FROM check_honeypot_integrity();
--   -- Beklenen: true
