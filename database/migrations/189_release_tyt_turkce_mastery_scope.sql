-- Migration 189: Release the TYT Turkish discovery scope.
--
-- The original v1 graph mixed the AYT literature category into the TYT
-- Turkish scope. Build a corrected, versioned v2 category-proxy graph with
-- only the five TYT Turkish categories that have active bank coverage.
-- This release deliberately keeps adaptive diagnostic disabled: the learner
-- sees an evidence-collection discovery level, never an unsupported diagnosis.
-- Before releasing either scope, extend the DB-boundary mapping guard from the
-- split Wordquest scope to every scope registered in the release registry.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- Drain graph, question, mapping and verified-attempt writers before replacing
-- the boundary functions or proving coverage. A publish call that began before
-- this migration must resume through the permanent row/deferred triggers below.
LOCK TABLE
  public.curriculum_scope_releases,
  public.curriculum_nodes,
  public.curriculum_outcomes,
  public.question_revision_outcomes,
  public.session_answers,
  public.questions,
  public.question_outcomes,
  public.verified_attempts,
  public.verified_attempt_question_revisions,
  public.verified_attempt_hint_events,
  public.review_logs,
  public.review_error_annotations,
  public.mastery_materialized_attempts,
  public.mastery_outcome_evidence,
  public.user_outcome_state
IN SHARE ROW EXCLUSIVE MODE;

-- Resolve every registered question-storage scope, including ordinary exact
-- scopes such as turkce/TYT -> TYT. Unregistered scopes keep the legacy exact
-- exam-ref validation and no taxonomy lifecycle contract.
CREATE OR REPLACE FUNCTION public.resolve_question_curriculum_validation_scope(
  p_game text,
  p_question_exam_ref text
)
RETURNS TABLE (
  display_exam_ref text,
  taxonomy_version text,
  release_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  WITH normalized AS (
    SELECT lower(btrim(p_game)) AS game,
      NULLIF(upper(btrim(COALESCE(p_question_exam_ref, ''))), '') AS question_exam_ref
  ), registered_scope AS (
    SELECT scope.display_exam_ref::text, scope.taxonomy_version::text,
      scope.release_status::text
    FROM public.curriculum_scope_releases AS scope
    CROSS JOIN normalized
    WHERE scope.game = normalized.game
      AND scope.question_exam_ref IS NOT DISTINCT FROM normalized.question_exam_ref
  )
  SELECT scope.display_exam_ref, scope.taxonomy_version, scope.release_status
  FROM registered_scope AS scope
  UNION ALL
  SELECT normalized.question_exam_ref, NULL::text, NULL::text
  FROM normalized
  WHERE NOT EXISTS (SELECT 1 FROM registered_scope)
$fn$;

REVOKE ALL ON FUNCTION public.resolve_question_curriculum_validation_scope(text,text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.resolve_question_curriculum_validation_scope(text,text)
  IS 'Resolves registered exact or split question-storage scope lifecycle for internal fail-closed validation.';

-- Keep the existing trigger/function identifiers so upgrades from migration
-- 187 replace their behavior atomically without a trigger-disable window.
CREATE OR REPLACE FUNCTION public.tg_question_outcome_split_scope_row_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_taxonomy_version text;
  v_release_status text;
BEGIN
  SELECT scope.taxonomy_version, scope.release_status
  INTO v_taxonomy_version, v_release_status
  FROM public.questions AS question
  CROSS JOIN LATERAL public.resolve_question_curriculum_validation_scope(
    question.game, question.exam_ref
  ) AS scope
  WHERE question.id = NEW.question_id;

  -- Unregistered scopes retain the pre-registry outcome validation contract.
  IF v_taxonomy_version IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT COALESCE(v_release_status IN ('validating','released'), false)
    OR NOT public.question_outcome_scope_valid(NEW.question_id, NEW.outcome_id) THEN
    RAISE EXCEPTION 'question outcome is outside the active registered curriculum scope'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.assert_split_question_outcome_integrity(
  p_question_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_is_active boolean;
  v_taxonomy_version text;
  v_release_status text;
BEGIN
  SELECT question.is_active, scope.taxonomy_version, scope.release_status
  INTO v_is_active, v_taxonomy_version, v_release_status
  FROM public.questions AS question
  CROSS JOIN LATERAL public.resolve_question_curriculum_validation_scope(
    question.game, question.exam_ref
  ) AS scope
  WHERE question.id = p_question_id;

  IF NOT FOUND OR NOT COALESCE(v_is_active, false) OR v_taxonomy_version IS NULL THEN
    RETURN;
  END IF;

  -- Draft/retired mappings may be removed, but the immediate row guard rejects
  -- new writes. Cardinality becomes mandatory while validating or released.
  IF NOT COALESCE(v_release_status IN ('validating','released'), false) THEN
    RETURN;
  END IF;

  IF NOT public.question_active_outcome_mapping_valid(p_question_id) THEN
    RAISE EXCEPTION 'active registered-scope question mapping is invalid or unreleased'
      USING ERRCODE = '22023';
  END IF;
END
$fn$;

REVOKE ALL ON FUNCTION public.assert_split_question_outcome_integrity(uuid),
  public.tg_assert_split_question_outcome_integrity(),
  public.tg_question_outcome_split_scope_row_guard()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.assert_split_question_outcome_integrity(uuid)
  IS 'Deferred DB-boundary assertion for active registered exact or split curriculum mappings.';

-- Preserve unchanged taxonomy-auto mapping timestamps. Besides making release
-- replays audit-stable, this protects the materializer's base-counter boundary
-- when a question receives a no-op category/exam metadata update.
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

-- Never silently replace a scope that has already been released on the legacy
-- v1 taxonomy. Production is expected to still be draft here; the guard makes
-- an unexpected lifecycle drift a hard stop instead of rewriting history.
DO $fn$
DECLARE
  v_scope public.curriculum_scope_releases%ROWTYPE;
BEGIN
  SELECT * INTO v_scope
  FROM public.curriculum_scope_releases
  WHERE game = 'turkce' AND display_exam_ref = 'TYT';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TYT Turkish registry foundation is missing'
      USING ERRCODE = '55000';
  END IF;

  IF v_scope.taxonomy_version = 'ba-tyt-turkce-v1'
    AND (
      v_scope.release_status NOT IN ('draft','validating')
      OR v_scope.released_at IS NOT NULL
    ) THEN
    RAISE EXCEPTION 'released TYT Turkish v1 cannot be rewritten as v2'
      USING ERRCODE = '55000';
  END IF;
END
$fn$;

CREATE TABLE IF NOT EXISTS public.curriculum_scope_release_history (
  history_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game varchar(20) NOT NULL,
  display_exam_ref varchar(20) NOT NULL,
  question_exam_ref varchar(20),
  taxonomy_version text NOT NULL,
  release_status text NOT NULL,
  mapping_mode text NOT NULL,
  diagnostic_enabled boolean NOT NULL,
  released_at timestamptz,
  source_created_at timestamptz NOT NULL,
  source_updated_at timestamptz NOT NULL,
  transition_reason text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (game, display_exam_ref, taxonomy_version, transition_reason)
);

ALTER TABLE public.curriculum_scope_release_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.curriculum_scope_release_history
  FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.curriculum_scope_release_history (
  game,display_exam_ref,question_exam_ref,taxonomy_version,release_status,
  mapping_mode,diagnostic_enabled,released_at,source_created_at,
  source_updated_at,transition_reason
)
SELECT scope.game,scope.display_exam_ref,scope.question_exam_ref,
  scope.taxonomy_version,scope.release_status,scope.mapping_mode,
  scope.diagnostic_enabled,scope.released_at,scope.created_at,scope.updated_at,
  '189_tyt_turkce_v2_cutover'
FROM public.curriculum_scope_releases AS scope
WHERE scope.game='turkce'
  AND scope.display_exam_ref='TYT'
  AND scope.taxonomy_version='ba-tyt-turkce-v1'
ON CONFLICT (game, display_exam_ref, taxonomy_version, transition_reason)
  DO NOTHING;

UPDATE public.curriculum_scope_releases
SET taxonomy_version = 'ba-tyt-turkce-v2',
    release_status = 'draft',
    diagnostic_enabled = false,
    released_at = NULL,
    updated_at = clock_timestamp()
WHERE game = 'turkce'
  AND display_exam_ref = 'TYT'
  AND taxonomy_version = 'ba-tyt-turkce-v1'
  AND release_status IN ('draft','validating')
  AND released_at IS NULL;

-- Insert-only graph construction keeps a successful migration replay
-- mutation-free. Any pre-existing code collision remains visible to the
-- integrity postcheck rather than being overwritten.
INSERT INTO public.curriculum_nodes (
  code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,
  sort_order,is_active
)
SELECT 'ba-tyt-turkce-v2:course','ba-tyt-turkce-v2','turkce','TYT',
  'course',NULL,NULL,'TYT Türkçe',10,true
WHERE EXISTS (
  SELECT 1 FROM public.curriculum_scope_releases
  WHERE game='turkce' AND display_exam_ref='TYT'
    AND taxonomy_version='ba-tyt-turkce-v2'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.curriculum_nodes (
  code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,
  sort_order,is_active
)
SELECT value.code,'ba-tyt-turkce-v2','turkce','TYT','unit',course.id,NULL,
  value.title,value.sort_order,true
FROM (VALUES
  ('ba-tyt-turkce-v2:unit:okuma','Okuduğunu Anlama',10),
  ('ba-tyt-turkce-v2:unit:dil-bilgisi','Dil Bilgisi',20),
  ('ba-tyt-turkce-v2:unit:soz-varligi','Anlam ve Söz Varlığı',30)
) AS value(code,title,sort_order)
JOIN public.curriculum_nodes AS course
  ON course.code='ba-tyt-turkce-v2:course'
WHERE EXISTS (
  SELECT 1 FROM public.curriculum_scope_releases
  WHERE game='turkce' AND display_exam_ref='TYT'
    AND taxonomy_version='ba-tyt-turkce-v2'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.curriculum_nodes (
  code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,
  sort_order,is_active
)
SELECT value.code,'ba-tyt-turkce-v2','turkce','TYT','topic',unit.id,
  value.category,value.title,value.sort_order,true
FROM (VALUES
  ('ba-tyt-turkce-v2:topic:paragraf','ba-tyt-turkce-v2:unit:okuma','paragraf','Paragraf',10),
  ('ba-tyt-turkce-v2:topic:dil_bilgisi','ba-tyt-turkce-v2:unit:dil-bilgisi','dil_bilgisi','Dil Bilgisi',20),
  ('ba-tyt-turkce-v2:topic:yazim_kurallari','ba-tyt-turkce-v2:unit:dil-bilgisi','yazim_kurallari','Yazım Kuralları',30),
  ('ba-tyt-turkce-v2:topic:sozcuk','ba-tyt-turkce-v2:unit:soz-varligi','sozcuk','Sözcükte Anlam',40),
  ('ba-tyt-turkce-v2:topic:anlam_bilgisi','ba-tyt-turkce-v2:unit:soz-varligi','anlam_bilgisi','Anlam Bilgisi',50)
) AS value(code,unit_code,category,title,sort_order)
JOIN public.curriculum_nodes AS unit ON unit.code=value.unit_code
WHERE EXISTS (
  SELECT 1 FROM public.curriculum_scope_releases
  WHERE game='turkce' AND display_exam_ref='TYT'
    AND taxonomy_version='ba-tyt-turkce-v2'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.curriculum_nodes (
  code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,
  sort_order,is_active
)
SELECT replace(topic.code,':topic:',':outcome:'),'ba-tyt-turkce-v2',
  'turkce','TYT','outcome',topic.id,topic.category,value.title,10,true
FROM (VALUES
  ('paragraf','Paragrafta anlam kurma becerisi'),
  ('dil_bilgisi','Dil bilgisi çözümleme becerisi'),
  ('yazim_kurallari','Yazım ve noktalama becerisi'),
  ('sozcuk','Sözcükte anlam becerisi'),
  ('anlam_bilgisi','Cümlede anlam becerisi')
) AS value(category,title)
JOIN public.curriculum_nodes AS topic
  ON topic.code='ba-tyt-turkce-v2:topic:'||value.category
WHERE EXISTS (
  SELECT 1 FROM public.curriculum_scope_releases
  WHERE game='turkce' AND display_exam_ref='TYT'
    AND taxonomy_version='ba-tyt-turkce-v2'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.curriculum_outcomes (
  code,game,category,title,description,exam_ref,sort_order,is_active,node_id,
  taxonomy_version
)
SELECT value.code,'turkce',value.category,value.title,
  'Bilge Arena iç öğrenme grafiği leaf becerisidir; resmî müfredat kodu değildir.',
  'TYT',value.sort_order,true,node.id,'ba-tyt-turkce-v2'
FROM (VALUES
  ('TUR2-PAR-01','paragraf','Paragrafta anlam kurma becerisi',10),
  ('TUR2-DIL-01','dil_bilgisi','Dil bilgisi çözümleme becerisi',20),
  ('TUR2-YAZ-01','yazim_kurallari','Yazım ve noktalama becerisi',30),
  ('TUR2-SOZ-01','sozcuk','Sözcükte anlam becerisi',40),
  ('TUR2-ANL-01','anlam_bilgisi','Cümlede anlam becerisi',50)
) AS value(code,category,title,sort_order)
JOIN public.curriculum_nodes AS node
  ON node.code='ba-tyt-turkce-v2:outcome:'||value.category
WHERE EXISTS (
  SELECT 1 FROM public.curriculum_scope_releases
  WHERE game='turkce' AND display_exam_ref='TYT'
    AND taxonomy_version='ba-tyt-turkce-v2'
)
ON CONFLICT (code) DO NOTHING;

-- Refuse a partial/fresh install whose registry rows are missing. A later
-- taxonomy or an operator-retired scope is preserved and skipped on replay.
DO $fn$
BEGIN
  IF EXISTS (
    WITH expected(game, display_exam_ref) AS (
      VALUES ('turkce','TYT')
    )
    SELECT 1
    FROM expected
    LEFT JOIN public.curriculum_scope_releases AS scope
      ON scope.game = expected.game
     AND scope.display_exam_ref = expected.display_exam_ref
    WHERE scope.game IS NULL
  ) THEN
    RAISE EXCEPTION 'TYT Turkish registry foundation is missing'
      USING ERRCODE = '55000';
  END IF;
END
$fn$;

CREATE TEMP TABLE tyt_humanities_scope_release_control (
  game text PRIMARY KEY,
  display_exam_ref text NOT NULL,
  question_exam_ref text NOT NULL,
  taxonomy_version text NOT NULL,
  should_apply boolean NOT NULL,
  should_sync boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO tyt_humanities_scope_release_control (
  game, display_exam_ref, question_exam_ref, taxonomy_version, should_apply,
  should_sync
)
SELECT expected.game, expected.display_exam_ref, expected.question_exam_ref,
  expected.taxonomy_version,
  scope.question_exam_ref IS NOT DISTINCT FROM expected.question_exam_ref
    AND scope.taxonomy_version = expected.taxonomy_version
    AND scope.release_status IN ('draft','validating','released'),
  scope.question_exam_ref IS NOT DISTINCT FROM expected.question_exam_ref
    AND scope.taxonomy_version = expected.taxonomy_version
    AND scope.release_status IN ('draft','validating')
FROM (VALUES
  ('turkce','TYT','TYT','ba-tyt-turkce-v2')
) AS expected(game,display_exam_ref,question_exam_ref,taxonomy_version)
JOIN public.curriculum_scope_releases AS scope
  ON scope.game = expected.game
 AND scope.display_exam_ref = expected.display_exam_ref;

-- Do not expose the scope before the historical repair can be attributed from
-- immutable snapshots. Missing materialization markers are a separate recovery
-- workflow; snapshot-less or drifted answers require an explicit policy rather
-- than silently inheriting mutable current question metadata.
DO $fn$
DECLARE
  v_marker_gap integer;
  v_snapshot_gap integer;
BEGIN
  SELECT count(DISTINCT attempt.id)::integer INTO v_marker_gap
  FROM tyt_humanities_scope_release_control AS target
  JOIN public.verified_attempts AS attempt
    ON target.should_sync
   AND attempt.game = target.game
   AND attempt.completed_at IS NOT NULL
   AND attempt.session_id IS NOT NULL
  JOIN public.session_answers AS answer
    ON answer.session_id = attempt.session_id
   AND answer.user_id = attempt.user_id
  JOIN public.questions AS question
    ON question.id = answer.question_id
   AND question.game::text = target.game
   AND upper(btrim(COALESCE(question.exam_ref::text, ''))) = target.question_exam_ref
   AND question.is_active
  WHERE answer.question_id = ANY(attempt.question_ids)
    AND NOT COALESCE(answer.is_skipped, false)
    AND NOT EXISTS (
      SELECT 1 FROM public.mastery_materialized_attempts AS marker
      WHERE marker.attempt_id = attempt.id
    );

  SELECT count(*)::integer INTO v_snapshot_gap
  FROM tyt_humanities_scope_release_control AS target
  JOIN public.verified_attempts AS attempt
    ON target.should_sync
   AND attempt.game = target.game
   AND attempt.completed_at IS NOT NULL
   AND attempt.session_id IS NOT NULL
  JOIN public.mastery_materialized_attempts AS marker
    ON marker.attempt_id = attempt.id
  JOIN public.session_answers AS answer
    ON answer.session_id = attempt.session_id
   AND answer.user_id = attempt.user_id
  JOIN public.questions AS question
    ON question.id = answer.question_id
   AND question.game::text = target.game
   AND upper(btrim(COALESCE(question.exam_ref::text, ''))) = target.question_exam_ref
   AND question.is_active
  LEFT JOIN public.verified_attempt_question_revisions AS snapshot
    ON snapshot.attempt_id = attempt.id
   AND snapshot.question_id = answer.question_id
  WHERE answer.question_id = ANY(attempt.question_ids)
    AND NOT COALESCE(answer.is_skipped, false)
    AND (
      snapshot.question_id IS NULL
      OR answer.question_revision_id IS NULL
      OR snapshot.revision_id IS DISTINCT FROM answer.question_revision_id
      OR snapshot.game IS DISTINCT FROM target.game
      OR upper(btrim(COALESCE(snapshot.exam_ref, ''))) IS DISTINCT FROM target.question_exam_ref
      OR snapshot.category IS DISTINCT FROM question.category::text
    );

  IF v_marker_gap <> 0 OR v_snapshot_gap <> 0 THEN
    RAISE EXCEPTION 'TYT Turkish release blocked by historical mastery provenance: marker gaps %, snapshot gaps %',
      v_marker_gap, v_snapshot_gap USING ERRCODE = '23514';
  END IF;
END
$fn$;

DO $fn$
DECLARE
  v_expected integer;
  v_updated integer;
BEGIN
  SELECT count(*)::integer INTO v_expected
  FROM tyt_humanities_scope_release_control
  WHERE should_sync;

  UPDATE public.curriculum_scope_releases AS scope
  SET release_status = CASE WHEN scope.release_status = 'released' THEN 'released' ELSE 'validating' END,
      diagnostic_enabled = false,
      updated_at = clock_timestamp()
  FROM tyt_humanities_scope_release_control AS target
  WHERE target.should_sync
    AND scope.game = target.game
    AND scope.display_exam_ref = target.display_exam_ref
    AND scope.question_exam_ref IS NOT DISTINCT FROM target.question_exam_ref
    AND scope.taxonomy_version = target.taxonomy_version
    AND scope.release_status IN ('draft','validating','released');
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> v_expected THEN
    RAISE EXCEPTION 'TYT Turkish validating transition lost rows: expected %, updated %',
      v_expected, v_updated USING ERRCODE = '55000';
  END IF;
END
$fn$;

DO $fn$
DECLARE
  v_question record;
BEGIN
  FOR v_question IN
    SELECT question.id, question.game::text AS game,
      question.exam_ref::text AS exam_ref,
      question.category::text AS category, question.is_active
    FROM public.questions AS question
    JOIN tyt_humanities_scope_release_control AS target
      ON target.should_sync
     AND target.game = question.game::text
     AND target.question_exam_ref = upper(btrim(COALESCE(question.exam_ref::text, '')))
    WHERE question.is_active
    ORDER BY question.game, question.id
  LOOP
    PERFORM public.sync_taxonomy_auto_question_outcomes(
      v_question.id,
      v_question.game,
      v_question.exam_ref,
      v_question.category,
      v_question.is_active
    );
  END LOOP;
END
$fn$;

DO $fn$
DECLARE
  v_target record;
  v_integrity jsonb;
BEGIN
  FOR v_target IN
    SELECT * FROM tyt_humanities_scope_release_control
    WHERE should_apply
    ORDER BY game
  LOOP
    v_integrity := public.curriculum_scope_integrity(
      v_target.game, v_target.display_exam_ref, v_target.taxonomy_version
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
      RAISE EXCEPTION '%/% curriculum scope failed release integrity: %',
        v_target.game, v_target.display_exam_ref, v_integrity
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
END
$fn$;

UPDATE public.curriculum_scope_releases AS scope
SET release_status = 'released',
    diagnostic_enabled = false,
    released_at = COALESCE(scope.released_at, clock_timestamp()),
    updated_at = clock_timestamp()
FROM tyt_humanities_scope_release_control AS target
WHERE target.should_sync
  AND scope.game = target.game
  AND scope.display_exam_ref = target.display_exam_ref
  AND scope.question_exam_ref IS NOT DISTINCT FROM target.question_exam_ref
  AND scope.taxonomy_version = target.taxonomy_version
  AND scope.release_status IN ('validating','released');

DO $fn$
DECLARE
  v_target record;
  v_scope jsonb;
  v_registered record;
  v_split_trigger_count integer;
  v_row_trigger_count integer;
BEGIN
  FOR v_target IN
    SELECT * FROM tyt_humanities_scope_release_control
    WHERE should_apply
    ORDER BY game
  LOOP
    v_scope := public.resolve_released_curriculum_scope(
      v_target.game, v_target.display_exam_ref
    );
    IF v_scope IS NULL
      OR v_scope->>'game' <> v_target.game
      OR v_scope->>'displayExamRef' <> v_target.display_exam_ref
      OR v_scope->>'questionExamRef' <> v_target.question_exam_ref
      OR v_scope->>'taxonomyVersion' <> v_target.taxonomy_version
      OR v_scope->>'mappingMode' <> 'category_proxy'
      OR COALESCE((v_scope->>'diagnosticEnabled')::boolean, true) THEN
      RAISE EXCEPTION '%/% released scope resolver postcheck failed: %',
        v_target.game, v_target.display_exam_ref, v_scope
        USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_registered
    FROM public.resolve_question_curriculum_validation_scope(
      v_target.game, v_target.question_exam_ref
    );
    IF NOT FOUND
      OR v_registered.display_exam_ref IS DISTINCT FROM v_target.display_exam_ref
      OR v_registered.taxonomy_version IS DISTINCT FROM v_target.taxonomy_version
      OR v_registered.release_status IS DISTINCT FROM 'released' THEN
      RAISE EXCEPTION '%/% registered validation scope postcheck failed',
        v_target.game, v_target.display_exam_ref USING ERRCODE = '23514';
    END IF;
  END LOOP;

  SELECT count(*)::integer INTO v_split_trigger_count
  FROM pg_catalog.pg_trigger
  WHERE tgrelid IN ('public.questions'::regclass, 'public.question_outcomes'::regclass)
    AND tgname IN (
      'trg_questions_split_scope_integrity',
      'trg_question_outcomes_split_scope_integrity'
    )
    AND tgenabled <> 'D'
    AND tgdeferrable
    AND tginitdeferred;
  IF v_split_trigger_count <> 2 THEN
    RAISE EXCEPTION 'registered-scope deferred integrity triggers are not enabled'
      USING ERRCODE = '55000';
  END IF;

  SELECT count(*)::integer INTO v_row_trigger_count
  FROM pg_catalog.pg_trigger
  WHERE tgrelid = 'public.question_outcomes'::regclass
    AND tgname = 'trg_question_outcomes_split_scope_row_guard'
    AND tgenabled <> 'D'
    AND NOT tgdeferrable;
  IF v_row_trigger_count <> 1 THEN
    RAISE EXCEPTION 'registered-scope immediate mapping guard is not enabled'
      USING ERRCODE = '55000';
  END IF;
END
$fn$;

NOTIFY pgrst, 'reload schema';
COMMIT;
