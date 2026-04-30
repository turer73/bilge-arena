'use client'

/**
 * Bilge Arena Oda: <HostGameActions> aktif/reveal state'inde host kontrol
 * Sprint 1 PR4e-3 (Codex P1 PR #51 fix: bootstrap advance)
 *
 * 3 state-driven action:
 * - active + current_round=null (start_room sonrasi, round_index=0):
 *   "Ilk Soruyu Baslat" -> advanceRoundAction (bootstrap; reveal_round
 *   bu durumda P0009 reject ediyordu)
 * - active + current_round exists, revealed_at=null:
 *   "Cevabi Goster" -> revealRoundAction
 * - reveal: "Sonraki Tura Gec" -> advanceRoundAction
 *
 * Server Action canonical state guard (RPC P0001/P0003/P0009 reject); UI
 * visual disable. isHost=false -> null render (early).
 */

import { useActionState } from 'react'
import {
  advanceRoundAction,
  revealRoundAction,
  type AdvanceRoundActionState,
  type RevealRoundActionState,
} from '@/lib/rooms/actions'
import type { CurrentRound } from '@/lib/rooms/room-state-reducer'

const advanceInitial: AdvanceRoundActionState = {}
const revealInitial: RevealRoundActionState = {}

interface HostGameActionsProps {
  isHost: boolean
  roomId: string
  /** 'active' (Goster veya Bootstrap), 'reveal' (Sonraki Tur), digerleri null */
  roomState: 'active' | 'reveal' | 'lobby' | 'completed' | 'archived'
  /** Mevcut round (null ise henuz baslatilmamis, advance bootstrap gerek) */
  currentRound: CurrentRound | null
}

export function HostGameActions({
  isHost,
  roomId,
  roomState,
  currentRound,
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
  // Codex P1 PR #51: active + current_round=null -> bootstrap advance gerek
  const needsBootstrap = roomState === 'active' && currentRound === null
  const showAdvance = isReveal || needsBootstrap

  return (
    <section
      aria-label="Host oyun kontrolü"
      className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"
    >
      <h2 className="mb-3 text-sm font-bold">Host Oyun Paneli</h2>
      <div className="flex flex-wrap gap-2">
        {showAdvance && (
          <form action={advanceFormAction}>
            <input type="hidden" name="room_id" value={roomId} />
            <button
              type="submit"
              disabled={advancePending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {advancePending
                ? 'Geçiliyor…'
                : needsBootstrap
                  ? 'İlk Soruyu Başlat'
                  : 'Sonraki Tura Geç'}
            </button>
          </form>
        )}

        {!showAdvance && roomState === 'active' && (
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
        {needsBootstrap
          ? 'Oyuna ilk soru ile başla. Süre dolduğunda cevabı gösterebilirsin.'
          : isReveal
            ? 'Sonraki turu sen başlat. Son turdan sonra oyun otomatik biter.'
            : 'Süre dolmadan da cevabı gösterip skoru hesaplayabilirsin.'}
      </p>
    </section>
  )
}
