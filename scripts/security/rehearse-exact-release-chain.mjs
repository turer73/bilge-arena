import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import pg from 'pg'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = join(scriptDir, '..', '..')

export const RELEASE_CHAIN_FILES = Object.freeze([
  '187_release_ydt_english_mastery_scope.sql',
  '188_backfill_released_ydt_english_mastery_evidence.sql',
  '189_release_tyt_turkce_mastery_scope.sql',
  '190_backfill_released_tyt_turkce_mastery_evidence.sql',
  '191_release_tyt_sosyal_mastery_scope.sql',
  '192_backfill_released_tyt_sosyal_mastery_evidence.sql',
  '193_registry_driven_adaptive_diagnostic_v3.sql',
  '194_institution_multi_scope_learning_analysis.sql',
  '195_release_tyt_fen_diagnostic_scope.sql',
  '196_release_tyt_fen_institution_scope.sql',
  '197_release_tyt_turkce_diagnostic_scope.sql',
  '198_release_tyt_turkce_institution_scope.sql',
  '199_release_ydt_english_diagnostic_scope.sql',
  '200_release_ydt_english_institution_scope.sql',
  '201_institution_program_execution_integrity.sql',
  '202_mastery_distinct_evidence_days.sql',
  '203_retention_erasure_profile_tombstone_safety.sql',
  '204_postgrest_tombstone_request_gate.sql',
])

const REQUIRED_PRE_187_RELATIONS = Object.freeze([
  'auth.users',
  'public.profiles',
  'public.questions',
  'public.curriculum_scope_releases',
  'public.mastery_outcome_evidence',
  'public.user_outcome_state',
  'public.institution_study_programs',
  'public.institution_study_program_items',
])

const POST_186_ARTIFACTS = Object.freeze([
  ['relation', 'public.adaptive_diagnostic_blueprints'],
  ['relation', 'public.institution_scope_capabilities'],
  ['relation', 'public.institution_study_program_item_executions'],
  ['relation', 'public.mastery_outcome_evidence_days'],
  ['function', 'public.preview_expired_account_retention(integer)'],
  ['function', 'public.enforce_active_profile_data_api_request()'],
])

const REQUIRED_ROLES = Object.freeze([
  'anon',
  'authenticated',
  'service_role',
  'authenticator',
])

function emit(event, detail = {}) {
  process.stdout.write(`${JSON.stringify({ event, ...detail })}\n`)
}

function fail(message) {
  throw new Error(message)
}

function normalizeHost(hostname) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '')
}

export function validateRehearsalTarget(environment = process.env) {
  const connectionString = environment.BILGE_EXACT_CHAIN_TEST_DATABASE_URL
  const disposable = environment.BILGE_EXACT_CHAIN_TEST_DATABASE_DISPOSABLE

  if (!connectionString) {
    fail('BILGE_EXACT_CHAIN_TEST_DATABASE_URL is required')
  }
  if (disposable !== '1') {
    fail('BILGE_EXACT_CHAIN_TEST_DATABASE_DISPOSABLE=1 is required')
  }

  let parsed
  try {
    parsed = new URL(connectionString)
  } catch {
    fail('BILGE_EXACT_CHAIN_TEST_DATABASE_URL must be a PostgreSQL URL')
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    fail('BILGE_EXACT_CHAIN_TEST_DATABASE_URL must use postgres:// or postgresql://')
  }

  const hostname = normalizeHost(parsed.hostname)
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    fail('refusing a non-local exact-chain rehearsal database')
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  if (!/^bilge_exact_chain_test_[a-z0-9][a-z0-9_]*$/i.test(databaseName)) {
    fail('database name must match bilge_exact_chain_test_*')
  }

  return { connectionString, databaseName }
}

export function loadReleaseChain(migrationsDirectory = join(repositoryRoot, 'database', 'migrations')) {
  return RELEASE_CHAIN_FILES.map((fileName, index) => {
    const ordinal = 187 + index
    if (!fileName.startsWith(`${ordinal}_`)) {
      fail(`release-chain manifest is out of order at ${fileName}`)
    }
    const sql = readFileSync(join(migrationsDirectory, fileName), 'utf8')
    if (!/^\s*(?:--[^\n]*\n\s*)*BEGIN\s*;/i.test(sql)) {
      fail(`${fileName} must own an explicit transaction`)
    }
    if (!/\bCOMMIT\s*;\s*$/i.test(sql)) {
      fail(`${fileName} must commit only after its embedded postcheck`)
    }
    return {
      ordinal,
      fileName,
      sql,
      sha256: createHash('sha256').update(sql).digest('hex'),
    }
  })
}

function ledgerValueMatchesFile(value, fileName) {
  if (!value) return false
  const normalized = String(value).trim().toLowerCase().replace(/\.sql$/, '')
  const baseName = fileName.toLowerCase().replace(/\.sql$/, '')
  const slug = baseName.replace(/^\d+_/, '')
  return normalized === baseName
    || normalized === slug
    || normalized.endsWith(`_${baseName}`)
}

export function ledgerContainsFile(rows, fileName) {
  return rows.some((row) => (
    ledgerValueMatchesFile(row.version, fileName)
    || ledgerValueMatchesFile(row.name, fileName)
  ))
}

async function assertPre187Ledger(client) {
  const ledgerRelation = (await client.query(
    "SELECT pg_catalog.to_regclass('supabase_migrations.schema_migrations')::text AS relation",
  )).rows[0].relation
  if (!ledgerRelation) {
    fail('pre-187 clone must include supabase_migrations.schema_migrations')
  }

  const rows = (await client.query(`
    SELECT
      pg_catalog.to_jsonb(ledger_row)->>'version' AS version,
      pg_catalog.to_jsonb(ledger_row)->>'name' AS name
    FROM supabase_migrations.schema_migrations AS ledger_row
  `)).rows

  if (!ledgerContainsFile(rows, '186_atomic_friend_requests.sql')) {
    fail('clone ledger does not prove the migration-186 baseline')
  }
  for (const fileName of RELEASE_CHAIN_FILES) {
    if (ledgerContainsFile(rows, fileName)) {
      fail(`clone is not pre-187: ledger already contains ${fileName}`)
    }
  }
}

async function assertPreflight(client, expectedDatabaseName) {
  const server = (await client.query(`
    SELECT current_database() AS database_name,
      current_setting('server_version_num')::integer AS server_version_num,
      pg_catalog.pg_is_in_recovery() AS in_recovery
  `)).rows[0]
  if (server.database_name !== expectedDatabaseName) {
    fail('connected database does not match the URL database name')
  }
  if (server.server_version_num < 160000 || server.server_version_num >= 170000) {
    fail(`PostgreSQL 16 is required; server_version_num=${server.server_version_num}`)
  }
  if (server.in_recovery) {
    fail('rehearsal target must not be a recovery/read-replica database')
  }

  const otherSessions = (await client.query(`
    SELECT count(*)::integer AS count
    FROM pg_catalog.pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_catalog.pg_backend_pid()
  `)).rows[0].count
  if (otherSessions !== 0) {
    fail(`rehearsal database is not isolated; ${otherSessions} other session(s) are connected`)
  }

  // Migration 204 changes the authenticator role, and PostgreSQL roles are
  // cluster-wide rather than database-local. Refuse a shared developer
  // cluster so the exact rehearsal cannot redirect another local PostgREST
  // database to a function that exists only in this clone.
  const otherDatabases = (await client.query(`
    SELECT datname
    FROM pg_catalog.pg_database
    WHERE datallowconn
      AND NOT datistemplate
      AND datname NOT IN (current_database(), 'postgres')
    ORDER BY datname
  `)).rows.map((row) => row.datname)
  if (otherDatabases.length > 0) {
    fail(`rehearsal requires a dedicated PostgreSQL cluster; found other databases: ${otherDatabases.join(', ')}`)
  }

  const missingRelations = (await client.query(`
    SELECT required.name
    FROM pg_catalog.unnest($1::text[]) AS required(name)
    WHERE pg_catalog.to_regclass(required.name) IS NULL
    ORDER BY required.name
  `, [REQUIRED_PRE_187_RELATIONS])).rows.map((row) => row.name)
  if (missingRelations.length > 0) {
    fail(`clone is missing pre-187 relations: ${missingRelations.join(', ')}`)
  }

  const missingRoles = (await client.query(`
    SELECT required.name
    FROM pg_catalog.unnest($1::text[]) AS required(name)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles AS role_row
      WHERE role_row.rolname = required.name
    )
    ORDER BY required.name
  `, [REQUIRED_ROLES])).rows.map((row) => row.name)
  if (missingRoles.length > 0) {
    fail(`clone is missing Supabase roles: ${missingRoles.join(', ')}`)
  }

  for (const [kind, identity] of POST_186_ARTIFACTS) {
    const expression = kind === 'relation'
      ? 'pg_catalog.to_regclass($1)::text'
      : 'pg_catalog.to_regprocedure($1)::text'
    const found = (await client.query(`SELECT ${expression} AS identity`, [identity])).rows[0].identity
    if (found) {
      fail(`clone is not pre-187: found ${kind} ${identity}`)
    }
  }

  await assertPre187Ledger(client)
}

export async function assertSocialScopeClosed(client) {
  const scope = (await client.query(`
    SELECT release_status, diagnostic_enabled, released_at
    FROM public.curriculum_scope_releases
    WHERE game='sosyal'
      AND display_exam_ref='TYT'
      AND question_exam_ref='TYT'
      AND taxonomy_version='ba-tyt-sosyal-v1'
  `)).rows
  if (scope.length !== 1
      || scope[0].release_status !== 'draft'
      || scope[0].diagnostic_enabled !== false
      || scope[0].released_at !== null) {
    fail(`TYT Social must remain draft and closed; observed=${JSON.stringify(scope)}`)
  }
}

async function assertFinalClosedCapabilities(client) {
  await assertSocialScopeClosed(client)

  const socialCapabilities = (await client.query(`
    SELECT
      (SELECT count(*)::integer
       FROM public.adaptive_diagnostic_blueprints
       WHERE game='sosyal' AND display_exam_ref='TYT') AS diagnostic_count,
      (SELECT count(*)::integer
       FROM public.institution_scope_capabilities
       WHERE game='sosyal' AND display_exam_ref='TYT') AS institution_count
  `)).rows[0]
  if (socialCapabilities.diagnostic_count !== 0 || socialCapabilities.institution_count !== 0) {
    fail(`TYT Social capabilities must remain absent; observed=${JSON.stringify(socialCapabilities)}`)
  }

  const institutionCapabilities = (await client.query(`
    SELECT game, display_exam_ref, report_enabled, program_enabled
    FROM public.institution_scope_capabilities
    WHERE (game,display_exam_ref) IN (
      ('fen','TYT'),('turkce','TYT'),('wordquest','YDT')
    )
    ORDER BY game, display_exam_ref
  `)).rows
  const expectedCapabilities = [
    { game: 'fen', display_exam_ref: 'TYT', report_enabled: false, program_enabled: false },
    { game: 'turkce', display_exam_ref: 'TYT', report_enabled: false, program_enabled: false },
    { game: 'wordquest', display_exam_ref: 'YDT', report_enabled: false, program_enabled: false },
  ]
  if (JSON.stringify(institutionCapabilities) !== JSON.stringify(expectedCapabilities)) {
    fail(`new institution report/program flags must exist and remain closed; observed=${JSON.stringify(institutionCapabilities)}`)
  }
}

export async function runRehearsal(environment = process.env) {
  const target = validateRehearsalTarget(environment)
  const plan = loadReleaseChain()
  const client = new pg.Client({
    connectionString: target.connectionString,
    application_name: 'bilge-exact-chain-rehearsal',
    connectionTimeoutMillis: 10_000,
  })

  emit('rehearsal_start', {
    databaseName: target.databaseName,
    firstOrdinal: plan[0].ordinal,
    lastOrdinal: plan.at(-1).ordinal,
    migrationCount: plan.length,
  })

  try {
    await client.connect()
    await assertPreflight(client, target.databaseName)
    emit('preflight_passed', { databaseName: target.databaseName, postgresqlMajor: 16 })

    for (const migration of plan) {
      const startedAt = Date.now()
      emit('migration_start', {
        ordinal: migration.ordinal,
        fileName: migration.fileName,
        sha256: migration.sha256,
      })
      await client.query(migration.sql)
      if (migration.ordinal === 191 || migration.ordinal === 192) {
        await assertSocialScopeClosed(client)
      }
      emit('migration_passed', {
        ordinal: migration.ordinal,
        fileName: migration.fileName,
        sha256: migration.sha256,
        embeddedPostcheckPassed: true,
        durationMs: Date.now() - startedAt,
      })
    }

    await assertFinalClosedCapabilities(client)
    emit('rehearsal_passed', {
      databaseName: target.databaseName,
      appliedOrdinals: plan.map((migration) => migration.ordinal),
      supabaseMigrationLedgerMutatedByRunner: false,
    })
  } finally {
    await client.end().catch(() => {})
  }
}

const invokedDirectly = process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url

if (invokedDirectly) {
  runRehearsal().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      event: 'rehearsal_failed',
      message: error instanceof Error ? error.message : String(error),
    })}\n`)
    process.exitCode = 1
  })
}
