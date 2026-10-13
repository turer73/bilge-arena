'use client'

import Script from 'next/script'

const GA_ID = 'G-HDCR9YRQJ3'

/**
 * Google Analytics 4 — Consent Mode v2 entegrasyonu.
 *
 * Consent defaults are initialized without an external request. The GA library
 * is loaded only after a separate analytics grant; ads remain independent.
 */
export function GoogleAnalytics({ enabled }: { enabled: boolean }) {
  return (
    <>
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}

          // Consent Mode v2 — varsayilan: denied (4 sinyal birlikte)
          gtag('consent', 'default', {
            analytics_storage: 'denied',
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
            wait_for_update: 500
          });

          // v1 analytics choice also included ads; it is not a separate ad grant.
          // Only a fresh v2 choice can enable either purpose.
          try {
            var raw = localStorage.getItem('bilge-arena-cookie-consent');
            if (raw) {
              var consent = JSON.parse(raw);
              if (consent && consent.version === 2 && consent.essential === true) {
                gtag('consent', 'update', {
                  analytics_storage: consent.analytics === true ? 'granted' : 'denied',
                  ad_storage: consent.ads === true ? 'granted' : 'denied',
                  ad_user_data: 'denied',
                  ad_personalization: 'denied'
                });
                if (consent.analytics === true) {
                  gtag('js', new Date());
                  gtag('config', '${GA_ID}', {
                    page_path: window.location.pathname,
                    anonymize_ip: true
                  });
                }
              }
            }
          } catch(e) {
            // Bozuk consent kaydi: default 'denied' kalir (guvenli taraf) — sessiz yutma
            console.warn('[GA] consent parse hatasi:', e && e.message);
          }
        `}
      </Script>
      {enabled && (
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="lazyOnload"
        />
      )}
    </>
  )
}
