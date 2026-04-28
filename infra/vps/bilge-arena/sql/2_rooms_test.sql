-- =============================================================================
-- Bilge Arena Oda Sistemi: 2_rooms migration test (TDD)
-- =============================================================================
-- Hedef: 2_rooms.sql migration'inin sonucunda var olmasi gereken tum
--        artifact'leri (tablolar, view, indexler, CHECK constraint'leri,
--        RLS aktif olma, anti-cheat REVOKE) dogrula. Plain-SQL DO blocks
--        ile pgTAP yerine RAISE EXCEPTION pattern'i kullanir.
--
-- Plan referansi: docs/plans/2026-04-27-oda-sistemi-implementation.md
--                 Sprint 1 PR1 Task 1.1
--
-- Plan-deviations:
--   #22 pgTAP extension panola-postgres'te YOK. Plain SQL DO blocks +
--       RAISE EXCEPTION pattern. psql -v ON_ERROR_STOP=on ile combine
--       edildiginde non-zero exit veriyor (CI uyumlu).
--   #24 questions tablosu bilge_arena_dev'de yok; 2_rooms.sql migration
--       icinde minimal-uyumlu schema ile pre-create edilir (questions-sync
--       data populate eder).
--   #25 questions schema JSONB-merkezli (content jsonb), plan'in q.body /
--       q.choices / q.correct_index varsayimi yanlis. View JSONB-aware
--       (content->>'question' vb).
--   #26 Migration dosyasi infra/vps/bilge-arena/sql/2_rooms.sql (plan:
--       database/migrations/040_rooms.sql). Sebebi: database/migrations
--       Supabase production'a manuel apply ediliyor; oda-sistemi sadece
--       VPS bilge_arena_dev'de yasiyor.
--
-- Kullanim:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/2_rooms_test.sql
--
-- Beklenen RED state (2_rooms.sql apply edilmeden once):
--   ASSERT FAILED: questions table exists -> ilk DO block'ta abort
-- Beklenen GREEN state (2_rooms.sql apply sonrasi):
--   Tum NOTICE 'OK: ...' satirlari, exit 0
-- =============================================================================

BEGIN;

-- 1) Beklenen tablolar
DO $$
BEGIN
  IF to_regclass('public.questions') IS NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED: public.questions table missing';
  END IF;
  RAISE NOTICE 'OK: questions table exists';

  IF to_regclass('public.rooms') IS NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED: public.rooms table missing';
  END IF;
  RAISE NOTICE 'OK: rooms table exists';

  IF to_regclass('public.room_members') IS NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED: public.room_members table missing';
  END IF;
  RAISE NOTICE 'OK: room_members table exists';

  IF to_regclass('public.room_rounds') IS NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED: public.room_rounds table missing';
  END IF;
  RAISE NOTICE 'OK: room_rounds table exists';

  IF to_regclass('public.room_answers') IS NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED: public.room_answers table missing';
  END IF;
  RAISE NOTICE 'OK: room_answers table exists';

  IF to_regclass('public.room_reactions') IS NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED: public.room_reactions table missing';
  END IF;
  RAISE NOTICE 'OK: room_reactions table exists';

  IF to_regclass('public.room_audit_log') IS NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED: public.room_audit_log table missing';
  END IF;
  RAISE NOTICE 'OK: room_audit_log table exists';
END $$;

-- 2) Anti-cheat view (JSONB-aware per plan-deviation #25)
DO $$
BEGIN
  IF to_regclass('public.room_round_question_view') IS NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED: room_round_question_view missing';
  END IF;
  RAISE NOTICE 'OK: room_round_question_view exists';
END $$;

-- 3) Index'ler (partial + standart)
DO $$
DECLARE
  expected_idx TEXT;
  found        BOOLEAN;
BEGIN
  FOR expected_idx IN SELECT unnest(ARRAY[
    'rooms_host_idx',
    'rooms_archive_idx',
    'rooms_code_idx',
    'room_members_user_idx',
    'room_reactions_recent_idx',
    'audit_log_room_idx',
    'audit_log_retention_idx'
  ])
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = expected_idx
    ) INTO found;
    IF NOT found THEN
      RAISE EXCEPTION 'ASSERT FAILED: index % missing', expected_idx;
    END IF;
    RAISE NOTICE 'OK: index % exists', expected_idx;
  END LOOP;
END $$;

-- 4) CHECK constraint'leri (rooms.mode, rooms.state, vs.)
DO $$
DECLARE
  required_check_count INT;
BEGIN
  SELECT count(*) INTO required_check_count
  FROM pg_constraint
  WHERE conrelid = 'public.rooms'::regclass
    AND contype = 'c';
  IF required_check_count < 4 THEN
    RAISE EXCEPTION 'ASSERT FAILED: rooms has only % CHECK constraints, expected >=4 (code, title, difficulty, question_count, mode, state, max_players, per_question_seconds)', required_check_count;
  END IF;
  RAISE NOTICE 'OK: rooms has % CHECK constraints', required_check_count;
END $$;

-- 5) RLS aktif (6 oda tablosu - questions haric)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'rooms', 'room_members', 'room_rounds',
    'room_answers', 'room_reactions', 'room_audit_log'
  ])
  LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || tbl)::regclass) THEN
      RAISE EXCEPTION 'ASSERT FAILED: RLS not enabled on public.%', tbl;
    END IF;
    RAISE NOTICE 'OK: RLS enabled on public.%', tbl;
  END LOOP;
END $$;

-- 6) Anti-cheat permissions: authenticated/anon questions'a direkt erisemez,
-- ama view'i okuyabilir (correct_index sadece reveal'dan sonra dolu)
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.questions', 'SELECT') THEN
    RAISE EXCEPTION 'ASSERT FAILED: authenticated has direct SELECT on questions (anti-cheat broken)';
  END IF;
  RAISE NOTICE 'OK: authenticated has NO direct SELECT on questions';

  IF has_table_privilege('anon', 'public.questions', 'SELECT') THEN
    RAISE EXCEPTION 'ASSERT FAILED: anon has direct SELECT on questions';
  END IF;
  RAISE NOTICE 'OK: anon has NO direct SELECT on questions';

  IF NOT has_table_privilege('authenticated', 'public.room_round_question_view', 'SELECT') THEN
    RAISE EXCEPTION 'ASSERT FAILED: authenticated cannot SELECT room_round_question_view';
  END IF;
  RAISE NOTICE 'OK: authenticated CAN SELECT room_round_question_view';
END $$;

-- 7) FK integrity (room_members -> rooms, room_rounds -> rooms+questions, vs.)
DO $$
DECLARE
  fk_count INT;
BEGIN
  SELECT count(*) INTO fk_count
  FROM pg_constraint
  WHERE contype = 'f'
    AND conrelid IN (
      'public.room_members'::regclass,
      'public.room_rounds'::regclass,
      'public.room_answers'::regclass,
      'public.room_reactions'::regclass
    );
  IF fk_count < 5 THEN
    RAISE EXCEPTION 'ASSERT FAILED: only % FK constraints found, expected >=5', fk_count;
  END IF;
  RAISE NOTICE 'OK: % FK constraints across oda tables', fk_count;
END $$;

ROLLBACK;
