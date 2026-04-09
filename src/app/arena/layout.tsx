import type { Metadata } from 'next'
import { Navbar } from '@/components/layout/navbar'
import { ArenaAuxiliaries } from '@/components/layout/arena-auxiliaries'
import { OnboardingOverlay } from '@/components/onboarding/onboarding-overlay'

export const metadata: Metadata = {
  title: 'Arena',
  description: 'Bilge Arena oyun alani. Matematik, Turkce, Fen, Sosyal ve Ingilizce sorulari coz, XP kazan, siralamalarda yuksel!',
}

export default function ArenaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-16">
        {children}
      </main>
      <ArenaAuxiliaries />
      <OnboardingOverlay />
    </>
  )
}
