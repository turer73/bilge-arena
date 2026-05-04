-- =============================================================================
-- Bilge Arena Oda Sistemi: 16_async_functions migration (Async PR1, Faz A2)
-- =============================================================================
-- Hedef: Async multiplayer RPC altyapisi:
--          - _pre_create_rounds(p_room_id, p_started_at) helper (DRY: sync+async ortak)
--          - start_room mode-aware fork (sync mevcut akis; async = members.current_round_index=1
--            + members.current_round_started_at=NOW() + state=active, host bootstrap yok)
--          - submit_answer_async(p_room_id, p_answer_value) -> JSONB
--             (member-level submit + ANINDA is_correct + points compute, RPC return
--              correct_answer + explanation, idempotent retry)
--          - advance_round_for_member(p_room_id) -> JSONB
--             (member.current_round_index++ veya finished_at=NOW() final round)
--          - Sync RPC mode-guard (submit_answer/reveal_round/advance_round async
--            cagriligi reddet, defense-in-depth)
--          - _check_all_members_finished_async() trigger fn + AFTER UPDATE OF finished_at
--            (race-safe rooms.state='completed' transition)
--
-- Plan referansi: C:/Users/sevdi/.claude/plans/wondrous-questing-hedgehog.md
--                 Faz A2
--
-- Plan-deviations:
--   #93 (yeni): _pre_create_rounds helper extract — sync ve async start_room ortak
--       N round pre-create logic'i. Sync mevcut akistan farkli degil, sadece DRY.
--   #94 (yeni): start_room async branch'inde rooms.current_round_index=1 set edilir
--       (sembolik, async'te ground truth member.current_round_index). auto_relay_tick
--       Phase 1 query async odalari mode='sync' filter ile dislar (17 migration).
--   #95 (yeni): submit_answer_async ANINDA is_correct + points compute — sync paterni
--       (reveal_round) yerine RPC return ile atomic submit-and-reveal. RLS policy
--       ihlali (room_answers_insert_self_active points=0/is_correct=NULL zorunlu)
--       17_async_rls.sql ile cozulur (mode='async' branch policy).
--   #96 (yeni): submit_answer_async UNIQUE catch'inde mevcut row SELECT + ayni
--       jsonb donduır (idempotent retry). Network blip retry guvenligi.
--   #97 (yeni): advance_round_for_member "once cevap ver" guard P0009. Frontend
--       SonucView'dan auto-advance tetiklendigi icin pratikte fire etmez ama
--       RPC kotuye-kullanim direnci icin sart.
--   #98 (yeni): All-finished trigger AFTER UPDATE OF finished_at — race-safe
--       (FOR UPDATE rooms lock + idempotent state check). Trigger her UPDATE'te
--       degil sadece OLD.finished_at IS NULL AND NEW.finished_at IS NOT NULL
--       transition'inda fire eder (efficient).
--   #99 (yeni): Sync RPC mode-guard — defense-in-depth. Frontend bug ile sync
--       RPC tetiklerse silent corruption (member.score double-count) yerine
--       P0003 fail-fast. Mevcut sync caller'lar etkilenmez (mode='sync' check OK).
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/16_async_functions.sql
--
-- Test (apply sonrasi):
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/16_async_functions_test.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- 1) _pre_create_rounds helper (DRY: sync+async start_room ortak)
-- =============================================================================
-- N round pre-create — random ordered, position 1..question_count.
-- Sync ve async start_room icin ortak. Mevcut start_room body'sinden extract
-- edildi (5_lobby satir 150-169 ile birebir, davranis degismez).
CREATE OR REPLACE FUNCTION public._pre_create_rounds(
  p_room_id UUID,
  p_started_at TIMESTAMPTZ
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
BEGIN
  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oda bulunamadi: %', p_room_id USING ERRCODE = 'P0002';
  END IF;

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
    p_started_at,
    p_started_at + (v_room.per_question_seconds || ' seconds')::INTERVAL
  FROM ordered
  WHERE pos <= v_room.question_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._pre_create_rounds(UUID, TIMESTAMPTZ) FROM PUBLIC;
-- Helper sadece start_room ve start_room_async icinden cagrilir.

-- =============================================================================
-- 2) start_room — mode-aware fork (sync mevcut + async yeni)
-- =============================================================================
-- Sync: mevcut 5_lobby paterni (current_round_index=0, host advance bootstrap)
-- Async: members.current_round_index=1 + members.current_round_started_at=NOW(),
--        bootstrap host advance yok, herkes anlik baslar.
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
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required (auth.uid() NULL)'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oda bulunamadi: %', p_room_id USING ERRCODE = 'P0002';
  END IF;

  IF v_room.host_id <> v_caller THEN
    RAISE EXCEPTION 'Sadece host start edebilir' USING ERRCODE = 'P0001';
  END IF;

  IF v_room.state <> 'lobby' THEN
    RAISE EXCEPTION 'Oda zaten % durumunda', v_room.state USING ERRCODE = 'P0003';
  END IF;

  SELECT count(*) INTO v_members
    FROM public.room_members
    WHERE room_id = p_room_id AND is_active = TRUE;
  IF v_members < 2 THEN
    RAISE EXCEPTION 'En az 2 aktif uye gerekli (% var)', v_members
      USING ERRCODE = 'P0005';
  END IF;

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

  -- Pre-create N rounds (sync+async ortak)
  PERFORM public._pre_create_rounds(p_room_id, v_started_at);

  IF v_room.mode = 'async' THEN
    -- Async branch: members.current_round_index=1, started_at=NOW(),
    -- rooms.state='active', current_round_index=1 (sembolik). Bootstrap
    -- host advance yok, herkes anlik baslar.
    UPDATE public.room_members
      SET current_round_index = 1,
          current_round_started_at = v_started_at
      WHERE room_id = p_room_id AND is_active = TRUE;

    UPDATE public.rooms
      SET state = 'active',
          started_at = v_started_at,
          current_round_index = 1,
          updated_at = NOW()
      WHERE id = p_room_id;

    INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
      VALUES (p_room_id, v_caller, 'room_started_async',
              jsonb_build_object(
                'pool_size', v_pool_size,
                'category', v_room.category,
                'difficulty', v_room.difficulty,
                'question_count', v_room.question_count,
                'active_members', v_members
              ));
  ELSE
    -- Sync branch: mevcut akis (current_round_index=0, host bootstrap advance)
    UPDATE public.rooms
      SET state = 'active',
          started_at = v_started_at,
          current_round_index = 0,
          updated_at = NOW()
      WHERE id = p_room_id;

    INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
      VALUES (p_room_id, v_caller, 'room_started',
              jsonb_build_object(
                'pool_size', v_pool_size,
                'category', v_room.category,
                'difficulty', v_room.difficulty,
                'question_count', v_room.question_count
              ));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_room(UUID) TO authenticated;

-- =============================================================================
-- 3) submit_answer_async — async per-user submit + ANINDA reveal
-- =============================================================================
-- Sync paterninden farki: is_correct + points hemen compute, RPC return
-- correct_answer + explanation. UNIQUE catch'inde mevcut row SELECT (idempotent
-- retry). Member.score += points anlik.
--
-- RLS policy ihlali (room_answers_insert_self_active points=0/is_correct=NULL):
-- 17_async_rls.sql ile mode='async' branch ekleniyor.
CREATE OR REPLACE FUNCTION public.submit_answer_async(
  p_room_id UUID,
  p_answer_value TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller       UUID;
  v_room         public.rooms%ROWTYPE;
  v_member       public.room_members%ROWTYPE;
  v_round        public.room_rounds%ROWTYPE;
  v_existing     public.room_answers%ROWTYPE;
  v_correct      TEXT;
  v_explanation  TEXT;
  v_response_ms  INT;
  v_is_correct   BOOLEAN;
  v_points       INT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required (auth.uid() NULL)'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oda bulunamadi: %', p_room_id USING ERRCODE = 'P0002';
  END IF;

  IF v_room.mode <> 'async' THEN
    RAISE EXCEPTION 'submit_answer_async sadece async odada cagrilir (mode=%)', v_room.mode
      USING ERRCODE = 'P0003';
  END IF;

  IF v_room.state <> 'active' THEN
    RAISE EXCEPTION 'Oda active state''te degil (% var)', v_room.state
      USING ERRCODE = 'P0003';
  END IF;

  -- Member lookup + lock (kendi satiri)
  SELECT * INTO v_member FROM public.room_members
    WHERE room_id = p_room_id
      AND user_id = v_caller
      AND is_active = TRUE
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aktif uye degilsin' USING ERRCODE = 'P0001';
  END IF;

  IF v_member.finished_at IS NOT NULL THEN
    RAISE EXCEPTION 'Oyun bitti, bekleme ekranindasin' USING ERRCODE = 'P0003';
  END IF;

  IF v_member.current_round_index < 1 THEN
    RAISE EXCEPTION 'Henuz baslamadi (current_round_index=%)', v_member.current_round_index
      USING ERRCODE = 'P0009';
  END IF;

  IF v_member.current_round_started_at IS NULL THEN
    RAISE EXCEPTION 'Round baslangic zamani yok (data integrity)'
      USING ERRCODE = 'P0002';
  END IF;

  -- Round lookup
  SELECT * INTO v_round FROM public.room_rounds
    WHERE room_id = p_room_id AND round_index = v_member.current_round_index;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round bulunamadi (round_index=%)', v_member.current_round_index
      USING ERRCODE = 'P0002';
  END IF;

  v_correct := v_round.question_content_snapshot->>'answer';
  v_explanation := v_round.question_content_snapshot->>'explanation';
  v_response_ms := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - v_member.current_round_started_at)) * 1000)::INT;
  v_is_correct := (p_answer_value = v_correct);
  v_points := CASE
    WHEN v_is_correct THEN
      GREATEST(0,
        FLOOR(1000.0 * (1.0 - v_response_ms::FLOAT
                        / (v_room.per_question_seconds * 1000.0)))
      )::INT
    ELSE 0
  END;

  -- INSERT + idempotent retry
  BEGIN
    INSERT INTO public.room_answers
      (room_id, round_id, user_id, answer_value, response_ms, is_correct, points_awarded)
    VALUES
      (p_room_id, v_round.id, v_caller, p_answer_value, v_response_ms, v_is_correct, v_points);

    -- Score update sadece yeni cevapta (retry'da degil)
    UPDATE public.room_members
      SET score = score + v_points
      WHERE room_id = p_room_id AND user_id = v_caller;

    RETURN jsonb_build_object(
      'is_correct', v_is_correct,
      'points_awarded', v_points,
      'correct_answer', v_correct,
      'explanation', v_explanation,
      'response_ms', v_response_ms,
      'idempotent_retry', false
    );
  EXCEPTION WHEN unique_violation THEN
    -- Network blip retry: mevcut row'u donduır, score yeniden eklemez
    SELECT * INTO v_existing FROM public.room_answers
      WHERE round_id = v_round.id AND user_id = v_caller;
    RETURN jsonb_build_object(
      'is_correct', v_existing.is_correct,
      'points_awarded', v_existing.points_awarded,
      'correct_answer', v_correct,
      'explanation', v_explanation,
      'response_ms', v_existing.response_ms,
      'idempotent_retry', true
    );
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_answer_async(UUID, TEXT) TO authenticated;

-- =============================================================================
-- 4) advance_round_for_member — async per-user round geçişi veya finished_at
-- =============================================================================
-- caller member.current_round_index'i N -> N+1 (intermediate) veya finished_at=NOW()
-- (final round, current_round_index=question_count+1 sembolik). All-finished
-- trigger (asagida) finish'le atomic rooms.state='completed' check yapar.
CREATE OR REPLACE FUNCTION public.advance_round_for_member(
  p_room_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller   UUID;
  v_room     public.rooms%ROWTYPE;
  v_member   public.room_members%ROWTYPE;
  v_round_id UUID;
  v_next     SMALLINT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required (auth.uid() NULL)'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oda bulunamadi: %', p_room_id USING ERRCODE = 'P0002';
  END IF;

  IF v_room.mode <> 'async' THEN
    RAISE EXCEPTION 'advance_round_for_member sadece async odada cagrilir (mode=%)', v_room.mode
      USING ERRCODE = 'P0003';
  END IF;

  -- Active state kontrol (completed/archived'da advance yasak)
  IF v_room.state <> 'active' THEN
    RAISE EXCEPTION 'Oda active state''te degil (% var)', v_room.state
      USING ERRCODE = 'P0003';
  END IF;

  -- Member lookup + lock
  SELECT * INTO v_member FROM public.room_members
    WHERE room_id = p_room_id
      AND user_id = v_caller
      AND is_active = TRUE
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aktif uye degilsin' USING ERRCODE = 'P0001';
  END IF;

  IF v_member.finished_at IS NOT NULL THEN
    RAISE EXCEPTION 'Oyun zaten bitti' USING ERRCODE = 'P0003';
  END IF;

  IF v_member.current_round_index < 1 THEN
    RAISE EXCEPTION 'Henuz baslamadi' USING ERRCODE = 'P0009';
  END IF;

  -- "Once cevap ver" guard
  SELECT id INTO v_round_id FROM public.room_rounds
    WHERE room_id = p_room_id AND round_index = v_member.current_round_index;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round bulunamadi' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.room_answers
    WHERE round_id = v_round_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'Once mevcut soruyu cevapla' USING ERRCODE = 'P0009';
  END IF;

  v_next := v_member.current_round_index + 1;

  IF v_next > v_room.question_count THEN
    -- Final: oyuncu butun sorulari bitirdi
    UPDATE public.room_members
      SET finished_at = NOW(),
          current_round_index = v_next  -- sembolik, question_count+1
      WHERE room_id = p_room_id AND user_id = v_caller;

    INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
      VALUES (p_room_id, v_caller, 'member_finished_async',
              jsonb_build_object('final_round', v_member.current_round_index));

    -- All-finished trigger AFTER UPDATE OF finished_at fire eder, rooms.state
    -- transition'i orada yapilir (race-safe).

    RETURN jsonb_build_object(
      'status', 'finished',
      'round_index', v_next,
      'finished_at', NOW()
    );
  ELSE
    -- Intermediate: sonraki round
    UPDATE public.room_members
      SET current_round_index = v_next,
          current_round_started_at = NOW()
      WHERE room_id = p_room_id AND user_id = v_caller;

    RETURN jsonb_build_object(
      'status', 'advanced',
      'round_index', v_next,
      'started_at', NOW()
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.advance_round_for_member(UUID) TO authenticated;

-- =============================================================================
-- 5) Sync RPC mode-guard — defense-in-depth
-- =============================================================================
-- submit_answer / reveal_round / advance_round async odada cagrilirsa P0003
-- fail-fast. Frontend bug ile sync RPC tetiklerse silent corruption (member.score
-- double-count) yerine net hata.
--
-- CREATE OR REPLACE — mevcut 6_rooms_functions_game.sql signature'lari korunur,
-- sadece ilk if block (mode check) eklenir. Tum diger logic mevcut paternden
-- birebir kopyalanir.

-- 5.1 submit_answer (sync) — mode='async' guard ekle
CREATE OR REPLACE FUNCTION public.submit_answer(
  p_room_id UUID,
  p_answer_value TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller     UUID;
  v_room       public.rooms%ROWTYPE;
  v_round      public.room_rounds%ROWTYPE;
  v_response_ms INT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required (auth.uid() NULL)'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oda bulunamadi: %', p_room_id USING ERRCODE = 'P0002';
  END IF;

  -- ASYNC GUARD: defense-in-depth, sync RPC async odada cagrilirsa fail-fast
  IF v_room.mode = 'async' THEN
    RAISE EXCEPTION 'submit_answer async odada cagrilmaz, submit_answer_async kullan'
      USING ERRCODE = 'P0003';
  END IF;

  IF v_room.state <> 'active' THEN
    RAISE EXCEPTION 'Submit sadece active state''te (% var)', v_room.state
      USING ERRCODE = 'P0003';
  END IF;

  IF v_room.current_round_index < 1 THEN
    RAISE EXCEPTION 'Henuz round baslamadi (current_round_index=0; advance_round cagrilmali)'
      USING ERRCODE = 'P0009';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room_id AND user_id = v_caller AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Aktif uye degilsin' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_round
    FROM public.room_rounds
    WHERE room_id = p_room_id AND round_index = v_room.current_round_index
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aktif round bulunamadi (data integrity ihlali)'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_round.revealed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Round zaten reveal edildi, late submit reddedildi (revealed_at: %)', v_round.revealed_at
      USING ERRCODE = 'P0012';
  END IF;

  IF NOW() > v_round.ends_at THEN
    RAISE EXCEPTION 'Sure doldu (deadline: %)', v_round.ends_at
      USING ERRCODE = 'P0010';
  END IF;

  v_response_ms := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - v_round.started_at)) * 1000)::INT;

  BEGIN
    INSERT INTO public.room_answers
      (room_id, round_id, user_id, answer_value, response_ms, points_awarded, is_correct)
    VALUES
      (p_room_id, v_round.id, v_caller, p_answer_value, v_response_ms, 0, NULL);
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'Bu round''a zaten cevap verdin'
        USING ERRCODE = 'P0011';
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_answer(UUID, TEXT) TO authenticated;

-- 5.2 reveal_round (sync) — mode='async' guard ekle
CREATE OR REPLACE FUNCTION public.reveal_round(
  p_room_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller UUID;
  v_room   public.rooms%ROWTYPE;
  v_round  public.room_rounds%ROWTYPE;
  v_correct_answer TEXT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oda bulunamadi: %', p_room_id USING ERRCODE = 'P0002';
  END IF;

  -- ASYNC GUARD
  IF v_room.mode = 'async' THEN
    RAISE EXCEPTION 'reveal_round async odada cagrilmaz (per-user reveal submit_answer_async return''unde)'
      USING ERRCODE = 'P0003';
  END IF;

  IF v_room.host_id <> v_caller THEN
    RAISE EXCEPTION 'Sadece host reveal edebilir' USING ERRCODE = 'P0001';
  END IF;

  IF v_room.state NOT IN ('active', 'reveal') THEN
    RAISE EXCEPTION 'Reveal yanlis state''te: %', v_room.state USING ERRCODE = 'P0003';
  END IF;

  IF v_room.current_round_index < 1 THEN
    RAISE EXCEPTION 'Henuz round baslamadi' USING ERRCODE = 'P0009';
  END IF;

  SELECT * INTO v_round
    FROM public.room_rounds
    WHERE room_id = p_room_id AND round_index = v_room.current_round_index
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aktif round bulunamadi' USING ERRCODE = 'P0002';
  END IF;

  IF v_round.revealed_at IS NOT NULL THEN
    IF v_room.state = 'active' THEN
      UPDATE public.rooms SET state = 'reveal', updated_at = NOW() WHERE id = p_room_id;
    END IF;
    RETURN;
  END IF;

  v_correct_answer := v_round.question_content_snapshot->>'answer';

  UPDATE public.room_answers ra
    SET is_correct = (ra.answer_value = v_correct_answer),
        points_awarded = CASE
          WHEN ra.answer_value = v_correct_answer THEN
            GREATEST(0,
              FLOOR(1000.0 * (1.0 - ra.response_ms::FLOAT
                              / (v_room.per_question_seconds * 1000.0)))
            )::INT
          ELSE 0
        END
    WHERE ra.round_id = v_round.id;

  UPDATE public.room_members rm
    SET score = rm.score + COALESCE((
      SELECT points_awarded FROM public.room_answers
      WHERE round_id = v_round.id AND user_id = rm.user_id
    ), 0)
    WHERE rm.room_id = p_room_id AND rm.is_active = TRUE;

  UPDATE public.room_rounds SET revealed_at = NOW() WHERE id = v_round.id;

  UPDATE public.rooms SET state = 'reveal', updated_at = NOW() WHERE id = p_room_id;

  INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
    VALUES (p_room_id, v_caller, 'round_revealed',
            jsonb_build_object(
              'round_index', v_room.current_round_index,
              'correct_answer', v_correct_answer
            ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.reveal_round(UUID) TO authenticated;

-- 5.3 advance_round (sync) — mode='async' guard ekle
CREATE OR REPLACE FUNCTION public.advance_round(
  p_room_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller UUID;
  v_room   public.rooms%ROWTYPE;
  v_next_index SMALLINT;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oda bulunamadi: %', p_room_id USING ERRCODE = 'P0002';
  END IF;

  -- ASYNC GUARD
  IF v_room.mode = 'async' THEN
    RAISE EXCEPTION 'advance_round async odada cagrilmaz, advance_round_for_member kullan'
      USING ERRCODE = 'P0003';
  END IF;

  IF v_room.host_id <> v_caller THEN
    RAISE EXCEPTION 'Sadece host advance edebilir' USING ERRCODE = 'P0001';
  END IF;

  IF v_room.state = 'active' AND v_room.current_round_index = 0 THEN
    UPDATE public.room_rounds
      SET started_at = NOW(),
          ends_at = NOW() + (v_room.per_question_seconds || ' seconds')::INTERVAL
      WHERE room_id = p_room_id AND round_index = 1;

    UPDATE public.rooms
      SET current_round_index = 1, updated_at = NOW()
      WHERE id = p_room_id;

    INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
      VALUES (p_room_id, v_caller, 'round_started',
              jsonb_build_object('round_index', 1));

  ELSIF v_room.state = 'reveal' THEN
    v_next_index := v_room.current_round_index + 1;

    IF v_next_index > v_room.question_count THEN
      UPDATE public.rooms
        SET state = 'completed', ended_at = NOW(), updated_at = NOW()
        WHERE id = p_room_id;

      INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
        VALUES (p_room_id, v_caller, 'room_completed',
                jsonb_build_object(
                  'final_round', v_room.current_round_index,
                  'question_count', v_room.question_count
                ));
    ELSE
      UPDATE public.room_rounds
        SET started_at = NOW(),
            ends_at = NOW() + (v_room.per_question_seconds || ' seconds')::INTERVAL
        WHERE room_id = p_room_id AND round_index = v_next_index;

      UPDATE public.rooms
        SET state = 'active', current_round_index = v_next_index, updated_at = NOW()
        WHERE id = p_room_id;

      INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
        VALUES (p_room_id, v_caller, 'round_started',
                jsonb_build_object('round_index', v_next_index));
    END IF;
  ELSE
    RAISE EXCEPTION 'Advance yanlis state''te: %', v_room.state USING ERRCODE = 'P0003';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.advance_round(UUID) TO authenticated;

-- =============================================================================
-- 6) All-finished trigger — race-safe rooms.state='completed' transition
-- =============================================================================
-- AFTER UPDATE OF finished_at ON room_members. Sadece OLD.finished_at IS NULL
-- AND NEW.finished_at IS NOT NULL transition'inda fire eder. FOR UPDATE rooms
-- lock alir, sonra tum aktif uyelerin finished_at NOT NULL olup olmadigini check
-- eder. Idempotent (rooms.state zaten completed/archived ise skip).
CREATE OR REPLACE FUNCTION public._check_all_members_finished_async()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_room        public.rooms%ROWTYPE;
  v_unfinished  INT;
  v_finished    INT;
BEGIN
  -- Sadece NULL -> NOT NULL transition'inda is yap
  IF NOT (OLD.finished_at IS NULL AND NEW.finished_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  -- Lock room (race-safe; concurrent finish'ler serialize)
  SELECT * INTO v_room FROM public.rooms
    WHERE id = NEW.room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Sadece async odalarda check (defensive — sync row'lar finished_at degismez ama)
  IF v_room.mode <> 'async' THEN
    RETURN NEW;
  END IF;

  -- Idempotent: zaten completed/archived ise skip
  IF v_room.state IN ('completed', 'archived') THEN
    RETURN NEW;
  END IF;

  -- Aktif uyelerin durumu
  SELECT
    count(*) FILTER (WHERE finished_at IS NULL),
    count(*) FILTER (WHERE finished_at IS NOT NULL)
  INTO v_unfinished, v_finished
  FROM public.room_members
  WHERE room_id = NEW.room_id AND is_active = TRUE;

  -- Tum aktif uyeler bitti
  IF v_unfinished = 0 AND v_finished > 0 THEN
    UPDATE public.rooms
      SET state = 'completed',
          ended_at = NOW(),
          updated_at = NOW()
      WHERE id = NEW.room_id;

    INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
      VALUES (NEW.room_id, NULL, 'room_completed_async_all_finished',
              jsonb_build_object('finished_members', v_finished));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_async_all_finished ON public.room_members;
CREATE TRIGGER trg_async_all_finished
  AFTER UPDATE OF finished_at ON public.room_members
  FOR EACH ROW
  EXECUTE FUNCTION public._check_all_members_finished_async();

COMMIT;
