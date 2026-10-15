import { describe, expect, it } from 'vitest'
import { exactOptionIndex, assessOptionSelection } from '../option-selection'
import {
  optionTextBlindSolverSchema, optionTextSolutionVerifierSchema,
  storedOptionTextBlindSolverSchema, storedOptionTextSolutionVerifierSchema,
} from '../schemas'
import { optionTextBlindSolverShape, optionTextSolutionVerifierShape } from '../response-shapes'
import { buildBlindSolverPrompt, buildSolutionVerifierPrompt } from '../prompts'
import { toBlindView } from '../blind-view'
import { fromValidationRunRows, toValidationRunRows } from '../persistence'
import { deriveVerdict } from '../verdict'
import type { AuditRun, QuestionDraft } from '../types'

const options = ['36', '30', '32', '34']
const draft: QuestionDraft = { questionId: 'q', revisionId: 'r', contentSha256: 'd'.repeat(64), examRef: 'LGS', subject: 'Fen',
  topic: null, questionText: 'Soldan farklı harfin yeri?', passage: null, options, markedAnswerIndex: 1,
  solutionText: 'İlk 29 harf aynı; 30. yerde A yerine G var. Değişen yer 30.' }
const blindWire = (text: string | null = '30', value: string | null = '30') => ({ reasoning: 'Karşılaştırma sonucu.', computedValue: value, selectedOptionText: text })
const verifierWire = (text: string | null = '30') => ({ reasoning: 'Yazarda 30 açıkça var.', selectedOptionText: text,
  evidenceVersion: 'solution-evidence@4', solutionCompleteness: 'adequate', questionDemand: 'reasoning', supportingUnitIds: ['author:0'] })
function run(text: string | null = '30', value: string | null = '30'): AuditRun {
  const b = blindWire(text, value), v = verifierWire()
  const telemetry = { providerId: 'fake', modelId: 'fake', latencyMs: 1, inputTokens: 0, outputTokens: 0, finishReason: 'STOP' }
  return {
    questionId: 'q', revisionId: 'r', contentSha256: draft.contentSha256, optionCount: 4, markedAnswerIndex: 1,
    inputSnapshot: structuredClone(draft), executedAt: '2026-10-11T00:00:00.000Z',
    execution: { policyVersion: 'question-quality@4', generationConfigSha256: 'f'.repeat(64), generationConfig: { blindSamples: 3 },
      providerIds: { blind: 'fake', adversarial: 'fake', verifier: 'fake' }, modelIds: { blind: 'fake', adversarial: 'fake', verifier: 'fake' },
      promptVersions: { blind: 'blind-solver@4', adversarial: 'adversarial@3', verifier: 'solution-verifier@7' } },
    blind: Array.from({ length: 3 }, () => ({ status: 'ok', telemetry: { ...telemetry, promptVersion: 'blind-solver@4' }, raw: JSON.stringify(b), data: optionTextBlindSolverSchema(options).parse(b) })),
    adversarial: { status: 'ok', telemetry: { ...telemetry, promptVersion: 'adversarial@3' }, raw: '{}', data: { reasoning: 'Yok.', findings: [] } },
    verifier: { status: 'ok', telemetry: { ...telemetry, promptVersion: 'solution-verifier@7' }, raw: JSON.stringify(v), data: optionTextSolutionVerifierSchema(options, draft.solutionText!).parse(v) },
  }
}
const permutations = (xs: string[]): string[][] => xs.length === 0 ? [[]] : xs.flatMap((x, i) => permutations(xs.filter((_, j) => i !== j)).map(tail => [x, ...tail]))

describe('exact option selection', () => {
  it.each([4, 5])('all %i-option permutations map text, without a model index', (count) => {
    const source = ['36', '30', '32', '34', '38'].slice(0, count)
    for (const shown of permutations(source)) {
      const b = optionTextBlindSolverSchema(shown).parse(blindWire())
      const v = optionTextSolutionVerifierSchema(shown, draft.solutionText!).parse(verifierWire())
      expect(shown[b.predictedAnswerIndex!]).toBe('30')
      expect(shown[v.solutionConcludesIndex!]).toBe('30')
      expect(source.indexOf(b.selectedOptionText!)).toBe(1)
    }
  })
  it.each(['Elma', 'İğdır', '-10', '1,5', '1/2', '%50', '$x^2$', 'A\nB'])('preserves exact characters: %s', (text) => {
    expect(exactOptionIndex(['x', text, 'y', 'z'], text)).toBe(1)
  })
  it.each(['30 ', ' 30', '３０', '30\n', '3O', '1', 'B', '30.0'])('never guesses the option for %j', (text) => {
    expect(optionTextBlindSolverSchema(options).safeParse(blindWire(text)).success).toBe(false)
  })
  it.each([['30', '30', '32', '34'], ['30', ' ', '32', '34']])('invalid input options fail even for null: %j', (...bad) => {
    expect(optionTextBlindSolverSchema(bad).safeParse(blindWire(null)).success).toBe(false)
  })
  it.each([{ predictedAnswerIndex: 2 }, { selectionAssessment: 'numeric_match' }, { selectionVersion: 'option-text@1' }])('rejects model-derived fields %j', (patch) => {
    expect(optionTextBlindSolverSchema(options).safeParse({ ...blindWire(), ...patch }).success).toBe(false)
  })
  it.each([{ solutionConcludesIndex: 2 }, { supportingQuotes: ['invented'] }, { supportAssessment: 'not_established' }, { evidenceVersion: 'solution-evidence@3' }])('rejects verifier-derived fields %j', (patch) => {
    expect(optionTextSolutionVerifierSchema(options, draft.solutionText!).safeParse({ ...verifierWire(), ...patch }).success).toBe(false)
  })
})

describe('bounded scalar consistency (not answer verification)', () => {
  it.each([['30', '32'], ['-10', '10'], ['1.5', '15'], ['9007199254740992', '9007199254740993']])('detects unequal scalars %s / %s exactly', (a, b) => {
    expect(assessOptionSelection([a, b, 'x', 'y'], b, a)).toBe('numeric_conflict')
  })
  it.each([['1', '1.00'], ['0', '-0'], ['-1.50', '-1.5']])('equivalent supported scalars %s / %s', (a, b) => {
    expect(assessOptionSelection([a, b, 'x', 'y'], b, a)).toBe('numeric_match')
  })
  it.each(['1,5', '1/2', '30 J', '+30', '030', '٣٠', '30\n', '1e3', '10^2', 'x', '3'.repeat(81)])('does not pretend to parse %j', (value) => {
    expect(assessOptionSelection(options, '30', value)).toBe('not_checked')
  })
  it('retains a missing selection despite an exact value, no silent repair', () => {
    const p = optionTextBlindSolverSchema(options).parse(blindWire(null))
    expect(p).toMatchObject({ predictedAnswerIndex: null, selectedOptionText: null, selectionAssessment: 'value_without_selection' })
    expect(deriveVerdict(run(null))).toMatchObject({ verdict: 'NEEDS_REVIEW', findings: [] })
  })
  it('null with no match stays a no-correct-option review', () => {
    expect(deriveVerdict(run(null, '99'))).toMatchObject({ verdict: 'NEEDS_REVIEW', findings: [{ code: 'NO_CORRECT_OPTION' }] })
  })
  it('matching statements can both be wrong: consistency is not proof', () => {
    expect(assessOptionSelection(options, '32', '32')).toBe('numeric_match')
  })
})

describe('raw evidence, stored replay and verdict boundaries', () => {
  it('new wire and derived code fields survive complete DB mapping', () => {
    const source = run()
    expect(deriveVerdict(source).verdict).toBe('APPROVED')
    expect(fromValidationRunRows(toValidationRunRows(source, 'new'))).toEqual({ ...source, sourceRunId: 'new' })
  })
  it('wrong key still requires agreement on the same alternative', () => {
    const r = run(); r.markedAnswerIndex = 2; r.inputSnapshot.markedAnswerIndex = 2
    expect(deriveVerdict(r)).toMatchObject({ verdict: 'REJECTED', blindConsensusIndex: 1 })
  })
  it('numeric conflict cannot become content evidence or be repaired into approval', () => {
    const r = run('32', '30')
    expect(r.blind[0]).toMatchObject({ data: { predictedAnswerIndex: 2, computedValue: '30', selectedOptionText: '32', selectionAssessment: 'numeric_conflict' } })
    expect(deriveVerdict(r)).toMatchObject({ verdict: 'NEEDS_REVIEW', findings: [] })
    expect(fromValidationRunRows(toValidationRunRows(r, 'conflict')).blind).toEqual(r.blind)
  })
  it('one conflicting sample is visible even when the other two agree', () => {
    const r = run(); r.blind[2] = run('32', '30').blind[0]!
    expect(deriveVerdict(r).verdict).toBe('NEEDS_REVIEW')
  })
  it('a conflict plus timeout stays INCONCLUSIVE, not a made-up content flaw', () => {
    const r = run('32', '30')
    if (r.verifier.status !== 'ok') throw new Error('fixture')
    r.verifier = { status: 'failed', raw: null, telemetry: r.verifier.telemetry, error: { kind: 'timeout', message: 'timeout', retryable: true } }
    expect(deriveVerdict(r)).toMatchObject({ verdict: 'INCONCLUSIVE', findings: [] })
  })
  it.each(['blind', 'verifier'] as const)('tampered %s fields cannot support a rejection', (agent) => {
    const r = run(); r.markedAnswerIndex = 2; r.inputSnapshot.markedAnswerIndex = 2
    if (agent === 'blind') for (const o of r.blind) { if (o.status === 'ok') o.data.predictedAnswerIndex = 0 }
    else if (r.verifier.status === 'ok') r.verifier.data.solutionConcludesIndex = 0
    expect(deriveVerdict(r).verdict).toBe('INCONCLUSIVE')
    expect(() => fromValidationRunRows(toValidationRunRows(r, 'bad'))).toThrow()
  })
  it.each(['blind', 'verifier'] as const)('parsed %s rewritten coherently but raw unchanged is rejected', (agent) => {
    const r = run()
    if (agent === 'blind') for (const o of r.blind) { if (o.status === 'ok') o.data = optionTextBlindSolverSchema(options).parse(blindWire('32', '32')) }
    else if (r.verifier.status === 'ok') r.verifier.data = optionTextSolutionVerifierSchema(options, draft.solutionText!).parse(verifierWire('32'))
    expect(deriveVerdict(r).verdict).toBe('INCONCLUSIVE')
    expect(() => fromValidationRunRows(toValidationRunRows(r, 'changed-raw'))).toThrow('ham yanit')
  })
  it('missing code fields and unknown versions cannot use the legacy parser', () => {
    const b = optionTextBlindSolverSchema(options).parse(blindWire())
    expect(storedOptionTextBlindSolverSchema(options).safeParse({ ...b, selectionAssessment: undefined }).success).toBe(false)
    const v = optionTextSolutionVerifierSchema(options, draft.solutionText!).parse(verifierWire())
    expect(storedOptionTextSolutionVerifierSchema(options, draft.solutionText!).safeParse({ ...v, selectionVersion: undefined }).success).toBe(false)
    const rows = toValidationRunRows(run(), 'future')
    for (const row of rows.filter(x => x.agent === 'blind_solver')) row.prompt_version = 'blind-solver@999'
    expect(() => fromValidationRunRows(rows)).toThrow('desteklenmeyen')
  })
  it('prompts/schema expose only option texts and are key-blind', () => {
    const b = buildBlindSolverPrompt(toBlindView(draft)), v = buildSolutionVerifierPrompt(draft)
    const changed = { ...draft, markedAnswerIndex: 3 }
    expect(b).toEqual(buildBlindSolverPrompt(toBlindView(changed)))
    expect(v).toEqual(buildSolutionVerifierPrompt(changed))
    expect(JSON.parse(b.user.split('\n')[1]).options).toEqual(options)
    expect(JSON.parse(v.user.split('\n')[1]).options).toEqual(options)
    expect(b.system).not.toContain('predictedAnswerIndex')
    expect(v.system).not.toContain('solutionConcludesIndex')
    for (const shape of [optionTextBlindSolverShape(options), optionTextSolutionVerifierShape(options)]) {
      expect(shape.properties?.selectedOptionText.enum).toEqual(options)
      expect(shape.properties).not.toHaveProperty('predictedAnswerIndex')
      expect(shape.properties).not.toHaveProperty('solutionConcludesIndex')
      expect(shape.properties).not.toHaveProperty('selectionAssessment')
    }
  })
})
