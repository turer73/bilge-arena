'use client'

import Script from 'next/script'

const GA_ID = 'G-HDCR9YRQJ3'

/**
 * Google Analytics 4 — Consent Mode v2 entegrasyonu.
 *
 * Varsayilan olarak analytics_storage 'denied' baslar.
 * Kullanici cerez banner'ini kabul edince consent.ts
 * icinden gtag('consent', 'update', ...) cagirilir ve tam
 * veri toplama baslar.
 *
 * Onay olmadan da cookieless ping gonderir (anonim veri).
 */
export function GoogleAnalytics() {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}

          // Consent Mode v2 — varsayilan: denied
          gtag('consent', 'default', {
            analytics_storage: 'denied',
            ad_storage: 'denied',
            wait_for_update: 500
          });

          gtag('js', new Date());
          gtag('config', '${GA_ID}', {
            page_path: window.location.pathname,
            anonymize_ip: true
          });

          // Daha once onay verildiyse hemen grant et (granular format)
          try {
            var raw = localStorage.getItem('bilge-arena-cookie-consent');
            if (raw) {
              var consent = JSON.parse(raw);
              var granted = (typeof consent === 'string' && consent === 'accepted')
                || (consent && consent.analytics === true);
              if (granted) {
                gtag('consent', 'update', {
                  analytics_storage: 'granted'
                });
              }
            }
          } catch(e) {}
        `}
      </Script>
    </>
  )
}
