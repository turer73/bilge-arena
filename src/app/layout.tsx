import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Bilge Arena — YKS Hazirlık Platformu',
    template: '%s | Bilge Arena',
  },
  description:
    'Oyunlastirilmis YKS hazirlık platformu. Matematik, Turkce, Fen, Sosyal ve Ingilizce sorularıyla ogren, kazan, yuksel!',
  keywords: ['YKS', 'TYT', 'AYT', 'universite sinavi', 'hazirlık', 'test', 'quiz', 'oyun'],
  authors: [{ name: 'Bilge Arena' }],
  creator: 'Bilge Arena',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  openGraph: {
    type: 'website',
    locale: 'tr_TR',
    siteName: 'Bilge Arena',
    title: 'Bilge Arena — YKS Hazirlık Platformu',
    description: 'Oyunlastirilmis YKS hazirlık platformu. Ogren, kazan, yuksel!',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bilge Arena — YKS Hazirlık Platformu',
    description: 'Oyunlastirilmis YKS hazirlık platformu. Ogren, kazan, yuksel!',
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

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Bilge Arena',
  description: 'Oyunlastirilmis YKS hazirlık platformu',
  url: process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com',
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Web',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'TRY',
  },
  inLanguage: 'tr',
  author: {
    '@type': 'Organization',
    name: 'Bilge Arena',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="tr" data-theme="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-[var(--bg)] text-[var(--text)] antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
