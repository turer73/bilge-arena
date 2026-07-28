import { describe, expect, it } from 'vitest'
import { fsrsRolloutBucket, getFsrsReviewRollout } from '../fsrs-rollout'

const USER_ID = '11111111-2222-3333-4444-555555555555'

describe('FSRS review rollout', () => {
  it('varsayilan olarak fail-closed kapatir', () => {
    expect(getFsrsReviewRollout(USER_ID, {})).toMatchObject({
      enabled: false,
      percentage: 0,
      reason: 'master_disabled',
    })
  })

  it('aynı userId için kararlı 0..99 bucket üretir', () => {
    const first = fsrsRolloutBucket(USER_ID)
    expect(first).toBe(fsrsRolloutBucket(USER_ID))
    expect(first).toBeGreaterThanOrEqual(0)
    expect(first).toBeLessThan(100)
  })

  it('master switch açıkken yüzde 100 ile herkesi alır', () => {
    expect(getFsrsReviewRollout(USER_ID, {
      FSRS_REVIEW_ENABLED: 'true',
      FSRS_REVIEW_ROLLOUT_PERCENT: '100',
    })).toMatchObject({ enabled: true, percentage: 100, reason: 'cohort' })
  })

  it('master switch açıkken yüzde 0 ile hiç kimseyi almaz', () => {
    expect(getFsrsReviewRollout(USER_ID, {
      FSRS_REVIEW_ENABLED: 'true',
      FSRS_REVIEW_ROLLOUT_PERCENT: '0',
    })).toMatchObject({ enabled: false, percentage: 0, reason: 'percentage_zero' })
  })

  it('geçersiz yüzdeyi fail-closed olarak 0 kabul eder', () => {
    for (const percentage of ['-1', '101', '1.5', 'not-a-number']) {
      expect(getFsrsReviewRollout(USER_ID, {
        FSRS_REVIEW_ENABLED: 'true',
        FSRS_REVIEW_ROLLOUT_PERCENT: percentage,
      })).toMatchObject({ enabled: false, percentage: 0, reason: 'percentage_zero' })
    }
  })

  it('kill switch master/yüzde ayarlarının önüne geçer', () => {
    expect(getFsrsReviewRollout(USER_ID, {
      FSRS_REVIEW_ENABLED: 'true',
      FSRS_REVIEW_ROLLOUT_PERCENT: '100',
      FSRS_REVIEW_KILL_SWITCH: 'true',
    })).toMatchObject({ enabled: false, percentage: 100, reason: 'kill_switch' })
  })

  it('kohort eşiğini deterministik uygular', () => {
    const bucket = fsrsRolloutBucket(USER_ID)
    const enabledAtBucket = getFsrsReviewRollout(USER_ID, {
      FSRS_REVIEW_ENABLED: 'true',
      FSRS_REVIEW_ROLLOUT_PERCENT: String(bucket + 1),
    })
    const disabledBelowBucket = getFsrsReviewRollout(USER_ID, {
      FSRS_REVIEW_ENABLED: 'true',
      FSRS_REVIEW_ROLLOUT_PERCENT: String(bucket),
    })

    expect(enabledAtBucket.enabled).toBe(true)
    expect(disabledBelowBucket).toMatchObject({ enabled: false, reason: 'outside_cohort' })
  })
})
