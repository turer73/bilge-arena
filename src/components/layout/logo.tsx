'use client'

import Link from 'next/link'
import { useUIStore } from '@/stores/ui-store'

interface LogoProps {
  size?: number
  showText?: boolean
}

export function Logo({ size = 36, showText = true }: LogoProps) {
  const theme = useUIStore((s) => s.theme)
  const src = theme === 'dark' ? '/logo/icon-dark.svg' : '/logo/icon-light.svg'

  return (
    <Link href="/" className="flex items-center gap-2.5">
      <img src={src} alt="Bilge Arena" width={size} height={size} />
      {showText && (
        <div>
          <div
            className="font-display leading-none tracking-tight"
            style={{ fontSize: size * 0.42, fontWeight: 900 }}
          >
            <span className="text-[var(--focus-light)]">Bilge</span>
            <span className="text-[var(--reward-light)]"> Arena</span>
          </div>
          <div
            className="font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]"
            style={{ fontSize: size * 0.18 }}
          >
            YKS Hazırlık
          </div>
        </div>
      )}
    </Link>
  )
}
