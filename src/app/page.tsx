import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { HeroSection } from '@/components/landing/hero-section'
import { StatsBar } from '@/components/landing/stats-bar'
import { GamesSection } from '@/components/landing/games-section'
import { SectionWrapper } from '@/components/landing/section-wrapper'
import { createClient } from '@/lib/supabase/server'
import type { HomepageElement, HomepageSectionConfig } from '@/types/database'

// ISR: Her 5 dakikada bir yeniden oluştur (Supabase sorgularını cache'le)
export const revalidate = 300

/* ─── SEO: Ana sayfa metadata ─── */
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').trim()

export const metadata: Metadata = {
  title: 'Bilge Arena — YKS Hazırlık Platformu | Oyunlaştırılmış Sınav Hazırlığı',
  description:
    'YKS, TYT ve AYT sınavlarına oyunlaştırılmış öğrenme ile hazırlan. Matematik, Türkçe, Fen, Sosyal ve İngilizce sorularını çöz, XP kazan, sıralamada yüksel! 3700+ soru, 5 oyun modu, tamamen ücretsiz.',
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
    description: 'YKS\'ye hazırlanmak artık oyun kadar eğlenceli! 3700+ soru, 5 oyun, tamamen ücretsiz.',
    images: [`${siteUrl}/og-image.png`],
  },
}

// Fold altindaki bilesenleri lazy-load (LCP iyilestirmesi)
const HowItWorks = dynamic(() => import('@/components/landing/how-it-works').then(m => ({ default: m.HowItWorks })))
const LeaderboardPreview = dynamic(() => import('@/components/landing/leaderboard-preview').then(m => ({ default: m.LeaderboardPreview })))
const CTASection = dynamic(() => import('@/components/landing/cta-section').then(m => ({ default: m.CTASection })))

// Fetch homepage content from DB
async function getHomepageContent() {
  try {
    const supabase = await createClient()
    const [{ data: sections }, { data: elements }] = await Promise.all([
      supabase.from('homepage_sections').select('*').eq('is_published', true),
      supabase.from('homepage_elements').select('*').eq('is_published', true).order('sort_order'),
    ])

    const sectionMap: Record<string, Record<string, unknown>> = {}
    sections?.forEach((s: HomepageSectionConfig) => {
      if (s.config && Object.keys(s.config).length > 0) {
        sectionMap[s.section_key] = s.config as Record<string, unknown>
      }
    })

    return { sections: sectionMap, elements: (elements || []) as HomepageElement[] }
  } catch {
    return { sections: {}, elements: [] }
  }
}

export default async function Home() {
  const { sections, elements } = await getHomepageContent()

  return (
    <>
      <Navbar />
      <main>
        <SectionWrapper section="hero" elements={elements}>
          <HeroSection config={sections.hero} />
        </SectionWrapper>
        <SectionWrapper section="stats" elements={elements}>
          <StatsBar config={sections.stats} />
        </SectionWrapper>
        <SectionWrapper section="games" elements={elements}>
          <GamesSection config={sections.games} />
        </SectionWrapper>
        {/* Fold-alti bolumleri content-visibility ile ertele */}
        <div className="cv-auto">
          <SectionWrapper section="how_it_works" elements={elements}>
            <HowItWorks config={sections.how_it_works} />
          </SectionWrapper>
        </div>
        <div className="cv-auto">
          <SectionWrapper section="leaderboard" elements={elements}>
            <LeaderboardPreview config={sections.leaderboard} />
          </SectionWrapper>
        </div>
        <div className="cv-auto">
          <SectionWrapper section="cta" elements={elements}>
            <CTASection config={sections.cta} />
          </SectionWrapper>
        </div>
      </main>
      <SectionWrapper section="footer" elements={elements}>
        <Footer config={sections.footer} />
      </SectionWrapper>
    </>
  )
}
