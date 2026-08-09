import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_REF = process.env.SUPABASE_PROJECT_ID || 'lvnmzdowhfzmpkueurih'
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const CONFIRMATION = process.env.ROADMAP_PRODUCTION_CONFIRMATION
const APPROVED_SOURCE_SHA = process.env.ROADMAP_PRODUCTION_APPROVED_SHA
const GITHUB_SHA = process.env.GITHUB_SHA
const GITHUB_REF = process.env.GITHUB_REF
const REQUIRED_CONFIRMATION = 'APPLY-091-107-lvnmzdowhfzmpkueurih'
const MIGRATION_HISTORY_NAME = 'roadmap_close_091_107'
const MODE = process.argv[2] || 'assemble'
const API_ROOT = 'https://api.supabase.com'
const MIGRATION_FIRST = 91
const MIGRATION_LAST = 107
const EXPECTED_MIGRATION_COUNT = MIGRATION_LAST - MIGRATION_FIRST + 1

function stop(message) {
  throw new Error(message)
}

function executableSql(sql) {
  const output = new Array(sql.length).fill(' ')
  for (let position = 0; position < sql.length; position += 1) {
    if (sql[position] === '\n') output[position] = '\n'
  }
  let index = 0
  let blockDepth = 0
  let state = 'normal'
  let dollarTag = null

  while (index < sql.length) {
    const current = sql[index]
    const next = sql[index + 1]

    if (state === 'line-comment') {
      if (current === '\n') state = 'normal'
      index += 1
      continue
    }

    if (state === 'block-comment') {
      if (current === '/' && next === '*') {
        blockDepth += 1
        index += 2
      } else if (current === '*' && next === '/') {
        blockDepth -= 1
        index += 2
        if (blockDepth === 0) state = 'normal'
      } else {
        index += 1
      }
      continue
    }

    if (state === 'single-quote') {
      if (current === "'" && next === "'") {
        index += 2
      } else if (current === "'") {
        state = 'normal'
        index += 1
      } else {
        index += 1
      }
      continue
    }

    if (state === 'double-quote') {
      if (current === '"' && next === '"') {
        index += 2
      } else if (current === '"') {
        state = 'normal'
        index += 1
      } else {
        index += 1
      }
      continue
    }

    if (state === 'dollar-quote') {
      if (sql.startsWith(dollarTag, index)) {
        index += dollarTag.length
        state = 'normal'
        dollarTag = null
      } else {
        index += 1
      }
      continue
    }

    if (current === '-' && next === '-') {
      state = 'line-comment'
      index += 2
      continue
    }
    if (current === '/' && next === '*') {
      state = 'block-comment'
      blockDepth = 1
      index += 2
      continue
    }
    if (current === "'") {
      state = 'single-quote'
      index += 1
      continue
    }
    if (current === '"') {
      state = 'double-quote'
      index += 1
      continue
    }
    if (current === '$') {
      const match = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)
      if (match) {
        dollarTag = match[0]
        state = 'dollar-quote'
        index += dollarTag.length
        continue
      }
    }

    output[index] = current
    index += 1
  }

  if (state === 'block-comment' || state === 'single-quote' ||
      state === 'double-quote' || state === 'dollar-quote') {
    stop('SQL contains an unterminated comment or quoted value')
  }
  return output.join('')
}

function countToken(sql, token) {
  const expression = new RegExp('\\b' + token + ';', 'g')
  return Array.from(executableSql(sql).matchAll(expression)).length
}

function unwrapMigration(filename, source) {
  const sql = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const executable = executableSql(sql)
  const beginLines = Array.from(executable.matchAll(/^BEGIN;[ \t]*$/gm))
  const commitTokens = Array.from(executable.matchAll(/\bCOMMIT;/g))

  if (beginLines.length !== 1 || countToken(sql, 'BEGIN') !== 1) {
    stop(filename + ' must contain exactly one outer BEGIN;')
  }
  if (commitTokens.length !== 1 || countToken(sql, 'COMMIT') !== 1) {
    stop(filename + ' must contain exactly one outer COMMIT;')
  }
  if (countToken(sql, 'ROLLBACK') !== 0 || /(^|\n)SAVEPOINT\b/i.test(sql)) {
    stop(filename + ' contains unsupported transaction control')
  }

  const begin = beginLines[0]
  const commit = commitTokens[0]
  if (executable.slice(commit.index + commit[0].length).trim()) {
    stop(filename + ' contains executable SQL after its outer COMMIT;')
  }

  const withoutCommit = (
    sql.slice(0, commit.index) +
    sql.slice(commit.index + commit[0].length)
  )
  const withoutBegin = (
    withoutCommit.slice(0, begin.index) +
    withoutCommit.slice(begin.index + begin[0].length)
  ).trim()

  if (!withoutBegin) stop(filename + ' has no migration body')
  return withoutBegin
}

export function loadAssembly() {
  const migrationDirectory = fileURLToPath(
    new URL('../database/migrations/', import.meta.url)
  )
  const names = readdirSync(migrationDirectory)
  const migrations = []

  for (let number = MIGRATION_FIRST; number <= MIGRATION_LAST; number += 1) {
    const prefix = String(number).padStart(3, '0') + '_'
    const matches = names.filter(function (name) {
      return name.startsWith(prefix) && name.endsWith('.sql')
    })
    if (matches.length !== 1) {
      stop(prefix + ' expected exactly one migration file, found ' + matches.length)
    }

    const filename = matches[0]
    const source = readFileSync(
      migrationDirectory + filename,
      'utf8'
    )
    migrations.push({
      number: number,
      filename: filename,
      body: unwrapMigration(filename, source),
    })
  }

  if (migrations.length !== EXPECTED_MIGRATION_COUNT) {
    stop('expected 17 migrations, found ' + migrations.length)
  }
  for (let index = 0; index < migrations.length; index += 1) {
    if (migrations[index].number !== MIGRATION_FIRST + index) {
      stop('migration order is not contiguous')
    }
  }

  const prelude = readFileSync(
    new URL('./roadmap-production-close-prelude.sql', import.meta.url),
    'utf8'
  ).replace(/\r\n/g, '\n').trim()
  const postlude = readFileSync(
    new URL('./roadmap-production-close-postlude.sql', import.meta.url),
    'utf8'
  ).replace(/\r\n/g, '\n').trim()

  const sections = [prelude]
  for (const migration of migrations) {
    sections.push(
      '-- UNWRAPPED MIGRATION ' + migration.filename + '\n' + migration.body
    )
  }
  sections.push(postlude)
  const sql = sections.join('\n\n') + '\n'

  if (countToken(sql, 'BEGIN') !== 0 || countToken(sql, 'COMMIT') !== 0) {
    stop('assembled SQL must delegate its outer transaction to the Supabase migrations API')
  }
  if (countToken(sql, 'ROLLBACK') !== 0 || /(^|\n)SAVEPOINT\b/i.test(sql)) {
    stop('assembled SQL contains unsupported transaction control')
  }

  return {
    sql: sql,
    migrationCount: migrations.length,
    firstMigration: migrations[0].filename,
    lastMigration: migrations[migrations.length - 1].filename,
    bytes: Buffer.byteLength(sql, 'utf8'),
    sha256: createHash('sha256').update(sql, 'utf8').digest('hex'),
  }
}

function rowsOf(result) {
  if (Array.isArray(result)) return result
  if (Array.isArray(result && result.result)) return result.result
  if (Array.isArray(result && result.data)) return result.data
  return []
}

function booleanOf(value) {
  return value === true || String(value).toLowerCase() === 'true'
}

function objectOf(value) {
  if (value && typeof value === 'object') return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object') return parsed
    } catch {
      return {}
    }
  }
  return {}
}

function normalizeState(row) {
  if (!row || typeof row !== 'object') stop('production state query returned no row')
  const state = {
    totalQuestions: Number(row.total_questions),
    invalidTotal: Number(row.invalid_total),
    repairCandidates: Number(row.repair_candidates),
    geminiTotal: Number(row.gemini_total),
    geminiTyt: Number(row.gemini_tyt),
    presentCount: Number(row.present_count),
    fingerprints: objectOf(row.fingerprints),
    constraintValidated: booleanOf(row.constraint_validated),
  }

  const numeric = [
    state.totalQuestions,
    state.invalidTotal,
    state.repairCandidates,
    state.geminiTotal,
    state.geminiTyt,
    state.presentCount,
  ]
  if (numeric.some(function (value) { return !Number.isInteger(value) })) {
    stop('production state query returned a malformed numeric field')
  }
  if (Object.keys(state.fingerprints).length !== EXPECTED_MIGRATION_COUNT) {
    stop('production state query returned an incomplete fingerprint map')
  }
  return state
}

function compactState(state) {
  return {
    totalQuestions: state.totalQuestions,
    invalidTotal: state.invalidTotal,
    repairCandidates: state.repairCandidates,
    geminiTotal: state.geminiTotal,
    geminiTyt: state.geminiTyt,
    presentCount: state.presentCount,
    constraintValidated: state.constraintValidated,
    fingerprints: state.fingerprints,
  }
}

function assertInitialState(state) {
  if (state.presentCount !== 0) {
    stop('refusing mixed migration state: expected 0/17 fingerprints, found ' + state.presentCount)
  }
  if (state.invalidTotal !== 22 || state.repairCandidates !== 22) {
    stop(
      'refusing question state: expected invalid=22 candidates=22, found invalid=' +
      state.invalidTotal + ' candidates=' + state.repairCandidates
    )
  }
  if (state.geminiTotal !== 296 || state.geminiTyt !== 296) {
    stop(
      'refusing TYT state: expected 296/296, found ' +
      state.geminiTyt + '/' + state.geminiTotal
    )
  }
  if (state.constraintValidated) {
    stop('migration 107 constraint is unexpectedly already validated')
  }
}

function assertFinalState(state) {
  if (
    state.presentCount !== EXPECTED_MIGRATION_COUNT ||
    state.invalidTotal !== 0 ||
    state.repairCandidates !== 0 ||
    state.geminiTotal < 296 ||
    state.geminiTyt !== state.geminiTotal ||
    state.constraintValidated !== true
  ) {
    stop('production postconditions failed: ' + JSON.stringify(compactState(state)))
  }
  for (let number = MIGRATION_FIRST; number <= MIGRATION_LAST; number += 1) {
    const key = String(number).padStart(3, '0')
    if (!booleanOf(state.fingerprints[key])) {
      stop('production postcondition missing fingerprint ' + key)
    }
  }
}

async function request(path, options) {
  const settings = options || {}
  const response = await fetch(API_ROOT + path, {
    method: settings.method || 'GET',
    headers: {
      Authorization: 'Bearer ' + ACCESS_TOKEN,
      ...(settings.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(settings.body ? { body: JSON.stringify(settings.body) } : {}),
  })
  const raw = await response.text()
  let parsed = null
  if (raw) {
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }
  }
  if (!response.ok) {
    const detail = parsed && typeof parsed === 'object'
      ? String(parsed.message || parsed.error || 'request rejected')
      : 'request rejected'
    stop(
      (settings.method || 'GET') + ' ' + path +
      ' failed (' + response.status + '): ' + detail.slice(0, 600)
    )
  }
  return parsed
}

async function databaseQuery(sql, readOnly) {
  return request('/v1/projects/' + PROJECT_REF + '/database/query', {
    method: 'POST',
    body: { query: sql, read_only: readOnly },
  })
}

async function readMigrationHistory() {
  const result = await request(
    '/v1/projects/' + PROJECT_REF + '/database/migrations'
  )
  if (!Array.isArray(result)) {
    stop('migration history response must be a top-level array')
  }
  return result.map(function (entry, index) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof entry.version !== 'string' ||
      !entry.version.trim() ||
      typeof entry.name !== 'string' ||
      !entry.name.trim()
    ) {
      stop('migration history row ' + index + ' is malformed')
    }
    return {
      version: entry.version,
      name: entry.name,
    }
  })
}

function findRoadmapHistory(history) {
  const matches = history.filter(function (entry) {
    return entry.name === MIGRATION_HISTORY_NAME
  })
  if (matches.length > 1) {
    stop('canonical migration history contains duplicate entries')
  }
  return matches[0] || null
}

async function applyRecordedMigration(sql) {
  return request('/v1/projects/' + PROJECT_REF + '/database/migrations', {
    method: 'POST',
    body: {
      query: sql,
      name: MIGRATION_HISTORY_NAME,
    },
  })
}

async function readProductionState() {
  const sql = readFileSync(
    new URL('./roadmap-production-close-state.sql', import.meta.url),
    'utf8'
  )
  const result = await databaseQuery(sql, true)
  return normalizeState(rowsOf(result)[0])
}

async function applyProduction(assembly) {
  if (!ACCESS_TOKEN) stop('SUPABASE_ACCESS_TOKEN is required for apply mode')
  if (PROJECT_REF !== 'lvnmzdowhfzmpkueurih') {
    stop('refusing unexpected Supabase project ref: ' + PROJECT_REF)
  }
  if (CONFIRMATION !== REQUIRED_CONFIRMATION) {
    stop('ROADMAP_PRODUCTION_CONFIRMATION does not match the required value')
  }
  if (GITHUB_REF !== 'refs/heads/master') {
    stop('refusing apply outside refs/heads/master')
  }
  if (
    !GITHUB_SHA ||
    !/^[a-f0-9]{40}$/i.test(GITHUB_SHA) ||
    APPROVED_SOURCE_SHA !== GITHUB_SHA
  ) {
    stop('ROADMAP_PRODUCTION_APPROVED_SHA must exactly match GITHUB_SHA')
  }

  const project = await request('/v1/projects/' + PROJECT_REF)
  if (
    !project ||
    project.id !== PROJECT_REF ||
    project.ref !== PROJECT_REF ||
    project.status !== 'ACTIVE_HEALTHY'
  ) {
    stop('refusing apply because the exact production project is not ACTIVE_HEALTHY')
  }

  const initial = await readProductionState()
  const initialHistory = await readMigrationHistory()
  const initialHistoryEntry = findRoadmapHistory(initialHistory)
  if (initial.presentCount === EXPECTED_MIGRATION_COUNT) {
    assertFinalState(initial)
    if (!initialHistoryEntry) {
      stop('schema fingerprints are complete but canonical migration history is missing')
    }
    console.log(JSON.stringify({
      mode: 'apply',
      result: 'already-applied',
      assembly: {
        migrationCount: assembly.migrationCount,
        bytes: assembly.bytes,
        sha256: assembly.sha256,
      },
      migrationHistory: initialHistoryEntry,
      state: compactState(initial),
    }, null, 2))
    return
  }
  assertInitialState(initial)
  if (initialHistoryEntry) {
    stop('canonical migration history exists before schema fingerprints')
  }

  let writeError = null
  try {
    await applyRecordedMigration(assembly.sql)
  } catch (error) {
    writeError = error
  }

  const finalState = await readProductionState()
  const finalHistory = await readMigrationHistory()
  const finalHistoryEntry = findRoadmapHistory(finalHistory)
  try {
    assertFinalState(finalState)
    if (!finalHistoryEntry) {
      stop('canonical migration history was not recorded')
    }
  } catch (postconditionError) {
    if (writeError) {
      stop(
        'write request failed and completion was not verified: ' +
        writeError.message + '; ' + postconditionError.message
      )
    }
    throw postconditionError
  }

  console.log(JSON.stringify({
    mode: 'apply',
    result: writeError ? 'verified-after-write-response-error' : 'applied',
    assembly: {
      migrationCount: assembly.migrationCount,
      bytes: assembly.bytes,
      sha256: assembly.sha256,
    },
    migrationHistory: finalHistoryEntry,
    state: compactState(finalState),
  }, null, 2))
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null
const modulePath = resolve(fileURLToPath(import.meta.url))

if (invokedPath === modulePath) {
  const assembly = loadAssembly()

  if (MODE === 'assemble') {
    console.log(JSON.stringify({
      mode: MODE,
      migrationCount: assembly.migrationCount,
      firstMigration: assembly.firstMigration,
      lastMigration: assembly.lastMigration,
      bytes: assembly.bytes,
      sha256: assembly.sha256,
      invariantStatus: 'ok',
    }, null, 2))
  } else if (MODE === 'apply') {
    await applyProduction(assembly)
  } else {
    stop('unsupported mode: ' + MODE)
  }
}
