import type { Metadata } from 'next'
import { Navbar } from '@/components/layout/navbar'
import { ArenaAuxiliaries } from '@/components/layout/arena-auxiliaries'
import dynamic from 'next/dynamic'

const OnboardingOverlay = dynamic(() => import('@/components/onboarding/onboarding-overlay').then(m => m.OnboardingOverlay), { ssr: false })

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
