'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const COOKIE_CONSENT_KEY = 'bilge-arena-cookie-consent'

export function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // localStorage'da onay yoksa banner goster
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY)
    if (!consent) {
      // Sayfa yuklenince hemen degil, kisa bir gecikmeyle goster (UX)
      const timer = setTimeout(() => setVisible(true), 1500)
      return () => clearTimeout(timer)
    }
  }, [])

  const accept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted')
    setVisible(false)

    // Google Analytics Consent Mode — onay verildi, tam veri toplama baslat
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        analytics_storage: 'granted',
      })
    }
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--border)] bg-[var(--card-bg)] px-4 py-4 shadow-lg backdrop-blur-sm sm:px-6">
      <div className="mx-auto flex max-w-[1200px] flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-[var(--text-muted)] sm:text-sm">
          Bu site, deneyiminizi iyileştirmek için zorunlu çerezler ve analitik araçlar kullanır.
          Detaylar için{' '}
          <Link
            href="/cerez-politikasi"
            className="font-medium text-[var(--focus)] underline underline-offset-2"
          >
            Çerez Politikamızı
          </Link>{' '}
          inceleyebilirsiniz.
        </p>
        <button
          onClick={accept}
          className="shrink-0 rounded-lg bg-[var(--focus)] px-5 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90"
        >
          Anladım
        </button>
      </div>
    </div>
  )
}
