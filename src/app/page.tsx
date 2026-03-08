import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { HeroSection } from '@/components/landing/hero-section'
import { StatsBar } from '@/components/landing/stats-bar'
import { GamesSection } from '@/components/landing/games-section'
import { HowItWorks } from '@/components/landing/how-it-works'
import { LeaderboardPreview } from '@/components/landing/leaderboard-preview'
import { CTASection } from '@/components/landing/cta-section'

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
