import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Bilge Arena Oda: (player) route group layout
 * Sprint 1 PR4a Task 5
 *
 * Auth guard + outlet container. Anonim kullanici /giris'e yonlendirilir
 * (return path query'de gider). 4b'de navbar slot eklenir.
 */
export default async function PlayerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/giris?redirect=/oda')

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  )
}
