import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  FIXTURE_MIRROR_TITLE_PREFIX,
  POSTGREST_CONTRACT_SUFFIX,
  findPostgrestContractFiles,
  verifyPostgrestContractCiReport,
} from '../../scripts/security/verify-postgrest-contract-ci-result.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const workflow = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8').replace(/\r\n/g, '\n')
const files = ['src/a/__tests__/route.postgrest.test.ts', 'src/b/__tests__/helper.postgrest.test.ts']

const assertion = (file, title, overrides = {}) => ({
  ancestorTitles: [`${file} on real PostgreSQL + PostgREST`],
  fullName: `${file} ${title}`,
  title,
  status: 'passed',
  failureMessages: [],
  ...overrides,
})

const validReport = () => ({
  success: true,
  numTotalTests: 4,
  numPassedTests: 4,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  numSkippedTests: 0,
  numFailedTestSuites: 0,
  numPendingTestSuites: 0,
  testResults: files.map((file) => ({
    name: join(root, file),
    status: 'passed',
    message: '',
    assertionResults: [
      assertion(file, `${FIXTURE_MIRROR_TITLE_PREFIX}relationships`),
      assertion(file, 'returns the embedded shape'),
    ],
  })),
})

describe('PostgREST contract CI result contract', () => {
  it('accepts a report in which every contract file ran and passed', () => {
    expect(verifyPostgrestContractCiReport(validReport(), files, root)).toEqual({ files: 2, passed: 4, skipped: 0 })
  })

  it.each([
    ['success=false', { success: false }],
    ['zero tests', { numTotalTests: 0, numPassedTests: 0 }],
    ['passed below total', { numPassedTests: 3 }],
    ['failed count', { numFailedTests: 1 }],
    ['pending count', { numPendingTests: 1 }],
    ['todo count', { numTodoTests: 1 }],
    ['skipped count', { numSkippedTests: 1 }],
    ['string total', { numTotalTests: '4' }],
  ])('rejects %s', (_label, change) => {
    expect(() => verifyPostgrestContractCiReport({ ...validReport(), ...change }, files, root))
      .toThrow(/failed|incomplete|skipped/i)
  })

  it.each([
    ['a contract file that did not run', (report) => { report.testResults.pop() }],
    ['an unexpected file', (report) => { report.testResults[1].name = join(root, 'src/c/other.postgrest.test.ts') }],
    ['a duplicated file', (report) => { report.testResults[1].name = report.testResults[0].name }],
    ['a skipped assertion', (report) => { report.testResults[0].assertionResults[1].status = 'skipped' }],
    ['a failed assertion', (report) => {
      report.testResults[0].assertionResults[1] = assertion(files[0], 'boom', { status: 'failed', failureMessages: ['x'] })
    }],
    ['a file without the fixture mirror test', (report) => { report.testResults[1].assertionResults[0].title = 'something else' }],
    ['a file without assertions', (report) => { report.testResults[1].assertionResults = [] }],
    ['duplicate full names', (report) => {
      report.testResults[0].assertionResults[1].fullName = report.testResults[0].assertionResults[0].fullName
    }],
  ])('rejects %s', (_label, mutate) => {
    const report = validReport()
    mutate(report)
    expect(() => verifyPostgrestContractCiReport(report, files, root)).toThrow(/failed|incomplete|skipped/i)
  })

  it('rejects an empty contract file list', () => {
    expect(() => verifyPostgrestContractCiReport(validReport(), [], root)).toThrow(/incomplete/i)
  })

  it('discovers the contract files that live in src', () => {
    const found = findPostgrestContractFiles(root)
    expect(found.length).toBeGreaterThanOrEqual(8)
    expect(found.every((file) => file.startsWith('src/') && file.endsWith(POSTGREST_CONTRACT_SUFFIX))).toBe(true)
    expect(found).toContain('src/app/api/comments/__tests__/route.postgrest.test.ts')
    for (const file of found) {
      expect(readFileSync(join(root, file), 'utf8'), file).toMatch(/assertFixtureMirrorsGeneratedSchema\(/)
    }
  })

  it('requires an enabled, sequential CI job that verifies its report and gates Build', () => {
    const job = workflow.match(/\n  postgrest-contract:\n([\s\S]*?)(?=\n  [a-z0-9][a-z0-9-]*:\n|\s*$)/i)?.[1]
    expect(job).toBeTruthy()
    expect(job).not.toMatch(/continue-on-error:\s*true/i)
    expect(job).not.toMatch(/^ {4}if:/m)
    expect(job).toMatch(/image:\s*postgres:16\b/)
    expect(job).toMatch(/postgrest\/postgrest:v14\.17\b/)
    expect(job).toMatch(/POSTGREST_CONTRACT_TEST_DATABASE_DISPOSABLE:\s*['"]?1['"]?/)
    expect(job).toMatch(/POSTGREST_CONTRACT_TEST_DATABASE_URL:\s*postgres:\/\/[^\s]*\/bilge_postgrest_contract_[a-z0-9_]+\s/)
    expect(job).toMatch(/node node_modules\/vitest\/vitest\.mjs run --no-file-parallelism postgrest\.test\.ts[\s\S]*?--outputFile\.json="\$RUNNER_TEMP\/postgrest-contract\.json"/)
    expect(job).toMatch(/verify-postgrest-contract-ci-result\.mjs\s+"\$RUNNER_TEMP\/postgrest-contract\.json"/)
    expect(workflow).toMatch(/\n  build:\n[\s\S]*?needs:\s*\[[^\]]*\bpostgrest-contract\b[^\]]*\]/i)
  })
})
