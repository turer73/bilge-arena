import bundleAnalyzer from '@next/bundle-analyzer'
import { withSentryConfig } from '@sentry/nextjs'
import withPWA from '@ducanh2912/next-pwa'

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  // Lint'i Docker build'den ayır — VPS'te OOM önlemi
  // Lint ayrıca CI/CD pipeline'da veya lokalde çalıştırılır
  eslint: { ignoreDuringBuilds: true },
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
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
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

  // Guvenlik + performans header'lari
  async headers() {
    return [
      {
        // Admin paneli — Cloudflare cache'lememeli
        source: '/admin/:path*',
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
              "img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.supabase.co https://*.googlesyndication.com https://pagead2.googlesyndication.com https://www.google.com https://www.google.com.tr https://tpc.googlesyndication.com https://www.googletagmanager.com https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.google-analytics.com https://www.googletagmanager.com https://plausible.io https://analytics.panola.app https://generativelanguage.googleapis.com https://*.ingest.de.sentry.io https://*.googlesyndication.com https://pagead2.googlesyndication.com https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google https://static.cloudflareinsights.com https://cloudflareinsights.com https://lh3.googleusercontent.com",
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
        // Statik asset'ler icin agresif caching (1 yil)
        source: '/(.*)\\.(png|jpg|jpeg|gif|webp|avif|svg|ico|woff|woff2)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // JS/CSS chunk'lari icin caching (Next.js zaten hash'liyor)
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },
}

const pwaConfig = withPWA({
  dest: 'public',
  register: false,      // Manuel register — hata yakalama ile
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  cacheOnFrontEndNav: true,
  reloadOnOnline: true,
  fallbacks: {
    document: '/offline',
  },
})

export default withSentryConfig(withBundleAnalyzer(pwaConfig(nextConfig)), {
  // Source map'leri Sentry'ye yukle ama client bundle'dan sil (guvenlik)
  hideSourceMaps: true,

  // Webpack plugin sessiz kalsin
  silent: true,

  // Build sirasinda telemetri gonderme
  telemetry: false,
})
