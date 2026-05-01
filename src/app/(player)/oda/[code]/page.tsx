import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  fetchRoomByCode,
  fetchRoomState,
  fetchLobbyPreviewQuestion,
} from '@/lib/rooms/server-fetch'
import { LobbyContainer } from '@/components/oda/LobbyContainer'
import { slugToLabel } from '@/lib/rooms/categories'

/**
 * Bilge Arena Oda: /oda/[code] real lobby (PR4b)
 *
 * Server Component:
 *   1) Auth + session JWT zorunlu (yoksa /giris?redirect=...)
 *   2) Code -> room ID resolve (RLS member-only, yok ise 404)
 *   3) Initial state SSR fetch (room + members + current_round)
 *   4) <LobbyContainer/> client component'a aktar — useRoomChannel ile
 *      postgres_changes + presence Realtime sync baslar
 */

/**
 * generateMetadata — Sprint 2C T8 PR3 (OG image dynamic flow)
 *
 * ShareButton paylasim URL'inde og_title/og_score/og_category querystring
 * eklenir. Sosyal medya crawler bu sayfayi fetch ettiginde generateMetadata
 * querystring'den dinamik OG image URL uretir (DB fetch YOK, anon crawler
 * dostu — RLS member-only oda gormez).
 *
 * Plan-deviation #84: querystring driven (no DB fetch). RLS bypass icin
 * yeni policy gerek olurdu (rooms_select_completed_share TO anon),
 * scope korumak icin querystring tercih.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<Metadata> {
  const { code } = await params
  const sp = await searchParams

  const ogTitle =
    typeof sp.og_title === 'string' ? sp.og_title : 'Bilge Arena Oda'
  const ogScore = typeof sp.og_score === 'string' ? sp.og_score : undefined
  const ogCategory =
    typeof sp.og_category === 'string' ? sp.og_category : undefined

  const ogParams = new URLSearchParams({ title: ogTitle })
  if (ogScore) ogParams.set('score', ogScore)
  if (ogCategory) ogParams.set('category', ogCategory)

  const description = ogCategory
    ? `${slugToLabel(ogCategory)} kategorisinde Bilge Arena yarışması`
    : 'Bilge Arena oyun odası'

  return {
    title: `${ogTitle} — Bilge Arena`,
    description,
    openGraph: {
      title: ogTitle,
      description,
      images: [
        {
          url: `/api/og/result/${code}?${ogParams.toString()}`,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
      images: [`/api/og/result/${code}?${ogParams.toString()}`],
    },
  }
}

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
          className="text-sm text-[var(--text-sub)] hover:underline"
        >
          ← Odalarım
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
