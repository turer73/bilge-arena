'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useLayoutEffect, useState } from 'react'
import {
  isCurrentBrowserPathSensitive,
  isSensitiveWorkspacePath,
} from '@/lib/privacy/telemetry-policy'
import { GoogleAnalytics } from './google-analytics'

const TELEMETRY_DOCUMENT_BOUNDARY = 'telemetryDocumentBoundary'
type TelemetryDocumentBoundary = 'public' | 'sensitive'

function reloadCurrentDocument() {
  window.location.reload()
}

export function isSensitiveNavigationTarget(target: string | URL | null | undefined): boolean {
  if (target == null || typeof window === 'undefined') return false
  try {
    const url = new URL(String(target), window.location.href)
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== window.location.origin) {
      return false
    }
    return isSensitiveWorkspacePath(url.pathname)
  } catch {
    return false
  }
}

export function crossesSensitiveDocumentBoundary(
  target: string | URL | null | undefined,
  currentSensitive: boolean,
): boolean {
  if (target == null || typeof window === 'undefined') return false
  try {
    const url = new URL(String(target), window.location.href)
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== window.location.origin) {
      return false
    }
    return isSensitiveWorkspacePath(url.pathname) !== currentSensitive
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
  currentSensitive = isCurrentBrowserPathSensitive(),
  hardReload: () => void = () => {
    disableLoadedTelemetry()
    window.location.reload()
  },
): () => void {
  const originalPushState = window.history.pushState
  const originalReplaceState = window.history.replaceState
  window.history.pushState = (data, unused, url) => {
    if (crossesSensitiveDocumentBoundary(url, currentSensitive)) {
      return hardNavigate(url as string | URL)
    }
    return originalPushState.call(window.history, data, unused, url)
  }
  window.history.replaceState = (data, unused, url) => {
    if (crossesSensitiveDocumentBoundary(url, currentSensitive)) {
      return hardNavigate(url as string | URL)
    }
    return originalReplaceState.call(window.history, data, unused, url)
  }
  const handlePopState = (event: PopStateEvent) => {
    if (isCurrentBrowserPathSensitive() !== currentSensitive) {
      // The URL has already changed when popstate fires. Stop later listeners
      // (including analytics SDKs) from observing a cross-boundary pathname.
      event.stopImmediatePropagation()
      event.stopPropagation()
      hardReload()
    }
  }
  window.addEventListener('popstate', handlePopState, { capture: true })
  return () => {
    window.history.pushState = originalPushState
    window.history.replaceState = originalReplaceState
    window.removeEventListener('popstate', handlePopState, { capture: true })
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
export function PrivacySafeThirdPartyScripts({
  reloadDocument = reloadCurrentDocument,
}: {
  reloadDocument?: () => void
} = {}) {
  const pathname = usePathname()
  const sensitive = isSensitiveWorkspacePath(pathname)
  const expectedBoundary: TelemetryDocumentBoundary = sensitive ? 'sensitive' : 'public'
  const [documentBoundaryReady, setDocumentBoundaryReady] = useState(false)
  const currentBoundary = typeof document === 'undefined'
    ? undefined
    : document.documentElement.dataset[TELEMETRY_DOCUMENT_BOUNDARY]
  const documentBoundaryMatches = currentBoundary === expectedBoundary

  useLayoutEffect(() => {
    const existingBoundary = document.documentElement.dataset[TELEMETRY_DOCUMENT_BOUNDARY]
    if (!existingBoundary) {
      document.documentElement.dataset[TELEMETRY_DOCUMENT_BOUNDARY] = expectedBoundary
      // This synchronous layout gate is intentional: third-party Script must
      // not mount for even one paint before the document boundary is known.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDocumentBoundaryReady(true)
      return
    }
    if (existingBoundary !== expectedBoundary) {
      disableLoadedTelemetry()
      reloadDocument()
      return
    }
    setDocumentBoundaryReady(true)
  }, [expectedBoundary, reloadDocument])

  useLayoutEffect(() => {
    if (!documentBoundaryReady || !documentBoundaryMatches) return
    return installSensitiveNavigationBoundary(undefined, sensitive)
  }, [documentBoundaryMatches, documentBoundaryReady, sensitive])

  // Scripts stay absent during hydration and any unexpected cross-boundary
  // render. The layout effect either establishes this document's boundary or
  // reloads before an afterInteractive third-party request can start.
  if (sensitive || !documentBoundaryReady || !documentBoundaryMatches) return null

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
