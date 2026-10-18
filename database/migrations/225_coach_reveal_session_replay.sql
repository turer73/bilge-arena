-- F4/#2615: authorized coach transfer answers record the seven-day XP window.
-- F5/#2616: persist repeat deductions at completion and replay their original values.
-- Prerequisite: the production ledger through 224. Other pending migrations
-- are not required; apply only 225 during this release.
-- Existing sessions deliberately keep NULL metadata: historical repeat deductions
-- cannot be reconstructed from a mutable seven-day reveal window.
-- Rollback: restore the four function definitions from 099/20261017110000.
-- Keep the additive columns and recorded reveals; do not erase payment evidence.
BEGIN;

ALTER TABLE public.game_sessions
  ADD COLUMN IF NOT EXISTS xp_repeat_withheld integer CHECK (xp_repeat_withheld >= 0),
  ADD COLUMN IF NOT EXISTS repeat_questions integer CHECK (repeat_questions >= 0);
COMMENT ON COLUMN public.game_sessions.xp_repeat_withheld IS
  'Repeat XP withheld at completion. NULL means historical breakdown unavailable.';
COMMENT ON COLUMN public.game_sessions.repeat_questions IS
  'Paid-answer count withheld by the repeat rule at completion; NULL for legacy sessions.';

CREATE OR REPLACE FUNCTION public.record_question_reveal(
  p_user_id     uuid,
  p_attempt_id  uuid,
  p_question_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  c_reveal_window CONSTANT interval := interval '7 days';
  v_attempt public.verified_attempts%ROWTYPE;
  v_owner uuid;
BEGIN
  IF p_user_id IS NULL OR p_attempt_id IS NULL OR p_question_id IS NULL THEN
    RAISE EXCEPTION 'user, attempt and question are required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_attempt FROM public.verified_attempts WHERE id = p_attempt_id;
  IF NOT FOUND OR v_attempt.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'attempt owner mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE(p_question_id = ANY(v_attempt.question_ids), false)
     AND NOT EXISTS (
       SELECT 1 FROM public.verified_coach_sessions AS coach
       WHERE coach.attempt_id = p_attempt_id AND coach.user_id = p_user_id
         AND coach.question_id = ANY(v_attempt.question_ids)
         AND coach.transfer_question_id = p_question_id
         AND coach.stage = 4 AND coach.transfer_completed_at IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'question is not part of the attempt' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.question_answer_reveals AS r (user_id, question_id, attempt_id, revealed_at)
  VALUES (p_user_id, p_question_id, p_attempt_id, clock_timestamp())
  ON CONFLICT (user_id, question_id) DO UPDATE
    SET attempt_id = EXCLUDED.attempt_id,
        revealed_at = EXCLUDED.revealed_at
    WHERE r.revealed_at <= clock_timestamp() - c_reveal_window;

  SELECT attempt_id INTO v_owner
    FROM public.question_answer_reveals
    WHERE user_id = p_user_id AND question_id = p_question_id;

  -- true: bu deneme sorunun XP penceresinin sahibi (soru XP verebilir).
  RETURN v_owner = p_attempt_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.answer_verified_coach_transfer(
  p_session_id uuid,
  p_user_id uuid,
  p_request_id uuid,
  p_selected_option smallint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_session public.verified_coach_sessions%ROWTYPE;
  v_question record;
BEGIN
  IF p_session_id IS NULL OR p_user_id IS NULL OR p_request_id IS NULL OR p_selected_option IS NULL THEN
    RAISE EXCEPTION 'session, user, request and selected option are required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_session FROM public.verified_coach_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'coach session owner mismatch' USING ERRCODE='42501';
  END IF;
  IF v_session.transfer_completed_at IS NOT NULL THEN
    IF v_session.transfer_request_id IS DISTINCT FROM p_request_id THEN
      RAISE EXCEPTION 'transfer answer was already bound to another request' USING ERRCODE='22023';
    END IF;
    SELECT public.verified_coach_correct_option(question.content) AS correct_option,
      public.verified_coach_option_count(question.content) AS option_count,
      CASE WHEN jsonb_typeof(question.content->'solution')='string'
        THEN left(trim(question.content->>'solution'),2000) END AS solution
    INTO v_question FROM public.questions question WHERE question.id=v_session.transfer_question_id;
    PERFORM public.record_question_reveal(p_user_id, v_session.attempt_id, v_session.transfer_question_id);
    RETURN jsonb_build_object('isCorrect',v_session.transfer_is_correct,'correctOption',v_question.correct_option,
      'solution',v_question.solution,'coachDepth',4,'transferQuestionId',v_session.transfer_question_id,'replayed',true);
  END IF;
  IF v_session.expires_at <= clock_timestamp() OR v_session.stage <> 4 OR v_session.transfer_question_id IS NULL THEN
    RAISE EXCEPTION 'coach transfer is not eligible' USING ERRCODE='22023';
  END IF;

  SELECT public.verified_coach_correct_option(question.content) AS correct_option,
    public.verified_coach_option_count(question.content) AS option_count,
    CASE WHEN jsonb_typeof(question.content->'solution')='string'
      THEN left(trim(question.content->>'solution'),2000) END AS solution
  INTO v_question
  FROM public.questions question
  WHERE question.id=v_session.transfer_question_id AND question.is_active=true;
  IF NOT FOUND OR v_question.correct_option IS NULL OR p_selected_option < 0 OR p_selected_option >= v_question.option_count THEN
    RAISE EXCEPTION 'transfer question is not a supported multiple-choice question or selected option is out of range' USING ERRCODE='22023';
  END IF;

  UPDATE public.verified_coach_sessions
  SET transfer_request_id=p_request_id,transfer_selected_option=p_selected_option,
      transfer_is_correct=(p_selected_option=v_question.correct_option),transfer_completed_at=clock_timestamp(),updated_at=clock_timestamp()
  WHERE id=p_session_id;

  -- The answer and reveal commit together; a failed reveal rolls back the answer.
  PERFORM public.record_question_reveal(p_user_id, v_session.attempt_id, v_session.transfer_question_id);
  RETURN jsonb_build_object('isCorrect',p_selected_option=v_question.correct_option,'correctOption',v_question.correct_option,
    'solution',v_question.solution,'coachDepth',4,'transferQuestionId',v_session.transfer_question_id,'replayed',false);
END $fn$;

CREATE OR REPLACE FUNCTION public.complete_game_session(
  p_user_id           UUID,
  p_client_request_id UUID,
  p_game              TEXT,
  p_mode              TEXT,
  p_category          TEXT,
  p_filter_difficulty SMALLINT,
  p_answers           JSONB,
  p_total_xp          INTEGER,
  p_base_xp           INTEGER,
  p_bonus_xp          INTEGER,
  p_correct_count     SMALLINT,
  p_wrong_count       SMALLINT,
  p_time_spent_sec    INTEGER,
  p_avg_time_sec      NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  -- Istanbul gunu basina odenecek en cok oturum XP'si. Ayar tek yerde.
  c_daily_session_xp_cap CONSTANT integer := 2500;
  -- Cevabi baska bir denemede acilmis soru bu sure boyunca XP vermez.
  c_reveal_window CONSTANT interval := interval '7 days';
  v_existing RECORD;
  v_session_id UUID;
  v_xp_today integer;
  v_xp_awarded integer;
  v_attempt_id uuid;
  v_repeat_xp integer := 0;
  v_repeat_count integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required' USING ERRCODE = '42501';
  END IF;
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'client_request_id required' USING ERRCODE = '22023';
  END IF;

  -- Hizli-yol idempotency: ayni istek daha once tamamen islendiyse ayni sonucu don
  SELECT id, total_xp, correct_count, wrong_count, xp_awarded, xp_repeat_withheld, repeat_questions
    INTO v_existing
    FROM public.game_sessions
    WHERE user_id = p_user_id AND client_request_id = p_client_request_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'sessionId', v_existing.id,
      'totalXP', v_existing.total_xp,
      'xpAwarded', COALESCE(v_existing.xp_awarded, v_existing.total_xp),
      'xpRepeatWithheld', v_existing.xp_repeat_withheld,
      'repeatQuestions', v_existing.repeat_questions,
      'correctCount', v_existing.correct_count,
      'wrongCount', v_existing.wrong_count,
      'alreadyProcessed', true
    );
  END IF;

  -- complete_verified_game_session bu islemde dogrulanmis denemeyi yazar
  -- (set_config ..., true). Dogrudan cagrida (yalniz sahip) tekrar kurali yok.
  v_attempt_id := NULLIF(current_setting('bilge.verified_attempt_id', true), '')::uuid;

  -- 1. Session insert -- BILEREK 'active' ile baslar, ayni islemde 'completed'a
  -- UPDATE edilir: trg_session_complete (update_weekly_leaderboard) yalniz
  -- active -> completed gecisinde tetiklenir (bkz. 081/129).
  BEGIN
    INSERT INTO public.game_sessions (
      user_id, client_request_id, game, mode, status,
      total_questions, correct_count, wrong_count, skipped_count,
      base_xp, bonus_xp, total_xp, time_spent_sec, avg_time_sec,
      streak_at_start, filter_category, filter_difficulty
    ) VALUES (
      p_user_id, p_client_request_id, p_game, p_mode, 'active',
      p_correct_count + p_wrong_count, p_correct_count, p_wrong_count, 0,
      p_base_xp, p_bonus_xp, p_total_xp, p_time_spent_sec, p_avg_time_sec,
      0, p_category, p_filter_difficulty
    )
    RETURNING id INTO v_session_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id, total_xp, correct_count, wrong_count, xp_awarded, xp_repeat_withheld, repeat_questions
      INTO v_existing
      FROM public.game_sessions
      WHERE user_id = p_user_id AND client_request_id = p_client_request_id;
    RETURN jsonb_build_object(
      'sessionId', v_existing.id,
      'totalXP', v_existing.total_xp,
      'xpAwarded', COALESCE(v_existing.xp_awarded, v_existing.total_xp),
      'xpRepeatWithheld', v_existing.xp_repeat_withheld,
      'repeatQuestions', v_existing.repeat_questions,
      'correctCount', v_existing.correct_count,
      'wrongCount', v_existing.wrong_count,
      'alreadyProcessed', true
    );
  END;

  -- 2. Cevaplari toplu ekle
  INSERT INTO public.session_answers (
    session_id, question_id, user_id, selected_option, is_correct,
    is_skipped, time_taken_sec, is_fast, xp_earned, question_order
  )
  SELECT
    v_session_id, x.question_id, p_user_id, x.selected_option, x.is_correct,
    x.is_skipped, x.time_taken_sec, x.is_fast, x.xp_earned, x.question_order
  FROM jsonb_to_recordset(p_answers) AS x(
    question_id UUID, selected_option SMALLINT, is_correct BOOLEAN,
    is_skipped BOOLEAN, time_taken_sec NUMERIC, is_fast BOOLEAN,
    xp_earned SMALLINT, question_order SMALLINT
  );

  -- 2b. Soru-bazli istatistikler (nested cagri, ayni transaction)
  PERFORM public.batch_increment_question_stats(
    (SELECT array_agg((x->>'question_id')::uuid) FROM jsonb_array_elements(p_answers) x),
    (SELECT array_agg((x->>'is_correct')::boolean) FROM jsonb_array_elements(p_answers) x)
  );

  -- 3. Gunluk oturum XP tavani. Profil satiri kilitlenir: ayni kullanicinin
  -- eszamanli tamamlamalari burada siralanir ve sonraki okuma oncekinin
  -- commit ettigi xp_log satirini gorur. FOR UPDATE degil FOR NO KEY UPDATE:
  -- game_sessions INSERT'inin FK kontrolu profilde KEY SHARE tutar; FOR UPDATE
  -- iki eszamanli oturumda bu KEY SHARE'lerle kilitlenmeye (deadlock) girer.
  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR NO KEY UPDATE;
  SELECT COALESCE(sum(xl.amount), 0)::integer
    INTO v_xp_today
    FROM public.xp_log AS xl
    WHERE xl.user_id = p_user_id
      AND xl.reason = 'session_complete'
      AND xl.created_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul');
  -- Tekrar kurali: cevabi son 7 gunde BASKA bir denemede acilmis sorunun XP'si
  -- odenmez. Soru dogruluk, gorev ve FSRS sayimlarinda kalir; yalniz odeme
  -- duser (total_xp ve xp_earned nominal: 106 dogrulamasi).
  IF v_attempt_id IS NOT NULL THEN
    SELECT COALESCE(sum(GREATEST(x.xp_earned, 0)), 0)::integer,
           count(*) FILTER (WHERE x.xp_earned > 0)::integer
      INTO v_repeat_xp, v_repeat_count
      FROM jsonb_to_recordset(p_answers) AS x(question_id uuid, xp_earned smallint)
      JOIN public.question_answer_reveals AS r
        ON r.user_id = p_user_id AND r.question_id = x.question_id
      WHERE r.attempt_id <> v_attempt_id
        AND r.revealed_at > now() - c_reveal_window;
  END IF;

  v_xp_awarded := LEAST(
    GREATEST(COALESCE(p_total_xp, 0) - v_repeat_xp, 0),
    GREATEST(c_daily_session_xp_cap - v_xp_today, 0)
  );

  -- 4. active -> completed (trg_session_complete'i tetikler; haftalik liderlik
  -- xp_awarded'i kullanir). completed_at burada set edilir.
  UPDATE public.game_sessions
    SET status = 'completed', completed_at = now(), xp_awarded = v_xp_awarded,
        xp_repeat_withheld = v_repeat_xp, repeat_questions = v_repeat_count
    WHERE id = v_session_id;

  -- 5. Coin: 129'dan beri yalniz apply_verified_session_rewards icinde.

  -- 6. XP + seviye + xp_log (increment_xp icinde atomik). 0 XP (hepsi yanlis
  -- ya da tavan dolu) gecerli: increment_xp p_amount <= 0'da RAISE eder.
  IF v_xp_awarded > 0 THEN
    PERFORM public.increment_xp(p_user_id, v_xp_awarded, 'session_complete', v_session_id);
  END IF;

  -- 7. Konu-ilerleme -- atomik upsert.
  IF p_category IS NOT NULL AND length(trim(p_category)) > 0 THEN
    INSERT INTO public.user_topic_progress AS utp (user_id, game, category, questions_seen, correct, last_seen_at)
    VALUES (p_user_id, p_game, p_category, p_correct_count + p_wrong_count, p_correct_count, now())
    ON CONFLICT (user_id, game, category) DO UPDATE SET
      questions_seen = utp.questions_seen + EXCLUDED.questions_seen,
      correct = utp.correct + EXCLUDED.correct,
      last_seen_at = now();
  END IF;

  RETURN jsonb_build_object(
    'sessionId', v_session_id,
    'totalXP', p_total_xp,
    'xpAwarded', v_xp_awarded,
    'xpRepeatWithheld', v_repeat_xp,
    'repeatQuestions', v_repeat_count,
    'correctCount', p_correct_count,
    'wrongCount', p_wrong_count,
    'alreadyProcessed', false
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.complete_verified_game_session(
    p_attempt_id         UUID,
    p_user_id            UUID,
    p_client_request_id  UUID,
    p_game               TEXT,
    p_mode               TEXT,
    p_category           TEXT,
    p_filter_difficulty  SMALLINT,
    p_answers            JSONB,
    p_total_xp           INTEGER,
    p_base_xp            INTEGER,
    p_bonus_xp           INTEGER,
    p_correct_count      SMALLINT,
    p_wrong_count        SMALLINT,
    p_time_spent_sec     INTEGER,
    p_avg_time_sec       NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_attempt         RECORD;
    v_result          JSONB;
    v_submitted_ids   UUID[];
    v_existing_game   RECORD;
BEGIN
    -- Lock the verified attempt row, preventing concurrent completions.
    SELECT * INTO v_attempt
    FROM public.verified_attempts
    WHERE id = p_attempt_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'attempt % not found', p_attempt_id
            USING ERRCODE = 'P0002';
    END IF;

    -- Explicitly reject NULL or mismatched user, game, or mode.
    IF v_attempt.user_id IS DISTINCT FROM p_user_id THEN
        RAISE EXCEPTION 'user_id mismatch for attempt %', p_attempt_id
            USING ERRCODE = '42501';
    END IF;
    IF v_attempt.game IS DISTINCT FROM p_game OR v_attempt.mode IS DISTINCT FROM p_mode THEN
        RAISE EXCEPTION 'game or mode mismatch for attempt %', p_attempt_id
            USING ERRCODE = '22023';
    END IF;

    -- Replay path: if this attempt was already completed, return the original session data.
    IF v_attempt.completed_at IS NOT NULL AND v_attempt.session_id IS NOT NULL THEN
        SELECT id, total_xp, correct_count, wrong_count, xp_awarded, xp_repeat_withheld, repeat_questions
        INTO v_existing_game
        FROM public.game_sessions
        WHERE id = v_attempt.session_id AND user_id = p_user_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'session % not found or mismatched user', v_attempt.session_id
                USING ERRCODE = 'P0002';
        END IF;
        RETURN jsonb_build_object(
            'sessionId',        v_existing_game.id,
            'totalXP',          v_existing_game.total_xp,
            'xpAwarded',        COALESCE(v_existing_game.xp_awarded, v_existing_game.total_xp),
            'xpRepeatWithheld', v_existing_game.xp_repeat_withheld,
            'repeatQuestions',  v_existing_game.repeat_questions,
            'correctCount',     v_existing_game.correct_count,
            'wrongCount',       v_existing_game.wrong_count,
            'alreadyProcessed', true
        );
    END IF;

    -- Fresh path: the attempt must not be expired.
    IF v_attempt.expires_at <= clock_timestamp() THEN
        RAISE EXCEPTION 'attempt % has expired (expires_at %)', p_attempt_id, v_attempt.expires_at
            USING ERRCODE = '22023';
    END IF;

    -- p_answers must be a non-empty JSON array.
    IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' OR jsonb_array_length(p_answers) = 0 THEN
        RAISE EXCEPTION 'answers must be a non-empty JSON array'
            USING ERRCODE = '22023';
    END IF;

    -- Every element must contain a canonical 8-4-4-4-12 hex UUID in question_id.
    PERFORM 1 FROM jsonb_array_elements(p_answers) AS elem
    WHERE (elem->>'question_id') IS NULL
       OR (elem->>'question_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    IF FOUND THEN
        RAISE EXCEPTION 'each answer must contain a canonical UUID question_id'
            USING ERRCODE = '22023';
    END IF;

    -- Extract the submitted IDs (now safe to cast).
    SELECT array_agg(qid ORDER BY qid) INTO v_submitted_ids
    FROM (
        SELECT (elem->>'question_id')::uuid AS qid
        FROM jsonb_array_elements(p_answers) AS elem
    ) sub;

    -- No duplicate question_ids allowed.
    IF cardinality(v_submitted_ids) != (SELECT COUNT(DISTINCT uid) FROM unnest(v_submitted_ids) AS uid) THEN
        RAISE EXCEPTION 'duplicate question_ids in answers'
            USING ERRCODE = '22023';
    END IF;

    -- Submitted IDs must be a subset of the issued IDs (life exhaustion allows early stop).
    IF EXISTS (
        SELECT 1 FROM unnest(v_submitted_ids) AS uid
        WHERE uid != ALL(v_attempt.question_ids)
    ) THEN
        RAISE EXCEPTION 'submitted question_ids must be a subset of issued question_ids'
            USING ERRCODE = '22023';
    END IF;

    -- client_request_id must be present and unique for this user.
    IF p_client_request_id IS NULL THEN
        RAISE EXCEPTION 'client_request_id must not be NULL'
            USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.game_sessions
        WHERE user_id = p_user_id AND client_request_id = p_client_request_id
    ) THEN
        RAISE EXCEPTION 'duplicate client_request_id for user %', p_user_id
            USING ERRCODE = '23505';
    END IF;

    -- Tekrar kurali icin dogrulanmis deneme ic fonksiyona islem-yerel olarak
    -- iletilir (20261017110000). Imza degismez.
    PERFORM set_config('bilge.verified_attempt_id', p_attempt_id::text, true);

    -- Delegate to the original 14-arg SECURITY DEFINER function in the same transaction.
    v_result := public.complete_game_session(
        p_user_id, p_client_request_id, p_game, p_mode, p_category,
        p_filter_difficulty, p_answers, p_total_xp, p_base_xp, p_bonus_xp,
        p_correct_count, p_wrong_count, p_time_spent_sec, p_avg_time_sec
    );

    -- The result must be non-null, contain a sessionId, and represent a fresh completion.
    IF v_result IS NULL THEN
        RAISE EXCEPTION 'internal error: complete_game_session returned NULL'
            USING ERRCODE = 'P0002';
    END IF;
    IF v_result->>'sessionId' IS NULL THEN
        RAISE EXCEPTION 'internal error: complete_game_session returned null sessionId'
            USING ERRCODE = 'P0002';
    END IF;
    IF (v_result->>'alreadyProcessed') IS DISTINCT FROM 'false' THEN
        RAISE EXCEPTION 'concurrent collision: attempt already completed'
            USING ERRCODE = '23505';
    END IF;

    -- Bind the session to the locked attempt with a single UPDATE.
    UPDATE public.verified_attempts
    SET session_id = (v_result->>'sessionId')::uuid,
        completed_at = clock_timestamp()
    WHERE id = p_attempt_id;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.record_question_reveal(uuid, uuid, uuid),
  public.answer_verified_coach_transfer(uuid, uuid, uuid, smallint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_question_reveal(uuid, uuid, uuid),
  public.answer_verified_coach_transfer(uuid, uuid, uuid, smallint) TO service_role;
REVOKE ALL ON FUNCTION public.complete_game_session(
  uuid, uuid, text, text, text, smallint, jsonb, integer, integer, integer,
  smallint, smallint, integer, numeric
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_verified_game_session(
  uuid, uuid, uuid, text, text, text, smallint, jsonb, integer, integer, integer,
  smallint, smallint, integer, numeric
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_verified_game_session(
  uuid, uuid, uuid, text, text, text, smallint, jsonb, integer, integer, integer,
  smallint, smallint, integer, numeric
) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
