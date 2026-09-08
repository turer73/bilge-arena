import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import {
  EXPECTED_TYT_SOCIAL_EPOCH_TESTS,
  TYT_SOCIAL_EPOCH_TEST_FILE,
  verifyTytSocialEpochCiReport,
} from '../../scripts/security/verify-tyt-social-epoch-ci-result.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
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
  numTotalTests: 13,
  numPassedTests: 13,
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
    assertionResults: Array.from({ length: 13 }, (_, index) => assertion(index)),
  }],
})

describe('TYT social epoch CI result contract', () => {
  it('accepts the real-shape 13/13 report and returns the bounded summary', () => {
    expect(EXPECTED_TYT_SOCIAL_EPOCH_TESTS).toBe(13)
    expect(verifyTytSocialEpochCiReport(validReport())).toEqual({ passed: 13, skipped: 0 })
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

  it('keeps the verifier bound to the exact integration test file', () => {
    expect(TYT_SOCIAL_EPOCH_TEST_FILE)
      .toBe('database/__tests__/tyt-social-selection-epoch-postgres.integration.test.mjs')
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
    expect(job).toMatch(/node node_modules\/vitest\/vitest\.mjs run[\s\S]*?tyt-social-selection-epoch-postgres\.integration\.test\.mjs/i)
    expect(job).toMatch(/verify-tyt-social-epoch-ci-result\.mjs\s+"\$RUNNER_TEMP\/tyt-social-epoch-acceptance\.json"/i)
    expect(workflow).toMatch(/build:\n[\s\S]*?needs:\s*\[[^\]]*tyt-social-epoch-postgres[^\]]*\]/i)
  })

  it('fails closed when a required Build dependency is skipped, failed, cancelled, missing, empty, unknown, or mixed', () => {
    const build = workflow.match(/\n  build:\n([\s\S]*?)(?=\n  [a-z0-9][a-z0-9-]*:\n|\s*$)/i)?.[1]
    expect(build).toBeTruthy()
    expect(build).toMatch(/if:\s*\$\{\{\s*!cancelled\(\)\s*\}\}/)
    expect(build).toMatch(/- name: Require successful CI dependencies[\s\S]*?shell:\s*bash[\s\S]*?DEPENDENCY_RESULTS:\s*\$\{\{\s*join\(needs\.\*\.result,\s*['"]?,['"]?\s*\)\s*\}\}/i)
    expect(build).toMatch(/if \[ "\$DEPENDENCY_RESULTS" != "success,success,success,success,success,success" \]/)
    const needs = build.match(/needs:\s*\[([^\]]+)\]/i)?.[1]
      ?.split(',').map((value) => value.trim()).filter(Boolean).sort()
    expect(needs).toEqual([
      'institution-pilot-postgres', 'lint', 'question-quality-postgres',
      'test', 'type-check', 'tyt-social-epoch-postgres',
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
      'success,success,success,success,success,success',
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
      'success,success,success,success,success,skipped',
      'success,success,success,success,success,failure',
      'success,success,success,success,success,cancelled',
      'success,success,success,success,success',
      '',
      'success,success,success,success,success,unknown',
      'success,failure,success,success,success,success',
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
    const result = spawnSync(process.execPath, [
      join(root, 'scripts', 'security', 'verify-tyt-social-epoch-ci-result.mjs'),
      reportPath,
    ], { encoding: 'utf8' })
    if (contents !== undefined) rmSync(reportPath, { force: true })
    expect(result.status).toBe(1)
  })

  it.each([
    ['zero arguments', []],
    ['nonexistent report path', ['does-not-exist.json']],
  ])('CLI exits 1 for %s', (_label, args) => {
    const result = spawnSync(process.execPath, [
      join(root, 'scripts', 'security', 'verify-tyt-social-epoch-ci-result.mjs'),
      ...args,
    ], { encoding: 'utf8' })
    expect(result.status).toBe(1)
  })

  it('CLI exits 0 for a valid report', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tyt-social-epoch-contract-'))
    const reportPath = join(directory, 'report.json')
    writeFileSync(reportPath, JSON.stringify(validReport()), 'utf8')
    const result = spawnSync(process.execPath, [
      join(root, 'scripts', 'security', 'verify-tyt-social-epoch-ci-result.mjs'),
      reportPath,
    ], { encoding: 'utf8' })
    rmSync(reportPath, { force: true })
    expect(result.status).toBe(0)
  })
})
