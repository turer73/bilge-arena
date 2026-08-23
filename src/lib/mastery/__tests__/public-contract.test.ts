import { describe, expect, it } from 'vitest'
import { parseMasteryMapResponse } from '../public-contract'

const RESPONSE = {
  game: 'matematik',
  examRef: 'TYT',
  coverage: { supported: true, taxonomyVersion: 'ba-tyt-math-v1', totalQuestions: 120, mappedQuestions: 120, percentage: 100 },
  discovery: { level: 3, stage: 'ready', diagnosticCompleted: true, evidenceCollected: 3, evidenceTarget: 3, readyOutcomes: 1, totalOutcomes: 1, journeyPercentage: 100 },
  graph: {
    code: 'MAT-TYT', title: 'TYT Matematik', nodeType: 'course', children: [{
      code: 'U1', title: 'Sayılar', nodeType: 'unit', children: [{
        code: 'T1', title: 'Temel sayılar', nodeType: 'topic', children: [{
          code: 'L1', title: 'İşlem', nodeType: 'outcome', outcomeCode: 'MAT-SAY-01', children: [],
        }],
      }],
    }],
  },
  outcomes: [{
    code: 'MAT-SAY-01', nodeCode: 'L1', path: ['TYT Matematik', 'Sayılar', 'Temel sayılar', 'İşlem'],
    title: 'İşlem', description: null, game: 'matematik', category: 'sayilar', examRef: 'TYT',
    attempts: 5, correctAttempts: 4, weightedEarned: 4, weightedPossible: 5, delayedCorrect: 1,
    accuracy: 80, rawAccuracy: 80, difficultyAccuracy: 80, averageTimeSec: 30,
    fastWrongRate: 0, hintRate: 0, averageHintStage: null, guessRisk: 0, carelessRisk: 0,
    evidenceCompleteness: 100, score: 89, status: 'mastered', modelVersion: 'evidence-v2',
    components: { accuracy: 44, delayedRetrieval: 20, independence: 15, selfRegulation: 10 },
    lastAnsweredAt: '2026-08-08T10:00:00Z',
  }],
}

describe('parseMasteryMapResponse', () => {
  it('tam ve güvenli V2 sözleşmesini kabul eder', () => {
    expect(parseMasteryMapResponse(RESPONSE)).toEqual(RESPONSE)
  })

  it('bozuk yüzdeyi, eksik leaf outcome kodunu ve iç kimlik alanını reddeder', () => {
    expect(parseMasteryMapResponse({
      ...RESPONSE,
      outcomes: [{ ...RESPONSE.outcomes[0], score: 101 }],
    })).toBeNull()
    expect(parseMasteryMapResponse({
      ...RESPONSE,
      graph: { code: 'L', title: 'Leaf', nodeType: 'outcome', children: [] },
    })).toBeNull()
    expect(parseMasteryMapResponse({
      ...RESPONSE,
      outcomes: [{ ...RESPONSE.outcomes[0], outcomeId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }],
    })).toBeNull()
  })

  it('desteklenmeyen kapsam için boş graph/outcome kabul eder', () => {
    expect(parseMasteryMapResponse({
      game: 'fen',
      examRef: 'TYT',
      coverage: { supported: false, taxonomyVersion: null, totalQuestions: 0, mappedQuestions: 0, percentage: 0 },
      discovery: null,
      graph: null,
      outcomes: [],
    })).not.toBeNull()
  })

  it('keşif sözleşmesinde sahte ilerleme veya kanıt aritmetiğini reddeder', () => {
    expect(parseMasteryMapResponse({
      ...RESPONSE,
      discovery: { ...RESPONSE.discovery, evidenceCollected: 2 },
    })).toBeNull()
    expect(parseMasteryMapResponse({
      ...RESPONSE,
      discovery: { ...RESPONSE.discovery, stage: 'estimate', level: 1 },
    })).toBeNull()
  })

  it('desteklenmeyen kapsamda graph/veri ve desteklenen kapsamda path sapmasini reddeder', () => {
    expect(parseMasteryMapResponse({
      ...RESPONSE,
      coverage: { supported: false, taxonomyVersion: null, totalQuestions: 0, mappedQuestions: 0, percentage: 0 },
    })).toBeNull()
    expect(parseMasteryMapResponse({
      ...RESPONSE,
      outcomes: [{ ...RESPONSE.outcomes[0], path: ['Yanlış', 'Sayılar', 'Temel sayılar', 'İşlem'] }],
    })).toBeNull()
  })

  it('kapali status/model enumlarini ve coverage aritmetigini zorlar', () => {
    expect(parseMasteryMapResponse({
      ...RESPONSE,
      outcomes: [{ ...RESPONSE.outcomes[0], status: 'super-mastered' }],
    })).toBeNull()
    expect(parseMasteryMapResponse({
      ...RESPONSE,
      outcomes: [{ ...RESPONSE.outcomes[0], modelVersion: 'v3' }],
    })).toBeNull()
    expect(parseMasteryMapResponse({
      ...RESPONSE,
      coverage: { ...RESPONSE.coverage, mappedQuestions: 60, percentage: 100 },
    })).toBeNull()
  })
})
