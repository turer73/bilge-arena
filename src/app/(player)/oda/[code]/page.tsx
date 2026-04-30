import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchRoomByCode } from '@/lib/rooms/server-fetch'
import { StateBadge } from '@/components/oda/StateBadge'

/**
 * Bilge Arena Oda: /oda/[code] placeholder lobby
 * Sprint 1 PR4a Task 5
 *
 * 4b'de gercek lobby ile yeniden yazilacak. Su an: oda detaylarini
 * gosteren minimal placeholder + "lobby hazirlaniyor" mesaji.
 *
 * RLS member-only: kullanici uye degilse fetchRoomByCode null doner -> 404.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) redirect(`/giris?redirect=/oda/${code}`)

  const room = await fetchRoomByCode(session.access_token, code)
  if (!room) notFound()

  return (
    <>
      <header className="mb-6">
        <Link
          href="/oda"
          className="text-sm text-[var(--text-sub)] hover:underline"
        >
          ← Odalarım
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-xl font-bold">{room.title}</h1>
          <StateBadge state={room.state} />
        </div>
      </header>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-center">
        <p className="text-sm text-[var(--text-sub)]">
          Hoşgeldin! Bu oda hazırlanıyor — yakında burada lobby olacak.
        </p>
        <code className="mt-3 inline-block rounded bg-[var(--surface)] px-3 py-1 font-mono text-sm">
          {room.code}
        </code>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-[var(--text-sub)]">
          <dt>Kategori:</dt>
          <dd>{room.category}</dd>
          <dt>Zorluk:</dt>
          <dd>{room.difficulty}/5</dd>
          <dt>Soru:</dt>
          <dd>{room.question_count}</dd>
          <dt>Maksimum:</dt>
          <dd>{room.max_players} oyuncu</dd>
          <dt>Süre:</dt>
          <dd>{room.per_question_seconds}sn/soru</dd>
          <dt>Mod:</dt>
          <dd>{room.mode === 'sync' ? 'Senkron' : 'Asenkron'}</dd>
        </dl>
      </div>
    </>
  )
}
