-- Migration 164: governed revision kazanımlarını gerçek akademik kapsama bağla.
--
-- Migration 106/142 yalnız outcome satırının aktif olup olmadığına bakıyordu.
-- Yetkili/hatalı bir istemci başka game/category/exam kapsamındaki outcome'u
-- revizyona bağlayabiliyor; outcome veya node sonradan pasif edilirse yayın
-- kapısı bunu yeniden doğrulamıyordu. Bu migration:
--   1) revision-outcome INSERT/UPDATE anında exact scope + aktif leaf ister,
--   2) publish anında aynı kanıtı yeniden değerlendirir,
--   3) bankadaki question ve published-revision coverage'ını ayrı raporlar.
--
-- Bilerek toplu backfill YOKTUR. Kategori adı tek başına pedagojik kazanım
-- kanıtı değildir; legacy eşleşmeler admin ekranında insan tarafından seçilir.

BEGIN;

-- Deploy veya publish, beklenmeyen uzun bir writer arkasinda sonsuza kadar
-- asili kalmasin; timeout migration/function transaction'ini fail-closed keser.
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- questions.published_revision_id tek basina revision.question_id bagini garanti
-- etmiyordu. Composite FK baska soruya ait pointer driftini tablo sozlesmesinde
-- kapatir; published status ayrica publish RPC ve coverage kanitinda kontrol
-- edilir. Catalog guard'lari migration'i guvenli bicimde yeniden calisabilir yapar.
DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.question_content_revisions'::regclass
      AND conname='question_content_revisions_id_question_id_key'
  ) THEN
    ALTER TABLE public.question_content_revisions
      ADD CONSTRAINT question_content_revisions_id_question_id_key
      UNIQUE(id,question_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.questions'::regclass
      AND conname='questions_published_revision_question_fkey'
  ) THEN
    ALTER TABLE public.questions
      ADD CONSTRAINT questions_published_revision_question_fkey
      FOREIGN KEY(published_revision_id,id)
      REFERENCES public.question_content_revisions(id,question_id)
      ON DELETE NO ACTION
      NOT VALID;
  END IF;
END
$constraints$;
ALTER TABLE public.questions
  VALIDATE CONSTRAINT questions_published_revision_question_fkey;

-- Icerigi hazirlayan ile son akademik outcome kanitini hazirlayan farkli
-- kisiler olabilir. Ikisini ayri tutmak hem audit izini korur hem de outcome
-- esleyicisinin kendi kanitini review etmesini engeller.
ALTER TABLE public.question_content_revisions
  ADD COLUMN IF NOT EXISTS outcomes_prepared_by uuid;
DO $outcomes_preparer_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.question_content_revisions'::regclass
      AND conname='question_content_revisions_outcomes_prepared_by_fkey'
  ) THEN
    ALTER TABLE public.question_content_revisions
      ADD CONSTRAINT question_content_revisions_outcomes_prepared_by_fkey
      FOREIGN KEY(outcomes_prepared_by)
      REFERENCES public.profiles(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$outcomes_preparer_fk$;
ALTER TABLE public.question_content_revisions
  VALIDATE CONSTRAINT question_content_revisions_outcomes_prepared_by_fkey;

CREATE OR REPLACE FUNCTION public.curriculum_outcome_scope_valid(
  p_outcome_id uuid,
  p_game text,
  p_category text,
  p_exam_ref text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  WITH RECURSIVE selected_outcome AS (
    SELECT outcome.*
    FROM public.curriculum_outcomes outcome
    WHERE outcome.id=p_outcome_id
  ), lineage AS (
    SELECT node.id,node.parent_id,node.node_type,node.game,node.category,
      node.exam_ref,node.taxonomy_version,node.is_active,0 AS depth
    FROM selected_outcome outcome
    JOIN public.curriculum_nodes node ON node.id=outcome.node_id
    UNION ALL
    SELECT parent.id,parent.parent_id,parent.node_type,parent.game,parent.category,
      parent.exam_ref,parent.taxonomy_version,parent.is_active,child.depth+1
    FROM public.curriculum_nodes parent
    JOIN lineage child ON parent.id=child.parent_id
    WHERE child.depth<8
  )
  SELECT COALESCE((
    SELECT outcome.is_active
      AND outcome.node_id IS NOT NULL
      AND outcome.taxonomy_version IS NOT NULL
      AND outcome.game IS NOT DISTINCT FROM p_game
      AND outcome.category IS NOT DISTINCT FROM p_category
      AND outcome.exam_ref IS NOT DISTINCT FROM p_exam_ref
      AND (SELECT array_agg(node.node_type ORDER BY node.depth) FROM lineage node)
        = ARRAY['outcome','topic','unit','course']::text[]
      AND NOT EXISTS (
        SELECT 1
        FROM lineage node
        WHERE NOT node.is_active
          OR node.game IS DISTINCT FROM outcome.game
          OR node.exam_ref IS DISTINCT FROM outcome.exam_ref
          OR node.taxonomy_version IS DISTINCT FROM outcome.taxonomy_version
          OR (node.node_type IN ('outcome','topic')
            AND node.category IS DISTINCT FROM outcome.category)
      )
    FROM selected_outcome outcome
  ),false)
$fn$;

CREATE OR REPLACE FUNCTION public.question_revision_outcomes_valid(p_revision_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT p_revision_id IS NOT NULL
    AND (SELECT count(*) FROM public.question_revision_outcomes mapping
         WHERE mapping.revision_id=p_revision_id) BETWEEN 1 AND 5
    AND (SELECT count(*) FROM public.question_revision_outcomes mapping
         WHERE mapping.revision_id=p_revision_id AND mapping.is_primary)=1
    AND NOT EXISTS (
      SELECT 1
      FROM public.question_revision_outcomes mapping
      JOIN public.question_content_revisions revision ON revision.id=mapping.revision_id
      WHERE mapping.revision_id=p_revision_id
        AND NOT public.curriculum_outcome_scope_valid(
          mapping.outcome_id,revision.game,revision.category,revision.exam_ref
        )
    )
$fn$;

CREATE OR REPLACE FUNCTION public.lock_question_revision_outcome_scope(p_revision_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  PERFORM set_config('lock_timeout','5s',true);
  -- Yeni mapping eklenmesiyle validation arasinda phantom olmasin. Bu tablo
  -- yalniz governed RPC'lerde yazilir ve publish seyrektir; SHARE kilidi
  -- audit kanitini transaction boyunca sabit tutar.
  LOCK TABLE public.question_revision_outcomes IN SHARE MODE;

  PERFORM mapping.outcome_id
  FROM public.question_revision_outcomes mapping
  JOIN public.curriculum_outcomes outcome ON outcome.id=mapping.outcome_id
  WHERE mapping.revision_id=p_revision_id
  ORDER BY mapping.outcome_id
  FOR SHARE OF mapping,outcome;

  PERFORM node.id
  FROM public.curriculum_nodes node
  WHERE node.id IN (
    WITH RECURSIVE lineage AS (
      SELECT outcome.node_id AS id
      FROM public.question_revision_outcomes mapping
      JOIN public.curriculum_outcomes outcome ON outcome.id=mapping.outcome_id
      WHERE mapping.revision_id=p_revision_id
      UNION
      SELECT parent.parent_id
      FROM public.curriculum_nodes parent
      JOIN lineage child ON parent.id=child.id
      WHERE parent.parent_id IS NOT NULL
    )
    SELECT id FROM lineage WHERE id IS NOT NULL
  )
  ORDER BY node.id
  FOR SHARE OF node;
END
$fn$;

CREATE OR REPLACE FUNCTION public.tg_question_revision_outcome_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_revision public.question_content_revisions%ROWTYPE;
BEGIN
  SELECT * INTO v_revision
  FROM public.question_content_revisions
  WHERE id=NEW.revision_id;

  IF v_revision.id IS NULL THEN
    RAISE EXCEPTION 'revision and outcome must exist' USING ERRCODE='22023';
  END IF;

  -- Draft-time validation da eszamanli taxonomy pasiflestirmesiyle yarismasin.
  -- Mapped outcome ve course'a kadar tum parent zinciri transaction bitene
  -- kadar SHARE satir kilidinde tutulur.
  PERFORM outcome.id
  FROM public.curriculum_outcomes outcome
  WHERE outcome.id=NEW.outcome_id
  FOR SHARE OF outcome;

  PERFORM node.id
  FROM public.curriculum_nodes node
  WHERE node.id IN (
    WITH RECURSIVE lineage AS (
      SELECT outcome.node_id AS id
      FROM public.curriculum_outcomes outcome
      WHERE outcome.id=NEW.outcome_id
      UNION
      SELECT current_node.parent_id
      FROM public.curriculum_nodes current_node
      JOIN lineage child ON current_node.id=child.id
      WHERE current_node.parent_id IS NOT NULL
    )
    SELECT id FROM lineage WHERE id IS NOT NULL
  )
  ORDER BY node.id
  FOR SHARE OF node;

  IF NOT public.curriculum_outcome_scope_valid(
    NEW.outcome_id,v_revision.game,v_revision.category,v_revision.exam_ref
  ) THEN
    RAISE EXCEPTION 'revision outcome must have an active course-to-leaf path in the exact game/category/exam scope'
      USING ERRCODE='22023';
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_question_revision_outcome_scope_guard
  ON public.question_revision_outcomes;
CREATE TRIGGER trg_question_revision_outcome_scope_guard
  BEFORE INSERT OR UPDATE OF revision_id,outcome_id
  ON public.question_revision_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.tg_question_revision_outcome_scope_guard();

-- Yeni sorular kazanimsiz acilamaz; mevcut bankadaki bir hata ise outcome
-- katalog kapsami henuz yok diye taslak olarak kaybolmamalidir. Bos outcomes
-- yalniz revision validator'inda kabul edilir. Stage 2 ve publish yine fail-closed.
CREATE OR REPLACE FUNCTION public.content_governance_validate_revision_payload(p_payload jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT CASE
    WHEN jsonb_typeof(p_payload->'outcomes')='array'
      AND jsonb_array_length(p_payload->'outcomes')=0
    THEN public.content_governance_validate_payload(
      jsonb_set(
        p_payload,
        '{outcomes}',
        '[{"outcomeId":"00000000-0000-4000-8000-000000000000","weight":1,"primary":true}]'::jsonb
      )
    )
    ELSE public.content_governance_validate_payload(p_payload)
  END
$fn$;

CREATE OR REPLACE FUNCTION public.content_governance_validate_outcomes_payload(p_outcomes jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF jsonb_typeof(p_outcomes)<>'array'
    OR jsonb_array_length(p_outcomes) NOT BETWEEN 1 AND 5 THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_outcomes) item
    WHERE jsonb_typeof(item)<>'object'
      OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(item) key)
        IS DISTINCT FROM ARRAY['outcomeId','primary','weight']
      OR jsonb_typeof(item->'outcomeId') IS DISTINCT FROM 'string'
      OR (item->>'outcomeId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR jsonb_typeof(item->'weight') IS DISTINCT FROM 'number'
      OR (item->>'weight') !~ '^(0([.][0-9]{1,3})?|1([.]0{1,3})?)$'
      OR (item->>'weight')::numeric<=0
      OR jsonb_typeof(item->'primary') IS DISTINCT FROM 'boolean'
  ) THEN
    RETURN false;
  END IF;
  RETURN (SELECT count(*) FROM jsonb_array_elements(p_outcomes) item
          WHERE (item->>'primary')::boolean)=1
    AND (SELECT count(DISTINCT item->>'outcomeId') FROM jsonb_array_elements(p_outcomes) item)
      = jsonb_array_length(p_outcomes);
EXCEPTION WHEN others THEN
  RETURN false;
END
$fn$;

CREATE OR REPLACE FUNCTION public.create_question_content_revision(
  p_user_id uuid,
  p_question_id uuid,
  p_base_revision_id uuid,
  p_payload jsonb,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  q public.questions%ROWTYPE;
  r public.question_content_revisions%ROWTYPE;
  h text;
  old public.content_governance_requests%ROWTYPE;
  n integer;
  out jsonb;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.prepare') THEN
    RAISE EXCEPTION 'content prepare permission required' USING ERRCODE='42501';
  END IF;
  IF p_question_id IS NULL OR p_request_id IS NULL
    OR NOT public.content_governance_validate_revision_payload(p_payload) THEN
    RAISE EXCEPTION 'invalid revision payload' USING ERRCODE='22023';
  END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'create_revision',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object(
    'questionId',p_question_id,'baseRevisionId',p_base_revision_id,'payload',p_payload
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended('content-revision:'||p_question_id::text,0));
  SELECT * INTO old FROM public.content_governance_requests
  WHERE user_id=p_user_id AND operation='create_revision' AND request_id=p_request_id;
  IF FOUND THEN
    IF old.payload_hash<>h THEN
      RAISE EXCEPTION 'revision request payload mismatch' USING ERRCODE='22023';
    END IF;
    RETURN old.result||jsonb_build_object('replayed',true);
  END IF;
  SELECT * INTO q FROM public.questions WHERE id=p_question_id FOR UPDATE;
  IF NOT FOUND OR q.published_revision_id IS DISTINCT FROM p_base_revision_id THEN
    RAISE EXCEPTION 'stale or unknown revision base' USING ERRCODE='22023';
  END IF;
  SELECT COALESCE(max(revision_no),0)+1 INTO n
  FROM public.question_content_revisions WHERE question_id=p_question_id;
  INSERT INTO public.question_content_revisions(
    question_id,revision_no,base_revision_id,game,category,subcategory,topic,
    difficulty,level_tag,exam_ref,is_boss,content,content_sha256,change_kind,
    change_summary,prepared_by
  ) VALUES (
    p_question_id,n,p_base_revision_id,p_payload->'metadata'->>'game',
    p_payload->'metadata'->>'category',NULLIF(p_payload->'metadata'->>'subcategory',''),
    NULLIF(p_payload->'metadata'->>'topic',''),
    (p_payload->'metadata'->>'difficulty')::smallint,
    NULLIF(p_payload->'metadata'->>'levelTag',''),
    NULLIF(p_payload->'metadata'->>'examRef',''),
    COALESCE((p_payload->'metadata'->>'isBoss')::boolean,false),
    p_payload->'content',encode(extensions.digest((p_payload->'content')::text,'sha256'),'hex'),
    p_payload->>'changeKind',p_payload->>'summary',p_user_id
  ) RETURNING * INTO r;
  INSERT INTO public.question_revision_sources(
    revision_id,source_kind,source_title,source_url,license_code,license_url,
    attribution,provenance_ref
  ) VALUES (
    r.id,p_payload->'source'->>'kind',p_payload->'source'->>'title',
    NULLIF(p_payload->'source'->>'url',''),p_payload->'source'->>'licenseCode',
    NULLIF(p_payload->'source'->>'licenseUrl',''),
    NULLIF(p_payload->'source'->>'attribution',''),
    NULLIF(p_payload->'source'->>'provenanceRef','')
  );
  INSERT INTO public.question_revision_outcomes(revision_id,outcome_id,weight,is_primary)
  SELECT r.id,(item->>'outcomeId')::uuid,(item->>'weight')::numeric,
    COALESCE((item->>'primary')::boolean,false)
  FROM jsonb_array_elements(p_payload->'outcomes') item
  JOIN public.curriculum_outcomes outcome
    ON outcome.id=(item->>'outcomeId')::uuid AND outcome.is_active;
  IF (SELECT count(*) FROM public.question_revision_outcomes WHERE revision_id=r.id)
    <> jsonb_array_length(p_payload->'outcomes') THEN
    RAISE EXCEPTION 'outcomes must be active and unique' USING ERRCODE='22023';
  END IF;
  out:=jsonb_build_object(
    'revisionId',r.id,'questionId',p_question_id,'revisionNo',r.revision_no,
    'status','draft','mappingRequired',jsonb_array_length(p_payload->'outcomes')=0,
    'replayed',false
  );
  INSERT INTO public.content_governance_requests
  VALUES(p_user_id,'create_revision',p_request_id,h,out,clock_timestamp());
  RETURN out;
END
$fn$;

CREATE OR REPLACE FUNCTION public.set_question_revision_outcomes(
  p_user_id uuid,
  p_revision_id uuid,
  p_outcomes jsonb,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  revision public.question_content_revisions%ROWTYPE;
  old public.content_governance_requests%ROWTYPE;
  h text;
  out jsonb;
  mapping_changed boolean;
  stage1_approval_invalidated boolean := false;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.prepare') THEN
    RAISE EXCEPTION 'content prepare permission required' USING ERRCODE='42501';
  END IF;
  IF p_revision_id IS NULL OR p_request_id IS NULL
    OR NOT public.content_governance_validate_outcomes_payload(p_outcomes) THEN
    RAISE EXCEPTION 'invalid revision outcomes' USING ERRCODE='22023';
  END IF;

  PERFORM public.content_governance_lock_request(p_user_id,'set_revision_outcomes',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object(
    'revisionId',p_revision_id,'outcomes',p_outcomes
  ));
  SELECT * INTO old FROM public.content_governance_requests
  WHERE user_id=p_user_id AND operation='set_revision_outcomes' AND request_id=p_request_id;
  IF FOUND THEN
    IF old.payload_hash<>h THEN
      RAISE EXCEPTION 'revision outcomes request payload mismatch' USING ERRCODE='22023';
    END IF;
    RETURN old.result||jsonb_build_object('replayed',true);
  END IF;

  SELECT * INTO revision FROM public.question_content_revisions
  WHERE id=p_revision_id FOR UPDATE;
  IF NOT FOUND OR revision.status NOT IN ('draft','stage1_approved') THEN
    RAISE EXCEPTION 'only pre-stage-two revision outcomes can be changed' USING ERRCODE='22023';
  END IF;

  SELECT NOT (
    (SELECT count(*) FROM public.question_revision_outcomes mapping
     WHERE mapping.revision_id=p_revision_id)=jsonb_array_length(p_outcomes)
    AND NOT EXISTS (
      SELECT 1
      FROM public.question_revision_outcomes mapping
      WHERE mapping.revision_id=p_revision_id
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(p_outcomes) item
          WHERE (item->>'outcomeId')::uuid=mapping.outcome_id
            AND (item->>'weight')::numeric=mapping.weight
            AND (item->>'primary')::boolean=mapping.is_primary
        )
    )
  ) INTO mapping_changed;

  IF mapping_changed THEN
    -- Different revisions can map overlapping outcomes concurrently. Lock the
    -- complete requested scope in a global order before row triggers run so
    -- reversed JSON order cannot create a lock-order deadlock.
    PERFORM outcome.id
    FROM public.curriculum_outcomes outcome
    WHERE outcome.id IN (
      SELECT (item->>'outcomeId')::uuid FROM jsonb_array_elements(p_outcomes) item
    )
    ORDER BY outcome.id
    FOR SHARE OF outcome;

    PERFORM node.id
    FROM public.curriculum_nodes node
    WHERE node.id IN (
      WITH RECURSIVE lineage AS (
        SELECT outcome.node_id AS id
        FROM public.curriculum_outcomes outcome
        WHERE outcome.id IN (
          SELECT (item->>'outcomeId')::uuid FROM jsonb_array_elements(p_outcomes) item
        )
        UNION
        SELECT child.parent_id
        FROM public.curriculum_nodes child
        JOIN lineage ON child.id=lineage.id
        WHERE child.parent_id IS NOT NULL
      )
      SELECT id FROM lineage WHERE id IS NOT NULL
    )
    ORDER BY node.id
    FOR SHARE OF node;

    DELETE FROM public.question_revision_outcomes WHERE revision_id=p_revision_id;
    INSERT INTO public.question_revision_outcomes(revision_id,outcome_id,weight,is_primary)
    SELECT p_revision_id,(item->>'outcomeId')::uuid,(item->>'weight')::numeric,
      (item->>'primary')::boolean
    FROM jsonb_array_elements(p_outcomes) item
    ORDER BY (item->>'outcomeId')::uuid;

    IF NOT public.question_revision_outcomes_valid(p_revision_id) THEN
      RAISE EXCEPTION 'revision outcomes are outside academic scope' USING ERRCODE='22023';
    END IF;

    -- Outcome evidence is part of the reviewed academic content. Any change
    -- after stage one must invalidate that approval and return to draft.
    IF revision.status='stage1_approved' THEN
      DELETE FROM public.question_revision_approvals
      WHERE revision_id=p_revision_id;
      revision.status:='draft';
      stage1_approval_invalidated:=true;
    END IF;
    UPDATE public.question_content_revisions
    SET status=revision.status,
      outcomes_prepared_by=p_user_id
    WHERE id=p_revision_id;
  END IF;

  out:=jsonb_build_object(
    'revisionId',p_revision_id,'status',revision.status,'outcomeCount',jsonb_array_length(p_outcomes),
    'mappingRequired',false,'mappingChanged',mapping_changed,
    'stage1ApprovalInvalidated',stage1_approval_invalidated,'replayed',false
  );
  INSERT INTO public.content_governance_requests
  VALUES(p_user_id,'set_revision_outcomes',p_request_id,h,out,clock_timestamp());
  RETURN out;
END
$fn$;

CREATE OR REPLACE FUNCTION public.review_question_content_revision(
  p_user_id uuid,p_revision_id uuid,p_stage smallint,p_decision text,
  p_rationale text,p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  r public.question_content_revisions%ROWTYPE;
  prior public.question_revision_approvals%ROWTYPE;
  h text;
  old public.content_governance_requests%ROWTYPE;
  out jsonb;
BEGIN
  IF p_stage NOT IN (1,2) OR p_decision NOT IN ('approved','rejected')
    OR char_length(btrim(COALESCE(p_rationale,''))) NOT BETWEEN 1 AND 1000
    OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'invalid review' USING ERRCODE='22023';
  END IF;
  IF NOT public.content_governance_has_permission(
    p_user_id,CASE WHEN p_stage=1 THEN 'content.review.stage1' ELSE 'content.review.stage2' END
  ) THEN
    RAISE EXCEPTION 'review permission required' USING ERRCODE='42501';
  END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'review_revision',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object(
    'revisionId',p_revision_id,'stage',p_stage,'decision',p_decision,'rationale',p_rationale
  ));
  SELECT * INTO old FROM public.content_governance_requests
  WHERE user_id=p_user_id AND operation='review_revision' AND request_id=p_request_id;
  IF FOUND THEN
    IF old.payload_hash<>h THEN
      RAISE EXCEPTION 'review request payload mismatch' USING ERRCODE='22023';
    END IF;
    RETURN old.result||jsonb_build_object('replayed',true);
  END IF;
  SELECT * INTO r FROM public.question_content_revisions WHERE id=p_revision_id FOR UPDATE;
  IF NOT FOUND OR r.status NOT IN ('draft','stage1_approved')
    OR r.prepared_by IS NULL OR r.prepared_by=p_user_id
    OR r.outcomes_prepared_by=p_user_id THEN
    RAISE EXCEPTION 'revision is not reviewable' USING ERRCODE='22023';
  END IF;
  IF p_stage=2 THEN
    SELECT * INTO prior FROM public.question_revision_approvals
    WHERE revision_id=p_revision_id AND stage=1;
    IF NOT FOUND OR prior.decision<>'approved' OR prior.reviewer_id=p_user_id THEN
      RAISE EXCEPTION 'independent stage one approval required' USING ERRCODE='22023';
    END IF;
    IF p_decision='approved' THEN
      PERFORM public.lock_question_revision_outcome_scope(p_revision_id);
      IF NOT public.question_revision_outcomes_valid(p_revision_id) THEN
        RAISE EXCEPTION 'stage two requires exact-scope outcome evidence' USING ERRCODE='22023';
      END IF;
    END IF;
  END IF;
  INSERT INTO public.question_revision_approvals
  VALUES(p_revision_id,p_stage,p_user_id,p_decision,p_rationale,clock_timestamp());
  UPDATE public.question_content_revisions
  SET status=CASE WHEN p_decision='rejected' THEN 'rejected'
    WHEN p_stage=1 THEN 'stage1_approved' ELSE 'stage2_approved' END
  WHERE id=p_revision_id;
  out:=jsonb_build_object(
    'revisionId',p_revision_id,'stage',p_stage,'decision',p_decision,'replayed',false
  );
  INSERT INTO public.content_governance_requests
  VALUES(p_user_id,'review_revision',p_request_id,h,out,clock_timestamp());
  RETURN out;
END
$fn$;

-- Migration 142'nin transaction-bound write context'i aynen korunur; yalnız
-- evidence kontrolü aktif/exact-scope helper'ına yükseltilir.
CREATE OR REPLACE FUNCTION public.publish_question_content_revision(p_user_id uuid,p_revision_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE r public.question_content_revisions%ROWTYPE; q public.questions%ROWTYPE; h text; old public.content_governance_requests%ROWTYPE; out jsonb;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.publish') THEN RAISE EXCEPTION 'content publish permission required' USING ERRCODE='42501'; END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'publish_revision',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object('revisionId',p_revision_id)); SELECT * INTO old FROM public.content_governance_requests WHERE user_id=p_user_id AND operation='publish_revision' AND request_id=p_request_id; IF FOUND THEN IF old.payload_hash<>h THEN RAISE EXCEPTION 'publish request payload mismatch' USING ERRCODE='22023'; END IF; RETURN old.result||jsonb_build_object('replayed',true); END IF;
  SELECT * INTO r FROM public.question_content_revisions WHERE id=p_revision_id FOR UPDATE; IF NOT FOUND OR r.status<>'stage2_approved' THEN RAISE EXCEPTION 'two-stage approved revision required' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.question_revision_approvals a JOIN public.question_revision_approvals b ON b.revision_id=a.revision_id WHERE a.revision_id=r.id AND a.stage=1 AND b.stage=2 AND a.decision='approved' AND b.decision='approved' AND a.reviewer_id<>b.reviewer_id AND a.reviewer_id<>r.prepared_by AND b.reviewer_id<>r.prepared_by AND (r.outcomes_prepared_by IS NULL OR (a.reviewer_id<>r.outcomes_prepared_by AND b.reviewer_id<>r.outcomes_prepared_by))) THEN RAISE EXCEPTION 'independent approvals required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('content-publish:'||r.question_id::text,0)); SELECT * INTO q FROM public.questions WHERE id=r.question_id FOR UPDATE;
  IF q.published_revision_id IS DISTINCT FROM r.base_revision_id THEN RAISE EXCEPTION 'stale revision cannot publish' USING ERRCODE='22023'; END IF;
  PERFORM public.lock_question_revision_outcome_scope(r.id);
  IF NOT public.question_revision_outcomes_valid(r.id) OR NOT EXISTS(SELECT 1 FROM public.question_revision_sources WHERE revision_id=r.id) THEN RAISE EXCEPTION 'revision evidence incomplete or outside academic scope' USING ERRCODE='22023'; END IF;
  PERFORM public.content_governance_authorize_question_write(r.question_id,'publish');
  UPDATE public.questions SET content=r.content,game=r.game,category=r.category,subcategory=r.subcategory,topic=r.topic,difficulty=r.difficulty,level_tag=r.level_tag,exam_ref=r.exam_ref,is_boss=r.is_boss,is_active=(r.change_kind<>'retire'),published_revision_id=r.id WHERE id=r.question_id;
  PERFORM public.content_governance_clear_question_write(r.question_id);
  DELETE FROM public.question_outcomes WHERE question_id=r.question_id; INSERT INTO public.question_outcomes(question_id,outcome_id,weight,is_primary) SELECT r.question_id,outcome_id,weight,is_primary FROM public.question_revision_outcomes WHERE revision_id=r.id;
  UPDATE public.question_content_revisions SET status='superseded' WHERE question_id=r.question_id AND status='published' AND id<>r.id; UPDATE public.question_content_revisions SET status='published',published_at=clock_timestamp() WHERE id=r.id;
  INSERT INTO public.question_governance_events(question_id,revision_id,actor_id,event_type,public_reason) VALUES(r.question_id,r.id,p_user_id,'published','Two-stage approved revision published');
  out:=jsonb_build_object('questionId',r.question_id,'revisionId',r.id,'status','published','replayed',false); INSERT INTO public.content_governance_requests VALUES(p_user_id,'publish_revision',p_request_id,h,out,clock_timestamp()); RETURN out;
END
$fn$;

CREATE OR REPLACE FUNCTION public.get_question_outcome_coverage(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.prepare') THEN
    RAISE EXCEPTION 'content prepare permission required' USING ERRCODE='42501';
  END IF;

  WITH active_questions AS (
    SELECT question.id,question.game,question.category,question.exam_ref,question.published_revision_id
    FROM public.questions question
    WHERE question.is_active
  ), coverage AS (
    SELECT question.*,
      (SELECT count(*) FROM public.question_outcomes mapping
       WHERE mapping.question_id=question.id) BETWEEN 1 AND 5
      AND (SELECT count(*) FROM public.question_outcomes mapping
           WHERE mapping.question_id=question.id AND mapping.is_primary)=1
      AND NOT EXISTS (
        SELECT 1
        FROM public.question_outcomes mapping
        WHERE mapping.question_id=question.id
          AND NOT public.curriculum_outcome_scope_valid(
            mapping.outcome_id,question.game,question.category,question.exam_ref
          )
      ) AS question_mapped,
      EXISTS (
        SELECT 1
        FROM public.question_content_revisions revision
        WHERE revision.id=question.published_revision_id
          AND revision.question_id=question.id
          AND revision.status='published'
          AND public.question_revision_outcomes_valid(revision.id)
      ) AS revision_mapped
    FROM active_questions question
  ), grouped AS (
    SELECT game,category,exam_ref,count(*) AS total,
      count(*) FILTER (WHERE question_mapped) AS question_mapped,
      count(*) FILTER (WHERE revision_mapped) AS revision_mapped
    FROM coverage
    GROUP BY game,category,exam_ref
  ), open_revision_coverage AS (
    SELECT count(*) AS total,
      count(*) FILTER (
        WHERE public.question_revision_outcomes_valid(revision.id)
      ) AS mapped
    FROM public.question_content_revisions revision
    WHERE revision.status IN ('draft','stage1_approved','stage2_approved')
  )
  SELECT jsonb_build_object(
    'totalActive',count(*),
    'questionMappedInScope',count(*) FILTER (WHERE question_mapped),
    'questionUnmappedOrInvalid',count(*) FILTER (WHERE NOT question_mapped),
    'publishedRevisionMappedInScope',count(*) FILTER (WHERE revision_mapped),
    'publishedRevisionUnmappedOrInvalid',count(*) FILTER (WHERE NOT revision_mapped),
    'openRevisionTotal',(SELECT total FROM open_revision_coverage),
    'openRevisionMappedInScope',(SELECT mapped FROM open_revision_coverage),
    'openRevisionUnmappedOrInvalid',(
      SELECT total-mapped FROM open_revision_coverage
    ),
    'byScope',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'game',game,'category',category,'examRef',exam_ref,'total',total,
      'questionMappedInScope',question_mapped,'publishedRevisionMappedInScope',revision_mapped
    ) ORDER BY game,exam_ref,category) FROM grouped),'[]'::jsonb)
  ) INTO v_result
  FROM coverage;

  RETURN v_result;
END
$fn$;

REVOKE ALL ON FUNCTION public.curriculum_outcome_scope_valid(uuid,text,text,text),
  public.question_revision_outcomes_valid(uuid),
  public.lock_question_revision_outcome_scope(uuid),
  public.tg_question_revision_outcome_scope_guard(),
  public.content_governance_validate_revision_payload(jsonb),
  public.content_governance_validate_outcomes_payload(jsonb),
  public.set_question_revision_outcomes(uuid,uuid,jsonb,uuid),
  public.get_question_outcome_coverage(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_question_outcome_coverage(uuid),
  public.set_question_revision_outcomes(uuid,uuid,jsonb,uuid)
  TO service_role;

DO $verify$
DECLARE
  v_trigger_count integer;
  v_fk_count integer;
  v_outcomes_preparer_fk_count integer;
BEGIN
  SELECT count(*) INTO v_trigger_count
  FROM pg_trigger trigger_row
  JOIN pg_class table_row ON table_row.oid=trigger_row.tgrelid
  JOIN pg_namespace schema_row ON schema_row.oid=table_row.relnamespace
  WHERE schema_row.nspname='public'
    AND table_row.relname='question_revision_outcomes'
    AND trigger_row.tgname='trg_question_revision_outcome_scope_guard'
    AND NOT trigger_row.tgisinternal;

  IF v_trigger_count<>1 THEN
    RAISE EXCEPTION '164 verification: exact-scope trigger missing';
  END IF;
  SELECT count(*) INTO v_fk_count
  FROM pg_constraint constraint_row
  WHERE constraint_row.conrelid='public.questions'::regclass
    AND constraint_row.conname='questions_published_revision_question_fkey'
    AND constraint_row.contype='f'
    AND constraint_row.convalidated;
  IF v_fk_count<>1 THEN
    RAISE EXCEPTION '164 verification: question/revision composite FK missing or unvalidated';
  END IF;
  SELECT count(*) INTO v_outcomes_preparer_fk_count
  FROM pg_constraint constraint_row
  WHERE constraint_row.conrelid='public.question_content_revisions'::regclass
    AND constraint_row.conname='question_content_revisions_outcomes_prepared_by_fkey'
    AND constraint_row.contype='f'
    AND constraint_row.convalidated;
  IF v_outcomes_preparer_fk_count<>1 THEN
    RAISE EXCEPTION '164 verification: outcome preparer audit FK missing or unvalidated';
  END IF;
  IF has_function_privilege('authenticated','public.get_question_outcome_coverage(uuid)','EXECUTE') THEN
    RAISE EXCEPTION '164 verification: coverage report exposed to authenticated';
  END IF;
  IF has_function_privilege('authenticated','public.curriculum_outcome_scope_valid(uuid,text,text,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.lock_question_revision_outcome_scope(uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.set_question_revision_outcomes(uuid,uuid,jsonb,uuid)','EXECUTE') THEN
    RAISE EXCEPTION '164 verification: internal outcome helper exposed to authenticated';
  END IF;
  IF NOT has_function_privilege('service_role','public.get_question_outcome_coverage(uuid)','EXECUTE') THEN
    RAISE EXCEPTION '164 verification: service role cannot read coverage report';
  END IF;
  IF NOT has_function_privilege('service_role','public.set_question_revision_outcomes(uuid,uuid,jsonb,uuid)','EXECUTE') THEN
    RAISE EXCEPTION '164 verification: service role cannot map draft outcomes';
  END IF;
END
$verify$;

COMMIT;

NOTIFY pgrst,'reload schema';
