'use client'

import { openConsentBanner } from '@/lib/consent'

export function CookiePrefsButton() {
  return (
    <button
      onClick={openConsentBanner}
      className="transition-colors hover:text-[var(--text)]"
    >
      Çerez Tercihleri
    </button>
  )
}
