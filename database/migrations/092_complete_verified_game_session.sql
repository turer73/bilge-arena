-- Migration 092: complete_verified_game_session wrapper
--
-- Wraps migration 081's complete_game_session with verified attempt validation.
-- Ensures that only unexpired, matching attempts with valid answer subsets can
-- complete, preventing replay and enforcing client-request-id uniqueness.
--
-- Security:
--   * Revokes direct access to the old 14-arg function (even from service_role)
--     so that all completions must go through the new wrapper.
--   * The new wrapper is SECURITY DEFINER, runs with pg_catalog search_path,
--     and is callable only by service_role.
--
-- Rollback (concrete):
--   DROP FUNCTION IF EXISTS public.complete_verified_game_session(
--     UUID, UUID, UUID, TEXT, TEXT, TEXT, SMALLINT, JSONB, INTEGER, INTEGER,
--     INTEGER, SMALLINT, SMALLINT, INTEGER, NUMERIC
--   );
--   GRANT EXECUTE ON FUNCTION public.complete_game_session(
--     UUID, UUID, TEXT, TEXT, TEXT, SMALLINT, JSONB, INTEGER, INTEGER, INTEGER,
--     SMALLINT, SMALLINT, INTEGER, NUMERIC
--   ) TO service_role;

BEGIN;

-- Disallow any direct call to the old function so that everyone must use the wrapper.
-- The wrapper itself calls it with owner privileges, bypassing this revoke.
REVOKE EXECUTE ON FUNCTION public.complete_game_session(
    UUID, UUID, TEXT, TEXT, TEXT, SMALLINT, JSONB, INTEGER, INTEGER, INTEGER,
    SMALLINT, SMALLINT, INTEGER, NUMERIC
) FROM PUBLIC, anon, authenticated, service_role;

-- Create the wrapper with the required 15-parameter signature.
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
        SELECT id, total_xp, correct_count, wrong_count
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

-- Wrapper access: only service_role may call it.
REVOKE EXECUTE ON FUNCTION public.complete_verified_game_session(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, SMALLINT, JSONB, INTEGER, INTEGER, INTEGER,
    SMALLINT, SMALLINT, INTEGER, NUMERIC
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_verified_game_session(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, SMALLINT, JSONB, INTEGER, INTEGER, INTEGER,
    SMALLINT, SMALLINT, INTEGER, NUMERIC
) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
