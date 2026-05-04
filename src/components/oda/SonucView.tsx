/**
 * Bilge Arena Oda: <SonucView> reveal state cevap gosterimi
 * Sprint 1 PR4e-4
 *
 * Reveal sonrasi anti-cheat view'den correct_answer + explanation gelir.
 * Soru + 4 secenek + dogru olan emerald highlight + explanation kart.
 *
 * Server component (state already drilled). Realtime ROOM_UPDATE event
 * (revealed_at dolar) ile otomatik render olur.
 *
 * Out-of-scope (PR4e-5):
 * - Senin cevabin: X (room_answers fetch per-user)
 * - Yanlis seceneklerden kullanilan kacini kim secti (popularity)
 * - Skor degisikligi animasyonu
 */

'use client'

import { useActionState, useEffect, useRef } from 'react'
import type { RoomState } from '@/lib/rooms/room-state-reducer'
import {
  advanceRoundForMemberAction,
  type AdvanceRoundForMemberActionState,
} from '@/lib/rooms/actions'
import { cn } from '@/lib/utils/cn'
import { RevealCountdown } from './RevealCountdown'

const advanceInitial: AdvanceRoundForMemberActionState = {}

interface SonucViewProps {
  state: RoomState
  userId: string
  /** Async PR2 Faz C: advance_round_for_member RPC return ile lokal optimistic
   *  my_answer clear + member.current_round_index/finished_at update.
   *  Polling HYDRATE 3-5sn delay'ini absorbe eder. */
  onAsyncAdvanceSuccess?: (result: {
    status: 'advanced' | 'finished'
    round_index: number
    started_at?: string
    finished_at?: string
  }) => void
}

export function SonucView({ state, userId, onAsyncAdvanceSuccess }: SonucViewProps) {
  const { room, current_round, members } = state
  const me = members.find((m) => m.user_id === userId)
  const isAsync = room.mode === 'async'
  const [advanceState, advanceFormAction, advancePending] = useActionState(
    advanceRoundForMemberAction,
    advanceInitial,
  )
  const advanceFiredRef = useRef<string | null>(null)
  const lastResultRef = useRef<typeof advanceState.result>(undefined)

  // Async PR2 Faz C: advance RPC return ile lokal optimistic
  useEffect(() => {
    if (
      !isAsync ||
      !advanceState.result ||
      !onAsyncAdvanceSuccess ||
      lastResultRef.current === advanceState.result
    ) {
      return
    }
    lastResultRef.current = advanceState.result
    onAsyncAdvanceSuccess(advanceState.result)
  }, [isAsync, advanceState.result, onAsyncAdvanceSuccess])

  // Codex P1 paterni: error olursa fired ref reset, sonraki render retry
  useEffect(() => {
    if (advanceState.error && advanceFiredRef.current) {
      advanceFiredRef.current = null
    }
  }, [advanceState.error])

  if (!current_round) {
    return (
      <section
        aria-label="Sonuç yükleniyor"
        className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-center"
      >
        <p className="text-sm text-[var(--text-sub)]">Sonuç yükleniyor…</p>
      </section>
    )
  }

  const options = current_round.options ?? []
  const questionText = current_round.question_text ?? '(Soru yükleniyor)'
  const correct = current_round.correct_answer
  const explanation = current_round.explanation
  const isLastRound =
    current_round.round_index >= room.question_count

  // 2026-05-03 BUG FIX: question_content_snapshot.answer field 0-indexed
  // integer string olarak DB'de saklaniyor (ornegin "2"). Botlar bunu
  // direkt submit eder, frontend de PR #98'den itibaren index gonderiyor.
  // Display icin index -> options[index] map; legacy text degerinde ayni
  // string fallback yapilir.
  //
  // Codex PR #99 P2: parseInt numeric prefix kabul eder ("2. Dünya Savaşı"
  // -> 2). Legacy text answer'lar yanlislikla options[idx] olarak remap
  // edilir. Strict /^\d+$/ regex ile sadece tamamen rakam olan string'leri
  // index olarak kabul et.
  const resolveOptionText = (val: string | null | undefined): string | null => {
    if (val === null || val === undefined) return null
    if (/^\d+$/.test(val)) {
      const idx = parseInt(val, 10)
      if (idx >= 0 && idx < options.length) {
        return options[idx]
      }
    }
    return val
  }
  const correctOption = resolveOptionText(correct)
  const myAnswerOption = resolveOptionText(state.my_answer?.answer_value)

  return (
    <section
      aria-label="Tur sonucu"
      className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6"
    >
      <header className="mb-4 flex items-center justify-between">
        <span className="rounded-full bg-purple-500/15 px-3 py-1 text-xs font-bold text-purple-700 dark:text-purple-300">
          Sonuç {current_round.round_index} / {room.question_count}
        </span>
        {me && (
          <span className="text-xs text-[var(--text-sub)]">
            Skorun: <span className="font-bold text-[var(--text)]">{me.score ?? 0}</span>
          </span>
        )}
      </header>

      <h2 className="mb-4 text-base font-semibold leading-relaxed">
        {questionText}
      </h2>

      <ul className="mb-4 space-y-2">
        {options.map((opt, idx) => {
          const isCorrect = correctOption !== null && opt === correctOption
          // PR4f: kullanicinin secimi (index -> options[idx] resolved)
          const isMine = myAnswerOption !== null && opt === myAnswerOption
          return (
            <li
              key={idx}
              aria-label={
                isCorrect
                  ? isMine
                    ? 'Doğru cevap (senin cevabın)'
                    : 'Doğru cevap'
                  : isMine
                    ? 'Senin yanlış cevabın'
                    : undefined
              }
              className={cn(
                'flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium',
                isCorrect
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100'
                  : isMine
                    ? 'border-red-500/40 bg-red-500/10 text-red-900 dark:text-red-100'
                    : 'border-[var(--border)] bg-[var(--surface)] opacity-60',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'inline-flex size-6 items-center justify-center rounded-full text-xs font-bold',
                  isCorrect
                    ? 'bg-emerald-600 text-white'
                    : isMine
                      ? 'bg-red-600 text-white'
                      : 'bg-[var(--card)] text-[var(--text-sub)]',
                )}
              >
                {isCorrect ? '✓' : isMine ? '✗' : String.fromCharCode(65 + idx)}
              </span>
              <span className="flex-1">{opt}</span>
              {isMine && !isCorrect && (
                <span className="text-[10px] font-bold text-red-700 dark:text-red-300">
                  Senin Cevabın
                </span>
              )}
              {isMine && isCorrect && (
                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                  Senin Cevabın
                </span>
              )}
            </li>
          )
        })}
      </ul>

      {/* PR4f: kullanici cevap vermediyse uyari */}
      {state.my_answer === null && (
        <p className="mb-4 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Bu turda cevap vermedin (süre dolmuş ya da pas geçilmiş).
        </p>
      )}

      {explanation && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--text-sub)]">
            Açıklama
          </h3>
          <p className="text-sm leading-relaxed">{explanation}</p>
        </div>
      )}

      {isLastRound && (
        <p className="mt-4 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Son tur! Host bir sonraki adımda oyunu bitirecek, sıralama gösterilecek.
        </p>
      )}

      {current_round.revealed_at && !isAsync && (
        <RevealCountdown
          revealedAt={current_round.revealed_at}
          autoAdvanceSeconds={room.auto_advance_seconds ?? 0}
        />
      )}

      {isAsync && (
        <AsyncAdvanceControls
          roomId={room.id}
          autoAdvanceSeconds={room.auto_advance_seconds ?? 5}
          onFire={() => {
            const roundKey = current_round.round_id ?? `idx-${current_round.round_index}`
            if (advanceFiredRef.current === roundKey) return
            advanceFiredRef.current = roundKey
            const fd = new FormData()
            fd.append('room_id', room.id)
            advanceFormAction(fd)
          }}
          isPending={advancePending}
          isLastRound={isLastRound}
          error={advanceState.error}
        />
      )}
    </section>
  )
}

// ===========================================================================
// AsyncAdvanceControls (sub-component) — async per-user auto-advance + manual
// ===========================================================================

interface AsyncAdvanceControlsProps {
  roomId: string
  autoAdvanceSeconds: number
  onFire: () => void
  isPending: boolean
  isLastRound: boolean
  error?: string
}

function AsyncAdvanceControls({
  autoAdvanceSeconds,
  onFire,
  isPending,
  isLastRound,
  error,
}: AsyncAdvanceControlsProps) {
  // Auto-advance timer: SonucView render'ind (caller cevap submit etti) NOW'dan
  // autoAdvanceSeconds sonra fire. Manuel "Sonraki" butonu da fire edebilir.
  const onFireRef = useRef(onFire)
  useEffect(() => {
    onFireRef.current = onFire
  }, [onFire])

  useEffect(() => {
    if (autoAdvanceSeconds <= 0) return
    const id = window.setTimeout(() => {
      onFireRef.current()
    }, autoAdvanceSeconds * 1000)
    return () => window.clearTimeout(id)
  }, [autoAdvanceSeconds])

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-[var(--text-sub)]">
          {isLastRound ? 'Son tur — finiş' : `${autoAdvanceSeconds} saniye sonra otomatik devam`}
        </span>
        <button
          type="button"
          onClick={onFire}
          disabled={isPending}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? 'Geçiliyor…' : isLastRound ? 'Bitir' : 'Sonraki Soru →'}
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </p>
      )}
    </div>
  )
}
