import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

const auth = vi.hoisted(() => ({ value: { user: { id: 'user-1' } } }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => auth.value }))

import { useTytSocialExamPolicy } from '../use-tyt-social-exam-policy'

const policy = {
  status: 'setup_required', policyVersion: 'tyt-social-2026-v1',
  rulesSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  appliesTo: 'new_artifacts_only',
}
const active = {
  status: 'active', policyVersion: 'tyt-social-2026-v1', variant: 'questions_21_25',
  effectiveAt: '2026-08-31T08:00:00+00:00', appliesTo: 'new_artifacts_only', replayed: false,
}

afterEach(() => {
  vi.restoreAllMocks()
  auth.value = { user: { id: 'user-1' } }
})

describe('useTytSocialExamPolicy', () => {
  test('only fetches for an authenticated sosyal/TYT context', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => policy })
    vi.stubGlobal('fetch', fetchMock)

    const ineligible = renderHook(() => useTytSocialExamPolicy({ game: 'fen', examRef: 'TYT' }))
    expect(ineligible.result.current.eligible).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    ineligible.unmount()

    const eligible = renderHook(() => useTytSocialExamPolicy({ game: 'sosyal', examRef: 'TYT' }))
    await waitFor(() => expect(eligible.result.current.status).toBe('setup_required'))
    expect(eligible.result.current.policyVersion).toBe('tyt-social-2026-v1')
    expect(eligible.result.current.selectionEffectiveAt).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith('/api/profile/exam-policy/tyt-social', expect.objectContaining({
      credentials: 'same-origin', cache: 'no-store', signal: expect.any(AbortSignal),
    }))
  })

  test('invalid or failed GET is fail-closed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'active' }) }))
    const { result } = renderHook(() => useTytSocialExamPolicy({ game: 'sosyal', examRef: 'TYT' }))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.variantCode).toBeNull()
    expect(result.current.policyVersion).toBeNull()
    expect(result.current.selectionEffectiveAt).toBeNull()
    expect(result.current.error).toBeTruthy()
  })

  test('reuses one request id for an uncertain PUT retry', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => policy })
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce({ ok: true, json: async () => policy })
      .mockResolvedValueOnce({ ok: true, json: async () => active })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'request-1') })

    const { result } = renderHook(() => useTytSocialExamPolicy({ game: 'sosyal', examRef: 'TYT' }))
    await waitFor(() => expect(result.current.status).toBe('setup_required'))
    await act(async () => { await result.current.saveSelection('questions_21_25') })
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.status).toBe('setup_required'))
    await act(async () => { await result.current.saveSelection('questions_21_25') })

    const firstPut = fetchMock.mock.calls[1]
    const secondPut = fetchMock.mock.calls[3]
    expect(JSON.parse(firstPut[1].body as string)).toMatchObject({ variant: 'questions_21_25', requestId: 'request-1' })
    expect(JSON.parse(secondPut[1].body as string)).toMatchObject({ variant: 'questions_21_25', requestId: 'request-1' })
    expect(secondPut[1].headers['X-Idempotency-Key']).toBe('request-1')
    expect(result.current.status).toBe('active')
    expect(result.current.policyVersion).toBe('tyt-social-2026-v1')
    expect(result.current.selectionEffectiveAt).toBe('2026-08-31T08:00:00+00:00')
  })

  test('ignores stale response after context changes', async () => {
    let resolveFirst!: (value: Response) => void
    const first = new Promise<Response>((resolve) => { resolveFirst = resolve })
    const fetchMock = vi.fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ ok: true, json: async () => active })
    vi.stubGlobal('fetch', fetchMock)
    const { result, rerender } = renderHook(
      ({ game }) => useTytSocialExamPolicy({ game, examRef: 'TYT' }),
      { initialProps: { game: 'sosyal' } },
    )
    rerender({ game: 'fen' })
    resolveFirst({ ok: true, json: async () => policy } as Response)
    await waitFor(() => expect(result.current.status).toBe('inactive'))
    expect(result.current.variantCode).toBeNull()
    expect(result.current.selectionEffectiveAt).toBeNull()
  })

  test('rejects a future policy version until its client contract ships', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...active, policyVersion: 'tyt-social-2027-v2' }),
    }))
    const { result } = renderHook(() => useTytSocialExamPolicy({ game: 'sosyal', examRef: 'TYT' }))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.variantCode).toBeNull()
    expect(result.current.selectionEffectiveAt).toBeNull()
  })
})
