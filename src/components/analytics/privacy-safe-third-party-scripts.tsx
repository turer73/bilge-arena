'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useEffect, useLayoutEffect } from 'react'
import { isSensitiveWorkspacePath } from '@/lib/privacy/telemetry-policy'
import { GoogleAnalytics } from './google-analytics'

const PUBLIC_TELEMETRY_DOCUMENT = 'publicTelemetryDocument'

export function isSensitiveNavigationTarget(target: string | URL | null | undefined): boolean {
  if (target == null || typeof window === 'undefined') return false
  try {
    return isSensitiveWorkspacePath(new URL(String(target), window.location.href).pathname)
  } catch {
    return false
  }
}

function disableLoadedTelemetry() {
  const browser = window as typeof window & {
    [key: `ga-disable-${string}`]: boolean
    gtag?: (...args: unknown[]) => void
  }
  browser['ga-disable-G-HDCR9YRQJ3'] = true
  browser.gtag?.('consent', 'update', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  })
}

export function installSensitiveNavigationBoundary(
  hardNavigate: (target: string | URL) => void = (target) => {
    disableLoadedTelemetry()
    window.location.assign(new URL(String(target), window.location.href).href)
  },
): () => void {
  const originalPushState = window.history.pushState
  const originalReplaceState = window.history.replaceState
  window.history.pushState = (data, unused, url) => {
    if (isSensitiveNavigationTarget(url)) return hardNavigate(url as string | URL)
    return originalPushState.call(window.history, data, unused, url)
  }
  window.history.replaceState = (data, unused, url) => {
    if (isSensitiveNavigationTarget(url)) return hardNavigate(url as string | URL)
    return originalReplaceState.call(window.history, data, unused, url)
  }
  return () => {
    window.history.pushState = originalPushState
    window.history.replaceState = originalReplaceState
  }
}

/**
 * Ucuncu taraf reklam ve analitik betiklerinin tek yukleme noktasi.
 * Hassas çalışma alanları ayrı bir document boundary arkasındadır. Next.js'in
 * pushState/replaceState geçişi hassas bir hedefe yönelirse URL değişmeden önce
 * native navigasyona çevrilir; böylece kamusal sayfada çalışmış SDK kodu kurum
 * document'ına taşınamaz. Layout-effect fallback programatik/olağandışı bir
 * geçişi de ilk paint'ten önce tam yenilemeye zorlar.
 */
export function PrivacySafeThirdPartyScripts() {
  const pathname = usePathname()
  const sensitive = isSensitiveWorkspacePath(pathname)

  useLayoutEffect(() => {
    if (!sensitive) {
      document.documentElement.dataset[PUBLIC_TELEMETRY_DOCUMENT] = 'true'
      return
    }
    if (document.documentElement.dataset[PUBLIC_TELEMETRY_DOCUMENT] === 'true') {
      disableLoadedTelemetry()
      delete document.documentElement.dataset[PUBLIC_TELEMETRY_DOCUMENT]
      window.location.reload()
    }
  }, [sensitive])

  useEffect(() => {
    if (sensitive) return
    return installSensitiveNavigationBoundary()
  }, [sensitive])

  if (sensitive) return null

  return (
    <>
      <Script
        defer
        data-domain="bilgearena.com"
        src="https://analytics.panola.app/js/script.js"
        strategy="afterInteractive"
      />
      <GoogleAnalytics />
      {process.env.NEXT_PUBLIC_ADSENSE_ID && (
        <Script
          {...{
            src: `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_ID}`,
            strategy: 'afterInteractive' as const,
            crossOrigin: 'anonymous',
          }}
        />
      )}
    </>
  )
}
