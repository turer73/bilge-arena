'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getCookieConsent } from '@/lib/consent'
import { useBottomNavOffset } from './overlay-bottom-offset'

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
  const bottomNavOffset = useBottomNavOffset()
  // Bu oturumda banner zaten gösterildi/kapatıldı mı. beforeinstallprompt bazı Android
  // Chrome sürümlerinde install-kriteri değişince TEKRAR fırlar; eski handler bunu
  // dismiss'e bakmadan yeniden gösteriyordu → kullanıcı kapatsa bile banner geri geliyor
  // ("10 sn'de 10 kez"). handledRef + her seferinde localStorage dismiss re-check ile
  // banner oturumda en fazla 1 kez açılır ve kapatıldıktan sonra bir daha açılmaz.
  const handledRef = useRef(false)
  const consentBlockedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    // Standalone mode (zaten install edilmiş) — hiç gösterme
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (standalone) return

    // Consent banner önceliklidir. Event yakalanabilir, fakat prompt karar
    // verilene kadar gösterilmez.
    consentBlockedRef.current = !getCookieConsent()

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
    const showOnce = () => {
      timerRef.current = undefined
      if (consentBlockedRef.current || handledRef.current || isDismissed()) return
      const banner = document.querySelector<HTMLElement>('[data-cookie-banner]')
      if (banner && banner.getClientRects().length > 0) return
      handledRef.current = true
      setVisible(true)
    }

    const scheduleShow = (delay: number) => {
      if (timerRef.current || consentBlockedRef.current || handledRef.current || isDismissed()) return
      timerRef.current = setTimeout(showOnce, delay)
    }

    let rafId: number | undefined
    let rafFrames = 0
    let cancelled = false
    const waitForConsentUiToExit = () => {
      if (cancelled) return
      if (!getCookieConsent()) return
      const banner = document.querySelector<HTMLElement>('[data-cookie-banner]')
      if (banner) {
        const style = window.getComputedStyle(banner)
        if (banner.getClientRects().length > 0
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && style.opacity !== '0') {
          if (rafFrames++ < 60) {
            rafId = window.requestAnimationFrame(waitForConsentUiToExit)
            return
          }
          // Animasyon beklenmedik şekilde takılırsa PWA sonsuza kadar kilitlenmesin.
          rafFrames = 0
        } else {
          rafFrames = 0
          if (rafId !== undefined) rafId = undefined
        }
      }
      if (ios) scheduleShow(5000)
      else if (deferredPromptRef.current) scheduleShow(3000)
    }

    const consentStateHandler = (event: Event) => {
      const open = (event as CustomEvent<{ open?: boolean }>).detail?.open === true
      if (open) {
        consentBlockedRef.current = true
        setVisible(false)
        if (timerRef.current) {
          clearTimeout(timerRef.current)
          timerRef.current = undefined
        }
        if (rafId !== undefined) {
          window.cancelAnimationFrame(rafId)
          rafId = undefined
        }
        rafFrames = 0
        return
      }
      // CookieBanner'ın ilk hidden render'ı bir karar değildir.
      if (!getCookieConsent()) return
      consentBlockedRef.current = false
      // AnimatePresence çıkışındaki DOM elemanı birkaç frame daha kalabilir;
      // görünür consent UI bitmeden PWA'yı öne alma.
      waitForConsentUiToExit()
    }
    window.addEventListener('cookie-banner-state', consentStateHandler)

    if (ios) {
      // iOS: 5sn delay sonra banner göster (kullanıcı sayfayı yüklesin)
      if (!consentBlockedRef.current) scheduleShow(5000)
      return () => {
        cancelled = true
        window.removeEventListener('cookie-banner-state', consentStateHandler)
        if (timerRef.current) {
          clearTimeout(timerRef.current)
          timerRef.current = undefined
        }
        if (rafId !== undefined) window.cancelAnimationFrame(rafId)
      }
    }

    // Android/Desktop: beforeinstallprompt event listener
    const handler = (e: Event) => {
      e.preventDefault()
      const installEvent = e as BeforeInstallPromptEvent
      deferredPromptRef.current = installEvent
      setDeferredPrompt(installEvent)
      // Tekrar-fırlatma koruması: zaten gösterildi/kapatıldı ya da timer beklemedeyse
      // YENİ timer kurma (aksi halde her re-fire banner'ı yeniden açıyordu).
      if (handledRef.current || isDismissed() || timerRef.current) return
      // 3sn bekle, kullanıcı sayfayı görsün
      if (!consentBlockedRef.current) scheduleShow(3000)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => {
      cancelled = true
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('cookie-banner-state', consentStateHandler)
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = undefined
      }
      if (rafId !== undefined) window.cancelAnimationFrame(rafId)
    }
  }, [])

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return
    handledRef.current = true
    setVisible(false)
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    deferredPromptRef.current = null
    // Kabul VEYA red — her iki halde de 7 gün tekrar sorma. Eski kod red'de
    // (outcome:'dismissed') banner'ı açık bırakıp dismiss yazmıyordu → yeniden açılma.
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  }, [deferredPrompt])

  const handleDismiss = useCallback(() => {
    handledRef.current = true
    setVisible(false)
    setDeferredPrompt(null)
    deferredPromptRef.current = null
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  }, [])

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="Uygulama yükleme önerisi"
      style={{ bottom: `calc(${bottomNavOffset ? `${bottomNavOffset}px` : 'env(safe-area-inset-bottom, 0px)'} + 1rem)` }}
      className="fixed left-4 right-4 z-50 mx-auto max-w-md animate-slide-up rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl"
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
