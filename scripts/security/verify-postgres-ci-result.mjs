import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgresCiSuite } from './postgres-ci-suites.mjs'

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

// Hata metni yalnizca sabit bir gerekce ve depodaki manifest yolunu tasir;
// rapordan gelen test adlari veya keyfi yollar yazdirilmaz.
export class PostgresCiReportError extends Error {
  constructor(reason, file) {
    super(`PostgreSQL CI report failed, incomplete or skipped: ${reason}${file ? ` (${file})` : ''}`)
    this.name = 'PostgresCiReportError'
  }
}
const reject = (reason, file) => { throw new PostgresCiReportError(reason, file) }

function expectedFileMap(files, root) {
  if (!Array.isArray(files) || files.length === 0) reject('empty suite')
  const map = new Map()
  for (const file of files) {
    if (typeof file !== 'string' || !file) reject('invalid suite file')
    const resolved = path.resolve(root, file)
    if (map.has(resolved)) reject('duplicate suite file', file)
    map.set(resolved, file)
  }
  return map
}

// Vitest describe.skip/it.skip'ten sonra da sifirla cikabilir. Rapor, takimdaki
// her dosyanin kostugunu ve her testin gercekten gectigini kanitlamalidir.
export function verifyVitestCiReport(report, files, { expectedTests, root = repositoryRoot } = {}) {
  const expected = expectedFileMap(files, root)
  if (!isObject(report)) reject('malformed report')
  if (report.success !== true) reject('vitest run did not succeed')
  if (report.numPendingTests !== 0 || (report.numSkippedTests ?? 0) !== 0) reject('skipped tests')
  if (report.numPendingTestSuites !== 0) reject('skipped test files')
  if (report.numTodoTests !== 0) reject('todo tests')
  if (report.numFailedTests !== 0) reject('failed tests')
  if (report.numFailedTestSuites !== 0) reject('failed test files')
  if (!Number.isInteger(report.numTotalTests) || report.numTotalTests <= 0) reject('no tests ran')
  if (report.numPassedTests !== report.numTotalTests) reject('not every test passed')
  if (report.snapshot?.failure === true) reject('snapshot failure')
  if (expectedTests !== undefined && report.numTotalTests !== expectedTests) reject(`expected exactly ${expectedTests} tests`)
  if (!Array.isArray(report.testResults) || report.testResults.length !== expected.size) reject('test file count differs from suite')

  const seen = new Set()
  const names = new Set()
  let passed = 0
  for (const result of report.testResults) {
    if (!isObject(result) || typeof result.name !== 'string') reject('malformed test file entry')
    const resolved = path.resolve(result.name)
    const file = expected.get(resolved)
    if (!file) reject('test file outside suite')
    if (seen.has(resolved)) reject('test file reported twice', file)
    seen.add(resolved)
    if (result.status !== 'passed' || result.message !== '') reject('test file did not pass', file)
    if (!Array.isArray(result.assertionResults) || result.assertionResults.length === 0) reject('test file ran no tests', file)
    for (const assertion of result.assertionResults) {
      if (!isObject(assertion)) reject('malformed test entry', file)
      if (assertion.status === 'skipped' || assertion.status === 'pending') reject('skipped test', file)
      if (assertion.status === 'todo') reject('todo test', file)
      if (assertion.status !== 'passed') reject('test did not pass', file)
      if (typeof assertion.fullName !== 'string' || !assertion.fullName.trim()) reject('unnamed test', file)
      if (names.has(assertion.fullName)) reject('duplicate test name', file)
      if (!Array.isArray(assertion.failureMessages) || assertion.failureMessages.length !== 0) reject('test reported failures', file)
      names.add(assertion.fullName)
      passed++
    }
  }
  for (const [resolved, file] of expected) if (!seen.has(resolved)) reject('suite file did not run', file)
  if (passed !== report.numTotalTests) reject('test count mismatch')
  return { files: seen.size, passed, skipped: 0 }
}

// node --test raporu node-test-json-reporter.mjs'in yazdigi bicimdir:
// { runner: 'node-test', tests: [{ file, name, nesting, kind, status }] }.
// Atlanan bir describe yalnizca kendi olayini uretir (cocuklari raporlanmaz),
// bu yuzden suite olaylari da atlama icin denetlenir. allowedSkips yalnizca
// depoda bulunamayan bir girdiye bagli tek tek testler icindir (dosya + tam
// baslik); describe duzeyinde atlama hicbir zaman izinli degildir.
export function verifyNodeTestCiReport(report, files, { expectedTests, allowedSkips = [], root = repositoryRoot } = {}) {
  const expected = expectedFileMap(files, root)
  if (!isObject(report) || report.runner !== 'node-test' || !Array.isArray(report.tests)) reject('malformed report')
  if (report.complete !== true) reject('reporter did not finish')
  const allowed = new Set(allowedSkips.map((entry) => JSON.stringify([path.resolve(root, entry.file), entry.title])))

  const perFile = new Map()
  let passed = 0
  let skipped = 0
  for (const entry of report.tests) {
    if (!isObject(entry) || typeof entry.file !== 'string' || typeof entry.name !== 'string') reject('malformed test entry')
    const resolved = path.resolve(entry.file)
    const file = expected.get(resolved)
    if (!file) reject('test file outside suite')
    if (entry.status === 'skipped' && entry.kind === 'test' && allowed.has(JSON.stringify([resolved, entry.name]))) {
      skipped++
      continue
    }
    if (entry.status === 'skipped') reject('skipped test', file)
    if (entry.status === 'todo') reject('todo test', file)
    if (entry.status !== 'passed') reject('test did not pass', file)
    if (entry.kind === 'suite') continue
    perFile.set(resolved, (perFile.get(resolved) ?? 0) + 1)
    passed++
  }
  for (const [resolved, file] of expected) if (!perFile.get(resolved)) reject('suite file ran no tests', file)
  if (expectedTests !== undefined && passed !== expectedTests) reject(`expected exactly ${expectedTests} tests`)
  return { files: perFile.size, passed, skipped }
}

export function verifyPostgresCiSuiteReport(suiteId, report, root = repositoryRoot) {
  const suite = postgresCiSuite(suiteId)
  const options = { expectedTests: suite.expectedTests, root }
  if (suite.runner === 'vitest') {
    if (suite.allowedSkips?.length) reject('allowed skips are only supported for node-test suites')
    return verifyVitestCiReport(report, suite.files, options)
  }
  if (suite.runner === 'node-test') return verifyNodeTestCiReport(report, suite.files, { ...options, allowedSkips: suite.allowedSkips })
  return reject('unknown runner')
}

export const describeSkipped = (skipped) => (skipped ? `${skipped} allowlisted skip(s), no other skipped` : 'zero skipped')

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) throw new Error('Exactly one suite id and one report path required')
    const [suiteId, reportPath] = process.argv.slice(2)
    const result = verifyPostgresCiSuiteReport(suiteId, JSON.parse(readFileSync(reportPath, 'utf8')))
    console.log(`PostgreSQL CI suite ${suiteId}: ${result.files} files, ${result.passed} tests passed; ${describeSkipped(result.skipped)}`)
  } catch (error) {
    // Bilinen gerekceyi yaz; okuma/ayristirma hatasinda rapor icerigini yazma.
    console.error(error instanceof PostgresCiReportError
      ? error.message
      : 'PostgreSQL CI report rejected: missing, malformed, incomplete or skipped report')
    process.exitCode = 1
  }
}
