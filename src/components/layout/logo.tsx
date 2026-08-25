'use client'

import { DocumentBoundaryLink as Link } from '@/components/privacy/document-boundary-link'
import Image from 'next/image'
import { useUIStore, DARK_THEMES } from '@/stores/ui-store'

interface LogoProps {
  size?: number
  showText?: boolean
}

export function Logo({ size = 36, showText = true }: LogoProps) {
  const theme = useUIStore((s) => s.theme)
  const isDark = DARK_THEMES.has(theme)

  return (
    <Link
      href="/"
      aria-label="Bilge Arena ana sayfa"
      className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-text)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
    >
      {/* İki icon yan yana opacity geçişi — tema değişince flicker olmaz */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <Image
          src="/logo/icon-dark.svg"
          alt=""
          aria-hidden="true"
          width={size}
          height={size}
          priority
          className={`absolute inset-0 transition-opacity duration-300 ${isDark ? 'opacity-100' : 'opacity-0'}`}
        />
        <Image
          src="/logo/icon-light.svg"
          alt=""
          aria-hidden="true"
          width={size}
          height={size}
          className={`absolute inset-0 transition-opacity duration-300 ${isDark ? 'opacity-0' : 'opacity-100'}`}
        />
      </div>
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
            YKS · LGS · AYT
          </div>
        </div>
      )}
    </Link>
  )
}
