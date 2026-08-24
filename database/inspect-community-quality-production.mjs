#!/usr/bin/env node

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim()
const projectRef = process.env.SUPABASE_PROJECT_ID?.trim()

if (!token || !projectRef) {
  throw new Error('SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_ID are required')
}

const query = `
SELECT json_build_object(
  'migration146Recorded', EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version = '146' OR name = 'community_question_quality_consensus'
  ),
  'latestMigration', (
    SELECT max(version) FROM supabase_migrations.schema_migrations
  ),
  'migrationHistoryColumns', (
    SELECT json_agg(json_build_object(
      'name', column_name,
      'nullable', is_nullable,
      'type', data_type
    ) ORDER BY ordinal_position)
    FROM information_schema.columns
    WHERE table_schema = 'supabase_migrations'
      AND table_name = 'schema_migrations'
  ),
  'recentMigrations', (
    SELECT json_agg(row_to_json(recent) ORDER BY recent.version)
    FROM (
      SELECT version, name
      FROM supabase_migrations.schema_migrations
      ORDER BY version DESC
      LIMIT 12
    ) recent
  ),
  'dependencies', json_build_object(
    'profiles', to_regclass('public.profiles') IS NOT NULL,
    'questions', to_regclass('public.questions') IS NOT NULL,
    'questionAppeals', to_regclass('public.question_appeals') IS NOT NULL,
    'questionRevisions', to_regclass('public.question_content_revisions') IS NOT NULL,
    'governanceRequests', to_regclass('public.content_governance_requests') IS NOT NULL,
    'roles', to_regclass('public.roles') IS NOT NULL,
    'userRoles', to_regclass('public.user_roles') IS NOT NULL
  ),
  'communityObjects', json_build_object(
    'cases', to_regclass('public.question_quality_cases') IS NOT NULL,
    'missions', to_regclass('public.question_quality_missions') IS NOT NULL,
    'claims', to_regclass('public.question_quality_claims') IS NOT NULL,
    'verifications', to_regclass('public.question_quality_verifications') IS NOT NULL,
    'decisions', to_regclass('public.question_quality_consensus_decisions') IS NOT NULL
  ),
  'eligibleWorkerActors', (
    SELECT count(DISTINCT ur.user_id)
    FROM public.user_roles ur
    JOIN public.role_permissions appeals
      ON appeals.role_id = ur.role_id AND appeals.permission = 'content.appeals.manage'
    JOIN public.role_permissions corrections
      ON corrections.role_id = ur.role_id AND corrections.permission = 'content.corrections.apply'
  )
) AS state;
`

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
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

const rows = await response.json()
if (!Array.isArray(rows) || rows.length !== 1 || !rows[0]?.state) {
  throw new Error('Unexpected Supabase management query response')
}

console.log(JSON.stringify(rows[0].state, null, 2))
