BEGIN;

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated, service_role;

-- Migration 106 created immutable legacy revisions but did not copy their
-- existing outcome evidence. Backfill only complete, publishable legacy sets:
-- one to five unique active outcomes and exactly one primary outcome.
WITH valid_legacy_questions AS (
  SELECT qo.question_id
  FROM public.question_outcomes qo
  JOIN public.curriculum_outcomes co ON co.id = qo.outcome_id AND co.is_active
  GROUP BY qo.question_id
  HAVING count(*) BETWEEN 1 AND 5
     AND count(*) FILTER (WHERE qo.is_primary) = 1
     AND bool_and(qo.weight <= 1)
     AND count(*) = (
       SELECT count(*)
       FROM public.question_outcomes all_qo
       WHERE all_qo.question_id = qo.question_id
     )
)
INSERT INTO public.question_revision_outcomes(revision_id, outcome_id, weight, is_primary)
SELECT q.published_revision_id, qo.outcome_id, qo.weight, qo.is_primary
FROM valid_legacy_questions valid
JOIN public.questions q ON q.id = valid.question_id AND q.published_revision_id IS NOT NULL
JOIN public.question_content_revisions r
  ON r.id = q.published_revision_id
 AND r.question_id = q.id
 AND r.status = 'published'
JOIN public.question_outcomes qo ON qo.question_id = q.id
ON CONFLICT (revision_id, outcome_id) DO NOTHING;

-- Preserve the 106 validator as the single source of truth for every existing
-- content, metadata, source and outcome rule. The wrapper below only widens the
-- content envelope with a strictly validated curated coach object.
DO $migration$
BEGIN
  IF pg_catalog.to_regprocedure('app_private.content_governance_validate_payload_base_v106(jsonb)') IS NULL THEN
    IF pg_catalog.to_regprocedure('public.content_governance_validate_payload(jsonb)') IS NULL THEN
      RAISE EXCEPTION '110 requires content_governance_validate_payload(jsonb) from migration 106';
    END IF;
    ALTER FUNCTION public.content_governance_validate_payload(jsonb) SET SCHEMA app_private;
    ALTER FUNCTION app_private.content_governance_validate_payload(jsonb)
      RENAME TO content_governance_validate_payload_base_v106;
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.content_governance_validate_payload(p_payload jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_content jsonb;
  v_coach jsonb;
  v_misconceptions jsonb;
  v_answer integer;
  v_base_payload jsonb;
  v_coach_text text;
BEGIN
  IF jsonb_typeof(p_payload) <> 'object' OR jsonb_typeof(p_payload->'content') <> 'object' THEN
    RETURN false;
  END IF;

  v_content := p_payload->'content';
  v_base_payload := jsonb_set(p_payload, '{content}', v_content - 'coach', false);
  IF NOT app_private.content_governance_validate_payload_base_v106(v_base_payload) THEN
    RETURN false;
  END IF;

  IF NOT (v_content ? 'coach') THEN
    RETURN true;
  END IF;

  v_coach := v_content->'coach';
  IF jsonb_typeof(v_coach) <> 'object'
    OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_coach) key)
       IS DISTINCT FROM ARRAY['hint1','hint2','miniExample','misconceptions']
    OR jsonb_typeof(v_coach->'hint1') <> 'string'
    OR jsonb_typeof(v_coach->'hint2') <> 'string'
    OR jsonb_typeof(v_coach->'miniExample') <> 'string'
    OR char_length(btrim(v_coach->>'hint1')) NOT BETWEEN 1 AND 700
    OR char_length(btrim(v_coach->>'hint2')) NOT BETWEEN 1 AND 700
    OR char_length(btrim(v_coach->>'miniExample')) NOT BETWEEN 1 AND 700
    OR jsonb_typeof(v_coach->'misconceptions') <> 'array' THEN
    RETURN false;
  END IF;

  v_answer := (v_content->>'answer')::integer;
  v_misconceptions := v_coach->'misconceptions';
  IF jsonb_array_length(v_misconceptions) <> jsonb_array_length(v_content->'options')
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_misconceptions) WITH ORDINALITY AS item(value, position)
      WHERE CASE
        WHEN position - 1 = v_answer THEN jsonb_typeof(value) <> 'null'
        ELSE jsonb_typeof(value) <> 'string'
          OR char_length(btrim(value #>> '{}')) NOT BETWEEN 1 AND 1000
      END
    ) THEN
    RETURN false;
  END IF;

  SELECT concat_ws(
    ' ',
    v_coach->>'hint1',
    v_coach->>'hint2',
    v_coach->>'miniExample',
    (SELECT string_agg(COALESCE(value #>> '{}', ''), ' ')
       FROM jsonb_array_elements(v_misconceptions))
  )
  INTO v_coach_text;

  IF v_coach_text ~* '<[[:space:]]*/?[[:space:]]*(script|iframe|style)([[:space:]>]|$)'
    OR v_coach_text ~* '(^|[^[:alnum:]_])(system prompt|api key|service[ _-]?role|deepseek_api_key|supabase_service_role_key)([^[:alnum:]_]|$)' THEN
    RETURN false;
  END IF;

  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$fn$;

REVOKE ALL ON FUNCTION app_private.content_governance_validate_payload_base_v106(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.content_governance_validate_payload(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
