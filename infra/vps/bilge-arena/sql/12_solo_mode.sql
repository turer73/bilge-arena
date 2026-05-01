-- =============================================================================
-- Bilge Arena Oda Sistemi: 12_solo_mode migration (Sprint 2B Task 4 / PR1 skeleton)
-- =============================================================================
-- Hedef: "Hizli Oyun" — kullanici tek tikla 4 kisilik oda + 3 bot rakiple
--        oynar (lobby skip degil, host start_room ile baslatir).
--          - room_members.is_bot BOOLEAN DEFAULT FALSE
--          - quick_play_room(p_category, p_difficulty, p_question_count) RPC
--             - oda olusturur (is_public=FALSE, max_players=4)
--             - host = auth.uid() (role=host)
--             - 3 bot member ekle (random UUID, is_bot=TRUE, role=player)
--          - REVOKE PUBLIC + GRANT authenticated
--
-- Plan referansi: docs/plans/2026-05-01-sprint2-dwell-time-improvements.md
--                 Task 4 (Solo mode bot rakipler, dwell 0:45->4:30)
-- Memory referans: id=413 dwell research, id=132 multi-project odak
--
-- Plan-deviations:
--   #70 (yeni): Bot user concept = rastgele UUID + is_bot=TRUE flag.
--       Panola Supabase'de bot user create ETMIYORUZ (cross-project impact).
--       room_members.user_id NOT NULL ama FK YOK (2_rooms.sql:142 — sadece
--       comment "Panola GoTrue user", REFERENCES yok). gen_random_uuid()
--       bot icin guvenli, UNIQUE room_id+user_id collision astronomik dusuk.
--   #71 (yeni): MVP scope bot ANSWER logic dahil DEGIL (PR2'ye baglidir).
--       Bot uyeler reveal'a kadar cevap vermez, auto_relay_tick deadline
--       expired -> reveal -> bot 0 puan. User tek basina yarisir, 1000 puan
--       max ile cikar. Soguk hissi olabilir ama "solo skor toplama" kapsanmaktan
--       geride degil.
--   #72 (yeni): max_players=4 sabit (1 user + 3 bot). Plan dokumanindaki
--       "3 bot rakip" ile uyumlu. Ileride dynamic 1-3 bot configurable.
--   #73 (yeni): quick_play_room oda is_public=FALSE (Aktif Odalar listesinde
--       gozukmez — solo deneyim, public spam onlem).
--   #74 (yeni): rooms.member_count trigger zaten 4 uye INSERT'i syncler
--       (PR #61 plan-deviation #69 paterni); manuel guncelleme gerekmez.
--   #80 (Codex P1 fix): room_members.display_name kolonu (nullable) eklenir
--       ve bot insert'inde "Bot 1/2/3" set edilir. Sprint 1'de Member tipi
--       display_name istiyordu ama room_members tablosunda kolon yoktu —
--       gercek user'lar icin profiles join veya UI fallback kullanilmis.
--       Bu fix bot'lar icin DB-level isim verir, UI'da "BOT" rozet + isim
--       birlikte gosterilir. Mevcut user'lar icin kolon NULL kalir.
--   #81 (Codex P1 fix): title 'Hızlı Oyun' (TR diakritik). Audit log + DB
--       Türkçe karakter, UI ile tutarli (TDK feedback memory).
--
-- Kalitim plan-deviations:
--   #41: Caller identity = auth.uid()
--   #53: REVOKE PUBLIC + GRANT authenticated (privilege hardening)
--   #58: auto_relay_tick imzasi degismedi
--   #69: rooms.member_count denormalized + trigger (PR #61)
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/12_solo_mode.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- 1) room_members.is_bot kolonu (default FALSE — gercek user)
-- =============================================================================
ALTER TABLE public.room_members
  ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT FALSE;

-- =============================================================================
-- 1b) room_members.display_name kolonu (Codex P1 fix #80)
-- =============================================================================
-- Sprint 1'de eksik kalmis: Member tipi display_name istiyordu ama tablo
-- kolonu yoktu. Bot icin DB-level isim ('Bot 1' vb.). Mevcut user'lar icin
-- NULL — UI fallback yapar (Sprint 1 davranisi degismez, yan etki yok).
ALTER TABLE public.room_members
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- =============================================================================
-- 2) quick_play_room: solo oda + 3 bot member tek RPC
-- =============================================================================
-- Plan-deviation #70: bot user_id'leri gen_random_uuid() ile generated.
-- Panola Supabase'de bot user create ETMIYORUZ.
--
-- Returns: jsonb {id, code} -- create_room ile uyumlu return shape
CREATE OR REPLACE FUNCTION public.quick_play_room(
  p_category TEXT,
  p_difficulty SMALLINT DEFAULT 2,
  p_question_count SMALLINT DEFAULT 10
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
  v_bot_id   UUID;
  v_i        INT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required (auth.uid() NULL)'
      USING ERRCODE = 'P0001';
  END IF;

  -- Plan-deviation #72: max_players=4 sabit (1 user + 3 bot)
  -- Plan-deviation #73: is_public=FALSE (solo, Aktif Odalar listesinde gozukmez)
  LOOP
    v_attempt := v_attempt + 1;
    v_code := public._gen_room_code();

    BEGIN
      INSERT INTO public.rooms
        (code, host_id, title, category, difficulty, question_count,
         max_players, per_question_seconds, mode, state, auto_advance_seconds,
         is_public)
      VALUES
        (v_code, v_caller, 'Hızlı Oyun', p_category, p_difficulty,
         p_question_count, 4, 20, 'sync', 'lobby', 5, FALSE)
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

  -- Host (caller) member ekle (display_name NULL — UI/profiles fallback)
  INSERT INTO public.room_members (room_id, user_id, role, is_bot, display_name)
    VALUES (v_room_id, v_caller, 'host', FALSE, NULL);

  -- 3 bot member ekle (rastgele UUID, is_bot=TRUE, role=player, named "Bot N")
  FOR v_i IN 1..3 LOOP
    v_bot_id := gen_random_uuid();
    INSERT INTO public.room_members (room_id, user_id, role, is_bot, display_name)
      VALUES (v_room_id, v_bot_id, 'player', TRUE, 'Bot ' || v_i);
  END LOOP;

  -- Audit
  INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
    VALUES (v_room_id, v_caller, 'quick_play_created',
            jsonb_build_object(
              'code', v_code,
              'category', p_category,
              'bot_count', 3,
              'attempts', v_attempt
            ));

  RETURN jsonb_build_object(
    'id', v_room_id,
    'code', v_code
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.quick_play_room(TEXT, SMALLINT, SMALLINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quick_play_room(TEXT, SMALLINT, SMALLINT) TO authenticated;

COMMIT;
