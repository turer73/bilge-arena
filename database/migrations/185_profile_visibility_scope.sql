-- Migration 185: profil goruntuleme kapsami.
--
-- is_discoverable yalniz arkadas aramasinda bulunabilirligi kontrol eder.
-- profile_visibility ise /u/[username] profilini kimin gorebilecegini belirler:
--   private  -> yalniz profil sahibi
--   friends  -> profil sahibi + kabul edilmis arkadaslari
--   public   -> herkes
--
-- RPC yalniz service_role tarafindan cagrilir. p_viewer_id tarayicidan dogrudan
-- guvenilmez; server route/session dogrulamasindan sonra aktarilir.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_visibility text NOT NULL DEFAULT 'private';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_profile_visibility_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_profile_visibility_check
  CHECK (profile_visibility IN ('private', 'friends', 'public'));

-- Grandfather yok: migration 072 eski hesaplari arama kesilmesin diye topluca
-- discoverable yapmisti. Bu, acik profil icin verilmis bireysel riza degildir.
-- Mevcut ve yeni hesaplar acik secim yapana kadar private kalir.

COMMENT ON COLUMN public.profiles.profile_visibility IS
  'Public profile audience: private, accepted friends, or public. Independent from search discovery.';

DROP FUNCTION IF EXISTS public.get_public_profile(text);
DROP FUNCTION IF EXISTS public.get_public_profile(text, uuid);

CREATE FUNCTION public.get_public_profile(
  p_username text,
  p_viewer_id uuid DEFAULT NULL
)
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
  created_at timestamptz,
  relationship_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT
    p.id,
    p.username,
    p.avatar_url,
    p.level,
    p.level_name,
    p.total_xp,
    p.current_streak,
    p.longest_streak,
    p.total_questions,
    p.correct_answers,
    p.selected_nameplate,
    p.selected_avatar_decorations,
    p.created_at,
    CASE
      WHEN p.id = p_viewer_id THEN 'self'
      ELSE (
        SELECT friendship.status
        FROM public.friendships AS friendship
        WHERE (friendship.user_id = p.id AND friendship.friend_id = p_viewer_id)
           OR (friendship.user_id = p_viewer_id AND friendship.friend_id = p.id)
        LIMIT 1
      )
    END AS relationship_status
  FROM public.profiles AS p
  WHERE lower(p.username) = lower(p_username)
    AND p.deleted_at IS NULL
    AND (
      p.profile_visibility = 'public'
      OR p.id = p_viewer_id
      OR (
        p.profile_visibility = 'friends'
        AND p_viewer_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.friendships AS friendship
          WHERE friendship.status = 'accepted'
            AND (
              (friendship.user_id = p.id AND friendship.friend_id = p_viewer_id)
              OR (friendship.user_id = p_viewer_id AND friendship.friend_id = p.id)
            )
        )
      )
    )
    AND (
      p_viewer_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.friendships AS blocked
        WHERE blocked.status = 'blocked'
          AND (
            (blocked.user_id = p.id AND blocked.friend_id = p_viewer_id)
            OR (blocked.user_id = p_viewer_id AND blocked.friend_id = p.id)
          )
      )
    )
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION public.get_public_profile(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profile(text, uuid)
  TO service_role;

-- Arkadas aramasi bulunabilirligi korur fakat private/friends profillerin
-- gercek adini ve ogrenme istatistiklerini arama sonucunda acmaz.
-- Donus satirina profile_viewable eklendigi icin PostgreSQL mevcut fonksiyonun
-- return tipini CREATE OR REPLACE ile degistiremez; ayni imzayi once kaldir.
DROP FUNCTION IF EXISTS public.search_profiles(text, uuid, integer);

CREATE FUNCTION public.search_profiles(
  q text,
  exclude_id uuid DEFAULT NULL,
  result_limit integer DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  username varchar,
  display_name varchar,
  avatar_url text,
  total_xp integer,
  profile_viewable boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT
    p.id,
    p.username,
    NULL::varchar AS display_name,
    p.avatar_url,
    CASE WHEN p.profile_visibility = 'public' THEN p.total_xp ELSE 0 END AS total_xp,
    (p.profile_visibility = 'public') AS profile_viewable
  FROM public.profiles AS p
  WHERE (
    public.immutable_unaccent(p.username) ILIKE public.immutable_unaccent('%' || q || '%')
    OR public.immutable_unaccent(p.display_name) ILIKE public.immutable_unaccent('%' || q || '%')
  )
    AND (exclude_id IS NULL OR p.id <> exclude_id)
    AND p.deleted_at IS NULL
    AND p.is_discoverable
    AND p.username NOT LIKE '\_\_honeypot\_%\_\_' ESCAPE '\'
    AND (exclude_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.friendships AS friendship
      WHERE (friendship.user_id = exclude_id AND friendship.friend_id = p.id)
         OR (friendship.user_id = p.id AND friendship.friend_id = exclude_id)
    ))
  ORDER BY p.total_xp DESC NULLS LAST
  LIMIT LEAST(GREATEST(result_limit, 1), 50)
$function$;

REVOKE ALL ON FUNCTION public.search_profiles(text, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_profiles(text, uuid, integer)
  TO service_role;

DO $verify_profile_visibility$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_profile_visibility_check'
  ) THEN
    RAISE EXCEPTION '185 verification: profile visibility constraint missing';
  END IF;

  IF has_function_privilege('anon', 'public.get_public_profile(text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_public_profile(text,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.get_public_profile(text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '185 verification: profile RPC grants invalid';
  END IF;

  IF has_function_privilege('authenticated', 'public.search_profiles(text,uuid,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.search_profiles(text,uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION '185 verification: search RPC grants invalid';
  END IF;
END
$verify_profile_visibility$;

COMMIT;

NOTIFY pgrst, 'reload schema';
