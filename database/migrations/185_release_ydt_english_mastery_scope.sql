-- Migration 185: Release the YDT English mastery scope.
--
-- Wordquest questions intentionally store a NULL exam_ref while the public
-- curriculum is displayed as YDT. The release registry keeps those semantics
-- separate. This migration maps the complete active bank by its reviewed
-- seven-category taxonomy and publishes it only after all integrity fields are
-- clean in the same transaction.

BEGIN;

-- Serialize graph, question, mapping, answer, and attempt-completion writers
-- with the release proof. A writer that starts during this transaction resumes
-- only after the released taxonomy and all mappings are visible together.
LOCK TABLE
  public.curriculum_scope_releases,
  public.curriculum_nodes,
  public.curriculum_outcomes,
  public.session_answers,
  public.questions,
  public.question_outcomes,
  public.verified_attempts
IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE ydt_english_scope_release_control (
  should_apply boolean NOT NULL
) ON COMMIT DROP;

-- Replays must preserve an operator retirement or a later taxonomy version.
INSERT INTO ydt_english_scope_release_control (should_apply)
SELECT EXISTS (
  SELECT 1
  FROM public.curriculum_scope_releases
  WHERE game = 'wordquest'
    AND display_exam_ref = 'YDT'
    AND question_exam_ref IS NULL
    AND taxonomy_version = 'ba-ydt-eng-v1'
    AND release_status IN ('draft', 'validating', 'released')
);

DO $fn$
DECLARE
  v_updated integer;
BEGIN
  IF NOT (SELECT should_apply FROM ydt_english_scope_release_control) THEN
    RETURN;
  END IF;

  UPDATE public.curriculum_scope_releases
  SET release_status = CASE WHEN release_status = 'released' THEN 'released' ELSE 'validating' END,
      updated_at = clock_timestamp()
  WHERE game = 'wordquest'
    AND display_exam_ref = 'YDT'
    AND question_exam_ref IS NULL
    AND taxonomy_version = 'ba-ydt-eng-v1'
    AND release_status IN ('draft', 'validating', 'released');
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'YDT English curriculum scope is not releasable'
      USING ERRCODE = '55000';
  END IF;
END $fn$;

DO $fn$
DECLARE
  v_question record;
BEGIN
  IF NOT (SELECT should_apply FROM ydt_english_scope_release_control) THEN
    RETURN;
  END IF;

  FOR v_question IN
    SELECT id, game::text AS game, exam_ref::text AS exam_ref,
      category::text AS category, is_active
    FROM public.questions
    WHERE game = 'wordquest'
      AND NULLIF(upper(btrim(COALESCE(exam_ref, ''))), '') IS NULL
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
  IF NOT (SELECT should_apply FROM ydt_english_scope_release_control) THEN
    RETURN;
  END IF;

  v_integrity := public.curriculum_scope_integrity(
    'wordquest', 'YDT', 'ba-ydt-eng-v1'
  );
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
    RAISE EXCEPTION 'YDT English curriculum scope failed release integrity: %', v_integrity
      USING ERRCODE = '23514';
  END IF;
END $fn$;

UPDATE public.curriculum_scope_releases
SET release_status = 'released',
    released_at = COALESCE(released_at, clock_timestamp()),
    updated_at = clock_timestamp()
WHERE game = 'wordquest'
  AND display_exam_ref = 'YDT'
  AND question_exam_ref IS NULL
  AND taxonomy_version = 'ba-ydt-eng-v1'
  AND release_status IN ('validating', 'released')
  AND (SELECT should_apply FROM ydt_english_scope_release_control);

DO $fn$
DECLARE
  v_scope jsonb;
BEGIN
  IF NOT (SELECT should_apply FROM ydt_english_scope_release_control) THEN
    RETURN;
  END IF;

  v_scope := public.resolve_released_curriculum_scope('wordquest', 'YDT');
  IF v_scope IS NULL
    OR v_scope->>'game' <> 'wordquest'
    OR v_scope->>'displayExamRef' <> 'YDT'
    OR v_scope->'questionExamRef' IS DISTINCT FROM 'null'::jsonb
    OR v_scope->>'taxonomyVersion' <> 'ba-ydt-eng-v1'
    OR v_scope->>'mappingMode' <> 'category_proxy'
    OR COALESCE((v_scope->>'diagnosticEnabled')::boolean, true) THEN
    RAISE EXCEPTION 'YDT English curriculum scope release was not persisted: %', v_scope
      USING ERRCODE = '55000';
  END IF;
END $fn$;

NOTIFY pgrst, 'reload schema';
COMMIT;
