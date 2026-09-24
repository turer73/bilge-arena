import { BottomNav } from '@/components/layout/bottom-nav'
import { Navbar } from '@/components/layout/navbar'
import { AcademyTabletNav } from '@/components/academy/academy-tablet-nav'

/**
 * Bilge Arena Oda: (player) route group layout
 * Sprint 1 PR4a Task 5 + 2026-05-03 auth redirect path-preserve fix
 *
 * Outlet container only — auth guard her page'in kendisinde, cunku layout
 * pathname'e erisemez (Next 16 SC + middleware yok). Hardcoded redirect=/oda
 * ile pathname kayboluyordu, /oda/kod gibi niyet bozuluyordu (Codex P1).
 *
 * Her /oda/* page kendi auth check + redirect query parametresini set eder:
 *   - /oda/page.tsx → redirect=/oda
 *   - /oda/yeni/page.tsx → redirect=/oda/yeni
 *   - /oda/kod/page.tsx → redirect=/oda/kod
 *   - /oda/[code]/page.tsx → redirect=/oda/{code}
 */
export default function PlayerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div data-room-shell className="min-h-screen bg-[var(--bg)] md:bg-transparent">
      <div className="hidden lg:block">
        <Navbar />
      </div>
      {/* Mobilde gerçek alt-nav tokenı kadar içerik ve odak kaydırma boşluğu bırak. */}
      <main data-player-main className="mx-auto max-w-3xl scroll-pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] px-4 pt-8 pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] md:max-w-[1180px] md:scroll-pb-0 md:px-5 md:pt-0 md:pb-8 lg:px-6 lg:pt-[calc(var(--navbar-h)+2rem)]">
        <AcademyTabletNav active="rooms" />
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
