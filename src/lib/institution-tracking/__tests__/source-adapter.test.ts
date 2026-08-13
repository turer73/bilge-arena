import { describe, expect, it } from 'vitest'
import {
  adaptProductHealthSnapshot,
  calculateProductHealthFromSnapshot,
  type ProductAccountClassification,
  type ProductHealthSourceSnapshot,
} from '../source-adapter'

function classification(
  overrides: Partial<ProductAccountClassification> = {},
): ProductAccountClassification {
  return {
    version: 'account-inventory-2026-08-13',
    attestedComplete: true,
    demoUserIds: new Set(),
    testUserIds: new Set(),
    syntheticUserIds: new Set(),
    dataExcludedUserIds: new Set(),
    blockedUserIds: new Set(),
    ...overrides,
  }
}

function snapshot(overrides: Partial<ProductHealthSourceSnapshot> = {}): ProductHealthSourceSnapshot {
  return {
    capturedAt: '2026-08-13T12:00:00.000Z',
    classification: classification(),
    profiles: [{
      userId: 'learner-1',
      registeredAt: '2026-07-01T09:00:00.000Z',
      deletedAt: null,
      legacyRole: 'user',
    }],
    roles: [],
    verifiedAnswers: [{
      answerId: 'answer-1',
      userId: 'learner-1',
      answeredAt: '2026-08-12T10:00:00.000Z',
      answerSessionId: 'session-1',
      selectedOption: 2,
      skipped: false,
      verifiedAttemptId: 'attempt-1',
      verifiedAttemptCompletedAt: '2026-08-12T10:05:00.000Z',
      verifiedAttemptSessionId: 'session-1',
    }],
    verifiedSessions: [{
      attemptId: 'attempt-1',
      userId: 'learner-1',
      completedAt: '2026-08-12T10:05:00.000Z',
      sessionId: 'session-1',
      sessionStatus: 'completed',
    }],
    completedPlanItems: [{
      planId: 'plan-1',
      position: 1,
      userId: 'learner-1',
      completedAt: '2026-08-11T10:00:00.000Z',
    }],
    ...overrides,
  }
}

describe('product health source adapter', () => {
  it('accepts only server-verified answer, session and completed-plan evidence', () => {
    const adapted = adaptProductHealthSnapshot(snapshot())

    expect(adapted.quality.ready).toBe(true)
    expect(adapted.quality.activities).toMatchObject({ acceptedRows: 3, invalidVerificationRows: 0 })
    expect(adapted.activities.map((row) => row.kind).sort()).toEqual([
      'published_program_activity',
      'verified_game_session',
      'verified_question_attempt',
    ])
    expect(adapted.activities[0]).not.toHaveProperty('selectedOption')
  })

  it('fails closed until the demo/test/synthetic inventory is attested', () => {
    const source = snapshot({ classification: classification({ attestedComplete: false }) })
    const adapted = adaptProductHealthSnapshot(source)

    expect(adapted.quality.ready).toBe(false)
    expect(adapted.quality.blockers).toContain('account_classification_not_attested')
    expect(adapted.learners[0].dataIncluded).toBe(false)
    expect(() => calculateProductHealthFromSnapshot(source)).toThrow(/not ready/)
  })

  it('classifies demo, test, synthetic and privileged accounts outside the learner denominator', () => {
    const profiles = ['production', 'demo', 'test', 'synthetic', 'admin', 'teacher'].map((userId) => ({
      userId,
      registeredAt: '2026-07-01T09:00:00.000Z',
      deletedAt: null,
      legacyRole: userId === 'admin' ? 'admin' : 'user',
    }))
    const source = snapshot({
      profiles,
      roles: [{ userId: 'teacher', roleSlug: 'institution_pilot_staff' }],
      verifiedAnswers: [],
      verifiedSessions: [],
      completedPlanItems: [],
      classification: classification({
        demoUserIds: new Set(['demo']),
        testUserIds: new Set(['test']),
        syntheticUserIds: new Set(['synthetic']),
      }),
    })
    const { report, quality } = calculateProductHealthFromSnapshot(source, { minimumSampleSize: 1 })

    expect(quality.profiles).toMatchObject({
      classifiedDemo: 1,
      classifiedTest: 1,
      classifiedSynthetic: 1,
      classifiedNonLearner: 2,
    })
    expect(report.eligibleRegisteredCount).toBe(1)
    expect(report.excluded).toMatchObject({ nonLearner: 2, otherEnvironment: 2, synthetic: 1 })
  })

  it('blocks mismatched, skipped, orphaned, duplicate and timestamp-less source rows', () => {
    const base = snapshot()
    const answer = base.verifiedAnswers[0]
    const source = snapshot({
      verifiedAnswers: [
        answer,
        { ...answer, answerId: 'skipped', skipped: true },
        { ...answer, answerId: 'mismatch', verifiedAttemptSessionId: 'other-session' },
        { ...answer, answerId: 'missing-time', answeredAt: null },
        { ...answer, answerId: 'orphan', userId: 'missing-user' },
        answer,
      ],
      verifiedSessions: [],
      completedPlanItems: [],
    })
    const adapted = adaptProductHealthSnapshot(source)

    expect(adapted.quality.ready).toBe(false)
    expect(adapted.quality.activities).toMatchObject({
      acceptedRows: 1,
      duplicateRows: 1,
      orphanRows: 1,
      invalidVerificationRows: 2,
      missingTimestampRows: 1,
    })
    expect(adapted.quality.blockers).toEqual(expect.arrayContaining([
      'activity_rows_missing_timestamp',
      'orphan_activity_rows',
      'invalid_verification_rows',
      'duplicate_activity_rows',
    ]))
  })
})
