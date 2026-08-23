import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const validation = readFileSync(new URL('../migrations/136_question_validation_pipeline.sql', import.meta.url), 'utf8')
const psychometrics = readFileSync(new URL('../migrations/137_question_revision_psychometrics_v2.sql', import.meta.url), 'utf8')
const benchmarkRunner = readFileSync(new URL('../run-question-benchmark.mjs', import.meta.url), 'utf8')
const auditRunner = readFileSync(new URL('../run-question-audit.mjs', import.meta.url), 'utf8')
const goldBuilder = readFileSync(new URL('../build-question-audit-gold-set.mjs', import.meta.url), 'utf8')
const reviewPackBuilder = readFileSync(new URL('../build-question-audit-review-pack.mjs', import.meta.url), 'utf8')
const adjudicationPackBuilder = readFileSync(new URL('../build-question-audit-adjudication-pack.mjs', import.meta.url), 'utf8')
const promotionWorkflow = readFileSync(new URL('../../.github/workflows/question-quality-promotion.yml', import.meta.url), 'utf8')

describe('question validation persistence and publish gate SQL', () => {
  it('stores the exact replay and cache identity', () => {
    for (const field of [
      'input_snapshot', 'provider_id', 'model_id', 'prompt_version',
      'generation_config_sha256', 'generation_config', 'policy_version', 'executed_at',
    ]) expect(validation).toContain(field)
    expect(validation).toContain('question_validation_runs_dedup_v2')
  })

  it('binds a derived decision to revision and content hash before publish', () => {
    expect(validation).toContain('CREATE TABLE IF NOT EXISTS public.question_validation_decisions')
    expect(validation).toContain('trg_question_validation_publish_gate')
    expect(validation).toMatch(/content_sha256\s*=\s*v_revision\.content_sha256/)
    expect(validation).toContain("v_verdict NOT IN ('APPROVED','NEEDS_REVIEW')")
    // Rollout is explicitly staged; operator enables only after backfill.
    expect(validation).toContain('enforce_publish_gate boolean NOT NULL DEFAULT false')
  })

  it('grants the service runner read-only access to its exact source columns', () => {
    expect(validation).toMatch(/GRANT SELECT \(id, question_id,[\s\S]+question_content_revisions TO service_role/)
    expect(validation).toMatch(/GRANT SELECT \(id, game,[\s\S]+public\.questions TO service_role/)
    expect(validation).not.toMatch(/GRANT (?:ALL|INSERT|UPDATE|DELETE)[^;]+question_content_revisions TO service_role/)
  })
})

describe('revision psychometrics v2 SQL', () => {
  it('uses the Wilson score interval rather than the legacy Wald formula', () => {
    expect(psychometrics).toContain('center:=(p+z2/(2*n))/(1+z2/n)')
    expect(psychometrics).toContain('margin:=1.96*sqrt((p*(1-p)+z2/(4*n))/n)/(1+z2/n)')
    expect(psychometrics).not.toContain('(good::numeric/n)-1.96*sqrt')
  })

  it('filters to first exposure without hints and materializes each option', () => {
    expect(psychometrics).toContain('verified_attempt_hint_events')
    expect(psychometrics).toContain('session_answers earlier')
    expect(psychometrics).toContain('time_taken_sec BETWEEN 2 AND 600')
    expect(psychometrics).toContain('CREATE TABLE IF NOT EXISTS public.question_option_statistics')
    expect(psychometrics).toContain('generate_series(0,r.option_count-1)')
  })
})

describe('human-gold benchmark release gate', () => {
  it('requires a full item report and fails a rejected promotion', () => {
    expect(benchmarkRunner).toContain('calibration.items')
    expect(benchmarkRunner).toContain('promptVersions: calibration.promptVersions')
    expect(benchmarkRunner).toContain('evaluateBenchmark')
    expect(benchmarkRunner).toContain('process.exitCode = 2')
  })

  it('builds gold labels only from two reviewer files and optional adjudication', () => {
    expect(goldBuilder).toContain("reviewPaths.length !== 2")
    expect(goldBuilder).toContain('buildHumanGoldSet')
    expect(goldBuilder).toContain("--adjudication")
  })

  it('prepares a read-only blind review pack without exposing prediction metadata', () => {
    expect(reviewPackBuilder).toContain(".eq('is_active', true)")
    expect(reviewPackBuilder).toContain(".eq('policy_version', policyVersion)")
    expect(reviewPackBuilder).toContain('toBlindReviewPacket')
    expect(reviewPackBuilder).toContain('flawCodes: null')
    expect(reviewPackBuilder).not.toMatch(/\.from\([^)]+\)\.(?:insert|update|upsert|delete)\(/)
  })

  it('materializes consensus and adjudicated labels through the CLI', () => {
    const root = fileURLToPath(new URL('../..', import.meta.url))
    const temp = mkdtempSync(join(tmpdir(), 'bilge-gold-'))
    const out = join(temp, 'gold.json')
    try {
      const result = spawnSync(process.execPath, [
        'database/build-question-audit-gold-set.mjs',
        '--review', 'database/__tests__/fixtures/question-audit-review-a.valid.json',
        '--review', 'database/__tests__/fixtures/question-audit-review-b.valid.json',
        '--adjudication', 'database/__tests__/fixtures/question-audit-adjudicator.valid.json',
        '--out', out,
      ], { cwd: root, encoding: 'utf8' })
      expect(result.status, result.stderr).toBe(0)
      const labels = JSON.parse(readFileSync(out, 'utf8'))
      expect(labels).toHaveLength(2)
      expect(labels.map((label) => label.adjudication)).toEqual(['consensus', 'adjudicated'])
    } finally {
      rmSync(temp, { recursive: true, force: true })
    }
  })

  it('gives the adjudicator only disputed blind items, not reviewer decisions', () => {
    expect(adjudicationPackBuilder).toContain('findHumanGoldDisputes')
    expect(adjudicationPackBuilder).toContain("'adjudicator-packet.json'")
    expect(adjudicationPackBuilder).toContain("'coordinator-disputes.json'")
    const root = fileURLToPath(new URL('../..', import.meta.url))
    const temp = mkdtempSync(join(tmpdir(), 'bilge-adjudication-'))
    const packet = join(temp, 'packet.json')
    const outDir = join(temp, 'out')
    writeFileSync(packet, JSON.stringify({
      schemaVersion: 'question-audit-blind-pack@1',
      selectionId: 'selection-1',
      items: [
        { questionId: 'clean-question', contentSha256: 'a'.repeat(64), content: { question: 'clean' } },
        { questionId: 'wrong-key-question', contentSha256: 'b'.repeat(64), content: { question: 'disputed' } },
      ],
    }))
    try {
      const result = spawnSync(process.execPath, [
        'database/build-question-audit-adjudication-pack.mjs',
        '--packet', packet,
        '--review', 'database/__tests__/fixtures/question-audit-review-a.valid.json',
        '--review-b', 'database/__tests__/fixtures/question-audit-review-b.valid.json',
        '--out-dir', outDir,
      ], { cwd: root, encoding: 'utf8' })
      expect(result.status, result.stderr).toBe(0)
      const blind = JSON.parse(readFileSync(join(outDir, 'adjudicator-packet.json'), 'utf8'))
      const privateCoordinator = JSON.parse(readFileSync(join(outDir, 'coordinator-disputes.json'), 'utf8'))
      expect(blind.items.map((item) => item.questionId)).toEqual(['wrong-key-question'])
      expect(JSON.stringify(blind)).not.toContain('reviewerFlawCodes')
      expect(privateCoordinator.disputes[0].reviewerFlawCodes).toEqual([[], ['WRONG_KEY_SUSPECTED']])
    } finally {
      rmSync(temp, { recursive: true, force: true })
    }
  })

  it('does not persist authoritative decisions without matching promotion evidence', () => {
    expect(auditRunner).toContain('--promotion-report')
    expect(auditRunner).toContain('deps.promotionEvidence')
    expect(auditRunner).toContain('--no-decisions')
  })

  it('audits the exact question and revision hashes from the held-out gold set', () => {
    expect(auditRunner).toContain('args.goldLabelsPath')
    expect(auditRunner).toContain(".from('question_content_revisions')")
    expect(auditRunner).toContain('gold revision bulunamadi')
    expect(auditRunner).toContain('content_sha256')
    expect(auditRunner).toContain('validateGoldLabels')
  })

  it('binds ordinary full-bank audits to the published revision DB hash', () => {
    expect(auditRunner).toContain('attachPublishedRevisionHashes')
    expect(auditRunner).toContain('aktif soru published revision pointer tasimiyor')
    expect(auditRunner).toContain('published revision hash bulunamadi')
    expect(auditRunner).toContain('revision.question_id !== row.id')
    expect(auditRunner).toContain('published revision DB hash gecersiz')
    expect(auditRunner).toContain('content_sha256: revision.content_sha256')
  })

  it('runs without an LLM or database and returns exit 2 for an undersized gold set', () => {
    const root = fileURLToPath(new URL('../..', import.meta.url))
    const result = spawnSync(process.execPath, [
      'database/run-question-benchmark.mjs',
      '--labels', 'database/__tests__/fixtures/question-audit-gold.valid.json',
      '--report', 'database/__tests__/fixtures/question-audit-calibration.valid.json',
    ], { cwd: root, encoding: 'utf8' })
    expect(result.status).toBe(2)
    const output = JSON.parse(result.stdout)
    expect(output.subject.promptVersions.blind).toBe('blind-solver@2')
    expect(output.benchmark.overall.balancedAccuracy).toBe(1)
    expect(output.benchmark.promotion.passed).toBe(false)
    expect(output.benchmark.promotion.failures.join(' ')).toContain('label_count')
  })

  it('runs the paid promotion audit only by manual environment-gated dispatch', () => {
    expect(promotionWorkflow).toContain('workflow_dispatch:')
    expect(promotionWorkflow).toContain('environment: question-quality-promotion')
    expect(promotionWorkflow).toContain('QUESTION_AUDIT_GOLD_LABELS_GZIP_B64')
    expect(promotionWorkflow).toContain('--gold-labels "$RUNNER_TEMP/gold-labels.json"')
    expect(promotionWorkflow).toContain('npm run audit:benchmark')
    expect(promotionWorkflow).toContain('--model "$AUDIT_MODEL"')
    expect(promotionWorkflow).not.toContain('--model "${{ inputs.model }}"')
    expect(promotionWorkflow).not.toContain('--persist')
  })
})
