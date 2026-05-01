'use client'

/**
 * Bilge Arena Oda: <ReplayButton> oyun bittikten sonra "Tekrar Oyna"
 * Sprint 2C Task 8 (Replay & Share)
 *
 * GameCompleted ekraninda gosterilir. Bu odanin ayarlariyla yeni oda
 * olusturur (replay_room RPC) ve yeni odanin lobby'sine yonlendirir.
 *
 * Anti-cheat: yeni oda yeni RANDOM sorular ceker (advance_round PR2b),
 * source oda sorularini KULLANMAZ.
 */

import { useActionState } from 'react'
import {
  replayRoomAction,
  type ReplayRoomActionState,
} from '@/lib/rooms/actions'

const initialState: ReplayRoomActionState = {}

interface ReplayButtonProps {
  sourceRoomId: string
}

export function ReplayButton({ sourceRoomId }: ReplayButtonProps) {
  const [state, formAction, isPending] = useActionState(
    replayRoomAction,
    initialState,
  )

  return (
    <div className="inline-block" data-testid="replay-button">
      <form action={formAction}>
        <input type="hidden" name="source_room_id" value={sourceRoomId} />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? 'Oluşturuluyor…' : '🔄 Tekrar Oyna'}
        </button>
      </form>
      {state.error && (
        <p
          role="alert"
          className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.error}
        </p>
      )}
    </div>
  )
}
