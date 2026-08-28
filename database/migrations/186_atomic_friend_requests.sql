-- Migration 186: atomik arkadas istegi ve route-only friendship DML.

BEGIN;

CREATE OR REPLACE FUNCTION public.request_friendship(
  p_requester uuid,
  p_target uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_status text;
  v_pair_key text;
BEGIN
  IF p_requester IS NULL OR p_target IS NULL OR p_requester = p_target THEN
    RETURN 'invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS target
    WHERE target.id = p_target
      AND target.deleted_at IS NULL
  ) THEN
    RETURN 'not_found';
  END IF;

  -- A->B ve B->A ayni transaction kilidini kullanir. Boylece ters yonlu
  -- eszamanli istekler kontrol/insert arasinda cift kayit uretemez.
  v_pair_key := CASE
    WHEN p_requester::text < p_target::text
      THEN p_requester::text || ':' || p_target::text
    ELSE p_target::text || ':' || p_requester::text
  END;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_pair_key, 0));

  SELECT friendship.status
  INTO v_status
  FROM public.friendships AS friendship
  WHERE (friendship.user_id = p_requester AND friendship.friend_id = p_target)
     OR (friendship.user_id = p_target AND friendship.friend_id = p_requester)
  ORDER BY CASE friendship.status
    WHEN 'blocked' THEN 1
    WHEN 'accepted' THEN 2
    ELSE 3
  END
  LIMIT 1
  FOR UPDATE;

  IF v_status = 'blocked' THEN RETURN 'blocked'; END IF;
  IF v_status = 'accepted' THEN RETURN 'accepted'; END IF;
  IF v_status = 'pending' THEN RETURN 'pending'; END IF;

  INSERT INTO public.friendships(user_id, friend_id, status)
  VALUES (p_requester, p_target, 'pending');

  RETURN 'sent';
END
$function$;

REVOKE ALL ON FUNCTION public.request_friendship(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_friendship(uuid, uuid)
  TO service_role;

-- block_user ile request_friendship ayni siralanmis kullanici cifti icin ayni
-- transaction kilidini almak zorundadir. Aksi halde blok ve ters yonlu istek
-- eszamanli calisip ayni ciftte blocked + pending kaydi birakabilir.
CREATE OR REPLACE FUNCTION public.block_user(p_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_me uuid := auth.uid();
  v_pair_key text;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '28000';
  END IF;
  IF p_target IS NULL OR p_target = v_me THEN
    RAISE EXCEPTION 'invalid target' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS target
    WHERE target.id = p_target AND target.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'target not found' USING ERRCODE = 'P0002';
  END IF;

  v_pair_key := CASE
    WHEN v_me::text < p_target::text
      THEN v_me::text || ':' || p_target::text
    ELSE p_target::text || ':' || v_me::text
  END;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_pair_key, 0));

  DELETE FROM public.friendships AS friendship
  WHERE (friendship.user_id = v_me AND friendship.friend_id = p_target)
     OR (friendship.user_id = p_target AND friendship.friend_id = v_me);

  INSERT INTO public.friendships(user_id, friend_id, status)
  VALUES (v_me, p_target, 'blocked');
END
$function$;

REVOKE ALL ON FUNCTION public.block_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.block_user(uuid) TO authenticated;

-- Arkadaslik mutasyonlari yalnız kimlik dogrulayan server route/RPC'lerden
-- gecsin. SECURITY DEFINER block_user kendi owner yetkisiyle calismaya devam eder.
REVOKE ALL ON TABLE public.friendships FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.friendships TO service_role;

DO $verify_atomic_friend_requests$
BEGIN
  IF has_function_privilege('authenticated', 'public.request_friendship(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.request_friendship(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '186 verification: request RPC grants invalid';
  END IF;

  IF has_table_privilege('authenticated', 'public.friendships', 'INSERT')
     OR has_table_privilege('authenticated', 'public.friendships', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.friendships', 'DELETE') THEN
    RAISE EXCEPTION '186 verification: browser friendship DML still enabled';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.block_user(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.block_user(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '186 verification: block RPC grants invalid';
  END IF;
END
$verify_atomic_friend_requests$;

COMMIT;

NOTIFY pgrst, 'reload schema';
