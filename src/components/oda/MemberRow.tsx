/**
 * Bilge Arena Oda: <MemberRow> tek member satiri
 * Sprint 1 PR4b Task 6 (PR4d kick eklenmistir)
 *
 * Server component. Avatar (emoji), display_name, host rozet, online dot,
 * (host viewer ise) kick button.
 *
 * Kick button kosullari (PR4d):
 *   - viewerIsHost (current user host_id'ye esit)
 *   - member host degil (host kendini cikaramaz)
 *   - member current viewer degil (host kendini cikaramaz)
 *   - member is_kicked degil (zaten cikarilmis)
 *   - room state lobby/active/reveal (kick_member RPC P0003 kontrol)
 */

import type { Member } from '@/lib/rooms/room-state-reducer'
import { cn } from '@/lib/utils/cn'
import { KickMemberButton } from './KickMemberButton'

type RoomLifecycleState =
  | 'lobby'
  | 'active'
  | 'reveal'
  | 'completed'
  | 'archived'

interface MemberRowProps {
  member: Member
  isOnline: boolean
  isHost: boolean
  /** Goruntulen kullanici host mu (kick button rendering icin) */
  viewerIsHost?: boolean
  /** Goruntulen kullanicinin user_id'si (host kendini cikaramaz) */
  viewerUserId?: string
  /** Oda ID (kick form action icin) */
  roomId?: string
  /** Oda state (kick state guard) */
  roomState?: RoomLifecycleState
  /** PR4h: typing broadcast aldiysa "..." indicator goster */
  isTyping?: boolean
}

const KICKABLE_STATES: ReadonlyArray<RoomLifecycleState> = [
  'lobby',
  'active',
  'reveal',
]

export function MemberRow({
  member,
  isOnline,
  isHost,
  viewerIsHost,
  viewerUserId,
  roomId,
  roomState,
  isTyping,
}: MemberRowProps) {
  const canShowKick =
    viewerIsHost === true &&
    !isHost &&
    member.user_id !== viewerUserId &&
    !member.is_kicked &&
    roomId !== undefined &&
    roomState !== undefined &&
    KICKABLE_STATES.includes(roomState)

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2',
        member.is_kicked && 'opacity-50',
      )}
    >
      <span aria-hidden="true" className="text-lg">
        {member.is_bot ? '🤖' : (member.emoji ?? '🎮')}
      </span>
      <span className="flex-1 truncate text-sm font-medium">
        {/* Codex P1 #80 fix: display_name NULL/undefined fallback "Oyuncu" */}
        {member.display_name ?? 'Oyuncu'}
        {member.is_bot && (
          <span
            aria-label="Bot oyuncu"
            className="ml-1.5 rounded-full bg-purple-500/15 px-1.5 py-0.5 text-[9px] font-bold text-purple-700 dark:text-purple-300"
          >
            BOT
          </span>
        )}
        {isTyping && (
          <span
            aria-label={`${member.display_name ?? 'Oyuncu'} cevap seçiyor`}
            className="ml-1.5 inline-flex items-center gap-0.5 text-[var(--text-sub)]"
            title="Cevap seçiyor"
          >
            <span className="size-1 animate-pulse rounded-full bg-[var(--text-sub)]" />
            <span className="size-1 animate-pulse rounded-full bg-[var(--text-sub)] [animation-delay:150ms]" />
            <span className="size-1 animate-pulse rounded-full bg-[var(--text-sub)] [animation-delay:300ms]" />
          </span>
        )}
      </span>
      {isHost && (
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
          Host
        </span>
      )}
      {canShowKick && (
        <KickMemberButton
          roomId={roomId}
          targetUserId={member.user_id}
          targetName={member.display_name ?? 'Oyuncu'}
        />
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
