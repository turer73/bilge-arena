'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@/lib/hooks/use-auth'
import { trackEvent } from '@/lib/utils/plausible'

interface SignupPromptModalProps {
  level: 1 | 2 | 3
  open: boolean
  onDismiss: () => void
  onExitToLobby: () => void // sadece Level 3'te kullanilir
}

const LEVEL_CONFIG = {
  1: {
    title: 'Skorunu Kaydet!',
    message: 'Bu harika skor kaybolmasin. Hesap acarak rozetlerini ve ilerlemeni kaydet.',
    primaryCta: 'Google ile Devam Et',
    secondaryCta: 'Belki sonra',
    borderColor: 'var(--focus-border)',
  },
  2: {
    title: 'Streak\'in Yakinda Kaybolacak',
    message: '2 quiz cozdun ama hic kaydetmedin. Yarin giris yapmadan ilerlemeni kaybedeceksin. Simdi hesap ac, streak\'ini koru.',
    primaryCta: 'Google ile Kaydet',
    secondaryCta: 'Daha sonra',
    borderColor: 'var(--reward-border)',
  },
  3: {
    title: 'Son Sans!',
    message: '3 quiz cozdun, cok iyi gidiyorsun! Devam etmek icin hesap ac. Rozetlerin, XP\'n, siralamada yerin - hepsi seni bekliyor.',
    primaryCta: 'Google ile Hemen Baslat',
    secondaryCta: 'Lobiye Don',
    borderColor: 'var(--urgency-border)',
  },
} as const

export function SignupPromptModal({ level, open, onDismiss, onExitToLobby }: SignupPromptModalProps) {
  const { signInWithGoogle } = useAuth()
  const tracked = useRef(false)
  const config = LEVEL_CONFIG[level]
  const isHardWall = level === 3

  // Gosterildigi an event fire
  useEffect(() => {
    if (!open || tracked.current) return
    tracked.current = true
    trackEvent('PromptShown', { props: { level } })
  }, [open, level])

  // ESC kapatma - sadece soft/medium icin
  useEffect(() => {
    if (!open || isHardWall) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        trackEvent('PromptDismissed', { props: { level, method: 'esc' } })
        onDismiss()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, isHardWall, level, onDismiss])

  if (!open) return null

  const handlePrimary = async () => {
    trackEvent('PromptCtaClicked', { props: { level, outcome: 'signup' } })
    await signInWithGoogle()
  }

  const handleSecondary = () => {
    if (isHardWall) {
      trackEvent('PromptCtaClicked', { props: { level, outcome: 'exit_lobby' } })
      onExitToLobby()
    } else {
      trackEvent('PromptDismissed', { props: { level, method: 'button' } })
      onDismiss()
    }
  }

  const handleOverlayClick = () => {
    if (isHardWall) return
    trackEvent('PromptDismissed', { props: { level, method: 'overlay' } })
    onDismiss()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeUp"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleOverlayClick}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-md rounded-2xl border bg-[var(--card-bg)] p-6 shadow-2xl md:p-8"
        style={{ borderColor: config.borderColor }}
      >
        {/* X butonu - hard wall'da yok */}
        {!isHardWall && (
          <button
            onClick={handleSecondary}
            className="absolute right-3 top-3 rounded-lg p-1.5 text-[var(--text-sub)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text)]"
            aria-label="Kapat"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        {/* Baslik */}
        <h2 id="prompt-modal-title" className="mb-3 font-display text-xl font-black md:text-2xl">
          {config.title}
        </h2>

        {/* Mesaj */}
        <p className="mb-6 text-sm leading-relaxed text-[var(--text-sub)] md:text-base">
          {config.message}
        </p>

        {/* Butonlar */}
        <div className={`flex ${isHardWall ? 'flex-col' : 'flex-col sm:flex-row'} gap-2`}>
          <button
            onClick={handlePrimary}
            className={`btn-primary ${isHardWall ? 'animate-pulse' : ''} flex flex-1 items-center justify-center gap-2 rounded-[10px] py-3 font-display text-sm font-bold tracking-wider`}
          >
            <GoogleIcon />
            <span>{config.primaryCta}</span>
          </button>
          <button
            onClick={handleSecondary}
            className="btn-ghost flex-1 rounded-[10px] py-3 text-sm font-bold"
          >
            {config.secondaryCta}
          </button>
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
