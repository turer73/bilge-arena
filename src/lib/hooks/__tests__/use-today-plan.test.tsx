import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

import { useTodayPlan } from '../use-today-plan'

const PLAN = {
  planDate: '2026-07-21',
  game: 'matematik',
  questions: [{ id: 'q1' }],
  completedIds: [],
}

function response(body: unknown, ok = true) {
  return { ok, json: vi.fn(async () => body) } as unknown as Response
}

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

  it('game degisince basarisiz refetch eski plani ekranda birakmaz', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(PLAN))
      .mockResolvedValueOnce(response({ error: 'fail' }, false))

    const { result, rerender } = renderHook(
      ({ game }) => useTodayPlan(game, 'u1', 'TYT'),
      { initialProps: { game: 'matematik' as const } },
    )
    await waitFor(() => expect(result.current.plan?.game).toBe('matematik'))

    rerender({ game: 'turkce' as never })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.plan).toBeNull()
  })

  it('gec kalan eski istek yeni game planini ezemez', async () => {
    let resolveOld!: (value: Response) => void
    const oldRequest = new Promise<Response>((resolve) => { resolveOld = resolve })
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input)
      if (url.includes('game=matematik')) return oldRequest
      return Promise.resolve(response({ ...PLAN, game: 'turkce', questions: [{ id: 'q2' }] }))
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
})
