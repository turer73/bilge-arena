import type { Metadata } from 'next'
import { Navbar } from '@/components/layout/navbar'
import { ArenaAuxiliaries } from '@/components/layout/arena-auxiliaries'
import dynamic from 'next/dynamic'

const OnboardingOverlay = dynamic(() => import('@/components/onboarding/onboarding-overlay').then(m => m.OnboardingOverlay))

export const metadata: Metadata = {
  title: 'Arena',
  description: 'Bilge Arena oyun alanı. Matematik, Türkçe, Fen, Sosyal ve İngilizce sorularını çöz, XP kazan, sıralamalarda yüksel!',
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
