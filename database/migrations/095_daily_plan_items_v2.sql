-- Migration 095: atomic V2 daily-plan item snapshots.
--
-- Rollback (after callers have returned to the legacy question_ids path):
--   REVOKE ALL ON FUNCTION public.create_daily_plan_v2(uuid,text,date,text,jsonb),
--     public.complete_daily_plan_items(uuid,uuid,uuid[]) FROM PUBLIC, anon, authenticated, service_role;
--   DROP FUNCTION IF EXISTS public.complete_daily_plan_items(uuid,uuid,uuid[]);
--   DROP FUNCTION IF EXISTS public.create_daily_plan_v2(uuid,text,date,text,jsonb);
--   DROP TABLE IF EXISTS public.daily_plan_items;
-- Legacy daily_plan.question_ids/completed_ids are intentionally retained.

BEGIN;

CREATE TABLE IF NOT EXISTS public.daily_plan_items (
  plan_id uuid NOT NULL REFERENCES public.daily_plan(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 15),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  slot_type text NOT NULL CHECK (slot_type IN ('due','weak_outcome','current_target','challenge','student_choice')),
  source_type text NOT NULL CHECK (source_type IN ('due','weak_outcome','current_target','challenge','student_choice','fresh','legacy')),
  source_ref text CHECK (source_ref IS NULL OR char_length(source_ref) BETWEEN 1 AND 200),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (plan_id, position),
  UNIQUE (plan_id, question_id)
);

ALTER TABLE public.daily_plan_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.daily_plan_items FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.daily_plan_items FROM service_role;
GRANT SELECT ON TABLE public.daily_plan_items TO service_role;

CREATE OR REPLACE FUNCTION public.create_daily_plan_v2(
  p_user_id uuid,
  p_game text,
  p_plan_date date,
  p_exam_ref text,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_plan_id uuid;
  v_count integer;
  v_payload jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id required' USING ERRCODE='42501';
  END IF;
  IF p_game IS NULL OR char_length(trim(p_game)) NOT BETWEEN 1 AND 20
    OR p_plan_date IS NULL OR (p_exam_ref IS NOT NULL AND char_length(p_exam_ref) > 10) THEN
    RAISE EXCEPTION 'invalid daily plan identity' USING ERRCODE='22023';
  END IF;

  -- A prior legacy or V2 snapshot always wins. It is never overwritten by a
  -- replay with a different item payload.
  SELECT dp.id INTO v_plan_id
  FROM public.daily_plan dp
  WHERE dp.user_id=p_user_id AND dp.game=p_game AND dp.plan_date=p_plan_date
    AND dp.exam_ref IS NOT DISTINCT FROM p_exam_ref
  FOR UPDATE;
  IF FOUND THEN
    SELECT jsonb_build_object(
      'planId',dp.id,'game',dp.game,'planDate',dp.plan_date,'examRef',dp.exam_ref,
      'questionIds',to_jsonb(dp.question_ids),'completedIds',to_jsonb(dp.completed_ids),
      'items',COALESCE(i.items,'[]'::jsonb)
    ) INTO v_payload
    FROM public.daily_plan dp
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'questionId',dpi.question_id,'position',dpi.position,'slotType',dpi.slot_type,
        'sourceType',dpi.source_type,'completed',dpi.completed_at IS NOT NULL
      ) ORDER BY dpi.position) AS items
      FROM public.daily_plan_items dpi WHERE dpi.plan_id=dp.id
    ) i ON true
    WHERE dp.id=v_plan_id;
    RETURN v_payload;
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
    OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 15 THEN
    RAISE EXCEPTION 'items must be a 1..15 element array' USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) e(item)
    WHERE jsonb_typeof(e.item) <> 'object'
      OR jsonb_typeof(e.item->'position') IS DISTINCT FROM 'number'
      OR (e.item->>'position') !~ '^(?:[1-9]|1[0-5])$'
      OR jsonb_typeof(e.item->'question_id') IS DISTINCT FROM 'string'
      OR (e.item->>'question_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR jsonb_typeof(e.item->'slot_type') IS DISTINCT FROM 'string'
      OR (e.item->>'slot_type') NOT IN ('due','weak_outcome','current_target','challenge','student_choice')
      OR jsonb_typeof(e.item->'source_type') IS DISTINCT FROM 'string'
      OR (e.item->>'source_type') NOT IN ('due','weak_outcome','current_target','challenge','student_choice','fresh','legacy')
      OR (e.item ? 'source_ref' AND jsonb_typeof(e.item->'source_ref') NOT IN ('string','null'))
      OR (jsonb_typeof(e.item->'source_ref')='string' AND char_length(e.item->>'source_ref') NOT BETWEEN 1 AND 200)
  ) THEN
    RAISE EXCEPTION 'invalid daily plan item' USING ERRCODE='22023';
  END IF;

  WITH parsed AS (
    SELECT (e.item->>'position')::smallint AS position, (e.item->>'question_id')::uuid AS question_id
    FROM jsonb_array_elements(p_items) e(item)
  ) SELECT count(*) INTO v_count FROM parsed;
  IF EXISTS (
    WITH parsed AS (
      SELECT (e.item->>'position')::smallint AS position, (e.item->>'question_id')::uuid AS question_id
      FROM jsonb_array_elements(p_items) e(item)
    ) SELECT 1 FROM parsed GROUP BY position HAVING count(*) > 1
  ) OR EXISTS (
    WITH parsed AS (
      SELECT (e.item->>'position')::smallint AS position, (e.item->>'question_id')::uuid AS question_id
      FROM jsonb_array_elements(p_items) e(item)
    ) SELECT 1 FROM parsed GROUP BY question_id HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM generate_series(1,v_count) expected(position)
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_items) e(item)
      WHERE (e.item->>'position')::integer=expected.position
    )
  ) THEN
    RAISE EXCEPTION 'positions and question ids must be unique and contiguous' USING ERRCODE='22023';
  END IF;

  IF (SELECT count(*) FROM (
    SELECT (e.item->>'question_id')::uuid AS question_id
    FROM jsonb_array_elements(p_items) e(item)
  ) parsed JOIN public.questions q ON q.id=parsed.question_id
    WHERE q.game=p_game AND q.exam_ref IS NOT DISTINCT FROM p_exam_ref) <> v_count THEN
    RAISE EXCEPTION 'item question does not match plan game or exam ref' USING ERRCODE='22023';
  END IF;

  BEGIN
    INSERT INTO public.daily_plan(user_id,game,plan_date,exam_ref,question_ids,completed_ids)
    SELECT p_user_id,p_game,p_plan_date,p_exam_ref,
      array_agg((e.item->>'question_id')::uuid ORDER BY (e.item->>'position')::smallint),
      '{}'::uuid[]
    FROM jsonb_array_elements(p_items) e(item)
    RETURNING id INTO v_plan_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT dp.id INTO v_plan_id
    FROM public.daily_plan dp
    WHERE dp.user_id=p_user_id AND dp.game=p_game AND dp.plan_date=p_plan_date
      AND dp.exam_ref IS NOT DISTINCT FROM p_exam_ref
    FOR UPDATE;
    IF NOT FOUND THEN RAISE; END IF;
    SELECT jsonb_build_object(
      'planId',dp.id,'game',dp.game,'planDate',dp.plan_date,'examRef',dp.exam_ref,
      'questionIds',to_jsonb(dp.question_ids),'completedIds',to_jsonb(dp.completed_ids),
      'items',COALESCE(i.items,'[]'::jsonb)
    ) INTO v_payload
    FROM public.daily_plan dp
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'questionId',dpi.question_id,'position',dpi.position,'slotType',dpi.slot_type,
        'sourceType',dpi.source_type,'completed',dpi.completed_at IS NOT NULL
      ) ORDER BY dpi.position) AS items
      FROM public.daily_plan_items dpi WHERE dpi.plan_id=dp.id
    ) i ON true
    WHERE dp.id=v_plan_id;
    RETURN v_payload;
  END;

  INSERT INTO public.daily_plan_items(plan_id,position,question_id,slot_type,source_type,source_ref)
  SELECT v_plan_id,(e.item->>'position')::smallint,(e.item->>'question_id')::uuid,
    e.item->>'slot_type',e.item->>'source_type',NULLIF(e.item->>'source_ref','')
  FROM jsonb_array_elements(p_items) e(item);

  SELECT jsonb_build_object(
    'planId',dp.id,'game',dp.game,'planDate',dp.plan_date,'examRef',dp.exam_ref,
    'questionIds',to_jsonb(dp.question_ids),'completedIds',to_jsonb(dp.completed_ids),
    'items',COALESCE(i.items,'[]'::jsonb)
  ) INTO v_payload
  FROM public.daily_plan dp
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'questionId',dpi.question_id,'position',dpi.position,'slotType',dpi.slot_type,
      'sourceType',dpi.source_type,'completed',dpi.completed_at IS NOT NULL
    ) ORDER BY dpi.position) AS items
    FROM public.daily_plan_items dpi WHERE dpi.plan_id=dp.id
  ) i ON true
  WHERE dp.id=v_plan_id;
  RETURN v_payload;
END $fn$;

CREATE OR REPLACE FUNCTION public.complete_daily_plan_items(
  p_user_id uuid,
  p_plan_id uuid,
  p_question_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_owner uuid;
  v_completed uuid[];
  v_payload jsonb;
BEGIN
  SELECT user_id INTO v_owner FROM public.daily_plan WHERE id=p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'daily plan not found' USING ERRCODE='P0002'; END IF;
  IF p_user_id IS NULL OR v_owner IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'daily plan owner mismatch' USING ERRCODE='42501';
  END IF;

  -- Legacy plans deliberately have no V2 items. The parent row is locked
  -- above, so compute their completion union inside this transaction rather
  -- than making callers perform a read/merge/write race. Keep the serialized
  -- array in the plan's original question_ids order and silently ignore IDs
  -- that do not belong to the plan.
  IF EXISTS (SELECT 1 FROM public.daily_plan_items WHERE plan_id=p_plan_id) THEN
    UPDATE public.daily_plan_items
    SET completed_at=COALESCE(completed_at,clock_timestamp())
    WHERE plan_id=p_plan_id
      AND question_id=ANY(COALESCE(p_question_ids,'{}'::uuid[]));
    SELECT COALESCE(array_agg(question_id ORDER BY position) FILTER (WHERE completed_at IS NOT NULL),'{}'::uuid[])
      INTO v_completed FROM public.daily_plan_items WHERE plan_id=p_plan_id;
    UPDATE public.daily_plan SET completed_ids=v_completed WHERE id=p_plan_id;
  ELSE
    UPDATE public.daily_plan dp
    SET completed_ids=COALESCE((
      SELECT array_agg(q.question_id ORDER BY q.position)
      FROM unnest(dp.question_ids) WITH ORDINALITY AS q(question_id,position)
      WHERE q.question_id=ANY(COALESCE(dp.completed_ids,'{}'::uuid[]))
         OR q.question_id=ANY(COALESCE(p_question_ids,'{}'::uuid[]))
    ),'{}'::uuid[])
    WHERE dp.id=p_plan_id;
  END IF;

  SELECT jsonb_build_object(
    'planId',dp.id,'game',dp.game,'planDate',dp.plan_date,'examRef',dp.exam_ref,
    'questionIds',to_jsonb(dp.question_ids),'completedIds',to_jsonb(dp.completed_ids),
    'items',COALESCE(i.items,'[]'::jsonb)
  ) INTO v_payload
  FROM public.daily_plan dp
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'questionId',dpi.question_id,'position',dpi.position,'slotType',dpi.slot_type,
      'sourceType',dpi.source_type,'completed',dpi.completed_at IS NOT NULL
    ) ORDER BY dpi.position) AS items
    FROM public.daily_plan_items dpi WHERE dpi.plan_id=dp.id
  ) i ON true
  WHERE dp.id=p_plan_id;
  RETURN v_payload;
END $fn$;

REVOKE ALL ON FUNCTION public.create_daily_plan_v2(uuid,text,date,text,jsonb),
  public.complete_daily_plan_items(uuid,uuid,uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_daily_plan_v2(uuid,text,date,text,jsonb),
  public.complete_daily_plan_items(uuid,uuid,uuid[]) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
