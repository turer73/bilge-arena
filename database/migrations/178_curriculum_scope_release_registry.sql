-- Migration 178: Fail-closed curriculum scope release registry.
--
-- A curriculum graph being present is not enough to expose a mastery map. A
-- scope is public only after its active question bank is fully mapped and the
-- graph/mapping integrity check is clean. The registry also keeps display exam
-- semantics separate from legacy question storage semantics (for example YDT
-- questions currently stored with a NULL exam_ref).

BEGIN;

CREATE TABLE IF NOT EXISTS public.curriculum_scope_releases (
  game varchar(20) NOT NULL CHECK (game IN ('wordquest','matematik','turkce','fen','sosyal')),
  display_exam_ref varchar(20) NOT NULL CHECK (display_exam_ref ~ '^[A-Z0-9-]{2,10}$'),
  question_exam_ref varchar(20) CHECK (question_exam_ref IS NULL OR question_exam_ref ~ '^[A-Z0-9-]{2,10}$'),
  taxonomy_version text NOT NULL CHECK (taxonomy_version ~ '^ba-[a-z0-9-]+-v[0-9]+$'),
  release_status text NOT NULL DEFAULT 'draft' CHECK (release_status IN ('draft','validating','released','retired')),
  mapping_mode text NOT NULL DEFAULT 'category_proxy' CHECK (mapping_mode IN ('category_proxy')),
  diagnostic_enabled boolean NOT NULL DEFAULT false,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (game, display_exam_ref),
  UNIQUE (taxonomy_version),
  CHECK (release_status <> 'released' OR released_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS curriculum_scope_releases_question_scope_uidx
  ON public.curriculum_scope_releases (game, COALESCE(question_exam_ref, '__NULL__'));

ALTER TABLE public.curriculum_scope_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.curriculum_scope_releases FROM PUBLIC, anon, authenticated, service_role;

-- Preserve the already-proven TYT Mathematics release on replay.
INSERT INTO public.curriculum_scope_releases (
  game, display_exam_ref, question_exam_ref, taxonomy_version,
  release_status, mapping_mode, diagnostic_enabled, released_at
)
VALUES (
  'matematik', 'TYT', 'TYT', 'ba-tyt-math-v1',
  'released', 'category_proxy', true, clock_timestamp()
)
ON CONFLICT (game, display_exam_ref) DO UPDATE SET
  question_exam_ref = EXCLUDED.question_exam_ref,
  taxonomy_version = EXCLUDED.taxonomy_version,
  release_status = 'released',
  mapping_mode = EXCLUDED.mapping_mode,
  diagnostic_enabled = EXCLUDED.diagnostic_enabled,
  released_at = COALESCE(public.curriculum_scope_releases.released_at, clock_timestamp()),
  updated_at = clock_timestamp();

-- Graphs exist for these scopes, but they remain draft until a dedicated data
-- migration maps the bank and passes the generic integrity gate. Replaying this
-- foundation must never downgrade a later release.
INSERT INTO public.curriculum_scope_releases (
  game, display_exam_ref, question_exam_ref, taxonomy_version,
  release_status, mapping_mode, diagnostic_enabled, released_at
)
VALUES
  ('turkce', 'TYT', 'TYT', 'ba-tyt-turkce-v1', 'draft', 'category_proxy', false, NULL),
  ('fen', 'TYT', 'TYT', 'ba-tyt-fen-v1', 'draft', 'category_proxy', false, NULL),
  ('sosyal', 'TYT', 'TYT', 'ba-tyt-sosyal-v1', 'draft', 'category_proxy', false, NULL),
  ('wordquest', 'YDT', NULL, 'ba-ydt-eng-v1', 'draft', 'category_proxy', false, NULL)
ON CONFLICT (game, display_exam_ref) DO UPDATE SET
  question_exam_ref = EXCLUDED.question_exam_ref,
  taxonomy_version = EXCLUDED.taxonomy_version,
  mapping_mode = EXCLUDED.mapping_mode,
  diagnostic_enabled = EXCLUDED.diagnostic_enabled,
  updated_at = clock_timestamp();

CREATE OR REPLACE FUNCTION public.resolve_released_curriculum_scope(
  p_game text,
  p_display_exam_ref text
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT jsonb_build_object(
    'game', scope.game,
    'displayExamRef', scope.display_exam_ref,
    'questionExamRef', scope.question_exam_ref,
    'taxonomyVersion', scope.taxonomy_version,
    'mappingMode', scope.mapping_mode,
    'diagnosticEnabled', scope.diagnostic_enabled
  )
  FROM public.curriculum_scope_releases AS scope
  WHERE scope.game = lower(btrim(p_game))
    AND scope.display_exam_ref = upper(btrim(p_display_exam_ref))
    AND scope.release_status = 'released'
$fn$;

CREATE OR REPLACE FUNCTION public.curriculum_scope_integrity(
  p_game text,
  p_display_exam_ref text,
  p_taxonomy_version text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_scope public.curriculum_scope_releases%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_scope
  FROM public.curriculum_scope_releases AS scope
  WHERE scope.game = lower(btrim(p_game))
    AND scope.display_exam_ref = upper(btrim(p_display_exam_ref))
    AND scope.taxonomy_version = btrim(p_taxonomy_version);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'curriculum scope is not registered' USING ERRCODE = 'P0002';
  END IF;

  WITH scope_questions AS (
    SELECT question.id, question.game::text AS game,
      NULLIF(upper(btrim(COALESCE(question.exam_ref, ''))), '') AS question_exam_ref,
      question.category::text AS category
    FROM public.questions AS question
    WHERE question.is_active
      AND question.game = v_scope.game
      AND NULLIF(upper(btrim(COALESCE(question.exam_ref, ''))), '')
        IS NOT DISTINCT FROM v_scope.question_exam_ref
  ),
  valid_mapping_rows AS (
    SELECT question.id AS question_id, mapping.outcome_id, mapping.is_primary
    FROM scope_questions AS question
    JOIN public.question_outcomes AS mapping ON mapping.question_id = question.id
    JOIN public.curriculum_outcomes AS outcome ON outcome.id = mapping.outcome_id
    JOIN public.curriculum_nodes AS node ON node.id = outcome.node_id
    WHERE outcome.is_active
      AND node.is_active
      AND node.node_type = 'outcome'
      AND outcome.game IS NOT DISTINCT FROM question.game
      AND upper(COALESCE(outcome.exam_ref, '')) = v_scope.display_exam_ref
      AND outcome.taxonomy_version = v_scope.taxonomy_version
      AND outcome.category IS NOT DISTINCT FROM question.category
      AND node.game IS NOT DISTINCT FROM outcome.game
      AND node.exam_ref IS NOT DISTINCT FROM outcome.exam_ref
      AND node.taxonomy_version IS NOT DISTINCT FROM outcome.taxonomy_version
      AND node.category IS NOT DISTINCT FROM outcome.category
  ),
  mapped_questions AS (
    SELECT DISTINCT question_id FROM valid_mapping_rows
  ),
  scope_mismatch AS (
    SELECT count(*)::integer AS count
    FROM scope_questions AS question
    JOIN public.question_outcomes AS mapping ON mapping.question_id = question.id
    LEFT JOIN public.curriculum_outcomes AS outcome ON outcome.id = mapping.outcome_id
    LEFT JOIN public.curriculum_nodes AS node ON node.id = outcome.node_id
    WHERE outcome.id IS NULL
      OR NOT outcome.is_active
      OR outcome.game IS DISTINCT FROM question.game
      OR upper(COALESCE(outcome.exam_ref, '')) <> v_scope.display_exam_ref
      OR outcome.taxonomy_version IS DISTINCT FROM v_scope.taxonomy_version
      OR outcome.category IS DISTINCT FROM question.category
      OR node.id IS NULL
      OR NOT node.is_active
      OR node.node_type <> 'outcome'
      OR node.game IS DISTINCT FROM outcome.game
      OR node.exam_ref IS DISTINCT FROM outcome.exam_ref
      OR node.taxonomy_version IS DISTINCT FROM outcome.taxonomy_version
      OR node.category IS DISTINCT FROM outcome.category
  ),
  primary_mismatch_count AS (
    SELECT count(*)::integer AS count
    FROM (
      SELECT question.id
      FROM scope_questions AS question
      LEFT JOIN valid_mapping_rows AS mapping ON mapping.question_id = question.id
      GROUP BY question.id
      HAVING count(*) FILTER (WHERE mapping.is_primary) <> 1
    ) AS invalid_question
  ),
  node_orphan AS (
    SELECT count(*)::integer AS count
    FROM public.curriculum_nodes AS child
    LEFT JOIN public.curriculum_nodes AS parent ON parent.id = child.parent_id
    WHERE child.taxonomy_version = v_scope.taxonomy_version
      AND child.is_active
      AND (
        (child.node_type = 'course' AND child.parent_id IS NOT NULL)
        OR (child.node_type <> 'course' AND (
          parent.id IS NULL
          OR NOT parent.is_active
          OR parent.game IS DISTINCT FROM child.game
          OR parent.exam_ref IS DISTINCT FROM child.exam_ref
          OR parent.taxonomy_version IS DISTINCT FROM child.taxonomy_version
          OR parent.node_type IS DISTINCT FROM CASE child.node_type
            WHEN 'unit' THEN 'course'
            WHEN 'topic' THEN 'unit'
            WHEN 'outcome' THEN 'topic'
          END
        ))
      )
  ),
  outcome_orphan AS (
    SELECT count(*)::integer AS count
    FROM public.curriculum_outcomes AS outcome
    LEFT JOIN public.curriculum_nodes AS node ON node.id = outcome.node_id
    WHERE outcome.is_active
      AND outcome.game = v_scope.game
      AND upper(COALESCE(outcome.exam_ref, '')) = v_scope.display_exam_ref
      AND outcome.taxonomy_version = v_scope.taxonomy_version
      AND (
        node.id IS NULL
        OR NOT node.is_active
        OR node.node_type <> 'outcome'
        OR node.game IS DISTINCT FROM outcome.game
        OR node.exam_ref IS DISTINCT FROM outcome.exam_ref
        OR node.taxonomy_version IS DISTINCT FROM outcome.taxonomy_version
        OR node.category IS DISTINCT FROM outcome.category
      )
  ),
  empty_outcome AS (
    SELECT count(*)::integer AS count
    FROM public.curriculum_outcomes AS outcome
    WHERE outcome.is_active
      AND outcome.game = v_scope.game
      AND upper(COALESCE(outcome.exam_ref, '')) = v_scope.display_exam_ref
      AND outcome.taxonomy_version = v_scope.taxonomy_version
      AND NOT EXISTS (
        SELECT 1
        FROM valid_mapping_rows AS mapping
        WHERE mapping.outcome_id = outcome.id
      )
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*)::integer FROM scope_questions),
    'mapped', (SELECT count(*)::integer FROM mapped_questions),
    'unmapped', (SELECT count(*)::integer FROM scope_questions) - (SELECT count(*)::integer FROM mapped_questions),
    'scopeMismatch', (SELECT count FROM scope_mismatch),
    'nodeOrphan', (SELECT count FROM node_orphan),
    'outcomeOrphan', (SELECT count FROM outcome_orphan),
    'primaryMismatch', (SELECT count FROM primary_mismatch_count),
    'emptyOutcome', (SELECT count FROM empty_outcome)
  ) INTO v_result;

  RETURN v_result;
END $fn$;

-- Preserve the original no-argument contract used by institution reporting.
CREATE OR REPLACE FUNCTION public.curriculum_graph_integrity()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.curriculum_scope_integrity('matematik', 'TYT', 'ba-tyt-math-v1');
  RETURN jsonb_build_object(
    'total', v_result->'total',
    'mapped', v_result->'mapped',
    'unmapped', v_result->'unmapped',
    'scopeMismatch', v_result->'scopeMismatch',
    'nodeOrphan', v_result->'nodeOrphan',
    'outcomeOrphan', v_result->'outcomeOrphan'
  );
END $fn$;

REVOKE ALL ON FUNCTION public.curriculum_graph_integrity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.curriculum_graph_integrity() TO service_role;

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
  -- Taxonomy ownership is explicit: never delete or overwrite reviewed/manual rows.
  DELETE FROM public.question_outcomes
  WHERE question_id = p_question_id AND mapping_source = 'taxonomy_auto';

  IF NOT COALESCE(p_is_active, false) THEN
    RETURN;
  END IF;

  SELECT * INTO v_scope
  FROM public.curriculum_scope_releases AS scope
  WHERE scope.game = lower(btrim(p_game))
    AND scope.question_exam_ref IS NOT DISTINCT FROM
      NULLIF(upper(btrim(COALESCE(p_exam_ref, ''))), '')
    AND scope.release_status IN ('validating', 'released');

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- PostgreSQL has no built-in min(uuid); cast through text only to choose a
  -- deterministic representative when a category resolves to one outcome.
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

  INSERT INTO public.question_outcomes (
    question_id, outcome_id, weight, is_primary, mapping_source
  )
  SELECT p_question_id, v_outcome_id, 1,
    NOT EXISTS (
      SELECT 1 FROM public.question_outcomes AS existing
      WHERE existing.question_id = p_question_id AND existing.is_primary
    ),
    'taxonomy_auto'
  ON CONFLICT (question_id, outcome_id) DO NOTHING;
END $fn$;

-- The legacy Math scope was already released, but the new registry adds two
-- stricter invariants (one primary mapping per question and no empty leaf).
-- Re-prove all eight fields in the same transaction so a fresh/replayed
-- migration can never publish Math merely because the seed row says released.
DO $fn$
DECLARE
  v_integrity jsonb;
BEGIN
  v_integrity := public.curriculum_scope_integrity('matematik', 'TYT', 'ba-tyt-math-v1');
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
    RAISE EXCEPTION 'TYT Mathematics curriculum scope failed registry integrity: %', v_integrity
      USING ERRCODE = '23514';
  END IF;
END $fn$;

REVOKE ALL ON FUNCTION public.resolve_released_curriculum_scope(text,text),
  public.curriculum_scope_integrity(text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_released_curriculum_scope(text,text),
  public.curriculum_scope_integrity(text,text,text)
  TO service_role;

REVOKE ALL ON FUNCTION public.sync_taxonomy_auto_question_outcomes(uuid,text,text,text,boolean)
  FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
