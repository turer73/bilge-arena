import { describe, expect, it } from 'vitest'
import { solutionVerifierSchema, storedSolutionVerifierSchema, referencedSolutionVerifierSchema } from '../schemas'
import { fromValidationRunRows, toValidationRunRows } from '../persistence'
import { deriveVerdict } from '../verdict'
import type { AuditRun, SolutionVerifierWirePayload } from '../types'

const options = ['23', '25', '27', '29']
const wire = (patch: Partial<SolutionVerifierWirePayload> = {}): SolutionVerifierWirePayload => ({
  reasoning: 'Model kendi hesabını yaptı.', solutionConcludesIndex: 0, solutionCompleteness: 'adequate',
  evidenceVersion: 'solution-evidence@3', questionDemand: 'reasoning', supportingUnitIds: ['author:0'], ...patch,
})
const snapshot = { questionId: 'q', revisionId: 'r', contentSha256: 'a'.repeat(64), examRef: 'LGS', subject: 'Fen',
  topic: null, questionText: '12+18-7 kaçtır?', passage: null, options, markedAnswerIndex: 0, solutionText: 'Yanıt 23.' }
function run(text = snapshot.solutionText, patch: Partial<SolutionVerifierWirePayload> = {}): AuditRun {
  const t = { providerId: 'fake', modelId: 'fake', promptVersion: 'blind-solver@3', latencyMs: 0, inputTokens: 0, outputTokens: 0, finishReason: 'STOP' }
  const raw = wire(patch)
  return {
    questionId: 'q', revisionId: 'r', contentSha256: snapshot.contentSha256, optionCount: 4, markedAnswerIndex: 0,
    inputSnapshot: { ...snapshot, solutionText: text }, executedAt: '2026-10-11T00:00:00.000Z',
    execution: { policyVersion: 'question-quality@3', generationConfig: { blindSamples: 1 }, generationConfigSha256: 'b'.repeat(64),
      providerIds: { blind: 'fake', adversarial: 'fake', verifier: 'fake' }, modelIds: { blind: 'fake', adversarial: 'fake', verifier: 'fake' },
      promptVersions: { blind: 'blind-solver@3', adversarial: 'adversarial@3', verifier: 'solution-verifier@6' } },
    blind: [{ status: 'ok', telemetry: t, raw: '{}', data: { reasoning: '12+18-7=23', computedValue: '23', predictedAnswerIndex: 0 } }],
    adversarial: { status: 'ok', telemetry: { ...t, promptVersion: 'adversarial@3' }, raw: '{}', data: { reasoning: 'Yok.', findings: [] } },
    verifier: { status: 'ok', telemetry: { ...t, promptVersion: 'solution-verifier@6' }, raw: JSON.stringify(raw),
      data: solutionVerifierSchema(options, text).parse(raw) },
  }
}

describe('solution evidence @3 preserves claim vs assessment', () => {
  it.each(['23', 'Yanıt 23.', 'Cevap: 23', 'Doğru cevap 23.'])('only answer %s cannot become adequate reasoning', (text) => {
    const r = run(text)
    expect(r.verifier).toMatchObject({ status: 'ok', data: { solutionCompleteness: 'adequate', supportAssessment: 'answer_only_for_reported_reasoning' } })
    expect(deriveVerdict(r)).toMatchObject({ verdict: 'NEEDS_REVIEW', findings: [{ code: 'INCOMPLETE_SOLUTION' }] })
    expect(fromValidationRunRows(toValidationRunRows(r, 'replay'))).toEqual({ ...r, sourceRunId: 'replay' })
  })

  it.each(['-10', '1,5', '1/2', '%50'])('preserves significant answer characters %s', (answer) => {
    const p = solutionVerifierSchema([answer, '0', '1', '2'], `Yanıt ${answer}.`).parse(wire())
    expect(p.supportAssessment).toBe('answer_only_for_reported_reasoning')
    expect(p.solutionCompleteness).toBe('adequate')
  })

  it('missing citations or only-answer citations require review, not an invented content defect', () => {
    for (const r of [run('12+18-7=23.', { supportingUnitIds: [] }), run('12+18-7=23.\nYanıt 23.', { supportingUnitIds: ['author:1'] })]) {
      expect(deriveVerdict(r)).toMatchObject({ verdict: 'NEEDS_REVIEW', findings: [] })
    }
  })

  it('a terse report does not duplicate the derived content warning', () => {
    expect(deriveVerdict(run('Yanıt 23.', { solutionCompleteness: 'terse', supportingUnitIds: [] })).findings).toHaveLength(1)
  })

  it('shown short calculation stays acceptable; evidence existence is not proof', () => {
    const r = run('12+18-7=23.')
    expect(r.verifier).toMatchObject({ data: { supportAssessment: 'not_established' } })
    expect(deriveVerdict(r).verdict).toBe('APPROVED')
  })

  it('known limitation: model recall classification is not independently established', () => {
    expect(deriveVerdict(run('Yanıt 23.', { questionDemand: 'recall' })).verdict).toBe('APPROVED')
  })

  it.each([{ supportingUnitIds: ['author:99'] }, { supportingUnitIds: ['author:0', 'author:0'] },
    { supportingUnitIds: ['question:0'] }, { supportingQuotes: ['12+18-7=23'] }, { supportAssessment: 'not_established' },
    { evidenceVersion: 'solution-evidence@2' }])('bad wire remains a schema failure %j', (patch) => {
    expect(solutionVerifierSchema(options, 'Yanıt 23.').safeParse({ ...wire(), ...patch }).success).toBe(false)
  })

  it('old @5 adequate conflict is STILL a schema failure', () => {
    expect(referencedSolutionVerifierSchema(options, 'Yanıt 23.').safeParse({ ...wire(), evidenceVersion: 'solution-evidence@2' }).success).toBe(false)
  })

  it.each(['supportAssessment', 'supportingQuotes', 'missing'])('stored %s cannot be silently repaired', (kind) => {
    const p: Record<string, unknown> = solutionVerifierSchema(options, 'Yanıt 23.').parse(wire())
    if (kind === 'supportAssessment') p.supportAssessment = 'not_established'
    if (kind === 'supportingQuotes') p.supportingQuotes = ['12+18-7=23']
    if (kind === 'missing') delete p.supportAssessment
    expect(storedSolutionVerifierSchema(options, 'Yanıt 23.').safeParse(p).success).toBe(false)
    const r = run()
    if (r.verifier.status === 'ok') Object.assign(r.verifier.data, p)
    if (kind !== 'missing') expect(deriveVerdict(r).verdict).toBe('INCONCLUSIVE')
  })

  it('a real transport error never becomes incomplete solution', () => {
    const r = run()
    if (r.verifier.status !== 'ok') throw new Error('fixture')
    r.verifier = { status: 'failed', telemetry: r.verifier.telemetry, raw: null, error: { kind: 'timeout', retryable: true, message: 'timeout' } }
    expect(deriveVerdict(r)).toMatchObject({ verdict: 'INCONCLUSIVE', findings: [] })
  })

  it('tampered derived data cannot corroborate a rejection', () => {
    const r = run('12+18-7=23.', { solutionConcludesIndex: 1 })
    if (r.blind[0].status === 'ok') r.blind[0].data.predictedAnswerIndex = 1
    if (r.verifier.status === 'ok') Object.assign(r.verifier.data, { supportAssessment: 'forged' })
    expect(deriveVerdict(r).verdict).toBe('INCONCLUSIVE')
    expect(deriveVerdict(r).findings.map((f) => f.code)).toEqual(['WRONG_KEY_SUSPECTED'])
  })
})
