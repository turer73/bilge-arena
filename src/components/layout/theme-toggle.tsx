'use client'

import { useEffect, useRef, useState } from 'react'
import { useUIStore, type Theme } from '@/stores/ui-store'
import { useAuthStore } from '@/stores/auth-store'

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

function Dot({ opt, size = 16 }: { opt: ThemeOption; size?: number }) {
  return (
    <span
      className="shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: opt.dotBg ?? opt.dot,
        border: opt.dotBg ? `1.5px solid ${opt.dot}` : undefined,
      }}
    />
  )
}

/**
 * Tema seçici — tek tetikleyici butona basınca açılan popover.
 * (Önceden 6 renk dairesi navbar'da yan yana inline duruyordu, çok yer
 * kaplıyordu; artık geçerli temanın noktası + chevron, tıklayınca liste açılır.)
 */
export function ThemeToggle() {
  const { theme, setTheme } = useUIStore()
  const { user, profile } = useAuthStore()
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  // Sayfa yüklendiğinde kayıtlı temayı uygula (localStorage — hızlı, oturumsuz)
  useEffect(() => {
    const saved = localStorage.getItem('bilge-theme') as Theme | null
    if (saved && THEME_OPTIONS.some((t) => t.id === saved)) {
      setTheme(saved)
    }
  }, [setTheme])

  // Profil yüklenince DB'deki tema tercihini uygula (farklı cihaz / yeni sekme sync)
  useEffect(() => {
    if (profile?.preferred_theme) {
      setTheme(profile.preferred_theme)
    }
  }, [profile?.preferred_theme, setTheme])

  // Dışarı tıkla / Escape → kapat
  useEffect(() => {
    if (!open) return
    function onPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = THEME_OPTIONS.find((t) => t.id === theme) ?? THEME_OPTIONS[0]

  function handleThemeChange(id: Theme) {
    setTheme(id)
    setOpen(false)

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
    <div ref={rootRef} className="relative">
      {/* Tetikleyici — geçerli tema noktası + chevron */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Tema seç"
        title={`Tema: ${current.label}`}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 transition-colors hover:bg-[var(--card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
      >
        <Dot opt={current} />
        <svg
          width="10"
          height="6"
          viewBox="0 0 10 6"
          aria-hidden="true"
          className="text-[var(--text-muted)]"
          style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }}
        >
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Popover — tema listesi (sağ hizalı, mobilde taşmasın) */}
      {open && (
        <div
          role="menu"
          aria-label="Tema seç"
          className="absolute right-0 max-sm:left-0 max-sm:right-auto top-[calc(100%+6px)] z-50 min-w-[170px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)] shadow-lg"
        >
          {THEME_OPTIONS.map((opt) => {
            const active = theme === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => handleThemeChange(opt.id)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:bg-[var(--surface)]"
                style={{
                  color: active ? 'var(--focus)' : 'var(--text-sub)',
                  fontWeight: active ? 700 : 500,
                  background: active ? 'var(--focus-bg)' : undefined,
                }}
              >
                <Dot opt={opt} />
                <span className="flex-1">{opt.label}</span>
                {active && <span aria-hidden="true" style={{ color: 'var(--focus)' }}>✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
