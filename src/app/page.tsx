import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { HeroSection } from '@/components/landing/hero-section'
import { StatsBar } from '@/components/landing/stats-bar'
import { GamesSection } from '@/components/landing/games-section'

/* ─── SEO: Ana sayfa metadata ─── */
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').trim()

export const metadata: Metadata = {
  title: 'Bilge Arena — YKS Hazırlık Platformu | Oyunlaştırılmış Sınav Hazırlığı',
  description:
    'YKS, TYT ve AYT sınavlarına oyunlaştırılmış öğrenme ile hazırlan. Matematik, Türkçe, Fen, Sosyal ve İngilizce sorularını çöz, XP kazan, sıralamada yüksel! 1089+ soru, 5 oyun modu, tamamen ücretsiz.',
  keywords: [
    'YKS hazırlık', 'TYT soru çöz', 'AYT hazırlık', 'üniversite sınavı',
    'online test çöz', 'YKS matematik', 'TYT Türkçe', 'TYT Fen',
    'sınav hazırlık platformu', 'oyunlaştırılmış öğrenme', 'ücretsiz YKS',
  ],
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title: 'Bilge Arena — Oyunlaştırılmış YKS Hazırlık Platformu',
    description: 'YKS\'ye hazırlanmak artık oyun kadar eğlenceli! Soruları çöz, XP kazan, zirvede yerini al.',
    url: siteUrl,
    images: [{ url: `${siteUrl}/og-image.png`, width: 1200, height: 630, alt: 'Bilge Arena YKS Platformu' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bilge Arena — Oyunlaştırılmış YKS Hazırlık',
    description: 'YKS\'ye hazırlanmak artık oyun kadar eğlenceli! 1089+ soru, 5 oyun, tamamen ücretsiz.',
    images: [`${siteUrl}/og-image.png`],
  },
}

// Fold altindaki bilesenleri lazy-load (LCP iyilestirmesi)
const HowItWorks = dynamic(() => import('@/components/landing/how-it-works').then(m => ({ default: m.HowItWorks })))
const LeaderboardPreview = dynamic(() => import('@/components/landing/leaderboard-preview').then(m => ({ default: m.LeaderboardPreview })))
const CTASection = dynamic(() => import('@/components/landing/cta-section').then(m => ({ default: m.CTASection })))

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
        <StatsBar />
        <GamesSection />
        {/* Fold-alti bolumleri content-visibility ile ertele */}
        <div className="cv-auto">
          <HowItWorks />
        </div>
        <div className="cv-auto">
          <LeaderboardPreview />
        </div>
        <div className="cv-auto">
          <CTASection />
        </div>
      </main>
      <Footer />
    </>
  )
}
