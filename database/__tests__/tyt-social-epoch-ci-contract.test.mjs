import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { POSTGRES_CI_SUITES } from '../../scripts/security/postgres-ci-suites.mjs'
import { verifyPostgresCiSuiteReport } from '../../scripts/security/verify-postgres-ci-result.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
// TYT epoch kapisi artik genel PostgreSQL CI kapisinin bir takimidir.
const TYT_SOCIAL_EPOCH_TEST_FILE = 'database/__tests__/tyt-social-selection-epoch-postgres.integration.test.mjs'
const verifyTytSocialEpochCiReport = (report) => verifyPostgresCiSuiteReport('tyt-social-epoch', report, root)
const verifierCli = join(root, 'scripts', 'security', 'verify-postgres-ci-result.mjs')
const workflow = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8').replace(/\r\n/g, '\n')

const assertion = (index, overrides = {}) => ({
  ancestorTitles: ['TYT Social selection epoch on disposable PostgreSQL 16'],
  fullName: `TYT Social selection epoch case ${index + 1}`,
  status: 'passed',
  title: `case ${index + 1}`,
  failureMessages: [],
  ...overrides,
})

const validReport = () => ({
  success: true,
  numTotalTests: 18,
  numPassedTests: 18,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  numSkippedTests: 0,
  numFailedTestSuites: 0,
  numPendingTestSuites: 0,
  testResults: [{
    name: join(root, TYT_SOCIAL_EPOCH_TEST_FILE),
    status: 'passed',
    message: '',
    assertionResults: Array.from({ length: 18 }, (_, index) => assertion(index)),
  }],
})

describe('TYT social epoch CI result contract', () => {
  it('accepts the real-shape 18/18 report and returns the bounded summary', () => {
    expect(POSTGRES_CI_SUITES['tyt-social-epoch'].expectedTests).toBe(18)
    expect(verifyTytSocialEpochCiReport(validReport())).toEqual({ files: 1, passed: 18, skipped: 0 })
  })

  it.each([
    ['success=false', { success: false }],
    ['zero passed', { numPassedTests: 0 }],
    ['failed count', { numFailedTests: 1 }],
    ['pending count', { numPendingTests: 1 }],
    ['todo count', { numTodoTests: 1 }],
    ['skipped count', { numSkippedTests: 1 }],
  ])('rejects %s instead of masking a non-passing report', (_label, change) => {
    expect(() => verifyTytSocialEpochCiReport({ ...validReport(), ...change }))
      .toThrow(/failed|incomplete|skipped/i)
  })

  it.each([
    ['missing total', { numTotalTests: undefined }],
    ['string total', { numTotalTests: '13' }],
    ['missing passed', { numPassedTests: undefined }],
    ['string passed', { numPassedTests: '13' }],
  ])('rejects %s with an actionable error', (_label, change) => {
    expect(() => verifyTytSocialEpochCiReport({ ...validReport(), ...change }))
      .toThrow(/failed|incomplete|skipped/i)
  })

  it.each([
    ['extra test file', (report) => report.testResults.push({ name: 'other.test.mjs', assertionResults: [] })],
    ['missing test file', (report) => { report.testResults = [] }],
    ['wrong test file', (report) => { report.testResults[0].name = 'database/__tests__/wrong.test.mjs' }],
    ['failed assertion', (report) => { report.testResults[0].assertionResults[0] = assertion(0, { status: 'failed', failureMessages: ['boom'] }) }],
    ['duplicate full names', (report) => { report.testResults[0].assertionResults[1].fullName = report.testResults[0].assertionResults[0].fullName }],
  ])('rejects %s and exposes a useful failure message', (_label, mutate) => {
    const report = validReport()
    mutate(report)
    expect(() => verifyTytSocialEpochCiReport(report)).toThrow(/failed|incomplete|skipped/i)
  })

  it('rejects 17 or 19 passing tests because the suite pins exactly 18', () => {
    for (const count of [17, 19]) {
      const report = validReport()
      report.numTotalTests = count
      report.numPassedTests = count
      report.testResults[0].assertionResults = Array.from({ length: count }, (_, index) => assertion(index))
      expect(() => verifyTytSocialEpochCiReport(report)).toThrow(/failed|incomplete|skipped/i)
    }
  })

  it('keeps the verifier bound to the exact integration test file', () => {
    expect(POSTGRES_CI_SUITES['tyt-social-epoch']).toMatchObject({
      job: 'tyt-social-epoch-postgres',
      runner: 'vitest',
      maxWorkers: 1,
      files: [TYT_SOCIAL_EPOCH_TEST_FILE],
    })
  })

  it('requires an enabled, non-optional CI job and a build dependency', () => {
    const job = workflow.match(/\n  tyt-social-epoch-postgres:\n([\s\S]*?)(?=\n  [a-z0-9][a-z0-9-]*:\n|\s*$)/i)?.[1]
    expect(job).toBeTruthy()
    expect(job).toMatch(/ports:\s*[\s\S]*?127\.0\.0\.1:\d+:5432/)
    expect(job).toMatch(/TYT_SOCIAL_EPOCH_TEST_DATABASE_DISPOSABLE:\s*['"]?1['"]?/)
    expect(job).not.toMatch(/continue-on-error:\s*true/i)
    expect(job).not.toMatch(/^\s+if:/m)
    expect(job).toMatch(/Create isolated TYT Social epoch database[\s\S]*?database = `bilge_r44_test_\$\{randomBytes\(8\)\.toString\('hex'\)\}`/i)
    expect(job).toMatch(/baseUrl\s*=\s*['"]postgresql:\/\/postgres:postgres@127\.0\.0\.1:\d+\//i)
    expect(job).toMatch(/server_version_num[\s\S]*?version < 160000[\s\S]*?version >= 170000/i)
    expect(job).toMatch(/appendFileSync\(process\.env\.GITHUB_ENV,\s*`TYT_SOCIAL_EPOCH_TEST_DATABASE_URL=\$\{baseUrl\}\$\{database\}\\n`\)/i)
    expect(job).toMatch(/run:\s*node scripts\/security\/run-postgres-ci-suite\.mjs tyt-social-epoch\n/)
    expect(workflow).toMatch(/build:\n[\s\S]*?needs:\s*\[[^\]]*tyt-social-epoch-postgres[^\]]*\]/i)
  })

  it('fails closed when a required Build dependency is skipped, failed, cancelled, missing, empty, unknown, or mixed', () => {
    const build = workflow.match(/\n  build:\n([\s\S]*?)(?=\n  [a-z0-9][a-z0-9-]*:\n|\s*$)/i)?.[1]
    expect(build).toBeTruthy()
    expect(build).toMatch(/if:\s*\$\{\{\s*!cancelled\(\)\s*\}\}/)
    expect(build).toMatch(/- name: Require successful CI dependencies[\s\S]*?shell:\s*bash[\s\S]*?DEPENDENCY_RESULTS:\s*\$\{\{\s*join\(needs\.\*\.result,\s*['"]?,['"]?\s*\)\s*\}\}/i)
    expect(build).toMatch(/if \[ "\$DEPENDENCY_RESULTS" != "success,success,success,success,success,success,success,success" \]/)
    const needs = build.match(/needs:\s*\[([^\]]+)\]/i)?.[1]
      ?.split(',').map((value) => value.trim()).filter(Boolean).sort()
    expect(needs).toEqual([
      'institution-pilot-postgres', 'learning-reward-postgres', 'lint', 'postgrest-contract',
      'question-quality-postgres', 'test', 'type-check', 'tyt-social-epoch-postgres',
    ])

    const bashPath = process.platform === 'win32'
      ? join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe')
      : '/bin/bash'
    expect(existsSync(bashPath)).toBe(true)
    const firstStep = build.match(/steps:\n      - name: Require successful CI dependencies\n([\s\S]*?)(?=\n      -)/)?.[1]
    expect(firstStep).toBeTruthy()
    const guard = firstStep.match(/run:\s*\|\n([\s\S]*)$/)?.[1]
      ?.split('\n').map((line) => line.replace(/^          /, '')).join('\n')
    expect(guard).toBeTruthy()
    for (const value of [
      'success,success,success,success,success,success,success,success',
    ]) {
      expect(spawnSync(bashPath, ['--noprofile', '--norc', '-e', '-s'], {
        input: guard,
        encoding: 'utf8',
        env: { PATH: '', SystemRoot: process.env.SystemRoot ?? 'C:\\Windows', DEPENDENCY_RESULTS: value },
        windowsHide: true,
        timeout: 5000,
      }).status).toBe(0)
    }
    for (const value of [
      'success,success,success,success,success,success,success,skipped',
      'success,success,success,success,success,success,success,failure',
      'success,success,success,success,success,success,success,cancelled',
      'success,success,success,success,success,success,success',
      '',
      'success,success,success,success,success,success,success,unknown',
      'success,failure,success,success,success,success,success,success',
    ]) {
      expect(spawnSync(bashPath, ['--noprofile', '--norc', '-e', '-s'], {
        input: guard,
        encoding: 'utf8',
        env: { PATH: '', SystemRoot: process.env.SystemRoot ?? 'C:\\Windows', DEPENDENCY_RESULTS: value },
        windowsHide: true,
        timeout: 5000,
      }).status).toBe(1)
    }
  })

  it.each([
    ['malformed JSON', '{not-json'],
    ['nonpassing JSON', JSON.stringify({ ...validReport(), numPassedTests: 12 })],
  ])('CLI exits 1 for %s', (_label, contents) => {
    const directory = mkdtempSync(join(tmpdir(), 'tyt-social-epoch-contract-'))
    const reportPath = join(directory, 'report.json')
    if (contents !== undefined) writeFileSync(reportPath, contents, 'utf8')
    const result = spawnSync(process.execPath, [verifierCli, 'tyt-social-epoch', reportPath], { encoding: 'utf8' })
    if (contents !== undefined) rmSync(reportPath, { force: true })
    expect(result.status).toBe(1)
  })

  it.each([
    ['zero arguments', []],
    ['nonexistent report path', ['tyt-social-epoch', 'does-not-exist.json']],
    ['unknown suite id', ['not-a-suite', 'does-not-exist.json']],
  ])('CLI exits 1 for %s', (_label, args) => {
    const result = spawnSync(process.execPath, [verifierCli, ...args], { encoding: 'utf8' })
    expect(result.status).toBe(1)
  })

  it('CLI exits 0 for a valid report', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tyt-social-epoch-contract-'))
    const reportPath = join(directory, 'report.json')
    writeFileSync(reportPath, JSON.stringify(validReport()), 'utf8')
    const result = spawnSync(process.execPath, [verifierCli, 'tyt-social-epoch', reportPath], { encoding: 'utf8' })
    rmSync(reportPath, { force: true })
    expect(result.status).toBe(0)
  })
})
