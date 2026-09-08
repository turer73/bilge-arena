import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

import { useTodayPlan } from '../use-today-plan'
import { TODAY_PLAN_CONTENT_UNAVAILABLE } from '@/lib/study/today-plan-contract'

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

const UNAVAILABLE = {
  code: TODAY_PLAN_CONTENT_UNAVAILABLE, error: 'Private backend details must not be exposed',
  game: 'matematik', examRef: 'TYT', recovery: 'manual_practice',
}

function response(body: unknown, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: vi.fn(async () => body) } as unknown as Response
}

interface TodayPlanHookProps {
  userId: string
  examRef: string | null
  selectedCategory: string | null
  policyEpoch?: string | null
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
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...PLAN, examRef: 'LGS' }))

    const { result } = renderHook(() => useTodayPlan('matematik', 'u1', 'LGS'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(fetch).toHaveBeenCalledWith(
      '/api/study/today?game=matematik&exam_ref=LGS',
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    )
    expect(result.current.plan?.game).toBe('matematik')
    expect(result.current.plan?.examRef).toBe('LGS')
  })

  it.each(['TYT', null, 'bogus'])('explicit LGS request rejects returned exam %s', async (examRef) => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...PLAN, examRef }))
    const { result } = renderHook(() => useTodayPlan('matematik', 'u1', 'LGS'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.plan).toBeNull()
  })

  it.each(['YDT', 'bogus', undefined])('profile-resolved math rejects invalid exam %s', async (examRef) => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...PLAN, examRef }))
    const { result } = renderHook(() => useTodayPlan('matematik', 'u1', null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.plan).toBeNull()
  })

  it.each(['TYT', 'LGS', null])('omitted exam accepts valid server resolution %s', async (examRef) => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...PLAN, examRef }))
    const { result } = renderHook(() => useTodayPlan('matematik', 'u1', null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.plan?.examRef).toBe(examRef)
  })

  it('Wordquest only accepts null question exam scope', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...PLAN, game: 'wordquest', examRef: 'YDT' }))
    const { result } = renderHook(() => useTodayPlan('wordquest', 'u1', null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.plan).toBeNull()
  })

  it('matching but unsupported explicit game/exam pair is rejected', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...PLAN, examRef: 'YDT' }))
    const { result } = renderHook(() => useTodayPlan('matematik', 'u1', 'YDT'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.plan).toBeNull()
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

  it('policy epoch değişince planı yeniden bağlar ve eski completion PATCH sonucunu uygulamaz', async () => {
    let resolvePatch!: (value: Response) => void
    const patch = new Promise<Response>((resolve) => { resolvePatch = resolve })
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(PLAN))
      .mockReturnValueOnce(patch)
      .mockResolvedValueOnce(response(PLAN))

    const { result, rerender } = renderHook(
      ({ policyEpoch }) => useTodayPlan('matematik', 'u1', 'TYT', null, policyEpoch),
      { initialProps: { policyEpoch: 'policy-v1:epoch-a:questions_16_20' } },
    )
    await waitFor(() => expect(result.current.plan).not.toBeNull())
    act(() => { void result.current.markCompleted(['q1']) })
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(result.current.plan?.completedIds).toEqual([])

    rerender({ policyEpoch: 'policy-v1:epoch-b:questions_21_25' })
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(result.current.plan?.completedIds).toEqual([]))
    resolvePatch(response({ completedIds: ['q1'], items: [{ ...PLAN.items[0], completed: true }] }))
    await act(async () => { await Promise.resolve() })
    expect(result.current.plan?.completedIds).toEqual([])
  })

  it('aynı bağlamdaki out-of-order PATCH cevapları tamamlanmış soruları geri alamaz', async () => {
    const twoQuestionPlan = {
      ...PLAN,
      questions: [{ id: 'q1' }, { id: 'q2' }],
      items: [PLAN.items[0], { ...PLAN.items[0], questionId: 'q2', position: 2 }],
    }
    let resolveFirst!: (value: Response) => void
    let resolveSecond!: (value: Response) => void
    const first = new Promise<Response>((resolve) => { resolveFirst = resolve })
    const second = new Promise<Response>((resolve) => { resolveSecond = resolve })
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(twoQuestionPlan))
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second)
    const { result } = renderHook(() => useTodayPlan('matematik', 'u1', 'TYT'))
    await waitFor(() => expect(result.current.plan).not.toBeNull())
    act(() => {
      void result.current.markCompleted(['q1'])
      void result.current.markCompleted(['q2'])
    })
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    resolveSecond(response({ completedIds: ['q1', 'q2'], items: twoQuestionPlan.items.map(item => ({ ...item, completed: true })) }))
    await waitFor(() => expect(result.current.plan?.completedIds).toEqual(['q1', 'q2']))
    resolveFirst(response({ completedIds: ['q1'], items: [{ ...twoQuestionPlan.items[0], completed: true }] }))
    await Promise.resolve()
    expect(result.current.plan?.completedIds).toEqual(['q1', 'q2'])
  })

  it('PATCH hatasında optimistic completion iddiası üretmez', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(PLAN))
      .mockResolvedValueOnce(response({ error: 'failed' }, false, 500))
    const { result } = renderHook(() => useTodayPlan('matematik', 'u1', 'TYT'))
    await waitFor(() => expect(result.current.plan).not.toBeNull())
    await act(async () => { await result.current.markCompleted(['q1']) })
    expect(result.current.plan?.completedIds).toEqual([])
    expect(result.current.plan?.items[0].completed).toBe(false)
  })

  it('unmount sonrası geciken PATCH cevabı state yazmaz', async () => {
    let resolvePatch!: (value: Response) => void
    const patch = new Promise<Response>((resolve) => { resolvePatch = resolve })
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(PLAN))
      .mockReturnValueOnce(patch)
    const { result, unmount } = renderHook(() => useTodayPlan('matematik', 'u1', 'TYT'))
    await waitFor(() => expect(result.current.plan).not.toBeNull())
    act(() => { void result.current.markCompleted(['q1']) })
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    unmount()
    resolvePatch(response({ completedIds: ['q1'], items: [{ ...PLAN.items[0], completed: true }] }))
    await Promise.resolve()
    await Promise.resolve()
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

  it('typed 409 content-unavailable response exposes recovery state without retrying', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({
      code: TODAY_PLAN_CONTENT_UNAVAILABLE,
      error: 'Plan unavailable',
      game: 'matematik',
      examRef: 'TYT',
      recovery: 'manual_practice',
    }, false, 409))
    const { result } = renderHook(() => useTodayPlan('matematik', 'u1', 'TYT'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.plan).toBeNull()
    expect(result.current.unavailableReason).toBe(TODAY_PLAN_CONTENT_UNAVAILABLE)
    expect(result.current.unavailableExamRef).toBe('TYT')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('typed 409 accepts a profile-resolved exam when the request omitted exam_ref', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({
      code: TODAY_PLAN_CONTENT_UNAVAILABLE,
      error: 'Plan unavailable',
      game: 'matematik',
      examRef: 'TYT',
      recovery: 'manual_practice',
    }, false, 409))
    const { result } = renderHook(() => useTodayPlan('matematik', 'u1', null))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.unavailableReason).toBe(TODAY_PLAN_CONTENT_UNAVAILABLE)
    expect(result.current.unavailableExamRef).toBe('TYT')
  })

  it.each([
    ['wrong status', UNAVAILABLE, 500],
    ['wrong code', { ...UNAVAILABLE, code: 'unknown' }, 409],
    ['wrong game', { ...UNAVAILABLE, game: 'fen' }, 409],
    ['wrong exam', { ...UNAVAILABLE, examRef: 'LGS' }, 409],
    ['missing exam', { ...UNAVAILABLE, examRef: undefined }, 409],
    ['wrong recovery', { ...UNAVAILABLE, recovery: 'restart_plan' }, 409],
    ['malformed error', { ...UNAVAILABLE, error: {} }, 409],
  ] as const)('does not accept %s as confirmed unavailable content', async (_name, body, status) => {
    vi.mocked(fetch).mockResolvedValueOnce(response(body, false, status))
    const { result } = renderHook(() => useTodayPlan('matematik', 'u1', 'TYT'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.plan).toBeNull()
    expect(result.current.unavailableReason).toBeNull()
    expect(result.current.unavailableExamRef).toBeNull()
    expect(fetch).toHaveBeenCalledOnce()
  })

  it.each(CONTEXT_CHANGES)('clears unavailable state immediately on $context change', async ({ initial, next }) => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(UNAVAILABLE, false, 409))
      .mockResolvedValueOnce(response({ ...PLAN, examRef: next.examRef }))
    const { result, rerender } = renderHook(
      ({ userId, examRef, selectedCategory }: TodayPlanHookProps) => useTodayPlan('matematik', userId, examRef, selectedCategory),
      { initialProps: initial },
    )
    await waitFor(() => expect(result.current.unavailableReason).toBe(TODAY_PLAN_CONTENT_UNAVAILABLE))
    rerender(next)
    expect(result.current.unavailableReason).toBeNull()
    expect(result.current.unavailableExamRef).toBeNull()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.plan).not.toBeNull()
  })

  it('ignores stale 409 JSON resolved after a new user has a valid plan', async () => {
    let finishOldJson!: (value: unknown) => void
    const oldJson = vi.fn(() => new Promise(resolve => { finishOldJson = resolve }))
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: false, status: 409, json: oldJson } as unknown as Response)
      .mockResolvedValueOnce(response(PLAN))
    const { result, rerender } = renderHook(({ userId }) => useTodayPlan('matematik', userId, 'TYT'), {
      initialProps: { userId: 'u1' },
    })
    await waitFor(() => expect(oldJson).toHaveBeenCalledOnce())
    rerender({ userId: 'u2' })
    await waitFor(() => expect(result.current.plan).not.toBeNull())
    await act(async () => { finishOldJson(UNAVAILABLE) })
    expect(result.current.unavailableReason).toBeNull()
    expect(result.current.unavailableExamRef).toBeNull()
    expect(result.current.plan?.game).toBe('matematik')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('Wordquest rejects a non-null unavailable exam scope', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...UNAVAILABLE, game: 'wordquest', examRef: 'YDT' }, false, 409))
    const { result } = renderHook(() => useTodayPlan('wordquest', 'u1', null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.unavailableReason).toBeNull()
  })
})
