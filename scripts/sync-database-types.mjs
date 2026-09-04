import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_PROJECT_ID = 'lvnmzdowhfzmpkueurih'
const TOKEN_EXPIRY_WARNING_DAYS = 14
const STRICT_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/

const scriptPath = fileURLToPath(import.meta.url)
const scriptDir = path.dirname(scriptPath)
const projectDir = path.resolve(scriptDir, '..')
const outputPath = path.join(projectDir, 'src', 'types', 'database.generated.ts')
const localCli = path.join(
  projectDir,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'supabase.cmd' : 'supabase'
)

export function validateSupabaseTokenExpiry(rawValue, nowMs = Date.now()) {
  const tokenExpiresAt = rawValue?.trim()
  if (!tokenExpiresAt) {
    throw new Error(
      'SUPABASE_TOKEN_EXPIRES_AT is required and must match the scoped schema-read token expiry.'
    )
  }

  if (!STRICT_UTC_TIMESTAMP.test(tokenExpiresAt)) {
    throw new Error(
      'SUPABASE_TOKEN_EXPIRES_AT must be a strict UTC ISO-8601 timestamp (for example 2026-12-04T00:00:00Z).'
    )
  }

  const expiryMs = Date.parse(tokenExpiresAt)
  const canonicalInput = tokenExpiresAt.includes('.')
    ? tokenExpiresAt
    : tokenExpiresAt.replace(/Z$/, '.000Z')

  if (!Number.isFinite(expiryMs) || new Date(expiryMs).toISOString() !== canonicalInput) {
    throw new Error('SUPABASE_TOKEN_EXPIRES_AT is not a real calendar timestamp.')
  }

  if (!Number.isFinite(nowMs)) {
    throw new Error('Current time is invalid.')
  }

  if (expiryMs <= nowMs) {
    throw new Error('Supabase schema-read token is expired; rotate SUPABASE_ACCESS_TOKEN.')
  }

  const remainingDays = Math.ceil((expiryMs - nowMs) / 86_400_000)
  return {
    expiresAt: tokenExpiresAt,
    expiryMs,
    remainingDays,
    shouldWarn: remainingDays <= TOKEN_EXPIRY_WARNING_DAYS,
  }
}

export function main({
  env = process.env,
  argv = process.argv.slice(2),
  nowMs = Date.now(),
} = {}) {
  const accessToken = env.SUPABASE_ACCESS_TOKEN?.trim()
  if (!accessToken) {
    console.error('SUPABASE_ACCESS_TOKEN is required to read the remote schema.')
    return 1
  }

  let expiry
  try {
    expiry = validateSupabaseTokenExpiry(env.SUPABASE_TOKEN_EXPIRES_AT, nowMs)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  }

  if (expiry.shouldWarn) {
    console.warn(
      `Supabase schema-read token expires in ${expiry.remainingDays} day(s); rotate it now.`
    )
  }

  if (!existsSync(localCli)) {
    console.error('Pinned Supabase CLI is missing. Run npm ci before generating database types.')
    return 1
  }

  const projectId = env.SUPABASE_PROJECT_ID?.trim() || DEFAULT_PROJECT_ID
  const result = spawnSync(
    localCli,
    ['gen', 'types', 'typescript', '--project-id', projectId, '--schema', 'public'],
    {
      cwd: projectDir,
      encoding: 'utf8',
      env: { ...env, SUPABASE_ACCESS_TOKEN: accessToken },
      maxBuffer: 10 * 1024 * 1024,
    }
  )

  if (result.error || result.status !== 0) {
    const stderr = result.stderr?.trim() || ''
    if (/unauthorized|invalid.*token|access token.*expired/i.test(stderr)) {
      console.error(
        'Supabase rejected the schema-read token. Rotate the GitHub SUPABASE_ACCESS_TOKEN secret.'
      )
    } else if (/forbidden|permission denied|insufficient.*permission/i.test(stderr)) {
      console.error(
        'Supabase accepted the token but it cannot read the production schema. Check its project scope and database-read permission.'
      )
    } else {
      console.error(stderr || result.error?.message || 'Supabase CLI failed.')
    }
    return result.status || 1
  }

  const generated = result.stdout.replace(/\r\n/g, '\n').trimEnd() + '\n'
  const requiredMarkers = [
    'export type Json',
    'export type Database',
    'user_achievements',
    'multiplayer_wins',
    'award_badges',
  ]

  for (const marker of requiredMarkers) {
    if (!generated.includes(marker)) {
      console.error(`Generated database types are missing required marker: ${marker}`)
      return 1
    }
  }

  if (!generated.startsWith('export type Json')) {
    console.error('Generated output is not a valid Supabase TypeScript definition.')
    return 1
  }

  if (argv.includes('--check')) {
    if (!existsSync(outputPath)) {
      console.error('src/types/database.generated.ts is missing. Run npm run db:types.')
      return 1
    }

    const committed = readFileSync(outputPath, 'utf8').replace(/\r\n/g, '\n')
    if (committed !== generated) {
      console.error('Database type drift detected. Run npm run db:types and commit the result.')
      return 1
    }

    console.log('Database types match the production public schema.')
  } else {
    writeFileSync(outputPath, generated, 'utf8')
    console.log('Updated src/types/database.generated.ts from the production public schema.')
  }

  return 0
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === path.resolve(scriptPath)) {
  process.exitCode = main()
}
