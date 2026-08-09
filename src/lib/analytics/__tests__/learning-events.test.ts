import { beforeEach, describe, expect, test, vi } from 'vitest'

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/lib/utils/plausible', () => ({ trackEvent }))

import { trackLearningEvent } from '@/lib/analytics/learning-events'

beforeEach(() => trackEvent.mockClear())

describe('trackLearningEvent', () => {
  test('plan olayinda yalniz kapali listedeki kimliksiz alanlari gonderir', () => {
    trackLearningEvent('LearningPlanStarted', {
      game: 'matematik',
      planSize: 15.9,
      completedBefore: -4,
      examRef: 'tyt',
      email: 'ogrenci@example.com',
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      questionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      answer: 'C',
    } as never)

    expect(trackEvent).toHaveBeenCalledWith('LearningPlanStarted', {
      props: {
        game: 'matematik',
        surface: 'today_plan',
        plan_size: 15,
        completed_before: 0,
        exam_ref: 'TYT',
      },
    })
  })

  test('serbest veya supheli exam_ref degerini ham olarak gondermez', () => {
    trackLearningEvent('LearningPlanStarted', {
      game: 'fen',
      planSize: 10,
      completedBefore: 0,
      examRef: 'student@example.com',
    })

    expect(trackEvent).toHaveBeenCalledWith('LearningPlanStarted', {
      props: expect.objectContaining({ exam_ref: 'other' }),
    })
  })

  test('gecersiz oyun veya enum ile olay gondermez', () => {
    trackLearningEvent('CoachStageViewed', {
      game: 'chess',
      stage: 'prompt',
      result: 'shown',
    } as never)

    expect(trackEvent).not.toHaveBeenCalled()
  })

  test('koc asamasinda soru ve cevap verisini kabul etmez', () => {
    trackLearningEvent('CoachStageViewed', {
      game: 'turkce',
      stage: 'hint2',
      result: 'shown',
      questionId: 'q1',
      selectedOption: 3,
      solution: 'gizli cozum',
    } as never)

    expect(trackEvent).toHaveBeenCalledWith('CoachStageViewed', {
      props: { game: 'turkce', stage: 'hint2', result: 'shown' },
    })
  })

  test('kazanimi kesin sayi yerine kanit kovasiyla gonderir', () => {
    trackLearningEvent('OutcomeStatusVerified', {
      game: 'matematik',
      status: 'mastered',
      evidenceCount: 17,
    })

    expect(trackEvent).toHaveBeenCalledWith('OutcomeStatusVerified', {
      props: {
        game: 'matematik',
        status: 'mastered',
        evidence_bucket: '10_plus',
        verified: true,
      },
    })
  })
})
