import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchMyRooms } from '@/lib/rooms/server-fetch'
import { RoomCard } from '@/components/oda/RoomCard'
import { EmptyState } from '@/components/oda/EmptyState'

/**
 * Bilge Arena Oda: /oda "Benim odalarim" listesi
 * Sprint 1 PR4a Task 5
 *
 * Server Component. RLS otomatik filtreler (rooms_select_host_or_member).
 * Sadece lobby + in_progress state odalar gorunur. Empty state'te 2 CTA.
 */
export default async function Page() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) redirect('/giris?redirect=/oda')

  const rooms = await fetchMyRooms(session.access_token)

  return (
    <>
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">Odalarım</h1>
        <div className="flex gap-2">
          <Link href="/oda/yeni" className="btn-primary px-4 py-2 text-sm">
            + Yeni Oda
          </Link>
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-sub)] opacity-60"
            title="4b'de aktif olur"
          >
            Kod ile Katıl <span className="ml-1 text-[10px]">(yakında)</span>
          </button>
        </div>
      </header>

      {rooms.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {rooms.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </div>
      )}
    </>
  )
}
