-- =============================================================================
-- Bilge Arena Oda Sistemi: 17_async_rls migration (Async PR1, Faz A3)
-- =============================================================================
-- Hedef: room_answers RLS policy'sine async branch ekle.
--          - Mevcut room_answers_insert_self_active policy: points_awarded=0 AND
--            is_correct IS NULL zorunlu (sync paterni — host reveal_round'a kadar
--            anonim cevap).
--          - Sorun: submit_answer_async ANINDA is_correct + points compute eder.
--            SECURITY DEFINER + bilge_arena_app BYPASSRLS ile gecer ama policy
--            semantic karmasik. Defense-in-depth: policy'ye async branch.
--          - Cozum: Policy DROP + yeniden CREATE async branch ile.
--
-- Plan referansi: C:/Users/sevdi/.claude/plans/wondrous-questing-hedgehog.md
--                 Faz A3
--
-- Plan-deviations:
--   #100 (yeni): room_members_update_self policy zaten mevcut (3_rooms_rls satir
--       154), async kolonlarin (current_round_index, current_round_started_at,
--       finished_at) UPDATE'ine izin veriyor (user_id = auth.uid()). Yeni policy
--       gerek yok.
--   #101 (yeni): room_answers policy mode-aware split. Sync row'lar policy'i
--       eski paterni icin korur (host reveal'dan once is_correct=NULL koyar);
--       async row'lar policy'i ANINDA hesaplanmis is_correct/points'i kabul eder.
--   #102 (yeni): EXISTS subquery `rooms WHERE id=room_id` per-row index lookup
--       (PRIMARY KEY UNIQUE). Performans ihmal edilebilir.
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/17_async_rls.sql
--
-- Test (apply sonrasi):
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/17_async_rls_test.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- 1) room_answers_insert_self_active — mode-aware policy
-- =============================================================================
-- Sync mode: points_awarded=0 AND is_correct IS NULL zorunlu (eski paterni)
-- Async mode: points/is_correct submit_answer_async tarafindan inline compute,
--             policy bu degerleri kabul eder.
DROP POLICY IF EXISTS room_answers_insert_self_active ON public.room_answers;

CREATE POLICY room_answers_insert_self_active ON public.room_answers
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_room_member(room_id)
    AND EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = room_id
        AND (
          (r.mode = 'sync' AND points_awarded = 0 AND is_correct IS NULL)
          OR (r.mode = 'async')  -- async RPC inline compute eder
        )
    )
  );

COMMIT;
