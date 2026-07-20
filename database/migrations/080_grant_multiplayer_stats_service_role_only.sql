-- Migration 080: grant_multiplayer_stats — authenticated EXECUTE kaldir, service_role-only
--
-- Denetim bulgusu (KRITIK): grant_multiplayer_stats(TEXT, BOOLEAN) migration 043'te
-- `GRANT EXECUTE ... TO authenticated` ile acilmisti. Fonksiyon auth.uid()'i kendi
-- icinde okuyor ve p_first_place'i DOGRUDAN caller'dan aliyor; tek koruma
-- (user_id, room_id) UNIQUE idempotency kaydi — yani AYNI room_id'yi tekrar
-- gonderemez, ama room_id serbest metin (cross-DB, FK yok) oldugu icin bir
-- kullanici PostgREST'e /rest/v1/rpc/grant_multiplayer_stats'i kendi JWT'siyle
-- DOGRUDAN cagirip her seferinde rastgele/sahte bir room_id + p_first_place=true
-- gondererek rooms_completed/multiplayer_wins/multiplayer_firsts sayaclarini
-- sinirsiz sisirebilir. Next.js route'undaki verifyRoomFirstPlace sunucu-dogrulamasi
-- (grant-stats/route.ts) bu yolu ATLANIR — PostgREST RPC, route'un onune gecmeden
-- Supabase'e dogrudan erisilebilir.
--
-- Fix: kod tabanindaki mevcut guvenli desen (increment_xp/increment_coins —
-- migration 012, svc-client + acik p_user_id, service_role-only) burada da
-- uygulanir. auth.uid() baglilik kaldirilir, p_user_id parametre olarak
-- eklenir; route service-role client'a gecer (auth zaten route'ta JWT ile
-- dogrulaniyor + verifyRoomFirstPlace ile room sonucu ayrica dogrulaniyor).
--
-- Rollback:
--   BEGIN;
--     DROP FUNCTION IF EXISTS public.grant_multiplayer_stats(UUID, TEXT, BOOLEAN);
--     -- eski (TEXT, BOOLEAN) imzasini + authenticated grant'ini geri getirmek
--     -- GUVENLIK ACIGINI YENIDEN ACAR — rollback'te ONERILMEZ, gerekirse
--     -- migration 043'teki orijinal CREATE bloğu manuel calistirilmali.
--   COMMIT;

BEGIN;

-- Eski (TEXT, BOOLEAN) imzali, authenticated'a acik fonksiyonu kaldir
DROP FUNCTION IF EXISTS public.grant_multiplayer_stats(TEXT, BOOLEAN);

CREATE FUNCTION public.grant_multiplayer_stats(
  p_user_id     UUID,
  p_room_id     TEXT,
  p_first_place BOOLEAN
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INT := 0;
  v_new_stats RECORD;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required' USING ERRCODE = '42501';
  END IF;

  IF p_room_id IS NULL OR length(p_room_id) = 0 THEN
    RAISE EXCEPTION 'room_id required' USING ERRCODE = '22023';
  END IF;

  -- Idempotency check + insert
  INSERT INTO multiplayer_room_stats_log (user_id, room_id, first_place)
  VALUES (p_user_id, p_room_id, p_first_place)
  ON CONFLICT (user_id, room_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    -- Zaten sync edilmis
    SELECT rooms_completed, multiplayer_wins, multiplayer_firsts
    INTO v_new_stats
    FROM profiles WHERE id = p_user_id;

    RETURN jsonb_build_object(
      'granted', false,
      'reason', 'already_synced',
      'rooms_completed', v_new_stats.rooms_completed,
      'multiplayer_wins', v_new_stats.multiplayer_wins,
      'multiplayer_firsts', v_new_stats.multiplayer_firsts
    );
  END IF;

  -- Profile increment
  UPDATE profiles
  SET
    rooms_completed = rooms_completed + 1,
    multiplayer_wins = multiplayer_wins + CASE WHEN p_first_place THEN 1 ELSE 0 END,
    multiplayer_firsts = multiplayer_firsts + CASE WHEN p_first_place THEN 1 ELSE 0 END,
    updated_at = NOW()
  WHERE id = p_user_id
  RETURNING rooms_completed, multiplayer_wins, multiplayer_firsts
  INTO v_new_stats;

  RETURN jsonb_build_object(
    'granted', true,
    'rooms_completed', v_new_stats.rooms_completed,
    'multiplayer_wins', v_new_stats.multiplayer_wins,
    'multiplayer_firsts', v_new_stats.multiplayer_firsts
  );
END;
$$;

-- DEFINER fonksiyon: yalniz service_role cagirabilir (Next.js API route, auth+room
-- dogrulamasi zaten yapildiktan sonra). authenticated/anon/PUBLIC EXECUTE YOK.
REVOKE EXECUTE ON FUNCTION public.grant_multiplayer_stats(UUID, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_multiplayer_stats(UUID, TEXT, BOOLEAN) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_multiplayer_stats(UUID, TEXT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.grant_multiplayer_stats(UUID, TEXT, BOOLEAN) TO service_role;

-- PostgREST sema cache reload
NOTIFY pgrst, 'reload schema';

COMMIT;
