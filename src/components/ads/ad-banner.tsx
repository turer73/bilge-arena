'use client'

import { useEffect, useRef } from 'react'
import { FEATURES } from '@/lib/constants/premium'
import { useAuthStore } from '@/stores/auth-store'

type AdSlot = 'lobby' | 'result' | 'sidebar'

interface AdBannerProps {
  slot: AdSlot
  className?: string
}

const SLOT_SIZES: Record<AdSlot, { width: number; height: number; label: string }> = {
  lobby: { width: 728, height: 90, label: 'Lobby Banner' },
  result: { width: 728, height: 90, label: 'Sonuç Banner' },
  sidebar: { width: 160, height: 600, label: 'Sidebar Banner' },
}

const ADSENSE_ID = process.env.NEXT_PUBLIC_ADSENSE_ID || ''

/**
 * Reklam banner bileşeni.
 *
 * FEATURES.ADS false iken render edilmez.
 * Premium kullanicilar icin de gizlenir.
 *
 * NEXT_PUBLIC_ADSENSE_ID yoksa placeholder gosterir.
 * Varsa gercek AdSense reklam alani render eder.
 */
export function AdBanner({ slot, className = '' }: AdBannerProps) {
  const { profile } = useAuthStore()
  const pushed = useRef(false)

  useEffect(() => {
    if (!ADSENSE_ID || pushed.current) return

    try {
      const w = window as Window & { adsbygoogle?: Record<string, unknown>[] }
      const adsbygoogle = w.adsbygoogle || []
      adsbygoogle.push({})
      pushed.current = true
    } catch {
      // AdSense not loaded yet
    }
  }, [])

  // Feature kapali veya premium kullanici — reklam gosterme
  if (!FEATURES.ADS) return null
  if (profile?.is_premium) return null

  const size = SLOT_SIZES[slot]

  // AdSense ID yoksa placeholder
  if (!ADSENSE_ID) {
    return (
      <div
        className={`flex items-center justify-center overflow-hidden rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] ${className}`}
        style={{ minHeight: size.height, maxWidth: size.width }}
      >
        <div className="flex flex-col items-center gap-1 py-3 text-[var(--text-muted)]">
          <span className="text-xs">Ad Space</span>
        </div>
      </div>
    )
  }

  // Gercek AdSense reklam alani
  return (
    <div
      className={`overflow-hidden ${className}`}
      style={{ minHeight: size.height, maxWidth: size.width }}
    >
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={ADSENSE_ID}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}
