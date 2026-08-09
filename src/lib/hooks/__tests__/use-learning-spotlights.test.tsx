import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLearningSpotlights } from '../use-learning-spotlights'

const emptyBoard = { me: { eligible: false, rank: null, value: null }, entries: [] }
const waiting = {
  status: 'waiting',
  weekStart: null,
  boards: { improved: emptyBoard, consistent: emptyBoard, comeback: emptyBoard },
  privacy: {
    cohortOnly: true,
    positiveOnly: true,
    verifiedOnly: true,
    fullTableHidden: true,
  },
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('useLearningSpotlights', () => {
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
    const { result } = renderHook(() => useLearningSpotlights())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.result?.status).toBe('waiting')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/social/league/spotlights',
      expect.objectContaining({ cache: 'no-store' }),
    )
  })

  it('keeps a failed response out of state and can retry', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'failed' }, 500))
      .mockResolvedValueOnce(jsonResponse(waiting))
    const { result } = renderHook(() => useLearningSpotlights())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.result).toBeNull()
    expect(result.current.error).toMatch(/alınamıyor/)

    await act(async () => result.current.refresh())
    expect(result.current.result?.status).toBe('waiting')
    expect(result.current.error).toBeNull()
  })
})
