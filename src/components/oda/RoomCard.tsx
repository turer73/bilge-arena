/**
 * Bilge Arena Oda: <RoomCard> liste icindeki tek oda karti
 * Sprint 1 PR4a Task 3
 *
 * Whole-card link (Link), title + StateBadge ust satir, kod (mono) +
 * member count alt satir. Hover'da focus border belirir.
 */

import Link from 'next/link'
import { StateBadge } from './StateBadge'
import type { RoomListItem } from '@/lib/rooms/server-fetch'

export function RoomCard({ room }: { room: RoomListItem }) {
  const memberCount = room.room_members[0]?.count ?? 0
  return (
    <Link href={`/oda/${room.code}`}>
      <article className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition-colors hover:border-[var(--focus)]">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold">{room.title}</h3>
          <StateBadge state={room.state} />
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs text-[var(--text-sub)]">
          <code className="rounded bg-[var(--surface)] px-2 py-0.5 font-mono">
            {room.code}
          </code>
          <span>{memberCount} oyuncu</span>
        </div>
      </article>
    </Link>
  )
}
