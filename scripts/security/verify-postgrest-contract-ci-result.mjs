import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const POSTGREST_CONTRACT_SUFFIX = '.postgrest.test.ts'
// Her kontrat dosyasi fikstürünü canli semaya baglar (harness.ts:
// assertFixtureMirrorsGeneratedSchema); bu testi olmayan dosya kabul edilmez.
export const FIXTURE_MIRROR_TITLE_PREFIX = 'mirrors the live '
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const reject = () => { throw new Error('PostgREST contract report failed, incomplete or skipped') }

/** src/ altindaki tum *.postgrest.test.ts dosyalari, depo kokune gore. */
export function findPostgrestContractFiles(root = repositoryRoot) {
  const found = []
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith(POSTGREST_CONTRACT_SUFFIX)) found.push(path.relative(root, full).split(path.sep).join('/'))
    }
  }
  walk(path.join(root, 'src'))
  return found.sort()
}

// Vitest describe.skip'ten sonra da sifirla cikabilir. CI isi, depodaki her
// kontrat dosyasinin kostugunu ve her testin gectigini kanitlamalidir.
export function verifyPostgrestContractCiReport(report, expectedFiles, root = repositoryRoot) {
  if (!Array.isArray(expectedFiles) || expectedFiles.length === 0) reject()
  if (!isObject(report) || report.success !== true
    || !Number.isInteger(report.numTotalTests) || report.numTotalTests <= 0
    || report.numPassedTests !== report.numTotalTests
    || report.numFailedTests !== 0 || report.numPendingTests !== 0
    || report.numTodoTests !== 0 || (report.numSkippedTests ?? 0) !== 0
    || report.numFailedTestSuites !== 0 || report.numPendingTestSuites !== 0
    || report.snapshot?.failure === true
    || !Array.isArray(report.testResults) || report.testResults.length !== expectedFiles.length) reject()

  const expected = new Set(expectedFiles.map((file) => path.resolve(root, file)))
  const seenFiles = new Set()
  const names = new Set()
  let passed = 0
  for (const file of report.testResults) {
    if (!isObject(file) || file.status !== 'passed' || file.message !== ''
      || typeof file.name !== 'string'
      || !expected.has(path.resolve(file.name)) || seenFiles.has(path.resolve(file.name))
      || !Array.isArray(file.assertionResults) || file.assertionResults.length === 0) reject()
    seenFiles.add(path.resolve(file.name))

    let mirrors = false
    for (const assertion of file.assertionResults) {
      if (!isObject(assertion) || assertion.status !== 'passed'
        || typeof assertion.fullName !== 'string' || !assertion.fullName.trim()
        || names.has(assertion.fullName)
        || !Array.isArray(assertion.failureMessages) || assertion.failureMessages.length !== 0) reject()
      names.add(assertion.fullName)
      if (typeof assertion.title === 'string' && assertion.title.startsWith(FIXTURE_MIRROR_TITLE_PREFIX)) mirrors = true
      passed++
    }
    if (!mirrors) reject()
  }
  if (passed !== report.numTotalTests) reject()
  return { files: seenFiles.size, passed, skipped: 0 }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Exactly one Vitest JSON report path required')
    const files = findPostgrestContractFiles()
    const result = verifyPostgrestContractCiReport(JSON.parse(readFileSync(process.argv[2], 'utf8')), files)
    console.log(`PostgREST contract: ${result.files} files, ${result.passed} tests passed; zero skipped`)
  } catch {
    // Do not echo report contents or arbitrary paths from a failed read.
    console.error('PostgREST contract rejected: missing, malformed, incomplete or skipped report')
    process.exitCode = 1
  }
}
