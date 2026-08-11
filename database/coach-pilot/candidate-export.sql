-- Read-only, text-free eligibility export for the curated coach pilot.
-- The result intentionally contains no question, option, answer or solution text.
WITH eligible AS (
  SELECT
    q.id::text AS "questionId",
    r.id::text AS "revisionId",
    r.content_sha256 AS "contentSha256",
    r.game AS game,
    r.category AS category,
    r.difficulty::integer AS difficulty,
    r.exam_ref AS "examRef",
    jsonb_array_length(r.content->'options') AS "optionCount"
  FROM public.questions q
  JOIN public.question_content_revisions r
    ON r.id = q.published_revision_id
   AND r.question_id = q.id
   AND r.status = 'published'
  WHERE q.is_active
    AND jsonb_typeof(r.content) = 'object'
    AND jsonb_typeof(r.content->'question') = 'string'
    AND char_length(btrim(r.content->>'question')) > 0
    AND jsonb_typeof(r.content->'solution') = 'string'
    AND char_length(btrim(r.content->>'solution')) > 0
    AND jsonb_typeof(r.content->'options') = 'array'
    AND jsonb_array_length(r.content->'options') BETWEEN 2 AND 5
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(r.content->'options') option
      WHERE jsonb_typeof(option) <> 'string'
         OR char_length(btrim(option #>> '{}')) = 0
    )
    AND jsonb_typeof(r.content->'answer') = 'number'
    AND (r.content->>'answer') ~ '^[0-4]$'
    AND (r.content->>'answer')::integer < jsonb_array_length(r.content->'options')
    AND (
      SELECT count(*)
      FROM public.question_outcomes qo
      JOIN public.curriculum_outcomes co ON co.id = qo.outcome_id AND co.is_active
      WHERE qo.question_id = q.id
        AND qo.is_primary
        AND char_length(btrim(co.title)) > 0
    ) = 1
    AND (
      SELECT count(*)
      FROM public.question_outcomes qo
      WHERE qo.question_id = q.id
    ) BETWEEN 1 AND 5
    AND NOT EXISTS (
      SELECT 1
      FROM public.question_outcomes qo
      WHERE qo.question_id = q.id
        AND qo.weight > 1
    )
    AND (
      SELECT count(*)
      FROM public.question_outcomes qo
      JOIN public.curriculum_outcomes co ON co.id = qo.outcome_id AND co.is_active
      WHERE qo.question_id = q.id
    ) = (
      SELECT count(*)
      FROM public.question_outcomes qo
      WHERE qo.question_id = q.id
    )
    AND NOT COALESCE((
      jsonb_typeof(r.content->'coach') = 'object'
      AND (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(r.content->'coach') key)
          = ARRAY['hint1','hint2','miniExample','misconceptions']
      AND jsonb_typeof(r.content->'coach'->'hint1') = 'string'
      AND char_length(btrim(r.content->'coach'->>'hint1')) > 0
      AND jsonb_typeof(r.content->'coach'->'hint2') = 'string'
      AND char_length(btrim(r.content->'coach'->>'hint2')) > 0
      AND jsonb_typeof(r.content->'coach'->'miniExample') = 'string'
      AND char_length(btrim(r.content->'coach'->>'miniExample')) > 0
      AND jsonb_typeof(r.content->'coach'->'misconceptions') = 'array'
      AND jsonb_array_length(r.content->'coach'->'misconceptions') = jsonb_array_length(r.content->'options')
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(r.content->'coach'->'misconceptions')
          WITH ORDINALITY AS misconception(value, position)
        WHERE CASE
          WHEN position - 1 = (r.content->>'answer')::integer THEN jsonb_typeof(value) <> 'null'
          ELSE jsonb_typeof(value) <> 'string' OR char_length(btrim(value #>> '{}')) = 0
        END
      )
    ), false)
)
SELECT *
FROM eligible
ORDER BY "questionId", "revisionId";
