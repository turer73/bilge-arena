import dynamic from 'next/dynamic'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { HeroSection } from '@/components/landing/hero-section'
import { StatsBar } from '@/components/landing/stats-bar'
import { GamesSection } from '@/components/landing/games-section'

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
        <HowItWorks />
        <LeaderboardPreview />
        <CTASection />
      </main>
      <Footer />
    </>
  )
}
