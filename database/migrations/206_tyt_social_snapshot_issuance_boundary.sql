-- Migration 206: TYT Social policy-aware attempt and daily-plan boundary.
--
-- This migration does not release the Social mastery scope. It installs the
-- immutable issuance/snapshot boundary required before a later release can be
-- considered. Generic Social study remains available while the curriculum
-- scope is validating; once released, new TYT Social facts must carry the
-- exact candidate-policy snapshot or the deferred constraint fails closed.

BEGIN;

CREATE OR REPLACE FUNCTION public.assert_tyt_social_attempt_snapshot_integrity(
  p_attempt_id uuid
) RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_attempt public.verified_attempts%ROWTYPE;
  v_header public.verified_attempt_candidate_policy_snapshots%ROWTYPE;
  v_tyt_count integer;
  v_item_count integer;
  v_verified_revision_count integer;
  v_common_history integer;
  v_common_geography integer;
  v_common_philosophy integer;
  v_standard_religion integer;
  v_alternate_philosophy integer;
  v_expected_composition jsonb;
  v_scope_released boolean;
BEGIN
  SELECT * INTO v_attempt FROM public.verified_attempts WHERE id=p_attempt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'verified attempt not found' USING ERRCODE='P0002';
  END IF;
  IF v_attempt.game<>'sosyal' THEN RETURN; END IF;

  SELECT count(*)::integer INTO v_tyt_count
  FROM public.questions AS question
  WHERE question.id=ANY(v_attempt.question_ids)
    AND question.game='sosyal'
    AND upper(btrim(COALESCE(question.exam_ref,'')))='TYT';
  IF v_tyt_count=0 THEN RETURN; END IF;
  IF v_tyt_count<>cardinality(v_attempt.question_ids) THEN
    RAISE EXCEPTION 'mixed TYT Social attempt is forbidden' USING ERRCODE='23514';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.curriculum_scope_releases AS scope
    WHERE scope.game='sosyal' AND scope.display_exam_ref='TYT'
      AND scope.question_exam_ref='TYT'
      AND scope.taxonomy_version='ba-tyt-sosyal-v1'
      AND scope.release_status='released'
  ) INTO v_scope_released;

  SELECT * INTO v_header
  FROM public.verified_attempt_candidate_policy_snapshots
  WHERE attempt_id=p_attempt_id;
  IF NOT FOUND THEN
    IF v_scope_released THEN
      RAISE EXCEPTION 'released TYT Social attempt requires a candidate-policy snapshot'
        USING ERRCODE='23514';
    END IF;
    RETURN;
  END IF;

  IF cardinality(v_attempt.question_ids) NOT BETWEEN 1 AND 100
    OR v_header.user_id IS DISTINCT FROM v_attempt.user_id
    OR v_header.selection_effective_at>v_attempt.started_at
    OR NOT EXISTS (
      SELECT 1 FROM public.exam_candidate_policy_versions AS policy
      WHERE policy.policy_version=v_header.policy_version
        AND policy.status='released'
        AND v_attempt.started_at::date>=policy.valid_from
        AND (policy.valid_until IS NULL OR v_attempt.started_at::date<policy.valid_until)
    )
    OR EXISTS (
      SELECT 1 FROM public.candidate_exam_policy_events AS later
      WHERE later.user_id=v_header.user_id
        AND later.policy_version=v_header.policy_version
        AND later.effective_at<=v_attempt.started_at
        AND (later.effective_at,later.id)>
          (v_header.selection_effective_at,v_header.selection_event_id)
    )
    OR v_header.question_set_sha256 IS DISTINCT FROM
      encode(extensions.digest(array_to_string(v_attempt.question_ids,','),'sha256'),'hex') THEN
    RAISE EXCEPTION 'TYT Social attempt header snapshot is inconsistent' USING ERRCODE='23514';
  END IF;

  SELECT count(*)::integer,
    count(*) FILTER (WHERE item.exam_role='common_history')::integer,
    count(*) FILTER (WHERE item.exam_role='common_geography')::integer,
    count(*) FILTER (WHERE item.exam_role='common_philosophy')::integer,
    count(*) FILTER (WHERE item.exam_role='standard_religion')::integer,
    count(*) FILTER (WHERE item.exam_role='alternate_philosophy')::integer
  INTO v_item_count,v_common_history,v_common_geography,v_common_philosophy,
    v_standard_religion,v_alternate_philosophy
  FROM public.verified_attempt_question_exam_role_snapshots AS item
  WHERE item.attempt_id=p_attempt_id;

  SELECT count(*)::integer INTO v_verified_revision_count
  FROM public.verified_attempt_question_exam_role_snapshots AS item
  JOIN public.verified_attempt_question_revisions AS revision
    ON revision.attempt_id=item.attempt_id
   AND revision.position=item.position
   AND revision.question_id=item.question_id
   AND revision.revision_id=item.revision_id
  WHERE item.attempt_id=p_attempt_id AND item.gradeable;

  IF v_item_count<>cardinality(v_attempt.question_ids)
    OR v_verified_revision_count<>cardinality(v_attempt.question_ids)
    OR EXISTS (
      SELECT 1
      FROM unnest(v_attempt.question_ids) WITH ORDINALITY AS selected(question_id,position)
      LEFT JOIN public.verified_attempt_question_exam_role_snapshots AS item
        ON item.attempt_id=p_attempt_id AND item.position=selected.position
      WHERE item.question_id IS DISTINCT FROM selected.question_id
         OR item.policy_version IS DISTINCT FROM v_header.policy_version
         OR NOT item.gradeable
    ) OR EXISTS (
      SELECT 1
      FROM public.verified_attempt_question_exam_role_snapshots AS item
      JOIN public.exam_candidate_policy_variants AS variant
        ON variant.policy_version=v_header.policy_version
       AND variant.variant_code=v_header.variant_code
      WHERE item.attempt_id=p_attempt_id
        AND NOT item.exam_role=ANY(variant.allowed_roles)
    ) THEN
    RAISE EXCEPTION 'TYT Social attempt item snapshot is incomplete or reordered'
      USING ERRCODE='23514';
  END IF;

  IF v_header.variant_code NOT IN ('questions_16_20','questions_21_25') THEN
    RAISE EXCEPTION 'unknown TYT Social answering variant' USING ERRCODE='23514';
  END IF;
  v_expected_composition:=jsonb_build_object(
    'artifactKind',v_header.artifact_kind,'variant',v_header.variant_code,
    'total',v_item_count,'common_history',v_common_history,
    'common_geography',v_common_geography,'common_philosophy',v_common_philosophy,
    'standard_religion',v_standard_religion,'alternate_philosophy',v_alternate_philosophy
  );
  IF v_header.artifact_kind='official_section'
    AND (v_item_count<>20 OR v_common_history<>5 OR v_common_geography<>5
      OR v_common_philosophy<>5
      OR (v_header.variant_code='questions_16_20'
        AND (v_standard_religion<>5 OR v_alternate_philosophy<>0))
      OR (v_header.variant_code='questions_21_25'
        AND (v_standard_religion<>0 OR v_alternate_philosophy<>5))) THEN
    RAISE EXCEPTION 'official TYT Social section requires exact 5/5/5/5 composition'
      USING ERRCODE='23514';
  END IF;
  IF v_header.artifact_kind='daily_plan' AND (
    v_header.source_plan_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.daily_plan AS plan
      WHERE plan.id=v_header.source_plan_id
        AND plan.user_id=v_header.user_id
        AND plan.question_ids=v_attempt.question_ids
    )
  ) THEN
    RAISE EXCEPTION 'TYT Social daily-plan attempt does not match its immutable plan'
      USING ERRCODE='23514';
  END IF;
  IF v_header.composition IS DISTINCT FROM v_expected_composition THEN
    RAISE EXCEPTION 'TYT Social attempt composition snapshot drifted' USING ERRCODE='23514';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.tg_assert_tyt_social_attempt_snapshot_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  PERFORM public.assert_tyt_social_attempt_snapshot_integrity(NEW.id);
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_tyt_social_attempt_snapshot_integrity ON public.verified_attempts;
CREATE CONSTRAINT TRIGGER trg_tyt_social_attempt_snapshot_integrity
AFTER INSERT ON public.verified_attempts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.tg_assert_tyt_social_attempt_snapshot_integrity();

CREATE OR REPLACE FUNCTION public.assert_tyt_social_plan_snapshot_integrity(
  p_plan_id uuid
) RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_plan public.daily_plan%ROWTYPE;
  v_header public.daily_plan_candidate_policy_snapshots%ROWTYPE;
  v_item_count integer;
  v_snapshot_count integer;
  v_scope_released boolean;
BEGIN
  SELECT * INTO v_plan FROM public.daily_plan WHERE id=p_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'daily plan not found' USING ERRCODE='P0002'; END IF;
  IF v_plan.game<>'sosyal' OR upper(btrim(COALESCE(v_plan.exam_ref,'')))<>'TYT' THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.curriculum_scope_releases AS scope
    WHERE scope.game='sosyal' AND scope.display_exam_ref='TYT'
      AND scope.question_exam_ref='TYT'
      AND scope.taxonomy_version='ba-tyt-sosyal-v1'
      AND scope.release_status='released'
  ) INTO v_scope_released;
  SELECT * INTO v_header FROM public.daily_plan_candidate_policy_snapshots
  WHERE plan_id=p_plan_id;
  IF NOT FOUND THEN
    IF v_scope_released THEN
      RAISE EXCEPTION 'released TYT Social daily plan requires a candidate-policy snapshot'
        USING ERRCODE='23514';
    END IF;
    RETURN;
  END IF;

  IF v_header.user_id IS DISTINCT FROM v_plan.user_id
    OR v_header.selection_effective_at>v_plan.created_at
    OR NOT EXISTS (
      SELECT 1 FROM public.exam_candidate_policy_versions AS policy
      WHERE policy.policy_version=v_header.policy_version
        AND policy.status='released'
        AND v_plan.created_at::date>=policy.valid_from
        AND (policy.valid_until IS NULL OR v_plan.created_at::date<policy.valid_until)
    )
    OR EXISTS (
      SELECT 1 FROM public.candidate_exam_policy_events AS later
      WHERE later.user_id=v_header.user_id
        AND later.policy_version=v_header.policy_version
        AND later.effective_at<=v_plan.created_at
        AND (later.effective_at,later.id)>
          (v_header.selection_effective_at,v_header.selection_event_id)
    ) THEN
    RAISE EXCEPTION 'TYT Social daily plan header snapshot is inconsistent' USING ERRCODE='23514';
  END IF;

  SELECT count(*)::integer INTO v_item_count FROM public.daily_plan_items WHERE plan_id=p_plan_id;
  SELECT count(*)::integer INTO v_snapshot_count
  FROM public.daily_plan_question_exam_role_snapshots AS item
  JOIN public.daily_plan_items AS plan_item
    ON plan_item.plan_id=item.plan_id
   AND plan_item.position=item.position
   AND plan_item.question_id=item.question_id
  JOIN public.exam_candidate_policy_variants AS variant
    ON variant.policy_version=v_header.policy_version
   AND variant.variant_code=v_header.variant_code
  WHERE item.plan_id=p_plan_id
    AND item.policy_version=v_header.policy_version
    AND item.exam_role=ANY(variant.allowed_roles);
  IF v_item_count NOT BETWEEN 1 AND 15 OR v_snapshot_count<>v_item_count
    OR cardinality(v_plan.question_ids)<>v_item_count
    OR EXISTS (
      SELECT 1 FROM unnest(v_plan.question_ids) WITH ORDINALITY AS selected(question_id,position)
      LEFT JOIN public.daily_plan_question_exam_role_snapshots AS item
        ON item.plan_id=p_plan_id AND item.position=selected.position
      WHERE item.question_id IS DISTINCT FROM selected.question_id
         OR item.policy_version IS DISTINCT FROM v_header.policy_version
    ) THEN
    RAISE EXCEPTION 'TYT Social daily plan item snapshot is incomplete, disallowed or reordered'
      USING ERRCODE='23514';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.tg_assert_tyt_social_plan_snapshot_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  PERFORM public.assert_tyt_social_plan_snapshot_integrity(NEW.id);
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_tyt_social_plan_snapshot_integrity ON public.daily_plan;
CREATE CONSTRAINT TRIGGER trg_tyt_social_plan_snapshot_integrity
AFTER INSERT ON public.daily_plan
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.tg_assert_tyt_social_plan_snapshot_integrity();

-- A constraint trigger on INSERT proves the initial snapshot, but service-role
-- code can legitimately update completion columns later. Freeze only the
-- identity/evidence fields once a TYT Social snapshot is bound.
CREATE OR REPLACE FUNCTION public.tg_guard_tyt_social_attempt_parent_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.verified_attempt_candidate_policy_snapshots AS snapshot
    WHERE snapshot.attempt_id=OLD.id
  ) AND (
    NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.game IS DISTINCT FROM OLD.game
    OR NEW.mode IS DISTINCT FROM OLD.mode
    OR NEW.question_ids IS DISTINCT FROM OLD.question_ids
    OR NEW.duration_sec IS DISTINCT FROM OLD.duration_sec
    OR NEW.started_at IS DISTINCT FROM OLD.started_at
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
  ) THEN
    RAISE EXCEPTION 'TYT Social snapshot-bound attempt identity is immutable'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_guard_tyt_social_attempt_parent_update
  ON public.verified_attempts;
CREATE TRIGGER trg_guard_tyt_social_attempt_parent_update
BEFORE UPDATE OF user_id,game,mode,question_ids,duration_sec,started_at,expires_at
ON public.verified_attempts
FOR EACH ROW EXECUTE FUNCTION public.tg_guard_tyt_social_attempt_parent_update();

CREATE OR REPLACE FUNCTION public.tg_guard_tyt_social_plan_parent_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.daily_plan_candidate_policy_snapshots AS snapshot
    WHERE snapshot.plan_id=OLD.id
  ) AND (
    NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.game IS DISTINCT FROM OLD.game
    OR NEW.exam_ref IS DISTINCT FROM OLD.exam_ref
    OR NEW.plan_date IS DISTINCT FROM OLD.plan_date
    OR NEW.question_ids IS DISTINCT FROM OLD.question_ids
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'TYT Social snapshot-bound daily plan identity is immutable'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_guard_tyt_social_plan_parent_update
  ON public.daily_plan;
CREATE TRIGGER trg_guard_tyt_social_plan_parent_update
BEFORE UPDATE OF user_id,game,exam_ref,plan_date,question_ids,created_at
ON public.daily_plan
FOR EACH ROW EXECUTE FUNCTION public.tg_guard_tyt_social_plan_parent_update();

CREATE OR REPLACE FUNCTION public.create_tyt_social_daily_plan_v2(
  p_user_id uuid,
  p_plan_date date,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_policy public.exam_candidate_policy_versions%ROWTYPE;
  v_variant public.exam_candidate_policy_variants%ROWTYPE;
  v_event public.candidate_exam_policy_events%ROWTYPE;
  v_existing_plan public.daily_plan%ROWTYPE;
  v_existing_header public.daily_plan_candidate_policy_snapshots%ROWTYPE;
  v_plan_id uuid;
  v_now timestamptz;
  v_count integer;
  v_valid_count integer;
  v_question_ids uuid[];
  v_payload jsonb;
BEGIN
  IF p_user_id IS NULL OR p_plan_date IS NULL
    OR p_items IS NULL OR jsonb_typeof(p_items)<>'array'
    OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 15 THEN
    RAISE EXCEPTION 'invalid TYT Social daily plan identity' USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS element(item)
    WHERE jsonb_typeof(element.item)<>'object'
      OR jsonb_typeof(element.item->'position') IS DISTINCT FROM 'number'
      OR (element.item->>'position') !~ '^(?:[1-9]|1[0-5])$'
      OR jsonb_typeof(element.item->'question_id') IS DISTINCT FROM 'string'
      OR (element.item->>'question_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR jsonb_typeof(element.item->'slot_type') IS DISTINCT FROM 'string'
      OR (element.item->>'slot_type') NOT IN (
        'due','weak_outcome','current_target','challenge','student_choice'
      )
      OR jsonb_typeof(element.item->'source_type') IS DISTINCT FROM 'string'
      OR (element.item->>'source_type') NOT IN (
        'due','weak_outcome','current_target','challenge','student_choice','fresh','legacy'
      )
      OR (element.item ? 'source_ref'
        AND jsonb_typeof(element.item->'source_ref') NOT IN ('string','null'))
      OR (jsonb_typeof(element.item->'source_ref')='string'
        AND char_length(element.item->>'source_ref') NOT BETWEEN 1 AND 200)
  ) THEN
    RAISE EXCEPTION 'invalid TYT Social daily plan item' USING ERRCODE='22023';
  END IF;
  SELECT count(*)::integer,
    array_agg((element.item->>'question_id')::uuid
      ORDER BY (element.item->>'position')::smallint)
  INTO v_count,v_question_ids
  FROM jsonb_array_elements(p_items) AS element(item);
  IF (SELECT count(DISTINCT (element.item->>'position')::integer)
      FROM jsonb_array_elements(p_items) AS element(item))<>v_count
    OR (SELECT count(DISTINCT (element.item->>'question_id')::uuid)
      FROM jsonb_array_elements(p_items) AS element(item))<>v_count
    OR (SELECT min((element.item->>'position')::integer)
      FROM jsonb_array_elements(p_items) AS element(item))<>1
    OR (SELECT max((element.item->>'position')::integer)
      FROM jsonb_array_elements(p_items) AS element(item))<>v_count THEN
    RAISE EXCEPTION 'TYT Social plan positions and questions must be unique and contiguous'
      USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_policy FROM public.resolve_current_tyt_social_candidate_policy();
  IF NOT FOUND THEN RAISE EXCEPTION 'TYT Social policy unavailable' USING ERRCODE='55000'; END IF;
  IF p_plan_date<v_policy.valid_from
    OR (v_policy.valid_until IS NOT NULL AND p_plan_date>=v_policy.valid_until) THEN
    RAISE EXCEPTION 'TYT Social policy does not cover plan date' USING ERRCODE='55000';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'tyt-social-policy:'||p_user_id::text||':'||v_policy.policy_version,205
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'tyt-social-plan:'||p_user_id::text||':'||p_plan_date::text,206
  ));
  IF NOT EXISTS (
    SELECT 1 FROM public.exam_candidate_policy_versions AS policy
    WHERE policy.policy_version=v_policy.policy_version AND policy.status='released'
      AND current_date>=policy.valid_from
      AND (policy.valid_until IS NULL OR current_date<policy.valid_until)
  ) THEN RAISE EXCEPTION 'TYT Social policy unavailable' USING ERRCODE='55000'; END IF;
  v_now:=clock_timestamp();
  SELECT * INTO v_event FROM public.candidate_exam_policy_events AS event
  WHERE event.user_id=p_user_id AND event.policy_version=v_policy.policy_version
    AND event.effective_at<=v_now
  ORDER BY event.effective_at DESC,event.id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'TYT Social policy selection required' USING ERRCODE='55000'; END IF;
  SELECT * INTO STRICT v_variant FROM public.exam_candidate_policy_variants
  WHERE policy_version=v_policy.policy_version AND variant_code=v_event.variant_code;

  WITH selected AS (
    SELECT question.id,role.exam_role
    FROM unnest(v_question_ids) AS input(question_id)
    JOIN public.questions AS question ON question.id=input.question_id
    JOIN public.question_content_revisions AS revision
      ON revision.id=question.published_revision_id AND revision.question_id=question.id
    JOIN public.question_revision_exam_roles AS role
      ON role.policy_version=v_policy.policy_version AND role.revision_id=revision.id
    WHERE question.is_active AND question.game='sosyal'
      AND upper(btrim(COALESCE(question.exam_ref,'')))='TYT'
      AND revision.status='published'
      AND role.exam_role=ANY(v_variant.allowed_roles)
  ) SELECT count(*)::integer INTO v_valid_count FROM selected;
  IF v_valid_count<>v_count THEN
    RAISE EXCEPTION 'TYT Social plan contains an unavailable or disallowed branch question'
      USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_existing_plan FROM public.daily_plan AS plan
  WHERE plan.user_id=p_user_id AND plan.game='sosyal' AND plan.plan_date=p_plan_date
    AND plan.exam_ref='TYT' FOR UPDATE;
  IF FOUND THEN
    SELECT * INTO v_existing_header FROM public.daily_plan_candidate_policy_snapshots
    WHERE plan_id=v_existing_plan.id;
    IF NOT FOUND
      OR v_existing_plan.question_ids IS DISTINCT FROM v_question_ids
      OR v_existing_header.policy_version IS DISTINCT FROM v_policy.policy_version
      OR v_existing_header.variant_code IS DISTINCT FROM v_event.variant_code
      OR v_existing_header.selection_event_id IS DISTINCT FROM v_event.id THEN
      RAISE EXCEPTION 'existing TYT Social plan is stale for the current answering variant'
        USING ERRCODE='55000';
    END IF;
    SELECT jsonb_build_object(
      'planId',plan.id,'game',plan.game,'planDate',plan.plan_date,'examRef',plan.exam_ref,
      'questionIds',to_jsonb(plan.question_ids),'completedIds',to_jsonb(plan.completed_ids),
      'policyVersion',v_existing_header.policy_version,'variant',v_existing_header.variant_code,
      'items',COALESCE(item_agg.items,'[]'::jsonb),'replayed',true
    ) INTO v_payload
    FROM public.daily_plan AS plan
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'questionId',item.question_id,'position',item.position,'slotType',item.slot_type,
        'sourceType',item.source_type,'completed',item.completed_at IS NOT NULL
      ) ORDER BY item.position) AS items
      FROM public.daily_plan_items AS item WHERE item.plan_id=plan.id
    ) AS item_agg ON true
    WHERE plan.id=v_existing_plan.id;
    RETURN v_payload;
  END IF;

  INSERT INTO public.daily_plan(
    user_id,game,plan_date,exam_ref,question_ids,completed_ids,created_at
  ) VALUES (
    p_user_id,'sosyal',p_plan_date,'TYT',v_question_ids,'{}'::uuid[],v_now
  ) RETURNING id INTO v_plan_id;
  INSERT INTO public.daily_plan_items(
    plan_id,position,question_id,slot_type,source_type,source_ref
  )
  SELECT v_plan_id,(element.item->>'position')::smallint,
    (element.item->>'question_id')::uuid,element.item->>'slot_type',
    element.item->>'source_type',NULLIF(element.item->>'source_ref','')
  FROM jsonb_array_elements(p_items) AS element(item);
  INSERT INTO public.daily_plan_candidate_policy_snapshots(
    plan_id,user_id,policy_version,variant_code,selection_event_id,
    selection_effective_at,rules_sha256,resolved_at
  ) VALUES (
    v_plan_id,p_user_id,v_policy.policy_version,v_event.variant_code,v_event.id,
    v_event.effective_at,v_policy.rules_sha256,v_now
  );
  INSERT INTO public.daily_plan_question_exam_role_snapshots(
    plan_id,policy_version,position,question_id,revision_id,exam_role
  )
  SELECT v_plan_id,v_policy.policy_version,
    (element.item->>'position')::smallint,question.id,revision.id,role.exam_role
  FROM jsonb_array_elements(p_items) AS element(item)
  JOIN public.questions AS question ON question.id=(element.item->>'question_id')::uuid
  JOIN public.question_content_revisions AS revision
    ON revision.id=question.published_revision_id AND revision.question_id=question.id
  JOIN public.question_revision_exam_roles AS role
    ON role.policy_version=v_policy.policy_version AND role.revision_id=revision.id;
  PERFORM public.assert_tyt_social_plan_snapshot_integrity(v_plan_id);
  SELECT jsonb_build_object(
    'planId',plan.id,'game',plan.game,'planDate',plan.plan_date,'examRef',plan.exam_ref,
    'questionIds',to_jsonb(plan.question_ids),'completedIds',to_jsonb(plan.completed_ids),
    'policyVersion',v_policy.policy_version,'variant',v_event.variant_code,
    'items',COALESCE(item_agg.items,'[]'::jsonb),'replayed',false
  ) INTO v_payload
  FROM public.daily_plan AS plan
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'questionId',item.question_id,'position',item.position,'slotType',item.slot_type,
      'sourceType',item.source_type,'completed',item.completed_at IS NOT NULL
    ) ORDER BY item.position) AS items
    FROM public.daily_plan_items AS item WHERE item.plan_id=plan.id
  ) AS item_agg ON true
  WHERE plan.id=v_plan_id;
  RETURN v_payload;
END
$fn$;

CREATE OR REPLACE FUNCTION public.issue_verified_tyt_social_attempt_with_event(
  p_user_id uuid,
  p_mode text,
  p_question_ids uuid[],
  p_duration_sec integer,
  p_request_id uuid,
  p_artifact_kind text,
  p_source_plan_id uuid,
  p_policy_version text,
  p_selection_event_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_policy public.exam_candidate_policy_versions%ROWTYPE;
  v_variant public.exam_candidate_policy_variants%ROWTYPE;
  v_event public.candidate_exam_policy_events%ROWTYPE;
  v_existing_header public.verified_attempt_candidate_policy_snapshots%ROWTYPE;
  v_existing_attempt public.verified_attempts%ROWTYPE;
  v_attempt_id uuid;
  v_now timestamptz;
  v_expires_at timestamptz;
  v_question_set_sha256 text;
  v_valid_count integer;
  v_common_history integer;
  v_common_geography integer;
  v_common_philosophy integer;
  v_standard_religion integer;
  v_alternate_philosophy integer;
  v_composition jsonb;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_selection_event_id IS NULL
    OR p_mode NOT IN ('classic','blitz','marathon','boss','practice','deneme')
    OR p_duration_sec NOT BETWEEN 5 AND 7200
    OR p_artifact_kind NOT IN ('practice','daily_plan','smart_mock','official_section')
    OR ((p_artifact_kind='daily_plan') IS DISTINCT FROM (p_source_plan_id IS NOT NULL))
    OR p_question_ids IS NULL OR cardinality(p_question_ids) NOT BETWEEN 1 AND 100
    OR EXISTS (SELECT 1 FROM unnest(p_question_ids) AS selected(question_id)
      WHERE selected.question_id IS NULL)
    OR cardinality(p_question_ids)<>(
      SELECT count(DISTINCT selected.question_id)
      FROM unnest(p_question_ids) AS selected(question_id)
    ) THEN
    RAISE EXCEPTION 'invalid TYT Social policy-aware attempt' USING ERRCODE='22023';
  END IF;
  v_question_set_sha256:=encode(
    extensions.digest(array_to_string(p_question_ids,','),'sha256'),'hex'
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'tyt-social-attempt:'||p_user_id::text||':'||p_request_id::text,206
  ));
  SELECT * INTO v_existing_header
  FROM public.verified_attempt_candidate_policy_snapshots
  WHERE user_id=p_user_id AND issue_request_id=p_request_id;
  IF FOUND THEN
    SELECT * INTO STRICT v_existing_attempt
    FROM public.verified_attempts WHERE id=v_existing_header.attempt_id;
    IF v_existing_attempt.mode IS DISTINCT FROM p_mode
      OR v_existing_attempt.duration_sec IS DISTINCT FROM p_duration_sec
      OR v_existing_attempt.question_ids IS DISTINCT FROM p_question_ids
      OR v_existing_header.question_set_sha256 IS DISTINCT FROM v_question_set_sha256
      OR v_existing_header.policy_version IS DISTINCT FROM p_policy_version
      OR v_existing_header.selection_event_id IS DISTINCT FROM p_selection_event_id
      OR v_existing_header.artifact_kind IS DISTINCT FROM p_artifact_kind
      OR v_existing_header.source_plan_id IS DISTINCT FROM p_source_plan_id THEN
      RAISE EXCEPTION 'TYT Social attempt replay payload differs' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object(
      'attemptId',v_existing_attempt.id,'expiresAt',v_existing_attempt.expires_at,
      'policyVersion',v_existing_header.policy_version,'variant',v_existing_header.variant_code,
      'artifactKind',v_existing_header.artifact_kind,
      'snapshot',public.verified_attempt_private_snapshot(v_existing_attempt.id),'replayed',true
    );
  END IF;

  SELECT * INTO v_policy FROM public.exam_candidate_policy_versions AS policy
  WHERE policy.policy_version=p_policy_version AND policy.status='released'
    AND current_date>=policy.valid_from
    AND (policy.valid_until IS NULL OR current_date<policy.valid_until);
  IF NOT FOUND THEN RAISE EXCEPTION 'TYT Social policy unavailable' USING ERRCODE='55000'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'tyt-social-policy:'||p_user_id::text||':'||v_policy.policy_version,205
  ));
  IF NOT EXISTS (
    SELECT 1 FROM public.exam_candidate_policy_versions AS policy
    WHERE policy.policy_version=v_policy.policy_version AND policy.status='released'
      AND current_date>=policy.valid_from
      AND (policy.valid_until IS NULL OR current_date<policy.valid_until)
  ) THEN RAISE EXCEPTION 'TYT Social policy unavailable' USING ERRCODE='55000'; END IF;
  v_now:=clock_timestamp();
  SELECT * INTO v_event FROM public.candidate_exam_policy_events AS event
  WHERE event.id=p_selection_event_id AND event.user_id=p_user_id
    AND event.policy_version=v_policy.policy_version AND event.effective_at<=v_now;
  IF NOT FOUND THEN RAISE EXCEPTION 'TYT Social policy selection unavailable' USING ERRCODE='55000'; END IF;
  IF p_artifact_kind<>'daily_plan' AND EXISTS (
    SELECT 1 FROM public.candidate_exam_policy_events AS later
    WHERE later.user_id=p_user_id AND later.policy_version=v_policy.policy_version
      AND later.effective_at<=v_now
      AND (later.effective_at,later.id)>(v_event.effective_at,v_event.id)
  ) THEN
    RAISE EXCEPTION 'TYT Social policy selection is stale' USING ERRCODE='55000';
  END IF;
  IF p_artifact_kind='daily_plan' AND NOT EXISTS (
    SELECT 1 FROM public.daily_plan_candidate_policy_snapshots AS plan_snapshot
    JOIN public.daily_plan AS plan ON plan.id=plan_snapshot.plan_id
    WHERE plan_snapshot.plan_id=p_source_plan_id
      AND plan_snapshot.user_id=p_user_id
      AND plan_snapshot.policy_version=v_policy.policy_version
      AND plan_snapshot.variant_code=v_event.variant_code
      AND plan_snapshot.selection_event_id=v_event.id
      AND plan.question_ids=p_question_ids
  ) THEN
    RAISE EXCEPTION 'TYT Social plan selection snapshot is inconsistent' USING ERRCODE='23514';
  END IF;
  SELECT * INTO STRICT v_variant FROM public.exam_candidate_policy_variants
  WHERE policy_version=v_policy.policy_version AND variant_code=v_event.variant_code;

  WITH selected AS (
    SELECT input.position,question.id,revision.id AS revision_id,role.exam_role
    FROM unnest(p_question_ids) WITH ORDINALITY AS input(question_id,position)
    JOIN public.questions AS question ON question.id=input.question_id
    JOIN public.question_content_revisions AS revision
      ON revision.id=question.published_revision_id AND revision.question_id=question.id
    JOIN public.question_revision_exam_roles AS role
      ON role.policy_version=v_policy.policy_version AND role.revision_id=revision.id
    WHERE question.is_active AND question.game='sosyal'
      AND upper(btrim(COALESCE(question.exam_ref,'')))='TYT'
      AND revision.status='published' AND role.exam_role=ANY(v_variant.allowed_roles)
  )
  SELECT count(*)::integer,
    count(*) FILTER (WHERE exam_role='common_history')::integer,
    count(*) FILTER (WHERE exam_role='common_geography')::integer,
    count(*) FILTER (WHERE exam_role='common_philosophy')::integer,
    count(*) FILTER (WHERE exam_role='standard_religion')::integer,
    count(*) FILTER (WHERE exam_role='alternate_philosophy')::integer
  INTO v_valid_count,v_common_history,v_common_geography,v_common_philosophy,
    v_standard_religion,v_alternate_philosophy
  FROM selected;
  IF v_valid_count<>cardinality(p_question_ids) THEN
    RAISE EXCEPTION 'TYT Social question set contains an unavailable or disallowed branch role'
      USING ERRCODE='23514';
  END IF;
  IF p_artifact_kind='official_section' AND (
    v_valid_count<>20 OR v_common_history<>5 OR v_common_geography<>5
    OR v_common_philosophy<>5
    OR (v_event.variant_code='questions_16_20'
      AND (v_standard_religion<>5 OR v_alternate_philosophy<>0))
    OR (v_event.variant_code='questions_21_25'
      AND (v_standard_religion<>0 OR v_alternate_philosophy<>5))
  ) THEN
    RAISE EXCEPTION 'official TYT Social section requires exact 5/5/5/5 composition'
      USING ERRCODE='23514';
  END IF;
  v_composition:=jsonb_build_object(
    'artifactKind',p_artifact_kind,'variant',v_event.variant_code,
    'total',v_valid_count,'common_history',v_common_history,
    'common_geography',v_common_geography,'common_philosophy',v_common_philosophy,
    'standard_religion',v_standard_religion,'alternate_philosophy',v_alternate_philosophy
  );
  v_expires_at:=v_now+make_interval(secs=>p_duration_sec);
  INSERT INTO public.verified_attempts(
    user_id,game,mode,question_ids,duration_sec,started_at,expires_at
  ) VALUES (
    p_user_id,'sosyal',p_mode,p_question_ids,p_duration_sec,v_now,v_expires_at
  ) RETURNING id INTO v_attempt_id;
  INSERT INTO public.verified_attempt_candidate_policy_snapshots(
    attempt_id,user_id,policy_version,variant_code,artifact_kind,source_plan_id,
    issue_request_id,selection_event_id,selection_effective_at,rules_sha256,
    question_set_sha256,composition,resolved_at
  ) VALUES (
    v_attempt_id,p_user_id,v_policy.policy_version,v_event.variant_code,
    p_artifact_kind,p_source_plan_id,p_request_id,v_event.id,v_event.effective_at,
    v_policy.rules_sha256,v_question_set_sha256,v_composition,v_now
  );
  INSERT INTO public.verified_attempt_question_exam_role_snapshots(
    attempt_id,policy_version,position,question_id,revision_id,exam_role,gradeable
  )
  SELECT v_attempt_id,v_policy.policy_version,input.position::smallint,
    question.id,revision.id,role.exam_role,true
  FROM unnest(p_question_ids) WITH ORDINALITY AS input(question_id,position)
  JOIN public.questions AS question ON question.id=input.question_id
  JOIN public.question_content_revisions AS revision
    ON revision.id=question.published_revision_id AND revision.question_id=question.id
  JOIN public.question_revision_exam_roles AS role
    ON role.policy_version=v_policy.policy_version AND role.revision_id=revision.id;
  PERFORM public.assert_tyt_social_attempt_snapshot_integrity(v_attempt_id);
  RETURN jsonb_build_object(
    'attemptId',v_attempt_id,'expiresAt',v_expires_at,
    'policyVersion',v_policy.policy_version,'variant',v_event.variant_code,
    'artifactKind',p_artifact_kind,
    'snapshot',public.verified_attempt_private_snapshot(v_attempt_id),'replayed',false
  );
END
$fn$;

-- Public service-role wrapper: ordinary practice evidence. Exact official
-- 5/5/5/5 composition is intentionally handled by a separate entry point.
CREATE OR REPLACE FUNCTION public.issue_verified_tyt_social_attempt(
  p_user_id uuid,p_mode text,p_question_ids uuid[],p_duration_sec integer,p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
DECLARE
  v_policy public.exam_candidate_policy_versions%ROWTYPE;
  v_event public.candidate_exam_policy_events%ROWTYPE;
BEGIN
  IF p_mode = 'deneme' THEN
    RAISE EXCEPTION 'TYT Social official sections require the governed composer'
      USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_policy FROM public.resolve_current_tyt_social_candidate_policy();
  IF NOT FOUND THEN RAISE EXCEPTION 'TYT Social policy unavailable' USING ERRCODE='55000'; END IF;
  SELECT * INTO v_event FROM public.candidate_exam_policy_events AS event
  WHERE event.user_id=p_user_id AND event.policy_version=v_policy.policy_version
    AND event.effective_at<=clock_timestamp()
  ORDER BY event.effective_at DESC,event.id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'TYT Social policy selection required' USING ERRCODE='55000'; END IF;
  RETURN public.issue_verified_tyt_social_attempt_with_event(
    p_user_id,p_mode,p_question_ids,p_duration_sec,p_request_id,
    'practice',NULL,v_policy.policy_version,v_event.id
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.issue_verified_tyt_social_section_attempt(
  p_user_id uuid,p_question_ids uuid[],p_duration_sec integer,p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
DECLARE
  v_policy public.exam_candidate_policy_versions%ROWTYPE;
  v_event public.candidate_exam_policy_events%ROWTYPE;
BEGIN
  SELECT * INTO v_policy FROM public.resolve_current_tyt_social_candidate_policy();
  IF NOT FOUND THEN RAISE EXCEPTION 'TYT Social policy unavailable' USING ERRCODE='55000'; END IF;
  SELECT * INTO v_event FROM public.candidate_exam_policy_events AS event
  WHERE event.user_id=p_user_id AND event.policy_version=v_policy.policy_version
    AND event.effective_at<=clock_timestamp()
  ORDER BY event.effective_at DESC,event.id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'TYT Social policy selection required' USING ERRCODE='55000'; END IF;
  RETURN public.issue_verified_tyt_social_attempt_with_event(
    p_user_id,'deneme',p_question_ids,p_duration_sec,p_request_id,
    'official_section',NULL,v_policy.policy_version,v_event.id
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.issue_verified_tyt_social_plan_attempt(
  p_user_id uuid,p_plan_id uuid,p_mode text,p_duration_sec integer,p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
DECLARE
  v_plan public.daily_plan%ROWTYPE;
  v_header public.daily_plan_candidate_policy_snapshots%ROWTYPE;
BEGIN
  SELECT * INTO v_plan FROM public.daily_plan
  WHERE id=p_plan_id AND user_id=p_user_id AND game='sosyal' AND exam_ref='TYT';
  IF NOT FOUND THEN RAISE EXCEPTION 'TYT Social daily plan not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_header FROM public.daily_plan_candidate_policy_snapshots
  WHERE plan_id=v_plan.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TYT Social daily plan policy snapshot missing' USING ERRCODE='23514'; END IF;
  RETURN public.issue_verified_tyt_social_attempt_with_event(
    p_user_id,p_mode,v_plan.question_ids,p_duration_sec,p_request_id,
    'daily_plan',v_plan.id,v_header.policy_version,v_header.selection_event_id
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.filter_tyt_social_question_candidates(
  p_user_id uuid,
  p_question_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_policy public.exam_candidate_policy_versions%ROWTYPE;
  v_event public.candidate_exam_policy_events%ROWTYPE;
  v_allowed_roles text[];
  v_allowed_ids uuid[];
BEGIN
  IF p_user_id IS NULL OR p_question_ids IS NULL
    OR cardinality(p_question_ids) NOT BETWEEN 1 AND 1000
    OR EXISTS (SELECT 1 FROM unnest(p_question_ids) AS selected(question_id)
      WHERE selected.question_id IS NULL) THEN
    RAISE EXCEPTION 'invalid TYT Social candidate filter input' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_policy FROM public.resolve_current_tyt_social_candidate_policy();
  IF NOT FOUND THEN RAISE EXCEPTION 'TYT Social policy unavailable' USING ERRCODE='55000'; END IF;
  SELECT * INTO v_event FROM public.candidate_exam_policy_events AS event
  WHERE event.user_id=p_user_id AND event.policy_version=v_policy.policy_version
    AND event.effective_at<=clock_timestamp()
  ORDER BY event.effective_at DESC,event.id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'TYT Social policy selection required' USING ERRCODE='55000'; END IF;
  SELECT allowed_roles INTO STRICT v_allowed_roles
  FROM public.exam_candidate_policy_variants
  WHERE policy_version=v_policy.policy_version AND variant_code=v_event.variant_code;
  SELECT COALESCE(array_agg(input.question_id ORDER BY input.position),'{}'::uuid[])
  INTO v_allowed_ids
  FROM unnest(p_question_ids) WITH ORDINALITY AS input(question_id,position)
  JOIN public.questions AS question ON question.id=input.question_id
  JOIN public.question_content_revisions AS revision
    ON revision.id=question.published_revision_id AND revision.question_id=question.id
  JOIN public.question_revision_exam_roles AS role
    ON role.policy_version=v_policy.policy_version AND role.revision_id=revision.id
  WHERE question.is_active AND question.game='sosyal'
    AND upper(btrim(COALESCE(question.exam_ref,'')))='TYT'
    AND revision.status='published' AND role.exam_role=ANY(v_allowed_roles);
  RETURN jsonb_build_object(
    'policyVersion',v_policy.policy_version,
    'allowedQuestionIds',to_jsonb(v_allowed_ids)
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.issue_verified_tyt_social_exam_attempt(
  p_user_id uuid,
  p_blueprint_version text,
  p_items jsonb,
  p_duration_sec integer,
  p_planned_duration_sec integer,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_policy public.exam_candidate_policy_versions%ROWTYPE;
  v_event public.candidate_exam_policy_events%ROWTYPE;
  v_attempt_result jsonb;
  v_attempt_id uuid;
  v_question_ids uuid[];
  v_question_set_sha256 text;
  v_existing public.verified_exam_attempts%ROWTYPE;
  v_now timestamptz:=clock_timestamp();
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL
    OR p_blueprint_version IS NULL
    OR char_length(btrim(p_blueprint_version)) NOT BETWEEN 1 AND 80
    OR p_planned_duration_sec NOT BETWEEN 5 AND 7200
    OR p_duration_sec NOT BETWEEN p_planned_duration_sec+1 AND 7200
    OR p_items IS NULL OR jsonb_typeof(p_items)<>'array'
    OR jsonb_array_length(p_items)<>40 THEN
    RAISE EXCEPTION 'invalid TYT Social smart-mock issuance' USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS element(item)
    WHERE jsonb_typeof(element.item)<>'object'
      OR (element.item->>'position') !~ '^([0-9]|[1-3][0-9])$'
      OR (element.item->>'questionId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR element.item->>'sourceBucket' NOT IN ('wrong','weak','coverage')
  ) THEN RAISE EXCEPTION 'invalid TYT Social smart-mock items' USING ERRCODE='22023'; END IF;
  SELECT array_agg((element.item->>'questionId')::uuid
    ORDER BY (element.item->>'position')::integer)
  INTO v_question_ids FROM jsonb_array_elements(p_items) AS element(item);
  IF (SELECT count(DISTINCT (element.item->>'position')::integer)
      FROM jsonb_array_elements(p_items) AS element(item))<>40
    OR (SELECT min((element.item->>'position')::integer)
      FROM jsonb_array_elements(p_items) AS element(item))<>0
    OR (SELECT max((element.item->>'position')::integer)
      FROM jsonb_array_elements(p_items) AS element(item))<>39
    OR cardinality(ARRAY(SELECT DISTINCT unnest(v_question_ids)))<>40 THEN
    RAISE EXCEPTION 'TYT Social smart-mock items must be unique and contiguous'
      USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_policy FROM public.resolve_current_tyt_social_candidate_policy();
  IF NOT FOUND THEN RAISE EXCEPTION 'TYT Social policy unavailable' USING ERRCODE='55000'; END IF;
  SELECT * INTO v_event FROM public.candidate_exam_policy_events AS event
  WHERE event.user_id=p_user_id AND event.policy_version=v_policy.policy_version
    AND event.effective_at<=v_now
  ORDER BY event.effective_at DESC,event.id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'TYT Social policy selection required' USING ERRCODE='55000'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text||':sosyal:TYT',100));
  v_attempt_result:=public.issue_verified_tyt_social_attempt_with_event(
    p_user_id,'deneme',v_question_ids,p_duration_sec,p_request_id,
    'smart_mock',NULL,v_policy.policy_version,v_event.id
  );
  v_attempt_id:=(v_attempt_result->>'attemptId')::uuid;
  v_question_set_sha256:=encode(
    extensions.digest(array_to_string(v_question_ids,','),'sha256'),'hex'
  );
  SELECT * INTO v_existing FROM public.verified_exam_attempts
  WHERE attempt_id=v_attempt_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.user_id IS DISTINCT FROM p_user_id OR v_existing.game<>'sosyal'
      OR v_existing.exam_ref IS DISTINCT FROM 'TYT'
      OR v_existing.blueprint_version IS DISTINCT FROM p_blueprint_version
      OR v_existing.question_set_hash IS DISTINCT FROM v_question_set_sha256
      OR v_existing.planned_duration_sec IS DISTINCT FROM p_planned_duration_sec
      OR v_existing.issue_request_id IS DISTINCT FROM p_request_id
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_items) AS element(item)
        LEFT JOIN public.verified_exam_attempt_items AS existing_item
          ON existing_item.attempt_id=v_existing.attempt_id
         AND existing_item.position=(element.item->>'position')::smallint
        WHERE existing_item.question_id IS DISTINCT FROM (element.item->>'questionId')::uuid
           OR existing_item.source_bucket IS DISTINCT FROM element.item->>'sourceBucket'
      ) THEN
      RAISE EXCEPTION 'TYT Social smart-mock replay payload differs' USING ERRCODE='22023';
    END IF;
  ELSE
    UPDATE public.verified_exam_attempts AS exam
    SET status='expired'
    FROM public.verified_attempts AS attempt
    WHERE exam.attempt_id=attempt.id
      AND exam.user_id=p_user_id
      AND exam.game='sosyal'
      AND exam.exam_ref='TYT'
      AND exam.status IN ('issued','active')
      AND (
        attempt.expires_at<=v_now
        OR (exam.status='active' AND exam.deadline_at<=v_now)
      );
    SELECT * INTO v_existing FROM public.verified_exam_attempts AS exam
    WHERE exam.user_id=p_user_id AND exam.game='sosyal' AND exam.exam_ref='TYT'
      AND exam.status IN ('issued','active') FOR UPDATE;
    IF FOUND THEN
      RAISE EXCEPTION 'an open TYT Social smart mock already exists' USING ERRCODE='23505';
    END IF;
    INSERT INTO public.verified_exam_attempts(
      attempt_id,user_id,game,exam_ref,blueprint_version,question_set_hash,
      planned_duration_sec,issue_request_id,issued_at
    ) VALUES (
      v_attempt_id,p_user_id,'sosyal','TYT',p_blueprint_version,
      v_question_set_sha256,p_planned_duration_sec,p_request_id,v_now
    );
    INSERT INTO public.verified_exam_attempt_items(
      attempt_id,position,question_id,source_bucket
    )
    SELECT v_attempt_id,(element.item->>'position')::smallint,
      (element.item->>'questionId')::uuid,element.item->>'sourceBucket'
    FROM jsonb_array_elements(p_items) AS element(item);
  END IF;
  RETURN jsonb_build_object(
    'attemptId',v_attempt_id,
    'expiresAt',(SELECT expires_at FROM public.verified_attempts WHERE id=v_attempt_id),
    'plannedDurationSec',p_planned_duration_sec,
    'status',(SELECT status FROM public.verified_exam_attempts WHERE attempt_id=v_attempt_id),
    'snapshot',public.verified_exam_private_snapshot(v_attempt_id),
    'replayed',COALESCE((v_attempt_result->>'replayed')::boolean,false)
  );
END
$fn$;



CREATE OR REPLACE FUNCTION public.tyt_social_snapshot_boundary_integrity()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_attempt_trigger_ready boolean;
  v_plan_trigger_ready boolean;
  v_attempt_parent_guard_ready boolean;
  v_plan_parent_guard_ready boolean;
  v_invalid_attempt_count integer;
  v_invalid_plan_count integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger AS trigger
    WHERE trigger.tgrelid='public.verified_attempts'::regclass
      AND trigger.tgname='trg_tyt_social_attempt_snapshot_integrity'
      AND NOT trigger.tgisinternal AND trigger.tgenabled<>'D'
      AND trigger.tgdeferrable AND trigger.tginitdeferred
  ) INTO v_attempt_trigger_ready;
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger AS trigger
    WHERE trigger.tgrelid='public.daily_plan'::regclass
      AND trigger.tgname='trg_tyt_social_plan_snapshot_integrity'
      AND NOT trigger.tgisinternal AND trigger.tgenabled<>'D'
      AND trigger.tgdeferrable AND trigger.tginitdeferred
  ) INTO v_plan_trigger_ready;
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger AS trigger
    WHERE trigger.tgrelid='public.verified_attempts'::regclass
      AND trigger.tgname='trg_guard_tyt_social_attempt_parent_update'
      AND NOT trigger.tgisinternal AND trigger.tgenabled<>'D'
  ) INTO v_attempt_parent_guard_ready;
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger AS trigger
    WHERE trigger.tgrelid='public.daily_plan'::regclass
      AND trigger.tgname='trg_guard_tyt_social_plan_parent_update'
      AND NOT trigger.tgisinternal AND trigger.tgenabled<>'D'
  ) INTO v_plan_parent_guard_ready;

  SELECT count(*)::integer INTO v_invalid_attempt_count
  FROM public.verified_attempt_candidate_policy_snapshots AS header
  JOIN public.verified_attempts AS attempt ON attempt.id=header.attempt_id
  WHERE attempt.user_id IS DISTINCT FROM header.user_id
    OR attempt.game<>'sosyal'
    OR cardinality(attempt.question_ids) NOT BETWEEN 1 AND 100
    OR header.artifact_kind NOT IN ('practice','daily_plan','smart_mock','official_section')
    OR (header.artifact_kind='official_section' AND cardinality(attempt.question_ids)<>20)
    OR (header.artifact_kind='daily_plan' AND cardinality(attempt.question_ids) NOT BETWEEN 1 AND 15)
    OR (header.artifact_kind='smart_mock' AND cardinality(attempt.question_ids)<>40)
    OR ((header.artifact_kind='daily_plan') IS DISTINCT FROM (header.source_plan_id IS NOT NULL))
    OR header.selection_effective_at>attempt.started_at
    OR header.question_set_sha256 IS DISTINCT FROM
      encode(extensions.digest(array_to_string(attempt.question_ids,','),'sha256'),'hex')
    OR (SELECT count(*) FROM public.verified_attempt_question_exam_role_snapshots AS item
        WHERE item.attempt_id=header.attempt_id AND item.gradeable)
      <>cardinality(attempt.question_ids)
    OR COALESCE((header.composition->>'total')::integer,-1)
      <>cardinality(attempt.question_ids)
    OR header.composition->>'artifactKind' IS DISTINCT FROM header.artifact_kind
    OR header.composition->>'variant' IS DISTINCT FROM header.variant_code
    OR (header.artifact_kind='official_section' AND (
      COALESCE((header.composition->>'common_history')::integer,-1)<>5
      OR COALESCE((header.composition->>'common_geography')::integer,-1)<>5
      OR COALESCE((header.composition->>'common_philosophy')::integer,-1)<>5
      OR (header.variant_code='questions_16_20' AND (
        COALESCE((header.composition->>'standard_religion')::integer,-1)<>5
        OR COALESCE((header.composition->>'alternate_philosophy')::integer,-1)<>0
      ))
      OR (header.variant_code='questions_21_25' AND (
        COALESCE((header.composition->>'standard_religion')::integer,-1)<>0
        OR COALESCE((header.composition->>'alternate_philosophy')::integer,-1)<>5
      ))
    ))
    OR EXISTS (
      SELECT 1 FROM unnest(attempt.question_ids) WITH ORDINALITY AS selected(question_id,position)
      LEFT JOIN public.verified_attempt_question_exam_role_snapshots AS item
        ON item.attempt_id=header.attempt_id AND item.position=selected.position
      WHERE item.question_id IS DISTINCT FROM selected.question_id
         OR item.policy_version IS DISTINCT FROM header.policy_version
         OR NOT item.gradeable
    );

  SELECT count(*)::integer INTO v_invalid_plan_count
  FROM public.daily_plan_candidate_policy_snapshots AS header
  JOIN public.daily_plan AS plan ON plan.id=header.plan_id
  WHERE plan.user_id IS DISTINCT FROM header.user_id
    OR plan.game<>'sosyal' OR upper(btrim(COALESCE(plan.exam_ref,'')))<>'TYT'
    OR header.selection_effective_at>plan.created_at
    OR cardinality(plan.question_ids) NOT BETWEEN 1 AND 15
    OR (SELECT count(*) FROM public.daily_plan_question_exam_role_snapshots AS item
        WHERE item.plan_id=header.plan_id)<>cardinality(plan.question_ids)
    OR EXISTS (
      SELECT 1 FROM unnest(plan.question_ids) WITH ORDINALITY AS selected(question_id,position)
      LEFT JOIN public.daily_plan_question_exam_role_snapshots AS item
        ON item.plan_id=header.plan_id AND item.position=selected.position
      WHERE item.question_id IS DISTINCT FROM selected.question_id
         OR item.policy_version IS DISTINCT FROM header.policy_version
    );

  RETURN jsonb_build_object(
    'attemptConstraintTriggerReady',v_attempt_trigger_ready,
    'planConstraintTriggerReady',v_plan_trigger_ready,
    'attemptParentGuardReady',v_attempt_parent_guard_ready,
    'planParentGuardReady',v_plan_parent_guard_ready,
    'attemptIssuerReady',to_regprocedure(
      'public.issue_verified_tyt_social_attempt(uuid,text,uuid[],integer,uuid)'
    ) IS NOT NULL,
    'planIssuerReady',to_regprocedure(
      'public.create_tyt_social_daily_plan_v2(uuid,date,jsonb)'
    ) IS NOT NULL,
    'officialSectionIssuerReady',to_regprocedure(
      'public.issue_verified_tyt_social_section_attempt(uuid,uuid[],integer,uuid)'
    ) IS NOT NULL,
    'planAttemptIssuerReady',to_regprocedure(
      'public.issue_verified_tyt_social_plan_attempt(uuid,uuid,text,integer,uuid)'
    ) IS NOT NULL,
    'smartMockIssuerReady',to_regprocedure(
      'public.issue_verified_tyt_social_exam_attempt(uuid,text,jsonb,integer,integer,uuid)'
    ) IS NOT NULL,
    'candidateFilterReady',to_regprocedure(
      'public.filter_tyt_social_question_candidates(uuid,uuid[])'
    ) IS NOT NULL,
    'invalidAttemptSnapshotCount',v_invalid_attempt_count,
    'invalidPlanSnapshotCount',v_invalid_plan_count,
    'ready',v_attempt_trigger_ready AND v_plan_trigger_ready
      AND v_attempt_parent_guard_ready AND v_plan_parent_guard_ready
      AND to_regprocedure(
        'public.issue_verified_tyt_social_attempt(uuid,text,uuid[],integer,uuid)'
      ) IS NOT NULL
      AND to_regprocedure(
        'public.create_tyt_social_daily_plan_v2(uuid,date,jsonb)'
      ) IS NOT NULL
      AND to_regprocedure(
        'public.issue_verified_tyt_social_section_attempt(uuid,uuid[],integer,uuid)'
      ) IS NOT NULL
      AND to_regprocedure(
        'public.issue_verified_tyt_social_plan_attempt(uuid,uuid,text,integer,uuid)'
      ) IS NOT NULL
      AND to_regprocedure(
        'public.issue_verified_tyt_social_exam_attempt(uuid,text,jsonb,integer,integer,uuid)'
      ) IS NOT NULL
      AND to_regprocedure(
        'public.filter_tyt_social_question_candidates(uuid,uuid[])'
      ) IS NOT NULL
      AND v_invalid_attempt_count=0 AND v_invalid_plan_count=0
  );
END
$fn$;

DO $fn$
DECLARE
  v_integrity jsonb;
  v_manifest_sha256 text;
  v_postgres_major integer;
BEGIN
  v_integrity:=public.tyt_social_snapshot_boundary_integrity();
  IF v_integrity IS NULL OR jsonb_typeof(v_integrity)<>'object'
    OR NOT COALESCE((v_integrity->>'ready')::boolean,false) THEN
    RAISE EXCEPTION 'TYT Social snapshot boundary postcheck failed: %',v_integrity
      USING ERRCODE='23514';
  END IF;
  v_manifest_sha256:=public.tyt_social_snapshot_boundary_manifest_sha256();
  IF v_manifest_sha256 IS NULL THEN
    RAISE EXCEPTION 'TYT Social snapshot manifest is incomplete'
      USING ERRCODE='23514';
  END IF;
  v_postgres_major:=current_setting('server_version_num')::integer/10000;

  INSERT INTO public.tyt_social_policy_capabilities(
    policy_version,capability,capability_version,manifest_sha256,evidence
  ) VALUES (
    'tyt-social-2026-v1','snapshot_boundary_v1',1,v_manifest_sha256,
    jsonb_build_object(
      'semanticAggregateCheck','passed',
      'attemptConstraintTrigger','trg_tyt_social_attempt_snapshot_integrity',
      'planConstraintTrigger','trg_tyt_social_plan_snapshot_integrity',
      'attemptParentGuard','trg_guard_tyt_social_attempt_parent_update',
      'planParentGuard','trg_guard_tyt_social_plan_parent_update',
      'manifestFormatVersion',1,
      'postgresMajor',v_postgres_major,
      'integrity',v_integrity
    )
  ) ON CONFLICT (policy_version,capability,capability_version) DO NOTHING;
  IF NOT EXISTS (
    SELECT 1 FROM public.tyt_social_policy_capabilities
    WHERE policy_version='tyt-social-2026-v1'
      AND capability='snapshot_boundary_v1' AND capability_version=1
      AND manifest_sha256=v_manifest_sha256
      AND evidence @> jsonb_build_object(
        'semanticAggregateCheck','passed',
        'manifestFormatVersion',1,
        'postgresMajor',v_postgres_major
      )
  ) THEN
    RAISE EXCEPTION 'TYT Social snapshot capability drifted' USING ERRCODE='23514';
  END IF;
END
$fn$;

DO $fn$
DECLARE
  v_candidate_integrity jsonb;
BEGIN
  v_candidate_integrity:=public.tyt_social_candidate_policy_integrity();
  IF v_candidate_integrity IS NULL OR jsonb_typeof(v_candidate_integrity)<>'object'
    OR NOT COALESCE((v_candidate_integrity->>'snapshotBoundaryReady')::boolean,false) THEN
    RAISE EXCEPTION 'TYT Social capability is not visible to release integrity: %',v_candidate_integrity
      USING ERRCODE='23514';
  END IF;
  IF (SELECT count(*) FROM public.curriculum_scope_releases
      WHERE game='sosyal' AND display_exam_ref='TYT'
        AND question_exam_ref='TYT' AND taxonomy_version='ba-tyt-sosyal-v1'
        AND release_status='validating' AND NOT diagnostic_enabled)<>1 THEN
    RAISE EXCEPTION 'migration 206 must leave TYT Social fail-closed in validating state'
      USING ERRCODE='23514';
  END IF;
END
$fn$;

REVOKE ALL ON FUNCTION public.assert_tyt_social_attempt_snapshot_integrity(uuid),
  public.tg_assert_tyt_social_attempt_snapshot_integrity(),
  public.assert_tyt_social_plan_snapshot_integrity(uuid),
  public.tg_assert_tyt_social_plan_snapshot_integrity(),
  public.tg_guard_tyt_social_attempt_parent_update(),
  public.tg_guard_tyt_social_plan_parent_update(),
  public.issue_verified_tyt_social_attempt_with_event(uuid,text,uuid[],integer,uuid,text,uuid,text,uuid),
  public.issue_verified_tyt_social_attempt(uuid,text,uuid[],integer,uuid),
  public.issue_verified_tyt_social_section_attempt(uuid,uuid[],integer,uuid),
  public.issue_verified_tyt_social_plan_attempt(uuid,uuid,text,integer,uuid),
  public.issue_verified_tyt_social_exam_attempt(uuid,text,jsonb,integer,integer,uuid),
  public.filter_tyt_social_question_candidates(uuid,uuid[]),
  public.create_tyt_social_daily_plan_v2(uuid,date,jsonb),
  public.tyt_social_snapshot_boundary_integrity()
FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION
  public.issue_verified_tyt_social_attempt(uuid,text,uuid[],integer,uuid),
  public.issue_verified_tyt_social_section_attempt(uuid,uuid[],integer,uuid),
  public.issue_verified_tyt_social_plan_attempt(uuid,uuid,text,integer,uuid),
  public.issue_verified_tyt_social_exam_attempt(uuid,text,jsonb,integer,integer,uuid),
  public.filter_tyt_social_question_candidates(uuid,uuid[]),
  public.create_tyt_social_daily_plan_v2(uuid,date,jsonb),
  public.tyt_social_snapshot_boundary_integrity()
TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
