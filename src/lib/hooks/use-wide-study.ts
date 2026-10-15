'use client'

import { useSyncExternalStore } from 'react'
const QUERY = '(min-width: 768px)'
function subscribe(listener: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {}
  const media = window.matchMedia(QUERY)
  media.addEventListener('change', listener)
  return () => media.removeEventListener('change', listener)
}
const snapshot = () => typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches
const serverSnapshot = () => false

/** Keep the established mobile tree intact; only mount the wide-screen view at 768px+. */
export function useWideStudy() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}
