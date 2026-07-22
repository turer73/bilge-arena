import { describe, expect, it } from 'vitest'
import { summarizeMastery } from '../status'

describe('summarizeMastery', () => {
  it('3 kanittan azsa yetersiz der', () => {
    expect(summarizeMastery({
      attempts: 2,
      correctAttempts: 2,
      weightedEarned: 2,
      weightedPossible: 2,
      delayedCorrect: 1,
    })).toMatchObject({ status: 'insufficient', accuracy: 100 })
  })

  it('gecikmeli dogru olmadan yuksek dogrulukta bile ustalasti demez', () => {
    expect(summarizeMastery({
      attempts: 5,
      correctAttempts: 5,
      weightedEarned: 5,
      weightedPossible: 5,
      delayedCorrect: 0,
    }).status).toBe('developing')
  })

  it('5+ kanit, %80 ve gecikmeli dogruyla ustalasti der', () => {
    expect(summarizeMastery({
      attempts: 5,
      correctAttempts: 4,
      weightedEarned: 4,
      weightedPossible: 5,
      delayedCorrect: 1,
    })).toMatchObject({ status: 'mastered', accuracy: 80 })
  })

  it('bozuk/negatif girdileri guvenli araliga sikistirir', () => {
    expect(summarizeMastery({
      attempts: -1,
      correctAttempts: 4,
      weightedEarned: 9,
      weightedPossible: 2,
      delayedCorrect: 8,
    })).toEqual({
      attempts: 0,
      correctAttempts: 0,
      weightedEarned: 2,
      weightedPossible: 2,
      delayedCorrect: 0,
      accuracy: 100,
      status: 'insufficient',
    })
  })
})
