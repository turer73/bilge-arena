import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTeamBoss } from '../use-team-boss'

const waiting = {
  status: 'waiting',
  weekStart: null,
  boss: null,
  team: null,
  privacy: {
    cohortOnly: true,
    individualsHidden: true,
    verifiedOnly: true,
    rewardFree: true,
  },
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('useTeamBoss', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads the owner aggregate without browser caching', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(waiting))
    const { result } = renderHook(() => useTeamBoss())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.result?.status).toBe('waiting')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/social/league/team-boss',
      expect.objectContaining({ cache: 'no-store' }),
    )
  })

  it('keeps failed payloads out of state and can retry', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'failed' }, 500))
      .mockResolvedValueOnce(jsonResponse(waiting))
    const { result } = renderHook(() => useTeamBoss())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.result).toBeNull()
    expect(result.current.error).toMatch(/alınamıyor/)

    await act(async () => result.current.refresh())
    expect(result.current.result?.status).toBe('waiting')
    expect(result.current.error).toBeNull()
  })

  it('aborts the initial owner request when the component unmounts', () => {
    fetchMock.mockImplementationOnce(() => new Promise(() => undefined))
    const { unmount } = renderHook(() => useTeamBoss())
    const signal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal
    expect(signal.aborted).toBe(false)
    unmount()
    expect(signal.aborted).toBe(true)
  })
})
