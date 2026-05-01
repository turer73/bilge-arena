-- =============================================================================
-- Bilge Arena Oda Sistemi: 13_replay_clone migration (Sprint 2C Task 8)
-- =============================================================================
-- Hedef: Replay & Share — kullanici bittigi odanin ayarlari ile yeni oda
--        olustur (clone) + sosyal medya paylasimi
--          - replay_room(p_source_room_id UUID) RPC
--          - Source oda ayarlari: category, difficulty, question_count,
--             max_players, per_question_seconds, mode, auto_advance_seconds
--          - is_public=FALSE (replay solo veya kod paylasim, listede degil)
--          - host = auth.uid() (caller, source host olmasa da)
--          - new Crockford-32 code generate
--
-- Plan referansi: docs/plans/2026-05-01-sprint2-dwell-time-improvements.md
--                 Task 8 (Replay & Share, viral K-faktor 0.05->0.15)
--
-- Plan-deviations:
--   #75 (yeni): replay_room source oda host olmasi sart DEGIL — herhangi bir
--       member oyunu replay edebilir. Plan dokumanindaki "Bu odayla yeniden
--       oyna" kapsami: oyunda yer alan herhangi bir kullanici clone edebilir.
--   #76 (yeni): Anti-cheat soru havuzu: clone yeni RANDOM sorular cekecek
--       (advance_round PR2b paterni). source oda sorularini KULLANMAZ —
--       same questions = score gaming.
--   #77 (yeni): is_public=FALSE clone (Aktif Odalar listesinde gozukmez).
--       Kullanici kod paylasarak arkadaslarini cagirir.
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/13_replay_clone.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- replay_room: source oda ayarlariyla yeni oda clone et
-- =============================================================================
-- Returns: jsonb {id, code} — create_room ile uyumlu shape
CREATE OR REPLACE FUNCTION public.replay_room(p_source_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller    UUID;
  v_source    public.rooms%ROWTYPE;
  v_new_id    UUID;
  v_new_code  CHAR(6);
  v_attempt   INT := 0;
  v_max_retry CONSTANT INT := 5;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required (auth.uid() NULL)'
      USING ERRCODE = 'P0001';
  END IF;

  -- Source oda fetch (RLS bypass — DEFINER owner)
  SELECT * INTO v_source
  FROM public.rooms
  WHERE id = p_source_room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source oda bulunamadi: %', p_source_room_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Plan-deviation #75: caller herhangi bir member olabilir, host olmak sart degil
  -- Member kontrolu (anti-spam: rastgele oda clone'u engelle)
  IF NOT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = p_source_room_id
      AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'Sadece odaya katilmis kullanicilar replay edebilir'
      USING ERRCODE = 'P0001';
  END IF;

  -- Code generation with collision retry
  LOOP
    v_attempt := v_attempt + 1;
    v_new_code := public._gen_room_code();

    BEGIN
      INSERT INTO public.rooms
        (code, host_id, title, category, difficulty, question_count,
         max_players, per_question_seconds, mode, state, auto_advance_seconds,
         is_public)
      VALUES
        (v_new_code, v_caller,
         v_source.title || ' (Tekrar)',  -- title'a (Tekrar) marker
         v_source.category,
         v_source.difficulty,
         v_source.question_count,
         v_source.max_players,
         v_source.per_question_seconds,
         v_source.mode,
         'lobby',
         v_source.auto_advance_seconds,
         FALSE)  -- plan-deviation #77: clone is_public=FALSE
      RETURNING id INTO v_new_id;

      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        IF v_attempt >= v_max_retry THEN
          RAISE EXCEPTION 'Code generation 5 retry sonrasi cakistir'
            USING ERRCODE = 'P0013';
        END IF;
    END;
  END LOOP;

  -- Host (caller) member ekle
  INSERT INTO public.room_members (room_id, user_id, role, is_bot)
    VALUES (v_new_id, v_caller, 'host', FALSE);

  -- Audit
  INSERT INTO public.room_audit_log (room_id, actor_id, action, payload)
    VALUES (v_new_id, v_caller, 'room_replay_created',
            jsonb_build_object(
              'source_room_id', p_source_room_id,
              'source_code', v_source.code,
              'code', v_new_code,
              'attempts', v_attempt
            ));

  RETURN jsonb_build_object(
    'id', v_new_id,
    'code', v_new_code
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.replay_room(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replay_room(UUID) TO authenticated;

COMMIT;
