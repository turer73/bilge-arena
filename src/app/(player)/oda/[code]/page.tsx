import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchRoomByCode, fetchRoomState } from '@/lib/rooms/server-fetch'
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
 * 4a placeholder REPLACE edildi. Tum oda info LobbyHeader/RoomInfoPanel/
 * MemberRoster/MemberActions/HostActionsPlaceholder componentleri uzerinden.
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

  return (
    <>
      <header className="mb-4">
        <Link
          href="/oda"
          className="text-sm text-[var(--text-sub)] hover:underline"
        >
          ← Odalarım
        </Link>
      </header>
      <LobbyContainer
        roomId={room.id}
        userId={user.id}
        initialState={initialState}
      />
    </>
  )
}
