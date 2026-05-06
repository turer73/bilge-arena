-- Migration 043: Multiplayer stats + grant RPC + idempotency log
--
-- Faz 3 Multiplayer achievements MVP
--
-- Mimari karar:
-- Oda DB'si bilge_arena_dev (VPS)'de, ana DB Panola'da. Cross-DB query
-- gerek olmamasi icin: oda biter biter frontend (or backend) Panola'ya
-- "increment my stats" cagrir, idempotency log ile cift sayim engellenir.
-- Profile uzerinde 3 sayac:
--   - rooms_completed: kac oda tamamlandi (sira fark etmeksizin)
--   - multiplayer_wins: kac odada >= 2. siraya geldi
--                       (Yanlis ifade. "Top 50%" ya da "skor > 0" sayilabilir.
--                        Beta'da "won" = "1. sirada bitirme" alti tanim)
--                       Karar: simdilik 'won' = 'first place' ile ayni
--   - multiplayer_firsts: kac oda 1. sirada bitirildi
-- Idempotency: aynı oda + user icin sadece 1 sync.
--
-- Rollback:
--   BEGIN;
--     ALTER TABLE profiles
--       DROP COLUMN IF EXISTS multiplayer_wins,
--       DROP COLUMN IF EXISTS rooms_completed,
--       DROP COLUMN IF EXISTS multiplayer_firsts;
--     DROP TABLE IF EXISTS multiplayer_room_stats_log;
--     DROP FUNCTION IF EXISTS grant_multiplayer_stats(UUID, TEXT, BOOLEAN);
--   COMMIT;

BEGIN;

-- ── 1. profiles columns ──
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rooms_completed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS multiplayer_wins INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS multiplayer_firsts INTEGER NOT NULL DEFAULT 0;

-- ── 2. Idempotency log tablosu ──
CREATE TABLE IF NOT EXISTS public.multiplayer_room_stats_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  room_id     TEXT NOT NULL, -- bilge_arena_dev oda code/uuid (TEXT cunku cross-DB)
  first_place BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mp_room_log_unique UNIQUE (user_id, room_id)
);

CREATE INDEX IF NOT EXISTS idx_mp_room_log_user_id
  ON public.multiplayer_room_stats_log(user_id);

ALTER TABLE public.multiplayer_room_stats_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mp_room_log_own_select ON public.multiplayer_room_stats_log;
CREATE POLICY mp_room_log_own_select ON public.multiplayer_room_stats_log
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.multiplayer_room_stats_log FROM anon;

-- ── 3. Grant RPC: idempotent stats increment ──
CREATE OR REPLACE FUNCTION public.grant_multiplayer_stats(
  p_room_id     TEXT,
  p_first_place BOOLEAN
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_inserted INT := 0;
  v_new_stats RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  IF p_room_id IS NULL OR length(p_room_id) = 0 THEN
    RAISE EXCEPTION 'room_id required' USING ERRCODE = '22023';
  END IF;

  -- Idempotency check + insert
  INSERT INTO multiplayer_room_stats_log (user_id, room_id, first_place)
  VALUES (v_user_id, p_room_id, p_first_place)
  ON CONFLICT (user_id, room_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    -- Zaten sync edilmis
    SELECT rooms_completed, multiplayer_wins, multiplayer_firsts
    INTO v_new_stats
    FROM profiles WHERE id = v_user_id;

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
  WHERE id = v_user_id
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

-- DEFINER fonksiyon: anon erisimi kapat, sadece authenticated
REVOKE EXECUTE ON FUNCTION public.grant_multiplayer_stats(TEXT, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_multiplayer_stats(TEXT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.grant_multiplayer_stats(TEXT, BOOLEAN) TO authenticated;

-- ── 4. PostgREST sema cache reload ──
NOTIFY pgrst, 'reload schema';

COMMIT;
