import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTodayPlan } from '../use-today-plan'

const PLAN = {
  planDate: '2026-09-06', game: 'matematik', examRef: 'TYT',
  questions: [{ id: 'q1' }], completedIds: [],
  items: [{ questionId: 'q1', position: 1, slotType: 'due', sourceType: 'due', sourceLabel: 'Tekrar', completed: false }],
  attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', expiresAt: '2099-01-01T00:00:00.000Z',
}
const response = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response

describe('daily-plan acknowledgement identity', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
  afterEach(() => vi.unstubAllGlobals())

  it.each([null, {}, { completedIds: 'q1' }, { completedIds: ['q1', 'outside'] }])(
    'does not accept malformed or out-of-plan completion: %j', async (body) => {
      vi.mocked(fetch).mockResolvedValueOnce(response(PLAN)).mockResolvedValueOnce(response(body))
      const { result } = renderHook(() => useTodayPlan('matematik', 'u1', 'TYT'))
      await waitFor(() => expect(result.current.plan).not.toBeNull())
      await act(async () => { await result.current.markCompleted(['q1']) })
      expect(result.current.completedCount).toBe(0)
      expect(result.current.plan?.items[0].completed).toBe(false)
    },
  )

  it('does not apply an old acknowledgement to a new day in the same hook context', async () => {
    let resolvePatch!: (value: Response) => void
    const patch = new Promise<Response>(resolve => { resolvePatch = resolve })
    vi.mocked(fetch).mockResolvedValueOnce(response(PLAN)).mockReturnValueOnce(patch)
      .mockResolvedValueOnce(response({ ...PLAN, planDate: '2026-09-07' }))
    const { result } = renderHook(() => useTodayPlan('matematik', 'u1', 'TYT'))
    await waitFor(() => expect(result.current.plan).not.toBeNull())
    let completion!: Promise<void>
    act(() => { completion = result.current.markCompleted(['q1']) })
    await act(async () => { await result.current.fetchPlan() })
    expect(result.current.plan?.planDate).toBe('2026-09-07')
    await act(async () => { resolvePatch(response({ completedIds: ['q1'] })); await completion })
    expect(result.current.completedCount).toBe(0)
    expect(result.current.plan?.items[0].completed).toBe(false)
  })

  it('rejects an old PATCH even when the client context returns A to B to A', async () => {
    let resolvePatch!: (value: Response) => void
    const patch = new Promise<Response>(resolve => { resolvePatch = resolve })
    vi.mocked(fetch).mockResolvedValueOnce(response(PLAN)).mockReturnValueOnce(patch)
      .mockResolvedValue(response(PLAN))
    const { result, rerender } = renderHook(({ epoch }) => useTodayPlan('matematik', 'u1', 'TYT', null, epoch), {
      initialProps: { epoch: 'A' },
    })
    await waitFor(() => expect(result.current.plan).not.toBeNull())
    let completion!: Promise<void>
    act(() => { completion = result.current.markCompleted(['q1']) })
    rerender({ epoch: 'B' })
    await waitFor(() => expect(result.current.loading).toBe(false))
    rerender({ epoch: 'A' })
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { resolvePatch(response({ completedIds: ['q1'] })); await completion })
    expect(result.current.completedCount).toBe(0)
    expect(result.current.plan?.items[0].completed).toBe(false)
  })
})
