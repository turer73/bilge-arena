'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'pwa-install-dismissed'
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 gün

/**
 * PWA yükle banner'ı.
 *
 * Android (Chrome/Edge): beforeinstallprompt event yakalar, kullanıcıya
 * "Uygulamayı Yükle" tıklanabilir buton sunar (1-tıkla install).
 *
 * iOS Safari: beforeinstallprompt YOK (Apple'ın stratejik kısıtlaması).
 * Manuel "Paylaş > Ana Ekrana Ekle" instructional UI gösterilir.
 *
 * Standalone mode (zaten install edilmiş): hiç render etme.
 *
 * 7 gün dismiss tracking (localStorage). Kullanıcı kapatırsa 7 gün
 * boyunca tekrar gözükmez.
 */
export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  // Bu oturumda banner zaten gösterildi/kapatıldı mı. beforeinstallprompt bazı Android
  // Chrome sürümlerinde install-kriteri değişince TEKRAR fırlar; eski handler bunu
  // dismiss'e bakmadan yeniden gösteriyordu → kullanıcı kapatsa bile banner geri geliyor
  // ("10 sn'de 10 kez"). handledRef + her seferinde localStorage dismiss re-check ile
  // banner oturumda en fazla 1 kez açılır ve kapatıldıktan sonra bir daha açılmaz.
  const handledRef = useRef(false)

  useEffect(() => {
    // Standalone mode (zaten install edilmiş) — hiç gösterme
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (standalone) return

    // 7 gün dismiss tracking — her gösterim denemesinde TEKRAR kontrol edilir (re-fire).
    const isDismissed = () => {
      const d = localStorage.getItem(DISMISS_KEY)
      return !!d && Date.now() - Number(d) < DISMISS_DURATION
    }
    if (isDismissed()) return

    // iOS detect (beforeinstallprompt yok, instructional UI)
    // iPadOS 13+ Safari 'desktop class' modunda UA 'Macintosh' donduruyor —
    // navigator.platform === 'MacIntel' + maxTouchPoints > 1 ile yakalanir.
    // Codex PR #111 P2: bu detect olmadan iPad kullanicilar Android branch'a
    // duser ve banner asla goremez.
    const ua = navigator.userAgent
    const isClassicIOS =
      /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
    const isIPadOSDesktop =
      typeof navigator.platform === 'string' &&
      navigator.platform === 'MacIntel' &&
      navigator.maxTouchPoints > 1 &&
      // iOS Chrome/Firefox/Edge degil — sadece Safari instructional UI
      !/CriOS|FxiOS|EdgiOS/.test(ua)
    const ios = isClassicIOS || isIPadOSDesktop
    setIsIOS(ios)

    // Banner'ı oturumda en fazla 1 kez aç; zaten gösterildiyse (handledRef) ya da
    // arada kapatıldıysa (localStorage) AÇMA. beforeinstallprompt'un tekrar fırlaması
    // veya gecikmiş timer bu guard'a takılır → döngü kırılır.
    let timer: ReturnType<typeof setTimeout> | undefined
    const showOnce = () => {
      if (handledRef.current || isDismissed()) return
      handledRef.current = true
      setVisible(true)
    }

    if (ios) {
      // iOS: 5sn delay sonra banner göster (kullanıcı sayfayı yüklesin)
      timer = setTimeout(showOnce, 5000)
      return () => { if (timer) clearTimeout(timer) }
    }

    // Android/Desktop: beforeinstallprompt event listener
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Tekrar-fırlatma koruması: zaten gösterildi/kapatıldı ya da timer beklemedeyse
      // YENİ timer kurma (aksi halde her re-fire banner'ı yeniden açıyordu).
      if (handledRef.current || isDismissed() || timer) return
      // 3sn bekle, kullanıcı sayfayı görsün
      timer = setTimeout(showOnce, 3000)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      if (timer) clearTimeout(timer)
    }
  }, [])

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return
    handledRef.current = true
    setVisible(false)
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    // Kabul VEYA red — her iki halde de 7 gün tekrar sorma. Eski kod red'de
    // (outcome:'dismissed') banner'ı açık bırakıp dismiss yazmıyordu → yeniden açılma.
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  }, [deferredPrompt])

  const handleDismiss = useCallback(() => {
    handledRef.current = true
    setVisible(false)
    setDeferredPrompt(null)
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  }, [])

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="Uygulama yükleme önerisi"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-slide-up rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--focus)]">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            Bilge Arena&apos;yı yükle
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {isIOS
              ? 'Ana ekrana eklemek için tarayıcının paylaş simgesine ↗ dokun, sonra "Ana Ekrana Ekle" seç.'
              : 'Ana ekrana ekle, çevrimdışı eriş, anlık bildirim al.'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 rounded p-1 text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
          aria-label="Kapat"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      {!isIOS && (
        <button
          type="button"
          onClick={handleInstall}
          className="mt-3 w-full rounded-lg bg-[var(--focus)] py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--focus)]/90"
        >
          Uygulamayı Yükle
        </button>
      )}
    </div>
  )
}
