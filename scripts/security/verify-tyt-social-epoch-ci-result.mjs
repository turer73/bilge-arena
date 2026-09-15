import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const TYT_SOCIAL_EPOCH_TEST_FILE = 'database/__tests__/tyt-social-selection-epoch-postgres.integration.test.mjs'
export const EXPECTED_TYT_SOCIAL_EPOCH_TESTS = 13
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const reject = () => { throw new Error('TYT Social epoch acceptance report failed, incomplete or skipped') }

// Vitest can exit zero after describe.skip. The CI job must also prove that
// the expected file executed every acceptance case, not merely discovered it.
export function verifyTytSocialEpochCiReport(report) {
  if (!isObject(report) || report.success !== true
    || report.numTotalTests !== EXPECTED_TYT_SOCIAL_EPOCH_TESTS
    || report.numPassedTests !== EXPECTED_TYT_SOCIAL_EPOCH_TESTS
    || report.numFailedTests !== 0 || report.numPendingTests !== 0
    || report.numTodoTests !== 0 || (report.numSkippedTests ?? 0) !== 0
    || report.numFailedTestSuites !== 0 || report.numPendingTestSuites !== 0
    || report.snapshot?.failure === true
    || !Array.isArray(report.testResults) || report.testResults.length !== 1) reject()

  const file = report.testResults[0]
  if (!isObject(file) || file.status !== 'passed' || file.message !== ''
    || typeof file.name !== 'string'
    || path.resolve(file.name) !== path.resolve(repositoryRoot, TYT_SOCIAL_EPOCH_TEST_FILE)
    || !Array.isArray(file.assertionResults)
    || file.assertionResults.length !== EXPECTED_TYT_SOCIAL_EPOCH_TESTS) reject()

  const names = new Set()
  for (const assertion of file.assertionResults) {
    if (!isObject(assertion) || assertion.status !== 'passed'
      || typeof assertion.fullName !== 'string' || !assertion.fullName.trim()
      || names.has(assertion.fullName)
      || !Array.isArray(assertion.failureMessages) || assertion.failureMessages.length !== 0) reject()
    names.add(assertion.fullName)
  }
  return { passed: EXPECTED_TYT_SOCIAL_EPOCH_TESTS, skipped: 0 }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Exactly one Vitest JSON report path required')
    const result = verifyTytSocialEpochCiReport(JSON.parse(readFileSync(process.argv[2], 'utf8')))
    console.log(`TYT Social epoch PostgreSQL acceptance: ${result.passed}/${EXPECTED_TYT_SOCIAL_EPOCH_TESTS} passed; zero skipped`)
  } catch {
    // Do not echo report contents or arbitrary paths from a failed read.
    console.error('TYT Social epoch PostgreSQL acceptance rejected: missing, malformed, incomplete or skipped report')
    process.exitCode = 1
  }
}
