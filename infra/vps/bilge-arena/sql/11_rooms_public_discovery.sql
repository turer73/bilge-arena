-- =============================================================================
-- Bilge Arena Oda Sistemi: 11_rooms_public_discovery migration (Sprint 2A Task 3)
-- =============================================================================
-- Hedef: Public oda discovery — host opt-in checkbox, /oda?tab=public listesi
--          - rooms.is_public BOOLEAN NOT NULL DEFAULT FALSE
--          - chk_rooms_public_max_players_cap (max 6 — roadmap 2-6 kisi)
--          - Partial index idx_rooms_public_lobby (created_at DESC + category)
--          - GRANT SELECT ON rooms TO anon (anon kullanici listede gorur)
--          - RLS policy rooms_select_public_lobby (TO anon, authenticated)
--          - create_room RPC 9. parametre p_is_public BOOLEAN DEFAULT FALSE
--
-- Plan referansi: docs/plans/2026-05-01-sprint2-dwell-time-improvements.md
--                 Task 3 (Public oda discovery, +60sn yeni user dwell)
-- Memory referans: id=143 (oda roadmap, 2-6 kisi); id=413 (lobby drop research)
--
-- Plan-deviations:
--   #65 (yeni): max_players cap public oda icin 6 (memory id=143 roadmap
--       "Senkron 2-6 kisi yarismasi"). Plan dokumani 10 demisti, roadmap
--       gerek tutarliligi tercih edildi. Spam mitigation Sprint 3A.5'a baglidir.
--   #66 (yeni, Codex P1 onlem): GRANT SELECT ON rooms TO anon eklenmeli
--       (0_init_db.sql:82 default privileges sadece authenticated icin).
--       Eksiltirsek rooms_select_public_lobby policy gecerli olmadan
--       permission error doner — anon kullanici "Aktif Odalar" sekmesinde
--       hicbir oda goremez (PR #60 Codex P1 ile ayni pattern).
--   #67 (yeni): chk_rooms_public_lobby_only constraint EKLEMIYORUZ. Aksi
--       takdirde state transition lobby->active (start_room) is_public=true
--       icin CHECK violation verir. RLS policy state filtresi (lobby) lobby
--       drop kapsami yeterli; aktif/reveal/completed odalar zaten Aktif
--       Odalar listesinde gorunmez (state='lobby' filter).
--   #68 (yeni): create_room 9. parametre, eski 8-arg DROP edildi (PR #58
--       patterni). Production deploy ile migration apply arasinda kucuk
--       pencere riski (memory id=416). Trafik dusuk kabul edildi.
--   #69 (yeni, Codex P1 v2): rooms.member_count denormalized + trigger
--       senkronizasyon. Ilk yaklasim PostgREST `room_members(count)` embed
--       idi ama room_members RLS policy `TO authenticated` + same-room
--       member only — anon user yetki yok, uye sayisi 0/6 gorur (Codex P1
--       PR #61). RLS policy ekle yaklasimi rooms <-> room_members policy
--       cagrisinda recursion riski (rooms FORCE RLS aktif, owner bypass
--       yok). Cozum: rooms.member_count INT cached + AFTER trigger ile
--       room_members CRUD'unda guncellenir. Anti-cheat: trigger SECURITY
--       DEFINER, count manipule edilemez. Backfill UPDATE migration'in
--       icinde.
--
-- Kalitim plan-deviations:
--   #41: Caller identity = auth.uid()
--   #53: REVOKE PUBLIC + GRANT authenticated (privilege hardening)
--   #58 (PR #58): auto_relay_tick imzasi degismedi
--   #63 (PR #60): RPC SECURITY DEFINER (questions REVOKE workaround)
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/11_rooms_public_discovery.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- 1) rooms.is_public kolonu (default FALSE — host opt-in)
-- =============================================================================
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;

-- =============================================================================
-- 1b) rooms.member_count denormalized (Codex P1 v2 fix)
-- =============================================================================
-- room_members RLS authenticated only + same-room member -> anon kullanici
-- room_members(count) embed alamaz. Recursion riski oldugu icin RLS policy
-- yerine cached count + trigger pattern (plan-deviation #69).
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS member_count INT NOT NULL DEFAULT 0;

-- Backfill: mevcut odalar icin aktif uye sayisi
UPDATE public.rooms r
SET member_count = (
  SELECT COUNT(*)
  FROM public.room_members rm
  WHERE rm.room_id = r.id
    AND rm.is_active = TRUE
);

-- Trigger fonksiyon: room_members CRUD -> rooms.member_count senkron
-- SECURITY DEFINER: trigger kullanici yetkilerine bagimsiz calismali
CREATE OR REPLACE FUNCTION public._room_members_count_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_active = TRUE THEN
      UPDATE public.rooms
      SET member_count = member_count + 1, updated_at = NOW()
      WHERE id = NEW.room_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.is_active = TRUE THEN
      UPDATE public.rooms
      SET member_count = GREATEST(0, member_count - 1), updated_at = NOW()
      WHERE id = OLD.room_id;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- is_active flag toggle (kick = TRUE -> FALSE; rejoin tersi)
    IF OLD.is_active = TRUE AND NEW.is_active = FALSE THEN
      UPDATE public.rooms
      SET member_count = GREATEST(0, member_count - 1), updated_at = NOW()
      WHERE id = NEW.room_id;
    ELSIF OLD.is_active = FALSE AND NEW.is_active = TRUE THEN
      UPDATE public.rooms
      SET member_count = member_count + 1, updated_at = NOW()
      WHERE id = NEW.room_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_room_members_count_sync ON public.room_members;
CREATE TRIGGER trg_room_members_count_sync
  AFTER INSERT OR UPDATE OF is_active OR DELETE ON public.room_members
  FOR EACH ROW
  EXECUTE FUNCTION public._room_members_count_sync();

-- =============================================================================
-- 2) chk_rooms_public_max_players_cap — public oda max 6 kisi (roadmap)
-- =============================================================================
ALTER TABLE public.rooms
  DROP CONSTRAINT IF EXISTS chk_rooms_public_max_players_cap;

ALTER TABLE public.rooms
  ADD CONSTRAINT chk_rooms_public_max_players_cap
    CHECK (is_public = FALSE OR max_players <= 6);

-- =============================================================================
-- 3) Partial index idx_rooms_public_lobby — sik query (public + lobby)
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_rooms_public_lobby
  ON public.rooms (created_at DESC, category)
  WHERE is_public = TRUE AND state = 'lobby';

-- =============================================================================
-- 4) GRANT SELECT ON rooms TO anon (Codex P1 onlem)
-- =============================================================================
-- 0_init_db.sql:82 default privileges sadece authenticated. Anon explicit GRANT
-- gerek; aksi takdirde RLS policy gecerli degil, permission denied.
GRANT SELECT ON public.rooms TO anon;

-- =============================================================================
-- 5) RLS policy rooms_select_public_lobby (TO anon, authenticated)
-- =============================================================================
-- Mevcut rooms_select_host_or_member (TO authenticated) ile OR'lanir.
-- Anon kullanici sadece bu policy ile filter edilir (host/member degil).
DROP POLICY IF EXISTS rooms_select_public_lobby ON public.rooms;
CREATE POLICY rooms_select_public_lobby
  ON public.rooms
  FOR SELECT
  TO anon, authenticated
  USING (is_public = TRUE AND state = 'lobby');

-- =============================================================================
-- 6) create_room RPC: 9. parametre p_is_public
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_room(
  p_title TEXT,
  p_category TEXT,
  p_difficulty SMALLINT DEFAULT 2,
  p_question_count SMALLINT DEFAULT 10,
  p_max_players SMALLINT DEFAULT 8,
  p_per_question_seconds SMALLINT DEFAULT 20,
  p_mode TEXT DEFAULT 'sync',
  p_auto_advance_seconds INT DEFAULT 5,
  p_is_public BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller   UUID;
  v_room_id  UUID;
  v_code     CHAR(6);
  v_attempt  INT := 0;
  v_max_retry CONSTANT INT := 5;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required (auth.uid() NULL)'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_auto_advance_seconds < 0 OR p_auto_advance_seconds > 30 THEN
    RAISE EXCEPTION 'auto_advance_seconds 0-30 araligi disinda: %', p_auto_advance_seconds
      USING ERRCODE = 'P0001';
  END IF;

  -- Public oda max_players cap (Zod onceden filtreler, DB ikinci kat)
  IF p_is_public = TRUE AND p_max_players > 6 THEN
    RAISE EXCEPTION 'Public oda max 6 oyunculu olabilir, mevcut: %', p_max_players
      USING ERRCODE = 'P0001';
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_code := public._gen_room_code();

    BEGIN
      INSERT INTO public.rooms
        (code, host_id, title, category, difficulty, question_count,
         max_players, per_question_seconds, mode, state, auto_advance_seconds,
         is_public)
      VALUES
        (v_code, v_caller, p_title, p_category, p_difficulty, p_question_count,
         p_max_players, p_per_question_seconds, p_mode, 'lobby',
         p_auto_advance_seconds, p_is_public)
      RETURNING id INTO v_room_id;

      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        IF v_attempt >= v_max_retry THEN
          RAISE EXCEPTION 'Code generation 5 retry sonrasi cakistir, sasirtici dolu'
            USING ERRCODE = 'P0013';
        END IF;
    END;
  END LOOP;

  INSERT INTO public.room_members (room_id, user_id, role)
    VALUES (v_room_id, v_caller, 'host');

  INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
    VALUES (v_room_id, v_caller, 'room_created',
            jsonb_build_object(
              'code', v_code,
              'category', p_category,
              'difficulty', p_difficulty,
              'question_count', p_question_count,
              'max_players', p_max_players,
              'per_question_seconds', p_per_question_seconds,
              'mode', p_mode,
              'auto_advance_seconds', p_auto_advance_seconds,
              'is_public', p_is_public,
              'attempts', v_attempt
            ));

  RETURN jsonb_build_object(
    'id', v_room_id,
    'code', v_code
  );
END;
$$;

-- Eski 8-parametreli imzayi DROP et (yeni 9-parametreli ile cakisma)
DROP FUNCTION IF EXISTS public.create_room(TEXT, TEXT, SMALLINT, SMALLINT,
                                            SMALLINT, SMALLINT, TEXT, INT);

REVOKE EXECUTE ON FUNCTION public.create_room(TEXT, TEXT, SMALLINT, SMALLINT,
                                                SMALLINT, SMALLINT, TEXT, INT,
                                                BOOLEAN)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_room(TEXT, TEXT, SMALLINT, SMALLINT,
                                              SMALLINT, SMALLINT, TEXT, INT,
                                              BOOLEAN)
  TO authenticated;

COMMIT;
