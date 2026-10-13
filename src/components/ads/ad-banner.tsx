'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { FEATURES } from '@/lib/constants/premium'
import { isSensitiveWorkspacePath } from '@/lib/privacy/telemetry-policy'
import { useAuthStore } from '@/stores/auth-store'
import { useAdsConsent } from '@/lib/hooks/use-ads-consent'

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
type AdQueue = Record<string, unknown>[] & { requestNonPersonalizedAds?: number }

// Gerçek AdSense slot ID'leri — AdSense konsolundan alınmalı
// (Reklam birimi oluştur → "Reklam birimi kodu" altındaki sayısal değer)
// Env var yoksa undefined → placeholder gösterilir, gerçek reklam yüklenmez
const SLOT_IDS: Record<AdSlot, string | undefined> = {
  lobby: process.env.NEXT_PUBLIC_ADSENSE_SLOT_LOBBY,
  result: process.env.NEXT_PUBLIC_ADSENSE_SLOT_RESULT,
  sidebar: process.env.NEXT_PUBLIC_ADSENSE_SLOT_SIDEBAR,
}

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
  const pathname = usePathname()
  const isSensitiveWorkspace = isSensitiveWorkspacePath(pathname)
  const adsAllowed = useAdsConsent()
  const slotId = SLOT_IDS[slot]

  useEffect(() => {
    if (isSensitiveWorkspace || !adsAllowed || !FEATURES.ADS || profile?.is_premium
      || !ADSENSE_ID || !slotId || pushed.current) return

    try {
      const w = window as Window & { adsbygoogle?: AdQueue }
      w.adsbygoogle = w.adsbygoogle || []
      w.adsbygoogle.requestNonPersonalizedAds = 1
      w.adsbygoogle.push({})
      pushed.current = true
    } catch {
      // AdSense not loaded yet
    }
  }, [adsAllowed, isSensitiveWorkspace, profile?.is_premium, slotId])

  // Feature kapali veya premium kullanici — reklam gosterme
  if (isSensitiveWorkspace) return null
  if (!FEATURES.ADS) return null
  if (profile?.is_premium) return null
  if (!adsAllowed) return null

  const size = SLOT_SIZES[slot]

  // AdSense ID veya slot ID yoksa placeholder
  if (!ADSENSE_ID || !slotId) {
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
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}
