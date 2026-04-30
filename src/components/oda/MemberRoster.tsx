/**
 * Bilge Arena Oda: <MemberRoster> uye listesi
 * Sprint 1 PR4b Task 6
 *
 * Client component (presence Set props uzerinden gelir, parent server'da
 * stringleştirilmemis Set ile direkt prop drill yapilamaz; LobbyContainer
 * client oldugu icin sorun yok).
 *
 * Sirali: host once, sonra joined_at ASC. Kicked member opacity dusuk.
 */

'use client'

import type { Member } from '@/lib/rooms/room-state-reducer'
import { MemberRow } from './MemberRow'

interface MemberRosterProps {
  members: Member[]
  online: Set<string>
  hostId: string
  maxPlayers: number
}

export function MemberRoster({
  members,
  online,
  hostId,
  maxPlayers,
}: MemberRosterProps) {
  // Host once, sonra joined_at ASC
  const sorted = [...members].sort((a, b) => {
    if (a.user_id === hostId) return -1
    if (b.user_id === hostId) return 1
    return a.joined_at.localeCompare(b.joined_at)
  })

  return (
    <section
      aria-label="Oda uyeleri"
      className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"
    >
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold">Uyeler</h2>
        <span className="text-xs text-[var(--text-sub)]">
          {members.length} / {maxPlayers}
        </span>
      </header>
      {sorted.length === 0 ? (
        <p className="py-4 text-center text-xs text-[var(--text-sub)]">
          Hic uye yok
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((m) => (
            <MemberRow
              key={m.user_id}
              member={m}
              isOnline={online.has(m.user_id)}
              isHost={m.user_id === hostId}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
