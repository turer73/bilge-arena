import { describe, expect, it } from 'vitest'
import { buildMasteryMapResponse } from '@/lib/mastery/build-response'
import { rankCurrentOutcomes, rankWeakOutcomes, type PlanOutcomeState } from '../outcome-targets'

const outcomes = [
  { id: 'o1', code: 'O-1', category: 'sayilar', sortOrder: 10 },
  { id: 'o2', code: 'O-2', category: 'problemler', sortOrder: 20 },
  { id: 'o3', code: 'O-3', category: 'geometri', sortOrder: 30 },
]

function state(outcomeId: string, overrides: Partial<PlanOutcomeState> = {}): PlanOutcomeState {
  return {
    outcomeId, attempts: 5, correctAttempts: 4, weightedEarned: 4, weightedPossible: 5,
    delayedCorrect: 1, v2Attempts: 0, difficultyWeightedEarned: 0, difficultyWeightedPossible: 0,
    timedAttempts: 0, totalTimeSec: 0, fastWrong: 0, hintedAttempts: 0, hintStageSum: 0,
    guessAnnotations: 0, carelessAnnotations: 0, verifiedEvidenceDays: 3,
    lastAnsweredAt: null, ...overrides,
  }
}

function mapOutcome(evidence: PlanOutcomeState) {
  const response = buildMasteryMapResponse({
    game: 'matematik', examRef: 'TYT',
    coverage: {
      supported: true, diagnosticAvailable: false, taxonomyVersion: 'ba-tyt-math-v1',
      totalQuestions: 10, mappedQuestions: 10, percentage: 100,
    },
    nodes: [
      { id: 'course', code: 'MAT', nodeType: 'course', title: 'Matematik', parentId: null, sortOrder: 0 },
      { id: 'unit', code: 'U', nodeType: 'unit', title: 'Unite', parentId: 'course', sortOrder: 0 },
      { id: 'topic', code: 'T', nodeType: 'topic', title: 'Sayilar', parentId: 'unit', sortOrder: 0 },
      { id: 'leaf', code: 'O', nodeType: 'outcome', title: 'Islem', parentId: 'topic', sortOrder: 0 },
    ],
    outcomes: [{
      id: 'o1', nodeId: 'leaf', code: 'O-1', title: 'Islem', description: null,
      game: 'matematik', category: 'sayilar', examRef: 'TYT',
    }],
    states: [evidence],
  })
  expect(response).not.toBeNull()
  return response!.outcomes[0]
}

describe('rankWeakOutcomes', () => {
  it('yetersiz kaniti ve mastered outcomeu dislar, en dusuk dogrulugu one alir', () => {
    const ranked = rankWeakOutcomes(outcomes, [
      state('o1', { attempts: 6, correctAttempts: 5, weightedEarned: 5, weightedPossible: 6 }),
      state('o2', { correctAttempts: 2, weightedEarned: 2, delayedCorrect: 0 }),
      state('o3', { attempts: 2, correctAttempts: 0, weightedEarned: 0, weightedPossible: 2, delayedCorrect: 0, verifiedEvidenceDays: 2 }),
    ])

    expect(ranked.map((outcome) => outcome.id)).toEqual(['o2'])
  })

  it('esit dogrulukta gecikmeli kaniti az ve orneklemi cok olani once alir', () => {
    const ranked = rankWeakOutcomes(outcomes.slice(0, 2), [
      state('o1', { attempts: 4, correctAttempts: 2, weightedEarned: 2, weightedPossible: 4 }),
      state('o2', { attempts: 6, correctAttempts: 3, weightedEarned: 3, weightedPossible: 6, delayedCorrect: 0 }),
    ])
    expect(ranked.map((outcome) => outcome.id)).toEqual(['o2', 'o1'])
  })
})
describe('rankCurrentOutcomes', () => {
  it('secili kategoriyi, sonra son calisilan hedefi, sonra curriculum sirasini kullanir', () => {
    const ranked = rankCurrentOutcomes(outcomes, [
      state('o1', { attempts: 1, correctAttempts: 1, weightedEarned: 1, weightedPossible: 1, delayedCorrect: 0, verifiedEvidenceDays: 1, lastAnsweredAt: '2026-07-01T00:00:00Z' }),
      state('o3', { attempts: 1, correctAttempts: 0, weightedEarned: 0, weightedPossible: 1, delayedCorrect: 0, verifiedEvidenceDays: 1, lastAnsweredAt: '2026-08-01T00:00:00Z' }),
    ], 'problemler')

    expect(ranked.map((outcome) => outcome.id)).toEqual(['o2', 'o3', 'o1'])
  })

  it('mastered outcomeu guncel hedef havuzundan cikarir', () => {
    const ranked = rankCurrentOutcomes(outcomes, [
      state('o1', { lastAnsweredAt: '2026-08-01T00:00:00Z' }),
    ], null)
    expect(ranked.map((outcome) => outcome.id)).toEqual(['o2', 'o3'])
  })
})

describe('gunluk hedef ve Kesif karar esitligi', () => {
  it('V1 mastered saysa da derin ipucuna bagimli V2 kaniti developing tutar', () => {
    const evidence = state('o1', {
      v2Attempts: 5, difficultyWeightedEarned: 12, difficultyWeightedPossible: 15,
      hintedAttempts: 5, hintStageSum: 20,
    })
    const map = mapOutcome(evidence)
    expect(map).toMatchObject({ status: 'developing', accuracy: 80, score: 74 })
    expect(rankWeakOutcomes(outcomes.slice(0, 1), [evidence])[0]).toMatchObject({
      id: 'o1', status: map.status, accuracy: map.accuracy,
    })
    expect(rankCurrentOutcomes(outcomes.slice(0, 1), [evidence], null)[0]).toMatchObject({
      id: 'o1', status: map.status,
    })
  })

  it('V1 ham dogrulugu dusuk saysa da V2 mastered kazanimi iki hedef havuzundan cikarir', () => {
    const evidence = state('o1', {
      correctAttempts: 3, weightedEarned: 3, v2Attempts: 5,
      difficultyWeightedEarned: 15, difficultyWeightedPossible: 17,
    })
    expect(mapOutcome(evidence)).toMatchObject({ status: 'mastered', accuracy: 60, score: 93 })
    expect(rankWeakOutcomes(outcomes.slice(0, 1), [evidence])).toEqual([])
    expect(rankCurrentOutcomes(outcomes.slice(0, 1), [evidence], null)).toEqual([])
  })

  it.each([0, 1, 2])('guclu kaniti %i gunde mastered saymaz ve attempts filtresini korur', (verifiedEvidenceDays) => {
    const evidence = state('o1', { verifiedEvidenceDays })
    const map = mapOutcome(evidence)
    expect(map).toMatchObject({ status: 'insufficient', score: 0 })
    expect(rankWeakOutcomes(outcomes.slice(0, 1), [evidence])[0]).toMatchObject({ status: map.status })
    expect(rankCurrentOutcomes(outcomes.slice(0, 1), [evidence], null)[0]).toMatchObject({ status: map.status })
  })

  it.each([-1, 1.5, 6, Number.NaN, Number.POSITIVE_INFINITY])('bozuk gun sayisindan mastered uretmez: %s', (verifiedEvidenceDays) => {
    const evidence = state('o1', { verifiedEvidenceDays })
    expect(mapOutcome(evidence)).toMatchObject({ status: 'insufficient', verifiedEvidenceDays: 0 })
    expect(rankWeakOutcomes(outcomes.slice(0, 1), [evidence])[0]).toMatchObject({ status: 'insufficient' })
    expect(rankCurrentOutcomes(outcomes.slice(0, 1), [evidence], null)[0]).toMatchObject({ status: 'insufficient' })
  })

  it('uc dogrulanmis gune yayilan legacy kanitin mastered kararini iki yuzeyde korur', () => {
    const evidence = state('o1')
    expect(mapOutcome(evidence)).toMatchObject({ modelVersion: 'legacy-v1', status: 'mastered', score: 80 })
    expect(rankWeakOutcomes(outcomes.slice(0, 1), [evidence])).toEqual([])
    expect(rankCurrentOutcomes(outcomes.slice(0, 1), [evidence], null)).toEqual([])
  })

  it('state olmayan kazanimi sifir kanitli current target olarak korur, zayif demez', () => {
    expect(rankWeakOutcomes(outcomes, [])).toEqual([])
    expect(rankCurrentOutcomes(outcomes.slice(0, 1), [], null)).toEqual([
      { ...outcomes[0], accuracy: 0, attempts: 0, delayedCorrect: 0, status: 'insufficient', lastAnsweredAt: null },
    ])
  })

  it('tanimli kazanima ait olmayan statei karar havuzuna sokmaz', () => {
    const unknown = state('other-scope', { correctAttempts: 0, weightedEarned: 0, delayedCorrect: 0 })
    expect(rankWeakOutcomes(outcomes, [unknown])).toEqual([])
    expect(rankCurrentOutcomes(outcomes, [unknown], null).map((outcome) => outcome.id)).toEqual(['o1', 'o2', 'o3'])
  })
})
