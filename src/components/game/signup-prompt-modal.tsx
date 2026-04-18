'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/hooks/use-auth'
import { trackEvent } from '@/lib/utils/plausible'
import { validateEmail, getEmailErrorMessage } from '@/lib/utils/email'

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

/**
 * Magic link alt-akis durumu. Opsiyon Z (progressive disclosure):
 * - hidden: Sadece "Email ile giris" linki gorunur (default)
 * - input: Email inputu + "Gonder" butonu acik
 * - sending: Istek devam ediyor (buton disabled, spinner)
 * - sent: Supabase kabul etti, kullanici inbox'i kontrol etmeli (60s cooldown)
 * - error: Fail, retry mumkun
 */
type MagicLinkState =
  | { status: 'hidden' }
  | { status: 'input'; email: string; error?: string }
  | { status: 'sending'; email: string }
  | { status: 'sent'; email: string; cooldownEndsAt: number }
  | { status: 'error'; email: string; message: string }

const COOLDOWN_MS = 60_000 // Supabase server-side limit ile senkron

export function SignupPromptModal({ level, open, onDismiss, onExitToLobby }: SignupPromptModalProps) {
  const { signInWithGoogle, signInWithMagicLink } = useAuth()
  const tracked = useRef(false)
  const config = LEVEL_CONFIG[level]
  const isHardWall = level === 3

  const [ml, setMl] = useState<MagicLinkState>({ status: 'hidden' })
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0)

  // Gosterildigi an event fire
  useEffect(() => {
    if (!open || tracked.current) return
    tracked.current = true
    trackEvent('PromptShown', { props: { level } })
  }, [open, level])

  // ESC kapatma - sadece soft/medium icin, sent state'de de engelleme
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

  // Cooldown countdown (saniye cinsinden UI icin)
  useEffect(() => {
    if (ml.status !== 'sent') {
      setCooldownRemaining(0)
      return
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((ml.cooldownEndsAt - Date.now()) / 1000))
      setCooldownRemaining(remaining)
    }
    tick()
    const interval = setInterval(tick, 500)
    return () => clearInterval(interval)
  }, [ml])

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

  const handleRevealMagicLink = () => {
    trackEvent('MagicLinkRevealed', { props: { level } })
    setMl({ status: 'input', email: '' })
  }

  const handleMagicLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (ml.status !== 'input' && ml.status !== 'error') return

    const emailRaw = ml.status === 'input' ? ml.email : ml.email
    const validation = validateEmail(emailRaw)
    if (!validation.ok) {
      setMl({ status: 'input', email: emailRaw, error: getEmailErrorMessage(validation.reason) })
      return
    }

    trackEvent('MagicLinkRequested', { props: { level } })
    setMl({ status: 'sending', email: validation.normalized })

    const result = await signInWithMagicLink(validation.normalized)
    if (result.ok) {
      trackEvent('MagicLinkSent', { props: { level } })
      setMl({
        status: 'sent',
        email: validation.normalized,
        cooldownEndsAt: Date.now() + COOLDOWN_MS,
      })
    } else {
      trackEvent('MagicLinkFailed', { props: { level, error: result.error.slice(0, 50) } })
      setMl({ status: 'error', email: validation.normalized, message: translateMagicLinkError(result.error) })
    }
  }

  const handleResend = async () => {
    if (ml.status !== 'sent' || cooldownRemaining > 0) return
    setMl({ status: 'sending', email: ml.email })
    const result = await signInWithMagicLink(ml.email)
    if (result.ok) {
      trackEvent('MagicLinkSent', { props: { level, resend: true } })
      setMl({
        status: 'sent',
        email: ml.email,
        cooldownEndsAt: Date.now() + COOLDOWN_MS,
      })
    } else {
      trackEvent('MagicLinkFailed', { props: { level, error: result.error.slice(0, 50), resend: true } })
      setMl({ status: 'error', email: ml.email, message: translateMagicLinkError(result.error) })
    }
  }

  const handleRetryAfterError = () => {
    if (ml.status !== 'error') return
    setMl({ status: 'input', email: ml.email })
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

        {/* Ana butonlar */}
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

        {/* Magic link alt-akisi (Opsiyon Z: progressive disclosure) */}
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          {ml.status === 'hidden' && (
            <button
              type="button"
              onClick={handleRevealMagicLink}
              className="w-full text-center text-sm text-[var(--text-sub)] transition-colors hover:text-[var(--focus)] hover:underline"
            >
              Google yok mu? <span className="font-semibold">Email ile giris yap →</span>
            </button>
          )}

          {(ml.status === 'input' || ml.status === 'error') && (
            <form onSubmit={handleMagicLinkSubmit} noValidate className="flex flex-col gap-2">
              <label htmlFor="magic-link-email" className="text-xs font-semibold text-[var(--text-sub)]">
                Email adresin
              </label>
              <input
                id="magic-link-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={ml.status === 'input' ? ml.email : ml.email}
                onChange={(e) => {
                  if (ml.status === 'input') setMl({ status: 'input', email: e.target.value })
                  else setMl({ status: 'input', email: e.target.value })
                }}
                placeholder="ad@domain.com"
                required
                aria-describedby={ml.status === 'input' && ml.error ? 'magic-link-error' : undefined}
                aria-invalid={ml.status === 'input' && !!ml.error}
                className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--focus)]"
              />
              {ml.status === 'input' && ml.error && (
                <p id="magic-link-error" className="text-xs text-[var(--urgency)]">
                  {ml.error}
                </p>
              )}
              {ml.status === 'error' && (
                <p className="text-xs text-[var(--urgency)]">
                  {ml.message}{' '}
                  <button type="button" onClick={handleRetryAfterError} className="font-semibold underline">
                    Tekrar dene
                  </button>
                </p>
              )}
              <button
                type="submit"
                className="btn-primary mt-1 w-full rounded-[10px] py-2.5 text-sm font-bold"
              >
                Giris Linki Gonder
              </button>
            </form>
          )}

          {ml.status === 'sending' && (
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-[var(--text-sub)]">
              <Spinner />
              <span>Gonderiliyor...</span>
            </div>
          )}

          {ml.status === 'sent' && (
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-start gap-2 rounded-[10px] border border-[var(--growth-border)] bg-[var(--growth-bg)] p-3">
                <CheckIcon />
                <div className="flex-1">
                  <p className="font-semibold text-[var(--growth)]">Email gonderildi ✓</p>
                  <p className="mt-1 text-xs text-[var(--text-sub)]">
                    <span className="font-medium">{ml.email}</span> adresine giris linki yolladik. 2 dakika icinde gelmezse spam klasorunu kontrol et.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldownRemaining > 0}
                className="text-center text-xs text-[var(--text-sub)] transition-colors enabled:hover:text-[var(--focus)] enabled:hover:underline disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cooldownRemaining > 0
                  ? `${cooldownRemaining}s sonra tekrar gonderilebilir`
                  : 'Gelmedi mi? Tekrar gonder'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Supabase hata mesajlarini Turkce ve kullanici dostu versiyonlara cevir.
 * Tanimayan hatalari oldugu gibi gecer (debugging icin).
 */
function translateMagicLinkError(raw: string): string {
  const lower = raw.toLowerCase()
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Cok fazla istek gonderdin. 1 dakika bekle, sonra tekrar dene.'
  }
  if (lower.includes('invalid') && lower.includes('email')) {
    return 'Bu email adresi gecerli degil. Yeniden kontrol et.'
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Internet baglantini kontrol et.'
  }
  return 'Email gonderilemedi. Biraz sonra tekrar dene.'
}

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[var(--growth)]" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
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
