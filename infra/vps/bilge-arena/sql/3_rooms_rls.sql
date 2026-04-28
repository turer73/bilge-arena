-- =============================================================================
-- Bilge Arena Oda Sistemi: 3_rooms_rls migration (Sprint 1 PR1 Task 1.2)
-- =============================================================================
-- Hedef: 6 oda tablosunda FORCE RLS + 13 policy. Anti-cheat predicate'ler
--        room_answers SELECT'i revealed_at gate ile koruma altina alir.
--
-- Plan referansi: docs/plans/2026-04-27-oda-sistemi-implementation.md
--                 Sprint 1 PR1 Task 1.2
-- Test referansi: 3_rooms_rls_test.sql (TDD GREEN target)
--
-- Plan-deviations:
--   #29 SECURITY DEFINER helper functions (Panola Migration 016b pattern):
--       room_members policy'si self-table check yaparsa RLS recursion riski.
--       Cozum: is_room_member(uuid) ve is_room_host(uuid) helper'lari OWNER
--       (bilge_arena_app) context'inde calisir. NOT: SECURITY DEFINER
--       BYPASSRLS attribute'u VERMEZ; OWNER auto-bypass'a guveniyor.
--       SET search_path fixed (public, pg_catalog) - injection sertlik.
--   #30 FORCE RLS on 5 tables (rooms, room_rounds, room_answers, room_reactions,
--       room_audit_log): ALTER TABLE owner bypass'ini engeller.
--       service_role BYPASSRLS attribute (cluster-wide) hala calisir;
--       admin/cron icin service_role kullanilacak.
--   #33 (Codex P1 PR #35 fix) room_members FORCE RLS LISTESINDE DEGIL:
--       is_room_member helper room_members'i okur. FORCE RLS aciksa OWNER
--       auto-bypass devre disi -> SECURITY DEFINER icindeki SELECT yine
--       policy'yi tetikler -> infinite recursion. Trade-off: room_members
--       owner bypass aktif (app traffic PostgREST/authenticated role uzerinden,
--       bilge_arena_app direkt baglanti yok = production attack surface degil).
--       Test 1b regression guard: room_members FORCE'lanirsa fail.
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/3_rooms_rls.sql
--
-- Test (apply sonrasi):
--   ... -f - < infra/vps/bilge-arena/sql/3_rooms_rls_test.sql
--   Beklenen: tum NOTICE 'OK: ...', exit 0
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- 1) SECURITY DEFINER helper functions (RLS recursion fix)
-- =============================================================================
-- Plan-deviation #29: Panola Migration 016b pattern. Owner (bilge_arena_app)
-- BYPASSRLS implicit; policy bu fonksiyonu cagirinca recursion ucurmuyor.

CREATE OR REPLACE FUNCTION public.is_room_member(p_room_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room_id
      AND user_id = auth.uid()
      AND is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_room_host(p_room_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rooms
    WHERE id = p_room_id
      AND host_id = auth.uid()
  );
$$;

-- Helper'lar authenticated/anon'a EXECUTE ile sunulur (default GRANT yetersiz
-- cunku SECURITY DEFINER + diger schema). 0_init_db default privileges
-- functions kapsamiyor.
GRANT EXECUTE ON FUNCTION public.is_room_member(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_room_host(UUID) TO authenticated, anon;

-- =============================================================================
-- 2) FORCE RLS (plan-deviation #30 — owner bypass koruma)
-- =============================================================================
-- Plan-deviation #33 (Codex P1 PR #35 fix): room_members'i FORCE RLS LISTESINE
-- DAHIL ETMIYORUZ. Aksi takdirde:
--   1. room_members SELECT policy is_room_member(room_id) cagiriyor
--   2. is_room_member SECURITY DEFINER -> OWNER (bilge_arena_app) context
--   3. PostgreSQL: SECURITY DEFINER BYPASSRLS attribute'u VERMEZ; sadece OWNER
--      privileges'larini saglar. OWNER auto-bypass FORCE RLS aciksa devre disi.
--   4. helper icindeki SELECT room_members yine RLS policy'yi tetikler
--   5. policy is_room_member'i tekrar cagirir -> sonsuz dongu
-- Trade-off: room_members'da owner bypass aktif. App traffic PostgREST uzerinden
-- authenticated/anon JWT role'leri ile geliyor, bilge_arena_app dogrudan
-- baglanmiyor. Bu nedenle owner bypass production attack surface degil.
-- Test 1b (3_rooms_rls_test.sql) regression guard: room_members FORCE'lanirsa
-- assertion fail eder.
ALTER TABLE public.rooms             FORCE ROW LEVEL SECURITY;
ALTER TABLE public.room_rounds       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.room_answers      FORCE ROW LEVEL SECURITY;
ALTER TABLE public.room_reactions    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.room_audit_log    FORCE ROW LEVEL SECURITY;
-- room_members: ENABLE RLS (2_rooms.sql), FORCE RLS DEGIL (yukaridaki gerekce)

-- =============================================================================
-- 3) rooms policies (4 toplam)
-- =============================================================================
-- SELECT: host VEYA member goruyor
CREATE POLICY rooms_select_host_or_member ON public.rooms
  FOR SELECT TO authenticated
  USING (
    auth.uid() = host_id
    OR public.is_room_member(id)
  );

-- INSERT: kullanici sadece kendi adina host olabilir (host_id = auth.uid())
CREATE POLICY rooms_insert_self_host ON public.rooms
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = host_id);

-- UPDATE: sadece host (host transferi yasak — WITH CHECK ayni kullanici)
CREATE POLICY rooms_update_host ON public.rooms
  FOR UPDATE TO authenticated
  USING (auth.uid() = host_id)
  WITH CHECK (auth.uid() = host_id);

-- DELETE: sadece host
CREATE POLICY rooms_delete_host ON public.rooms
  FOR DELETE TO authenticated
  USING (auth.uid() = host_id);

-- =============================================================================
-- 4) room_members policies (4 toplam)
-- =============================================================================
-- SELECT: ayni odanin uyeleri birbirini goruyor
CREATE POLICY room_members_select_same_room ON public.room_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_room_member(room_id)
  );

-- INSERT: kullanici sadece kendi adina join olabilir
-- NOT: Host-invite Sprint 2'de eklenecek (su an self-join only).
CREATE POLICY room_members_insert_self ON public.room_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE: sadece kendi satirini guncelleyebilir (left, score gibi degisiklik
-- normal API katmanindan service_role ile yapiliyor; user-level update
-- icin sadece is_active=false / left_at)
CREATE POLICY room_members_update_self ON public.room_members
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: kendi satirini silebilir VEYA host kick yapabilir
CREATE POLICY room_members_delete_self_or_host ON public.room_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_room_host(room_id)
  );

-- =============================================================================
-- 5) room_rounds policies (1 SELECT only — write tamamen service_role)
-- =============================================================================
CREATE POLICY room_rounds_select_members ON public.room_rounds
  FOR SELECT TO authenticated
  USING (public.is_room_member(room_id));

-- INSERT/UPDATE/DELETE: authenticated icin policy YOK -> default deny.
-- service_role BYPASSRLS ile gecer (API katmaninda round basla/bitir).

-- =============================================================================
-- 6) room_answers policies (2 toplam — anti-cheat critical)
-- =============================================================================
-- SELECT: kendi cevabini her zaman, baskalarinkini SADECE reveal sonrasi.
-- ANTI-CHEAT: revealed_at IS NOT NULL gate orta-oyun snooping'i engeller.
CREATE POLICY room_answers_select_self_or_revealed ON public.room_answers
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      EXISTS (
        SELECT 1 FROM public.room_rounds rr
        WHERE rr.id = room_answers.round_id
          AND rr.revealed_at IS NOT NULL
      )
      AND public.is_room_member(room_id)
    )
  );

-- INSERT: kendi adina, aktif uye, points_awarded HER ZAMAN 0 (server compute)
CREATE POLICY room_answers_insert_self_active ON public.room_answers
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_room_member(room_id)
    AND points_awarded = 0
    AND is_correct IS NULL
  );

-- UPDATE/DELETE: yok (cevap immutable; service_role reveal sirasinda
-- is_correct + points_awarded'i set eder).

-- =============================================================================
-- 7) room_reactions policies (2 toplam)
-- =============================================================================
CREATE POLICY room_reactions_select_members ON public.room_reactions
  FOR SELECT TO authenticated
  USING (public.is_room_member(room_id));

CREATE POLICY room_reactions_insert_self_member ON public.room_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_room_member(room_id)
  );

-- =============================================================================
-- 8) room_audit_log policies (0 user-facing)
-- =============================================================================
-- authenticated/anon icin policy YOK -> default deny.
-- service_role BYPASSRLS ile gerceklestirir KVKK trail.
-- (Test 6: authenticated SELECT policy YOKLUGU dogrulaniyor.)

COMMIT;
