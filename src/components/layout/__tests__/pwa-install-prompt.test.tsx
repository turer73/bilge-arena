/**
 * Bilge Arena: PWAInstallPrompt smoke tests
 *
 * Senaryolar:
 *   1. Standalone mode -> null render (zaten install)
 *   2. Dismiss localStorage -> null render (7 gün lock)
 *   3. iOS UA -> instructional metin (beforeinstallprompt YOK)
 *   4. Android beforeinstallprompt -> install button (3sn delay)
 *   5. Dismiss tıkla -> localStorage timestamp set
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { PWAInstallPrompt } from '../pwa-install-prompt'

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

function setUA(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
}

function setStandalone(standalone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(display-mode: standalone)' ? standalone : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  setStandalone(false)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('PWAInstallPrompt', () => {
  test('1) Standalone mode -> null render (zaten install)', () => {
    setUA(ANDROID_UA)
    setStandalone(true)
    const { container } = render(<PWAInstallPrompt />)
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(container.firstChild).toBeNull()
  })

  test('2) Dismiss locked -> null render (7 gun)', () => {
    setUA(ANDROID_UA)
    localStorage.setItem('pwa-install-dismissed', String(Date.now() - 1000)) // henuz lock
    const { container } = render(<PWAInstallPrompt />)
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(container.firstChild).toBeNull()
  })

  test('3) Eski dismiss expired -> render (Android beforeinstallprompt)', () => {
    setUA(ANDROID_UA)
    // 8 gun once dismiss (7 gun lock expired)
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
    localStorage.setItem('pwa-install-dismissed', String(eightDaysAgo))
    render(<PWAInstallPrompt />)

    // beforeinstallprompt event simule
    const event = new Event('beforeinstallprompt')
    Object.assign(event, {
      prompt: vi.fn(),
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    })
    act(() => {
      window.dispatchEvent(event)
      vi.advanceTimersByTime(3_000) // 3sn delay
    })

    expect(screen.getByRole('dialog', { name: /Uygulama yükleme önerisi/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Uygulamayı Yükle/i })).toBeInTheDocument()
  })

  test('4) iOS UA -> instructional metin (5sn delay)', () => {
    setUA(IOS_UA)
    render(<PWAInstallPrompt />)

    // 5sn bekle (iOS delay)
    act(() => {
      vi.advanceTimersByTime(5_000)
    })

    expect(screen.getByText(/tarayıcının paylaş simgesine/i)).toBeInTheDocument()
    expect(screen.getByText(/Ana Ekrana Ekle/i)).toBeInTheDocument()
    // iOS'ta install butonu YOK (beforeinstallprompt yok)
    expect(screen.queryByRole('button', { name: /Uygulamayı Yükle/i })).not.toBeInTheDocument()
  })

  test('5) Dismiss tıkla -> localStorage timestamp', () => {
    setUA(ANDROID_UA)
    render(<PWAInstallPrompt />)

    const event = new Event('beforeinstallprompt')
    Object.assign(event, {
      prompt: vi.fn(),
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    })
    act(() => {
      window.dispatchEvent(event)
      vi.advanceTimersByTime(3_000)
    })

    const closeBtn = screen.getByRole('button', { name: /Kapat/i })
    act(() => {
      closeBtn.click()
    })

    // localStorage'a timestamp yazildi
    const dismissed = localStorage.getItem('pwa-install-dismissed')
    expect(dismissed).not.toBeNull()
    expect(Number(dismissed)).toBeGreaterThan(Date.now() - 1000)
  })

  test('6) iOS Chrome (CriOS) -> Safari degil, banner gosterme', () => {
    // iOS Chrome (CriOS) Safari beforeinstallprompt bypass yok, kullanici
    // Safari'ye yonlendirilmeli — biz banner gostermiyoruz (UX karısıkligi)
    setUA(IOS_UA.replace('Version/17.0 Mobile/15E148 Safari/604.1', 'CriOS/120.0.0.0 Mobile/15E148 Safari/604.1'))
    const { container } = render(<PWAInstallPrompt />)
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    // CriOS detect → iOS olmasına rağmen banner gosterilmedi (regex !CriOS)
    expect(container.firstChild).toBeNull()
  })
})
