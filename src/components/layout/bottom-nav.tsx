'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Swords, Trophy, User, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * Mobil alt navigasyon (tab bar). Masaustunde Navbar var; mobilde
 * (`md:hidden`) ekranin altinda 4 sekme: Anasayfa / Arena / Siralama / Profil.
 *
 * Prototip (Bilge Arena - Mobil) duotone aktif-pill dilini birebir tasir:
 * aktif sekme --focus rengine doner, ikonun arkasinda yumusak bir glow ve
 * ust kenarda animasyonlu bir gosterge cubugu belirir. Glass arka plan +
 * safe-area inset (iPhone home indicator) hesaba katilir.
 */

interface NavItem {
  id: string
  href: string
  label: string
  Icon: LucideIcon
}

const ITEMS: NavItem[] = [
  { id: 'lobby', href: '/arena', label: 'Anasayfa', Icon: Home },
  { id: 'oda', href: '/oda', label: 'Arena', Icon: Swords },
  { id: 'leaderboard', href: '/arena/siralama', label: 'Sıralama', Icon: Trophy },
  { id: 'profile', href: '/arena/profil', label: 'Profil', Icon: User },
]

interface BottomNavProps {
  /** Demo/storybook icin rota yerine sabit aktif sekme. */
  activeOverride?: string
}

export function BottomNav({ activeOverride }: BottomNavProps) {
  const pathname = usePathname()

  const isActive = (item: NavItem) => {
    if (activeOverride) return activeOverride === item.id
    // '/arena' yalnizca tam eslesmede aktif; alt rotalar kendi sekmelerine ait.
    if (item.href === '/arena') return pathname === '/arena'
    return pathname === item.href || pathname.startsWith(item.href + '/')
  }

  return (
    <nav
      aria-label="Mobil gezinme"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-around md:hidden"
      style={{
        paddingTop: 8,
        paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
        background: 'color-mix(in srgb, var(--surface) 90%, transparent)',
        backdropFilter: 'blur(16px) saturate(180%)',
        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
        borderTop: '1px solid var(--border)',
      }}
    >
      {ITEMS.map((item) => {
        const active = isActive(item)
        const { Icon } = item
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group relative flex flex-1 flex-col items-center gap-1 px-2 py-1',
              'transition-transform duration-150 active:scale-90',
            )}
            style={{ color: active ? 'var(--focus)' : 'var(--text-muted)' }}
          >
            {/* ust gosterge cubugu — aktifte genisler */}
            <span
              aria-hidden
              className="absolute top-0 h-[3px] rounded-full transition-all duration-300"
              style={{
                width: active ? 22 : 0,
                opacity: active ? 1 : 0,
                background: 'var(--focus)',
                boxShadow: '0 0 8px var(--focus-glow)',
              }}
            />

            {/* ikon + arkada duotone glow */}
            <span className="relative flex h-7 w-7 items-center justify-center">
              {active && (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: 'var(--focus-glow)',
                    filter: 'blur(7px)',
                    opacity: 0.7,
                  }}
                />
              )}
              <Icon
                size={23}
                strokeWidth={active ? 2.4 : 2}
                className="relative transition-all duration-200"
                style={{
                  fill: active ? 'color-mix(in srgb, var(--focus) 20%, transparent)' : 'transparent',
                }}
              />
            </span>

            <span
              className="text-[10px] leading-none transition-all"
              style={{ fontWeight: active ? 700 : 600 }}
            >
              {item.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
