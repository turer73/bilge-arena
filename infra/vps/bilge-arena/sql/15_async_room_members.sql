-- =============================================================================
-- Bilge Arena Oda Sistemi: 15_async_room_members migration (Async PR1, Faz A1)
-- =============================================================================
-- Hedef: Async multiplayer altyapi icin room_members tablosuna per-user
--        round progression kolonlari ekle:
--          - current_round_index SMALLINT DEFAULT 0 (her uye kendi round'unda)
--          - current_round_started_at TIMESTAMPTZ (per-round start time)
--          - finished_at TIMESTAMPTZ (NOT NULL = uye oyunu bitirdi)
--          - room_members_active_async_idx partial index (all-finished trigger
--            ve scoreboard query'leri icin)
--
-- Plan referansi: C:/Users/sevdi/.claude/plans/wondrous-questing-hedgehog.md
--                 Faz A1 (Schema migration)
--
-- Plan-deviations:
--   #90 (yeni): Kolon adi `current_round_started_at` (mevcut `rooms.started_at`
--       ile karismasin diye `started_at` adi tercih edilmedi). Plan agent review.
--   #91 (yeni): Kolon DEFAULT degerleri sync mode kullanicilarini etkilemez:
--       current_round_index=0 sync'te kullanilmaz (rooms.current_round_index
--       ground truth), current_round_started_at NULL kalir, finished_at NULL.
--       Sync mode davranisi degismez (geriye tam uyumlu).
--   #92 (yeni): Partial index `WHERE finished_at IS NULL AND is_active = TRUE`
--       sync row'lari da kapsar (sync uyelerin finished_at her zaman NULL).
--       Bu kabul edilebilir cunku query'ler her zaman room_id filter ile
--       sinirli ve sync odalarda count() small. async odalarda all-finished
--       trigger O(member_count) tarafindan kullanilir (saniyede ~ 1-4 row).
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/15_async_room_members.sql
--
-- Test (apply sonrasi):
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/15_async_room_members_test.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- 1) room_members.current_round_index — async per-user round pointer
-- =============================================================================
-- Sync modda kullanilmaz (rooms.current_round_index ground truth).
-- Async modda her uye kendi round'unu ilerletir, bu kolon ground truth.
ALTER TABLE public.room_members
  ADD COLUMN IF NOT EXISTS current_round_index SMALLINT NOT NULL DEFAULT 0;

-- =============================================================================
-- 2) room_members.current_round_started_at — async per-round start time
-- =============================================================================
-- response_ms hesaplanmasi icin (NOW() - current_round_started_at).
-- start_room async branch'inde NOW() set edilir, advance_round_for_member'da
-- her round gecisinde NOW() update edilir. Final round'da finished_at set
-- edildiginde dokunulmaz (son round'un baslama zamani historik).
ALTER TABLE public.room_members
  ADD COLUMN IF NOT EXISTS current_round_started_at TIMESTAMPTZ;

-- =============================================================================
-- 3) room_members.finished_at — async oyun bitis zamani
-- =============================================================================
-- NOT NULL = uye tum sorulari bitirdi, scoreboard'da gosterilir, baska
-- soru gelmez. All-finished trigger (16_async_functions.sql) bu kolonun
-- UPDATE'inde fire edip rooms.state='completed'i atomic set eder.
ALTER TABLE public.room_members
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

-- =============================================================================
-- 4) Partial index — all-finished trigger ve scoreboard query'leri icin
-- =============================================================================
-- "Bu odada henuz bitirmemis uye var mi?" (active count > 0) sorusuna O(log n)
-- cevap. Sync row'lar da indekste yer alir ama query'de room_id filter
-- ile sinirli, sync odalarda member_count <= 20 (max_players check).
CREATE INDEX IF NOT EXISTS room_members_active_async_idx
  ON public.room_members (room_id, finished_at)
  WHERE finished_at IS NULL AND is_active = TRUE;

COMMIT;
