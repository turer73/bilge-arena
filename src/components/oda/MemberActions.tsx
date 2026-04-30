/**
 * Bilge Arena Oda: <MemberActions> uye eylemleri (leave + share)
 * Sprint 1 PR4b Task 6
 *
 * Client component. 2 action: kod paylas (clipboard) + odadan ayril (Server Action).
 * Lobby disinda (active/reveal/completed/archived) leave button disabled.
 *
 * 4c'de host icin start/cancel/kick eklenir (HostActionsPlaceholder yerine).
 */

'use client'

import { useActionState } from 'react'
import {
  leaveRoomAction,
  type LeaveRoomActionState,
} from '@/lib/rooms/actions'
import { ShareCodeButton } from './ShareCodeButton'

const initialState: LeaveRoomActionState = {}

interface MemberActionsProps {
  roomId: string
  roomCode: string
  roomState: 'lobby' | 'active' | 'reveal' | 'completed' | 'archived'
}

export function MemberActions({
  roomId,
  roomCode,
  roomState,
}: MemberActionsProps) {
  const [state, formAction, isPending] = useActionState(
    leaveRoomAction,
    initialState,
  )

  const canLeave = roomState === 'lobby'

  return (
    <section
      aria-label="Uye eylemleri"
      className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <ShareCodeButton code={roomCode} />
        <form action={formAction} className="ml-auto">
          <input type="hidden" name="room_id" value={roomId} />
          <button
            type="submit"
            disabled={isPending || !canLeave}
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-700 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-300"
          >
            {isPending ? 'Cikiliyor…' : 'Odadan Ayril'}
          </button>
        </form>
      </div>
      {state.error && (
        <p
          role="alert"
          className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.error}
        </p>
      )}
      {!canLeave && (
        <p className="mt-2 text-xs text-[var(--text-sub)]">
          {'Oyun basladi, lobby’ye donerken ayrilabilirsin.'}
        </p>
      )}
    </section>
  )
}
