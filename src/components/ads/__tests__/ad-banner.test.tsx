import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COOKIE_CONSENT_CHANGED_EVENT } from '@/lib/consent'

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_ADSENSE_ID = 'ca-pub-test'
  process.env.NEXT_PUBLIC_ADSENSE_SLOT_LOBBY = '1234567890'
})
vi.mock('next/navigation', () => ({ usePathname: () => '/arena' }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => ({ profile: null }) }))

import { AdBanner } from '../ad-banner'

describe('AdBanner consent boundary', () => {
  beforeEach(() => {
    localStorage.clear()
    delete (window as Window & { adsbygoogle?: unknown[] }).adsbygoogle
  })

  afterEach(() => cleanup())

  it('does not render or request an ad before a separate v2 grant', () => {
    const { container } = render(<AdBanner slot="lobby" />)
    expect(container.querySelector('ins.adsbygoogle')).toBeNull()
    expect((window as Window & { adsbygoogle?: unknown[] }).adsbygoogle).toBeUndefined()

    localStorage.setItem('bilge-arena-cookie-consent', JSON.stringify({
      essential: true, analytics: true, version: 1, date: new Date().toISOString(),
    }))
    act(() => window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGED_EVENT)))
    expect(container.querySelector('ins.adsbygoogle')).toBeNull()
  })

  it('renders and requests an ad only after explicit advertising consent', () => {
    const { container } = render(<AdBanner slot="lobby" />)
    localStorage.setItem('bilge-arena-cookie-consent', JSON.stringify({
      essential: true, analytics: false, ads: true, version: 2, date: new Date().toISOString(),
    }))
    act(() => window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGED_EVENT)))

    expect(container.querySelector('ins.adsbygoogle')).not.toBeNull()
    expect((window as Window & { adsbygoogle?: unknown[] }).adsbygoogle).toHaveLength(1)
    expect((window as Window & { adsbygoogle?: unknown[] & { requestNonPersonalizedAds?: number } })
      .adsbygoogle?.requestNonPersonalizedAds).toBe(1)
  })
})
