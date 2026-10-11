import { describe, expect, it } from 'vitest'
import { fromValidationRunRows, toValidationDecisionRow, toValidationRunRows } from '../persistence'
import { deriveVerdict } from '../verdict'
import { solutionVerifierSchema } from '../schemas'
import type { AgentOutcome, AgentTelemetry, AuditRun, GroundedSolutionVerifierPayload } from '../types'

const telemetry: AgentTelemetry = {
  providerId: 'gemini:test',
  modelId: 'gemini-2.5-flash-lite',
  promptVersion: 'blind-solver@1',
  latencyMs: 1200,
  inputTokens: 400,
  outputTokens: 180,
  finishReason: 'STOP',
}

const ok = <T>(data: T, promptVersion = 'blind-solver@1'): AgentOutcome<T> => ({
  status: 'ok', data, telemetry: { ...telemetry, promptVersion }, raw: '{"a":1}',
})

describe('surumlu verifier replay', () => {
  it.each(['solution-verifier@1', 'solution-verifier@2', 'solution-verifier@3'])('%s eski sonucunu yeni kanit uydurmadan korur', (version) => {
    const source = run()
    source.execution.promptVersions.verifier = version
    if (source.verifier.status === 'ok') source.verifier.telemetry.promptVersion = version
    const restored = fromValidationRunRows(toValidationRunRows(source, 'legacy'))
    expect(restored.verifier).toEqual(source.verifier)
    expect(restored.execution.promptVersions.verifier).toBe(version)
  })

  function groundedRun() {
    const source = run()
    source.inputSnapshot.solutionText = '2+2=4'
    source.execution.promptVersions.verifier = 'solution-verifier@4'
    source.verifier = ok<GroundedSolutionVerifierPayload>({
      reasoning: 'Yazarin islemi var.', solutionConcludesIndex: 2, solutionCompleteness: 'adequate',
      evidenceVersion: 'solution-evidence@1', questionDemand: 'reasoning', supportingQuotes: ['2+2=4'],
    }, 'solution-verifier@4')
    return source
  }

  it('yeni kanit alanlari DB mapper gidis-donusunda aynen kalir', () => {
    const source = groundedRun()
    const rows = toValidationRunRows(source, 'grounded')
    expect(fromValidationRunRows(rows)).toEqual({ ...source, sourceRunId: 'grounded' })
  })

  it('saklanmis alinti tekrar input snapshot ile dogrulanir', () => {
    const source = groundedRun()
    source.inputSnapshot.solutionText = 'Yanıt 4.'
    expect(() => fromValidationRunRows(toValidationRunRows(source, 'tampered'))).toThrow('alinti')
  })

  it('eski payload @4 etiketi altinda kanitsiz okunamaz', () => {
    const source = run()
    source.execution.promptVersions.verifier = 'solution-verifier@4'
    expect(() => fromValidationRunRows(toValidationRunRows(source, 'old-mislabeled'))).toThrow()
  })

  it('bilinmeyen gelecek surum eski parsera dusmez', () => {
    const source = groundedRun()
    source.execution.promptVersions.verifier = 'solution-verifier@999'
    expect(() => fromValidationRunRows(toValidationRunRows(source, 'future'))).toThrow('desteklenmeyen')
  })

  function referencedRun() {
    const source = groundedRun()
    source.execution.promptVersions.verifier = 'solution-verifier@5'
    source.verifier = ok(solutionVerifierSchema(source.inputSnapshot.options, '2+2=4').parse({
      reasoning: 'Islem yazarin metninde.', solutionConcludesIndex: 2, solutionCompleteness: 'adequate',
      evidenceVersion: 'solution-evidence@2', questionDemand: 'reasoning', supportingUnitIds: ['author:0'],
    }), 'solution-verifier@5')
    return source
  }

  it('@5 kimlik ve kod kaynakli alinti tam gidis-donus yapar', () => {
    const source = referencedRun()
    expect(fromValidationRunRows(toValidationRunRows(source, 'refs'))).toEqual({ ...source, sourceRunId: 'refs' })
  })

  it.each(['snapshot', 'quotation', 'unit', 'version'])('@5 saklanan %s degisikligi sessizce onarilmaz', (variant) => {
    const rows = toValidationRunRows(referencedRun(), 'bad-refs')
    const row = rows.find((r) => r.agent === 'solution_verifier')!
    if (variant === 'snapshot') {
      for (const r of rows) r.input_snapshot.solutionText = '2+2=5'
    } else {
      row.parsed_output = { ...(row.parsed_output as object), ...{
        quotation: { supportingQuotes: ['W=F*s'] }, unit: { supportingUnitIds: ['author:9'] },
        version: { evidenceVersion: 'solution-evidence@1' },
      }[variant] }
    }
    expect(() => fromValidationRunRows(rows)).toThrow()
  })
})
const failed = <T>(): AgentOutcome<T> => ({
  status: 'failed',
  error: { kind: 'truncated', message: 'kesildi', retryable: true },
  telemetry,
  raw: '{"reasoning":"yar',
})
const skipped = <T>(): AgentOutcome<T> => ({ status: 'skipped', reason: 'cozum metni yok' })

function run(overrides: Partial<AuditRun> = {}): AuditRun {
  const inputSnapshot = {
    questionId: 'q1', revisionId: 'rev1', contentSha256: 'a'.repeat(64), examRef: 'TYT',
    subject: 'matematik', topic: null, questionText: '2+2?', passage: null,
    options: ['1', '2', '4', '5', '6'], markedAnswerIndex: 2, solutionText: '4',
  }
  return {
    questionId: 'q1',
    revisionId: 'rev1',
    contentSha256: 'a'.repeat(64),
    optionCount: 5,
    markedAnswerIndex: 2,
    inputSnapshot,
    execution: {
      policyVersion: 'question-quality@2', generationConfigSha256: 'b'.repeat(64), generationConfig: { blindSamples: 3 },
      providerIds: { blind: 'gemini:test', adversarial: 'gemini:test', verifier: 'gemini:test' },
      modelIds: { blind: 'gemini-2.5-flash-lite', adversarial: 'gemini-2.5-flash-lite', verifier: 'gemini-2.5-flash-lite' },
      promptVersions: { blind: 'blind-solver@1', adversarial: 'adversarial@1', verifier: 'solution-verifier@2' },
    },
    blind: [
      ok({ reasoning: 'r0', predictedAnswerIndex: 2, computedValue: '6' }),
      ok({ reasoning: 'r1', predictedAnswerIndex: 2, computedValue: '6' }),
      failed(),
    ],
    adversarial: ok({ reasoning: 'a', findings: [] }, 'adversarial@1'),
    verifier: ok({ reasoning: 'v', solutionConcludesIndex: 2, solutionCompleteness: 'adequate' }, 'solution-verifier@2'),
    executedAt: '2026-08-16T00:00:00.000Z',
    ...overrides,
  }
}

describe('toValidationRunRows', () => {
  it('her ajan cagrisi icin bir satir uretir', () => {
    const rows = toValidationRunRows(run(), 'run-1')
    expect(rows).toHaveLength(5) // 3 kor + 1 adversarial + 1 verifier
    expect(rows.map((r) => r.agent)).toEqual([
      'blind_solver',
      'blind_solver',
      'blind_solver',
      'adversarial',
      'solution_verifier',
    ])
    expect(rows.slice(0, 3).map((r) => r.sample_index)).toEqual([0, 1, 2])
  })

  it('ok satiri ham ciktiyi ve ayristirilmis veriyi tasir', () => {
    const r = toValidationRunRows(run(), 'run-1')[0]
    expect(r.status).toBe('ok')
    expect(r.raw_output).toBe('{"a":1}')
    expect(r.parsed_output).toMatchObject({ predictedAnswerIndex: 2 })
    expect(r.error_kind).toBeNull()
    expect(r.skip_reason).toBeNull()
    expect(r.model_id).toBe('gemini-2.5-flash-lite')
    expect(r.prompt_version).toBe('blind-solver@1')
  })

  /**
   * DB CHECK kisiti bu ayrimi zorluyor; mapper onu bozmamali.
   * Ariza satiri hicbir icerik bulgusu tasimaz.
   */
  it('failed satiri error_kind tasir, parsed_output tasimaz', () => {
    const r = toValidationRunRows(run(), 'run-1')[2]
    expect(r.status).toBe('failed')
    expect(r.error_kind).toBe('truncated')
    expect(r.parsed_output).toBeNull()
    expect(r.skip_reason).toBeNull()
    // Kesik ham cikti yine de saklanir — teshis icin degerli.
    expect(r.raw_output).toContain('yar')
  })

  it('skipped satiri neden tasir, model/prompt tasimaz', () => {
    const rows = toValidationRunRows(run({ verifier: skipped() }), 'run-1')
    const v = rows.find((r) => r.agent === 'solution_verifier')!
    expect(v.status).toBe('skipped')
    expect(v.skip_reason).toBe('cozum metni yok')
    expect(v.error_kind).toBeNull()
    expect(v.model_id).toBe('gemini-2.5-flash-lite')
    expect(v.latency_ms).toBeNull()
  })

  it('governance kapaliyken revision_id NULL yazilir (questionId fallback karismasin)', () => {
    const rows = toValidationRunRows(run({ revisionId: 'q1' }), 'run-1')
    expect(rows[0].revision_id).toBeNull()
    expect(toValidationRunRows(run(), 'run-1')[0].revision_id).toBe('rev1')
  })

  it('dedup anahtari alanlarinin tamami dolu', () => {
    for (const r of toValidationRunRows(run(), 'run-1')) {
      expect(r.question_id).toBeTruthy()
      expect(r.content_sha256).toHaveLength(64)
      expect(r.agent).toBeTruthy()
      expect(typeof r.sample_index).toBe('number')
      expect(r.model_id).toBeTruthy()
      expect(r.provider_id).toBeTruthy()
      expect(r.prompt_version).toBeTruthy()
      expect(r.generation_config_sha256).toHaveLength(64)
      expect(r.input_snapshot.options).toHaveLength(5)
      expect(r.run_id).toBe('run-1')
    }
  })

  it('satirlar eksiksiz AuditRun olarak geri kurulur', () => {
    const original = run()
    const restored = fromValidationRunRows(toValidationRunRows(original, 'run-1'))
    expect(restored).toEqual({ ...original, sourceRunId: 'run-1' })
  })

  it('eksik ajan satirini cache hit saymaz', () => {
    const rows = toValidationRunRows(run(), 'run-1').filter((r) => r.agent !== 'adversarial')
    expect(() => fromValidationRunRows(rows)).toThrow(/eksik/)
  })

  it('governance yayin kapisi icin revizyon-bagli karar satiri uretir', () => {
    const auditRun = run()
    const row = toValidationDecisionRow(auditRun, deriveVerdict(auditRun), 'run-1')
    expect(row).toMatchObject({
      question_id: 'q1', revision_id: 'rev1', content_sha256: 'a'.repeat(64),
      policy_version: 'question-quality@2', verdict: 'APPROVED', run_id: 'run-1',
    })
  })
})
