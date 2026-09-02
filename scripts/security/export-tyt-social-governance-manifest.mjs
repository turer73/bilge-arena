import { createHash } from 'node:crypto'
import pg from 'pg'

const connectionString = process.env.TYT_SOCIAL_AUDIT_DATABASE_URL
const readOnlyAcknowledged = process.env.TYT_SOCIAL_AUDIT_DATABASE_READ_ONLY === '1'

if (process.argv.length !== 2) {
  throw new Error('This audit accepts no command-line options and has no apply mode.')
}
if (!connectionString || !readOnlyAcknowledged) {
  throw new Error(
    'TYT_SOCIAL_AUDIT_DATABASE_URL and TYT_SOCIAL_AUDIT_DATABASE_READ_ONLY=1 are required.',
  )
}

const major = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10)
if (!Number.isInteger(major) || major < 22) {
  throw new Error('Node.js 22 or newer is required.')
}

const client = new pg.Client({
  connectionString,
  application_name: 'bilge-tyt-social-read-only-manifest',
})

const policySql = `
SELECT count(*)::integer AS policy_count,
  min(policy.policy_version) AS policy_version
FROM public.exam_candidate_policy_versions AS policy
WHERE policy.game = 'sosyal'
  AND policy.display_exam_ref = 'TYT'
  AND policy.status = 'released'
  AND current_date >= policy.valid_from
  AND (policy.valid_until IS NULL OR current_date < policy.valid_until)
`

const manifestSql = `
WITH current_policy AS MATERIALIZED (
  SELECT policy.policy_version
  FROM public.exam_candidate_policy_versions AS policy
  WHERE policy.game = 'sosyal'
    AND policy.display_exam_ref = 'TYT'
    AND policy.status = 'released'
    AND current_date >= policy.valid_from
    AND (policy.valid_until IS NULL OR current_date < policy.valid_until)
), bank AS MATERIALIZED (
  SELECT
    question.id AS question_id,
    revision.id AS revision_id,
    revision.content_sha256,
    question.category::text AS category,
    question.difficulty,
    revision.status AS revision_status,
    revision.change_kind,
    source.source_kind,
    source.source_title,
    source.license_code,
    CASE WHEN source.provenance_ref IS NULL THEN NULL
      ELSE pg_catalog.encode(extensions.digest(source.provenance_ref, 'sha256'), 'hex')
    END AS provenance_sha256,
    stage_one.decision AS content_stage_one,
    stage_two.decision AS content_stage_two,
    stage_one.reviewer_id IS DISTINCT FROM stage_two.reviewer_id
      AND stage_one.reviewer_id IS DISTINCT FROM revision.prepared_by
      AND stage_two.reviewer_id IS DISTINCT FROM revision.prepared_by
      AND (revision.outcomes_prepared_by IS NULL OR (
        stage_one.reviewer_id IS DISTINCT FROM revision.outcomes_prepared_by
        AND stage_two.reviewer_id IS DISTINCT FROM revision.outcomes_prepared_by
      )) AS content_reviews_independent,
    COALESCE(outcomes.outcome_count, 0)::integer AS outcome_count,
    COALESCE(outcomes.primary_count, 0)::integer AS primary_outcome_count,
    policy.policy_version,
    approved.exam_role,
    candidate.id AS candidate_id,
    candidate.proposed_role,
    candidate.status AS candidate_status,
    source.source_kind IN (
      'original', 'licensed', 'public_domain', 'user_generated', 'official_exam'
    )
      AND revision.prepared_by IS NOT NULL
      AND revision.game IS NOT DISTINCT FROM question.game::text
      AND revision.category IS NOT DISTINCT FROM question.category::text
      AND upper(btrim(COALESCE(revision.exam_ref, ''))) = 'TYT'
      AND revision.difficulty IS NOT DISTINCT FROM question.difficulty
      AND revision.content_sha256 ~ '^[0-9a-f]{64}$'
      AND lower(source.license_code) <> 'legacy-import'
      AND NULLIF(btrim(COALESCE(source.provenance_ref, '')), '') IS NOT NULL
      AND lower(btrim(COALESCE(source.provenance_ref, ''))) NOT LIKE 'legacy:%'
      AND revision.change_kind <> 'legacy_import'
      AND revision.status = 'published'
      AND revision.published_at IS NOT NULL
      AND stage_one.decision = 'approved'
      AND stage_two.decision = 'approved'
      AND stage_one.reviewer_id IS DISTINCT FROM stage_two.reviewer_id
      AND stage_one.reviewer_id IS DISTINCT FROM revision.prepared_by
      AND stage_two.reviewer_id IS DISTINCT FROM revision.prepared_by
      AND (revision.outcomes_prepared_by IS NULL OR (
        stage_one.reviewer_id IS DISTINCT FROM revision.outcomes_prepared_by
        AND stage_two.reviewer_id IS DISTINCT FROM revision.outcomes_prepared_by
      )) AS source_policy_ready
  FROM public.questions AS question
  LEFT JOIN public.question_content_revisions AS revision
    ON revision.id = question.published_revision_id
   AND revision.question_id = question.id
  LEFT JOIN public.question_revision_sources AS source
    ON source.revision_id = revision.id
  LEFT JOIN public.question_revision_approvals AS stage_one
    ON stage_one.revision_id = revision.id AND stage_one.stage = 1
  LEFT JOIN public.question_revision_approvals AS stage_two
    ON stage_two.revision_id = revision.id AND stage_two.stage = 2
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS outcome_count,
      count(*) FILTER (WHERE mapping.is_primary)::integer AS primary_count
    FROM public.question_revision_outcomes AS mapping
    WHERE mapping.revision_id = revision.id
  ) AS outcomes ON true
  LEFT JOIN current_policy AS policy ON true
  LEFT JOIN public.question_revision_exam_roles AS approved
    ON approved.policy_version = policy.policy_version
   AND approved.revision_id = revision.id
  LEFT JOIN LATERAL (
    SELECT proposal.id, proposal.proposed_role, proposal.status
    FROM public.question_revision_exam_role_candidates AS proposal
    WHERE proposal.policy_version = policy.policy_version
      AND proposal.revision_id = revision.id
      AND proposal.status IN ('pending', 'stage1_approved')
    ORDER BY proposal.prepared_at DESC, proposal.id DESC
    LIMIT 1
  ) AS candidate ON true
  WHERE question.is_active
    AND question.game::text = 'sosyal'
    AND upper(btrim(COALESCE(question.exam_ref::text, ''))) = 'TYT'
)
SELECT * FROM bank ORDER BY question_id
`

function allowedRoles(category) {
  if (category === 'tarih') return ['common_history']
  if (category === 'cografya') return ['common_geography']
  if (category === 'din_kulturu') return ['standard_religion']
  if (category === 'felsefe' || category === 'sosyoloji') {
    return ['common_philosophy', 'alternate_philosophy']
  }
  return []
}

function buildManifest(rows) {
  const items = rows.map((row) => ({
    questionId: row.question_id,
    revisionId: row.revision_id,
    contentSha256: row.content_sha256,
    category: row.category,
    difficulty: row.difficulty,
    revisionStatus: row.revision_status,
    changeKind: row.change_kind,
    sourceKind: row.source_kind,
    sourceTitle: row.source_title,
    licenseCode: row.license_code,
    provenanceSha256: row.provenance_sha256,
    contentStageOne: row.content_stage_one,
    contentStageTwo: row.content_stage_two,
    contentReviewsIndependent: row.content_reviews_independent,
    outcomeCount: row.outcome_count,
    primaryOutcomeCount: row.primary_outcome_count,
    sourcePolicyReady: row.source_policy_ready,
    policyVersion: row.policy_version,
    allowedRoles: allowedRoles(row.category),
    requiresHumanRoleChoice: row.category === 'felsefe' || row.category === 'sosyoloji',
    candidateId: row.candidate_id,
    proposedRole: row.proposed_role,
    candidateStatus: row.candidate_status,
    approvedRole: row.exam_role,
  }))

  const countBy = (key) => Object.fromEntries(
    [...new Set(items.map((item) => item[key]).filter(Boolean))]
      .sort()
      .map((value) => [value, items.filter((item) => item[key] === value).length]),
  )
  const body = {
    schemaVersion: 'tyt-social-governance-manifest-v1',
    scope: { game: 'sosyal', examRef: 'TYT', taxonomyVersion: 'ba-tyt-sosyal-v1' },
    counts: {
      activeQuestions: items.length,
      sourcePolicyReady: items.filter((item) => item.sourcePolicyReady).length,
      approvedRoles: items.filter((item) => item.approvedRole).length,
      humanRoleChoiceRequired: items.filter((item) => item.requiresHumanRoleChoice).length,
      categories: countBy('category'),
      approvedRoleCoverage: countBy('approvedRole'),
    },
    items,
  }
  return {
    ...body,
    manifestSha256: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
  }
}

let transactionStarted = false
try {
  await client.connect()
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  transactionStarted = true
  await client.query("SET LOCAL statement_timeout = '2min'")
  const mode = await client.query('SHOW transaction_read_only')
  if (mode.rows[0]?.transaction_read_only !== 'on') {
    throw new Error('Database transaction is not read-only.')
  }
  const policy = await client.query(policySql)
  if (policy.rows[0]?.policy_count !== 1 || !policy.rows[0]?.policy_version) {
    throw new Error('Current TYT Social candidate policy is not unique.')
  }
  const { rows } = await client.query(manifestSql)
  if (rows.some((row) => row.policy_version !== policy.rows[0].policy_version)) {
    throw new Error('TYT Social manifest policy projection drifted.')
  }
  const manifest = buildManifest(rows)
  await client.query('ROLLBACK')
  transactionStarted = false
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`)
} catch (error) {
  if (transactionStarted) {
    await client.query('ROLLBACK').catch(() => undefined)
  }
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'audit_failed'
  process.stderr.write(`TYT Social read-only manifest failed (${code}).\n`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => undefined)
}
