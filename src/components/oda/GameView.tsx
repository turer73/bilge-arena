'use client'

/**
 * Bilge Arena Oda: <GameView> aktif soru + cevap form
 * Sprint 1 PR4e-2 (active state, GameInProgress reveal'a kalir)
 *
 * Soru gosterir, 4 secenek butonu (option click -> form submit), basit
 * countdown timer (started_at + per_question_seconds vs Date.now()).
 *
 * Anti-cheat: revealed_at NULL ise correct_answer NULL gelir (server-side
 * RLS view), client onceden goremez. Submit cutoff RPC server-side
 * (deadline gectikten sonra P0001), UI sadece visual timer.
 *
 * Out-of-scope (PR4e-3):
 * - "Cevabin gonderildi: X" indicator (room_answers fetch gerek)
 * - Selected option highlight after submit (state local)
 * - Auto-submit on timeout
 */

import { useActionState, useEffect, useState } from 'react'
import {
  submitAnswerAction,
  type SubmitAnswerActionState,
} from '@/lib/rooms/actions'
import type { RoomState } from '@/lib/rooms/room-state-reducer'

const initialState: SubmitAnswerActionState = {}

interface GameViewProps {
  state: RoomState
  userId: string
}

function useCountdown(targetIso: string | undefined) {
  const [remaining, setRemaining] = useState(() => {
    if (!targetIso) return 0
    return Math.max(0, Math.ceil((new Date(targetIso).getTime() - Date.now()) / 1000))
  })
  useEffect(() => {
    if (!targetIso) return
    const tick = () => {
      const r = Math.max(0, Math.ceil((new Date(targetIso).getTime() - Date.now()) / 1000))
      setRemaining(r)
    }
    tick()
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [targetIso])
  return remaining
}

export function GameView({ state, userId }: GameViewProps) {
  const { room, current_round, members } = state
  const me = members.find((m) => m.user_id === userId)
  const remaining = useCountdown(current_round?.ends_at)
  const [actionState, formAction, isPending] = useActionState(
    submitAnswerAction,
    initialState,
  )

  if (!current_round) {
    return (
      <section
        aria-label="Oyun yukleniyor"
        className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-center"
      >
        <p className="text-sm text-[var(--text-sub)]">Tur yükleniyor…</p>
      </section>
    )
  }

  const options = current_round.options ?? []
  const questionText = current_round.question_text ?? '(Soru yükleniyor)'
  const isExpired = remaining <= 0

  return (
    <section
      aria-label="Aktif soru"
      className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6"
    >
      <header className="mb-4 flex items-center justify-between gap-2">
        <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-700 dark:text-blue-300">
          Soru {current_round.round_index} / {room.question_count}
        </span>
        <div className="flex items-center gap-2">
          {/* PR4e-5: cevap veren oyuncu sayisi badge */}
          <span
            aria-label="Cevap veren oyuncu sayısı"
            className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--text-sub)]"
          >
            ✓ {state.answers_count} / {members.length}
          </span>
          <span
            aria-label="Kalan süre"
            className={
              isExpired
                ? 'rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-700 dark:text-red-300'
                : remaining <= 5
                  ? 'rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-700 dark:text-amber-300'
                  : 'rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300'
            }
          >
            {isExpired ? 'Süre doldu' : `${remaining} sn`}
          </span>
        </div>
      </header>

      <h2 className="mb-4 text-base font-semibold leading-relaxed">
        {questionText}
      </h2>

      {/*
        Codex P2 PR #50: client-side timer expiry HARD-DISABLE'i kaldirildi.
        Browser clock authoritative degil — server RPC submit_answer deadline
        gerçek otoritedir. Eger client clock onde / sekme throttle olursa
        gecerli cevap blocked olabilir. Visual amber renk + uyari mesaji
        kullaniciya kalan zamani bildirsin, server RPC ihtiyac duyarsa
        reject etsin (P0001 'soru suresi bitti').
      */}
      <form action={formAction} className="space-y-2">
        <input type="hidden" name="room_id" value={room.id} />
        <ul className="space-y-2">
          {options.map((opt, idx) => (
            <li key={idx}>
              <button
                type="submit"
                name="answer_value"
                value={opt}
                disabled={isPending}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left text-sm font-medium transition-colors hover:border-[var(--focus)] hover:bg-[var(--card)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span
                  aria-hidden="true"
                  className="mr-2 inline-flex size-6 items-center justify-center rounded-full bg-[var(--card)] text-xs font-bold"
                >
                  {String.fromCharCode(65 + idx)}
                </span>
                {opt}
              </button>
            </li>
          ))}
        </ul>
      </form>
      {isExpired && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          Süre dolmuş görünüyor — yine de cevap göndermeyi deneyebilirsin,
          sunucu kabul ederse skoruna eklenecek.
        </p>
      )}

      {actionState.error && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {actionState.error}
        </p>
      )}

      {me && (
        <p className="mt-4 text-xs text-[var(--text-sub)]">
          Skor: <span className="font-semibold">{me.score ?? 0}</span>
        </p>
      )}
    </section>
  )
}
