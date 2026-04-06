import Script from 'next/script'
import type { Metadata, Viewport } from 'next'
import { Cinzel, DM_Sans } from 'next/font/google'
import { CookieBanner } from '@/components/cookie-banner'
import { ToastContainer } from '@/components/ui/toast'
import { SWRegister } from '@/components/layout/sw-register'
import { PWAInstallPrompt } from '@/components/layout/pwa-install-prompt'
import { OfflineIndicator } from '@/components/layout/offline-indicator'
import { GoogleAnalytics } from '@/components/analytics/google-analytics'
import './globals.css'

/* ─── Google Fonts — Template birebir ─── */
const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['700', '900'],
  variable: '--font-cinzel',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Bilge Arena — YKS Hazırlık Platformu',
    template: '%s | Bilge Arena',
  },
  description:
    'Oyunlaştırılmış YKS hazırlık platformu. Matematik, Türkçe, Fen, Sosyal ve İngilizce sorularıyla öğren, kazan, yüksel!',
  keywords: ['YKS', 'TYT', 'AYT', 'üniversite sınavı', 'hazırlık', 'test', 'quiz', 'oyun'],
  authors: [{ name: 'Bilge Arena' }],
  creator: 'Bilge Arena',
  metadataBase: new URL((process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').trim()),
  openGraph: {
    type: 'website',
    locale: 'tr_TR',
    siteName: 'Bilge Arena',
    title: 'Bilge Arena — YKS Hazırlık Platformu',
    description: 'Oyunlaştırılmış YKS hazırlık platformu. Öğren, kazan, yüksel!',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bilge Arena — YKS Hazırlık Platformu',
    description: 'Oyunlaştırılmış YKS hazırlık platformu. Öğren, kazan, yüksel!',
    images: ['/og-image.png'],
  },
  icons: {
    icon: [
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#2563EB',
  width: 'device-width',
  initialScale: 1,
}

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.bilgearena.com').trim()

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Bilge Arena',
    description: 'Oyunlaştırılmış YKS hazırlık platformu. Matematik, Türkçe, Fen, Sosyal ve İngilizce sorularıyla öğren, kazan, yüksel!',
    url: siteUrl,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'TRY',
    },
    inLanguage: 'tr',
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '120',
      bestRating: '5',
    },
    author: { '@type': 'Organization', name: 'Bilge Arena' },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: 'Bilge Arena',
    url: siteUrl,
    logo: `${siteUrl}/logo-horizontal.png`,
    description: 'YKS\'ye hazırlanan öğrenciler için oyunlaştırılmış öğrenme platformu.',
    sameAs: [],
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'iletisim@bilgearena.com',
      contactType: 'customer service',
      availableLanguage: 'Turkish',
    },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'YKS Hazırlık Oyunları',
      itemListElement: [
        { '@type': 'Course', name: 'Matematik', description: 'TYT-AYT Matematik soruları', provider: { '@type': 'Organization', name: 'Bilge Arena' } },
        { '@type': 'Course', name: 'Türkçe', description: 'TYT Türkçe soruları', provider: { '@type': 'Organization', name: 'Bilge Arena' } },
        { '@type': 'Course', name: 'Fen Bilimleri', description: 'TYT Fen Bilimleri soruları', provider: { '@type': 'Organization', name: 'Bilge Arena' } },
        { '@type': 'Course', name: 'Sosyal Bilimler', description: 'TYT Sosyal Bilimler soruları', provider: { '@type': 'Organization', name: 'Bilge Arena' } },
        { '@type': 'Course', name: 'İngilizce (WordQuest)', description: 'YDT İngilizce soruları', provider: { '@type': 'Organization', name: 'Bilge Arena' } },
      ],
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: siteUrl },
      { '@type': 'ListItem', position: 2, name: 'Arena', item: `${siteUrl}/arena` },
      { '@type': 'ListItem', position: 3, name: 'Sıralama', item: `${siteUrl}/arena/siralama` },
    ],
  },
]

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="tr"
      data-theme="dark"
      className={`${cinzel.variable} ${dmSans.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* CSP — meta tag ile tanimlaniyor (Cloudflare HTTP header'dan bazi domainleri siliyor) */}
        <meta
          httpEquiv="Content-Security-Policy"
          content={[
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://plausible.io https://analytics.panola.app https://*.googlesyndication.com https://pagead2.googlesyndication.com https://adservice.google.com https://adservice.google.com.tr https://www.google.com https://tpc.googlesyndication.com https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google https://static.cloudflareinsights.com",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.supabase.co https://*.googlesyndication.com https://pagead2.googlesyndication.com https://www.google.com https://www.google.com.tr https://tpc.googlesyndication.com https://www.googletagmanager.com",
            "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.google-analytics.com https://www.googletagmanager.com https://plausible.io https://analytics.panola.app https://generativelanguage.googleapis.com https://*.ingest.de.sentry.io https://*.googlesyndication.com https://pagead2.googlesyndication.com https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google https://static.cloudflareinsights.com https://cloudflareinsights.com",
            "frame-src 'self' https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google",
            "base-uri 'self'",
            "form-action 'self'",
          ].join('; ')}
        />
        {/* Preconnect — Supabase API + Storage, Google Fonts CDN */}
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL!} />
        <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL!} />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen bg-[var(--bg)] font-body text-[var(--text)] antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <OfflineIndicator />
        {children}
        <ToastContainer />
        <CookieBanner />
        <SWRegister />
        <PWAInstallPrompt />
        <GoogleAnalytics />
        <Script defer data-domain="bilgearena.com" src="https://analytics.panola.app/js/script.js" strategy="afterInteractive" />
        {process.env.NEXT_PUBLIC_ADSENSE_ID && (
          <Script
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_ID}`}
            strategy="lazyOnload"
            crossOrigin="anonymous"
          />
        )}
      </body>
    </html>
  )
}
