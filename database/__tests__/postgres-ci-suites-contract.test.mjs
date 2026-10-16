import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import {
  DB_SKIP_ALLOWLIST,
  POSTGRES_CI_SUITES,
  postgresCiSuite,
  postgresCiSuiteFiles,
} from '../../scripts/security/postgres-ci-suites.mjs'
import {
  verifyNodeTestCiReport,
  verifyPostgresCiSuiteReport,
  verifyVitestCiReport,
} from '../../scripts/security/verify-postgres-ci-result.mjs'
import { verifyDbSkipCoverage } from '../../scripts/security/verify-db-skip-coverage.mjs'
import { postgresCiSuiteCommand } from '../../scripts/security/run-postgres-ci-suite.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const workflow = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8').replace(/\r\n/g, '\n')
const jobBlock = (name) => workflow.match(new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z0-9][a-z0-9-]*:\\n|\\s*$)`, 'i'))?.[1]
const REJECTION = /failed, incomplete or skipped/i
const reporterUrl = new URL('../../scripts/security/node-test-json-reporter.mjs', import.meta.url).href

const files = ['database/__tests__/a-postgres.integration.test.mjs', 'database/__tests__/b-postgres.integration.test.mjs']
const vitestAssertion = (file, title, overrides = {}) => ({
  ancestorTitles: [file],
  fullName: `${file} ${title}`,
  title,
  status: 'passed',
  failureMessages: [],
  ...overrides,
})
const validVitestReport = () => ({
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
    assertionResults: [vitestAssertion(file, 'pays once'), vitestAssertion(file, 'rejects replay')],
  })),
})
const validNodeTestReport = () => ({
  runner: 'node-test',
  complete: true,
  tests: files.flatMap((file) => [
    { file: join(root, file), name: 'pays once', nesting: 1, kind: 'test', status: 'passed' },
    { file: join(root, file), name: 'suite', nesting: 0, kind: 'suite', status: 'passed' },
  ]),
})

describe('PostgreSQL CI suite manifest', () => {
  it('lists existing, unique test files with a known runner', () => {
    const all = postgresCiSuiteFiles()
    expect(new Set(all).size).toBe(all.length)
    for (const [id, suite] of Object.entries(POSTGRES_CI_SUITES)) {
      expect(['vitest', 'node-test'], id).toContain(suite.runner)
      expect(suite.files.length, id).toBeGreaterThan(0)
      for (const file of suite.files) expect(existsSync(join(root, file)), file).toBe(true)
    }
    expect(() => postgresCiSuite('not-a-suite')).toThrow(/unknown/i)
    expect(() => postgresCiSuite('__proto__')).toThrow(/unknown/i)
  })

  it('wires every database PostgreSQL test file into a suite', () => {
    const covered = new Set(postgresCiSuiteFiles())
    const postgresFiles = readdirSync(join(root, 'database', '__tests__'))
      .filter((name) => /-postgres(\.integration)?\.test\.mjs$|\.integration\.test\.mjs$/.test(name))
      .map((name) => `database/__tests__/${name}`)
    expect(postgresFiles.length).toBeGreaterThanOrEqual(30)
    expect(postgresFiles.filter((file) => !covered.has(file))).toEqual([])
  })

  it('runs the 13 learning, reward and grading files that no job ran before', () => {
    expect(POSTGRES_CI_SUITES['learning-reward']).toMatchObject({ job: 'learning-reward-postgres', runner: 'vitest', sequential: true })
    expect(POSTGRES_CI_SUITES['learning-reward'].files.map((file) => file.replace(/^database\/__tests__\/|-postgres\.integration\.test\.mjs$/g, '')).sort()).toEqual([
      'canonical-category-remap', 'cohort-team-boss', 'curriculum-graph-v1', 'daily-plan-items-v2', 'paper-study-packs',
      'persistent-fsrs', 'positive-learning-spotlights', 'purchase-ledger', 'relative-weekly-leagues', 'session-coin-scale',
      'verified-attempts', 'verified-coach-flow', 'verified-exam-strategy',
    ])
  })

  it('invokes each suite exactly once, inside its own enabled job that gates Build', () => {
    const invocations = [...workflow.matchAll(/node scripts\/security\/run-postgres-ci-suite\.mjs ([a-z0-9-]+)/g)].map((match) => match[1])
    expect(invocations.sort()).toEqual(Object.keys(POSTGRES_CI_SUITES).sort())
    const needs = workflow.match(/\n  build:\n[\s\S]*?needs:\s*\[([^\]]+)\]/)?.[1].split(',').map((value) => value.trim())
    for (const [id, suite] of Object.entries(POSTGRES_CI_SUITES)) {
      const job = jobBlock(suite.job)
      expect(job, suite.job).toBeTruthy()
      expect(job).toMatch(new RegExp(`run: node scripts/security/run-postgres-ci-suite\\.mjs ${id}\\n`))
      expect(job).not.toMatch(/continue-on-error:\s*true/i)
      expect(job).not.toMatch(/^ {4}if:/m)
      expect(job).toMatch(/image:\s*postgres:16\b/)
      expect(needs).toContain(suite.job)
    }
  })

  it('gives the learning-reward job a disposable database for every env family it needs', () => {
    const job = jobBlock('learning-reward-postgres')
    for (const [prefix, database] of [
      ['VERIFIED_ATTEMPTS', 'bilge_r02_test_ci'], ['WLL', 'bilge_r31_test_ci'], ['SPOTLIGHTS', 'bilge_r32_test_ci'],
      ['TEAM_BOSS', 'bilge_r33_test_ci'], ['PAPER_PACK', 'bilge_r41_test_ci'], ['CANONICAL_CATEGORY', 'bilge_r109_test_ci'],
    ]) {
      expect(job).toMatch(new RegExp(`${prefix}_TEST_DATABASE_URL: postgres://postgres:postgres@127\\.0\\.0\\.1:5432/${database}\\n`))
      expect(job).toMatch(new RegExp(`${prefix}_TEST_DATABASE_DISPOSABLE: '1'\\n`))
      if (database !== 'bilge_r02_test_ci') expect(job).toMatch(new RegExp(`'${database}'`))
    }
    expect(job).toMatch(/ports:\s*\n\s*- '127\.0\.0\.1:5432:5432'/)
  })

  it('makes the Test job prove that test:db skips are covered', () => {
    const job = jobBlock('test')
    expect(job).toMatch(/npm run test:db -- --reporter=default --reporter=json --outputFile\.json="\$RUNNER_TEMP\/test-db\.json"/)
    expect(job).toMatch(/run: node scripts\/security\/verify-db-skip-coverage\.mjs "\$RUNNER_TEMP\/test-db\.json"/)
  })

  it('builds sequential, worker-limited and node:test commands with a fresh report path', () => {
    expect(postgresCiSuiteCommand(POSTGRES_CI_SUITES['learning-reward'], 'r.json')).toEqual(expect.arrayContaining([
      'run', '--config', 'vitest.database.config.ts', '--no-file-parallelism', '--reporter=json', '--outputFile.json=r.json',
    ]))
    expect(postgresCiSuiteCommand(POSTGRES_CI_SUITES['tyt-social-epoch'], 'r.json')).toContain('--maxWorkers=1')
    expect(postgresCiSuiteCommand(POSTGRES_CI_SUITES['source-review-native'], 'r.json')).not.toContain('--no-file-parallelism')
    const nodeTest = postgresCiSuiteCommand(POSTGRES_CI_SUITES['canonical-identity'], 'r.json')
    expect(nodeTest.slice(0, 5)).toEqual([
      '--test', '--test-reporter=spec', '--test-reporter-destination=stdout',
      `--test-reporter=${reporterUrl}`, '--test-reporter-destination=r.json',
    ])
  })
})

describe('Vitest PostgreSQL CI report gate', () => {
  it('accepts a report in which every suite file ran and passed', () => {
    expect(verifyVitestCiReport(validVitestReport(), files, { root })).toEqual({ files: 2, passed: 4, skipped: 0 })
  })

  it.each([
    ['success=false', { success: false }],
    ['skipped count', { numSkippedTests: 1 }],
    ['pending count', { numPendingTests: 1 }],
    ['skipped file count', { numPendingTestSuites: 1 }],
    ['todo count', { numTodoTests: 1 }],
    ['failed count', { numFailedTests: 1 }],
    ['zero tests', { numTotalTests: 0, numPassedTests: 0 }],
    ['passed below total', { numPassedTests: 3 }],
    ['string total', { numTotalTests: '4' }],
  ])('rejects %s', (_label, change) => {
    expect(() => verifyVitestCiReport({ ...validVitestReport(), ...change }, files, { root })).toThrow(REJECTION)
  })

  it.each([
    ['a suite file that did not run', (report) => { report.testResults.pop() }],
    ['an unexpected file', (report) => { report.testResults[1].name = join(root, 'database/__tests__/other.test.mjs') }],
    ['a duplicated file', (report) => { report.testResults[1].name = report.testResults[0].name }],
    ['a whole file skipped by describe.skip', (report) => {
      report.testResults[1].status = 'skipped'
      for (const assertion of report.testResults[1].assertionResults) assertion.status = 'skipped'
    }],
    ['a skipped assertion', (report) => { report.testResults[0].assertionResults[1].status = 'skipped' }],
    ['a pending assertion', (report) => { report.testResults[0].assertionResults[1].status = 'pending' }],
    ['a todo assertion', (report) => { report.testResults[0].assertionResults[1].status = 'todo' }],
    ['a failed assertion', (report) => {
      report.testResults[0].assertionResults[1] = vitestAssertion(files[0], 'boom', { status: 'failed', failureMessages: ['x'] })
    }],
    ['a file without assertions', (report) => { report.testResults[1].assertionResults = [] }],
    ['duplicate full names', (report) => {
      report.testResults[0].assertionResults[1].fullName = report.testResults[0].assertionResults[0].fullName
    }],
  ])('rejects %s', (_label, mutate) => {
    const report = validVitestReport()
    mutate(report)
    expect(() => verifyVitestCiReport(report, files, { root })).toThrow(REJECTION)
  })

  it('names the manifest file, never report-supplied text, in the rejection', () => {
    const report = validVitestReport()
    report.testResults[0].assertionResults[1].status = 'skipped'
    report.testResults[0].assertionResults[1].fullName = 'attacker controlled \u001b[31m text'
    expect(() => verifyVitestCiReport(report, files, { root })).toThrow(`skipped test (${files[0]})`)
    report.testResults[0].name = join(root, 'database/__tests__/attacker.test.mjs')
    expect(() => verifyVitestCiReport(report, files, { root })).toThrow(/test file outside suite$/)
  })

  it('pins the exact count when a suite declares one', () => {
    expect(() => verifyVitestCiReport(validVitestReport(), files, { root, expectedTests: 5 })).toThrow(/exactly 5/)
  })
})

describe('node:test PostgreSQL CI report gate', () => {
  it('accepts a complete report in which every suite file passed a test', () => {
    expect(verifyNodeTestCiReport(validNodeTestReport(), files, { root })).toEqual({ files: 2, passed: 2, skipped: 0 })
  })

  it.each([
    ['an unfinished reporter stream', (report) => { delete report.complete }],
    ['another runner', (report) => { report.runner = 'vitest' }],
    ['a skipped describe (its children are not reported)', (report) => { report.tests[1].status = 'skipped' }],
    ['a skipped test', (report) => { report.tests[0].status = 'skipped' }],
    ['a todo test', (report) => { report.tests[0].status = 'todo' }],
    ['a failed test', (report) => { report.tests[0].status = 'failed' }],
    ['a file that only reported a suite', (report) => { report.tests = report.tests.filter((entry) => !(entry.file.endsWith('b-postgres.integration.test.mjs') && entry.kind === 'test')) }],
    ['a missing file', (report) => { report.tests = report.tests.filter((entry) => !entry.file.endsWith('b-postgres.integration.test.mjs')) }],
    ['a file outside the suite', (report) => { report.tests[0].file = join(root, 'database/__tests__/other.test.mjs') }],
    ['an entry without a file (load failure)', (report) => { report.tests[0].file = undefined }],
  ])('rejects %s', (_label, mutate) => {
    const report = validNodeTestReport()
    mutate(report)
    expect(() => verifyNodeTestCiReport(report, files, { root })).toThrow(REJECTION)
  })

  it('round-trips real node --test output through the JSON reporter', () => {
    const directory = mkdtempSync(join(tmpdir(), 'postgres-ci-node-test-'))
    try {
      writeFileSync(join(directory, 'pass.test.mjs'), "import { describe, it } from 'node:test'\ndescribe('s', () => { it('a', () => {}); it('b', () => {}) })\n")
      writeFileSync(join(directory, 'skip.test.mjs'), "import { describe, it } from 'node:test'\ndescribe.skip('s', () => { it('a', () => {}) })\n")
      writeFileSync(join(directory, 'load.test.mjs'), "import 'node:test'\nthrow new Error('load failure')\n")
      const run = (file) => {
        const reportPath = join(directory, `${file}.json`)
        spawnSync(process.execPath, ['--test', `--test-reporter=${reporterUrl}`, `--test-reporter-destination=${reportPath}`, file], {
          cwd: directory, encoding: 'utf8', timeout: 30000,
        })
        return JSON.parse(readFileSync(reportPath, 'utf8'))
      }
      expect(verifyNodeTestCiReport(run('pass.test.mjs'), ['pass.test.mjs'], { root: directory })).toEqual({ files: 1, passed: 2, skipped: 0 })
      expect(() => verifyNodeTestCiReport(run('skip.test.mjs'), ['skip.test.mjs'], { root: directory })).toThrow(/skipped test \(skip\.test\.mjs\)/)
      expect(() => verifyNodeTestCiReport(run('load.test.mjs'), ['load.test.mjs'], { root: directory })).toThrow(/did not pass/)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('dispatches by the manifest runner', () => {
    expect(() => verifyPostgresCiSuiteReport('canonical-identity', validVitestReport(), root)).toThrow(/malformed report/)
    expect(() => verifyPostgresCiSuiteReport('learning-reward', validNodeTestReport(), root)).toThrow(REJECTION)
  })
})

describe('test:db skip coverage gate', () => {
  const covered = ['database/__tests__/a-postgres.integration.test.mjs']
  const allowlist = [{ file: 'database/__tests__/bank.test.mjs', title: 'real bank', reason: 'not in repo' }]
  const report = (...entries) => ({
    success: true,
    testResults: entries.map(([file, statuses, status = 'passed']) => ({
      name: join(root, file),
      status,
      assertionResults: statuses.map((assertionStatus, index) => ({ title: index === 0 ? 'real bank' : `t${index}`, status: assertionStatus })),
    })),
  })

  it('accepts skips that a PostgreSQL suite runs and an exact allowlisted title', () => {
    expect(verifyDbSkipCoverage(report(
      ['database/__tests__/a-postgres.integration.test.mjs', ['skipped', 'skipped'], 'skipped'],
      ['database/__tests__/bank.test.mjs', ['skipped', 'passed']],
      ['database/__tests__/unit.test.mjs', ['passed']],
    ), { root, covered, allowlist })).toEqual({ skippedFiles: 2, skippedTests: 3 })
  })

  it.each([
    ['an uncovered skipped file', ['database/__tests__/new-postgres.integration.test.mjs', ['skipped'], 'skipped']],
    ['an uncovered todo', ['database/__tests__/unit.test.mjs', ['passed', 'todo']]],
    ['another skip in an allowlisted file', ['database/__tests__/bank.test.mjs', ['skipped', 'skipped']]],
    ['an allowlisted file skipped as a whole', ['database/__tests__/bank.test.mjs', ['skipped'], 'skipped']],
  ])('rejects %s and names it', (_label, entry) => {
    expect(() => verifyDbSkipCoverage(report(entry), { root, covered, allowlist }))
      .toThrow(new RegExp(`no PostgreSQL CI job runs[\\s\\S]*${entry[0].replace(/[.]/g, '\\.')}`))
  })

  it('does not echo report paths outside database/__tests__', () => {
    expect(() => verifyDbSkipCoverage(report(['../../etc/\u001b[31mevil.test.mjs', ['skipped']]), { root, covered, allowlist }))
      .toThrow(/<path outside database\/__tests__>/)
  })

  it.each([
    ['a failing run', { success: false, testResults: [] }],
    ['an empty run', { success: true, testResults: [] }],
    ['a malformed entry', { success: true, testResults: [{ name: 1 }] }],
  ])('rejects %s', (_label, value) => {
    expect(() => verifyDbSkipCoverage(value, { root, covered, allowlist })).toThrow(/rejected/)
  })

  it('keeps the real allowlist narrow and justified', () => {
    expect(DB_SKIP_ALLOWLIST).toHaveLength(1)
    for (const entry of DB_SKIP_ALLOWLIST) {
      expect(existsSync(join(root, entry.file)), entry.file).toBe(true)
      expect(readFileSync(join(root, entry.file), 'utf8')).toContain(`'${entry.title}'`)
      expect(entry.reason.length).toBeGreaterThan(20)
      expect(postgresCiSuiteFiles()).not.toContain(entry.file)
    }
  })
})

describe('PostgreSQL CI gate CLIs', () => {
  const cli = (script, ...args) => spawnSync(process.execPath, [join(root, 'scripts', 'security', script), ...args], { encoding: 'utf8' })
  const withReport = (contents, run) => {
    const directory = mkdtempSync(join(tmpdir(), 'postgres-ci-cli-'))
    const reportPath = join(directory, 'report.json')
    writeFileSync(reportPath, contents, 'utf8')
    try { return run(reportPath) } finally { rmSync(directory, { recursive: true, force: true }) }
  }

  it('verify-postgres-ci-result exits 1 for wrong arity, unknown suite, missing or skipped report', () => {
    expect(cli('verify-postgres-ci-result.mjs').status).toBe(1)
    expect(cli('verify-postgres-ci-result.mjs', 'not-a-suite', 'x.json').status).toBe(1)
    expect(cli('verify-postgres-ci-result.mjs', 'learning-reward', 'does-not-exist.json').status).toBe(1)
    const skipped = { ...validVitestReport(), numSkippedTests: 1 }
    const result = withReport(JSON.stringify(skipped), (path) => cli('verify-postgres-ci-result.mjs', 'learning-reward', path))
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/skipped tests/)
  })

  it('run-postgres-ci-suite exits 1 for wrong arity and an unknown suite without running tests', () => {
    expect(cli('run-postgres-ci-suite.mjs').status).toBe(1)
    expect(cli('run-postgres-ci-suite.mjs', 'not-a-suite').status).toBe(1)
  })

  it('verify-db-skip-coverage exits 1 for a missing or malformed report', () => {
    expect(cli('verify-db-skip-coverage.mjs').status).toBe(1)
    expect(cli('verify-db-skip-coverage.mjs', 'does-not-exist.json').status).toBe(1)
    expect(withReport('{not-json', (path) => cli('verify-db-skip-coverage.mjs', path)).status).toBe(1)
  })
})
