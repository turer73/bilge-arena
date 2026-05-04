-- =============================================================================
-- Bilge Arena Oda Sistemi: 15_async_room_members migration test (TDD)
-- =============================================================================
-- Hedef: 15_async_room_members.sql migration sonucunda var olmasi gereken
--        artifact'leri (3 yeni kolon, 1 partial index) dogrula.
--
-- Plan referansi: C:/Users/sevdi/.claude/plans/wondrous-questing-hedgehog.md
--                 Faz A1
--
-- Kullanim:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/15_async_room_members_test.sql
--
-- Beklenen RED state (15_async_room_members.sql apply edilmeden once):
--   ASSERT FAILED: current_round_index column missing -> ilk DO block'ta abort
-- Beklenen GREEN state (apply sonrasi):
--   Tum NOTICE 'OK: ...' satirlari, exit 0
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) 3 yeni kolon var mi
-- =============================================================================
DO $$
DECLARE
  v_col_record RECORD;
BEGIN
  -- current_round_index
  SELECT * INTO v_col_record
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'room_members'
    AND column_name = 'current_round_index';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSERT FAILED: room_members.current_round_index missing';
  END IF;
  IF v_col_record.data_type <> 'smallint' THEN
    RAISE EXCEPTION 'ASSERT FAILED: current_round_index type % (expected smallint)',
      v_col_record.data_type;
  END IF;
  IF v_col_record.is_nullable <> 'NO' THEN
    RAISE EXCEPTION 'ASSERT FAILED: current_round_index nullable (expected NOT NULL)';
  END IF;
  IF v_col_record.column_default NOT LIKE '0%' THEN
    RAISE EXCEPTION 'ASSERT FAILED: current_round_index default % (expected 0)',
      v_col_record.column_default;
  END IF;
  RAISE NOTICE 'OK: room_members.current_round_index column (smallint NOT NULL DEFAULT 0)';

  -- current_round_started_at
  SELECT * INTO v_col_record
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'room_members'
    AND column_name = 'current_round_started_at';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSERT FAILED: room_members.current_round_started_at missing';
  END IF;
  IF v_col_record.data_type NOT LIKE 'timestamp%' THEN
    RAISE EXCEPTION 'ASSERT FAILED: current_round_started_at type % (expected timestamptz)',
      v_col_record.data_type;
  END IF;
  IF v_col_record.is_nullable <> 'YES' THEN
    RAISE EXCEPTION 'ASSERT FAILED: current_round_started_at NOT NULL (expected nullable)';
  END IF;
  RAISE NOTICE 'OK: room_members.current_round_started_at column (timestamptz NULL)';

  -- finished_at
  SELECT * INTO v_col_record
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'room_members'
    AND column_name = 'finished_at';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSERT FAILED: room_members.finished_at missing';
  END IF;
  IF v_col_record.data_type NOT LIKE 'timestamp%' THEN
    RAISE EXCEPTION 'ASSERT FAILED: finished_at type % (expected timestamptz)',
      v_col_record.data_type;
  END IF;
  IF v_col_record.is_nullable <> 'YES' THEN
    RAISE EXCEPTION 'ASSERT FAILED: finished_at NOT NULL (expected nullable)';
  END IF;
  RAISE NOTICE 'OK: room_members.finished_at column (timestamptz NULL)';
END $$;

-- =============================================================================
-- 2) Partial index var mi
-- =============================================================================
DO $$
DECLARE
  v_index_def TEXT;
BEGIN
  SELECT indexdef INTO v_index_def
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'room_members'
    AND indexname = 'room_members_active_async_idx';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSERT FAILED: room_members_active_async_idx missing';
  END IF;
  IF v_index_def NOT LIKE '%finished_at IS NULL%' THEN
    RAISE EXCEPTION 'ASSERT FAILED: index lacks finished_at IS NULL filter (def: %)',
      v_index_def;
  END IF;
  IF v_index_def NOT LIKE '%is_active = true%' THEN
    RAISE EXCEPTION 'ASSERT FAILED: index lacks is_active = true filter (def: %)',
      v_index_def;
  END IF;
  RAISE NOTICE 'OK: room_members_active_async_idx exists with partial WHERE filter';
END $$;

-- =============================================================================
-- 3) Geriye uyumluluk: mevcut sync row'lar default degerlerle dolar
-- =============================================================================
DO $$
DECLARE
  v_count INT;
BEGIN
  -- Mevcut tum room_members row'lari current_round_index=0, finished_at=NULL
  -- olmali (DEFAULT zaten ALTER TABLE'da apply edildi).
  SELECT count(*) INTO v_count
  FROM public.room_members
  WHERE current_round_index IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'ASSERT FAILED: % room_members row(s) have NULL current_round_index', v_count;
  END IF;
  RAISE NOTICE 'OK: backfill verified - 0 row with NULL current_round_index';
END $$;

ROLLBACK;
