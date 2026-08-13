import { describe, expect, it } from 'vitest'
import {
  calculateProductHealth,
  calculateStreakReturn,
  type ProductActivityRecord,
  type ProductLearnerRecord,
} from '../product-health'

function learner(
  learnerKey: string,
  registeredAt: string,
  overrides: Partial<ProductLearnerRecord> = {},
): ProductLearnerRecord {
  return {
    learnerKey,
    registeredAt,
    accountType: 'learner',
    environment: 'production',
    synthetic: false,
    dataIncluded: true,
    deletedAt: null,
    blockedAt: null,
    ...overrides,
  }
}

function activity(
  activityKey: string,
  learnerKey: string,
  occurredAt: string,
  overrides: Partial<ProductActivityRecord> = {},
): ProductActivityRecord {
  return {
    activityKey,
    learnerKey,
    occurredAt,
    kind: 'verified_question_attempt',
    verified: true,
    ...overrides,
  }
}

describe('product health metrics', () => {
  it('uses only eligible learners and verified post-registration questions for activation', () => {
    const learners = [
      learner('l1', '2026-08-01T09:00:00.000Z'),
      learner('l2', '2026-08-01T09:00:00.000Z'),
      learner('l3', '2026-08-01T09:00:00.000Z'),
      learner('l4', '2026-08-01T09:00:00.000Z'),
      learner('teacher', '2026-08-01T09:00:00.000Z', { accountType: 'teacher' }),
      learner('demo', '2026-08-01T09:00:00.000Z', { environment: 'demo' }),
      learner('synthetic', '2026-08-01T09:00:00.000Z', { synthetic: true }),
    ]
    const activities = [
      activity('a1', 'l1', '2026-08-01T10:00:00.000Z'),
      activity('a2', 'l2', '2026-07-31T10:00:00.000Z'),
      activity('a3', 'l3', '2026-08-01T10:00:00.000Z', { verified: false }),
      activity('a4', 'l4', '2026-08-08T08:59:59.000Z'),
      activity('a4', 'l4', '2026-08-08T08:59:59.000Z'),
    ]

    const report = calculateProductHealth({
      learners,
      activities,
      asOf: '2026-08-13T12:00:00.000Z',
      minimumSampleSize: 1,
    })

    expect(report.eligibleRegisteredCount).toBe(4)
    expect(report.excluded).toMatchObject({ nonLearner: 1, otherEnvironment: 1, synthetic: 1 })
    expect(report.activation.everQuestion).toMatchObject({ numerator: 2, denominator: 4, percentage: 50 })
    expect(report.activation.within24Hours).toMatchObject({ numerator: 1, denominator: 4, percentage: 25 })
    expect(report.activation.within7Days).toMatchObject({ numerator: 2, denominator: 4, percentage: 50 })
    expect(report.activation.medianMinutesToFirstQuestion).toBe(5070)
  })

  it('keeps immature learners out of D7/D30 and reports WAU as X over N', () => {
    const learners = [
      learner('l1', '2026-06-01T09:00:00.000Z'),
      learner('l2', '2026-06-01T09:00:00.000Z'),
      learner('l3', '2026-08-10T09:00:00.000Z'),
    ]
    const activities = [
      activity('l1-d0', 'l1', '2026-06-01T10:00:00.000Z'),
      activity('l1-d1', 'l1', '2026-06-02T10:00:00.000Z'),
      activity('l1-d7', 'l1', '2026-06-08T10:00:00.000Z'),
      activity('l1-d30', 'l1', '2026-07-01T10:00:00.000Z'),
      activity('l2-d0', 'l2', '2026-06-01T11:00:00.000Z'),
      activity('l2-d1', 'l2', '2026-06-02T11:00:00.000Z'),
      activity('l3-wau', 'l3', '2026-08-12T10:00:00.000Z', { kind: 'verified_game_session' }),
    ]

    const report = calculateProductHealth({
      learners,
      activities,
      asOf: '2026-08-13T12:00:00.000Z',
      minimumSampleSize: 1,
    })

    expect(report.retention.signup.d1).toMatchObject({ numerator: 2, denominator: 3 })
    expect(report.retention.signup.d7).toMatchObject({ numerator: 1, denominator: 2 })
    expect(report.retention.signup.d30).toMatchObject({ numerator: 1, denominator: 2 })
    expect(report.weeklyActive).toMatchObject({
      numerator: 1,
      denominator: 3,
      percentage: 33.3,
      windowStartDate: '2026-08-06',
      windowEndDateExclusive: '2026-08-13',
    })
  })

  it('uses Europe/Istanbul calendar days for exact D1', () => {
    const report = calculateProductHealth({
      learners: [learner('l1', '2026-08-10T20:30:00.000Z')],
      activities: [activity('a1', 'l1', '2026-08-10T21:30:00.000Z')],
      asOf: '2026-08-12T12:00:00.000Z',
      minimumSampleSize: 1,
    })
    expect(report.retention.signup.d1).toMatchObject({ numerator: 1, denominator: 1, percentage: 100 })
  })

  it('suppresses percentages and intervals below the configured sample size', () => {
    const report = calculateProductHealth({
      learners: [learner('l1', '2026-08-01T09:00:00.000Z')],
      activities: [activity('a1', 'l1', '2026-08-01T10:00:00.000Z')],
      asOf: '2026-08-13T12:00:00.000Z',
    })
    expect(report.activation.everQuestion).toEqual({
      numerator: 1,
      denominator: 1,
      percentage: null,
      interval95: null,
      sampleStatus: 'insufficient',
    })
  })

  it('reports a 380-person WAU denominator as an explicit count and percentage', () => {
    const learners = Array.from({ length: 380 }, (_, index) => (
      learner(`learner-${index}`, '2026-07-01T09:00:00.000Z')
    ))
    const activities = Array.from({ length: 95 }, (_, index) => (
      activity(`weekly-${index}`, `learner-${index}`, '2026-08-12T10:00:00.000Z')
    ))
    const report = calculateProductHealth({
      learners,
      activities,
      asOf: '2026-08-13T12:00:00.000Z',
    })

    expect(report.weeklyActive).toMatchObject({
      numerator: 95,
      denominator: 380,
      percentage: 25,
      sampleStatus: 'available',
    })
  })
})

describe('streak return observation', () => {
  it('compares broken and maintained learners only inside matching history strata', () => {
    const learners = [
      learner('broken', '2026-07-01T09:00:00.000Z'),
      learner('maintained', '2026-07-01T09:00:00.000Z'),
    ]
    const activities: ProductActivityRecord[] = []
    for (const learnerKey of ['broken', 'maintained']) {
      for (const day of [7, 8, 9]) {
        activities.push(activity(`${learnerKey}-${day}`, learnerKey, `2026-08-${String(day).padStart(2, '0')}T10:00:00.000Z`))
      }
    }
    activities.push(activity('maintained-anchor', 'maintained', '2026-08-10T10:00:00.000Z'))
    activities.push(activity('maintained-return', 'maintained', '2026-08-11T10:00:00.000Z'))
    activities.push(activity('broken-return', 'broken', '2026-08-12T10:00:00.000Z'))

    const report = calculateStreakReturn({
      learners,
      activities,
      anchorDate: '2026-08-10',
      asOf: '2026-08-17T12:00:00.000Z',
      minimumSampleSize: 1,
    })

    expect(report.matchedStratumCount).toBe(1)
    expect(report.horizons.d1.broken).toMatchObject({ numerator: 0, denominator: 1, percentage: 0 })
    expect(report.horizons.d1.maintained).toMatchObject({ numerator: 1, denominator: 1, percentage: 100 })
    expect(report.horizons.d1.breakMinusMaintainedPoints).toBe(-100)
    expect(report.horizons.d3.broken.percentage).toBe(100)
    expect(report.horizons.d3.breakMinusMaintainedPoints).toBe(0)
  })
})
