// Offline CLI contract only. These tiny synthetic labels MUST NOT promote a model.
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

describe('offline scoped benchmark producer', () => {
  let dir, labelsPath, reportPath, scopePath
  const labels = [1, 2].map(n => ({
    questionId: `fixture-${n}`, contentSha256: String(n).repeat(64), flawCodes: [],
    evidenceClass: 'deterministic_gold', proofRef: 'f'.repeat(64), reviewerCount: 0,
    adjudication: 'deterministic', reviewerRefs: [],
  }))
  const scope = {
    schemaVersion: 'promotion-scope@1', kind: 'bounded_cohort', game: 'turkce', examRef: 'LGS',
    controlSetSha256: createHash('sha256').update(JSON.stringify(labels)).digest('hex'),
    targets: [{ questionId: '11111111-1111-4111-8111-111111111111', revisionId: '22222222-2222-4222-8222-222222222222', contentSha256: 'a'.repeat(64) }],
  }
  const run = (...args) => spawnSync(process.execPath, [resolve('database/run-question-benchmark.mjs'),
    '--labels', labelsPath, '--report', reportPath, ...args], { encoding: 'utf8', timeout: 20000, windowsHide: true })
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'bilge-benchmark-scope-'))
    labelsPath = join(dir, 'labels.json'); reportPath = join(dir, 'report.json'); scopePath = join(dir, 'scope.json')
    writeFileSync(labelsPath, JSON.stringify(labels))
    writeFileSync(scopePath, JSON.stringify(scope))
    writeFileSync(reportPath, JSON.stringify({ reliability: { failureRate: 0 },
      items: labels.map(l => ({ questionId: l.questionId, contentSha256: l.contentSha256, findings: [], verdict: 'APPROVED' })) }))
  })
  // Keep this uniquely named disposable fixture for diagnosis; no recursive deletion.
  it('binds scope to exact label bytes, while undersized controls still fail promotion', () => {
    const out = join(dir, 'new.json'), result = run('--scope', scopePath, '--out', out)
    expect(result.status, result.stderr).toBe(2)
    expect(JSON.parse(readFileSync(out, 'utf8'))).toMatchObject({ scope, benchmark: { promotion: { passed: false } } })
  }, 30000)
  it('rejects a different control artifact before writing output', () => {
    const bad = join(dir, 'bad.json'), out = join(dir, 'must-not-exist.json')
    writeFileSync(bad, JSON.stringify({ ...scope, controlSetSha256: '0'.repeat(64) }))
    const result = run('--scope', bad, '--out', out)
    expect(result.status).toBe(1); expect(result.stderr).toContain('kontrol kumesi')
    expect(existsSync(out)).toBe(false)
  }, 30000)
  it('unscoped historical metrics remain readable but do not gain a scope', () => {
    const out = join(dir, 'diagnostic.json'), result = run('--out', out)
    expect(result.status, result.stderr).toBe(2)
    expect(JSON.parse(readFileSync(out, 'utf8'))).not.toHaveProperty('scope')
  }, 30000)
  it('refuses to overwrite existing evidence', () => {
    const out = join(dir, 'sealed.json'); writeFileSync(out, 'sealed evidence')
    const result = run('--scope', scopePath, '--out', out)
    expect(result.status).toBe(1); expect(result.stderr).toContain('EEXIST')
    expect(readFileSync(out, 'utf8')).toBe('sealed evidence')
  }, 30000)
})
