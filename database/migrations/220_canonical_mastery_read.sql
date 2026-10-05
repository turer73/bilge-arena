-- Canonical learner reads only. No scope release, catalog import or question publication.
BEGIN;

ALTER TABLE public.curriculum_scope_releases
  DROP CONSTRAINT IF EXISTS curriculum_scope_releases_mapping_mode_check;
ALTER TABLE public.curriculum_scope_releases
  ADD CONSTRAINT curriculum_scope_releases_mapping_mode_check
  CHECK (mapping_mode IN ('category_proxy', 'canonical_reviewed'));
ALTER TABLE public.curriculum_scope_releases
  DROP CONSTRAINT IF EXISTS curriculum_scope_releases_canonical_boundary;
-- Adaptive/institution consumers have their own release proofs. Do not opt them
-- into alias-based diagnostics merely because the practice map can be read.
ALTER TABLE public.curriculum_scope_releases
  ADD CONSTRAINT curriculum_scope_releases_canonical_boundary CHECK (
    mapping_mode <> 'canonical_reviewed' OR (
      display_exam_ref = 'LGS' AND question_exam_ref IS NOT DISTINCT FROM 'LGS'
      AND NOT diagnostic_enabled
    )
  );

-- Only the server reader gains SELECT. Existing evidence writers and all
-- anon/authenticated privileges remain unchanged; no new client access.
GRANT SELECT ON public.mastery_outcome_evidence TO service_role;
DROP POLICY IF EXISTS canonical_mastery_service_read ON public.mastery_outcome_evidence;
CREATE POLICY canonical_mastery_service_read ON public.mastery_outcome_evidence
  FOR SELECT TO service_role USING (true);

CREATE OR REPLACE FUNCTION public.read_canonical_mastery_context(
  p_user_id uuid, p_game text, p_exam_ref text, p_taxonomy_version text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $fn$
DECLARE
  v_scope jsonb;
  v_catalog jsonb;
  v_integrity jsonb;
  v_states jsonb;
  v_invalid boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated server user is required' USING ERRCODE = '22023';
  END IF;
  v_scope := public.resolve_released_curriculum_scope(p_game, p_exam_ref);
  IF v_scope IS NULL OR v_scope->>'mappingMode' IS DISTINCT FROM 'canonical_reviewed'
    OR v_scope->>'taxonomyVersion' IS DISTINCT FROM p_taxonomy_version
    OR v_scope->>'game' IS DISTINCT FROM p_game
    OR v_scope->>'displayExamRef' IS DISTINCT FROM 'LGS'
    OR v_scope->>'questionExamRef' IS DISTINCT FROM 'LGS'
    OR v_scope->'diagnosticEnabled' IS DISTINCT FROM 'false'::jsonb
  THEN RETURN NULL; END IF;

  v_integrity := public.curriculum_scope_integrity(p_game, p_exam_ref, p_taxonomy_version);
  IF v_integrity IS NULL OR coalesce((v_integrity->>'total')::integer, 0) <= 0
    OR (v_integrity->>'mapped')::integer IS DISTINCT FROM (v_integrity->>'total')::integer
    OR EXISTS (SELECT 1 FROM unnest(ARRAY['unmapped','scopeMismatch','nodeOrphan',
      'outcomeOrphan','primaryMismatch','emptyOutcome']) AS k
      WHERE coalesce((v_integrity->>k)::integer, -1) <> 0)
  THEN RETURN NULL; END IF;
  v_catalog := public.read_canonical_curriculum_catalog(p_game, p_exam_ref, p_taxonomy_version);
  IF v_catalog->>'catalogStatus' IS DISTINCT FROM 'complete' THEN RETURN NULL; END IF;

  WITH scoped AS MATERIALIZED (
    SELECT e.*, l.canonical_id, a.answered_at,
      (a.id IS NOT NULL AND a.user_id = e.user_id AND a.session_id = e.session_id
        AND a.question_id = e.question_id AND NOT coalesce(a.is_skipped, false)
        AND a.is_correct = e.is_correct AND a.answered_at IS NOT NULL
        AND va.id IS NOT NULL AND va.user_id = e.user_id AND va.session_id = e.session_id
        AND va.completed_at = e.verified_completed_at
        AND e.question_id = ANY(va.question_ids)
        AND gs.user_id = e.user_id) IS TRUE AS provenance_valid
    FROM public.mastery_outcome_evidence e
    JOIN public.curriculum_outcome_canonical_links l ON l.outcome_id = e.outcome_id
    JOIN public.curriculum_outcomes o ON o.id = e.outcome_id
    LEFT JOIN public.session_answers a ON a.id = e.answer_id
    LEFT JOIN public.verified_attempts va ON va.id = e.attempt_id
    LEFT JOIN public.game_sessions gs ON gs.id = e.session_id
    WHERE e.user_id = p_user_id AND l.taxonomy_version = p_taxonomy_version
      AND o.game = p_game AND o.exam_ref = p_exam_ref
      AND o.taxonomy_version = p_taxonomy_version AND o.is_active
  ), inconsistent AS (
    SELECT canonical_id, answer_id FROM scoped
    GROUP BY canonical_id, answer_id
    HAVING NOT bool_and(provenance_valid)
      OR count(DISTINCT jsonb_build_array(question_id, session_id, attempt_id,
        is_correct, difficulty, time_taken_sec, fast_wrong, max_hint_stage,
        delayed_correct, verified_completed_at)) <> 1
  ), deduplicated AS (
    -- Alias union policy: one answer, maximum mapping weight, never a sum.
    -- Evidence-day union is based on verified completion, never client time.
    SELECT canonical_id, answer_id, bool_and(is_correct) AS is_correct,
      max(mapping_weight) AS weight, max(difficulty) AS difficulty,
      max(time_taken_sec) AS time_taken_sec, bool_or(fast_wrong) AS fast_wrong,
      max(max_hint_stage) AS max_hint_stage, bool_or(delayed_correct) AS delayed_correct,
      max(evidence_day_tr) AS evidence_day_tr, max(answered_at) AS answered_at
    FROM scoped GROUP BY canonical_id, answer_id
  ), annotated AS (
    SELECT d.*,
      NOT d.is_correct AND EXISTS (SELECT 1 FROM public.review_logs r
        JOIN public.review_error_annotations a ON a.review_log_id = r.id
        WHERE r.answer_id = d.answer_id AND r.user_id = p_user_id AND a.reason_code = 'guess') AS guessed,
      NOT d.is_correct AND EXISTS (SELECT 1 FROM public.review_logs r
        JOIN public.review_error_annotations a ON a.review_log_id = r.id
        WHERE r.answer_id = d.answer_id AND r.user_id = p_user_id AND a.reason_code = 'careless') AS careless
    FROM deduplicated d
  ), aggregates AS (
    SELECT canonical_id AS outcome_id, count(*)::integer AS attempts,
      count(*) FILTER (WHERE is_correct)::integer AS correct_attempts,
      sum(CASE WHEN is_correct THEN weight ELSE 0 END) AS weighted_earned,
      sum(weight) AS weighted_possible,
      count(*) FILTER (WHERE is_correct AND delayed_correct)::integer AS delayed_correct,
      count(*)::integer AS v2_attempts,
      sum(CASE WHEN is_correct THEN weight * difficulty ELSE 0 END) AS difficulty_weighted_earned,
      sum(weight * difficulty) AS difficulty_weighted_possible,
      count(time_taken_sec)::integer AS timed_attempts,
      coalesce(sum(time_taken_sec), 0) AS total_time_sec,
      count(*) FILTER (WHERE fast_wrong AND NOT is_correct)::integer AS fast_wrong,
      count(*) FILTER (WHERE max_hint_stage > 0)::integer AS hinted_attempts,
      sum(max_hint_stage)::integer AS hint_stage_sum,
      count(*) FILTER (WHERE guessed)::integer AS guess_annotations,
      count(*) FILTER (WHERE careless)::integer AS careless_annotations,
      count(DISTINCT evidence_day_tr)::integer AS verified_evidence_days,
      max(answered_at) AS last_answered_at
    FROM annotated GROUP BY canonical_id
  ) SELECT EXISTS(SELECT 1 FROM inconsistent),
      coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY outcome_id) FROM aggregates a), '[]'::jsonb)
    INTO v_invalid, v_states;
  IF v_invalid THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('format', 'canonical-mastery@1', 'game', p_game,
    'examRef', p_exam_ref, 'taxonomyVersion', p_taxonomy_version,
    'integrity', v_integrity, 'items', v_catalog->'items', 'states', v_states);
END;
$fn$;
REVOKE ALL ON FUNCTION public.read_canonical_mastery_context(uuid,text,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_canonical_mastery_context(uuid,text,text,text) TO service_role;
COMMENT ON FUNCTION public.read_canonical_mastery_context(uuid,text,text,text) IS
  'Server-authenticated user only. Released canonical scope plus integrity; aliases union by answer and verified date. No publication authority.';

CREATE OR REPLACE FUNCTION public.sync_taxonomy_auto_question_outcomes(
  p_question_id uuid,
  p_game text,
  p_exam_ref text,
  p_category text,
  p_is_active boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_scope public.curriculum_scope_releases%ROWTYPE;
  v_outcome_id uuid;
  v_outcome_count integer;
BEGIN
  IF NOT COALESCE(p_is_active, false) THEN
    DELETE FROM public.question_outcomes
    WHERE question_id = p_question_id AND mapping_source = 'taxonomy_auto';
    RETURN;
  END IF;

  SELECT * INTO v_scope
  FROM public.curriculum_scope_releases AS scope
  WHERE scope.game = lower(btrim(p_game))
    AND scope.question_exam_ref IS NOT DISTINCT FROM
      NULLIF(upper(btrim(COALESCE(p_exam_ref, ''))), '')
    AND scope.release_status IN ('validating', 'released');

  IF NOT FOUND THEN
    DELETE FROM public.question_outcomes
    WHERE question_id = p_question_id AND mapping_source = 'taxonomy_auto';
    RETURN;
  END IF;

  -- Canonical mappings are question-specific reviewed evidence, never category guesses.
  IF v_scope.mapping_mode = 'canonical_reviewed' THEN RETURN; END IF;

  SELECT min(outcome.id::text)::uuid, count(*)::integer
  INTO v_outcome_id, v_outcome_count
  FROM public.curriculum_outcomes AS outcome
  JOIN public.curriculum_nodes AS node ON node.id = outcome.node_id
  WHERE outcome.is_active
    AND node.is_active
    AND node.node_type = 'outcome'
    AND outcome.game = v_scope.game
    AND upper(COALESCE(outcome.exam_ref, '')) = v_scope.display_exam_ref
    AND outcome.taxonomy_version = v_scope.taxonomy_version
    AND outcome.category = lower(btrim(p_category))
    AND node.game IS NOT DISTINCT FROM outcome.game
    AND node.exam_ref IS NOT DISTINCT FROM outcome.exam_ref
    AND node.taxonomy_version IS NOT DISTINCT FROM outcome.taxonomy_version
    AND node.category IS NOT DISTINCT FROM outcome.category;

  IF v_outcome_count <> 1 OR v_outcome_id IS NULL THEN
    RAISE EXCEPTION 'released curriculum category is not uniquely mapped: %/%/%',
      v_scope.game, v_scope.display_exam_ref, p_category USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.question_outcomes
  WHERE question_id = p_question_id
    AND mapping_source = 'taxonomy_auto'
    AND outcome_id <> v_outcome_id;

  INSERT INTO public.question_outcomes (
    question_id, outcome_id, weight, is_primary, mapping_source
  )
  SELECT p_question_id, v_outcome_id, 1,
    NOT EXISTS (
      SELECT 1 FROM public.question_outcomes AS existing
      WHERE existing.question_id = p_question_id
        AND existing.is_primary
        AND existing.outcome_id <> v_outcome_id
    ),
    'taxonomy_auto'
  ON CONFLICT (question_id, outcome_id) DO UPDATE
  SET weight = EXCLUDED.weight,
      is_primary = EXCLUDED.is_primary
  WHERE public.question_outcomes.mapping_source = 'taxonomy_auto'
    AND (
      public.question_outcomes.weight IS DISTINCT FROM EXCLUDED.weight
      OR public.question_outcomes.is_primary IS DISTINCT FROM EXCLUDED.is_primary
    );
END $fn$;
REVOKE ALL ON FUNCTION public.sync_taxonomy_auto_question_outcomes(uuid,text,text,text,boolean)
  FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
