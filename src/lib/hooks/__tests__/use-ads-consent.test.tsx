import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAdsConsent, useAnalyticsConsent } from '../use-ads-consent'

const STORAGE_KEY = 'bilge-arena-cookie-consent'

function choice(analytics: boolean, ads: boolean): string {
  return JSON.stringify({ essential: true, analytics, ads, version: 2, date: '2026-10-13T00:00:00.000Z' })
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('gtag', vi.fn())
  window.history.replaceState(null, '', '/')
})

describe('cross-tab consent', () => {
  it('queues the GA grant and configuration once before notifying both hooks', () => {
    const { result } = renderHook(() => ({
      analytics: useAnalyticsConsent(),
      ads: useAdsConsent(),
    }))
    expect(result.current).toEqual({ analytics: false, ads: false })

    const granted = choice(true, false)
    act(() => {
      localStorage.setItem(STORAGE_KEY, granted)
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, oldValue: null, newValue: granted }))
    })

    expect(result.current).toEqual({ analytics: true, ads: false })
    expect(window.gtag).toHaveBeenCalledWith('consent', 'update', {
      analytics_storage: 'granted', ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied',
    })
    expect(vi.mocked(window.gtag).mock.calls.filter((call) => call[0] === 'config')).toHaveLength(1)
  })

  it('applies a cross-tab revocation without reconfiguring GA', () => {
    const oldValue = choice(true, true)
    localStorage.setItem(STORAGE_KEY, oldValue)
    const { result } = renderHook(() => ({
      analytics: useAnalyticsConsent(),
      ads: useAdsConsent(),
    }))

    const newValue = choice(false, false)
    act(() => {
      localStorage.setItem(STORAGE_KEY, newValue)
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, oldValue, newValue }))
    })

    expect(result.current).toEqual({ analytics: false, ads: false })
    expect(window.gtag).toHaveBeenCalledWith('consent', 'update', {
      analytics_storage: 'denied', ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied',
    })
    expect(vi.mocked(window.gtag).mock.calls.some((call) => call[0] === 'config')).toBe(false)
  })
})
