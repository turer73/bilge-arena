-- Migration 179: Release TYT Fen mastery after a full category-proxy mapping.
--
-- This migration is deliberately separate from the registry foundation. It
-- maps only the reviewed TYT Fen scope and releases it atomically only when all
-- active questions and all three active leaves pass the generic integrity gate.

BEGIN;

DO $fn$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.curriculum_scope_releases
  SET release_status = CASE WHEN release_status = 'released' THEN 'released' ELSE 'validating' END,
      updated_at = clock_timestamp()
  WHERE game = 'fen'
    AND display_exam_ref = 'TYT'
    AND taxonomy_version = 'ba-tyt-fen-v1'
    AND release_status IN ('draft', 'validating', 'released');
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'TYT Fen curriculum scope is not releasable' USING ERRCODE = '55000';
  END IF;
END $fn$;

DO $fn$
DECLARE
  v_question record;
BEGIN
  FOR v_question IN
    SELECT id, game::text AS game, exam_ref::text AS exam_ref,
      category::text AS category, is_active
    FROM public.questions
    WHERE game = 'fen'
      AND upper(COALESCE(exam_ref, '')) = 'TYT'
      AND is_active
    ORDER BY id
  LOOP
    PERFORM public.sync_taxonomy_auto_question_outcomes(
      v_question.id,
      v_question.game,
      v_question.exam_ref,
      v_question.category,
      v_question.is_active
    );
  END LOOP;
END $fn$;

DO $fn$
DECLARE
  v_integrity jsonb;
BEGIN
  v_integrity := public.curriculum_scope_integrity('fen', 'TYT', 'ba-tyt-fen-v1');
  IF v_integrity IS NULL
    OR jsonb_typeof(v_integrity) <> 'object'
    OR COALESCE((v_integrity->>'total')::integer, 0) <= 0
    OR COALESCE((v_integrity->>'mapped')::integer, -1) <> (v_integrity->>'total')::integer
    OR COALESCE((v_integrity->>'unmapped')::integer, -1) <> 0
    OR COALESCE((v_integrity->>'scopeMismatch')::integer, -1) <> 0
    OR COALESCE((v_integrity->>'nodeOrphan')::integer, -1) <> 0
    OR COALESCE((v_integrity->>'outcomeOrphan')::integer, -1) <> 0
    OR COALESCE((v_integrity->>'primaryMismatch')::integer, -1) <> 0
    OR COALESCE((v_integrity->>'emptyOutcome')::integer, -1) <> 0 THEN
    RAISE EXCEPTION 'TYT Fen curriculum scope failed release integrity: %', v_integrity
      USING ERRCODE = '23514';
  END IF;
END $fn$;

UPDATE public.curriculum_scope_releases
SET release_status = 'released',
    released_at = COALESCE(released_at, clock_timestamp()),
    updated_at = clock_timestamp()
WHERE game = 'fen'
  AND display_exam_ref = 'TYT'
  AND taxonomy_version = 'ba-tyt-fen-v1'
  AND release_status IN ('validating', 'released');

DO $fn$
BEGIN
  IF public.resolve_released_curriculum_scope('fen', 'TYT') IS NULL THEN
    RAISE EXCEPTION 'TYT Fen curriculum scope release was not persisted' USING ERRCODE = '55000';
  END IF;
END $fn$;

NOTIFY pgrst, 'reload schema';
COMMIT;
