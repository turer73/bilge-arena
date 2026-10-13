'use client'

import { openConsentBanner } from '@/lib/consent'

export function CookiePrefsButton() {
  return (
    <button
      onClick={openConsentBanner}
      className="font-medium text-[var(--focus-text)] underline underline-offset-2 transition-colors hover:text-[var(--text)]"
    >
      Çerez Tercihleri
    </button>
  )
}
