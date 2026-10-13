import type { Metadata } from 'next'
import { Navbar } from '@/components/layout/navbar'
import { BottomNav } from '@/components/layout/bottom-nav'
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
      {/* Mobilde alt tab-bar yuksekligi kadar bosluk birak ki icerik altta kalmasin */}
      <main data-arena-main className="min-h-screen w-full min-w-0 overflow-x-clip scroll-pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] pt-[var(--navbar-h)] pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] md:scroll-pb-0 md:pb-0">
        {children}
      </main>
      <ArenaAuxiliaries />
      <BottomNav />
      <OnboardingOverlay />
    </>
  )
}
