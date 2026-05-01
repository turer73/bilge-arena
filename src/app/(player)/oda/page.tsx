import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchMyRooms, fetchPublicRooms } from '@/lib/rooms/server-fetch'
import { RoomCard } from '@/components/oda/RoomCard'
import { EmptyState } from '@/components/oda/EmptyState'
import { TabNav } from '@/components/oda/TabNav'
import { PublicRoomList } from '@/components/oda/PublicRoomList'
import { QuickPlayPanel } from '@/components/oda/QuickPlayPanel'

/**
 * Bilge Arena Oda: /oda 2-sekmeli liste
 * Sprint 1 PR4a Task 5 + Sprint 2A Task 3
 *
 * Server Component. 2 tab:
 *   - mine (default): Odalarım (host veya member oldugun, RLS filter)
 *   - public: Aktif Odalar (is_public=true + state=lobby, RLS public policy)
 *
 * Anonim user da public tab'a erisebilir (PostgREST PGRST_DB_ANON_ROLE=anon).
 * mine tab auth gerek (login redirect).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; cat?: string }>
}) {
  const params = await searchParams
  const tab: 'mine' | 'public' = params.tab === 'public' ? 'public' : 'mine'
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  // mine tab: auth zorunlu
  if (tab === 'mine' && !session?.access_token) {
    redirect('/giris?redirect=/oda')
  }

  const myRooms =
    tab === 'mine' && session?.access_token
      ? await fetchMyRooms(session.access_token)
      : []
  const publicRooms =
    tab === 'public'
      ? await fetchPublicRooms(session?.access_token ?? null, {
          category: params.cat,
        })
      : []

  return (
    <>
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">
          {tab === 'public' ? 'Aktif Odalar' : 'Odalarım'}
        </h1>
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

      <TabNav activeTab={tab} />

      {tab === 'public' ? (
        <PublicRoomList
          rooms={publicRooms}
          selectedCategory={params.cat ?? ''}
        />
      ) : (
        <>
          <QuickPlayPanel />
          {myRooms.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-3">
              {myRooms.map((room) => (
                <RoomCard key={room.id} room={room} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}
