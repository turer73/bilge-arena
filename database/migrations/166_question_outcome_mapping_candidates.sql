-- Migration 166: legacy kazanım borcunu yayın tablosuna dokunmadan yönetişimli
-- bir aday kuyruğuna al.
--
-- Kategori/exam kapsamı yalnızca yapısal bir aday üretir; pedagojik doğruluk
-- kanıtı değildir. Bu migration bu nedenle public.question_outcomes'a toplu
-- yazmaz. Tek-aday kayıtları ancak AAL2 + content.prepare sahibi bir insanın
-- açık gerekçesiyle mevcut draft revizyona aktarılır. Ardından migration 164'ün
-- iki bağımsız review ve publish kapıları aynen çalışır. Katalog boşlukları ve
-- birden çok aday ise yalnız inceleme kuyruğunda görünür.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS public.question_outcome_mapping_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  base_revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  scope_game text NOT NULL CHECK (char_length(btrim(scope_game)) BETWEEN 1 AND 20),
  scope_category text NOT NULL CHECK (char_length(btrim(scope_category)) BETWEEN 1 AND 120),
  scope_exam_ref text CHECK (scope_exam_ref IS NULL OR char_length(scope_exam_ref) <= 20),
  candidate_kind text NOT NULL CHECK (candidate_kind IN ('exact_scope','catalog_gap','ambiguous')),
  proposed_outcome_id uuid REFERENCES public.curriculum_outcomes(id) ON DELETE RESTRICT,
  candidate_count integer NOT NULL CHECK (candidate_count >= 0),
  candidate_set_sha256 text NOT NULL CHECK (candidate_set_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  strategy_version text NOT NULL CHECK (char_length(strategy_version) BETWEEN 1 AND 80),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','transferred','rejected','stale')),
  generated_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  generated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  resolved_at timestamptz,
  resolution_revision_id uuid REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  resolution_rationale text CHECK (
    resolution_rationale IS NULL OR char_length(btrim(resolution_rationale)) BETWEEN 10 AND 1000
  ),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(question_id,evidence_sha256),
  CHECK (
    (candidate_kind='exact_scope' AND proposed_outcome_id IS NOT NULL AND candidate_count=1)
    OR (candidate_kind='catalog_gap' AND proposed_outcome_id IS NULL AND candidate_count=0)
    OR (candidate_kind='ambiguous' AND proposed_outcome_id IS NULL AND candidate_count>1)
  ),
  CHECK (
    (status='pending' AND resolved_by IS NULL AND resolved_at IS NULL
      AND resolution_revision_id IS NULL AND resolution_rationale IS NULL)
    OR (status='stale' AND resolved_by IS NULL AND resolved_at IS NOT NULL
      AND resolution_revision_id IS NULL AND resolution_rationale IS NULL)
    OR (status='rejected' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL
      AND resolution_revision_id IS NULL AND resolution_rationale IS NOT NULL)
    OR (status='transferred' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL
      AND resolution_revision_id IS NOT NULL AND resolution_rationale IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS question_outcome_mapping_one_pending_per_question
  ON public.question_outcome_mapping_candidates(question_id)
  WHERE status='pending';
CREATE INDEX IF NOT EXISTS question_outcome_mapping_candidate_queue_idx
  ON public.question_outcome_mapping_candidates(status,candidate_kind,generated_at,id);

CREATE TABLE IF NOT EXISTS public.question_outcome_mapping_candidate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.question_outcome_mapping_candidates(id) ON DELETE RESTRICT,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('generated','stale','reopened','transferred','rejected')),
  request_id uuid NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(candidate_id,event_type,request_id)
);

CREATE INDEX IF NOT EXISTS question_outcome_mapping_candidate_events_idx
  ON public.question_outcome_mapping_candidate_events(candidate_id,created_at,id);

ALTER TABLE public.question_outcome_mapping_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_outcome_mapping_candidate_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.question_outcome_mapping_candidates,
  public.question_outcome_mapping_candidate_events
FROM PUBLIC, anon, authenticated, service_role;

-- JWT'li doğrudan çağrıda aktör kimliği eşleşmeli ve token AAL2 olmalı.
-- service_role JWT'sinde kullanıcı subject'i bulunmadığından güvenilen sunucu
-- rol iddiası ayrıca p_actor_user_id izniyle sınırlandırılır. Claim'siz çağrı
-- kabul edilmez. Fonksiyonlar authenticated'a açık değildir; bu kontrol
-- gelecekte yanlış grant verilmesine karşı da kapıdır.
CREATE OR REPLACE FUNCTION public.question_outcome_mapping_actor_has_aal2(p_actor_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
  SELECT p_actor_user_id IS NOT NULL
    AND (
      (auth.uid() IS NULL AND COALESCE(auth.jwt() ->> 'role','')='service_role')
      OR (
        auth.uid() IS NOT DISTINCT FROM p_actor_user_id
        AND COALESCE(auth.jwt() ->> 'aal','aal1')='aal2'
      )
    )
$fn$;

-- Migration 164 coverage sözleşmesinin reusable biçimi: yalnız bir adet geçerli
-- satır bulmak yeterli değildir. 1-5 mapping, tam bir primary ve mapping'lerin
-- tamamında exact-scope kanıtı birlikte gerekir.
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
      JOIN public.questions question ON question.id=mapping.question_id
      WHERE mapping.question_id=p_question_id
        AND NOT public.curriculum_outcome_scope_valid(
          mapping.outcome_id,question.game,question.category,question.exam_ref
        )
    )
$fn$;

-- İç kullanım: aktif ve exact-scope mapping'i olmayan, yayın pointer/hash/scope
-- bütünlüğü sağlam sorular için deterministik snapshot üretir. Soru metni veya
-- cevap anahtarı hiçbir dış RPC sonucuna dahil edilmez.
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
      revision.exam_ref AS scope_exam_ref
    FROM public.questions question
    JOIN public.question_content_revisions revision
      ON revision.id=question.published_revision_id
      AND revision.question_id=question.id
      AND revision.status='published'
    WHERE question.is_active
      AND revision.game IS NOT DISTINCT FROM question.game
      AND revision.category IS NOT DISTINCT FROM question.category
      AND revision.exam_ref IS NOT DISTINCT FROM question.exam_ref
      AND revision.content_sha256=
        encode(extensions.digest(question.content::text,'sha256'),'hex')
      AND NOT public.question_active_outcome_mapping_valid(question.id)
  ), candidate_sets AS (
    SELECT eligible.*,
      ARRAY(
        SELECT outcome.id
        FROM public.curriculum_outcomes outcome
        WHERE public.curriculum_outcome_scope_valid(
          outcome.id,eligible.scope_game,eligible.scope_category,eligible.scope_exam_ref
        )
        ORDER BY outcome.id
      ) AS candidate_ids,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(outcome) ORDER BY outcome.id)
        FROM public.curriculum_outcomes outcome
        WHERE public.curriculum_outcome_scope_valid(
          outcome.id,eligible.scope_game,eligible.scope_category,eligible.scope_exam_ref
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
      -- ID kadar code/title/taxonomy/node ve aktivasyon metadatasını da hash'e
      -- bağla; katalog anlamı değişirse eski insan kararı taşınamasın.
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

CREATE OR REPLACE FUNCTION public.get_question_outcome_mapping_candidate_summary(p_actor_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.question_outcome_mapping_actor_has_aal2(p_actor_user_id)
    OR NOT public.content_governance_has_permission(p_actor_user_id,'content.prepare') THEN
    RAISE EXCEPTION 'AAL2 content prepare permission required' USING ERRCODE='42501';
  END IF;

  WITH active_bank AS (
    SELECT question.id,
      public.question_active_outcome_mapping_valid(question.id) AS has_valid_mapping
    FROM public.questions question
    WHERE question.is_active
  ), snapshot AS (
    SELECT * FROM public.question_outcome_mapping_candidate_snapshot()
  ), live_counts AS (
    SELECT
      (SELECT count(*) FROM active_bank)::integer AS active_questions,
      (SELECT count(*) FROM active_bank WHERE has_valid_mapping)::integer AS valid_mapped,
      (SELECT count(*) FROM active_bank WHERE NOT has_valid_mapping)::integer AS active_unmapped,
      (SELECT count(*) FROM snapshot)::integer AS queue_eligible,
      (SELECT count(*) FROM snapshot WHERE candidate_kind='exact_scope')::integer AS exact_candidate,
      (SELECT count(*) FROM snapshot WHERE candidate_kind='catalog_gap')::integer AS catalog_gap,
      (SELECT count(*) FROM snapshot WHERE candidate_kind='ambiguous')::integer AS ambiguous
  ), pending_counts AS (
    SELECT
      count(*) FILTER (WHERE status='pending')::integer AS pending_total,
      count(*) FILTER (WHERE status='pending' AND candidate_kind='exact_scope')::integer AS pending_exact,
      count(*) FILTER (WHERE status='pending' AND candidate_kind='catalog_gap')::integer AS pending_gap,
      count(*) FILTER (WHERE status='pending' AND candidate_kind='ambiguous')::integer AS pending_ambiguous
    FROM public.question_outcome_mapping_candidates
  )
  SELECT jsonb_build_object(
    'strategyVersion','exact-scope-candidate@1',
    'activeQuestions',live_counts.active_questions,
    'validMapped',live_counts.valid_mapped,
    'activeUnmapped',live_counts.active_unmapped,
    'queueEligible',live_counts.queue_eligible,
    'integrityGap',live_counts.active_unmapped-live_counts.queue_eligible,
    'exactCandidate',live_counts.exact_candidate,
    'catalogGap',live_counts.catalog_gap,
    'ambiguous',live_counts.ambiguous,
    'pendingTotal',pending_counts.pending_total,
    'pendingExact',pending_counts.pending_exact,
    'pendingCatalogGap',pending_counts.pending_gap,
    'pendingAmbiguous',pending_counts.pending_ambiguous
  ) INTO v_result
  FROM live_counts CROSS JOIN pending_counts;

  RETURN v_result;
END
$fn$;

CREATE OR REPLACE FUNCTION public.enqueue_question_outcome_mapping_candidates(
  p_actor_user_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_old public.content_governance_requests%ROWTYPE;
  v_hash text;
  v_result jsonb;
  v_snapshot_rows jsonb;
  v_stale_count integer := 0;
  v_reopened_count integer := 0;
  v_inserted_count integer := 0;
BEGIN
  IF NOT public.question_outcome_mapping_actor_has_aal2(p_actor_user_id)
    OR NOT public.content_governance_has_permission(p_actor_user_id,'content.prepare') THEN
    RAISE EXCEPTION 'AAL2 content prepare permission required' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'request id required' USING ERRCODE='22023';
  END IF;

  PERFORM set_config('lock_timeout','5s',true);
  PERFORM set_config('statement_timeout','120s',true);

  PERFORM public.content_governance_lock_request(
    p_actor_user_id,'enqueue_outcome_candidates',p_request_id
  );
  v_hash:=public.content_governance_hash(jsonb_build_object(
    'strategyVersion','exact-scope-candidate@1'
  ));
  SELECT * INTO v_old
  FROM public.content_governance_requests
  WHERE user_id=p_actor_user_id
    AND operation='enqueue_outcome_candidates'
    AND request_id=p_request_id;
  IF FOUND THEN
    IF v_old.payload_hash<>v_hash THEN
      RAISE EXCEPTION 'candidate enqueue request payload mismatch' USING ERRCODE='22023';
    END IF;
    RETURN v_old.result||jsonb_build_object('replayed',true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('question-outcome-candidate-enqueue',166));

  -- READ COMMITTED her SQL statementına yeni snapshot verebilir. Publish veya
  -- taxonomy değişimi stale/reopen/insert adımları arasına girip iki farklı
  -- evidence satırını aynı partial-unique kuyruğa sokmasın: canlı snapshotı bir
  -- kez al, sonraki üç DML adımında aynı immutable JSON satır setini kullan.
  SELECT COALESCE(jsonb_agg(to_jsonb(snapshot) ORDER BY snapshot.question_id),'[]'::jsonb)
  INTO v_snapshot_rows
  FROM public.question_outcome_mapping_candidate_snapshot() snapshot;

  -- JSON satır seti snapshot fonksiyonunu aday başına yeniden taratmaz; banka
  -- ve katalog yalnız yukarıdaki tek salt-okunur sorguda değerlendirilir.
  WITH current_snapshot AS (
    SELECT (item->>'question_id')::uuid AS question_id,
      item->>'evidence_sha256' AS evidence_sha256
    FROM jsonb_array_elements(v_snapshot_rows) item
  ), staled AS (
    UPDATE public.question_outcome_mapping_candidates candidate
    SET status='stale',resolved_at=clock_timestamp(),updated_at=clock_timestamp()
    WHERE candidate.status='pending'
      AND NOT EXISTS (
        SELECT 1 FROM current_snapshot snapshot
        WHERE snapshot.question_id=candidate.question_id
          AND snapshot.evidence_sha256=candidate.evidence_sha256
      )
    RETURNING candidate.id,candidate.question_id
  ), event_rows AS (
    INSERT INTO public.question_outcome_mapping_candidate_events(
      candidate_id,question_id,actor_id,event_type,request_id,details
    )
    SELECT staled.id,staled.question_id,p_actor_user_id,'stale',p_request_id,
      jsonb_build_object('reason','snapshot_changed')
    FROM staled
    RETURNING id
  )
  SELECT count(*)::integer INTO v_stale_count FROM event_rows;

  -- Aynı kanıt A→B→A şeklinde geri dönerse UNIQUE history satırı backlog'u
  -- sonsuza dek yutmamalı. Aynı şekilde aktarılan draft bağımsız review'da
  -- reddedilmişse aday tekrar insan kuyruğuna döner. Açık/review edilen draft
  -- otomatik açılmaz; önce mevcut governance akışında reddedilmelidir.
  WITH current_snapshot AS (
    SELECT (item->>'question_id')::uuid AS question_id,
      item->>'evidence_sha256' AS evidence_sha256
    FROM jsonb_array_elements(v_snapshot_rows) item
  ), reopened AS (
    UPDATE public.question_outcome_mapping_candidates candidate
    SET status='pending',resolved_by=NULL,resolved_at=NULL,
      resolution_revision_id=NULL,resolution_rationale=NULL,
      updated_at=clock_timestamp()
    FROM current_snapshot snapshot
    WHERE candidate.question_id=snapshot.question_id
      AND candidate.evidence_sha256=snapshot.evidence_sha256
      AND (
        candidate.status='stale'
        OR (
          candidate.status='transferred'
          AND EXISTS (
            SELECT 1
            FROM public.question_content_revisions resolution
            WHERE resolution.id=candidate.resolution_revision_id
              AND resolution.status='rejected'
          )
        )
      )
    RETURNING candidate.id,candidate.question_id
  ), event_rows AS (
    INSERT INTO public.question_outcome_mapping_candidate_events(
      candidate_id,question_id,actor_id,event_type,request_id,details
    )
    SELECT reopened.id,reopened.question_id,p_actor_user_id,'reopened',p_request_id,
      jsonb_build_object('reason','evidence_current_again')
    FROM reopened
    RETURNING id
  )
  SELECT count(*)::integer INTO v_reopened_count FROM event_rows;

  WITH current_snapshot AS (
    SELECT
      (item->>'question_id')::uuid AS question_id,
      (item->>'base_revision_id')::uuid AS base_revision_id,
      item->>'content_sha256' AS content_sha256,
      item->>'scope_game' AS scope_game,
      item->>'scope_category' AS scope_category,
      item->>'scope_exam_ref' AS scope_exam_ref,
      item->>'candidate_kind' AS candidate_kind,
      (item->>'proposed_outcome_id')::uuid AS proposed_outcome_id,
      (item->>'candidate_count')::integer AS candidate_count,
      item->>'candidate_set_sha256' AS candidate_set_sha256,
      item->>'evidence_sha256' AS evidence_sha256
    FROM jsonb_array_elements(v_snapshot_rows) item
  ), generated AS (
    INSERT INTO public.question_outcome_mapping_candidates(
      question_id,base_revision_id,content_sha256,scope_game,scope_category,
      scope_exam_ref,candidate_kind,proposed_outcome_id,candidate_count,
      candidate_set_sha256,evidence_sha256,strategy_version,generated_by
    )
    SELECT snapshot.question_id,snapshot.base_revision_id,snapshot.content_sha256,
      snapshot.scope_game,snapshot.scope_category,snapshot.scope_exam_ref,
      snapshot.candidate_kind,snapshot.proposed_outcome_id,snapshot.candidate_count,
      snapshot.candidate_set_sha256,snapshot.evidence_sha256,
      'exact-scope-candidate@1',p_actor_user_id
    FROM current_snapshot snapshot
    ON CONFLICT(question_id,evidence_sha256) DO NOTHING
    RETURNING id,question_id,candidate_kind,candidate_count
  ), event_rows AS (
    INSERT INTO public.question_outcome_mapping_candidate_events(
      candidate_id,question_id,actor_id,event_type,request_id,details
    )
    SELECT generated.id,generated.question_id,p_actor_user_id,'generated',p_request_id,
      jsonb_build_object(
        'candidateKind',generated.candidate_kind,
        'candidateCount',generated.candidate_count,
        'strategyVersion','exact-scope-candidate@1'
      )
    FROM generated
    RETURNING id
  )
  SELECT count(*)::integer INTO v_inserted_count FROM event_rows;

  SELECT jsonb_build_object(
    'strategyVersion','exact-scope-candidate@1',
    'inserted',v_inserted_count,
    'staled',v_stale_count,
    'reopened',v_reopened_count,
    'pendingTotal',count(*) FILTER (WHERE status='pending'),
    'pendingExact',count(*) FILTER (WHERE status='pending' AND candidate_kind='exact_scope'),
    'pendingCatalogGap',count(*) FILTER (WHERE status='pending' AND candidate_kind='catalog_gap'),
    'pendingAmbiguous',count(*) FILTER (WHERE status='pending' AND candidate_kind='ambiguous'),
    'replayed',false
  ) INTO v_result
  FROM public.question_outcome_mapping_candidates;

  INSERT INTO public.content_governance_requests
  VALUES(
    p_actor_user_id,'enqueue_outcome_candidates',p_request_id,
    v_hash,v_result,clock_timestamp()
  );
  RETURN v_result;
END
$fn$;

CREATE OR REPLACE FUNCTION public.list_question_outcome_mapping_candidates(
  p_actor_user_id uuid,
  p_status text,
  p_candidate_kind text,
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.question_outcome_mapping_actor_has_aal2(p_actor_user_id)
    OR NOT public.content_governance_has_permission(p_actor_user_id,'content.prepare') THEN
    RAISE EXCEPTION 'AAL2 content prepare permission required' USING ERRCODE='42501';
  END IF;
  IF (p_status IS NOT NULL AND p_status NOT IN ('pending','transferred','rejected','stale'))
    OR (p_candidate_kind IS NOT NULL AND p_candidate_kind NOT IN ('exact_scope','catalog_gap','ambiguous'))
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000000 THEN
    RAISE EXCEPTION 'invalid candidate queue filter' USING ERRCODE='22023';
  END IF;

  WITH filtered AS (
    SELECT candidate.*,outcome.code AS outcome_code,outcome.title AS outcome_title,
      outcome.taxonomy_version
    FROM public.question_outcome_mapping_candidates candidate
    LEFT JOIN public.curriculum_outcomes outcome ON outcome.id=candidate.proposed_outcome_id
    WHERE (p_status IS NULL OR candidate.status=p_status)
      AND (p_candidate_kind IS NULL OR candidate.candidate_kind=p_candidate_kind)
  ), page AS (
    SELECT * FROM filtered
    ORDER BY generated_at,id
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'total',(SELECT count(*) FROM filtered),
    'items',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'candidateId',page.id,
        'questionId',page.question_id,
        'baseRevisionId',page.base_revision_id,
        'game',page.scope_game,
        'category',page.scope_category,
        'examRef',page.scope_exam_ref,
        'candidateKind',page.candidate_kind,
        'candidateCount',page.candidate_count,
        'proposedOutcomeId',page.proposed_outcome_id,
        'outcomeCode',page.outcome_code,
        'outcomeTitle',page.outcome_title,
        'taxonomyVersion',page.taxonomy_version,
        'strategyVersion',page.strategy_version,
        'status',page.status,
        'generatedAt',page.generated_at,
        'resolvedAt',page.resolved_at
      ) ORDER BY page.generated_at,page.id)
      FROM page
    ),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END
$fn$;

CREATE OR REPLACE FUNCTION public.transfer_question_outcome_mapping_candidate(
  p_actor_user_id uuid,
  p_candidate_id uuid,
  p_revision_id uuid,
  p_rationale text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_candidate public.question_outcome_mapping_candidates%ROWTYPE;
  v_revision public.question_content_revisions%ROWTYPE;
  v_old public.content_governance_requests%ROWTYPE;
  v_hash text;
  v_mapping_result jsonb;
  v_result jsonb;
BEGIN
  IF NOT public.question_outcome_mapping_actor_has_aal2(p_actor_user_id)
    OR NOT public.content_governance_has_permission(p_actor_user_id,'content.prepare') THEN
    RAISE EXCEPTION 'AAL2 content prepare permission required' USING ERRCODE='42501';
  END IF;
  IF p_candidate_id IS NULL OR p_revision_id IS NULL OR p_request_id IS NULL
    OR char_length(btrim(COALESCE(p_rationale,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'candidate, revision, rationale and request id required' USING ERRCODE='22023';
  END IF;

  PERFORM set_config('lock_timeout','5s',true);

  PERFORM public.content_governance_lock_request(
    p_actor_user_id,'transfer_outcome_candidate',p_request_id
  );
  v_hash:=public.content_governance_hash(jsonb_build_object(
    'candidateId',p_candidate_id,'revisionId',p_revision_id,
    'rationale',btrim(p_rationale)
  ));
  SELECT * INTO v_old
  FROM public.content_governance_requests
  WHERE user_id=p_actor_user_id
    AND operation='transfer_outcome_candidate'
    AND request_id=p_request_id;
  IF FOUND THEN
    IF v_old.payload_hash<>v_hash THEN
      RAISE EXCEPTION 'candidate transfer request payload mismatch' USING ERRCODE='22023';
    END IF;
    RETURN v_old.result||jsonb_build_object('replayed',true);
  END IF;

  SELECT * INTO v_candidate
  FROM public.question_outcome_mapping_candidates
  WHERE id=p_candidate_id
  FOR UPDATE;
  IF NOT FOUND OR v_candidate.status<>'pending'
    OR v_candidate.candidate_kind<>'exact_scope'
    OR v_candidate.proposed_outcome_id IS NULL THEN
    RAISE EXCEPTION 'pending exact-scope candidate required' USING ERRCODE='22023';
  END IF;

  -- Publish de önce revision, sonra question satırını kilitler (migration 164).
  -- Aynı sıra, transfer/review/publish yarışında ters kilit deadlock'unu önler.
  SELECT * INTO v_revision
  FROM public.question_content_revisions
  WHERE id=p_revision_id
  FOR UPDATE;
  IF NOT FOUND OR v_revision.question_id<>v_candidate.question_id
    OR v_revision.base_revision_id IS DISTINCT FROM v_candidate.base_revision_id
    OR v_revision.status NOT IN ('draft','stage1_approved')
    OR v_revision.game IS DISTINCT FROM v_candidate.scope_game
    OR v_revision.category IS DISTINCT FROM v_candidate.scope_category
    OR v_revision.exam_ref IS DISTINCT FROM v_candidate.scope_exam_ref
    OR EXISTS (
      SELECT 1 FROM public.question_revision_outcomes mapping
      WHERE mapping.revision_id=p_revision_id
    ) THEN
    RAISE EXCEPTION 'empty matching draft revision required' USING ERRCODE='22023';
  END IF;

  -- Freshness kontrolüyle mapping yazımı arasında question veya taxonomy drift
  -- etmesin. Kısa lock timeout içerik yayını/katalog bakımını bekletmek yerine
  -- insan işlemini fail-closed yeniden denemeye gönderir.
  PERFORM question.id
  FROM public.questions question
  WHERE question.id=v_candidate.question_id
  FOR SHARE OF question;
  PERFORM revision.id
  FROM public.question_content_revisions revision
  WHERE revision.id=v_candidate.base_revision_id
  FOR SHARE OF revision;
  LOCK TABLE public.curriculum_outcomes IN SHARE MODE;
  LOCK TABLE public.curriculum_nodes IN SHARE MODE;

  IF NOT EXISTS (
    SELECT 1 FROM public.question_outcome_mapping_candidate_snapshot() snapshot
    WHERE snapshot.question_id=v_candidate.question_id
      AND snapshot.evidence_sha256=v_candidate.evidence_sha256
      AND snapshot.proposed_outcome_id=v_candidate.proposed_outcome_id
  ) THEN
    RAISE EXCEPTION 'candidate evidence is stale' USING ERRCODE='22023';
  END IF;

  v_mapping_result:=public.set_question_revision_outcomes(
    p_actor_user_id,p_revision_id,
    jsonb_build_array(jsonb_build_object(
      'outcomeId',v_candidate.proposed_outcome_id,
      'weight',1,
      'primary',true
    )),
    p_request_id
  );

  UPDATE public.question_outcome_mapping_candidates
  SET status='transferred',resolved_by=p_actor_user_id,resolved_at=clock_timestamp(),
    resolution_revision_id=p_revision_id,resolution_rationale=btrim(p_rationale),
    updated_at=clock_timestamp()
  WHERE id=p_candidate_id;
  INSERT INTO public.question_outcome_mapping_candidate_events(
    candidate_id,question_id,actor_id,event_type,request_id,details
  ) VALUES (
    p_candidate_id,v_candidate.question_id,p_actor_user_id,'transferred',p_request_id,
    jsonb_build_object(
      'revisionId',p_revision_id,
      'outcomeId',v_candidate.proposed_outcome_id,
      'rationale',btrim(p_rationale),
      'mappingChanged',COALESCE((v_mapping_result->>'mappingChanged')::boolean,false)
    )
  );
  v_result:=jsonb_build_object(
    'candidateId',p_candidate_id,
    'questionId',v_candidate.question_id,
    'revisionId',p_revision_id,
    'status','transferred',
    'mappingStatus',v_mapping_result->>'status',
    'replayed',false
  );
  INSERT INTO public.content_governance_requests
  VALUES(
    p_actor_user_id,'transfer_outcome_candidate',p_request_id,
    v_hash,v_result,clock_timestamp()
  );
  RETURN v_result;
END
$fn$;

CREATE OR REPLACE FUNCTION public.reject_question_outcome_mapping_candidate(
  p_actor_user_id uuid,
  p_candidate_id uuid,
  p_rationale text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_candidate public.question_outcome_mapping_candidates%ROWTYPE;
  v_old public.content_governance_requests%ROWTYPE;
  v_hash text;
  v_result jsonb;
BEGIN
  IF NOT public.question_outcome_mapping_actor_has_aal2(p_actor_user_id)
    OR NOT public.content_governance_has_permission(p_actor_user_id,'content.prepare') THEN
    RAISE EXCEPTION 'AAL2 content prepare permission required' USING ERRCODE='42501';
  END IF;
  IF p_candidate_id IS NULL OR p_request_id IS NULL
    OR char_length(btrim(COALESCE(p_rationale,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'candidate, rationale and request id required' USING ERRCODE='22023';
  END IF;

  PERFORM set_config('lock_timeout','5s',true);

  PERFORM public.content_governance_lock_request(
    p_actor_user_id,'reject_outcome_candidate',p_request_id
  );
  v_hash:=public.content_governance_hash(jsonb_build_object(
    'candidateId',p_candidate_id,'rationale',btrim(p_rationale)
  ));
  SELECT * INTO v_old
  FROM public.content_governance_requests
  WHERE user_id=p_actor_user_id
    AND operation='reject_outcome_candidate'
    AND request_id=p_request_id;
  IF FOUND THEN
    IF v_old.payload_hash<>v_hash THEN
      RAISE EXCEPTION 'candidate rejection request payload mismatch' USING ERRCODE='22023';
    END IF;
    RETURN v_old.result||jsonb_build_object('replayed',true);
  END IF;

  SELECT * INTO v_candidate
  FROM public.question_outcome_mapping_candidates
  WHERE id=p_candidate_id
  FOR UPDATE;
  IF NOT FOUND OR v_candidate.status<>'pending' THEN
    RAISE EXCEPTION 'pending candidate required' USING ERRCODE='22023';
  END IF;

  UPDATE public.question_outcome_mapping_candidates
  SET status='rejected',resolved_by=p_actor_user_id,resolved_at=clock_timestamp(),
    resolution_rationale=btrim(p_rationale),updated_at=clock_timestamp()
  WHERE id=p_candidate_id;
  INSERT INTO public.question_outcome_mapping_candidate_events(
    candidate_id,question_id,actor_id,event_type,request_id,details
  ) VALUES (
    p_candidate_id,v_candidate.question_id,p_actor_user_id,'rejected',p_request_id,
    jsonb_build_object('rationale',btrim(p_rationale))
  );
  v_result:=jsonb_build_object(
    'candidateId',p_candidate_id,'questionId',v_candidate.question_id,
    'status','rejected','replayed',false
  );
  INSERT INTO public.content_governance_requests
  VALUES(
    p_actor_user_id,'reject_outcome_candidate',p_request_id,
    v_hash,v_result,clock_timestamp()
  );
  RETURN v_result;
END
$fn$;

REVOKE ALL ON FUNCTION
  public.question_outcome_mapping_actor_has_aal2(uuid),
  public.question_active_outcome_mapping_valid(uuid),
  public.question_outcome_mapping_candidate_snapshot(),
  public.get_question_outcome_mapping_candidate_summary(uuid),
  public.enqueue_question_outcome_mapping_candidates(uuid,uuid),
  public.list_question_outcome_mapping_candidates(uuid,text,text,integer,integer),
  public.transfer_question_outcome_mapping_candidate(uuid,uuid,uuid,text,uuid),
  public.reject_question_outcome_mapping_candidate(uuid,uuid,text,uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.get_question_outcome_mapping_candidate_summary(uuid),
  public.enqueue_question_outcome_mapping_candidates(uuid,uuid)
TO service_role;

-- İnsan kararları service_role ile vekaleten verilemez. Cookie/JWT istemcisi
-- doğrudan kendi auth.uid + aal2 claim'iyle gelir; fonksiyon ayrıca content.prepare
-- iznini ve her kararda append-only audit event'ini zorunlu tutar.
GRANT EXECUTE ON FUNCTION
  public.get_question_outcome_mapping_candidate_summary(uuid),
  public.list_question_outcome_mapping_candidates(uuid,text,text,integer,integer),
  public.transfer_question_outcome_mapping_candidate(uuid,uuid,uuid,text,uuid),
  public.reject_question_outcome_mapping_candidate(uuid,uuid,text,uuid)
TO authenticated;

DO $verify$
BEGIN
  IF has_table_privilege('authenticated','public.question_outcome_mapping_candidates','SELECT')
    OR has_table_privilege('service_role','public.question_outcome_mapping_candidates','SELECT')
    OR has_table_privilege('authenticated','public.question_outcome_mapping_candidate_events','SELECT')
    OR has_table_privilege('service_role','public.question_outcome_mapping_candidate_events','SELECT') THEN
    RAISE EXCEPTION '166 verification: candidate tables must remain RPC-only';
  END IF;
  IF has_function_privilege(
      'authenticated','public.enqueue_question_outcome_mapping_candidates(uuid,uuid)','EXECUTE'
    ) OR NOT has_function_privilege(
      'service_role','public.enqueue_question_outcome_mapping_candidates(uuid,uuid)','EXECUTE'
    ) OR NOT has_function_privilege(
      'authenticated','public.transfer_question_outcome_mapping_candidate(uuid,uuid,uuid,text,uuid)','EXECUTE'
    ) OR has_function_privilege(
      'service_role','public.transfer_question_outcome_mapping_candidate(uuid,uuid,uuid,text,uuid)','EXECUTE'
    ) THEN
    RAISE EXCEPTION '166 verification: candidate RPC grants are not fail-closed';
  END IF;
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
