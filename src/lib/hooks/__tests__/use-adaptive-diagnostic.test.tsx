import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useAdaptiveDiagnostic } from '../use-adaptive-diagnostic'

const QUESTION = {
  id: '20000000-0000-4000-8000-000000000001',
  game: 'matematik',
  category: 'sayilar',
  subcategory: null,
  topic: null,
  difficulty: 3,
  level_tag: null,
  base_points: 30,
  content: { question: '2 + 2?', options: ['3', '4', '5', '6'] },
}

function payload(game = 'matematik', examRef: string | null = 'TYT') {
  return {
    supported: true,
    game,
    examRef,
    policy: { version: 'adaptive-diagnostic-v3', questionCount: 10, outcomeCount: 6, maxPerOutcome: 2 },
    session: {
      id: '22222222-3333-4444-8555-666666666666',
      kind: 'initial',
      status: 'active',
      expiresAt: '2099-08-08T12:00:00.000Z',
      progress: { answered: 0, total: 10, coveredOutcomes: 0, totalOutcomes: 6 },
      question: QUESTION,
    },
    summary: null,
  }
}

function fetchResponse(body: unknown, ok = true) {
  return { ok, json: vi.fn(async () => body) } as unknown as Response
}

describe('useAdaptiveDiagnostic', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
  afterEach(() => vi.unstubAllGlobals())

  it('normalizes scope and accepts an exact runtime-validated response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(fetchResponse(payload()))
    const { result } = renderHook(() => useAdaptiveDiagnostic('matematik', 'u1', 'tyt'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetch).toHaveBeenCalledWith(
      '/api/study/diagnostic?game=matematik&exam_ref=TYT',
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    )
    expect(result.current.session?.question?.id).toBe(QUESTION.id)
  })

  it('does not fetch without a user and clears old context', async () => {
    const { result } = renderHook(() => useAdaptiveDiagnostic('matematik', null, 'TYT'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetch).not.toHaveBeenCalled()
    expect(result.current.response).toBeNull()
  })

  it('posts strict start and answer commands and applies their response', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(fetchResponse(payload()))
      .mockResolvedValueOnce(fetchResponse(payload()))
      .mockResolvedValueOnce(fetchResponse(payload()))
    const { result } = renderHook(() => useAdaptiveDiagnostic('matematik', 'u1', 'TYT'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { expect(await result.current.start()).toBe(true) })
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/study/diagnostic', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ action: 'start', game: 'matematik', examRef: 'TYT' }),
    }))

    const answer = {
      sessionId: payload().session.id,
      questionId: QUESTION.id,
      selectedOption: 1,
      responseTimeMs: 1200,
      requestId: '33333333-4444-4555-8666-777777777777',
    }
    await act(async () => { expect(await result.current.answer(answer)).toBe(true) })
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/study/diagnostic', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ action: 'answer', ...answer }),
    }))
  })

  it('rejects extra/internal fields and mismatched scope at runtime', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(fetchResponse({ ...payload(), userId: 'secret' }))
      .mockResolvedValueOnce(fetchResponse(payload('fen')))
    const { result, rerender } = renderHook(
      ({ game }) => useAdaptiveDiagnostic(game, 'u1', 'TYT'),
      { initialProps: { game: 'matematik' as const } },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('load')
    expect(result.current.response).toBeNull()

    rerender({ game: 'fen' as never })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.response).toBeNull()
  })

  it('prevents a late request from overwriting the newer scope', async () => {
    let resolveOld!: (value: Response) => void
    const old = new Promise<Response>((resolve) => { resolveOld = resolve })
    vi.mocked(fetch).mockImplementation((request) => (
      String(request).includes('game=matematik')
        ? old
        : Promise.resolve(fetchResponse({
          supported: false,
          game: 'fen',
          examRef: 'TYT',
          policy: null,
          session: null,
          summary: null,
        }))
    ))
    const { result, rerender } = renderHook(
      ({ game }) => useAdaptiveDiagnostic(game, 'u1', 'TYT'),
      { initialProps: { game: 'matematik' as const } },
    )
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    rerender({ game: 'fen' as never })
    await waitFor(() => expect(result.current.response?.game).toBe('fen'))
    resolveOld(fetchResponse(payload()))
    await Promise.resolve()
    expect(result.current.response?.game).toBe('fen')
  })

  it('keeps the current safe state while exposing an action error for retry', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(fetchResponse(payload()))
      .mockResolvedValueOnce(fetchResponse({ error: 'fail' }, false))
    const { result } = renderHook(() => useAdaptiveDiagnostic('matematik', 'u1', 'TYT'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { expect(await result.current.start()).toBe(false) })
    expect(result.current.error).toBe('action')
    expect(result.current.session?.id).toBe(payload().session.id)
  })
})
