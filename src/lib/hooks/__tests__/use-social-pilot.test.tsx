import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SOCIAL_DISCOVERY_DESCRIPTION, SOCIAL_DISCOVERY_LABEL } from '@/lib/diagnostic/social-pilot-public'
import { useSocialPilot } from '../use-social-pilot'

const payload = { supported: true, label: SOCIAL_DISCOVERY_LABEL,
  description: SOCIAL_DISCOVERY_DESCRIPTION, questionCount: 12, session: null }
const response = (body: unknown) => ({ ok: true, json: async () => body }) as Response
beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => vi.unstubAllGlobals())
describe('social pilot request lifecycle', () => {
  it('does not read an anonymous user session', () => {
    const { result } = renderHook(() => useSocialPilot(null))
    expect(fetch).not.toHaveBeenCalled()
    expect(result.current.response).toBeNull()
  })
  it('rejects an answer-bearing public payload', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ ...payload, answer: 1 }))
    const { result } = renderHook(() => useSocialPilot('user'))
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.response).toBeNull()
  })
  it('does not accept an old user response after account switch', async () => {
    let finish!: (value: Response) => void
    vi.mocked(fetch).mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
      .mockResolvedValueOnce(response({ ...payload, supported: false }))
    const { result, rerender } = renderHook(({ user }) => useSocialPilot(user), { initialProps: { user: 'old' } })
    rerender({ user: 'new' })
    await waitFor(() => expect(result.current.response?.supported).toBe(false))
    await act(async () => finish(response(payload)))
    expect(result.current.response?.supported).toBe(false)
  })
  it('suppresses duplicate submits while the first mutation is pending', async () => {
    let finish!: (value: Response) => void
    vi.mocked(fetch).mockResolvedValueOnce(response(payload))
      .mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const { result } = renderHook(() => useSocialPilot('user'))
    await waitFor(() => expect(result.current.response).toEqual(payload))
    let first!: Promise<boolean>
    act(() => { first = result.current.start() })
    await act(async () => expect(await result.current.start()).toBe(false))
    expect(fetch).toHaveBeenCalledTimes(2)
    await act(async () => { finish(response(payload)); expect(await first).toBe(true) })
  })
})
