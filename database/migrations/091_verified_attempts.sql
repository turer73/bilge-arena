-- Migration 091: Verified attempts foundation
--
-- Creates the verified_attempts table for R0.2 roadmap. This table records
-- user attempts with strict validation: every question ID must exist and be
-- active for the bound game, durations are bounded, and modes/games are
-- constrained to the known application sets.
--
-- Security model:
--   * RLS enabled, no policies (service-role server code is the only writer).
--   * All table privileges revoked from PUBLIC, anon, authenticated.
--   * issue_verified_attempt is SECURITY DEFINER, service_role-only.
--
-- Rollback: DROP TABLE public.verified_attempts; DROP FUNCTION
-- public.issue_verified_attempt(uuid, text, text, uuid[], integer);

BEGIN;

-- Immutable helper to enforce unique, non-null array elements without a
-- subquery in a CHECK constraint. PostgreSQL forbids subqueries directly in
-- CHECK constraints, so we use this immutable function instead.
CREATE OR REPLACE FUNCTION public.verified_attempts_question_ids_valid(p_question_ids uuid[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
    SELECT p_question_ids IS NOT NULL
       AND cardinality(p_question_ids) BETWEEN 1 AND 100
       AND cardinality(p_question_ids) = (
           SELECT COUNT(DISTINCT q)
           FROM unnest(p_question_ids) AS q
           WHERE q IS NOT NULL
       )
$$;

-- Revoke public/client EXECUTE on the helper; only the postgres owner (and
-- service_role via the function's SECURITY DEFINER context) may use it.
REVOKE ALL ON FUNCTION public.verified_attempts_question_ids_valid(uuid[])
  FROM PUBLIC, anon, authenticated;

-- Core table: verified attempts with strict validation.
CREATE TABLE IF NOT EXISTS public.verified_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    game text NOT NULL CHECK (game IN ('wordquest', 'matematik', 'turkce', 'fen', 'sosyal')),
    mode text NOT NULL CHECK (mode IN ('classic', 'blitz', 'marathon', 'boss', 'practice', 'deneme')),
    question_ids uuid[] NOT NULL CHECK (public.verified_attempts_question_ids_valid(question_ids)),
    duration_sec integer NOT NULL CHECK (duration_sec BETWEEN 5 AND 7200),
    started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    expires_at timestamptz NOT NULL CHECK (expires_at > started_at),
    completed_at timestamptz,
    session_id uuid UNIQUE REFERENCES public.game_sessions(id),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT verified_attempts_completion_consistency CHECK (
        (completed_at IS NULL AND session_id IS NULL)
        OR (completed_at IS NOT NULL AND session_id IS NOT NULL)
    )
);

-- Useful index for user/expiry lookups (active attempts, cleanup jobs).
CREATE INDEX IF NOT EXISTS verified_attempts_user_expiry_idx
    ON public.verified_attempts (user_id, expires_at);

-- Enable RLS; no policies created (service-role server code is the only writer).
ALTER TABLE public.verified_attempts ENABLE ROW LEVEL SECURITY;

-- Revoke all table privileges from client roles.
REVOKE ALL ON TABLE public.verified_attempts FROM PUBLIC, anon, authenticated;

-- SECURITY DEFINER issuance function: validates inputs and inserts a verified
-- attempt. Returns {attemptId, expiresAt} for the client.
CREATE OR REPLACE FUNCTION public.issue_verified_attempt(
    p_user_id uuid,
    p_game text,
    p_mode text,
    p_question_ids uuid[],
    p_duration_sec integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_expires_at timestamptz;
    v_attempt_id uuid;
    v_active_count integer;
BEGIN
    -- Validate required fields.
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required'
            USING ERRCODE = '22023';
    END IF;
    IF p_game IS NULL OR p_game NOT IN ('wordquest', 'matematik', 'turkce', 'fen', 'sosyal') THEN
        RAISE EXCEPTION 'invalid game: %', p_game
            USING ERRCODE = '22023';
    END IF;
    IF p_mode IS NULL OR p_mode NOT IN ('classic', 'blitz', 'marathon', 'boss', 'practice', 'deneme') THEN
        RAISE EXCEPTION 'invalid mode: %', p_mode
            USING ERRCODE = '22023';
    END IF;
    IF p_duration_sec IS NULL OR p_duration_sec NOT BETWEEN 5 AND 7200 THEN
        RAISE EXCEPTION 'duration_sec must be between 5 and 7200'
            USING ERRCODE = '22023';
    END IF;

    -- Validate question_ids array: non-null, 1..100 elements, no NULLs, no duplicates.
    IF p_question_ids IS NULL THEN
        RAISE EXCEPTION 'question_ids is required'
            USING ERRCODE = '22023';
    END IF;
    IF cardinality(p_question_ids) NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION 'question_ids must contain 1 to 100 elements'
            USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(p_question_ids) AS q WHERE q IS NULL) THEN
        RAISE EXCEPTION 'question_ids cannot contain NULL elements'
            USING ERRCODE = '22023';
    END IF;
    IF cardinality(p_question_ids) <> (SELECT COUNT(DISTINCT q) FROM unnest(p_question_ids) AS q) THEN
        RAISE EXCEPTION 'question_ids cannot contain duplicates'
            USING ERRCODE = '22023';
    END IF;

    -- Prove every ID is an active question for the same game (set-based, no N+1).
    SELECT COUNT(*)
    INTO v_active_count
    FROM public.questions
    WHERE id = ANY(p_question_ids)
      AND game = p_game
      AND is_active = true;

    IF v_active_count <> cardinality(p_question_ids) THEN
        RAISE EXCEPTION 'all question_ids must reference active questions for game %', p_game
            USING ERRCODE = '22023';
    END IF;

    -- Compute expiry and insert.
    v_expires_at := clock_timestamp() + make_interval(secs => p_duration_sec);

    INSERT INTO public.verified_attempts (
        user_id, game, mode, question_ids, duration_sec, started_at, expires_at
    )
    VALUES (
        p_user_id, p_game, p_mode, p_question_ids, p_duration_sec,
        clock_timestamp(), v_expires_at
    )
    RETURNING id INTO v_attempt_id;

    RETURN jsonb_build_object(
        'attemptId', v_attempt_id,
        'expiresAt', v_expires_at
    );
END;
$$;

-- Revoke client EXECUTE; grant only service_role.
REVOKE ALL ON FUNCTION public.issue_verified_attempt(uuid, text, text, uuid[], integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_verified_attempt(uuid, text, text, uuid[], integer)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verification after apply:
--   SELECT p.proname, pg_get_function_identity_arguments(p.oid), p.proacl
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('issue_verified_attempt', 'verified_attempts_question_ids_valid')
--   ORDER BY p.proname;

-- Rollback:
--   DROP TABLE public.verified_attempts;
--   DROP FUNCTION public.issue_verified_attempt(uuid, text, text, uuid[], integer);
--   DROP FUNCTION public.verified_attempts_question_ids_valid(uuid[]);
