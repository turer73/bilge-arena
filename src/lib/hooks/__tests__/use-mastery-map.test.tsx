import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useMasteryMap } from '../use-mastery-map'

const OUTCOME = {
  code: 'MAT-SAY-01',
  nodeCode: 'leaf',
  path: ['TYT Matematik', 'Sayılar ve Cebir', 'Sayılar', 'Sayılar ve işlem'],
  title: 'Sayılar ve işlem',
  description: null,
  game: 'matematik',
  category: 'sayilar',
  examRef: 'TYT',
  attempts: 5,
  correctAttempts: 4,
  weightedEarned: 4,
  weightedPossible: 5,
  delayedCorrect: 1,
  accuracy: 80,
  rawAccuracy: 80,
  difficultyAccuracy: 80,
  averageTimeSec: 12,
  fastWrongRate: 10,
  hintRate: 20,
  averageHintStage: 1,
  guessRisk: 0,
  carelessRisk: 0,
  evidenceCompleteness: 100,
  score: 84,
  status: 'mastered',
  modelVersion: 'evidence-v2',
  components: { accuracy: 44, delayedRetrieval: 20, independence: 15, selfRegulation: 5 },
  lastAnsweredAt: '2026-08-08T10:00:00Z',
} as const

function mastery(game = 'matematik', examRef: string | null = 'TYT') {
  return {
    game,
    examRef,
    coverage: {
      supported: true,
      diagnosticAvailable: true,
      taxonomyVersion: 'ba-tyt-math-v1',
      totalQuestions: 10,
      mappedQuestions: 10,
      percentage: 100,
    },
    discovery: { level: 3, stage: 'ready', diagnosticCompleted: true, evidenceCollected: 3, evidenceTarget: 3, readyOutcomes: 1, totalOutcomes: 1, journeyPercentage: 100 },
    graph: {
      code: 'course',
      title: 'TYT Matematik',
      nodeType: 'course',
      children: [{
        code: 'unit',
        title: 'Sayılar ve Cebir',
        nodeType: 'unit',
        children: [{
          code: 'topic',
          title: 'Sayılar',
          nodeType: 'topic',
          children: [{
            code: 'leaf',
            title: 'Sayılar ve işlem',
            nodeType: 'outcome',
            outcomeCode: 'MAT-SAY-01',
            children: [],
          }],
        }],
      }],
    },
    outcomes: [{ ...OUTCOME, game, examRef }],
  }
}

function response(body: unknown, ok = true) {
  return { ok, json: vi.fn(async () => body) } as unknown as Response
}

describe('useMasteryMap', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exam_ref degerini normalize eder ve runtime dogrulanmis haritayi kabul eder', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(mastery()))
    const { result } = renderHook(() => useMasteryMap('matematik', 'u1', 'tyt'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(fetch).toHaveBeenCalledWith(
      '/api/profile/mastery?game=matematik&exam_ref=TYT',
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    )
    expect(result.current.graph?.nodeType).toBe('course')
    expect(result.current.coverage.percentage).toBe(100)
    expect(result.current.discovery?.stage).toBe('ready')
    expect(result.current.error).toBe(false)
    expect(result.current.outcomes[0]?.code).toBe('MAT-SAY-01')
  })

  it('kullanici yoksa istek yapmaz ve veriyi bos tutar', async () => {
    const { result } = renderHook(() => useMasteryMap('matematik', null, 'TYT'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetch).not.toHaveBeenCalled()
    expect(result.current.response).toBeNull()
    expect(result.current.error).toBe(false)
    expect(result.current.outcomes).toEqual([])
  })

  it('gecersiz runtime payload veya scope uyusmazligini reddeder', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ ...mastery(), outcomes: [{ code: 'eksik' }] }))
      .mockResolvedValueOnce(response(mastery('fen')))

    const { result, rerender } = renderHook(
      ({ game }) => useMasteryMap(game, 'u1', 'TYT'),
      { initialProps: { game: 'matematik' as const } },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.response).toBeNull()
    expect(result.current.error).toBe(true)

    rerender({ game: 'turkce' as never })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.response).toBeNull()
  })

  it('gec kalan eski istek yeni oyun sonucunu ezemez', async () => {
    let resolveOld!: (value: Response) => void
    const oldRequest = new Promise<Response>((resolve) => { resolveOld = resolve })
    vi.mocked(fetch).mockImplementation((input) => {
      if (String(input).includes('game=matematik')) return oldRequest
      return Promise.resolve(response(mastery('fen', 'TYT')))
    })

    const { result, rerender } = renderHook(
      ({ game }) => useMasteryMap(game, 'u1', 'TYT'),
      { initialProps: { game: 'matematik' as const } },
    )
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    rerender({ game: 'fen' as never })
    await waitFor(() => expect(result.current.response?.game).toBe('fen'))

    resolveOld(response(mastery()))
    await Promise.resolve()
    expect(result.current.response?.game).toBe('fen')
  })

  it('basarisiz yanitta onceki baglam verisini ekranda tutmaz', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(mastery()))
      .mockResolvedValueOnce(response({ error: 'fail' }, false))

    const { result, rerender } = renderHook(
      ({ game }) => useMasteryMap(game, 'u1', 'TYT'),
      { initialProps: { game: 'matematik' as const } },
    )
    await waitFor(() => expect(result.current.response?.game).toBe('matematik'))
    rerender({ game: 'fen' as never })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.response).toBeNull()
  })
})
