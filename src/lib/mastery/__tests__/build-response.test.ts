import { describe, expect, it } from 'vitest'
import { buildMasteryMapResponse } from '../build-response'

const nodes = [
  { id: 'c', code: 'MAT', nodeType: 'course' as const, title: 'TYT Matematik', parentId: null, sortOrder: 0 },
  { id: 'u', code: 'U', nodeType: 'unit' as const, title: 'Sayılar ve Cebir', parentId: 'c', sortOrder: 0 },
  { id: 't', code: 'T', nodeType: 'topic' as const, title: 'Sayılar', parentId: 'u', sortOrder: 0 },
  { id: 'o', code: 'O', nodeType: 'outcome' as const, title: 'İşlem becerisi', parentId: 't', sortOrder: 0 },
]
const outcomes = [{
  id: 'outcome-id', nodeId: 'o', code: 'MAT-SAY-01', title: 'İşlem becerisi', description: null,
  game: 'matematik', category: 'sayilar', examRef: 'TYT',
}]

describe('buildMasteryMapResponse', () => {
  it('DB kimliklerini çıkartıp path ve V2 kanıtını birleştirir', () => {
    const response = buildMasteryMapResponse({
      game: 'matematik', examRef: 'TYT',
      coverage: { supported: true, diagnosticAvailable: true, taxonomyVersion: 'ba-tyt-math-v1', totalQuestions: 10, mappedQuestions: 10, percentage: 100 },
      nodes, outcomes,
      diagnosticOutcomeIds: ['outcome-id'],
      states: [{
        outcomeId: 'outcome-id', attempts: 5, correctAttempts: 4, weightedEarned: 4, weightedPossible: 5,
        delayedCorrect: 1, v2Attempts: 5, difficultyWeightedEarned: 12, difficultyWeightedPossible: 15,
        timedAttempts: 5, totalTimeSec: 150, fastWrong: 0, hintedAttempts: 0, hintStageSum: 0,
        guessAnnotations: 0, carelessAnnotations: 0, verifiedEvidenceDays: 3,
        lastAnsweredAt: '2026-08-08T10:00:00Z',
      }],
    })

    expect(response?.outcomes[0]).toMatchObject({
      code: 'MAT-SAY-01', nodeCode: 'O',
      path: ['TYT Matematik', 'Sayılar ve Cebir', 'Sayılar', 'İşlem becerisi'],
      status: 'mastered', score: 89, verifiedEvidenceDays: 3,
    })
    expect(response?.discovery).toMatchObject({ level: 3, stage: 'ready', diagnosticCompleted: true })
    expect(JSON.stringify(response)).not.toContain('outcome-id')
  })

  it('desteklenmeyen kapsamı sorgu verisi olmadan açık sözleşmeye çevirir', () => {
    expect(buildMasteryMapResponse({
      game: 'fen', examRef: 'TYT',
      coverage: { supported: false, diagnosticAvailable: false, taxonomyVersion: null, totalQuestions: 0, mappedQuestions: 0, percentage: 0 },
      nodes: [], outcomes: [], states: [],
    })).toEqual({
      game: 'fen', examRef: 'TYT',
      coverage: { supported: false, diagnosticAvailable: false, taxonomyVersion: null, totalQuestions: 0, mappedQuestions: 0, percentage: 0 },
      discovery: null, graph: null, outcomes: [],
    })
  })

  it('tanılama ile doğrulanmış kanıtı ayrı tutan keşif seviyesini üretir', () => {
    const response = buildMasteryMapResponse({
      game: 'matematik', examRef: 'TYT',
      coverage: { supported: true, diagnosticAvailable: true, taxonomyVersion: 'ba-tyt-math-v1', totalQuestions: 10, mappedQuestions: 10, percentage: 100 },
      nodes, outcomes, states: [], diagnosticOutcomeIds: ['outcome-id'],
    })

    expect(response?.discovery).toEqual({
      level: 2,
      stage: 'evidence',
      diagnosticCompleted: true,
      evidenceCollected: 0,
      evidenceTarget: 3,
      readyOutcomes: 0,
      totalOutcomes: 1,
      journeyPercentage: 25,
    })
    expect(response?.outcomes[0]).toMatchObject({ attempts: 0, status: 'insufficient' })
  })

  it('hiç tanılama veya pratik yokken hüküm yerine keşif seviyesi 1 üretir', () => {
    const response = buildMasteryMapResponse({
      game: 'matematik', examRef: 'TYT',
      coverage: { supported: true, diagnosticAvailable: true, taxonomyVersion: 'ba-tyt-math-v1', totalQuestions: 10, mappedQuestions: 10, percentage: 100 },
      nodes, outcomes, states: [], diagnosticOutcomeIds: [],
    })

    expect(response?.discovery).toEqual({
      level: 1,
      stage: 'estimate',
      diagnosticCompleted: false,
      evidenceCollected: 0,
      evidenceTarget: 3,
      readyOutcomes: 0,
      totalOutcomes: 1,
      journeyPercentage: 0,
    })
  })

  it('aynı Türkiye günündeki çok sayıda cevabı tek keşif kanıtı sayar', () => {
    const response = buildMasteryMapResponse({
      game: 'matematik', examRef: 'TYT',
      coverage: { supported: true, diagnosticAvailable: true, taxonomyVersion: 'ba-tyt-math-v1', totalQuestions: 10, mappedQuestions: 10, percentage: 100 },
      nodes, outcomes, diagnosticOutcomeIds: ['outcome-id'],
      states: [{
        outcomeId: 'outcome-id', attempts: 5, correctAttempts: 5, weightedEarned: 5, weightedPossible: 5,
        delayedCorrect: 0, v2Attempts: 5, difficultyWeightedEarned: 15, difficultyWeightedPossible: 15,
        timedAttempts: 5, totalTimeSec: 100, fastWrong: 0, hintedAttempts: 0, hintStageSum: 0,
        guessAnnotations: 0, carelessAnnotations: 0, verifiedEvidenceDays: 1,
        lastAnsweredAt: '2026-08-08T10:00:00Z',
      }],
    })

    expect(response?.outcomes[0]).toMatchObject({
      attempts: 5,
      status: 'insufficient',
      verifiedEvidenceDays: 1,
      evidenceCompleteness: 33,
      score: 0,
      components: {
        accuracy: 0,
        delayedRetrieval: 0,
        independence: 0,
        selfRegulation: 0,
      },
    })
    expect(response?.discovery).toEqual({
      level: 2,
      stage: 'evidence',
      diagnosticCompleted: true,
      evidenceCollected: 1,
      evidenceTarget: 3,
      readyOutcomes: 0,
      totalOutcomes: 1,
      journeyPercentage: 50,
    })
  })

  it('leaf/outcome bağı kopuksa fail closed olur', () => {
    expect(buildMasteryMapResponse({
      game: 'matematik', examRef: 'TYT',
      coverage: { supported: true, diagnosticAvailable: true, taxonomyVersion: 'ba-tyt-math-v1', totalQuestions: 1, mappedQuestions: 1, percentage: 100 },
      nodes, outcomes: [{ ...outcomes[0], nodeId: 'missing' }], states: [],
    })).toBeNull()
  })
})
