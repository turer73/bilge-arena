-- =============================================================================
-- Bilge Arena Oda Sistemi: 5_rooms_functions_lobby migration (Sprint 1 PR2a)
-- =============================================================================
-- Hedef: 5 PL/pgSQL function (lobby/setup state operations):
--          - start_room(p_room_id) -> lobby -> active + pre-create N rounds
--          - join_room(p_code) -> lobby state'inde uye ekle
--          - leave_room(p_room_id) -> uye soft-delete
--          - kick_member(p_room_id, p_target_user_id) -> host kick
--          - cancel_room(p_room_id, p_reason) -> oda iptal
--
-- Plan referansi: docs/plans/2026-04-27-oda-sistemi-implementation.md
--                 Sprint 1 PR2a (Task 2.1 + Task 2.6 lobby kismi)
-- Test referansi: 5_rooms_functions_lobby_test.sql (TDD GREEN target)
--
-- Plan-deviations:
--   #36 (PR2 scope split): PR2 = PR2a (lobby) + PR2b (active/reveal state ops).
--       Bu PR (PR2a) sadece lobby-state operations icerir. next_question,
--       submit_answer, auto_relay_tick, pause/resume/finish PR2b'de.
--   #37 (Karar 1A: question_pool storage): rooms.metadata JSONB shipped degil.
--       start_room N adet room_rounds row'unu pre-create eder (random ordered);
--       round.question_content_snapshot anti-cheat icin frozen kopyayi tutar.
--   #38 (Karar 2A: state machine): "draft"/"waiting" eklenmedi. PR1 schema
--       lobby/active/reveal/completed/archived ile yetinilir. start_room
--       lobby -> active direkt transition.
--   #39 (cancel state): chk_rooms_state CHECK 'canceled' icermez. cancel_room
--       state='completed' kullanir, audit_log 'room_canceled' action ile
--       distinguish.
--   #41 (Codex P1 PR #37 fix): Caller identity binding. Ilk versiyon
--       p_host_id / p_user_id parametrelerini caller-supplied authority
--       olarak kabul ediyordu -- SECURITY DEFINER + GRANT EXECUTE TO
--       authenticated combo'sunda IMPERSONATION ACIGI: leak'li UUID ile
--       baska kullanici adina action yapilabilir. Cozum: parametreleri
--       kaldir, fonksiyon icinde auth.uid() kullan. start_room: host check
--       auth.uid() = host_id; join_room: joining user = auth.uid();
--       leave_room: leaver = auth.uid(); kick_member: host = auth.uid()
--       (target ayri param); cancel_room: canceller = auth.uid().
--       Defensive: auth.uid() IS NULL ise direkt P0001 (no-auth context).
--
-- SECURITY DEFINER: Function'lar caller (authenticated/anon) yerine OWNER
--   (bilge_arena_app) context'inde calisir. Yetki kontrolu fonksiyon icinde
--   explicit auth.uid() ile (caller-supplied parametre yerine JWT claim).
--   Audit log INSERT'i (RLS policy yok) bu sayede policy violation almaz.
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/5_rooms_functions_lobby.sql
--
-- Test (apply sonrasi, panola_admin gerekli FORCE RLS bypass icin):
--   docker exec -i panola-postgres psql -U panola_admin -h localhost \
--     -d bilge_arena_dev -v ON_ERROR_STOP=on \
--     -f - < infra/vps/bilge-arena/sql/5_rooms_functions_lobby_test.sql
--
-- Error codes:
--   P0001 - Yetki yok (auth.uid() NULL veya host degil)
--   P0002 - Oda bulunamadi
--   P0003 - Yanlis state
--   P0004 - Yetersiz soru
--   P0005 - Yetersiz oyuncu
--   P0006 - Oda dolu
--   P0007 - Zaten uyesin
--   P0008 - Oda kodu bulunamadi
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- Cleanup: ilk versiyonun (Codex P1 oncesi) signature'larini DROP et.
-- DROP IF EXISTS idempotent -- fresh env'de no-op, mevcut env'de eski sig
-- ile cakismayi engeller.
-- =============================================================================
DROP FUNCTION IF EXISTS public.start_room(UUID, UUID);
DROP FUNCTION IF EXISTS public.join_room(CHAR(6), UUID);
DROP FUNCTION IF EXISTS public.leave_room(UUID, UUID);
DROP FUNCTION IF EXISTS public.kick_member(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS public.cancel_room(UUID, UUID, TEXT);

-- =============================================================================
-- 1) start_room: lobby -> active + pre-create N rounds (auth.uid() = host)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.start_room(
  p_room_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller     UUID;
  v_room       public.rooms%ROWTYPE;
  v_members    INT;
  v_pool_size  INT;
  v_started_at TIMESTAMPTZ := NOW();
BEGIN
  -- 0) Auth context zorunlu
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required (auth.uid() NULL)'
      USING ERRCODE = 'P0001';
  END IF;

  -- 1) Pessimistic lock + read
  SELECT * INTO v_room
    FROM public.rooms
    WHERE id = p_room_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oda bulunamadi: %', p_room_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 2) Yetki: host = auth.uid() (caller-supplied param degil)
  IF v_room.host_id <> v_caller THEN
    RAISE EXCEPTION 'Sadece host start edebilir'
      USING ERRCODE = 'P0001';
  END IF;

  -- 3) State: lobby olmali
  IF v_room.state <> 'lobby' THEN
    RAISE EXCEPTION 'Oda zaten % durumunda', v_room.state
      USING ERRCODE = 'P0003';
  END IF;

  -- 4) Min 2 aktif uye
  SELECT count(*) INTO v_members
    FROM public.room_members
    WHERE room_id = p_room_id AND is_active = TRUE;

  IF v_members < 2 THEN
    RAISE EXCEPTION 'En az 2 aktif uye gerekli (% var)', v_members
      USING ERRCODE = 'P0005';
  END IF;

  -- 5) Question pool yeterli mi (pre-validate)
  SELECT count(*) INTO v_pool_size
    FROM public.questions
    WHERE category = v_room.category
      AND difficulty = v_room.difficulty
      AND is_active = TRUE;

  IF v_pool_size < v_room.question_count THEN
    RAISE EXCEPTION 'Yeterli soru yok (% bulundu, % gerek)',
                    v_pool_size, v_room.question_count
      USING ERRCODE = 'P0004';
  END IF;

  -- 6) Pre-create N rounds: random ordered, position 1..N
  WITH ordered AS (
    SELECT id, content,
           ROW_NUMBER() OVER (ORDER BY random())::SMALLINT AS pos
    FROM public.questions
    WHERE category = v_room.category
      AND difficulty = v_room.difficulty
      AND is_active = TRUE
  )
  INSERT INTO public.room_rounds
    (room_id, round_index, question_id, question_content_snapshot,
     started_at, ends_at)
  SELECT
    p_room_id,
    pos,
    id,
    content,
    v_started_at,
    v_started_at + (v_room.per_question_seconds || ' seconds')::INTERVAL
  FROM ordered
  WHERE pos <= v_room.question_count;

  -- 7) State transition (current_round_index=0; next_question PR2b'de 1'e cekecek)
  UPDATE public.rooms
    SET state = 'active',
        started_at = v_started_at,
        current_round_index = 0,
        updated_at = NOW()
    WHERE id = p_room_id;

  -- 8) Audit
  INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
    VALUES (p_room_id, v_caller, 'room_started',
            jsonb_build_object(
              'pool_size', v_pool_size,
              'category', v_room.category,
              'difficulty', v_room.difficulty,
              'question_count', v_room.question_count
            ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_room(UUID) TO authenticated;

-- =============================================================================
-- 2) join_room: lobby state'inde uye ekle (joining user = auth.uid())
-- =============================================================================
CREATE OR REPLACE FUNCTION public.join_room(
  p_code CHAR(6)
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller     UUID;
  v_room       public.rooms%ROWTYPE;
  v_active_cnt INT;
BEGIN
  -- Auth context
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required (auth.uid() NULL)'
      USING ERRCODE = 'P0001';
  END IF;

  -- Code lookup + lock
  SELECT * INTO v_room
    FROM public.rooms
    WHERE code = p_code
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oda kodu bulunamadi: %', p_code
      USING ERRCODE = 'P0008';
  END IF;

  -- Sadece lobby state'inde join'e izin
  IF v_room.state <> 'lobby' THEN
    RAISE EXCEPTION 'Oda lobby disinda (% durumunda); join edilemiyor',
                    v_room.state
      USING ERRCODE = 'P0003';
  END IF;

  -- Max players check (sadece is_active=TRUE sayilir)
  SELECT count(*) INTO v_active_cnt
    FROM public.room_members
    WHERE room_id = v_room.id AND is_active = TRUE;

  IF v_active_cnt >= v_room.max_players THEN
    RAISE EXCEPTION 'Oda dolu (% / %)', v_active_cnt, v_room.max_players
      USING ERRCODE = 'P0006';
  END IF;

  -- INSERT (UNIQUE room_id+user_id ihlali -> P0007); auth.uid() = joining user
  BEGIN
    INSERT INTO public.room_members (room_id, user_id, role)
      VALUES (v_room.id, v_caller, 'player');
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'Bu odada zaten uyesin'
        USING ERRCODE = 'P0007';
  END;

  -- Audit
  INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
    VALUES (v_room.id, v_caller, 'member_joined',
            jsonb_build_object('code', p_code));

  RETURN v_room.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_room(CHAR(6)) TO authenticated;

-- =============================================================================
-- 3) leave_room: kullanici kendi membership'ini soft-delete eder (auth.uid())
-- =============================================================================
CREATE OR REPLACE FUNCTION public.leave_room(
  p_room_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller        UUID;
  v_member_exists BOOLEAN;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required (auth.uid() NULL)'
      USING ERRCODE = 'P0001';
  END IF;

  -- Membership var mi (auth.uid() = leaver)
  SELECT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room_id
      AND user_id = v_caller
      AND is_active = TRUE
  ) INTO v_member_exists;

  IF NOT v_member_exists THEN
    RAISE EXCEPTION 'Aktif uyelik bulunamadi (room=%, user=%)', p_room_id, v_caller
      USING ERRCODE = 'P0002';
  END IF;

  -- Soft-delete (sadece auth.uid()'in kendi satiri)
  UPDATE public.room_members
    SET is_active = FALSE,
        left_at = NOW()
    WHERE room_id = p_room_id
      AND user_id = v_caller
      AND is_active = TRUE;

  -- Audit
  INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
    VALUES (p_room_id, v_caller, 'member_left', '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_room(UUID) TO authenticated;

-- =============================================================================
-- 4) kick_member: host bir uyeyi soft-delete eder (host = auth.uid())
-- =============================================================================
CREATE OR REPLACE FUNCTION public.kick_member(
  p_room_id UUID,
  p_target_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller        UUID;
  v_room          public.rooms%ROWTYPE;
  v_target_exists BOOLEAN;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required (auth.uid() NULL)'
      USING ERRCODE = 'P0001';
  END IF;

  -- Room lookup + lock
  SELECT * INTO v_room
    FROM public.rooms
    WHERE id = p_room_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oda bulunamadi: %', p_room_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Yetki: host = auth.uid()
  IF v_room.host_id <> v_caller THEN
    RAISE EXCEPTION 'Sadece host kick edebilir'
      USING ERRCODE = 'P0001';
  END IF;

  -- State check: completed/archived'ta kick yasak
  IF v_room.state IN ('completed', 'archived') THEN
    RAISE EXCEPTION 'Oda % durumunda; kick yapilamaz', v_room.state
      USING ERRCODE = 'P0003';
  END IF;

  -- Target uye var mi
  SELECT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room_id
      AND user_id = p_target_user_id
      AND is_active = TRUE
  ) INTO v_target_exists;

  IF NOT v_target_exists THEN
    RAISE EXCEPTION 'Aktif uye bulunamadi: %', p_target_user_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Soft-delete
  UPDATE public.room_members
    SET is_active = FALSE,
        left_at = NOW()
    WHERE room_id = p_room_id
      AND user_id = p_target_user_id
      AND is_active = TRUE;

  -- Audit (actor_id = host = auth.uid(), payload icinde target)
  INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
    VALUES (p_room_id, v_caller, 'member_kicked',
            jsonb_build_object('target_user_id', p_target_user_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.kick_member(UUID, UUID) TO authenticated;

-- =============================================================================
-- 5) cancel_room: host odayi iptal eder (host = auth.uid())
-- =============================================================================
-- Plan-deviation #39: chk_rooms_state CHECK 'canceled' state'i icermez.
-- 'completed' kullanir, audit_log 'room_canceled' action + reason ile distinguish.
CREATE OR REPLACE FUNCTION public.cancel_room(
  p_room_id UUID,
  p_reason TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller UUID;
  v_room   public.rooms%ROWTYPE;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required (auth.uid() NULL)'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_room
    FROM public.rooms
    WHERE id = p_room_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oda bulunamadi: %', p_room_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_room.host_id <> v_caller THEN
    RAISE EXCEPTION 'Sadece host iptal edebilir'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_room.state IN ('completed', 'archived') THEN
    RAISE EXCEPTION 'Oda zaten % durumunda; iptal edilemez', v_room.state
      USING ERRCODE = 'P0003';
  END IF;

  UPDATE public.rooms
    SET state = 'completed',
        ended_at = NOW(),
        updated_at = NOW()
    WHERE id = p_room_id;

  INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
    VALUES (p_room_id, v_caller, 'room_canceled',
            jsonb_build_object('reason', p_reason, 'previous_state', v_room.state));
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_room(UUID, TEXT) TO authenticated;

COMMIT;
