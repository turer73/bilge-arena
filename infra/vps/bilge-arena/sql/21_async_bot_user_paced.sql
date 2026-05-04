-- =============================================================================
-- Bilge Arena Oda Sistemi: 21_async_bot_user_paced (Async PR5 / Faz D2 redesign)
-- =============================================================================
-- Hedef: Faz D bot logic redesign — DB-instant recursive trigger UX'i kotu,
--        bot kullanici daha oynamadan tum round'lari bitiriyordu (yaris hissi
--        yok, "Bot finished, sen 1/10 sorudasin" gibi).
--
-- YENI MANTIK: Bot user-paced — gercek user her advance ettiginde, ayni odaki
-- bot member'lar da advance ederler ve eksik round'lari kapatirlar.
-- Bot her zaman EN HIZLI user'in current_round_index'iyle senkronize, asla
-- kullanicidan onde olmaz, yaris hissi gercek.
--
-- DEGISIKLIKLER:
--   1. 19_async_bot.sql trigger + fn DROP (eski recursive paterni)
--   2. start_room CREATE OR REPLACE — async branch bot için current_round_index=0
--      birakir (default), trigger user advance'te bot'u catch up eder
--   3. YENI FUNCTION: _bot_async_pace_with_user — user advance trigger'inden fire
--      - Aynı odadaki tüm bot'larin v_max_user_round'a catch up etmesi
--      - Eksik round'lar için answer insert + score update (round-by-round)
--      - User finished_at NOT NULL ise bot da finished_at set
--   4. YENI TRIGGER: trg_bot_async_pace_with_user — AFTER UPDATE OF
--      current_round_index ON room_members WHEN NOT is_bot
--
-- Plan referansi: Faz D2 (kullanici "dürüstçe mühendis gibi bitir" talebi)
-- Faz D'nin DB-instant recursive paterni dürüstçe kötü tasarımdı; bu redesign
-- mühendislik açısından doğru çözüm.
--
-- Plan-deviations:
--   #115 (yeni): Bot user-paced — kullanici advance ettiginde fire eder.
--       Recursive değil (NEW.is_bot=FALSE filter), sonsuz dongu yok.
--   #116 (yeni): Bot en hizli user (max(current_round_index)) ile pace'lenir.
--       Multi-user senaryoda bot yaviasin engellemez, hızlı oyuncu hızında
--       ilerletilmis bot UX hissi.
--   #117 (yeni): start_room async branch'inde bot için update SKIP — bot
--       current_round_index=0 (default) baslar, ilk user advance'inde
--       (genellikle start_room user.idx=1 set ettiğinde de fire eder)
--       trigger bot'u 1'e catch up eder + round 1 cevap insert.
--   #118 (yeni): Bot per-round answer insert (round-by-round) — bot hiçbir
--       round'u atlamaz, cevap insert sahip her round'a. Pretend-delay
--       submitted_at = NOW() + response_ms.
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/21_async_bot_user_paced.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- 1) DROP 19_async_bot.sql trigger + fn (eski recursive paterni)
-- =============================================================================
DROP TRIGGER IF EXISTS trg_bot_async_round_advance ON public.room_members;
DROP FUNCTION IF EXISTS public._bot_async_round_handler();

-- =============================================================================
-- 2) start_room CREATE OR REPLACE — async branch bot skip
-- =============================================================================
-- 16_async_functions.sql start_room async branch'i bot DAHIL tum members'i 1'e
-- set ediyordu. Yeni paternde bot 0'da kalir (trigger catch up eder).
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
    -- Async branch: SADECE is_bot=FALSE members'a current_round_index=1 set.
    -- Bot members default 0'da kalir; user advance trigger'i bot'u catch up
    -- eder + eksik round answer insert eder.
    UPDATE public.room_members
      SET current_round_index = 1,
          current_round_started_at = v_started_at
      WHERE room_id = p_room_id AND is_active = TRUE AND is_bot = FALSE;

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
-- 3) YENI FUNCTION: _bot_async_pace_with_user
-- =============================================================================
-- AFTER UPDATE OF current_round_index ON room_members fire eder. WHEN clause
-- NEW.is_bot=FALSE filter (sadece gerçek user advance'te). Trigger içinde:
--   - max user current_round_index hesapla (en hızlı user pace'i)
--   - Aynı odadaki bot member'lar için bot.current_round_index < max ise
--     catch up et (round-by-round answer insert + score update)
--   - User finished_at NOT NULL ise bot da finished_at set
CREATE OR REPLACE FUNCTION public._bot_async_pace_with_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_room          public.rooms%ROWTYPE;
  v_max_user      SMALLINT;
  v_bot           RECORD;
  v_target        SMALLINT;
  v_round         public.room_rounds%ROWTYPE;
  v_options       JSONB;
  v_correct       TEXT;
  v_options_count INT;
  v_accuracy      NUMERIC;
  v_answer        TEXT;
  v_response_ms   INT;
  v_is_correct    BOOLEAN;
  v_points        INT;
  v_wrong_idx     INT;
  v_attempt       INT;
  v_idx           SMALLINT;
BEGIN
  -- Async oda check
  SELECT * INTO v_room FROM public.rooms WHERE id = NEW.room_id;
  IF NOT FOUND OR v_room.mode <> 'async' THEN
    RETURN NEW;
  END IF;

  -- Max user current_round_index (en hızlı user pace'i)
  SELECT max(current_round_index) INTO v_max_user
  FROM public.room_members
  WHERE room_id = NEW.room_id
    AND is_active = TRUE
    AND is_bot = FALSE;

  -- Hicbir user yoksa veya hicbiri baslamamissa atla
  IF v_max_user IS NULL OR v_max_user < 1 THEN
    RETURN NEW;
  END IF;

  -- Difficulty-based accuracy (14_bot_answers paterni)
  v_accuracy := CASE
    WHEN v_room.difficulty <= 2 THEN 0.80
    WHEN v_room.difficulty = 3 THEN 0.70
    ELSE 0.60
  END;

  -- Loop bot members ki catch up gerek (current_round_index < max VEYA finished
  -- olmadi ama user finished)
  FOR v_bot IN
    SELECT * FROM public.room_members
    WHERE room_id = NEW.room_id
      AND is_bot = TRUE
      AND is_active = TRUE
      AND finished_at IS NULL
      AND current_round_index < v_max_user
  LOOP
    -- Target: question_count'i asma; user finished'sa bot da question_count+1 sembolik
    v_target := LEAST(v_max_user, v_room.question_count);

    -- Round-by-round catch up (eksik round'lara cevap insert)
    v_idx := v_bot.current_round_index;
    WHILE v_idx < v_target LOOP
      v_idx := v_idx + 1;

      SELECT * INTO v_round FROM public.room_rounds
        WHERE room_id = NEW.room_id AND round_index = v_idx;
      IF NOT FOUND THEN
        CONTINUE;  -- pre-create eksikse round atla
      END IF;

      v_correct := v_round.question_content_snapshot->>'answer';
      v_options := v_round.question_content_snapshot->'options';
      IF v_correct IS NULL OR v_options IS NULL OR jsonb_typeof(v_options) <> 'array' THEN
        CONTINUE;
      END IF;
      v_options_count := jsonb_array_length(v_options);
      IF v_options_count < 2 THEN
        CONTINUE;
      END IF;

      -- Random correct/wrong
      IF random() < v_accuracy THEN
        v_answer := v_correct;
        v_is_correct := TRUE;
      ELSE
        v_attempt := 0;
        v_answer := NULL;
        WHILE v_attempt < 10 LOOP
          v_wrong_idx := floor(random() * v_options_count)::INT;
          v_answer := v_options->>v_wrong_idx;
          EXIT WHEN v_answer IS NOT NULL AND v_answer <> v_correct;
          v_attempt := v_attempt + 1;
        END LOOP;
        IF v_answer IS NULL OR v_answer = v_correct THEN
          v_answer := v_correct;
          v_is_correct := TRUE;
        ELSE
          v_is_correct := FALSE;
        END IF;
      END IF;

      v_response_ms := 5000 + floor(random() * 10001)::INT;
      v_points := CASE
        WHEN v_is_correct THEN
          GREATEST(0,
            FLOOR(1000.0 * (1.0 - v_response_ms::FLOAT
                            / (v_room.per_question_seconds * 1000.0)))
          )::INT
        ELSE 0
      END;

      -- Idempotent insert (UNIQUE round_id+user_id catch)
      BEGIN
        INSERT INTO public.room_answers
          (room_id, round_id, user_id, answer_value, response_ms,
           is_correct, points_awarded, submitted_at)
        VALUES
          (NEW.room_id, v_round.id, v_bot.user_id, v_answer, v_response_ms,
           v_is_correct, v_points,
           NOW() + (v_response_ms || ' milliseconds')::INTERVAL);

        UPDATE public.room_members
          SET score = score + v_points
          WHERE id = v_bot.id;
      EXCEPTION WHEN unique_violation THEN
        NULL;  -- Bu round'a bot zaten cevap vermis (defensive)
      END;
    END LOOP;

    -- Bot.current_round_index update (catch up sonrasi target'a esit)
    UPDATE public.room_members
      SET current_round_index = v_target,
          current_round_started_at = NOW()
      WHERE id = v_bot.id;

    -- User finished (max>question_count sembolik): bot da finish
    IF NEW.current_round_index > v_room.question_count THEN
      UPDATE public.room_members
        SET finished_at = NOW(),
            current_round_index = v_room.question_count + 1
        WHERE id = v_bot.id;

      INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
        VALUES (NEW.room_id, NULL, 'bot_finished_async',
                jsonb_build_object(
                  'bot_user_id', v_bot.user_id,
                  'paced_with_user', NEW.user_id,
                  'final_round', v_room.question_count
                ));
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._bot_async_pace_with_user() FROM PUBLIC;

-- =============================================================================
-- 4) YENI TRIGGER: trg_bot_async_pace_with_user
-- =============================================================================
DROP TRIGGER IF EXISTS trg_bot_async_pace_with_user ON public.room_members;
CREATE TRIGGER trg_bot_async_pace_with_user
  AFTER UPDATE OF current_round_index ON public.room_members
  FOR EACH ROW
  WHEN (
    NEW.is_bot = FALSE  -- Sadece gerçek user advance'i (recursion yok)
    AND OLD.current_round_index IS DISTINCT FROM NEW.current_round_index
    AND NEW.current_round_index >= 1
  )
  EXECUTE FUNCTION public._bot_async_pace_with_user();

COMMIT;
