import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useBilgeTahtaEnabled } from '../client'

const previousFlag = process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED

afterEach(() => {
  if (previousFlag === undefined) delete process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED
  else process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED = previousFlag
  vi.unstubAllGlobals()
})

describe('Bilge Tahta client cohort access', () => {
  it('uses the global preview flag without a cohort request', () => {
    process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED = 'true'
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useBilgeTahtaEnabled())
    expect(result.current).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('enables an eligible server-side cohort member', async () => {
    process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED = 'false'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: true }),
    }))

    const { result } = renderHook(() => useBilgeTahtaEnabled())
    expect(result.current).toBe(false)
    await waitFor(() => expect(result.current).toBe(true))
    expect(fetch).toHaveBeenCalledWith('/api/bilge-tahta/access', expect.objectContaining({
      credentials: 'same-origin',
    }))
  })

  it('fails closed on malformed responses', async () => {
    process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED = 'false'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: 'true' }),
    }))

    const { result } = renderHook(() => useBilgeTahtaEnabled())
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(result.current).toBe(false)
  })
})
