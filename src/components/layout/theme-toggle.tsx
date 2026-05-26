'use client'

import { useEffect, useRef } from 'react'
import { useUIStore, DARK_THEMES } from '@/stores/ui-store'
import { useAuthStore } from '@/stores/auth-store'
import type { Theme } from '@/stores/ui-store'

interface ThemeOption {
  id: Theme
  label: string
  /** Renk noktası — temanın ana aksanı */
  dot: string
  /** Nokta arka planı (açık temalar için) */
  dotBg?: string
}

const THEME_OPTIONS: ThemeOption[] = [
  { id: 'dark',      label: 'Gece Mavisi',     dot: '#2563EB' },
  { id: 'okyanus',   label: 'Derin Okyanus',   dot: '#0284C7' },
  { id: 'orman',     label: 'Kadim Orman',     dot: '#0D9488' },
  { id: 'gunbatimi', label: 'Kızıl Günbatımı', dot: '#EA580C' },
  { id: 'mor-gece',  label: 'Mor Gece',        dot: '#6366F1' },
  { id: 'light',     label: 'Gün Işığı',       dot: '#CBD5E1', dotBg: '#F1F5F9' },
]

export function ThemeToggle() {
  const { theme, setTheme } = useUIStore()
  const { user } = useAuthStore()
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sayfa yüklendiğinde kayıtlı temayı uygula
  useEffect(() => {
    const saved = localStorage.getItem('bilge-theme') as Theme | null
    if (saved && THEME_OPTIONS.some((t) => t.id === saved)) {
      setTheme(saved)
    }
  }, [setTheme])

  const isDark = DARK_THEMES.has(theme)

  function handleThemeChange(id: Theme) {
    setTheme(id)

    // Giriş yapmış kullanıcılar için DB'ye debounc'lu sync (600ms)
    if (!user) return
    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => {
      fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferred_theme: id }),
      }).catch(() => {
        // Sessiz hata — localStorage tema çalışmaya devam eder
      })
    }, 600)
  }

  return (
    <div
      className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5"
      role="group"
      aria-label="Tema seç"
    >
      {THEME_OPTIONS.map((opt) => {
        const active = theme === opt.id
        return (
          <button
            key={opt.id}
            onClick={() => handleThemeChange(opt.id)}
            title={opt.label}
            aria-label={opt.label}
            aria-pressed={active}
            className="relative h-4 w-4 rounded-full transition-all duration-150 hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
            style={{
              backgroundColor: opt.dotBg ?? opt.dot,
              border: opt.dotBg ? `1.5px solid ${opt.dot}` : undefined,
              boxShadow: active
                ? `0 0 0 2px ${isDark ? '#0a0a1a' : '#ffffff'}, 0 0 0 3.5px ${opt.dot}`
                : undefined,
              transform: active ? 'scale(1.15)' : undefined,
            }}
          />
        )
      })}
    </div>
  )
}
