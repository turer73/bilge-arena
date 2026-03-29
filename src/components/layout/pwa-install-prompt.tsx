'use client'

import { useState, useEffect, useCallback } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'pwa-install-dismissed'
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 gun

/**
 * PWA yukle banner'i.
 * beforeinstallprompt event'ini yakalar ve kullaniciya
 * "Ana ekrana ekle" secenegi sunar.
 * 7 gun icinde kapatildiysa tekrar gostermez.
 */
export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Daha once kapatildiysa gosterme
    const dismissed = localStorage.getItem(DISMISS_KEY)
    if (dismissed && Date.now() - Number(dismissed) < DISMISS_DURATION) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Hemen gosterme — 3sn bekle (kullanici sayfayi gorsun)
      setTimeout(() => setVisible(true), 3000)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setVisible(false)
      setDeferredPrompt(null)
    }
  }, [deferredPrompt])

  const handleDismiss = useCallback(() => {
    setVisible(false)
    setDeferredPrompt(null)
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  }, [])

  if (!visible) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-slide-up rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--focus)]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            Bilge Arena&apos;yi yukle
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Ana ekrana ekle, cevrimdisi eriş, anlik bildirim al.
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 text-[var(--muted)] hover:text-[var(--foreground)]"
          aria-label="Kapat"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <button
        onClick={handleInstall}
        className="mt-3 w-full rounded-lg bg-[var(--focus)] py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--focus)]/90"
      >
        Uygulamayi Yukle
      </button>
    </div>
  )
}
