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

function parseCookieConsent(raw: string | null): CookieConsent | null {
  try {
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

export function getCookieConsent(): CookieConsent | null {
  if (typeof window === 'undefined') return null
  try {
    return parseCookieConsent(localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

function updateConsentMode(consent: CookieConsent | null, previous: CookieConsent | null): void {
  if (isCurrentBrowserPathSensitive() || typeof window.gtag !== 'function') return

  window.gtag('consent', 'update', {
    analytics_storage: consent?.analytics === true ? 'granted' : 'denied',
    ad_storage: consent?.ads === true ? 'granted' : 'denied',
    // No separate personalization choice exists, so never infer it.
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  })
  // Queue the destination before the external analytics tag is mounted.
  if (consent?.analytics === true && previous?.analytics !== true) {
    window.gtag('js', new Date())
    window.gtag('config', 'G-HDCR9YRQJ3', {
      page_path: window.location.pathname,
      anonymize_ip: true,
    })
  }
}

/** Synchronize this document before a cross-tab grant mounts external scripts. */
export function syncCookieConsentFromStorageEvent(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY) return
  updateConsentMode(parseCookieConsent(event.newValue), parseCookieConsent(event.oldValue))
}

export function setCookieConsent({ analytics, ads }: Pick<CookieConsent, 'analytics' | 'ads'>): CookieConsent {
  const previous = getCookieConsent()
  const consent: CookieConsent = {
    essential: true,
    analytics,
    ads,
    version: CONSENT_VERSION,
    date: new Date().toISOString(),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(consent))

  // Analytics and advertising are independent Consent Mode v2 purposes.
  updateConsentMode(consent, previous)

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
