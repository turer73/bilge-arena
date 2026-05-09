-- =============================================================================
-- Bilge Arena Oda Sistemi: supabase_realtime publication kurulumu
-- =============================================================================
-- Hedef: wal_level=logical aktif olduktan sonra postgres_changes icin
--        supabase_realtime publication'ini olustur. Realtime v2.30.34
--        bu publication'i dinleyerek rooms/room_members/room_rounds/
--        room_answers tablolarindaki degisiklikleri WebSocket client'lara
--        yayinlar.
--
-- Calistirma (VPS):
--   docker exec -i panola-postgres psql -U panola_admin -d bilge_arena_dev \
--     -f /opt/bilge-arena/sql/25_realtime_publication.sql
--
-- ON_ERROR_STOP: publication zaten varsa ya da wal_level!=logical ise hata ver.
-- Idempotent: CREATE PUBLICATION IF NOT EXISTS (PG15+) veya DROP IF EXISTS + CREATE.
--
-- Plan referansi: plan-deviation #12 (wal_level=logical 2026-05-09 onaylandi)
-- =============================================================================

\set ON_ERROR_STOP on

-- wal_level kontrolu
DO $$
BEGIN
  IF current_setting('wal_level') <> 'logical' THEN
    RAISE EXCEPTION 'wal_level=logical gerekli, simdi: %', current_setting('wal_level');
  END IF;
END;
$$;

-- publication olustur (zaten varsa atla)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    EXECUTE $pub$
      CREATE PUBLICATION supabase_realtime
      FOR TABLE
        public.rooms,
        public.room_members,
        public.room_rounds,
        public.room_answers
    $pub$;
    RAISE NOTICE 'supabase_realtime publication olusturuldu.';
  ELSE
    -- Varsa tabloları ekle (eksik olabilir)
    EXECUTE $pub$
      ALTER PUBLICATION supabase_realtime
        ADD TABLE public.rooms, public.room_members, public.room_rounds, public.room_answers
    $pub$;
    RAISE NOTICE 'supabase_realtime publication zaten vardi, tablolar eklendi.';
  END IF;
END;
$$;

-- Dogrulama
SELECT pubname, schemaname, tablename
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
  ORDER BY tablename;
