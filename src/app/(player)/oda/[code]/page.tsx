import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  fetchRoomByCode,
  fetchRoomState,
  fetchLobbyPreviewQuestion,
} from '@/lib/rooms/server-fetch'
import { LobbyContainer } from '@/components/oda/LobbyContainer'

/**
 * Bilge Arena Oda: /oda/[code] real lobby (PR4b)
 *
 * Server Component:
 *   1) Auth + session JWT zorunlu (yoksa /giris?redirect=...)
 *   2) Code -> room ID resolve (RLS member-only, yok ise 404)
 *   3) Initial state SSR fetch (room + members + current_round)
 *   4) <LobbyContainer/> client component'a aktar — useRoomChannel ile
 *      postgres_changes + presence Realtime sync baslar
 *
 * Codex P1 fix (T8 PR3 follow-up): generateMetadata burada DEGIL — sosyal
 * medya crawler oturumsuz hit edip /giris'e redirect olurdu. Public share
 * route /p/[code] OG metadata flow saglar.
 */

export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/giris?redirect=/oda/${code}`)
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) redirect(`/giris?redirect=/oda/${code}`)

  // Code -> ID resolve (RLS member-only)
  const room = await fetchRoomByCode(session.access_token, code)
  if (!room) notFound()

  // Initial state SSR (full lobby payload)
  const partial = await fetchRoomState(session.access_token, room.id, user.id)
  if (!partial) notFound()

  // Hook ephemeral fields (online + typing_users + isStale) SSR'da bos baslat,
  // mount sonrasi useRoomChannel presence sync + broadcast ile doldurur.
  const initialState = {
    ...partial,
    online: new Set<string>(),
    typing_users: new Set<string>(),
    isStale: false,
  }

  // Sprint 2A Task 2: Lobby preview question (sadece lobby state'inde gosterilir)
  const initialPreviewQuestion =
    partial.room.state === 'lobby'
      ? await fetchLobbyPreviewQuestion(
          session.access_token,
          partial.room.category,
        )
      : null

  return (
    <>
      <header className="mb-4">
        <Link
          href="/oda"
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface)]"
          aria-label="Odalarım sayfasına dön"
        >
          <span aria-hidden="true">←</span>
          <span>Odalarıma Dön</span>
        </Link>
      </header>
      <LobbyContainer
        roomId={room.id}
        userId={user.id}
        initialState={initialState}
        initialPreviewQuestion={initialPreviewQuestion}
      />
    </>
  )
}
