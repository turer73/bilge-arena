/**
 * Bilge Arena Oda: <MemberRow> tek member satiri
 * Sprint 1 PR4b Task 6
 *
 * Server component. Avatar (emoji), display_name, host rozet, online dot.
 * Member list icinde MemberRoster tarafindan render edilir.
 */

import type { Member } from '@/lib/rooms/room-state-reducer'
import { cn } from '@/lib/utils/cn'

interface MemberRowProps {
  member: Member
  isOnline: boolean
  isHost: boolean
}

export function MemberRow({ member, isOnline, isHost }: MemberRowProps) {
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2',
        member.is_kicked && 'opacity-50',
      )}
    >
      <span aria-hidden="true" className="text-lg">
        {member.emoji ?? '🎮'}
      </span>
      <span className="flex-1 truncate text-sm font-medium">
        {member.display_name}
      </span>
      {isHost && (
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
          Host
        </span>
      )}
      <span
        aria-label={isOnline ? 'online' : 'offline'}
        className={cn(
          'inline-block size-2.5 rounded-full',
          isOnline
            ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
            : 'bg-gray-400',
        )}
      />
    </li>
  )
}
