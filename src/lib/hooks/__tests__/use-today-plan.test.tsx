import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

import { useTodayPlan } from '../use-today-plan'

const PLAN = {
  planDate: '2026-07-21',
  game: 'matematik',
  examRef: 'TYT',
  questions: [{ id: 'q1' }],
  completedIds: [],
  items: [{
    questionId: 'q1',
    position: 1,
    slotType: 'due',
    sourceType: 'due',
    sourceLabel: 'Tekrar zamanı',
    completed: false,
  }],
  attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  expiresAt: '2099-01-01T00:00:00.000Z',
}

function response(body: unknown, ok = true) {
  return { ok, json: vi.fn(async () => body) } as unknown as Response
}

interface TodayPlanHookProps {
  userId: string
  examRef: string | null
  selectedCategory: string | null
}

const CONTEXT_CHANGES: Array<{
  context: string
  initial: TodayPlanHookProps
  next: TodayPlanHookProps
}> = [
  {
    context: 'kullanici',
    initial: { userId: 'u1', examRef: 'TYT', selectedCategory: null },
    next: { userId: 'u2', examRef: 'TYT', selectedCategory: null },
  },
  {
    context: 'sinav',
    initial: { userId: 'u1', examRef: 'TYT', selectedCategory: null },
    next: { userId: 'u1', examRef: 'LGS', selectedCategory: null },
  },
  {
    context: 'kategori',
    initial: { userId: 'u1', examRef: 'TYT', selectedCategory: null },
    next: { userId: 'u1', examRef: 'TYT', selectedCategory: 'problemler' },
  },
]

describe('useTodayPlan', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exam_ref parametresini gonderir ve ayni oyunun planini kabul eder', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(PLAN))

    const { result } = renderHook(() => useTodayPlan('matematik', 'u1', 'LGS'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(fetch).toHaveBeenCalledWith(
      '/api/study/today?game=matematik&exam_ref=LGS',
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    )
    expect(result.current.plan?.game).toBe('matematik')
  })

  it('gecerli secili kategoriyi ogrenci secimi baglami olarak gonderir', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(PLAN))

    const { result } = renderHook(() => useTodayPlan('matematik', 'u1', 'TYT', 'problemler'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(fetch).toHaveBeenCalledWith(
      '/api/study/today?game=matematik&exam_ref=TYT&choice_category=problemler',
      expect.anything(),
    )
    expect(result.current.plan?.items[0].sourceType).toBe('due')
  })

  it('game degisince basarisiz refetch eski plani ekranda birakmaz', async () => {
    let resolveFailedRefetch!: (value: Response) => void
    const failedRefetch = new Promise<Response>((resolve) => { resolveFailedRefetch = resolve })
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(PLAN))
      .mockReturnValueOnce(failedRefetch)

    const { result, rerender } = renderHook(
      ({ game }) => useTodayPlan(game, 'u1', 'TYT'),
      { initialProps: { game: 'matematik' as const } },
    )
    await waitFor(() => expect(result.current.plan?.game).toBe('matematik'))

    rerender({ game: 'turkce' as never })
    expect(result.current.plan).toBeNull()
    expect(result.current.loading).toBe(true)

    resolveFailedRefetch(response({ error: 'fail' }, false))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.plan).toBeNull()
  })

  it.each(CONTEXT_CHANGES)('$context degisince effect oncesinde eski plani gizler', async ({ initial, next }) => {
    let resolveRefetch!: (value: Response) => void
    const pendingRefetch = new Promise<Response>((resolve) => { resolveRefetch = resolve })
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(PLAN))
      .mockReturnValueOnce(pendingRefetch)

    const { result, rerender } = renderHook(
      ({ userId, examRef, selectedCategory }) => (
        useTodayPlan('matematik', userId, examRef, selectedCategory)
      ),
      { initialProps: initial },
    )
    await waitFor(() => expect(result.current.plan?.game).toBe('matematik'))

    rerender(next)
    expect(result.current.plan).toBeNull()
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))

    resolveRefetch(response({ error: 'fail' }, false))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.plan).toBeNull()
  })

  it('gec kalan eski istek yeni game planini ezemez', async () => {
    let resolveOld!: (value: Response) => void
    const oldRequest = new Promise<Response>((resolve) => { resolveOld = resolve })
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input)
      if (url.includes('game=matematik')) return oldRequest
      return Promise.resolve(response({
        ...PLAN,
        game: 'turkce',
        questions: [{ id: 'q2' }],
        items: [{ ...PLAN.items[0], questionId: 'q2' }],
      }))
    })

    const { result, rerender } = renderHook(
      ({ game }) => useTodayPlan(game, 'u1', 'TYT'),
      { initialProps: { game: 'matematik' as const } },
    )
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    rerender({ game: 'turkce' as never })
    await waitFor(() => expect(result.current.plan?.game).toBe('turkce'))

    resolveOld(response(PLAN))
    await Promise.resolve()
    expect(result.current.plan?.game).toBe('turkce')
  })

  it('response game istek baglamiyla uyusmazsa plani reddeder', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...PLAN, game: 'fen' }))
    const { result } = renderHook(() => useTodayPlan('matematik', 'u1', 'TYT'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.plan).toBeNull()
  })

  it.each([
    { attemptId: null, expiresAt: null },
    { attemptId: 'not-a-uuid', expiresAt: '2099-01-01T00:00:00.000Z' },
    { attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', expiresAt: '2020-01-01T00:00:00.000Z' },
  ])('soru iceren plani gecersiz biletle reddeder: %o', async (ticket) => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...PLAN, ...ticket }))
    const { result } = renderHook(() => useTodayPlan('matematik', 'u1', 'TYT'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.plan).toBeNull()
  })

  it('bos plani yalniz null biletle kabul eder', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({
      ...PLAN,
      questions: [],
      items: [],
      attemptId: null,
      expiresAt: null,
    }))
    const { result } = renderHook(() => useTodayPlan('matematik', 'u1', 'TYT'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.plan?.questions).toEqual([])
  })
})
