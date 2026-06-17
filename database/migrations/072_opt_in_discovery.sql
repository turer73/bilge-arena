-- Migration 072: opt-in keşif (is_discoverable)
--
-- Şu an search_profiles TÜM aktif kullanıcıları döndürüyor (opt-in yok). Bu MVP
-- bulunabilirliği kullanıcı denetimine alır.
--
-- Grandfather kararı (kullanıcı): mevcut kullanıcılar TRUE (bulunabilirlik korunur,
--   arama bozulmaz), yeni kayıtlar FALSE (privacy-by-default, opt-in). Reşit-olmayan
--   taban için ileriye-dönük gizlilik + mevcut arkadaş-bulma kesintiye uğramaz.
--
-- search_profiles'a `AND p.is_discoverable` eklenir; block-exclusion (070) + honeypot
--   (053) + unaccent filtreleri korunur (CREATE OR REPLACE, signature aynı).

BEGIN;

-- Yeni kolon: yeni kullanıcılar FALSE (column default)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_discoverable BOOLEAN NOT NULL DEFAULT FALSE;

-- Grandfather: mevcut tüm kullanıcıları bulunabilir yap (idempotent guard)
UPDATE profiles SET is_discoverable = TRUE WHERE is_discoverable = FALSE;

-- Yeni kolonu okuma izni (profiles column-level grant senaryosu için; table-level ise redundant/zararsız)
GRANT SELECT (is_discoverable) ON profiles TO authenticated, anon;
-- Yazma: kullanıcı kendi flag'ini /api/profile PATCH (service-role) ile günceller; doğrudan UPDATE revoke'lu (069).

-- search_profiles: yalnız is_discoverable=TRUE kullanıcılar
CREATE OR REPLACE FUNCTION search_profiles(q text, exclude_id uuid DEFAULT NULL, result_limit integer DEFAULT 10)
RETURNS TABLE(id uuid, username varchar, display_name varchar, avatar_url text, total_xp integer)
LANGUAGE sql
STABLE
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
  AND p.is_discoverable
  AND p.username NOT LIKE '\_\_honeypot\_%\_\_' ESCAPE '\'
  AND (exclude_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM friendships f
    WHERE f.status = 'blocked'
      AND ((f.user_id = exclude_id AND f.friend_id = p.id)
        OR (f.user_id = p.id AND f.friend_id = exclude_id))
  ))
  ORDER BY p.total_xp DESC NULLS LAST
  LIMIT LEAST(GREATEST(result_limit, 1), 50)
$func$;

REVOKE ALL ON FUNCTION search_profiles(text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION search_profiles(text, uuid, integer) TO authenticated;

COMMIT;
