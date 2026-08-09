-- Migration 096: internal TYT Mathematics curriculum graph v1.
--
-- Rollback (after all readers have stopped depending on the graph):
--   DROP TRIGGER IF EXISTS trg_sync_taxonomy_auto_question_outcomes ON public.questions;
--   DROP FUNCTION IF EXISTS public.trg_sync_taxonomy_auto_question_outcomes();
--   DROP FUNCTION IF EXISTS public.sync_taxonomy_auto_question_outcomes(uuid,text,text,text,boolean);
--   DROP FUNCTION IF EXISTS public.curriculum_graph_integrity();
--   DROP FUNCTION IF EXISTS public.curriculum_outcome_node_guard();
--   DROP FUNCTION IF EXISTS public.curriculum_node_parent_guard();
--   ALTER TABLE public.question_outcomes DROP COLUMN IF EXISTS mapping_source;
--   ALTER TABLE public.curriculum_outcomes DROP COLUMN IF EXISTS node_id,
--     DROP COLUMN IF EXISTS taxonomy_version;
--   DROP TABLE IF EXISTS public.curriculum_nodes;
-- Do not delete curriculum_outcomes/question_outcomes or historical evidence;
-- they predate this graph and require a separately reviewed data migration.

BEGIN;

CREATE TABLE IF NOT EXISTS public.curriculum_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (char_length(code) BETWEEN 1 AND 100),
  taxonomy_version text NOT NULL CHECK (char_length(taxonomy_version) BETWEEN 1 AND 80),
  game text NOT NULL CHECK (char_length(game) BETWEEN 1 AND 20),
  exam_ref text,
  node_type text NOT NULL CHECK (node_type IN ('course','unit','topic','outcome')),
  parent_id uuid REFERENCES public.curriculum_nodes(id) ON DELETE RESTRICT,
  category text,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS curriculum_nodes_scope_parent_order_idx
  ON public.curriculum_nodes (game, exam_ref, taxonomy_version, parent_id, sort_order);

ALTER TABLE public.curriculum_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_outcomes ADD COLUMN IF NOT EXISTS node_id uuid;
ALTER TABLE public.curriculum_outcomes ADD COLUMN IF NOT EXISTS taxonomy_version text;
ALTER TABLE public.curriculum_outcomes DROP CONSTRAINT IF EXISTS curriculum_outcomes_node_id_fkey;
ALTER TABLE public.curriculum_outcomes ADD CONSTRAINT curriculum_outcomes_node_id_fkey
  FOREIGN KEY (node_id) REFERENCES public.curriculum_nodes(id) ON DELETE RESTRICT;
ALTER TABLE public.question_outcomes ADD COLUMN IF NOT EXISTS mapping_source text NOT NULL DEFAULT 'manual';
ALTER TABLE public.question_outcomes DROP CONSTRAINT IF EXISTS question_outcomes_mapping_source_check;
ALTER TABLE public.question_outcomes ADD CONSTRAINT question_outcomes_mapping_source_check
  CHECK (mapping_source IN ('manual','taxonomy_auto'));
CREATE INDEX IF NOT EXISTS question_outcomes_taxonomy_auto_idx
  ON public.question_outcomes (question_id, outcome_id) WHERE mapping_source='taxonomy_auto';

ALTER TABLE public.curriculum_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_outcomes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.curriculum_nodes, public.curriculum_outcomes, public.question_outcomes
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.curriculum_nodes, public.curriculum_outcomes, public.question_outcomes FROM service_role;
GRANT SELECT ON TABLE public.curriculum_nodes, public.curriculum_outcomes, public.question_outcomes TO service_role;

CREATE OR REPLACE FUNCTION public.curriculum_node_parent_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_parent public.curriculum_nodes%ROWTYPE;
  v_expected_parent_type text;
BEGIN
  IF NEW.node_type='course' THEN
    IF NEW.parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'course nodes cannot have a parent' USING ERRCODE='22023';
    END IF;
  ELSE
    v_expected_parent_type := CASE NEW.node_type
      WHEN 'unit' THEN 'course'
      WHEN 'topic' THEN 'unit'
      WHEN 'outcome' THEN 'topic'
    END;
    IF NEW.parent_id IS NULL THEN
      RAISE EXCEPTION '% nodes require a % parent', NEW.node_type, v_expected_parent_type USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_parent FROM public.curriculum_nodes WHERE id=NEW.parent_id;
    IF NOT FOUND
      OR v_parent.node_type IS DISTINCT FROM v_expected_parent_type
      OR v_parent.game IS DISTINCT FROM NEW.game
      OR v_parent.exam_ref IS DISTINCT FROM NEW.exam_ref
      OR v_parent.taxonomy_version IS DISTINCT FROM NEW.taxonomy_version THEN
      RAISE EXCEPTION 'curriculum node parent must be the preceding level in the same scope' USING ERRCODE='22023';
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.curriculum_nodes child
    WHERE child.parent_id=NEW.id
      AND (NEW.node_type IS DISTINCT FROM CASE child.node_type
        WHEN 'unit' THEN 'course' WHEN 'topic' THEN 'unit' WHEN 'outcome' THEN 'topic' END
        OR child.game IS DISTINCT FROM NEW.game
        OR child.exam_ref IS DISTINCT FROM NEW.exam_ref
        OR child.taxonomy_version IS DISTINCT FROM NEW.taxonomy_version)
  ) THEN
    RAISE EXCEPTION 'curriculum node update would invalidate an existing child scope' USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.curriculum_outcomes outcome
    WHERE outcome.node_id=NEW.id
      AND (NEW.node_type <> 'outcome'
        OR outcome.game IS DISTINCT FROM NEW.game
        OR outcome.exam_ref IS DISTINCT FROM NEW.exam_ref
        OR outcome.taxonomy_version IS DISTINCT FROM NEW.taxonomy_version)
  ) THEN
    RAISE EXCEPTION 'curriculum node update would invalidate an existing outcome' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_curriculum_node_parent_guard ON public.curriculum_nodes;
CREATE TRIGGER trg_curriculum_node_parent_guard
  BEFORE INSERT OR UPDATE OF node_type, parent_id, game, exam_ref, taxonomy_version
  ON public.curriculum_nodes
  FOR EACH ROW EXECUTE FUNCTION public.curriculum_node_parent_guard();

CREATE OR REPLACE FUNCTION public.curriculum_outcome_node_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_node public.curriculum_nodes%ROWTYPE;
BEGIN
  IF (NEW.node_id IS NULL) <> (NEW.taxonomy_version IS NULL) THEN
    RAISE EXCEPTION 'outcome node and taxonomy version must be set together' USING ERRCODE='22023';
  END IF;
  IF NEW.node_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_node FROM public.curriculum_nodes WHERE id=NEW.node_id;
  IF NOT FOUND
    OR v_node.node_type <> 'outcome'
    OR v_node.game IS DISTINCT FROM NEW.game
    OR v_node.exam_ref IS DISTINCT FROM NEW.exam_ref
    OR v_node.taxonomy_version IS DISTINCT FROM NEW.taxonomy_version THEN
    RAISE EXCEPTION 'curriculum outcome must reference an outcome leaf in the same scope' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_curriculum_outcome_node_guard ON public.curriculum_outcomes;
CREATE TRIGGER trg_curriculum_outcome_node_guard
  BEFORE INSERT OR UPDATE OF node_id, taxonomy_version, game, exam_ref
  ON public.curriculum_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.curriculum_outcome_node_guard();

-- The strict course -> unit -> topic -> outcome parent rule means a cycle has
-- no representable edge: every parent is exactly one earlier level.
INSERT INTO public.curriculum_nodes (code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,sort_order,is_active)
VALUES ('ba-tyt-math-v1:course','ba-tyt-math-v1','matematik','TYT','course',NULL,NULL,'TYT Matematik',10,true)
ON CONFLICT (code) DO UPDATE SET
  taxonomy_version=EXCLUDED.taxonomy_version, game=EXCLUDED.game, exam_ref=EXCLUDED.exam_ref,
  node_type=EXCLUDED.node_type, parent_id=EXCLUDED.parent_id, category=EXCLUDED.category,
  title=EXCLUDED.title, sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active,
  updated_at=clock_timestamp();

INSERT INTO public.curriculum_nodes (code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,sort_order,is_active)
SELECT v.code,'ba-tyt-math-v1','matematik','TYT','unit',course.id,NULL,v.title,v.sort_order,true
FROM (VALUES
  ('ba-tyt-math-v1:unit:sayilar-cebir','Sayılar ve Cebir',10),
  ('ba-tyt-math-v1:unit:problemler','Problem Çözme',20),
  ('ba-tyt-math-v1:unit:geometri','Geometri',30),
  ('ba-tyt-math-v1:unit:olasilik','Olasılık',40)
) AS v(code,title,sort_order)
JOIN public.curriculum_nodes course ON course.code='ba-tyt-math-v1:course'
ON CONFLICT (code) DO UPDATE SET
  taxonomy_version=EXCLUDED.taxonomy_version, game=EXCLUDED.game, exam_ref=EXCLUDED.exam_ref,
  node_type=EXCLUDED.node_type, parent_id=EXCLUDED.parent_id, category=EXCLUDED.category,
  title=EXCLUDED.title, sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active,
  updated_at=clock_timestamp();

INSERT INTO public.curriculum_nodes (code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,sort_order,is_active)
SELECT v.code,'ba-tyt-math-v1','matematik','TYT','topic',unit.id,v.category,v.title,v.sort_order,true
FROM (VALUES
  ('ba-tyt-math-v1:topic:sayilar','ba-tyt-math-v1:unit:sayilar-cebir','sayilar','Sayılar',10),
  ('ba-tyt-math-v1:topic:denklemler','ba-tyt-math-v1:unit:sayilar-cebir','denklemler','Denklemler',20),
  ('ba-tyt-math-v1:topic:fonksiyonlar','ba-tyt-math-v1:unit:sayilar-cebir','fonksiyonlar','Fonksiyonlar',30),
  ('ba-tyt-math-v1:topic:problemler','ba-tyt-math-v1:unit:problemler','problemler','Problemler',10),
  ('ba-tyt-math-v1:topic:geometri','ba-tyt-math-v1:unit:geometri','geometri','Geometri',10),
  ('ba-tyt-math-v1:topic:olasilik','ba-tyt-math-v1:unit:olasilik','olasilik','Olasılık',10)
) AS v(code,parent_code,category,title,sort_order)
JOIN public.curriculum_nodes unit ON unit.code=v.parent_code
ON CONFLICT (code) DO UPDATE SET
  taxonomy_version=EXCLUDED.taxonomy_version, game=EXCLUDED.game, exam_ref=EXCLUDED.exam_ref,
  node_type=EXCLUDED.node_type, parent_id=EXCLUDED.parent_id, category=EXCLUDED.category,
  title=EXCLUDED.title, sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active,
  updated_at=clock_timestamp();

INSERT INTO public.curriculum_nodes (code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,sort_order,is_active)
SELECT replace(v.topic_code,':topic:',':outcome:'),'ba-tyt-math-v1','matematik','TYT','outcome',topic.id,v.category,v.title,10,true
FROM (VALUES
  ('ba-tyt-math-v1:topic:sayilar','sayilar','Sayılar ve işlem becerisi'),
  ('ba-tyt-math-v1:topic:denklemler','denklemler','Denklem çözme becerisi'),
  ('ba-tyt-math-v1:topic:fonksiyonlar','fonksiyonlar','Fonksiyon yorumlama becerisi'),
  ('ba-tyt-math-v1:topic:problemler','problemler','Problem çözme becerisi'),
  ('ba-tyt-math-v1:topic:geometri','geometri','Geometrik akıl yürütme becerisi'),
  ('ba-tyt-math-v1:topic:olasilik','olasilik','Olasılık akıl yürütme becerisi')
) AS v(topic_code,category,title)
JOIN public.curriculum_nodes topic ON topic.code=v.topic_code
ON CONFLICT (code) DO UPDATE SET
  taxonomy_version=EXCLUDED.taxonomy_version, game=EXCLUDED.game, exam_ref=EXCLUDED.exam_ref,
  node_type=EXCLUDED.node_type, parent_id=EXCLUDED.parent_id, category=EXCLUDED.category,
  title=EXCLUDED.title, sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active,
  updated_at=clock_timestamp();

-- MAT-SAY-01 retains its historical outcome id/evidence rows while becoming the
-- graph leaf for `sayilar`. Existing pre-096 mappings default to `manual` and
-- are intentionally never rewritten by the taxonomy sync.
INSERT INTO public.curriculum_outcomes (code,game,category,title,description,exam_ref,sort_order,is_active,node_id,taxonomy_version)
SELECT v.code,'matematik',v.category,v.title,
  'Bilge Arena iç öğrenme grafiği leaf becerisidir; resmî müfredat kodu değildir.',
  'TYT',v.sort_order,true,node.id,'ba-tyt-math-v1'
FROM (VALUES
  ('MAT-SAY-01','sayilar','Sayılar ve işlem becerisi',10),
  ('MAT-DEN-01','denklemler','Denklem çözme becerisi',20),
  ('MAT-FON-01','fonksiyonlar','Fonksiyon yorumlama becerisi',30),
  ('MAT-PRO-01','problemler','Problem çözme becerisi',40),
  ('MAT-GEO-01','geometri','Geometrik akıl yürütme becerisi',50),
  ('MAT-OLA-01','olasilik','Olasılık akıl yürütme becerisi',60)
) AS v(code,category,title,sort_order)
JOIN public.curriculum_nodes node
  ON node.code=('ba-tyt-math-v1:outcome:' || v.category)
ON CONFLICT (code) DO UPDATE SET
  game=EXCLUDED.game, category=EXCLUDED.category, title=EXCLUDED.title,
  description=EXCLUDED.description, exam_ref=EXCLUDED.exam_ref,
  sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active,
  node_id=EXCLUDED.node_id, taxonomy_version=EXCLUDED.taxonomy_version;

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
  v_outcome_code text;
  v_outcome_id uuid;
BEGIN
  -- Taxonomy ownership is explicit: never delete or overwrite manual rows.
  DELETE FROM public.question_outcomes
  WHERE question_id=p_question_id AND mapping_source='taxonomy_auto';

  IF NOT COALESCE(p_is_active,false)
    OR p_game <> 'matematik'
    OR upper(COALESCE(p_exam_ref,'')) <> 'TYT' THEN
    RETURN;
  END IF;

  v_outcome_code := CASE lower(COALESCE(p_category,''))
    WHEN 'sayilar' THEN 'MAT-SAY-01'
    WHEN 'denklemler' THEN 'MAT-DEN-01'
    WHEN 'fonksiyonlar' THEN 'MAT-FON-01'
    WHEN 'problemler' THEN 'MAT-PRO-01'
    WHEN 'geometri' THEN 'MAT-GEO-01'
    WHEN 'olasilik' THEN 'MAT-OLA-01'
    ELSE NULL
  END;
  IF v_outcome_code IS NULL THEN
    RAISE EXCEPTION 'unsupported active TYT mathematics category: %', p_category USING ERRCODE='22023';
  END IF;

  SELECT outcome.id INTO v_outcome_id
  FROM public.curriculum_outcomes outcome
  JOIN public.curriculum_nodes node ON node.id=outcome.node_id
  WHERE outcome.code=v_outcome_code
    AND outcome.is_active
    AND outcome.game='matematik'
    AND outcome.exam_ref='TYT'
    AND outcome.taxonomy_version='ba-tyt-math-v1'
    AND node.node_type='outcome'
    AND node.is_active;
  IF v_outcome_id IS NULL THEN
    RAISE EXCEPTION 'taxonomy outcome seed is missing: %', v_outcome_code USING ERRCODE='55000';
  END IF;

  INSERT INTO public.question_outcomes (question_id,outcome_id,weight,is_primary,mapping_source)
  SELECT p_question_id,v_outcome_id,1,
    NOT EXISTS (
      SELECT 1 FROM public.question_outcomes existing
      WHERE existing.question_id=p_question_id AND existing.is_primary
    ),
    'taxonomy_auto'
  ON CONFLICT (question_id,outcome_id) DO NOTHING;
END $fn$;

CREATE OR REPLACE FUNCTION public.trg_sync_taxonomy_auto_question_outcomes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  PERFORM public.sync_taxonomy_auto_question_outcomes(
    NEW.id, NEW.game::text, NEW.exam_ref::text, NEW.category::text, COALESCE(NEW.is_active,false)
  );
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_sync_taxonomy_auto_question_outcomes ON public.questions;
CREATE TRIGGER trg_sync_taxonomy_auto_question_outcomes
  AFTER INSERT OR UPDATE OF game, exam_ref, category, is_active ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_taxonomy_auto_question_outcomes();

-- Seed current active pilot questions through the same helper used for future
-- writes. Unsupported categories abort the entire migration rather than leave
-- an active pilot question silently unmapped.
DO $fn$
DECLARE
  v_question record;
BEGIN
  FOR v_question IN
    SELECT id, game::text AS game, exam_ref::text AS exam_ref, category::text AS category, is_active
    FROM public.questions
    WHERE game='matematik' AND upper(COALESCE(exam_ref,''))='TYT' AND is_active
  LOOP
    PERFORM public.sync_taxonomy_auto_question_outcomes(
      v_question.id,v_question.game,v_question.exam_ref,v_question.category,v_question.is_active
    );
  END LOOP;
END $fn$;

CREATE OR REPLACE FUNCTION public.curriculum_graph_integrity()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  WITH pilot_questions AS (
    SELECT q.id,q.game::text AS game,q.exam_ref::text AS exam_ref,q.category::text AS category
    FROM public.questions q
    WHERE q.is_active AND q.game='matematik' AND upper(COALESCE(q.exam_ref,''))='TYT'
  ),
  valid_mapped AS (
    SELECT DISTINCT q.id
    FROM pilot_questions q
    JOIN public.question_outcomes mapping ON mapping.question_id=q.id
    JOIN public.curriculum_outcomes outcome ON outcome.id=mapping.outcome_id
    JOIN public.curriculum_nodes node ON node.id=outcome.node_id
    WHERE outcome.is_active AND node.is_active AND node.node_type='outcome'
      AND outcome.game IS NOT DISTINCT FROM q.game
      AND upper(COALESCE(outcome.exam_ref,''))=upper(COALESCE(q.exam_ref,''))
      AND outcome.taxonomy_version='ba-tyt-math-v1'
      AND node.taxonomy_version='ba-tyt-math-v1'
      AND outcome.category IS NOT DISTINCT FROM q.category
      AND node.category IS NOT DISTINCT FROM outcome.category
      AND node.game IS NOT DISTINCT FROM outcome.game
      AND node.exam_ref IS NOT DISTINCT FROM outcome.exam_ref
      AND node.taxonomy_version IS NOT DISTINCT FROM outcome.taxonomy_version
  ),
  scope_mismatch AS (
    SELECT count(*)::integer AS count
    FROM pilot_questions q
    JOIN public.question_outcomes mapping ON mapping.question_id=q.id
    LEFT JOIN public.curriculum_outcomes outcome ON outcome.id=mapping.outcome_id
    LEFT JOIN public.curriculum_nodes node ON node.id=outcome.node_id
    WHERE outcome.id IS NULL
      OR outcome.game IS DISTINCT FROM q.game
      OR upper(COALESCE(outcome.exam_ref,'')) <> upper(COALESCE(q.exam_ref,''))
      OR outcome.taxonomy_version IS DISTINCT FROM 'ba-tyt-math-v1'
      OR outcome.category IS DISTINCT FROM q.category
      OR node.id IS NULL
      OR node.node_type <> 'outcome'
      OR node.taxonomy_version IS DISTINCT FROM 'ba-tyt-math-v1'
      OR node.category IS DISTINCT FROM outcome.category
      OR node.game IS DISTINCT FROM outcome.game
      OR node.exam_ref IS DISTINCT FROM outcome.exam_ref
      OR node.taxonomy_version IS DISTINCT FROM outcome.taxonomy_version
  ),
  node_orphan AS (
    SELECT count(*)::integer AS count
    FROM public.curriculum_nodes child
    LEFT JOIN public.curriculum_nodes parent ON parent.id=child.parent_id
    WHERE child.taxonomy_version='ba-tyt-math-v1' AND child.is_active
      AND child.node_type <> 'course'
      AND (parent.id IS NULL
        OR parent.game IS DISTINCT FROM child.game
        OR parent.exam_ref IS DISTINCT FROM child.exam_ref
        OR parent.taxonomy_version IS DISTINCT FROM child.taxonomy_version
        OR parent.node_type IS DISTINCT FROM CASE child.node_type
          WHEN 'unit' THEN 'course' WHEN 'topic' THEN 'unit' WHEN 'outcome' THEN 'topic' END)
  ),
  outcome_orphan AS (
    SELECT count(*)::integer AS count
    FROM public.curriculum_outcomes outcome
    LEFT JOIN public.curriculum_nodes node ON node.id=outcome.node_id
    WHERE outcome.is_active AND outcome.game='matematik'
      AND upper(COALESCE(outcome.exam_ref,''))='TYT'
      AND (node.id IS NULL OR node.node_type <> 'outcome'
        OR node.game IS DISTINCT FROM outcome.game
        OR node.exam_ref IS DISTINCT FROM outcome.exam_ref
        OR node.taxonomy_version IS DISTINCT FROM outcome.taxonomy_version)
  )
  SELECT jsonb_build_object(
    'total',(SELECT count(*)::integer FROM pilot_questions),
    'mapped',(SELECT count(*)::integer FROM valid_mapped),
    'unmapped',(SELECT count(*)::integer FROM pilot_questions) - (SELECT count(*)::integer FROM valid_mapped),
    'scopeMismatch',(SELECT count FROM scope_mismatch),
    'nodeOrphan',(SELECT count FROM node_orphan),
    'outcomeOrphan',(SELECT count FROM outcome_orphan)
  )
$fn$;

REVOKE ALL ON FUNCTION public.curriculum_node_parent_guard(),
  public.curriculum_outcome_node_guard(),
  public.sync_taxonomy_auto_question_outcomes(uuid,text,text,text,boolean),
  public.trg_sync_taxonomy_auto_question_outcomes()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.curriculum_graph_integrity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.curriculum_graph_integrity() TO service_role;

DO $fn$
DECLARE
  v_integrity jsonb;
BEGIN
  SELECT public.curriculum_graph_integrity() INTO v_integrity;
  IF COALESCE((v_integrity->>'unmapped')::integer,-1) <> 0 THEN
    RAISE EXCEPTION 'TYT mathematics taxonomy seed left unmapped active questions' USING ERRCODE='23514';
  END IF;
END $fn$;

NOTIFY pgrst, 'reload schema';
COMMIT;
