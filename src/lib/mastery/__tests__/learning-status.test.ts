import { describe, expect, it } from 'vitest'
import { summarizeLearningStatus, type LearningStatusInput } from '../learning-status'

const BASE: LearningStatusInput = {
  attempts: 5, correctAttempts: 4, weightedEarned: 4, weightedPossible: 5,
  delayedCorrect: 1, v2Attempts: 5, difficultyWeightedEarned: 12, difficultyWeightedPossible: 15,
  timedAttempts: 5, totalTimeSec: 150, fastWrong: 0, hintedAttempts: 0, hintStageSum: 0,
  guessAnnotations: 0, carelessAnnotations: 0, verifiedEvidenceDays: 3,
}

describe('summarizeLearningStatus', () => {
  it('uc dogrulanmis gunde V2 skorunu ve aciklanabilir bilesenlerini korur', () => {
    expect(summarizeLearningStatus(BASE)).toMatchObject({
      status: 'mastered', score: 89, rawAccuracy: 80, difficultyAccuracy: 80,
      modelVersion: 'evidence-v2', evidenceCompleteness: 100, verifiedEvidenceDays: 3,
      components: { accuracy: 44, delayedRetrieval: 20, independence: 15, selfRegulation: 10 },
    })
  })

  it.each([0, 1, 2])('%i gunde guclu V2 kanitindan seviye veya skor yayinlamaz', (verifiedEvidenceDays) => {
    expect(summarizeLearningStatus({ ...BASE, verifiedEvidenceDays })).toMatchObject({
      attempts: 5, correctAttempts: 4, delayedCorrect: 1, rawAccuracy: 80,
      status: 'insufficient', score: 0, modelVersion: 'evidence-v2',
      verifiedEvidenceDays, evidenceCompleteness: Math.round(verifiedEvidenceDays / 3 * 100),
      components: { accuracy: 0, delayedRetrieval: 0, independence: 0, selfRegulation: 0 },
    })
  })

  it.each([-1, 1.5, 6, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    'bozuk veya deneme sayisindan fazla gunu sifirlar: %s',
    (verifiedEvidenceDays) => {
      expect(summarizeLearningStatus({ ...BASE, verifiedEvidenceDays })).toMatchObject({
        verifiedEvidenceDays: 0, status: 'insufficient', score: 0, evidenceCompleteness: 0,
      })
    },
  )

  it('runtime eksik gun alaniyla gun kaniti varsaymaz', () => {
    expect(summarizeLearningStatus({
      ...BASE, verifiedEvidenceDays: undefined as unknown as number,
    })).toMatchObject({ verifiedEvidenceDays: 0, status: 'insufficient', score: 0 })
  })

  it('gun sayisini normalize edilen deneme sayisina gore sinirlar', () => {
    expect(summarizeLearningStatus({ ...BASE, attempts: Number.NaN, verifiedEvidenceDays: 3 })).toMatchObject({
      attempts: 0, verifiedEvidenceDays: 0, status: 'insufficient', score: 0,
    })
  })

  it('ham dogruluk V1 mastered olsa da V2 ipucu bagimliligini korur', () => {
    expect(summarizeLearningStatus({ ...BASE, hintedAttempts: 5, hintStageSum: 20 })).toMatchObject({
      rawAccuracy: 80, score: 74, status: 'developing', components: { independence: 0 },
    })
  })

  it('ham dogruluk V1 esiginin altindayken guclu V2 kanitini ayri degerlendirir', () => {
    expect(summarizeLearningStatus({
      ...BASE, correctAttempts: 3, weightedEarned: 3,
      difficultyWeightedEarned: 15, difficultyWeightedPossible: 17,
    })).toMatchObject({ rawAccuracy: 60, difficultyAccuracy: 88, score: 93, status: 'mastered' })
  })

  it('uc gun gecikmeli geri cagirma kanitinin yerine gecmez', () => {
    expect(summarizeLearningStatus({ ...BASE, delayedCorrect: 0 })).toMatchObject({
      verifiedEvidenceDays: 3, status: 'developing', delayedCorrect: 0,
    })
  })

  it('V2 kaniti olmayan legacy satirin yeterli gunle ham dogruluk kararini korur', () => {
    const legacy = {
      ...BASE, v2Attempts: 0, difficultyWeightedEarned: 0, difficultyWeightedPossible: 0,
      timedAttempts: 0, totalTimeSec: 0,
    }
    expect(summarizeLearningStatus(legacy)).toMatchObject({
      modelVersion: 'legacy-v1', score: 80, status: 'mastered', verifiedEvidenceDays: 3,
      components: { accuracy: 80, delayedRetrieval: 0, independence: 0, selfRegulation: 0 },
    })
    expect(summarizeLearningStatus({ ...legacy, verifiedEvidenceDays: 0 })).toMatchObject({
      modelVersion: 'legacy-v1', score: 0, status: 'insufficient',
    })
  })

  it('sifir kanitta kendiliginden seviye veya bagimsizlik puani uretmez', () => {
    expect(summarizeLearningStatus({
      ...BASE, attempts: 0, correctAttempts: 0, weightedEarned: 0, weightedPossible: 0,
      delayedCorrect: 0, v2Attempts: 0, difficultyWeightedEarned: 0, difficultyWeightedPossible: 0,
      timedAttempts: 0, totalTimeSec: 0, verifiedEvidenceDays: 0,
    })).toMatchObject({
      attempts: 0, correctAttempts: 0, rawAccuracy: 0, modelVersion: 'legacy-v1',
      status: 'insufficient', score: 0, verifiedEvidenceDays: 0, evidenceCompleteness: 0,
      components: { accuracy: 0, delayedRetrieval: 0, independence: 0, selfRegulation: 0 },
    })
  })
})
