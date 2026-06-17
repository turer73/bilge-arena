-- Migration 073: PII'siz public profil — get_public_profile(username) RPC
--
-- /u/[username] public profil sayfası için. Yalnız güvenli kolonlar döner;
-- city/grade/email/premium gibi PII ASLA. display_name de DÖNMEZ — gerçek-isim
-- içerebilir (OAuth full_name / kullanıcı-set) ve sayfa anon-viewable; username
-- (auto-generated, PII'siz) gösterilir (app zaten username'i tercih ediyor).
-- Gate: is_discoverable=TRUE (opt-out olanın public profili de yok) + silinmemiş.
-- SECURITY DEFINER (RLS bypass ama yalnız whitelist kolon). anon+authenticated EXECUTE.
--
-- (Prod'a 2 parça uygulandı: public_profile_rpc + public_profile_rpc_username_only.
--  Bu dosya kanonik son hâl — DROP+CREATE, return-type değişimi için.)

DROP FUNCTION IF EXISTS get_public_profile(text);

CREATE FUNCTION get_public_profile(p_username text)
RETURNS TABLE(
  id uuid,
  username varchar,
  avatar_url text,
  level smallint,
  level_name varchar,
  total_xp integer,
  current_streak smallint,
  longest_streak smallint,
  total_questions integer,
  correct_answers integer,
  selected_nameplate text,
  selected_avatar_decorations text[],
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT p.id, p.username, p.avatar_url, p.level, p.level_name,
         p.total_xp, p.current_streak, p.longest_streak, p.total_questions, p.correct_answers,
         p.selected_nameplate, p.selected_avatar_decorations, p.created_at
  FROM profiles p
  WHERE lower(p.username) = lower(p_username)
    AND p.deleted_at IS NULL
    AND p.is_discoverable
  LIMIT 1
$func$;

REVOKE ALL ON FUNCTION get_public_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_profile(text) TO anon, authenticated;
