import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePersonalizedMock } from '../use-personalized-mock'

function response(body: unknown, ok = true) {
  return { ok, json: vi.fn(async () => body) } as unknown as Response
}

const PLAN = {
  generatedFor: '2026-07-29',
  game: 'matematik' as const,
  examRef: 'TYT',
  questions: Array.from({ length: 40 }, (_, index) => ({ id: `q${index}` })),
  breakdown: { wrong: 1, weak: 0, coverage: 0, weakCategories: [] },
}

describe('usePersonalizedMock', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
  afterEach(() => vi.unstubAllGlobals())

  it('yalnız kullanıcı isteyince exam_ref ile kişisel seti üretir', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(PLAN))
    const { result } = renderHook(() => usePersonalizedMock('matematik', 'u1', 'TYT'))

    let plan = null
    await act(async () => { plan = await result.current.generate() })

    expect(fetch).toHaveBeenCalledWith(
      '/api/study/personalized-mock?game=matematik&exam_ref=TYT',
      { cache: 'no-store', signal: expect.any(AbortSignal) },
    )
    expect(plan).toEqual(PLAN)
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('kullanıcı yoksa ağ isteği yapmaz', async () => {
    const { result } = renderHook(() => usePersonalizedMock('matematik', null, 'TYT'))
    await act(async () => { expect(await result.current.generate()).toBeNull() })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('API hata mesajını kullanıcıya taşır', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ error: 'Deneme oluşturulamadı' }, false))
    const { result } = renderHook(() => usePersonalizedMock('matematik', 'u1', null))

    await act(async () => { await result.current.generate() })
    expect(result.current.error).toBe('Deneme oluşturulamadı')
  })

  it('boş soru havuzunu başlatılabilir plan saymaz', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...PLAN, questions: [] }))
    const { result } = renderHook(() => usePersonalizedMock('matematik', 'u1', 'TYT'))

    let plan: unknown
    await act(async () => { plan = await result.current.generate() })
    expect(plan).toBeNull()
    expect(result.current.error).toContain('40 aktif soru')
  })

  it('oyun bağlamı değişince bekleyen eski isteği iptal eder', async () => {
    let resolveOld!: (value: Response) => void
    const oldResponse = new Promise<Response>((resolve) => { resolveOld = resolve })
    vi.mocked(fetch).mockReturnValueOnce(oldResponse)
    const { result, rerender } = renderHook(
      ({ game }) => usePersonalizedMock(game, 'u1', 'TYT'),
      { initialProps: { game: 'matematik' as const } },
    )

    let pending!: Promise<unknown>
    act(() => { pending = result.current.generate() })
    rerender({ game: 'turkce' as never })
    resolveOld(response(PLAN))

    await expect(pending).resolves.toBeNull()
  })
})
