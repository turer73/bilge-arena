'use client'

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

/**
 * Reklam banner bileşeni.
 *
 * FEATURES.ADS false iken render edilmez.
 * Premium kullanicilar icin de gizlenir.
 *
 * Şu an placeholder — Google AdSense entegrasyonu icin
 * data-ad-slot ve data-ad-client prop'lari eklenir.
 */
export function AdBanner({ slot, className = '' }: AdBannerProps) {
  const { profile } = useAuthStore()

  // Feature kapali veya premium kullanici — reklam gosterme
  if (!FEATURES.ADS) return null
  if (profile?.is_premium) return null

  const size = SLOT_SIZES[slot]

  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] ${className}`}
      style={{
        minHeight: size.height,
        maxWidth: size.width,
      }}
      data-ad-slot={slot}
      data-ad-format="auto"
    >
      {/* Placeholder — AdSense aktif olunca burasi degisecek */}
      <div className="flex flex-col items-center gap-1 py-3 text-[var(--text-muted)]">
        <span className="text-xs">📢</span>
        <span className="text-[9px]">Reklam Alanı ({size.label})</span>
      </div>
    </div>
  )
}
