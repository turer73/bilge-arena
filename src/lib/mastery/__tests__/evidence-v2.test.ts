import { describe, expect, it } from 'vitest'
import { summarizeMasteryEvidenceV2, type MasteryEvidenceV2Input } from '../evidence-v2'

const BASE: MasteryEvidenceV2Input = {
  attempts: 5,
  correctAttempts: 4,
  weightedEarned: 4,
  weightedPossible: 5,
  delayedCorrect: 1,
  v2Attempts: 5,
  difficultyWeightedEarned: 12,
  difficultyWeightedPossible: 15,
  timedAttempts: 5,
  totalTimeSec: 150,
  fastWrong: 0,
  hintedAttempts: 0,
  hintStageSum: 0,
  guessAnnotations: 0,
  carelessAnnotations: 0,
}

describe('summarizeMasteryEvidenceV2', () => {
  it('güçlü, bağımsız ve gecikmeli kanıtı mastered yapar', () => {
    const result = summarizeMasteryEvidenceV2(BASE)

    expect(result).toMatchObject({
      rawAccuracy: 80,
      difficultyAccuracy: 80,
      averageTimeSec: 30,
      hintRate: 0,
      score: 89,
      status: 'mastered',
      modelVersion: 'evidence-v2',
    })
  })

  it('üçten az kanıtı skor yüksek olsa da insufficient tutar', () => {
    const result = summarizeMasteryEvidenceV2({
      ...BASE,
      attempts: 2,
      correctAttempts: 2,
      weightedEarned: 2,
      weightedPossible: 2,
      delayedCorrect: 1,
      v2Attempts: 2,
      difficultyWeightedEarned: 6,
      difficultyWeightedPossible: 6,
      timedAttempts: 2,
      totalTimeSec: 30,
    })

    expect(result.status).toBe('insufficient')
  })

  it('gecikmeli doğru yoksa mastered vermez', () => {
    const result = summarizeMasteryEvidenceV2({ ...BASE, delayedCorrect: 0 })

    expect(result.status).toBe('developing')
    expect(result.components.delayedRetrieval).toBe(0)
  })

  it('derin ve sık ipucu kullanımını bağımsızlık bileşeninde görünür kılar', () => {
    const result = summarizeMasteryEvidenceV2({
      ...BASE,
      hintedAttempts: 5,
      hintStageSum: 20,
    })

    expect(result.hintRate).toBe(100)
    expect(result.averageHintStage).toBe(4)
    expect(result.components.independence).toBe(0)
    expect(result.status).toBe('developing')
  })

  it('hızlı yanlış ve öğrenci etiketi riskini ayrı gösterir', () => {
    const result = summarizeMasteryEvidenceV2({
      ...BASE,
      correctAttempts: 2,
      weightedEarned: 2,
      difficultyWeightedEarned: 6,
      fastWrong: 2,
      guessAnnotations: 1,
      carelessAnnotations: 1,
    })

    expect(result.fastWrongRate).toBe(67)
    expect(result.guessRisk).toBe(33)
    expect(result.carelessRisk).toBe(33)
    expect(result.components.selfRegulation).toBeLessThan(5)
  })

  it('V2 kanıtı olmayan eski satırda mevcut doğruluk/status semantiğini korur', () => {
    const result = summarizeMasteryEvidenceV2({
      ...BASE,
      v2Attempts: 0,
      difficultyWeightedEarned: 0,
      difficultyWeightedPossible: 0,
      timedAttempts: 0,
      totalTimeSec: 0,
    })

    expect(result).toMatchObject({
      modelVersion: 'legacy-v1',
      score: 80,
      status: 'mastered',
      averageTimeSec: null,
    })
  })

  it('bozuk veya negatif sayaçları güvenli aralığa sıkıştırır', () => {
    const result = summarizeMasteryEvidenceV2({
      ...BASE,
      attempts: -10,
      correctAttempts: 999,
      weightedEarned: Number.NaN,
      weightedPossible: -1,
      v2Attempts: 999,
      fastWrong: 999,
    })

    expect(result.attempts).toBe(0)
    expect(result.rawAccuracy).toBe(0)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })
})
