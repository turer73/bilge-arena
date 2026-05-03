'use client'

/**
 * Bilge Arena Oda: <GameView> aktif soru + cevap form
 * Sprint 1 PR4e-2 (active state, GameInProgress reveal'a kalir)
 * Sprint 1 PR4f: my_answer + selected highlight + auto-submit on timeout
 *
 * Soru gosterir, 4 secenek kart (click toggle local select), "Onayla"
 * submit butonu ile form action tetikler. Cevap gonderildikten sonra UI
 * kilitli, my_answer dolu (highlight emerald + "Cevabın gönderildi: X").
 *
 * Auto-submit: isExpired + selectedOption + !my_answer -> form auto submit
 * (kullanici secmis ama tiklayip onaylayamadan sure dolarsa).
 *
 * Anti-cheat: revealed_at NULL ise correct_answer NULL gelir (server-side
 * RLS view), client onceden goremez. Submit cutoff RPC server-side
 * (deadline gectikten sonra P0001), UI sadece visual timer.
 */

import { useActionState, useEffect, useRef, useState } from 'react'
import {
  submitAnswerAction,
  type SubmitAnswerActionState,
} from '@/lib/rooms/actions'
import type { RoomState } from '@/lib/rooms/room-state-reducer'
import { cn } from '@/lib/utils/cn'

const initialState: SubmitAnswerActionState = {}

interface GameViewProps {
  state: RoomState
  userId: string
  /** PR4h: cevap secince diger oyunculara typing broadcast */
  onTyping?: () => void
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

export function GameView({ state, userId, onTyping }: GameViewProps) {
  const { room, current_round, members } = state
  const me = members.find((m) => m.user_id === userId)
  const remaining = useCountdown(current_round?.ends_at)
  const [actionState, formAction, isPending] = useActionState(
    submitAnswerAction,
    initialState,
  )
  // PR4f + Codex P1 fix: secimi current_round'a tag'le.
  // Round degisince stale auto-submit'i onleyen guard.
  const [selection, setSelection] = useState<{
    option: string
    round_id: string
  } | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const autoSubmitFiredRef = useRef(false)

  const currentRoundId = current_round?.round_id

  // PR4f auto-submit: isExpired + secim var + henuz cevap gondermemis -> form auto submit
  // Codex P1 PR #56 fix: selection.round_id === currentRoundId kontrolu, stale
  // selection (round geçtiyse) auto-submit firing'i onler.
  useEffect(() => {
    if (
      remaining <= 0 &&
      selection &&
      currentRoundId &&
      selection.round_id === currentRoundId &&
      !state.my_answer &&
      !isPending &&
      !autoSubmitFiredRef.current &&
      formRef.current
    ) {
      autoSubmitFiredRef.current = true
      formRef.current.requestSubmit()
    }
  }, [remaining, selection, state.my_answer, isPending, currentRoundId])

  // Round degisirse local selection sifirla
  useEffect(() => {
    setSelection(null)
    autoSubmitFiredRef.current = false
  }, [currentRoundId])

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
  const hasAnswered = state.my_answer !== null
  const lockUI = hasAnswered || isPending
  // Hangi secenek highlight: oncelikle gerçek my_answer (server canonical),
  // henuz submit edilmediyse local secim. Selection sadece current round icinse
  // gosterilir (stale guard - Codex P1 fix).
  const localSelection =
    selection && selection.round_id === currentRoundId
      ? selection.option
      : null
  // 2026-05-03 BUG FIX: question_content_snapshot.answer field 0-indexed
  // integer string olarak DB'de saklaniyor (ornegin "2"). Botlar bunu direkt
  // submit ediyor (correct match), ama frontend onceden option TEXT'ini
  // submit ediyordu -> reveal_round'da is_correct hep FALSE olarak isaretliyor,
  // user her cevabi yanlis sayiliyordu. Cozum: submission'da index gonder
  // (asagidaki onClick), highlight'ta da my_answer.answer_value (index string)
  // -> options[index] map'i yap.
  const highlightedOption = (() => {
    const myAnswerVal = state.my_answer?.answer_value
    if (myAnswerVal !== undefined) {
      const idx = parseInt(myAnswerVal, 10)
      if (!Number.isNaN(idx) && idx >= 0 && idx < options.length) {
        return options[idx]
      }
      // Legacy: pre-fix submissions option TEXT olarak saklandi, geriye uyumlu
      return myAnswerVal
    }
    return localSelection
  })()

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

      <form action={formAction} ref={formRef} className="space-y-3">
        <input type="hidden" name="room_id" value={room.id} />
        <input type="hidden" name="answer_value" value={localSelection ?? ''} />
        <ul className="space-y-2">
          {options.map((opt, idx) => {
            const isSelected = highlightedOption === opt
            return (
              <li key={idx}>
                <button
                  type="button"
                  onClick={() => {
                    if (lockUI || !currentRoundId) return
                    // 2026-05-03: tek-tik submit (yaris oyunu UX). FormData
                    // direkt construct + formAction(fd) — setSelection async
                    // re-render'i beklemez, hidden input stale value sorunu yok.
                    // BUG FIX: answer_value 0-indexed integer string olarak
                    // gonderiliyor (botlarla ayni format, reveal_round
                    // is_correct comparison'i match etsin diye).
                    setSelection({ option: opt, round_id: currentRoundId })
                    onTyping?.()
                    const fd = new FormData()
                    fd.append('room_id', room.id)
                    fd.append('answer_value', String(idx))
                    formAction(fd)
                  }}
                  disabled={lockUI}
                  aria-pressed={isSelected}
                  className={cn(
                    'w-full rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed',
                    isSelected
                      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-900 dark:text-emerald-100'
                      : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--focus)] hover:bg-[var(--card)]',
                    lockUI && !isSelected && 'opacity-40',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mr-2 inline-flex size-6 items-center justify-center rounded-full text-xs font-bold',
                      isSelected
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[var(--card)] text-[var(--text-sub)]',
                    )}
                  >
                    {String.fromCharCode(65 + idx)}
                  </span>
                  {opt}
                </button>
              </li>
            )
          })}
        </ul>

        {/* Status banner: tek-tik submit oldugu icin "Onayla" butonu yok.
            Pending/submitted state'i banner'da gosterilir. */}
        {(isPending || hasAnswered) && (
          <div
            className={cn(
              'w-full rounded-lg px-4 py-2 text-center text-sm font-medium',
              hasAnswered
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
            )}
          >
            {hasAnswered ? '✓ Cevabın Gönderildi' : 'Gönderiliyor…'}
          </div>
        )}
      </form>

      {hasAnswered && (
        <p className="mt-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
          Cevabın: <strong>{highlightedOption ?? state.my_answer?.answer_value}</strong>
          {state.my_answer?.is_correct === null
            ? ' — sonuç açıklamada görünecek.'
            : state.my_answer?.is_correct
              ? ` — doğru! (+${state.my_answer.points_awarded ?? 0} puan)`
              : ' — yanlış cevap.'}
        </p>
      )}

      {!hasAnswered && isExpired && !localSelection && (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
          Süre doldu, cevap veremeden geçti. Sonraki turu bekle.
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
