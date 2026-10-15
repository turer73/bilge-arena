-- Catalog identity foundation only. No catalog seed, acceptance, release, or
-- question/student mutation. Existing four-level/category scope guards stay in place.
BEGIN;

CREATE TABLE IF NOT EXISTS public.curriculum_canonical_outcomes (
  canonical_id text PRIMARY KEY,
  program_key text NOT NULL CHECK (program_key ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  program_edition text NOT NULL CHECK (program_edition ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$'),
  grade smallint NOT NULL CHECK (grade BETWEEN 1 AND 12),
  exam_ref text NOT NULL CHECK (exam_ref ~ '^[A-Za-z0-9_-]{1,20}$'),
  game text NOT NULL CHECK (length(btrim(game)) BETWEEN 1 AND 20),
  official_code text NOT NULL CHECK (official_code ~ '^[A-Za-z0-9ÇĞİÖŞÜçğıöşü_.-]{1,80}$'),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 400),
  official_path jsonb NOT NULL,
  source_receipt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_key, program_edition, grade, exam_ref, official_code),
  CHECK (canonical_id = program_key || '@' || program_edition || ':grade'
    || grade::text || ':' || exam_ref || ':' || official_code),
  CHECK (jsonb_typeof(official_path) = 'array'
    AND jsonb_array_length(official_path) BETWEEN 2 AND 8),
  CHECK (jsonb_typeof(source_receipt) = 'object'
    AND source_receipt ?& ARRAY['reviewedCanonicalId', 'url', 'responseSha256',
      'pageTextSha256', 'pdfPage', 'extractor', 'extractorVersion', 'packageSha256']
    AND (source_receipt->>'reviewedCanonicalId') IS NOT NULL
    AND (source_receipt->>'url') ~ '^https://'
    AND (source_receipt->>'responseSha256') ~ '^[a-f0-9]{64}$'
    AND (source_receipt->>'pageTextSha256') ~ '^[a-f0-9]{64}$'
    AND (source_receipt->>'packageSha256') ~ '^[a-f0-9]{64}$'
    AND (source_receipt->>'pdfPage') ~ '^[1-9][0-9]*$'
    AND length(source_receipt->>'extractor') > 0
    AND length(source_receipt->>'extractorVersion') > 0
    AND NOT source_receipt @> '{"url":null}'::jsonb
    AND NOT source_receipt @> '{"responseSha256":null}'::jsonb
    AND NOT source_receipt @> '{"pageTextSha256":null}'::jsonb
    AND NOT source_receipt @> '{"packageSha256":null}'::jsonb
    AND NOT source_receipt @> '{"pdfPage":null}'::jsonb
    AND NOT source_receipt @> '{"extractor":null}'::jsonb
    AND NOT source_receipt @> '{"extractorVersion":null}'::jsonb)
);

CREATE TABLE IF NOT EXISTS public.curriculum_outcome_canonical_links (
  outcome_id uuid PRIMARY KEY REFERENCES public.curriculum_outcomes(id) ON DELETE RESTRICT,
  canonical_id text NOT NULL REFERENCES public.curriculum_canonical_outcomes(canonical_id) ON DELETE RESTRICT,
  taxonomy_version text NOT NULL CHECK (length(btrim(taxonomy_version)) BETWEEN 1 AND 80),
  package_sha256 text NOT NULL CHECK (package_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_curriculum_canonical_scope
  ON public.curriculum_canonical_outcomes (game, exam_ref);
CREATE INDEX IF NOT EXISTS idx_curriculum_canonical_links_target
  ON public.curriculum_outcome_canonical_links (canonical_id);

ALTER TABLE public.curriculum_canonical_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_outcome_canonical_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.curriculum_canonical_outcomes,
  public.curriculum_outcome_canonical_links FROM PUBLIC, anon, authenticated, service_role;
-- Import needs a separately reviewed owner transaction. Even service_role is read-only.
GRANT SELECT ON public.curriculum_canonical_outcomes,
  public.curriculum_outcome_canonical_links TO service_role;
DROP POLICY IF EXISTS canonical_outcomes_service_read ON public.curriculum_canonical_outcomes;
CREATE POLICY canonical_outcomes_service_read ON public.curriculum_canonical_outcomes
  FOR SELECT TO service_role USING (true);
DROP POLICY IF EXISTS canonical_links_service_read ON public.curriculum_outcome_canonical_links;
CREATE POLICY canonical_links_service_read ON public.curriculum_outcome_canonical_links
  FOR SELECT TO service_role USING (true);

CREATE OR REPLACE FUNCTION public.guard_curriculum_canonical_record()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
  v_part jsonb;
  v_index integer := 0;
  v_length integer;
  v_legacy public.curriculum_outcomes%ROWTYPE;
  v_canonical public.curriculum_canonical_outcomes%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Canonical catalog records are immutable; a reviewed replacement is required'
      USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'curriculum_canonical_outcomes' THEN
    IF jsonb_typeof(NEW.official_path) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Official path must be an array' USING ERRCODE = '23514';
    END IF;
    v_length := jsonb_array_length(NEW.official_path);
    FOR v_part IN SELECT value FROM jsonb_array_elements(NEW.official_path) LOOP
      IF jsonb_typeof(v_part) IS DISTINCT FROM 'object'
        OR coalesce(length(btrim(v_part->>'title')), 0) NOT BETWEEN 1 AND 400
        OR (v_part->>'nodeType') IS NULL
        OR (v_index = 0 AND v_part->>'nodeType' <> 'course')
        OR (v_index = v_length - 1 AND
          (v_part->>'nodeType' <> 'outcome'
           OR (v_part->>'officialCode') IS DISTINCT FROM NEW.official_code
           OR (v_part->>'title') IS DISTINCT FROM NEW.title))
        OR (v_index > 0 AND v_index < v_length - 1
          AND v_part->>'nodeType' NOT IN ('unit', 'topic', 'learning_area', 'language_skill'))
        OR v_part ? 'isInternalBridge'
      THEN
        RAISE EXCEPTION 'Invalid canonical program path' USING ERRCODE = '23514';
      END IF;
      v_index := v_index + 1;
    END LOOP;
    RETURN NEW;
  END IF;
  SELECT * INTO v_legacy FROM public.curriculum_outcomes
    WHERE id = NEW.outcome_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown legacy outcome' USING ERRCODE = '23503';
  END IF;
  SELECT * INTO v_canonical FROM public.curriculum_canonical_outcomes
    WHERE canonical_id = NEW.canonical_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown canonical outcome' USING ERRCODE = '23503';
  END IF;
  IF v_legacy.game IS DISTINCT FROM v_canonical.game
    OR v_legacy.exam_ref IS DISTINCT FROM v_canonical.exam_ref
    OR v_legacy.title IS DISTINCT FROM v_canonical.title
    OR v_legacy.taxonomy_version IS DISTINCT FROM NEW.taxonomy_version
  THEN
    RAISE EXCEPTION 'Canonical link scope mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_curriculum_canonical_record() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_curriculum_canonical_record ON public.curriculum_canonical_outcomes;
CREATE TRIGGER trg_curriculum_canonical_record BEFORE INSERT OR UPDATE OR DELETE
  ON public.curriculum_canonical_outcomes FOR EACH ROW
  EXECUTE FUNCTION public.guard_curriculum_canonical_record();
DROP TRIGGER IF EXISTS trg_curriculum_canonical_link ON public.curriculum_outcome_canonical_links;
CREATE TRIGGER trg_curriculum_canonical_link BEFORE INSERT OR UPDATE OR DELETE
  ON public.curriculum_outcome_canonical_links FOR EACH ROW
  EXECUTE FUNCTION public.guard_curriculum_canonical_record();

-- Preparation/admin reader, NOT mastery, discovery readiness, or publication acceptance.
-- Each call rechecks legacy scope: an old link cannot conceal later taxonomy drift.
CREATE OR REPLACE FUNCTION public.read_canonical_curriculum_catalog(
  p_game text, p_exam_ref text, p_taxonomy_version text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
  v_count integer;
  v_invalid uuid[];
  v_items jsonb;
BEGIN
  IF coalesce(length(btrim(p_game)), 0) = 0
    OR coalesce(length(btrim(p_exam_ref)), 0) = 0
    OR coalesce(length(btrim(p_taxonomy_version)), 0) = 0
  THEN
    RAISE EXCEPTION 'Explicit game, exam, and taxonomy are required' USING ERRCODE = '22023';
  END IF;
  SELECT count(*)::integer,
    coalesce(array_agg(o.id ORDER BY o.id) FILTER (WHERE
      c.canonical_id IS NULL OR c.game IS DISTINCT FROM o.game
      OR c.exam_ref IS DISTINCT FROM o.exam_ref
      OR c.title IS DISTINCT FROM o.title
      OR l.taxonomy_version IS DISTINCT FROM o.taxonomy_version
      OR public.curriculum_outcome_scope_valid(o.id, o.game, o.category, o.exam_ref) IS NOT TRUE
    ), '{}'::uuid[])
  INTO v_count, v_invalid
  FROM public.curriculum_outcomes o
  LEFT JOIN public.curriculum_outcome_canonical_links l ON l.outcome_id = o.id
  LEFT JOIN public.curriculum_canonical_outcomes c ON c.canonical_id = l.canonical_id
  WHERE o.game = p_game AND o.exam_ref = p_exam_ref
    AND o.taxonomy_version = p_taxonomy_version AND o.is_active;

  IF v_count = 0 OR cardinality(v_invalid) > 0 THEN
    RETURN jsonb_build_object('catalogStatus', CASE WHEN v_count = 0 THEN 'empty' ELSE 'incomplete' END,
      'legacyOutcomeCount', v_count, 'canonicalOutcomeCount', 0,
      'invalidOutcomeIds', to_jsonb(v_invalid), 'items', '[]'::jsonb,
      'learnerReady', false, 'publicationAuthorized', false);
  END IF;

  SELECT coalesce(jsonb_agg(item ORDER BY canonical_id), '[]'::jsonb) INTO v_items
  FROM (
    SELECT c.canonical_id, jsonb_build_object(
      'canonicalId', c.canonical_id, 'programKey', c.program_key,
      'programEdition', c.program_edition, 'grade', c.grade,
      'officialCode', c.official_code, 'title', c.title, 'path', c.official_path,
      'aliases', jsonb_agg(jsonb_build_object('id', o.id, 'code', o.code,
        'category', o.category) ORDER BY o.code, o.id)
    ) AS item
    FROM public.curriculum_outcomes o
    JOIN public.curriculum_outcome_canonical_links l ON l.outcome_id = o.id
    JOIN public.curriculum_canonical_outcomes c ON c.canonical_id = l.canonical_id
    WHERE o.game = p_game AND o.exam_ref = p_exam_ref
      AND o.taxonomy_version = p_taxonomy_version AND o.is_active
    GROUP BY c.canonical_id
  ) grouped;
  RETURN jsonb_build_object('catalogStatus', 'complete', 'legacyOutcomeCount', v_count,
    'canonicalOutcomeCount', jsonb_array_length(v_items), 'invalidOutcomeIds', '[]'::jsonb,
    'items', v_items, 'learnerReady', false, 'publicationAuthorized', false);
END;
$$;
REVOKE ALL ON FUNCTION public.read_canonical_curriculum_catalog(text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_canonical_curriculum_catalog(text, text, text) TO service_role;
-- The invoker calls the existing boolean guard, not a copied/weakened version.
-- Its definition stays unchanged; only the server role gets this read capability.
GRANT EXECUTE ON FUNCTION public.curriculum_outcome_scope_valid(uuid, text, text, text) TO service_role;

COMMENT ON TABLE public.curriculum_canonical_outcomes IS
  'Edition-based identities with reviewed PDF provenance. Registration is not curriculum acceptance.';
COMMENT ON FUNCTION public.read_canonical_curriculum_catalog(text, text, text) IS
  'Service-only structural catalog reader. Never authorizes mastery, source acceptance, or publication.';
COMMIT;
