import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import dynamic from 'next/dynamic'

const CookieBanner = dynamic(() => import('@/components/cookie-banner').then(m => m.CookieBanner))
import { ToastContainer } from '@/components/ui/toast'
import { SWRegister } from '@/components/layout/sw-register'
import { PWAInstallPrompt } from '@/components/layout/pwa-install-prompt'
import { OfflineIndicator } from '@/components/layout/offline-indicator'
import { GlobalBackground } from '@/components/layout/global-background'
import { PrivacySafeThirdPartyScripts } from '@/components/analytics/privacy-safe-third-party-scripts'
import { TEACHER_INVITE_BOOTSTRAP_SCRIPT } from '@/lib/teacher-classroom/invite-bootstrap'
import { ACTIVATION_EXPERIMENT_BOOTSTRAP_SCRIPT } from '@/lib/experiments/activation'
import './globals.css'

/* ─── Lokal fontlar (next/font/local) — build artik Google Fonts agina BAGIMLI DEGIL.
   Variable TTF'ler src/app/fonts/ altinda; tum latin-ext glyph'leri (Turkce dahil) icerir. */
const cinzel = localFont({
  src: './fonts/Cinzel.ttf',
  weight: '400 900',
  variable: '--font-cinzel',
  display: 'swap',
})

const dmSans = localFont({
  src: './fonts/DMSans.ttf',
  weight: '100 1000',
  variable: '--font-dm-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Bilge Arena — YKS · LGS · AYT Hazırlık Platformu',
    template: '%s | Bilge Arena',
  },
  description:
    'Bilge Arena\'da YKS ve LGS\'ye hazırlan: binlerce TYT · AYT sorusu, anlık sıralama, ödül sistemi. Arena\'ya gir, puan kazan, sıralamada yüksel — ücretsiz!',
  keywords: ['YKS', 'arena yks', 'LGS', 'TYT', 'AYT', 'üniversite sınavı', 'yks hazırlık', 'ortaokul sınavı', 'hazırlık', 'test', 'quiz', 'oyun'],
  authors: [{ name: 'Bilge Arena' }],
  creator: 'Bilge Arena',
  metadataBase: new URL((process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').trim()),
  openGraph: {
    type: 'website',
    locale: 'tr_TR',
    siteName: 'Bilge Arena',
    title: 'Bilge Arena — YKS · LGS · AYT Hazırlık Platformu',
    description: 'Bilge Arena\'da YKS ve LGS\'ye hazırlan: binlerce soru, anlık sıralama, ödül sistemi — ücretsiz!',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bilge Arena — YKS · LGS · AYT Hazırlık Platformu',
    description: 'Bilge Arena\'da YKS ve LGS\'ye hazırlan: binlerce soru, anlık sıralama, ödül sistemi — ücretsiz!',
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

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').trim()

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${siteUrl}/#website`,
    name: 'Bilge Arena',
    alternateName: 'BilgeArena',
    url: siteUrl,
    inLanguage: 'tr-TR',
    publisher: { '@id': `${siteUrl}/#organization` },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': `${siteUrl}/#webapp`,
    name: 'Bilge Arena',
    description: 'Oyunlaştırılmış YKS, LGS ve AYT hazırlık platformu. Matematik, Türkçe, Fen, Sosyal ve İngilizce sorularıyla öğren, kazan, yüksel!',
    url: siteUrl,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'TRY',
    },
    inLanguage: 'tr',
    // aggregateRating KALDIRILDI: sitede gorunur puanlama mekanizmasi yok;
    // dogrulanamayan rating markup'i Google manuel-aksiyon sebebi
    author: { '@id': `${siteUrl}/#organization` },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    '@id': `${siteUrl}/#organization`,
    name: 'Bilge Arena',
    url: siteUrl,
    logo: `${siteUrl}/logo-horizontal.png`,
    description: 'YKS, LGS ve AYT\'ye hazırlanan öğrenciler için oyunlaştırılmış öğrenme platformu.',
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'iletisim@bilgearena.com',
      contactType: 'customer service',
      availableLanguage: 'Turkish',
    },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'YKS · LGS · AYT Hazırlık Oyunları',
      itemListElement: [
        { '@type': 'Course', name: 'Matematik', description: 'TYT · AYT-SAY · LGS Matematik soruları — sayılar, geometri, türev, integral', provider: { '@type': 'Organization', name: 'Bilge Arena' } },
        { '@type': 'Course', name: 'Türkçe & Edebiyat', description: 'TYT · AYT-EA · LGS Türkçe soruları — paragraf, dil bilgisi, edebiyat', provider: { '@type': 'Organization', name: 'Bilge Arena' } },
        { '@type': 'Course', name: 'Fen Bilimleri', description: 'TYT · AYT-SAY · LGS Fen Bilimleri soruları — fizik, kimya, biyoloji', provider: { '@type': 'Organization', name: 'Bilge Arena' } },
        { '@type': 'Course', name: 'Sosyal Bilimler', description: 'TYT · LGS Sosyal Bilimler soruları — tarih, coğrafya, felsefe', provider: { '@type': 'Organization', name: 'Bilge Arena' } },
        { '@type': 'Course', name: 'İngilizce (WordQuest)', description: 'YDT İngilizce soruları — vocabulary, grammar, reading', provider: { '@type': 'Organization', name: 'Bilge Arena' } },
      ],
    },
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
        {/* Ana sayfa A/B varyantini boyamadan once sabitle; flicker/CLS olusmasin. */}
        <script
          id="activation-experiment-bootstrap"
          dangerouslySetInnerHTML={{ __html: ACTIVATION_EXPERIMENT_BOOTSTRAP_SCRIPT }}
        />
        {/* Davet fragmentini analytics betiklerinden önce first-party belleğe al ve URL'den sil. */}
        <script
          id="teacher-invite-bootstrap"
          dangerouslySetInnerHTML={{ __html: TEACHER_INVITE_BOOTSTRAP_SCRIPT }}
        />
        {/* Preconnect — Supabase API + Storage (fontlar artik lokal; Google Fonts CDN gerekmiyor) */}
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL!} />
        <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL!} />
      </head>
      <body className="min-h-screen bg-[var(--bg)] font-body text-[var(--text)] antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <OfflineIndicator />
        <GlobalBackground />
        {children}
        <ToastContainer />
        <CookieBanner />
        <SWRegister />
        <PWAInstallPrompt />
        <PrivacySafeThirdPartyScripts />
      </body>
    </html>
  )
}
