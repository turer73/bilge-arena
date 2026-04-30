/**
 * Bilge Arena Oda: <LobbyHeader> oda baslik bandi
 * Sprint 1 PR4b Task 6
 *
 * Server component. Title + StateBadge + online indicator + kod (mono).
 */

import type { Room } from '@/lib/rooms/room-state-reducer'
import { StateBadge } from './StateBadge'
import { cn } from '@/lib/utils/cn'

interface LobbyHeaderProps {
  room: Room
  isOnline: boolean
}

export function LobbyHeader({ room, isOnline }: LobbyHeaderProps) {
  return (
    <header className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold">{room.title}</h1>
          <code className="mt-1 inline-block rounded bg-[var(--surface)] px-2 py-0.5 font-mono text-xs">
            {room.code}
          </code>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StateBadge state={room.state} />
          <span
            aria-label={isOnline ? 'baglanti aktif' : 'baglanti kesik'}
            className={cn(
              'flex items-center gap-1 text-[10px] font-medium',
              isOnline
                ? 'text-emerald-700 dark:text-emerald-300'
                : 'text-amber-700 dark:text-amber-300',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'inline-block size-1.5 rounded-full',
                isOnline ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse',
              )}
            />
            {isOnline ? 'Canli' : 'Tekrar baglaniliyor…'}
          </span>
        </div>
      </div>
    </header>
  )
}
