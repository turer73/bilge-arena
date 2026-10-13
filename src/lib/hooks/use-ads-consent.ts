'use client'

import { useSyncExternalStore } from 'react'
import { COOKIE_CONSENT_CHANGED_EVENT, getCookieConsent } from '@/lib/consent'

function subscribe(onChange: () => void): () => void {
  window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

export function useAdsConsent(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => getCookieConsent()?.ads === true,
    () => false,
  )
}

export function useAnalyticsConsent(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => getCookieConsent()?.analytics === true,
    () => false,
  )
}
