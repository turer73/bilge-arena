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
        {/* Preconnect — Supabase API + Storage (fontlar artik lokal; Google Fonts CDN gerekmiyor) */}
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL!} />
        <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL!} />
      </head>
      <body className="min-h-screen bg-[var(--bg)] font-body text-[var(--text)] antialiased">
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
