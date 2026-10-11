import { describe, expect, it } from 'vitest'
import { authorEvidenceUnits } from '../solution-evidence'
import { solutionVerifierSchema, storedSolutionVerifierSchema } from '../schemas'
import { buildSolutionVerifierPrompt } from '../prompts'
import type { QuestionDraft, SolutionVerifierWirePayload } from '../types'

const payload = (overrides: Partial<SolutionVerifierWirePayload> = {}): SolutionVerifierWirePayload => ({
  reasoning: 'Yazarin islemi.', evidenceVersion: 'solution-evidence@2', questionDemand: 'reasoning',
  solutionConcludesIndex: 0, solutionCompleteness: 'adequate', supportingUnitIds: ['author:0'], ...overrides,
})
const options = ['56', '18', '10', '3,5']

describe('author evidence units', () => {
  it.each(['W=14×4=56 J.', '1,5/0,5=3. Sonuç 3.', '\\frac{1}{2}=0.5', ' İyot. \r\n\n  Sonuç.  ', '', '\n \t'])('kaynak dilimleri aynen korunur: %j', (text) => {
    const units = authorEvidenceUnits(text)
    expect(units).toEqual(authorEvidenceUnits(text))
    for (const [index, unit] of units.entries()) {
      expect(unit.id).toBe(`author:${index}`)
      expect(unit.text).toBe(text.slice(unit.start, unit.end))
      expect(unit.text.trim()).not.toBe('')
      expect(unit.text.length).toBeLessThanOrEqual(2000)
    }
  })

  it('uzun satir bolunurken sembol ve surrogate cifti bozulmaz', () => {
    const text = 'x'.repeat(1999) + '🧪' + 'ğ'.repeat(3001)
    const units = authorEvidenceUnits(text)
    expect(units).toHaveLength(3)
    expect(units.map((unit) => unit.text).join('')).toBe(text)
    expect(units[0].text).toHaveLength(1999)
    expect(units[1].text.startsWith('🧪')).toBe(true)
    for (const unit of units) expect(unit.text.isWellFormed()).toBe(true)
  })

  it('soru koku/formul/parola cozum parcasi olarak sunulmaz; anahtar sizmaz', () => {
    const draft: QuestionDraft = { questionId: 'q', revisionId: 'r', contentSha256: 'a'.repeat(64),
      examRef: 'LGS', subject: 'Fen', topic: null, passage: 'PASSAGE_SECRET',
      questionText: 'W=F·s QUESTION_SECRET', options, markedAnswerIndex: 0, solutionText: ' W=14×4=56 J.\r\n' }
    const prompt = buildSolutionVerifierPrompt(draft)
    const data = JSON.parse(prompt.user.split('\n')[1])
    expect(data.authorEvidenceUnits).toEqual(authorEvidenceUnits(draft.solutionText!))
    expect(JSON.stringify(data.authorEvidenceUnits)).not.toMatch(/SECRET|W=F/)
    expect(prompt).toEqual(buildSolutionVerifierPrompt({ ...draft, markedAnswerIndex: 2 }))
    expect(data.solutionText).toBe(draft.solutionText)
  })
})

describe('solution-evidence@2 author-only resolution', () => {
  it('14x4 orneginde alintiyi model DEGIL kod cozer', () => {
    const result = solutionVerifierSchema(options, 'W=14×4=56 J.').parse(payload())
    expect(result.supportingQuotes).toEqual(['W=14×4=56 J.'])
    expect(storedSolutionVerifierSchema(options, 'W=14×4=56 J.').parse(result)).toEqual(result)
  })

  it.each([
    { supportingUnitIds: ['question:0'] }, { supportingUnitIds: ['author:1'] },
    { supportingUnitIds: ['author:0', 'author:0'] }, { supportingUnitIds: [] },
    { supportingUnitIds: ['author:00'] }, { supportingUnitIds: [0] },
    { supportingUnitIds: ['W=F·s'] }, { supportingUnitIds: ['author:0'], supportingQuotes: ['W=F·s'] },
    { supportingUnitIds: Array(9).fill('author:0') }, { evidenceVersion: 'solution-evidence@1' },
    { solutionConcludesIndex: 4 }, { questionDemand: 'unknown' },
  ])('gecersiz model kaniti fail-closed: %j', (patch) => {
    expect(solutionVerifierSchema(options, 'W=14×4=56 J.').safeParse({ ...payload(), ...patch }).success).toBe(false)
  })

  it('gecersiz kimlik terse alaninda da yutulmaz', () => {
    const schema = solutionVerifierSchema(options, 'Yanıt 56.')
    expect(schema.safeParse(payload({ solutionCompleteness: 'terse', supportingUnitIds: ['author:9'] })).success).toBe(false)
    expect(schema.parse(payload({ solutionCompleteness: 'terse', supportingUnitIds: [] })).supportingQuotes).toEqual([])
  })

  it.each(['5', '9', '23', '25', '26', '27', '-10', '1,5', '1/2', '%50'])('eski kacagin cevabi kimlikle de hesap kaniti olmaz: %s', (answer) => {
    expect(solutionVerifierSchema([answer, '0', '-1', '-2'], `Yanıt ${answer}.`).safeParse(payload()).success).toBe(false)
  })

  it('recall icin tek sozcuk korunur, soru tanimi eklenmez', () => {
    const result = solutionVerifierSchema(['Yalıtkan', 'İletken', 'Üreteç', 'Anahtar'], 'Yalıtkan.').parse(payload({ questionDemand: 'recall' }))
    expect(result.supportingQuotes).toEqual(['Yalıtkan.'])
  })

  it('birden fazla yazar parcasi secilebilir; bos satir ek kanit degildir', () => {
    const solution = 'W=14×4\r\n\n=56 J.'
    expect(solutionVerifierSchema(options, solution).parse(payload({ supportingUnitIds: ['author:0', 'author:1'] })).supportingQuotes)
      .toEqual(['W=14×4\r\n', '=56 J.'])
  })

  it.each(['quote', 'missing', 'order', 'extra'])('saklanan kanit bozulmussa yeniden uretip gizlemez: %s', (kind) => {
    const text = 'W=14×4\n=56 J.'
    const schema = solutionVerifierSchema(options, text)
    const saved: Record<string, unknown> = schema.parse(payload({ supportingUnitIds: ['author:0', 'author:1'] }))
    if (kind === 'quote') saved.supportingQuotes = ['W=F·s', '=56 J.']
    if (kind === 'missing') delete saved.supportingQuotes
    if (kind === 'order') saved.supportingQuotes = ['=56 J.', 'W=14×4\n']
    if (kind === 'extra') saved.isPassed = true
    expect(storedSolutionVerifierSchema(options, text).safeParse(saved).success).toBe(false)
  })

  it('bilinen semantik sinir: kaynak varligi recall sinifini kanitlamaz', () => {
    // The schema intentionally does not pretend to solve/classify the question.
    // A wrong model demand remains measurable by the benchmark, not regex.
    expect(solutionVerifierSchema(['aa', 'AA', 'Aa', 'aA'], 'Yanıt aa.').safeParse(payload({ questionDemand: 'recall' })).success).toBe(true)
  })
})
