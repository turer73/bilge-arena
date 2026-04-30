'use client'

/**
 * Bilge Arena Oda: <HostActions> host eylemleri (start + cancel)
 * Sprint 1 PR4c Task 4
 *
 * 2 host action: oyunu baslat + odayi iptal et. Cancel native <dialog>
 * confirm modal. Server Action canonical state guard (UI sadece visual
 * disable). isHost=false -> null render.
 *
 * 4d/4e: kick_member + Realtime broadcast (typing/ready) eklenecek.
 */

import { useActionState, useRef } from 'react'
import {
  startRoomAction,
  cancelRoomAction,
  type StartRoomActionState,
  type CancelRoomActionState,
} from '@/lib/rooms/actions'

type RoomLifecycleState =
  | 'lobby'
  | 'active'
  | 'reveal'
  | 'completed'
  | 'archived'

interface HostActionsProps {
  isHost: boolean
  roomId: string
  roomState: RoomLifecycleState
}

const startInitial: StartRoomActionState = {}
const cancelInitial: CancelRoomActionState = {}
const cancellableStates: ReadonlyArray<RoomLifecycleState> = [
  'lobby',
  'active',
  'reveal',
]

export function HostActions({ isHost, roomId, roomState }: HostActionsProps) {
  const [startState, startAction, startPending] = useActionState(
    startRoomAction,
    startInitial,
  )
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelRoomAction,
    cancelInitial,
  )
  const dialogRef = useRef<HTMLDialogElement>(null)

  if (!isHost) return null

  const canStart = roomState === 'lobby'
  const canCancel = cancellableStates.includes(roomState)
  const showError = startState.error ?? cancelState.error

  return (
    <section
      aria-label="Host eylemleri"
      className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"
    >
      <h2 className="mb-3 text-sm font-bold">Host Paneli</h2>
      <div className="flex flex-wrap gap-2">
        <form action={startAction}>
          <input type="hidden" name="room_id" value={roomId} />
          <button
            type="submit"
            disabled={!canStart || startPending}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {startPending ? 'Başlatılıyor…' : 'Oyunu Başlat'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          disabled={!canCancel || cancelPending}
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-700 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-300"
        >
          {cancelPending ? 'İptal ediliyor…' : 'Odayı İptal Et'}
        </button>

        <dialog
          ref={dialogRef}
          aria-label="İptal onay"
          className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 backdrop:bg-black/40"
        >
          <form action={cancelAction} className="space-y-3">
            <input type="hidden" name="room_id" value={roomId} />
            <input type="hidden" name="reason" value="host_canceled" />
            <p className="text-sm">
              {'Bu odayı iptal etmek istediğine emin misin? Tüm üyeler odadan çıkarılır.'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white"
              >
                Evet, İptal Et
              </button>
            </div>
          </form>
        </dialog>
      </div>

      {showError && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {showError}
        </p>
      )}

      {!canStart && (
        <p className="mt-2 text-xs text-[var(--text-sub)]">
          Oyun başlatıldı veya bitti.
        </p>
      )}
    </section>
  )
}
