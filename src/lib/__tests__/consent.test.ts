import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getCookieConsent,
  setCookieConsent,
  clearCookieConsent,
  openConsentBanner,
  logConsent,
} from '../consent'

const supabaseMocks = vi.hoisted(() => ({
  insert: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ insert: supabaseMocks.insert }),
  }),
}))

// ─── localStorage mock ─────────────────────────────────

const store: Record<string, string> = {}

beforeEach(() => {
  supabaseMocks.insert.mockReset().mockResolvedValue({ error: null })
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
      version: 1,
      date: '2024-01-01T00:00:00.000Z',
    }
    store['bilge-arena-cookie-consent'] = JSON.stringify(consent)

    const result = getCookieConsent()
    expect(result).toEqual(consent)
    expect(result!.essential).toBe(true)
    expect(result!.analytics).toBe(true)
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
    const result = setCookieConsent(true)

    expect(result.essential).toBe(true)
    expect(result.analytics).toBe(true)
    expect(result.version).toBe(1)
    expect(result.date).toBeTruthy()

    // localStorage'a yazildi mi?
    const saved = JSON.parse(store['bilge-arena-cookie-consent'])
    expect(saved.analytics).toBe(true)
  })

  it('analytics reddedilince denied olmali', () => {
    const result = setCookieConsent(false)
    expect(result.analytics).toBe(false)

    const saved = JSON.parse(store['bilge-arena-cookie-consent'])
    expect(saved.analytics).toBe(false)
  })

  it('GA consent mode guncellemeli (granted)', () => {
    setCookieConsent(true)
    expect(window.gtag).toHaveBeenCalledWith('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
    })
  })

  it('GA consent mode guncellemeli (denied)', () => {
    setCookieConsent(false)
    expect(window.gtag).toHaveBeenCalledWith('consent', 'update', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
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
  it('gecerli nested JSON degerini consent_logs tablosuna yazmali', async () => {
    await logConsent('kvkk', { accepted: true, context: [null, 'signup', { version: 1 }] }, 'user-1')

    expect(supabaseMocks.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      consent_type: 'kvkk',
      consent_value: { accepted: true, context: [null, 'signup', { version: 1 }] },
      user_agent: 'test-agent',
    })
  })

  it('JSON olmayan degerleri veritabanina gondermemeli', async () => {
    await logConsent('terms', { invalid: () => true })

    expect(supabaseMocks.insert).not.toHaveBeenCalled()
  })
})
