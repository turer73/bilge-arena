-- Migration 187: Release the YDT English mastery scope.
--
-- Wordquest questions intentionally store a NULL exam_ref while the public
-- curriculum is displayed as YDT. The release registry keeps those semantics
-- separate. This migration maps the complete active bank by its reviewed
-- seven-category taxonomy and publishes it only after all integrity fields are
-- clean in the same transaction.

BEGIN;

-- Fail cleanly instead of leaving a production deploy waiting indefinitely on
-- an unexpected writer. A retry is safe because the migration is replay-safe.
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

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

-- Wordquest's persisted question scope is SQL NULL. Canonicalize every caller
-- representation at the database boundary so admin publication cannot write the
-- display-only YDT scope back into questions.exam_ref.
CREATE OR REPLACE FUNCTION public.tg_normalize_wordquest_question_exam_ref()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF NEW.game::text = 'wordquest' THEN
    NEW.exam_ref := NULL;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_00_normalize_wordquest_question_exam_ref
  ON public.questions;
CREATE TRIGGER trg_00_normalize_wordquest_question_exam_ref
  BEFORE INSERT OR UPDATE OF game, exam_ref ON public.questions
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_normalize_wordquest_question_exam_ref();

REVOKE ALL ON FUNCTION public.tg_normalize_wordquest_question_exam_ref()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.tg_normalize_wordquest_question_exam_ref()
  IS 'Enforces SQL NULL as the persisted Wordquest question exam_ref; YDT remains revision/display scope.';

-- Outcome/revision metadata uses the public display scope, while questions use
-- the storage scope. Resolve any registered split entry so draft/retired scopes
-- remain visible to fail-closed consumers; exact scopes keep the older behavior.
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
  ), split_scope AS (
    SELECT scope.display_exam_ref::text, scope.taxonomy_version::text,
      scope.release_status::text
    FROM public.curriculum_scope_releases AS scope
    CROSS JOIN normalized
    WHERE scope.game = normalized.game
      AND scope.question_exam_ref IS NOT DISTINCT FROM normalized.question_exam_ref
      AND scope.display_exam_ref IS DISTINCT FROM normalized.question_exam_ref
  )
  SELECT scope.display_exam_ref, scope.taxonomy_version, scope.release_status
  FROM split_scope AS scope
  UNION ALL
  SELECT normalized.question_exam_ref, NULL::text, NULL::text
  FROM normalized
  WHERE NOT EXISTS (SELECT 1 FROM split_scope)
$fn$;

REVOKE ALL ON FUNCTION public.resolve_question_curriculum_validation_scope(text,text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.resolve_question_curriculum_validation_scope(text,text)
  IS 'Resolves a registered split question-storage scope and lifecycle for internal fail-closed validation.';

CREATE OR REPLACE FUNCTION public.question_outcome_scope_valid(
  p_question_id uuid,
  p_outcome_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT COALESCE((
    SELECT public.curriculum_outcome_scope_valid(
        outcome.id, question.game, question.category, scope.display_exam_ref
      )
      AND (
        scope.taxonomy_version IS NULL
        OR outcome.taxonomy_version IS NOT DISTINCT FROM scope.taxonomy_version
      )
      AND (
        scope.release_status IS NULL
        OR scope.release_status IN ('validating','released')
      )
    FROM public.questions AS question
    JOIN public.curriculum_outcomes AS outcome ON outcome.id = p_outcome_id
    CROSS JOIN LATERAL public.resolve_question_curriculum_validation_scope(
      question.game, question.exam_ref
    ) AS scope
    WHERE question.id = p_question_id
  ), false)
$fn$;

CREATE OR REPLACE FUNCTION public.question_active_outcome_mapping_valid(p_question_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT p_question_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.questions question WHERE question.id=p_question_id)
    AND (SELECT count(*) FROM public.question_outcomes mapping
         WHERE mapping.question_id=p_question_id) BETWEEN 1 AND 5
    AND (SELECT count(*) FROM public.question_outcomes mapping
         WHERE mapping.question_id=p_question_id AND mapping.is_primary)=1
    AND NOT EXISTS (
      SELECT 1
      FROM public.question_outcomes mapping
      WHERE mapping.question_id=p_question_id
        AND NOT public.question_outcome_scope_valid(
          mapping.question_id,mapping.outcome_id
        )
    )
$fn$;

REVOKE ALL ON FUNCTION public.question_outcome_scope_valid(uuid,uuid),
  public.question_active_outcome_mapping_valid(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Enforce each new split-scope mapping immediately. This is the cutover guard:
-- even a pre-187 publish function body that resumes after migration COMMIT must
-- execute this trigger when it reaches its INSERT into question_outcomes.
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

  -- Preserve the established behavior for ordinary exact scopes. Their
  -- existing revision-scope guard remains authoritative.
  IF v_taxonomy_version IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT COALESCE(v_release_status IN ('validating','released'), false)
    OR NOT public.question_outcome_scope_valid(NEW.question_id, NEW.outcome_id) THEN
    RAISE EXCEPTION 'question outcome is outside the active split curriculum scope'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_question_outcomes_split_scope_row_guard
  ON public.question_outcomes;
CREATE TRIGGER trg_question_outcomes_split_scope_row_guard
  BEFORE INSERT OR UPDATE OF question_id, outcome_id
  ON public.question_outcomes
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_question_outcome_split_scope_row_guard();

REVOKE ALL ON FUNCTION public.tg_question_outcome_split_scope_row_guard()
  FROM PUBLIC, anon, authenticated, service_role;

-- A publish call can enter the pre-187 function body before this migration and
-- resume after COMMIT. Function replacement alone therefore cannot protect the
-- release boundary. Deferred constraint triggers validate the final persisted
-- state independently of the caller/function version, while still allowing the
-- publish transaction to replace mappings with DELETE followed by INSERT.
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

  -- Deleted, inactive, and ordinary exact-scope questions are outside this
  -- split-scope release invariant.
  IF NOT FOUND OR NOT COALESCE(v_is_active, false) OR v_taxonomy_version IS NULL THEN
    RETURN;
  END IF;

  -- Retired/draft mappings may be deleted for cleanup, but no INSERT/UPDATE is
  -- admitted by the immediate row guard above. Cardinality is required only
  -- while the registered split scope is validating or released.
  IF NOT COALESCE(v_release_status IN ('validating','released'), false) THEN
    RETURN;
  END IF;

  IF NOT public.question_active_outcome_mapping_valid(p_question_id) THEN
    RAISE EXCEPTION 'active split-scope question mapping is invalid or unreleased'
      USING ERRCODE = '22023';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.tg_assert_split_question_outcome_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF TG_TABLE_NAME = 'questions' THEN
    PERFORM public.assert_split_question_outcome_integrity(NEW.id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.assert_split_question_outcome_integrity(OLD.question_id);
  ELSE
    IF TG_OP = 'UPDATE' AND OLD.question_id IS DISTINCT FROM NEW.question_id THEN
      PERFORM public.assert_split_question_outcome_integrity(OLD.question_id);
    END IF;
    PERFORM public.assert_split_question_outcome_integrity(NEW.question_id);
  END IF;
  RETURN NULL;
END
$fn$;

DROP TRIGGER IF EXISTS trg_questions_split_scope_integrity
  ON public.questions;
CREATE CONSTRAINT TRIGGER trg_questions_split_scope_integrity
  AFTER INSERT OR UPDATE OF game, category, exam_ref, is_active
  ON public.questions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_assert_split_question_outcome_integrity();

DROP TRIGGER IF EXISTS trg_question_outcomes_split_scope_integrity
  ON public.question_outcomes;
CREATE CONSTRAINT TRIGGER trg_question_outcomes_split_scope_integrity
  AFTER INSERT OR UPDATE OR DELETE
  ON public.question_outcomes
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_assert_split_question_outcome_integrity();

REVOKE ALL ON FUNCTION public.assert_split_question_outcome_integrity(uuid),
  public.tg_assert_split_question_outcome_integrity(),
  public.tg_question_outcome_split_scope_row_guard()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.assert_split_question_outcome_integrity(uuid)
  IS 'Deferred DB-boundary assertion for active registered split-scope question mappings.';

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
    SELECT question.id,question.game,question.category,
      question.exam_ref AS question_exam_ref,
      scope.display_exam_ref AS exam_ref,
      scope.taxonomy_version,
      scope.release_status,
      question.published_revision_id
    FROM public.questions question
    CROSS JOIN LATERAL public.resolve_question_curriculum_validation_scope(
      question.game,question.exam_ref
    ) AS scope
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
          AND NOT public.question_outcome_scope_valid(
            mapping.question_id,mapping.outcome_id
          )
      ) AS question_mapped,
      EXISTS (
        SELECT 1
        FROM public.question_content_revisions revision
        WHERE revision.id=question.published_revision_id
          AND revision.question_id=question.id
          AND revision.status='published'
          AND revision.game IS NOT DISTINCT FROM question.game
          AND revision.category IS NOT DISTINCT FROM question.category
          AND (
            revision.exam_ref IS NOT DISTINCT FROM question.question_exam_ref
            OR revision.exam_ref IS NOT DISTINCT FROM question.exam_ref
          )
          AND public.question_revision_outcomes_valid(revision.id)
          AND NOT EXISTS (
            SELECT 1
            FROM public.question_revision_outcomes mapping
            WHERE mapping.revision_id=revision.id
              AND NOT public.question_outcome_scope_valid(
                question.id,mapping.outcome_id
              )
          )
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

CREATE OR REPLACE FUNCTION public.publish_question_content_revision(
  p_user_id uuid,
  p_revision_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  r public.question_content_revisions%ROWTYPE;
  q public.questions%ROWTYPE;
  h text;
  old public.content_governance_requests%ROWTYPE;
  out jsonb;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.publish') THEN
    RAISE EXCEPTION 'content publish permission required' USING ERRCODE='42501';
  END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'publish_revision',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object('revisionId',p_revision_id));
  SELECT * INTO old FROM public.content_governance_requests
  WHERE user_id=p_user_id AND operation='publish_revision' AND request_id=p_request_id;
  IF FOUND THEN
    IF old.payload_hash<>h THEN
      RAISE EXCEPTION 'publish request payload mismatch' USING ERRCODE='22023';
    END IF;
    RETURN old.result||jsonb_build_object('replayed',true);
  END IF;
  SELECT * INTO r FROM public.question_content_revisions
  WHERE id=p_revision_id FOR UPDATE;
  IF NOT FOUND OR r.status<>'stage2_approved' THEN
    RAISE EXCEPTION 'two-stage approved revision required' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(
    SELECT 1
    FROM public.question_revision_approvals a
    JOIN public.question_revision_approvals b ON b.revision_id=a.revision_id
    WHERE a.revision_id=r.id AND a.stage=1 AND b.stage=2
      AND a.decision='approved' AND b.decision='approved'
      AND a.reviewer_id<>b.reviewer_id
      AND a.reviewer_id<>r.prepared_by AND b.reviewer_id<>r.prepared_by
      AND (
        r.outcomes_prepared_by IS NULL
        OR (a.reviewer_id<>r.outcomes_prepared_by AND b.reviewer_id<>r.outcomes_prepared_by)
      )
  ) THEN
    RAISE EXCEPTION 'independent approvals required' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('content-publish:'||r.question_id::text,0));
  SELECT * INTO q FROM public.questions WHERE id=r.question_id FOR UPDATE;
  IF q.published_revision_id IS DISTINCT FROM r.base_revision_id THEN
    RAISE EXCEPTION 'stale revision cannot publish' USING ERRCODE='22023';
  END IF;
  PERFORM public.lock_question_revision_outcome_scope(r.id);
  IF NOT public.question_revision_outcomes_valid(r.id)
    OR NOT EXISTS(SELECT 1 FROM public.question_revision_sources WHERE revision_id=r.id) THEN
    RAISE EXCEPTION 'revision evidence incomplete or outside academic scope' USING ERRCODE='22023';
  END IF;
  PERFORM public.content_governance_authorize_question_write(r.question_id,'publish');
  UPDATE public.questions
  SET content=r.content,game=r.game,category=r.category,subcategory=r.subcategory,
    topic=r.topic,difficulty=r.difficulty,level_tag=r.level_tag,exam_ref=r.exam_ref,
    is_boss=r.is_boss,is_active=(r.change_kind<>'retire'),published_revision_id=r.id
  WHERE id=r.question_id;
  PERFORM public.content_governance_clear_question_write(r.question_id);
  DELETE FROM public.question_outcomes WHERE question_id=r.question_id;
  INSERT INTO public.question_outcomes(question_id,outcome_id,weight,is_primary)
  SELECT r.question_id,outcome_id,weight,is_primary
  FROM public.question_revision_outcomes WHERE revision_id=r.id;

  IF EXISTS (
    SELECT 1
    FROM public.questions question
    CROSS JOIN LATERAL public.resolve_question_curriculum_validation_scope(
      question.game,question.exam_ref
    ) AS scope
    WHERE question.id=r.question_id
      AND scope.taxonomy_version IS NOT NULL
      AND (
        scope.release_status NOT IN ('validating','released')
        OR NOT public.question_active_outcome_mapping_valid(r.question_id)
      )
  ) THEN
    RAISE EXCEPTION 'published mapping is outside the active split curriculum scope'
      USING ERRCODE='22023';
  END IF;

  UPDATE public.question_content_revisions SET status='superseded'
  WHERE question_id=r.question_id AND status='published' AND id<>r.id;
  UPDATE public.question_content_revisions
  SET status='published',published_at=clock_timestamp() WHERE id=r.id;
  INSERT INTO public.question_governance_events(
    question_id,revision_id,actor_id,event_type,public_reason
  ) VALUES(
    r.question_id,r.id,p_user_id,'published','Two-stage approved revision published'
  );
  out:=jsonb_build_object(
    'questionId',r.question_id,'revisionId',r.id,'status','published','replayed',false
  );
  INSERT INTO public.content_governance_requests
  VALUES(p_user_id,'publish_revision',p_request_id,h,out,clock_timestamp());
  RETURN out;
END
$fn$;

-- Migration 166 compared published revision and question storage scopes
-- directly. For split scopes, compare the revision with the registry-resolved
-- display scope while continuing to use revision scope for candidate evidence.
CREATE OR REPLACE FUNCTION public.question_outcome_mapping_candidate_snapshot()
RETURNS TABLE (
  question_id uuid,
  base_revision_id uuid,
  content_sha256 text,
  scope_game text,
  scope_category text,
  scope_exam_ref text,
  candidate_kind text,
  proposed_outcome_id uuid,
  candidate_count integer,
  candidate_set_sha256 text,
  evidence_sha256 text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  WITH eligible AS (
    SELECT question.id AS question_id,
      revision.id AS base_revision_id,
      revision.content_sha256,
      revision.game AS scope_game,
      revision.category AS scope_category,
      scope.display_exam_ref AS scope_exam_ref,
      scope.taxonomy_version AS scope_taxonomy_version,
      scope.release_status AS scope_release_status
    FROM public.questions question
    JOIN public.question_content_revisions revision
      ON revision.id=question.published_revision_id
      AND revision.question_id=question.id
      AND revision.status='published'
    CROSS JOIN LATERAL public.resolve_question_curriculum_validation_scope(
      question.game,question.exam_ref
    ) AS scope
    WHERE question.is_active
      AND revision.game IS NOT DISTINCT FROM question.game
      AND revision.category IS NOT DISTINCT FROM question.category
      AND (
        revision.exam_ref IS NOT DISTINCT FROM question.exam_ref
        OR revision.exam_ref IS NOT DISTINCT FROM scope.display_exam_ref
      )
      AND revision.content_sha256=
        encode(extensions.digest(question.content::text,'sha256'),'hex')
      AND (
        scope.release_status IS NULL
        OR scope.release_status IN ('validating','released')
      )
      AND NOT public.question_active_outcome_mapping_valid(question.id)
  ), candidate_sets AS (
    SELECT eligible.*,
      ARRAY(
        SELECT outcome.id
        FROM public.curriculum_outcomes outcome
        WHERE public.curriculum_outcome_scope_valid(
          outcome.id,eligible.scope_game,eligible.scope_category,eligible.scope_exam_ref
        )
          AND (
            eligible.scope_taxonomy_version IS NULL
            OR outcome.taxonomy_version IS NOT DISTINCT FROM eligible.scope_taxonomy_version
          )
        ORDER BY outcome.id
      ) AS candidate_ids,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'outcome',to_jsonb(outcome),
            'lineage',COALESCE((
              WITH RECURSIVE lineage AS (
                SELECT node.id,node.code,node.taxonomy_version,node.game,
                  node.exam_ref,node.node_type,node.parent_id,node.category,
                  node.title,node.sort_order,node.is_active,0 AS depth
                FROM public.curriculum_nodes node
                WHERE node.id=outcome.node_id
                UNION ALL
                SELECT parent.id,parent.code,parent.taxonomy_version,parent.game,
                  parent.exam_ref,parent.node_type,parent.parent_id,parent.category,
                  parent.title,parent.sort_order,parent.is_active,child.depth+1
                FROM public.curriculum_nodes parent
                JOIN lineage child ON child.parent_id=parent.id
                WHERE child.depth<8
              )
              SELECT jsonb_agg(jsonb_build_object(
                'id',lineage.id,
                'code',lineage.code,
                'taxonomyVersion',lineage.taxonomy_version,
                'game',lineage.game,
                'examRef',lineage.exam_ref,
                'nodeType',lineage.node_type,
                'parentId',lineage.parent_id,
                'category',lineage.category,
                'title',lineage.title,
                'sortOrder',lineage.sort_order,
                'active',lineage.is_active,
                'depth',lineage.depth
              ) ORDER BY lineage.depth,lineage.id)
              FROM lineage
            ),'[]'::jsonb)
          )
          ORDER BY outcome.id
        )
        FROM public.curriculum_outcomes outcome
        WHERE public.curriculum_outcome_scope_valid(
          outcome.id,eligible.scope_game,eligible.scope_category,eligible.scope_exam_ref
        )
          AND (
            eligible.scope_taxonomy_version IS NULL
            OR outcome.taxonomy_version IS NOT DISTINCT FROM eligible.scope_taxonomy_version
          )
      ),'[]'::jsonb) AS candidate_evidence
    FROM eligible
  ), classified AS (
    SELECT candidate_sets.*,
      cardinality(candidate_ids) AS candidate_count,
      CASE cardinality(candidate_ids)
        WHEN 0 THEN 'catalog_gap'
        WHEN 1 THEN 'exact_scope'
        ELSE 'ambiguous'
      END AS candidate_kind,
      CASE WHEN cardinality(candidate_ids)=1 THEN candidate_ids[1] END AS proposed_outcome_id,
      public.content_governance_hash(candidate_evidence) AS candidate_set_sha256
    FROM candidate_sets
  )
  SELECT classified.question_id,classified.base_revision_id,classified.content_sha256,
    classified.scope_game,classified.scope_category,classified.scope_exam_ref,
    classified.candidate_kind,classified.proposed_outcome_id,classified.candidate_count,
    classified.candidate_set_sha256,
    public.content_governance_hash(jsonb_build_object(
      'questionId',classified.question_id,
      'baseRevisionId',classified.base_revision_id,
      'contentSha256',classified.content_sha256,
      'game',classified.scope_game,
      'category',classified.scope_category,
      'examRef',classified.scope_exam_ref,
      'candidateSetSha256',classified.candidate_set_sha256,
      'strategyVersion','exact-scope-candidate@1'
    )) AS evidence_sha256
  FROM classified
$fn$;

-- Preserve the identity and created_at of an unchanged taxonomy-auto mapping.
-- The mastery materializer uses mapping.created_at to distinguish counters that
-- the base answer trigger already recorded, so delete/reinsert churn can turn a
-- harmless replay or metadata update into a duplicate counter increment.
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

CREATE TEMP TABLE ydt_english_scope_release_control (
  should_apply boolean NOT NULL,
  should_sync boolean NOT NULL
) ON COMMIT DROP;

-- Replays must preserve an operator retirement or a later taxonomy version.
INSERT INTO ydt_english_scope_release_control (should_apply, should_sync)
SELECT EXISTS (
  SELECT 1
  FROM public.curriculum_scope_releases
  WHERE game = 'wordquest'
    AND display_exam_ref = 'YDT'
    AND question_exam_ref IS NULL
    AND taxonomy_version = 'ba-ydt-eng-v1'
    AND release_status IN ('draft', 'validating', 'released')
), EXISTS (
  SELECT 1
  FROM public.curriculum_scope_releases
  WHERE game = 'wordquest'
    AND display_exam_ref = 'YDT'
    AND question_exam_ref IS NULL
    AND taxonomy_version = 'ba-ydt-eng-v1'
    AND release_status IN ('draft', 'validating')
);

-- Repair every legacy non-NULL Wordquest scope before proving the release. Full
-- production schemas protect question metadata with migration 142's private
-- write context; the focused PostgreSQL acceptance fixture intentionally omits
-- that unrelated governance layer, so use it only when it is present.
DO $fn$
DECLARE
  v_question_id uuid;
  v_has_governance_context boolean :=
    to_regprocedure('public.content_governance_authorize_question_write(uuid,text)') IS NOT NULL
    AND to_regprocedure('public.content_governance_clear_question_write(uuid)') IS NOT NULL;
BEGIN
  IF NOT (SELECT should_sync FROM ydt_english_scope_release_control) THEN
    RETURN;
  END IF;

  FOR v_question_id IN
    SELECT id
    FROM public.questions
    WHERE game = 'wordquest'
      AND exam_ref IS NOT NULL
    ORDER BY id
  LOOP
    IF v_has_governance_context THEN
      EXECUTE 'SELECT public.content_governance_authorize_question_write($1, $2)'
        USING v_question_id, 'publish';
    END IF;

    UPDATE public.questions
    SET exam_ref = NULL
    WHERE id = v_question_id;

    IF v_has_governance_context THEN
      EXECUTE 'SELECT public.content_governance_clear_question_write($1)'
        USING v_question_id;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.questions
    WHERE game = 'wordquest'
      AND exam_ref IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'YDT English question exam_ref canonicalization failed'
      USING ERRCODE = '23514';
  END IF;
END $fn$;

-- The release and its historical repair are one logical gate even though they
-- use consecutive migrations. Refuse to expose YDT mastery when completed
-- answers cannot be attributed to an immutable question revision.
DO $fn$
DECLARE
  v_marker_gap integer;
  v_snapshot_gap integer;
BEGIN
  IF NOT (SELECT should_sync FROM ydt_english_scope_release_control) THEN
    RETURN;
  END IF;

  SELECT count(DISTINCT attempt.id)::integer INTO v_marker_gap
  FROM public.verified_attempts AS attempt
  JOIN public.session_answers AS answer
    ON answer.session_id = attempt.session_id
   AND answer.user_id = attempt.user_id
  JOIN public.questions AS question
    ON question.id = answer.question_id
   AND question.game = 'wordquest'
   AND NULLIF(upper(btrim(COALESCE(question.exam_ref, ''))), '') IS NULL
   AND question.is_active
  WHERE attempt.game = 'wordquest'
    AND attempt.completed_at IS NOT NULL
    AND attempt.session_id IS NOT NULL
    AND answer.question_id = ANY(attempt.question_ids)
    AND NOT COALESCE(answer.is_skipped, false)
    AND NOT EXISTS (
      SELECT 1 FROM public.mastery_materialized_attempts AS marker
      WHERE marker.attempt_id = attempt.id
    );

  SELECT count(*)::integer INTO v_snapshot_gap
  FROM public.verified_attempts AS attempt
  JOIN public.mastery_materialized_attempts AS marker
    ON marker.attempt_id = attempt.id
  JOIN public.session_answers AS answer
    ON answer.session_id = attempt.session_id
   AND answer.user_id = attempt.user_id
  JOIN public.questions AS question
    ON question.id = answer.question_id
   AND question.game = 'wordquest'
   AND NULLIF(upper(btrim(COALESCE(question.exam_ref, ''))), '') IS NULL
   AND question.is_active
  LEFT JOIN public.verified_attempt_question_revisions AS snapshot
    ON snapshot.attempt_id = attempt.id
   AND snapshot.question_id = answer.question_id
  WHERE attempt.game = 'wordquest'
    AND attempt.completed_at IS NOT NULL
    AND attempt.session_id IS NOT NULL
    AND answer.question_id = ANY(attempt.question_ids)
    AND NOT COALESCE(answer.is_skipped, false)
    AND (
      snapshot.question_id IS NULL
      OR answer.question_revision_id IS NULL
      OR snapshot.revision_id IS DISTINCT FROM answer.question_revision_id
      OR snapshot.game IS DISTINCT FROM 'wordquest'
      OR NOT (
        NULLIF(upper(btrim(COALESCE(snapshot.exam_ref, ''))), '') IS NULL
        OR upper(btrim(snapshot.exam_ref)) = 'YDT'
      )
      OR snapshot.category IS DISTINCT FROM question.category::text
    );

  IF v_marker_gap <> 0 OR v_snapshot_gap <> 0 THEN
    RAISE EXCEPTION 'YDT English release blocked by historical mastery provenance: marker gaps %, snapshot gaps %',
      v_marker_gap, v_snapshot_gap USING ERRCODE = '23514';
  END IF;
END $fn$;

DO $fn$
DECLARE
  v_updated integer;
BEGIN
  IF NOT (SELECT should_sync FROM ydt_english_scope_release_control) THEN
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
  IF NOT (SELECT should_sync FROM ydt_english_scope_release_control) THEN
    RETURN;
  END IF;

  FOR v_question IN
    SELECT id, game::text AS game, exam_ref::text AS exam_ref,
      category::text AS category, is_active
    FROM public.questions
    WHERE game = 'wordquest'
      AND exam_ref IS NULL
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
  AND (SELECT should_sync FROM ydt_english_scope_release_control);

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

REVOKE ALL ON FUNCTION public.question_outcome_mapping_candidate_snapshot(),
  public.get_question_outcome_coverage(uuid),
  public.publish_question_content_revision(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_question_outcome_coverage(uuid),
  public.publish_question_content_revision(uuid,uuid,uuid)
  TO service_role;

DO $verify$
DECLARE
  v_trigger_count integer;
  v_split_trigger_count integer;
  v_split_row_trigger_count integer;
BEGIN
  SELECT count(*) INTO v_trigger_count
  FROM pg_trigger
  WHERE tgrelid='public.questions'::regclass
    AND tgname='trg_00_normalize_wordquest_question_exam_ref'
    AND NOT tgisinternal
    AND tgenabled='O';
  IF v_trigger_count<>1 THEN
    RAISE EXCEPTION 'Wordquest question scope canonicalization trigger is missing'
      USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO v_split_trigger_count
  FROM pg_trigger
  WHERE tgrelid IN ('public.questions'::regclass, 'public.question_outcomes'::regclass)
    AND tgname IN (
      'trg_questions_split_scope_integrity',
      'trg_question_outcomes_split_scope_integrity'
    )
    AND NOT tgisinternal
    AND tgenabled='O'
    AND tgdeferrable
    AND tginitdeferred;
  IF v_split_trigger_count<>2 THEN
    RAISE EXCEPTION 'Deferred split-scope integrity triggers are missing or not deferred'
      USING ERRCODE='55000';
  END IF;
  SELECT count(*) INTO v_split_row_trigger_count
  FROM pg_trigger
  WHERE tgrelid='public.question_outcomes'::regclass
    AND tgname='trg_question_outcomes_split_scope_row_guard'
    AND NOT tgisinternal
    AND tgenabled='O'
    AND NOT tgdeferrable;
  IF v_split_row_trigger_count<>1 THEN
    RAISE EXCEPTION 'Immediate split-scope mapping guard is missing'
      USING ERRCODE='55000';
  END IF;
  IF has_function_privilege(
      'anon','public.resolve_question_curriculum_validation_scope(text,text)','EXECUTE'
    )
    OR has_function_privilege(
      'authenticated','public.resolve_question_curriculum_validation_scope(text,text)','EXECUTE'
    )
    OR has_function_privilege(
      'service_role','public.resolve_question_curriculum_validation_scope(text,text)','EXECUTE'
    )
    OR has_function_privilege(
      'anon','public.question_outcome_scope_valid(uuid,uuid)','EXECUTE'
    )
    OR has_function_privilege(
      'authenticated','public.question_outcome_scope_valid(uuid,uuid)','EXECUTE'
    )
    OR has_function_privilege(
      'service_role','public.question_outcome_scope_valid(uuid,uuid)','EXECUTE'
    )
    OR has_function_privilege(
      'anon','public.assert_split_question_outcome_integrity(uuid)','EXECUTE'
    )
    OR has_function_privilege(
      'authenticated','public.assert_split_question_outcome_integrity(uuid)','EXECUTE'
    )
    OR has_function_privilege(
      'service_role','public.assert_split_question_outcome_integrity(uuid)','EXECUTE'
    )
    OR has_function_privilege(
      'anon','public.tg_question_outcome_split_scope_row_guard()','EXECUTE'
    )
    OR has_function_privilege(
      'authenticated','public.tg_question_outcome_split_scope_row_guard()','EXECUTE'
    )
    OR has_function_privilege(
      'service_role','public.tg_question_outcome_split_scope_row_guard()','EXECUTE'
    ) THEN
    RAISE EXCEPTION 'YDT split-scope internal helper privilege drift'
      USING ERRCODE='42501';
  END IF;
  IF has_function_privilege(
      'authenticated','public.publish_question_content_revision(uuid,uuid,uuid)','EXECUTE'
    )
    OR has_function_privilege(
      'authenticated','public.get_question_outcome_coverage(uuid)','EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role','public.publish_question_content_revision(uuid,uuid,uuid)','EXECUTE'
    )
    OR NOT has_function_privilege(
      'service_role','public.get_question_outcome_coverage(uuid)','EXECUTE'
    ) THEN
    RAISE EXCEPTION 'YDT split-scope RPC privilege drift'
      USING ERRCODE='42501';
  END IF;
END
$verify$;

NOTIFY pgrst, 'reload schema';
COMMIT;
