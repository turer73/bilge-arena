import bundleAnalyzer from '@next/bundle-analyzer'
import { withSentryConfig } from '@sentry/nextjs'
import { assertTytSocialRolloutEnv } from './scripts/security/validate-tyt-social-rollout-env.mjs'
// next-pwa kaldirildi: Next 16 ile sw.js dispatcher'i uretmiyordu (workbox/
// swe-worker uretti ama master sw.js yok) → /sw.js HTML fallback → workbox
// install fail → PWA broken (Codex P1 PR #108). Manuel public/sw.js
// yazildi (build_id-bagimsiz, vanilla SW API + offline fallback).

// NEXT_PUBLIC bayragi build-time'da donar. Client/server ayrik bir rollout
// uretilmesini daha deploy edilmeden reddet.
assertTytSocialRolloutEnv(process.env)

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  // `output: 'standalone'` SADECE Docker self-host (Dockerfile) icin gerekli.
  // Vercel'de standalone, public/* dosyalarini .next/standalone/public/'a
  // KOPYALAMAZ → sw.js/workbox/favicon 404, PWA bozulur. O yuzden Vercel'de
  // KAPALI; yalniz Dockerfile DOCKER_BUILD=true verince acilir (Dockerfile
  // public/ ve .next/static'i zaten elle kopyaliyor, server.js standalone'dan gelir).
  output: process.env.DOCKER_BUILD === 'true' ? 'standalone' : undefined,

  typescript: { ignoreBuildErrors: false },
  images: {
    // AVIF > WebP > JPEG — en iyi sıkıştırma formatlarını tercih et
    formats: ['image/avif', 'image/webp'],
    // Yaygın cihaz genişlikleri — gereksiz boyut üretimini engeller
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    // Optimize edilmiş görselleri 60 gün cache'le
    minimumCacheTTL: 5184000,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        // Google OAuth avatar CDN — lh3/lh4/lh5 vb. subdomainleri cover eder
        protocol: 'https',
        hostname: '*.googleusercontent.com',
      },
    ],
  },

  // Deneysel performans bayraklari
  experimental: {
    // Optimize edilmiş paket importlari — tree-shaking iyilestirmesi
    optimizePackageImports: ['lucide-react', 'framer-motion', 'zustand'],
  },

  // Powered-by header'ini kaldir (guvenlik + kucuk header boyutu)
  poweredByHeader: false,

  // Sıkıştırma: Next.js gzip/brotli
  compress: true,

  // ads.txt rewrite — Next.js standalone doesn't serve public/*.txt reliably
  async rewrites() {
    return [
      { source: '/ads.txt', destination: '/api/ads-txt' },
    ]
  },

  /**
   * Permanent redirects for legacy / orphan URLs.
   *
   * GSC "Yeniden yonlendirme hatasi" pattern on bilgearena.com:
   *   www.bilgearena.com/<bare-name>  -- 308 -->  bilgearena.com/<bare-name>  -- 404
   *
   * Common external/historical crawl paths that 404 — bare game names without
   * the /arena prefix, English auth paths, generic "oyunlar" landing.
   * All targets verified 200 before commit.
   */
  async redirects() {
    return [
      // Bare game names → /arena/<game> (the dynamic [game] route)
      { source: '/matematik', destination: '/arena/matematik', permanent: true },
      { source: '/turkce',    destination: '/arena/turkce',    permanent: true },
      { source: '/fen',       destination: '/arena/fen',       permanent: true },
      { source: '/sosyal',    destination: '/arena/sosyal',    permanent: true },
      { source: '/wordquest', destination: '/arena/wordquest', permanent: true },
      // Generic game landings
      { source: '/oyun',     destination: '/arena', permanent: true },
      { source: '/oyunlar',  destination: '/arena', permanent: true },
      { source: '/anasayfa', destination: '/',      permanent: true },
      // Legacy auth paths — site uses /giris (Turkish)
      { source: '/login',    destination: '/giris', permanent: true },
      { source: '/register', destination: '/giris', permanent: true },
      { source: '/kayit',    destination: '/giris', permanent: true },
    ]
  },

  // Guvenlik + performans header'lari
  async headers() {
    return [
      {
        // Admin API — PWA service worker ve CDN cache'lemesin (canli sayilar)
        source: '/api/admin/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-cache, no-store, must-revalidate' },
          { key: 'CDN-Cache-Control', value: 'no-store' },
          { key: 'Cloudflare-CDN-Cache-Control', value: 'no-store' },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // unsafe-inline: Next.js RSC inline script + GA consent (Next.js 15'te nonce ile degistirilebilir)
              // unsafe-eval: Google AdSense zorunlu kildi (sektör standardi)
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://plausible.io https://analytics.panola.app https://*.googlesyndication.com https://pagead2.googlesyndication.com https://adservice.google.com https://adservice.google.com.tr https://www.google.com https://tpc.googlesyndication.com https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google https://static.cloudflareinsights.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              // NOT: *.googleusercontent.com — Google OAuth avatar'lari lh3/lh4/lh5/lh6 gibi
              // farkli CDN edge'lerden gelebiliyor (geo-load balancing). Tek subdomain listelemek
              // bazi kullanicilarin avatarini bloklar. Wildcard hepsini karsilar, hepsi Google owned.
              "img-src 'self' data: blob: https://*.googleusercontent.com https://*.supabase.co https://*.googlesyndication.com https://pagead2.googlesyndication.com https://www.google.com https://www.google.com.tr https://tpc.googlesyndication.com https://www.googletagmanager.com https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google",
              // media-src: video temalar (background_assets) Supabase Storage'tan mp4/webm
              // ile gelir. Ayarlanmazsa default-src 'self' bloklar → videolar oynamaz.
              "media-src 'self' blob: data: https://*.supabase.co",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co wss://ws-dev.bilgearena.com https://ws-dev.bilgearena.com https://www.google-analytics.com https://www.googletagmanager.com https://plausible.io https://analytics.panola.app https://generativelanguage.googleapis.com https://*.ingest.de.sentry.io https://*.googlesyndication.com https://pagead2.googlesyndication.com https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google https://static.cloudflareinsights.com https://cloudflareinsights.com https://*.googleusercontent.com",
              "frame-src 'self' https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "report-uri https://csp.3d-labx.com/csp-report",
            ].join('; '),
          },
        ],
      },
      {
        // Öğretmen sınıfları özel üye/ödev verisi taşır. Nonce tabanli CSP
        // src/proxy.ts tarafindan istek basina uretilir; burada yalniz cache ve
        // referrer siniri tutulur.
        source: '/arena/sinif/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-cache, no-store, must-revalidate' },
          { key: 'CDN-Cache-Control', value: 'no-store' },
          { key: 'Cloudflare-CDN-Cache-Control', value: 'no-store' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
      {
        // Kurum calisma alani reklam/analitik document boundary'sinin arkasinda
        // calisir. Istek-bazli nonce CSP src/proxy.ts tarafindan uygulanir.
        source: '/arena/kurum/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-cache, no-store, must-revalidate' },
          { key: 'CDN-Cache-Control', value: 'no-store' },
          { key: 'Cloudflare-CDN-Cache-Control', value: 'no-store' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
      {
        // Hesap guvenligi parola/MFA islemleri tasir ve telemetry-policy'de
        // hassas sayilir; kurum yuzeyleriyle ayni reklamsiz document boundary.
        source: '/hesap/guvenlik/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-cache, no-store, must-revalidate' },
          { key: 'CDN-Cache-Control', value: 'no-store' },
          { key: 'Cloudflare-CDN-Cache-Control', value: 'no-store' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
      {
        // Admin yuzeyinde reklam/analitik yoktur. Istek-bazli nonce CSP
        // src/proxy.ts tarafindan uygulanir.
        source: '/admin/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-cache, no-store, must-revalidate' },
          { key: 'CDN-Cache-Control', value: 'no-store' },
          { key: 'Cloudflare-CDN-Cache-Control', value: 'no-store' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
      {
        // Statik asset'ler icin agresif caching (1 yil)
        source: '/(.*)\\.(png|jpg|jpeg|gif|webp|avif|svg|ico|woff|woff2)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },
}

// pwaConfig kaldirildi — manuel public/sw.js artik kullaniliyor.
// SWRegister component (src/components/layout/sw-register.tsx) /sw.js
// register eder. Offline fallback /offline route uzerinden.

export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  // Source map'leri Sentry'ye yukle ama client bundle'dan sil (guvenlik)
  hideSourceMaps: true,

  // Webpack plugin sessiz kalsin
  silent: true,

  // Build sirasinda telemetri gonderme
  telemetry: false,
})
