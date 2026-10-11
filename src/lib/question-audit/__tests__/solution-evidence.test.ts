import { describe, expect, it } from 'vitest'
import { buildSolutionVerifierPrompt, PROMPT_VERSION } from '../prompts'
import { solutionVerifierShape } from '../response-shapes'
import { legacySolutionVerifierSchema, quotedSolutionVerifierSchema as solutionVerifierSchema } from '../schemas'
import type { GroundedSolutionVerifierPayload, QuestionDraft } from '../types'

const options = ['23', '25', '27', '29']
const payload = (overrides: Partial<GroundedSolutionVerifierPayload> = {}): GroundedSolutionVerifierPayload => ({
  reasoning: 'Yazarın gösterdiği işleme dayanır.',
  solutionConcludesIndex: 0,
  solutionCompleteness: 'adequate',
  evidenceVersion: 'solution-evidence@1',
  questionDemand: 'reasoning',
  supportingQuotes: ['12+18-7=23'],
  ...overrides,
})

// Eski Fen kosusunun alti kacagi gelistirme regresyonudur, holdout DEGIL.
const missed = [
  { id: '875e6519', answer: '5', invented: '40/(2*4)=5' },
  { id: '3caa6277', answer: '9', invented: '432/(6*8)=9' },
  { id: 'e596f972', answer: '23', invented: '12+18-7=23' },
  { id: '7bd63e4a', answer: '25', invented: '14+20-9=25' },
  { id: 'f12a6e00', answer: '26', invented: '15+21-10=26' },
  { id: 'e0457caf', answer: '27', invented: '16+22-11=27' },
]

describe('solution-evidence@1 yazar metni siniri', () => {
  it.each(missed)('$id uydurma adimi veya salt yaniti yeterlilik kaniti yapamaz', ({ answer, invented }) => {
    const solution = `Yanıt ${answer}.`
    const schema = solutionVerifierSchema([answer, '0', '-1', '-2'], solution)
    expect(schema.safeParse(payload({ supportingQuotes: [invented] })).success).toBe(false)
    expect(schema.safeParse(payload({ supportingQuotes: [solution] })).success).toBe(false)
    expect(schema.safeParse(payload({ supportingQuotes: [answer] })).success).toBe(false)
    expect(schema.safeParse(payload({ supportingQuotes: [] })).success).toBe(false)
    expect(schema.parse(payload({ solutionCompleteness: 'terse', supportingQuotes: [] })).solutionCompleteness).toBe('terse')
  })

  it.each([
    { solution: '12+18-7=23', quote: '12+18-7=23', demand: 'reasoning' },
    { solution: 'D = 12 + 18 − 7 = 23 g.', quote: '12 + 18 − 7 = 23 g', demand: 'reasoning' },
    { solution: '1:100.000 -> 1 cm = 1 km. 2 cm = 2 km.', quote: '1 cm = 1 km. 2 cm = 2 km.', demand: 'reasoning' },
    { solution: 'Tree = ağaç.', quote: 'Tree = ağaç.', demand: 'recall' },
    { solution: "'-malı/-meli' gereklilik kipi ekidir.", quote: 'gereklilik kipi ekidir', demand: 'recall' },
    { solution: 'Kuvvet kolu uzadığında aynı yük için gereken kuvvet azalır.', quote: 'Kuvvet kolu uzadığında aynı yük için gereken kuvvet azalır.', demand: 'reasoning' },
  ] as const)('kisa ve gosterilmis dayanak korunur: $solution', ({ solution, quote, demand }) => {
    expect(solutionVerifierSchema(options, solution).parse(payload({
      supportingQuotes: [quote], questionDemand: demand,
    })).supportingQuotes).toEqual([quote])
  })

  it('hatirlama sorusunda tek sözcük yanıt sırf kısa diye engellenmez', () => {
    expect(solutionVerifierSchema(['İyot', 'Demir', 'Bakır', 'Çinko'], 'İyot').parse(payload({
      questionDemand: 'recall', supportingQuotes: ['İyot'],
    })).solutionCompleteness).toBe('adequate')
  })

  it.each(['', ' ', '\n', '12+18', '12+18-7=23'])('bos veya kaynakta olmayan alinti reddedilir: %j', (quote) => {
    expect(solutionVerifierSchema(options, 'Yanıt 23.').safeParse(payload({
      questionDemand: 'recall', supportingQuotes: [quote],
    })).success).toBe(false)
  })

  it('terse kararinin alintilari da dogrulanir; uydurma destek gizlenmez', () => {
    expect(solutionVerifierSchema(options, 'Yanıt 23.').safeParse(payload({
      solutionCompleteness: 'terse', supportingQuotes: ['12+18-7=23'],
    })).success).toBe(false)
  })

  it('parca birlestirme, Unicode ve operator degisikligi sessizce duzeltilmez', () => {
    const schema = solutionVerifierSchema(options, '12+18=30. Sonra 30−7=23.')
    for (const quote of ['12+18−7=23', '30-7=23', '12+18=30. 30−7=23.']) {
      expect(schema.safeParse(payload({ supportingQuotes: [quote] })).success).toBe(false)
    }
    expect(schema.parse(payload({ supportingQuotes: ['12+18=30.', '30−7=23.'] })).supportingQuotes).toHaveLength(2)
  })

  it.each(['-10', '1,5', '1/2', '%50'])('salt yanit denetimi matematiksel isaretleri silmez: %s', (answer) => {
    const solution = `Yanıt ${answer}.`
    expect(solutionVerifierSchema([answer, '0', '1', '2'], solution).safeParse(payload({
      supportingQuotes: [solution],
    })).success).toBe(false)
    const step = `x=${answer}; 2x=${answer}+${answer}`
    expect(solutionVerifierSchema([answer, '0', '1', '2'], step).safeParse(payload({ supportingQuotes: [step] })).success).toBe(true)
  })

  it('fazla alan, surum, indeks, boyut ve enum sinirlari calisir', () => {
    const schema = solutionVerifierSchema(options, '12+18-7=23')
    const bad: unknown[] = [
      { ...payload(), isPassed: true },
      { ...payload(), evidenceVersion: 'solution-evidence@0' },
      { ...payload(), questionDemand: 'unknown' },
      { ...payload(), solutionCompleteness: 'maybe' },
      { ...payload(), solutionConcludesIndex: 4 },
      { ...payload(), solutionConcludesIndex: -1 },
      { ...payload(), solutionConcludesIndex: 'A' },
      { ...payload(), supportingQuotes: Array(9).fill('12+18-7=23') },
      { ...payload(), supportingQuotes: ['x'.repeat(2001)] },
      { ...payload(), supportingQuotes: null },
    ]
    for (const value of bad) expect(schema.safeParse(value).success).toBe(false)
    expect(schema.parse(payload({ solutionConcludesIndex: null })).solutionConcludesIndex).toBeNull()
    expect(solutionVerifierSchema([...options, '31'], '12+18-7=23').parse(payload({ solutionConcludesIndex: 4 })).solutionConcludesIndex).toBe(4)
  })

  it('eski adequate payload sadece tarihsel parser ile okunur', () => {
    const old = { reasoning: 'Denetçi kendisi çözdü.', solutionConcludesIndex: 0, solutionCompleteness: 'adequate' }
    expect(legacySolutionVerifierSchema(4).safeParse(old).success).toBe(true)
    expect(solutionVerifierSchema(options, 'Yanıt 23.').safeParse(old).success).toBe(false)
  })
})

describe('prompt ve provider sozlesmesi', () => {
  it('soruyu tamamlamak yerine kanit ister, karari suphede yesile boyamaz', () => {
    const draft: QuestionDraft = {
      questionId: 'q', revisionId: 'r', contentSha256: 'a'.repeat(64), examRef: 'LGS',
      subject: 'Fen', topic: null, passage: null, questionText: '12+18-7?',
      options, markedAnswerIndex: 0, solutionText: 'Yanıt 23.',
    }
    const prompt = buildSolutionVerifierPrompt(draft)
    expect(PROMPT_VERSION.solutionVerifier).toBe('solution-verifier@5')
    expect(prompt.system).toContain('Soruyu kendin cozme')
    expect(prompt.system).toContain('YALNIZ authorEvidenceUnits')
    expect(prompt.system).toContain('Suphede kalirsan "terse"')
    expect(prompt.system).not.toContain('Gorevin TEK sey')
    expect(prompt).toEqual(buildSolutionVerifierPrompt({ ...draft, markedAnswerIndex: 3 }))
    expect(JSON.parse(prompt.user.split('\n')[1]).solutionText).toBe('Yanıt 23.')
    const shape = solutionVerifierShape(4)
    expect(shape.required).toEqual(shape.propertyOrdering)
    expect(shape.required).toContain('supportingUnitIds')
    expect(shape.properties?.evidenceVersion.enum).toEqual(['solution-evidence@2'])
    expect(shape.properties?.supportingUnitIds.items?.type).toBe('STRING')
    expect(shape.properties).not.toHaveProperty('supportingQuotes')
  })
})
