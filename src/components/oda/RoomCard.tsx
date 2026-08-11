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
import { ArrowRight, Users } from 'lucide-react'

export function RoomCard({ room }: { room: RoomListItem }) {
  const memberCount = room.room_members[0]?.count ?? 0
  return (
    <Link
      href={`/oda/${room.code}`}
      className="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
      aria-label={`${room.title} odasına devam et`}
    >
      <article className="min-h-24 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition-colors group-hover:border-[var(--focus)]">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-extrabold">{room.title}</h3>
          <StateBadge state={room.state} />
        </div>
        <div className="mt-3 flex items-center gap-3 text-xs text-[var(--text-sub)]">
          <code className="rounded bg-[var(--surface)] px-2 py-0.5 font-mono">
            {room.code}
          </code>
          <span className="flex items-center gap-1">
            <Users aria-hidden="true" className="h-3.5 w-3.5" />
            {memberCount} oyuncu
          </span>
          <span className="ml-auto flex items-center gap-1 font-bold text-[var(--focus-text)]">
            Devam et
            <ArrowRight
              aria-hidden="true"
              className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
            />
          </span>
        </div>
      </article>
    </Link>
  )
}
