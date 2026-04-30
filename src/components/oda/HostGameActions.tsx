'use client'

/**
 * Bilge Arena Oda: <HostGameActions> aktif/reveal state'inde host kontrol
 * Sprint 1 PR4e-3
 *
 * 2 host action:
 * - active state'inde "Cevabi Goster" -> revealRoundAction (P0001 too early)
 * - reveal state'inde "Sonraki Tur" -> advanceRoundAction (son round'dan
 *   sonra room.state -> completed otomatik)
 *
 * Server Action canonical state guard (RPC P0001/P0003 reject); UI sadece
 * visual disable. isHost=false -> null render (early).
 *
 * 4d kick + 4c host start/cancel ile ayni kalip (form action + hidden
 * room_id + button submit).
 */

import { useActionState } from 'react'
import {
  advanceRoundAction,
  revealRoundAction,
  type AdvanceRoundActionState,
  type RevealRoundActionState,
} from '@/lib/rooms/actions'

const advanceInitial: AdvanceRoundActionState = {}
const revealInitial: RevealRoundActionState = {}

interface HostGameActionsProps {
  isHost: boolean
  roomId: string
  /** 'active' (Goster aktif) veya 'reveal' (Sonraki Tur aktif) */
  roomState: 'active' | 'reveal' | 'lobby' | 'completed' | 'archived'
}

export function HostGameActions({
  isHost,
  roomId,
  roomState,
}: HostGameActionsProps) {
  const [advanceState, advanceFormAction, advancePending] = useActionState(
    advanceRoundAction,
    advanceInitial,
  )
  const [revealState, revealFormAction, revealPending] = useActionState(
    revealRoundAction,
    revealInitial,
  )

  if (!isHost) return null
  if (roomState !== 'active' && roomState !== 'reveal') return null

  const showError = advanceState.error ?? revealState.error
  const isReveal = roomState === 'reveal'

  return (
    <section
      aria-label="Host oyun kontrolü"
      className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"
    >
      <h2 className="mb-3 text-sm font-bold">Host Oyun Paneli</h2>
      <div className="flex flex-wrap gap-2">
        {!isReveal && (
          <form action={revealFormAction}>
            <input type="hidden" name="room_id" value={roomId} />
            <button
              type="submit"
              disabled={revealPending}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {revealPending ? 'Gösteriliyor…' : 'Cevabı Göster'}
            </button>
          </form>
        )}

        {isReveal && (
          <form action={advanceFormAction}>
            <input type="hidden" name="room_id" value={roomId} />
            <button
              type="submit"
              disabled={advancePending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {advancePending ? 'Geçiliyor…' : 'Sonraki Tura Geç'}
            </button>
          </form>
        )}
      </div>

      {showError && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {showError}
        </p>
      )}

      <p className="mt-2 text-xs text-[var(--text-sub)]">
        {isReveal
          ? 'Sonraki turu sen baslat. Son turdan sonra oyun otomatik biter.'
          : 'Süre dolmadan da cevabı gösterip skoru hesaplayabilirsin.'}
      </p>
    </section>
  )
}
