-- =============================================================================
-- Bilge Arena Oda Sistemi: 27_realtime_room_channel_auth migration
-- =============================================================================
-- Hedef: room-<uuid> Realtime kanalinda presence ve broadcast yetkisini oda
--        uyeligine baglamak (istemci kanali private acar:
--        src/lib/rooms/setup-room-channel.ts).
--
-- Kaynak: derin-inceleme-2026-10-15.md bolum 4.1, Klipper disc #2611.
--
-- Canli olcum (2026-10-18, bilge-arena-db + supabase/realtime v2.140.7,
-- salt okuma):
--   - Istemci room-${roomId} kanalina private olmadan katiliyordu. Oda
--     kimligini bilen her gecerli token sahibi presence listesini okuyabiliyor,
--     typing_start/typing_stop yayini yapabiliyordu.
--   - realtime.messages: RLS acik, politika YOK. Yani private kanal bugun
--     herkese kapali; istemci bu dosya uygulanmadan private'a gecerse kanal
--     kurulamaz (oda polling ile calismaya devam eder).
--   - _realtime.tenants (ws-dev): private_only = false.
--
-- Cozum:
--   Realtime private kanalda yetkiyi realtime.messages uzerinden sinar:
--     - dinleme: katilirken topic + extension ('broadcast', 'presence')
--       satirlarini JWT'deki rol (authenticated) ve claim'lerle SELECT eder;
--     - yayin / presence track: ayni rol ve claim'lerle INSERT dener.
--   Iki politika da public.is_room_member'i (SECURITY DEFINER,
--   is_active = TRUE) cagirir: atilan ya da ayrilan uye katilamaz. Topic
--   room-<uuid> bicimi disindaysa CASE NULL doner (uuid cast hatasi olmaz),
--   is_room_member(NULL) false'tur.
--
--   postgres_changes bu politikalardan bagimsizdir; tablo RLS'i (3, 26)
--   gecerli kalir.
--
-- Uygulama sirasi: istemcinin private kanala gectigi Vercel deploy'undan
-- ONCE. Public kanali etkilemez.
--
-- Kullanim:
--   docker exec -i bilge-arena-db psql -U ba_admin -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/27_realtime_room_channel_auth.sql
--
-- Geri alma:
--   DROP POLICY IF EXISTS room_channel_select_members ON realtime.messages;
--   DROP POLICY IF EXISTS room_channel_insert_members ON realtime.messages;
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NULL THEN
    RAISE EXCEPTION 'realtime.messages yok: Realtime tenant migration''lari calismamis';
  END IF;
  IF to_regprocedure('public.is_room_member(uuid)') IS NULL THEN
    RAISE EXCEPTION 'public.is_room_member(uuid) yok (3_rooms_rls.sql)';
  END IF;
END $$;

-- Realtime tenant migration'i zaten aciyor; politikalar RLS kapaliyken
-- anlamsiz oldugu icin burada da garanti altina aliniyor.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_channel_select_members ON realtime.messages;
CREATE POLICY room_channel_select_members ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    extension IN ('broadcast', 'presence')
    AND public.is_room_member(
      CASE
        WHEN topic ~* '^room-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN substring(topic FROM 6)::uuid
      END
    )
  );

DROP POLICY IF EXISTS room_channel_insert_members ON realtime.messages;
CREATE POLICY room_channel_insert_members ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    extension IN ('broadcast', 'presence')
    AND public.is_room_member(
      CASE
        WHEN topic ~* '^room-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN substring(topic FROM 6)::uuid
      END
    )
  );

COMMENT ON POLICY room_channel_select_members ON realtime.messages IS
  'Oda kanali (room-<uuid>) presence/broadcast dinleme: yalniz aktif oda uyesi. 27_realtime_room_channel_auth.sql';
COMMENT ON POLICY room_channel_insert_members ON realtime.messages IS
  'Oda kanali (room-<uuid>) presence track/broadcast yayin: yalniz aktif oda uyesi. 27_realtime_room_channel_auth.sql';

COMMIT;
