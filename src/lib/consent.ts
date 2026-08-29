import type { Json } from '@/types/database.generated'
import { isCurrentBrowserPathSensitive } from '@/lib/privacy/telemetry-policy'

// ─── Types ───────────────────────────────────────────────
export interface CookieConsent {
  essential: true // her zaman true
  analytics: boolean
  version: number
  date: string
}

export type ConsentType = 'cookie'

const STORAGE_KEY = 'bilge-arena-cookie-consent'
const CONSENT_VERSION = 1

function isJson(value: unknown): value is Json {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true
  }

  if (Array.isArray(value)) {
    return value.every(isJson)
  }

  if (typeof value === 'object') {
    return Object.values(value).every((entry) => entry === undefined || isJson(entry))
  }

  return false
}

// ─── localStorage helpers ────────────────────────────────

export function getCookieConsent(): CookieConsent | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Eski format uyumlulugu ('accepted' string)
    if (typeof parsed === 'string') return null
    return parsed as CookieConsent
  } catch {
    return null
  }
}

export function setCookieConsent(analytics: boolean): CookieConsent {
  const consent: CookieConsent = {
    essential: true,
    analytics,
    version: CONSENT_VERSION,
    date: new Date().toISOString(),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(consent))

  // GA Consent Mode v2 guncelle — analytics + reklam depolama birlikte
  if (!isCurrentBrowserPathSensitive() && typeof window.gtag === 'function') {
    window.gtag('consent', 'update', {
      analytics_storage: analytics ? 'granted' : 'denied',
      ad_storage: analytics ? 'granted' : 'denied',
      ad_user_data: analytics ? 'granted' : 'denied',
      ad_personalization: analytics ? 'granted' : 'denied',
    })
  }

  // Supabase'e logla (fire-and-forget)
  logConsent('cookie', { essential: true, analytics })

  return consent
}

export function clearCookieConsent() {
  localStorage.removeItem(STORAGE_KEY)
}

// ─── Banner acma event'i ─────────────────────────────────

export function openConsentBanner() {
  window.dispatchEvent(new Event('open-consent-banner'))
}

// ─── Supabase consent log ────────────────────────────────

export async function logConsent(
  type: ConsentType,
  value: Record<string, unknown>,
) {
  try {
    if (!isJson(value)) return

    await fetch('/api/consent', {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        value,
      }),
    })
  } catch {
    // Consent log basarisiz olursa kullanici deneyimini bozma
  }
}

/**
 * Sunucunun imzaladığı, kısa ömürlü hukuki kabul niyetini oluşturur. Token
 * yalnız OAuth/magic-link callback'inde gerçek oturum kullanıcısına bağlanır.
 */
export async function beginLegalConsentIntent(): Promise<string> {
  const response = await fetch('/api/consent/intent', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!response.ok) throw new Error('legal_consent_intent_unavailable')
  const body: unknown = await response.json()
  if (
    !body
    || typeof body !== 'object'
    || !('token' in body)
    || typeof body.token !== 'string'
    || body.token.length < 32
  ) {
    throw new Error('legal_consent_intent_invalid')
  }
  return body.token
}
