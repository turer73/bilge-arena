import type { Json } from '@/types/database.generated'
import { isCurrentBrowserPathSensitive } from '@/lib/privacy/telemetry-policy'

// ─── Types ───────────────────────────────────────────────
export interface CookieConsent {
  essential: true // her zaman true
  analytics: boolean
  ads: boolean
  version: number
  date: string
}

export type ConsentType = 'cookie'

const STORAGE_KEY = 'bilge-arena-cookie-consent'
const CONSENT_VERSION = 2
export const COOKIE_CONSENT_CHANGED_EVENT = 'cookie-consent-changed'

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
    // v1 bundled advertising with analytics. Never infer advertising consent
    // from an old preference; require a fresh, granular choice.
    if (
      !parsed || typeof parsed !== 'object' || parsed.version !== CONSENT_VERSION
      || parsed.essential !== true || typeof parsed.analytics !== 'boolean'
      || typeof parsed.ads !== 'boolean' || typeof parsed.date !== 'string'
    ) return null
    return parsed as CookieConsent
  } catch {
    return null
  }
}

export function setCookieConsent({ analytics, ads }: Pick<CookieConsent, 'analytics' | 'ads'>): CookieConsent {
  const consent: CookieConsent = {
    essential: true,
    analytics,
    ads,
    version: CONSENT_VERSION,
    date: new Date().toISOString(),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(consent))

  // Analytics and advertising are independent Consent Mode v2 purposes.
  if (!isCurrentBrowserPathSensitive() && typeof window.gtag === 'function') {
    window.gtag('consent', 'update', {
      analytics_storage: analytics ? 'granted' : 'denied',
      ad_storage: ads ? 'granted' : 'denied',
      // No separate personalization choice exists, so never infer it.
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    })
  }

  window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGED_EVENT))
  // Supabase'e logla (fire-and-forget)
  logConsent('cookie', { essential: true, analytics, ads })

  return consent
}

export function clearCookieConsent() {
  localStorage.removeItem(STORAGE_KEY)
  window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGED_EVENT))
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
