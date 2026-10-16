import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DB_SKIP_ALLOWLIST, postgresCiSuiteFiles } from './postgres-ci-suites.mjs'

// test:db (vitest.database.config.ts) veritabani olmadan kosar; PostgreSQL
// dosyalari orada "skipped" gorunur. Bu kapi, atlanan her dosyanin bir
// PostgreSQL CI takiminda gercekten kostugunu (postgres-ci-suites.mjs) ya da
// gerekcesiyle izin listesinde oldugunu dogrular. Yeni bir PG test dosyasi
// hicbir ise baglanmadan sessizce gecemez.
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const SKIP_STATUSES = new Set(['skipped', 'pending', 'todo'])

export class DbSkipCoverageError extends Error {
  constructor(reason, files = []) {
    super(`test:db skip coverage rejected: ${reason}${files.length ? `\n  ${files.join('\n  ')}` : ''}`)
    this.name = 'DbSkipCoverageError'
    this.files = files
  }
}

// Depo icindeki bir test yolunu goreli bicime cevirir; depo disi ya da
// beklenmeyen karakterli yol (rapordan gelen keyfi metin) yazdirilmaz.
const displayPath = (absolute, root) => {
  const relative = path.relative(root, absolute).split(path.sep).join('/')
  return /^database\/__tests__\/[\w.-]+$/.test(relative) ? relative : '<path outside database/__tests__>'
}

export function verifyDbSkipCoverage(
  report,
  { root = repositoryRoot, covered = postgresCiSuiteFiles(), allowlist = DB_SKIP_ALLOWLIST } = {},
) {
  if (!isObject(report) || report.success !== true || !Array.isArray(report.testResults)
    || report.testResults.length === 0) throw new DbSkipCoverageError('malformed or failing report')

  const coveredFiles = new Set(covered.map((file) => path.resolve(root, file)))
  const allowed = new Map()
  for (const entry of allowlist) {
    const resolved = path.resolve(root, entry.file)
    if (!allowed.has(resolved)) allowed.set(resolved, new Set())
    allowed.get(resolved).add(entry.title)
  }

  const uncovered = []
  let skippedFiles = 0
  let skippedTests = 0
  for (const result of report.testResults) {
    if (!isObject(result) || typeof result.name !== 'string' || !Array.isArray(result.assertionResults)) {
      throw new DbSkipCoverageError('malformed test file entry')
    }
    const resolved = path.resolve(result.name)
    const skipped = result.assertionResults.filter((assertion) => !isObject(assertion) || SKIP_STATUSES.has(assertion.status))
    const fileSkipped = result.status === 'skipped' || result.status === 'pending'
    if (skipped.length === 0 && !fileSkipped) continue
    skippedFiles++
    skippedTests += skipped.length
    if (coveredFiles.has(resolved)) continue
    const titles = allowed.get(resolved)
    if (titles && !fileSkipped && skipped.every((assertion) => isObject(assertion) && titles.has(assertion.title))) continue
    uncovered.push(displayPath(resolved, root))
  }
  if (uncovered.length) {
    throw new DbSkipCoverageError(
      'skipped tests that no PostgreSQL CI job runs (add the file to scripts/security/postgres-ci-suites.mjs)',
      uncovered.sort(),
    )
  }
  return { skippedFiles, skippedTests }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Exactly one Vitest JSON report path required')
    const result = verifyDbSkipCoverage(JSON.parse(readFileSync(process.argv[2], 'utf8')))
    console.log(`test:db skip coverage: ${result.skippedFiles} files / ${result.skippedTests} tests skipped here, each one run by a PostgreSQL CI job or allowlisted`)
  } catch (error) {
    console.error(error instanceof DbSkipCoverageError
      ? error.message
      : 'test:db skip coverage rejected: missing or malformed report')
    process.exitCode = 1
  }
}
