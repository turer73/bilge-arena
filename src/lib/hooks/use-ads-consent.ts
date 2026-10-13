'use client'

import { useSyncExternalStore } from 'react'
import { COOKIE_CONSENT_CHANGED_EVENT, getCookieConsent, syncCookieConsentFromStorageEvent } from '@/lib/consent'

const subscribers = new Set<() => void>()

function notifySubscribers(): void {
  subscribers.forEach((onChange) => onChange())
}

function onStorage(event: StorageEvent): void {
  // Apply the new grant in this document before React can mount GA/AdSense.
  syncCookieConsentFromStorageEvent(event)
  notifySubscribers()
}

function subscribe(onChange: () => void): () => void {
  if (subscribers.size === 0) {
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, notifySubscribers)
    window.addEventListener('storage', onStorage)
  }
  subscribers.add(onChange)
  return () => {
    subscribers.delete(onChange)
    if (subscribers.size === 0) {
      window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, notifySubscribers)
      window.removeEventListener('storage', onStorage)
    }
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
