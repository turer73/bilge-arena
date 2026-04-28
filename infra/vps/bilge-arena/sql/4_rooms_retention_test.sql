-- =============================================================================
-- Bilge Arena Oda Sistemi: rooms-retention smoke test (Sprint 1 PR1 Task 1.3)
-- =============================================================================
-- Hedef: rooms-retention.sh icindeki 3 retention SQL query'sinin actual
--        schema'ya karsi calisabildigini transaction icinde ROLLBACK ile
--        dogrula. Asil veri silmiyor; sadece SQL parse + plan check.
--
-- Plan referansi: docs/plans/2026-04-27-oda-sistemi-implementation.md Task 1.3
--
-- Plan-deviations:
--   #21 pg_cron yerine VPS cron (Sprint 0 audit'inde alinmisti).
--   #22 pgTAP yok -> plain SQL DO + RAISE EXCEPTION.
--   #31 Schema column drift: plan 'state=finished' + 'archive_after' + 'finished_at'
--       kullaniyordu; actual 2_rooms.sql migration'inda CHECK enum
--       ('lobby','active','reveal','completed','archived') + 'archived_at' +
--       'ended_at'. Retention SQL'leri schema'ya hizalandi.
--   #32 Plan'da explicit purge retention penceresi yoktu; 30 gun olarak
--       konuldu (KVKK justification: 1 ay replay query window yeterli).
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/4_rooms_retention_test.sql
--
-- RED state: 2_rooms.sql apply edilmediyse -> "relation rooms does not exist"
-- GREEN state: tum NOTICE 'OK: ...', exit 0
-- =============================================================================

BEGIN;

-- 1) Schema columns exist (rooms tablosunda state, archived_at, ended_at)
DO $$
DECLARE
  missing_col TEXT;
BEGIN
  FOR missing_col IN
    SELECT col FROM (VALUES ('state'), ('archived_at'), ('ended_at')) AS t(col)
    WHERE col NOT IN (
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'rooms'
    )
  LOOP
    RAISE EXCEPTION 'ASSERT FAILED: rooms tablosunda % sutunu yok (retention SQL break)', missing_col;
  END LOOP;
  RAISE NOTICE 'OK: rooms.state, rooms.archived_at, rooms.ended_at sutunlari mevcut';
END $$;

-- 2) state CHECK enum'u 'completed' ve 'archived' degerlerini kabul ediyor
-- (chk_rooms_state CHECK constraint'inin clause text'i icinde olmali)
DO $$
DECLARE
  state_chk TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO state_chk
  FROM pg_constraint
  WHERE conname = 'chk_rooms_state'
    AND conrelid = 'public.rooms'::regclass;
  IF state_chk IS NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED: chk_rooms_state constraint bulunamadi';
  END IF;
  IF state_chk NOT LIKE '%completed%' THEN
    RAISE EXCEPTION 'ASSERT FAILED: chk_rooms_state ''completed'' kabul etmiyor: %', state_chk;
  END IF;
  IF state_chk NOT LIKE '%archived%' THEN
    RAISE EXCEPTION 'ASSERT FAILED: chk_rooms_state ''archived'' kabul etmiyor: %', state_chk;
  END IF;
  RAISE NOTICE 'OK: chk_rooms_state ''completed'' ve ''archived'' degerlerini kabul ediyor';
END $$;

-- 3) room_audit_log tablosunda created_at sutunu var ve uzerinde retention
-- index var (audit_log_retention_idx)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'room_audit_log'
      AND column_name = 'created_at'
  ) THEN
    RAISE EXCEPTION 'ASSERT FAILED: room_audit_log.created_at yok';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'room_audit_log'
      AND indexname = 'audit_log_retention_idx'
  ) THEN
    RAISE EXCEPTION 'ASSERT FAILED: audit_log_retention_idx yok (1y retention scan yavas)';
  END IF;
  RAISE NOTICE 'OK: room_audit_log.created_at + audit_log_retention_idx mevcut';
END $$;

-- 4) Smoke: archive-transition query'si parse + plan ediyor (UPDATE)
-- Gercek satir varsa rollback ile geri alinir. Yoksa "0 rows updated" normal.
DO $$
DECLARE
  affected INT;
BEGIN
  UPDATE public.rooms
     SET state = 'archived', archived_at = NOW()
   WHERE state = 'completed'
     AND ended_at IS NOT NULL
     AND ended_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE 'OK: archive-transition query parse/plan basarili, % satir etkilenecekti', affected;
END $$;

-- 5) Smoke: archive-purge query'si parse + plan ediyor (DELETE w/ CASCADE)
-- Subtablolar (room_members, room_rounds, room_answers, room_reactions)
-- ON DELETE CASCADE zinciri var. Test'te ROLLBACK -> hicbir veri kaybi yok.
DO $$
DECLARE
  affected INT;
BEGIN
  DELETE FROM public.rooms
   WHERE state = 'archived'
     AND archived_at IS NOT NULL
     AND archived_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE 'OK: archive-purge query parse/plan basarili, % satir etkilenecekti', affected;
END $$;

-- 6) Smoke: audit-retention query'si parse + plan ediyor (DELETE)
DO $$
DECLARE
  affected INT;
BEGIN
  DELETE FROM public.room_audit_log
   WHERE created_at < NOW() - INTERVAL '1 year';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE 'OK: audit-retention query parse/plan basarili, % satir etkilenecekti', affected;
END $$;

-- TUM TEST'LER ROLLBACK ile geri alinir; production data dokunulmadi.
ROLLBACK;
