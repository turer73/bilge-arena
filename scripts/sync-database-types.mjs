import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ID = process.env.SUPABASE_PROJECT_ID || 'lvnmzdowhfzmpkueurih'
const CHECK_ONLY = process.argv.includes('--check')
const TOKEN_EXPIRY_WARNING_DAYS = 14

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(scriptDir, '..')
const outputPath = path.join(projectDir, 'src', 'types', 'database.generated.ts')
const localCli = path.join(
  projectDir,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'supabase.cmd' : 'supabase'
)

if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN is required to read the remote schema.')
  process.exit(1)
}

const tokenExpiresAt = process.env.SUPABASE_TOKEN_EXPIRES_AT?.trim()
if (!tokenExpiresAt) {
  console.warn(
    'SUPABASE_TOKEN_EXPIRES_AT is not set; configure the repository variable so rotation can be planned.'
  )
} else {
  const expiryMs = Date.parse(tokenExpiresAt)
  if (!Number.isFinite(expiryMs)) {
    console.error('SUPABASE_TOKEN_EXPIRES_AT must be an ISO-8601 timestamp.')
    process.exit(1)
  }

  const remainingDays = Math.ceil((expiryMs - Date.now()) / 86_400_000)
  if (remainingDays < 0) {
    console.error('Supabase schema-read token is expired; rotate SUPABASE_ACCESS_TOKEN.')
    process.exit(1)
  }
  if (remainingDays <= TOKEN_EXPIRY_WARNING_DAYS) {
    console.warn(`Supabase schema-read token expires in ${remainingDays} day(s); rotate it now.`)
  }
}

if (!existsSync(localCli)) {
  console.error('Pinned Supabase CLI is missing. Run npm ci before generating database types.')
  process.exit(1)
}

const command = localCli
const commandArgs = ['gen', 'types', 'typescript']

commandArgs.push('--project-id', PROJECT_ID, '--schema', 'public')

const result = spawnSync(command, commandArgs, {
  cwd: projectDir,
  encoding: 'utf8',
  env: process.env,
  maxBuffer: 10 * 1024 * 1024,
})

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
  process.exit(result.status || 1)
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
    process.exit(1)
  }
}

if (!generated.startsWith('export type Json')) {
  console.error('Generated output is not a valid Supabase TypeScript definition.')
  process.exit(1)
}

if (CHECK_ONLY) {
  if (!existsSync(outputPath)) {
    console.error('src/types/database.generated.ts is missing. Run npm run db:types.')
    process.exit(1)
  }

  const committed = readFileSync(outputPath, 'utf8').replace(/\r\n/g, '\n')
  if (committed !== generated) {
    console.error('Database type drift detected. Run npm run db:types and commit the result.')
    process.exit(1)
  }

  console.log('Database types match the production public schema.')
} else {
  writeFileSync(outputPath, generated, 'utf8')
  console.log('Updated src/types/database.generated.ts from the production public schema.')
}
