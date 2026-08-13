import { beforeEach, describe, expect, test, vi } from 'vitest'
import { trackBilgeBoardEvent } from '../analytics'

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/lib/utils/plausible', () => ({ trackEvent }))

beforeEach(() => trackEvent.mockClear())

describe('trackBilgeBoardEvent privacy boundary', () => {
  test('açılışta yalnız kapalı listedeki alanları gönderir', () => {
    trackBilgeBoardEvent('BilgeBoardOpened', {
      surface: 'study',
      game: 'matematik',
      entryPoint: 'study_assistant',
      examRef: 'tyt',
      email: 'ogrenci@example.com',
      question: 'Ham soru metni',
    } as never)

    expect(trackEvent).toHaveBeenCalledWith('BilgeBoardOpened', {
      props: {
        surface: 'study',
        game: 'matematik',
        entry_point: 'study_assistant',
        exam_ref: 'TYT',
      },
    })
  })

  test('süreyi ham değer yerine kovaya dönüştürür', () => {
    trackBilgeBoardEvent('BilgeBoardReturnedToQuestion', {
      surface: 'game', game: 'fen', elapsedMs: 42_000,
    })
    expect(trackEvent).toHaveBeenCalledWith('BilgeBoardReturnedToQuestion', {
      props: { surface: 'game', game: 'fen', duration_bucket: '15_59s' },
    })
  })

  test('sözleşme dışı oyun ve aşama için olay üretmez', () => {
    trackBilgeBoardEvent('BilgeBoardStageViewed', {
      surface: 'game', game: 'satranç', stage: 'answer', stepIndex: 0,
    } as never)
    expect(trackEvent).not.toHaveBeenCalled()
  })
})
