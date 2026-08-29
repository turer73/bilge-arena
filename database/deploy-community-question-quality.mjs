#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const PROJECT_REF = 'lvnmzdowhfzmpkueurih'
const API_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim()
const action = process.argv.includes('--apply') ? 'apply' : 'inspect'
const confirmed = process.argv.includes('--confirm-production')

const migrations = [
  {
    version: '20260824073000',
    name: '146_community_question_quality_consensus',
    file: new URL('./migrations/146_community_question_quality_consensus.sql', import.meta.url),
  },
  {
    version: '20260824073001',
    name: '147_community_question_quality_worker_role',
    file: new URL('./migrations/147_community_question_quality_worker_role.sql', import.meta.url),
  },
  {
    version: '20260824083000',
    name: '148_community_question_quality_control_seed',
    file: new URL('./migrations/148_community_question_quality_control_seed.sql', import.meta.url),
  },
]

if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is required')
if (action === 'apply' && !confirmed) {
  throw new Error('--apply requires --confirm-production')
}

async function databaseQuery(query) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  if (!response.ok) {
    throw new Error(`Supabase management query failed: ${response.status} ${await response.text()}`)
  }
  return response.json()
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function migrationBody(file) {
  const raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  const withoutBegin = raw.replace(/\bBEGIN;\s*/i, '')
  const body = withoutBegin.replace(/\s*COMMIT;\s*$/i, '').trim()
  if (body === raw.trim() || !body) throw new Error(`Migration transaction wrapper is invalid: ${file.pathname}`)
  return { raw, body }
}

function historyStatement(migration, raw) {
  const hash = createHash('sha256').update(raw).digest('hex')
  const tag = `$history_${migration.version}$`
  if (raw.includes(tag)) throw new Error(`Migration contains reserved history delimiter: ${tag}`)
  return `
    INSERT INTO supabase_migrations.schema_migrations(
      version,statements,name,created_by,idempotency_key
    ) VALUES(
      ${sqlLiteral(migration.version)},
      ARRAY[${tag}${raw}${tag}]::text[],
      ${sqlLiteral(migration.name)},
      'community-quality-production-rollout',
      ${sqlLiteral(hash)}
    )
    ON CONFLICT(version) DO NOTHING;
  `
}

async function state() {
  const rows = await databaseQuery(`
    SELECT json_build_object(
      'recorded', COALESCE((
        SELECT json_object_agg(name,version)
        FROM supabase_migrations.schema_migrations
        WHERE name IN (
          '146_community_question_quality_consensus',
          '147_community_question_quality_worker_role',
          '148_community_question_quality_control_seed'
        )
      ), '{}'::json),
      'latestMigration', (SELECT max(version) FROM supabase_migrations.schema_migrations),
      'objects', json_build_object(
        'cases', to_regclass('public.question_quality_cases') IS NOT NULL,
        'missions', to_regclass('public.question_quality_missions') IS NOT NULL,
        'claims', to_regclass('public.question_quality_claims') IS NOT NULL,
        'verifications', to_regclass('public.question_quality_verifications') IS NOT NULL,
        'decisions', to_regclass('public.question_quality_consensus_decisions') IS NOT NULL
      ),
      'workerRole', EXISTS(
        SELECT 1
        FROM public.roles role
        WHERE role.slug='question_quality_worker'
          AND (SELECT count(*) FROM public.role_permissions permission
               WHERE permission.role_id=role.id
                 AND permission.permission IN ('content.appeals.manage','content.corrections.apply'))=2
      ),
      'controls', json_build_object(
        'active', (SELECT count(*) FROM public.question_quality_controls WHERE active),
        'seededDeterministic', (
          SELECT count(*) FROM public.question_quality_controls
          WHERE active
            AND proof_kind='deterministic'
            AND proof_evidence->>'seed'='community-quality-control-seed-v1'
        )
      ),
      'controlCandidates', json_build_object(
        'officialExamPublished', (
          SELECT count(*)
          FROM public.question_content_revisions revision
          JOIN public.questions question ON question.published_revision_id=revision.id
          JOIN public.question_revision_sources source ON source.revision_id=revision.id
          WHERE revision.status='published'
            AND source.source_kind='official_exam'
            AND jsonb_typeof(revision.content->'options')='array'
            AND COALESCE(revision.content->>'answer',revision.content->>'correct') ~ '^[0-4]$'
            AND COALESCE(revision.content->>'answer',revision.content->>'correct')::integer
              < jsonb_array_length(revision.content->'options')
        ),
        'officialDomainTwoStageApproved', (
          SELECT count(*)
          FROM public.question_content_revisions revision
          JOIN public.questions question ON question.published_revision_id=revision.id
          JOIN public.question_revision_sources source ON source.revision_id=revision.id
          WHERE revision.status='published'
            AND source.source_kind='official_exam'
            AND source.source_url ~* '^https://([a-z0-9-]+\\.)*(osym|meb)\\.gov\\.tr(/|$)'
            AND jsonb_typeof(revision.content->'options')='array'
            AND COALESCE(revision.content->>'answer',revision.content->>'correct') ~ '^[0-4]$'
            AND COALESCE(revision.content->>'answer',revision.content->>'correct')::integer
              < jsonb_array_length(revision.content->'options')
            AND (SELECT count(DISTINCT approval.stage)
                 FROM public.question_revision_approvals approval
                 WHERE approval.revision_id=revision.id
                   AND approval.decision='approved'
                   AND approval.stage IN (1,2))=2
        )
      )
    ) AS state;
  `)
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0]?.state) {
    throw new Error('Unexpected production inspection response')
  }
  return rows[0].state
}

const before = await state()
console.log(JSON.stringify({ action, phase: 'before', ...before }, null, 2))

if (action === 'apply') {
  for (const migration of migrations) {
    if (before.recorded?.[migration.name]) {
      console.log(JSON.stringify({ migration: migration.name, status: 'already_recorded' }))
      continue
    }
    const { raw, body } = migrationBody(migration.file)
    await databaseQuery(`BEGIN;\n${body}\n${historyStatement(migration, raw)}\nCOMMIT;`)
    console.log(JSON.stringify({ migration: migration.name, status: 'applied' }))
  }
}

const after = await state()
console.log(JSON.stringify({ action, phase: 'after', ...after }, null, 2))

if (action === 'apply') {
  const missingHistory = migrations.filter((migration) => !after.recorded?.[migration.name])
  const missingObjects = Object.entries(after.objects).filter(([, present]) => !present)
  const missingControls = Number(after.controls?.active ?? 0) < 5 || Number(after.controls?.seededDeterministic ?? 0) !== 5
  if (missingHistory.length || missingObjects.length || !after.workerRole || missingControls) {
    throw new Error(`Production verification failed: ${JSON.stringify({ missingHistory, missingObjects, workerRole: after.workerRole, controls: after.controls })}`)
  }
}
