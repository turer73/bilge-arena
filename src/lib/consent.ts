import { createClient } from '@/lib/supabase/client'

// ─── Types ───────────────────────────────────────────────
export interface CookieConsent {
  essential: true // her zaman true
  analytics: boolean
  version: number
  date: string
}

export type ConsentType = 'cookie' | 'terms' | 'kvkk'

const STORAGE_KEY = 'bilge-arena-cookie-consent'
const CONSENT_VERSION = 1

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

  // GA Consent Mode guncelle
  if (typeof window.gtag === 'function') {
    window.gtag('consent', 'update', {
      analytics_storage: analytics ? 'granted' : 'denied',
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
  userId?: string
) {
  try {
    const supabase = createClient()
    await supabase.from('consent_logs').insert({
      user_id: userId ?? null,
      consent_type: type,
      consent_value: value,
      user_agent: navigator.userAgent,
    })
  } catch {
    // Consent log basarisiz olursa kullanici deneyimini bozma
  }
}
