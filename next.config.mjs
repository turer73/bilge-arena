import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
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
}

export default withSentryConfig(nextConfig, {
  // Source map'leri Sentry'ye yukle ama client bundle'dan sil (guvenlik)
  hideSourceMaps: true,

  // Webpack plugin sessiz kalsin
  silent: true,

  // Build sirasinda telemetri gonderme
  telemetry: false,
})
