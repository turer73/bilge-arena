-- Preserve exact governed Math projections alongside legacy category proxies.
-- No approval, publication, source-policy, role, or diagnostic rule is weakened.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE OR REPLACE FUNCTION public.sync_taxonomy_auto_question_outcomes(p_question_id uuid, p_game text, p_exam_ref text, p_category text, p_is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path=pg_catalog
AS $function$
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

  -- Canonical aliases describe reviewed questions, never the whole category.
  -- Subsequent activation/maintenance must retain the exact published mapping.
  IF v_scope.game='matematik' AND v_scope.display_exam_ref='TYT'
    AND EXISTS (
      SELECT 1 FROM public.questions q
      JOIN public.question_revision_outcomes ro ON ro.revision_id=q.published_revision_id
      JOIN public.curriculum_outcome_canonical_links l ON l.outcome_id=ro.outcome_id
      WHERE q.id=p_question_id
    ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.questions q
      JOIN public.question_content_revisions r ON r.id=q.published_revision_id AND r.question_id=q.id
      WHERE q.id=p_question_id AND q.is_active AND r.status='published'
        AND q.game::text=p_game AND q.exam_ref::text=p_exam_ref AND q.category::text=p_category
        AND r.game=q.game::text AND r.exam_ref=q.exam_ref::text AND r.category=q.category::text
        AND r.content=q.content
        AND r.content_sha256=encode(extensions.digest(r.content::text,'sha256'),'hex')
        AND public.question_revision_outcomes_valid(r.id)
        AND NOT EXISTS (
          (SELECT outcome_id,weight,is_primary FROM public.question_revision_outcomes WHERE revision_id=r.id
           EXCEPT SELECT outcome_id,weight,is_primary FROM public.question_outcomes WHERE question_id=q.id)
          UNION ALL
          (SELECT outcome_id,weight,is_primary FROM public.question_outcomes WHERE question_id=q.id
           EXCEPT SELECT outcome_id,weight,is_primary FROM public.question_revision_outcomes WHERE revision_id=r.id)
        )
    ) THEN
      RAISE EXCEPTION 'published Math canonical projection differs from reviewed revision' USING ERRCODE='23514';
    END IF;
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
    AND node.category IS NOT DISTINCT FROM outcome.category
    AND NOT (v_scope.game='matematik' AND v_scope.display_exam_ref='TYT' AND EXISTS (
      SELECT 1 FROM public.curriculum_outcome_canonical_links l WHERE l.outcome_id=outcome.id
    ));

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
END $function$;

CREATE OR REPLACE FUNCTION public.trg_sync_taxonomy_auto_question_outcomes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path=pg_catalog
AS $function$
BEGIN
  IF TG_OP='UPDATE' AND NEW.is_active IS TRUE
    AND NEW.game::text IN ('sosyal','matematik') AND NEW.exam_ref::text='TYT'
    AND EXISTS (
      SELECT 1 FROM public.content_governance_write_context c
      WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current()
        AND c.question_id=NEW.id AND c.operation='publish'
    ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.question_content_revisions r
      WHERE r.id=NEW.published_revision_id AND r.question_id=NEW.id
        AND r.status IN ('stage1_approved','stage2_approved')
        AND r.game=NEW.game::text AND r.exam_ref=NEW.exam_ref::text
        AND r.category=NEW.category::text AND r.content=NEW.content
        AND r.content_sha256=encode(extensions.digest(r.content::text,'sha256'),'hex')
        AND public.question_revision_outcomes_valid(r.id)
    ) THEN
      RAISE EXCEPTION 'governed TYT publish requires exact approved revision outcomes'
        USING ERRCODE='23514';
    END IF;
    -- publish_question_content_revision copies the accepted mapping immediately
    -- after this UPDATE. Existing deferred scope integrity still checks COMMIT.
    RETURN NEW;
  END IF;
  PERFORM public.sync_taxonomy_auto_question_outcomes(
    NEW.id,NEW.game::text,NEW.exam_ref::text,NEW.category::text,COALESCE(NEW.is_active,false)
  );
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public.trg_sync_taxonomy_auto_question_outcomes() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.sync_taxonomy_auto_question_outcomes(uuid,text,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
