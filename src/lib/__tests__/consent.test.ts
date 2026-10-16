// @vitest-environment jsdom
// .ts testleri varsayilan olarak node ortaminda kosar; bu dosya window olaylari, location ve localStorage ile calisir.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  COOKIE_CONSENT_CHANGED_EVENT,
  getCookieConsent,
  setCookieConsent,
  clearCookieConsent,
  openConsentBanner,
  logConsent,
  beginLegalConsentIntent,
} from '../consent'

const fetchMock = vi.fn()

// ─── localStorage mock ─────────────────────────────────

const store: Record<string, string> = {}

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  Object.keys(store).forEach(key => delete store[key])

  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
  })

  // gtag mock
  vi.stubGlobal('gtag', vi.fn())

  // navigator mock
  vi.stubGlobal('navigator', { userAgent: 'test-agent' })
})

// ─── getCookieConsent ──────────────────────────────────

describe('getCookieConsent', () => {
  it('veri yokken null dondurmeli', () => {
    expect(getCookieConsent()).toBeNull()
  })

  it('gecerli consent objesini dondurmeli', () => {
    const consent = {
      essential: true,
      analytics: true,
      ads: false,
      version: 2,
      date: '2024-01-01T00:00:00.000Z',
    }
    store['bilge-arena-cookie-consent'] = JSON.stringify(consent)

    const result = getCookieConsent()
    expect(result).toEqual(consent)
    expect(result!.essential).toBe(true)
    expect(result!.analytics).toBe(true)
    expect(result!.ads).toBe(false)
  })

  it('eski birlesik analitik/reklam iznini yeni reklam izni saymamali', () => {
    store['bilge-arena-cookie-consent'] = JSON.stringify({
      essential: true, analytics: true, version: 1, date: '2026-05-17T00:00:00.000Z',
    })
    expect(getCookieConsent()).toBeNull()
  })

  it('eski string format icin null dondurmeli', () => {
    store['bilge-arena-cookie-consent'] = JSON.stringify('accepted')
    expect(getCookieConsent()).toBeNull()
  })

  it('bozuk JSON icin null dondurmeli', () => {
    store['bilge-arena-cookie-consent'] = 'bozuk{json'
    expect(getCookieConsent()).toBeNull()
  })
})

// ─── setCookieConsent ──────────────────────────────────

describe('setCookieConsent', () => {
  it('analytics kabul edilince dogru kaydetmeli', () => {
    const result = setCookieConsent({ analytics: true, ads: false })

    expect(result.essential).toBe(true)
    expect(result.analytics).toBe(true)
    expect(result.ads).toBe(false)
    expect(result.version).toBe(2)
    expect(result.date).toBeTruthy()

    // localStorage'a yazildi mi?
    const saved = JSON.parse(store['bilge-arena-cookie-consent'])
    expect(saved.analytics).toBe(true)
  })

  it('analytics reddedilince denied olmali', () => {
    const result = setCookieConsent({ analytics: false, ads: false })
    expect(result.analytics).toBe(false)

    const saved = JSON.parse(store['bilge-arena-cookie-consent'])
    expect(saved.analytics).toBe(false)
  })

  it('GA consent mode guncellemeli (granted)', () => {
    setCookieConsent({ analytics: true, ads: false })
    expect(window.gtag).toHaveBeenCalledWith('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    })
    expect(window.gtag).toHaveBeenCalledWith('config', 'G-HDCR9YRQJ3', expect.objectContaining({
      anonymize_ip: true,
    }))
  })

  it('analitik hedefini izin olayindan once siraya koymali', () => {
    const onChange = () => window.gtag('event', 'MarketingCtaClicked')
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, onChange)
    try {
      setCookieConsent({ analytics: true, ads: false })
      const calls = vi.mocked(window.gtag).mock.calls
      expect(calls.findIndex((call) => call[0] === 'config'))
        .toBeLessThan(calls.findIndex((call) => call[0] === 'event'))
    } finally {
      window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, onChange)
    }
  })

  it('reklam iznini analitikten bagimsiz guncellemeli', () => {
    setCookieConsent({ analytics: false, ads: true })
    expect(window.gtag).toHaveBeenCalledWith('consent', 'update', {
      analytics_storage: 'denied',
      ad_storage: 'granted',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    })
  })
})

// ─── clearCookieConsent ────────────────────────────────

describe('clearCookieConsent', () => {
  it('localStorage\'dan silmeli', () => {
    store['bilge-arena-cookie-consent'] = '{"test": true}'
    clearCookieConsent()
    expect(store['bilge-arena-cookie-consent']).toBeUndefined()
  })
})

// ─── openConsentBanner ─────────────────────────────────

describe('openConsentBanner', () => {
  it('custom event dispatchemeli', () => {
    const listener = vi.fn()
    window.addEventListener('open-consent-banner', listener)

    openConsentBanner()
    expect(listener).toHaveBeenCalledTimes(1)

    window.removeEventListener('open-consent-banner', listener)
  })
})

describe('logConsent', () => {
  it('gecerli cerez tercihini server consent sinirina gondermeli', async () => {
    await logConsent('cookie', { essential: true, analytics: false, ads: false })

    expect(fetchMock).toHaveBeenCalledWith('/api/consent', {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'cookie',
        value: { essential: true, analytics: false, ads: false },
      }),
    })
  })

  it('JSON olmayan degerleri veritabanina gondermemeli', async () => {
    await logConsent('cookie', { invalid: () => true })

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('beginLegalConsentIntent', () => {
  it('returns only a valid server-issued token', async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ ok: true, token: 'signed-legal-consent-token-that-is-long-enough' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))

    await expect(beginLegalConsentIntent()).resolves.toBe(
      'signed-legal-consent-token-that-is-long-enough',
    )
    expect(fetchMock).toHaveBeenCalledWith('/api/consent/intent', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
    })
  })

  it('fails closed for unavailable or malformed intent responses', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }))
    await expect(beginLegalConsentIntent()).rejects.toThrow('legal_consent_intent_unavailable')

    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ ok: true, token: 'short' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    await expect(beginLegalConsentIntent()).rejects.toThrow('legal_consent_intent_invalid')
  })
})
