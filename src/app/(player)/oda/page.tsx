import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchMyRooms, fetchPublicRooms } from '@/lib/rooms/server-fetch'
import { RoomCard } from '@/components/oda/RoomCard'
import { EmptyState } from '@/components/oda/EmptyState'
import { TabNav } from '@/components/oda/TabNav'
import { PublicRoomList } from '@/components/oda/PublicRoomList'
import { QuickPlayPanel } from '@/components/oda/QuickPlayPanel'
import { ArenaModeCards } from '@/components/oda/ArenaModeCards'
import { ArrowRight, KeyRound, Plus, UsersRound } from 'lucide-react'

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
      <header className="mb-5">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--focus-text)]">
          ODA MODU
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
          Birlikte çöz, yarış ve devam et
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-sub)]">
          Hemen antrenman yap, arkadaşının odasına katıl veya kendi oyununu
          kur.
        </p>
      </header>

      <ArenaModeCards />

      <section aria-labelledby="room-entry-title" className="mb-8">
        <h2 id="room-entry-title" className="sr-only">
          Oda moduna giriş seçenekleri
        </h2>
        <QuickPlayPanel authenticated={Boolean(session?.access_token)} />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Link
            href="/oda/kod"
            className="group flex min-h-24 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition-colors hover:border-[var(--focus)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--wisdom-bg)] text-[var(--wisdom-text)]">
              <KeyRound aria-hidden="true" className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold">Kodla Katıl</span>
              <span className="mt-0.5 block text-xs leading-5 text-[var(--text-sub)]">
                Arkadaşının 6 karakterli kodunu kullan.
              </span>
            </span>
            <ArrowRight
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5"
            />
          </Link>
          <Link
            href="/oda/yeni"
            className="group flex min-h-24 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition-colors hover:border-[var(--focus)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          >
            <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--growth-bg)] text-[var(--growth-text)]">
              <UsersRound aria-hidden="true" className="h-5 w-5" />
              <Plus
                aria-hidden="true"
                className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-[var(--surface)] p-0.5"
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold">Oda Kur</span>
              <span className="mt-0.5 block text-xs leading-5 text-[var(--text-sub)]">
                Hazır ayarlardan birini seç ve davet et.
              </span>
            </span>
            <ArrowRight
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </div>
      </section>

      <section aria-labelledby="room-list-title">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              DEVAM ET
            </p>
            <h2 id="room-list-title" className="mt-1 text-lg font-extrabold">
              Odalar
            </h2>
          </div>
          {tab === 'mine' && myRooms.length > 0 && (
            <span className="rounded-full bg-[var(--surface)] px-2.5 py-1 text-xs font-bold text-[var(--text-sub)]">
              {myRooms.length} oda
            </span>
          )}
        </div>

        <TabNav activeTab={tab} />

        {tab === 'public' ? (
          <PublicRoomList
            rooms={publicRooms}
            selectedCategory={params.cat ?? ''}
          />
        ) : myRooms.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            {myRooms.map((room) => (
              <RoomCard key={room.id} room={room} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}
