import type { Metadata, Viewport } from 'next'
import { Cinzel, DM_Sans } from 'next/font/google'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { CookieBanner } from '@/components/cookie-banner'
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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
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

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com'

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Bilge Arena',
    description: 'Oyunlastirilmis YKS hazirlık platformu',
    url: siteUrl,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'TRY',
    },
    inLanguage: 'tr',
    author: { '@type': 'Organization', name: 'Bilge Arena' },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Bilge Arena',
    url: siteUrl,
    logo: `${siteUrl}/logo-horizontal.png`,
    description: 'YKS\'ye hazirlanan ogrenciler icin oyunlastirilmis ogrenme platformu.',
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'iletisim@bilgearena.com',
      contactType: 'customer service',
      availableLanguage: 'Turkish',
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: siteUrl },
      { '@type': 'ListItem', position: 2, name: 'Arena', item: `${siteUrl}/arena` },
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
      <body className="min-h-screen bg-[var(--bg)] font-body text-[var(--text)] antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
        <CookieBanner />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
