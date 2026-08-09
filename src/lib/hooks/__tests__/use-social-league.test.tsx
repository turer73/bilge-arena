import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSocialLeague } from '../use-social-league'

const waiting = {
  status: 'waiting',
  optedIn: true,
  effectiveWeekStart: '2026-08-10',
  week: null,
  entries: [],
  privacy: { bottomHidden: true, sessionCap: 15, dailyCap: 30 },
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('useSocialLeague', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads the owner-scoped result without browser caching', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(waiting))
    const { result } = renderHook(() => useSocialLeague())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.result?.status).toBe('waiting')
    expect(fetchMock).toHaveBeenCalledWith('/api/social/league', expect.objectContaining({
      cache: 'no-store',
    }))
  })

  it('reuses the request UUID after a lost preference response, then refreshes', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(waiting))
      .mockResolvedValueOnce(jsonResponse({ error: 'lost' }, 500))
      .mockResolvedValueOnce(jsonResponse({
        optedIn: false,
        effectiveWeekStart: '2026-08-17',
        replayed: true,
      }))
      .mockResolvedValueOnce(jsonResponse({
        ...waiting,
        optedIn: false,
        effectiveWeekStart: '2026-08-17',
      }))

    const { result } = renderHook(() => useSocialLeague())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      expect(await result.current.updatePreference(false)).toBe(false)
    })
    await act(async () => {
      expect(await result.current.updatePreference(false)).toBe(true)
    })

    const firstBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))
    const retryBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))
    expect(firstBody.requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(retryBody.requestId).toBe(firstBody.requestId)
    expect(result.current.result?.optedIn).toBe(false)
  })
})
