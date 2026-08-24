'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { isSensitiveWorkspacePath } from '@/lib/privacy/telemetry-policy'
import { GoogleAnalytics } from './google-analytics'

/**
 * Ucuncu taraf reklam ve analitik betiklerinin tek yukleme noktasi.
 * Hassas calisma alanlari dogrudan acildiginda hicbir betik DOM'a eklenmez.
 * Uygulama ici gecislerde event gonderimi ayrica merkezi rota politikasi ile
 * engellenir; bu nedenle daha once yuklenmis bir SDK yeni sayfayi olcemez.
 */
export function PrivacySafeThirdPartyScripts() {
  const pathname = usePathname()

  if (isSensitiveWorkspacePath(pathname)) return null

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
