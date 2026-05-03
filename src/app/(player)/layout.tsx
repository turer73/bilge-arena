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
    <div className="min-h-screen bg-[var(--bg)]">
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  )
}
