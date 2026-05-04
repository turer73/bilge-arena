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

import { useActionState, useEffect, useRef } from 'react'
import {
  advanceRoundAction,
  revealRoundAction,
  cancelRoomAction,
  type AdvanceRoundActionState,
  type RevealRoundActionState,
  type CancelRoomActionState,
} from '@/lib/rooms/actions'
import type { CurrentRound } from '@/lib/rooms/room-state-reducer'

const advanceInitial: AdvanceRoundActionState = {}
const revealInitial: RevealRoundActionState = {}
const cancelInitial: CancelRoomActionState = {}

const AUTO_REVEAL_GRACE_MS = 1000  // herkes cevap verdikten 1sn sonra reveal
const DEADLINE_GRACE_MS = 1500     // sure dolduktan 1.5sn sonra reveal

interface HostGameActionsProps {
  isHost: boolean
  roomId: string
  /** 'active' (Goster veya Bootstrap), 'reveal' (Sonraki Tur), digerleri null */
  roomState: 'active' | 'reveal' | 'lobby' | 'completed' | 'archived'
  /** Mevcut round (null ise henuz baslatilmamis, advance bootstrap gerek) */
  currentRound: CurrentRound | null
  /** PR #97 auto-reveal: herkes cevap verdiyse reveal tetiklemek icin */
  answersCount?: number
  /** PR #97 auto-reveal: aktif (kicked degil) uye sayisi */
  totalActiveMembers?: number
}

export function HostGameActions({
  isHost,
  roomId,
  roomState,
  currentRound,
  answersCount = 0,
  totalActiveMembers = 0,
}: HostGameActionsProps) {
  const [advanceState, advanceFormAction, advancePending] = useActionState(
    advanceRoundAction,
    advanceInitial,
  )
  const [revealState, revealFormAction, revealPending] = useActionState(
    revealRoundAction,
    revealInitial,
  )
  const [cancelState, cancelFormAction, cancelPending] = useActionState(
    cancelRoomAction,
    cancelInitial,
  )
  const cancelDialogRef = useRef<HTMLDialogElement>(null)
  const revealFiredRef = useRef<string | null>(null)

  // PR #97 auto-reveal: yaris UX iyilestirmesi. Host'un her tur "Cevabi
  // Goster" tiklamasi gerekmiyor. Iki tetikleyici:
  //   (a) Herkes cevap verdi (answers_count >= active_members) -> 1sn grace
  //   (b) Sure doldu (NOW > ends_at) -> 1.5sn grace
  // Grace period polling delay'ini absorbe eder. Manuel "Cevabi Goster"
  // butonu duruyor — host erken bitirmek isterse.
  //
  // Codex PR #99 P1: revealFiredRef sadece revealState success ile set edilir.
  // Eski paterni: ref BEFORE action set ediliyordu -> RPC/auth/network fail
  // ise roomState='active' kalir AMA ref bloke olur, auto-reveal asla tekrar
  // fire etmez (oyun stuck, manuel tiklamadan kurtulmuyor). Yeni paterni:
  // dispatchedRoundRef "tetikledim" tutar (idempotent guard), revealState.error
  // varsa reset edilir ve sonraki render denenir.
  const dispatchedRoundRef = useRef<string | null>(null)
  useEffect(() => {
    // Hata aldiysak dispatchedRoundRef reset et — sonraki render'da retry
    if (revealState.error && dispatchedRoundRef.current) {
      dispatchedRoundRef.current = null
    }
  }, [revealState.error])

  useEffect(() => {
    if (!isHost) return
    if (roomState !== 'active') return
    if (!currentRound || currentRound.revealed_at) return
    const roundKey = currentRound.round_id ?? `idx-${currentRound.round_index}`
    if (revealFiredRef.current === roundKey) return
    if (dispatchedRoundRef.current === roundKey) return

    const fireReveal = () => {
      if (dispatchedRoundRef.current === roundKey) return
      dispatchedRoundRef.current = roundKey
      const fd = new FormData()
      fd.append('room_id', roomId)
      revealFormAction(fd)
      // Success commit'i: pending->success transition'inda revealFiredRef set
      // olmasi gerekirdi ama useActionState revealPending dusunce error/success
      // ayrimini revealState.error ile takip ediyoruz. Pratikte: dispatchedRef
      // bir round icin tek-firea engel; error olursa reset edilip retry olur,
      // success olursa zaten revealed_at set edilir ve effect erken doner
      // (currentRound.revealed_at guard line ~82).
      revealFiredRef.current = roundKey
    }

    // (a) Herkes cevap verdi
    if (totalActiveMembers > 0 && answersCount >= totalActiveMembers) {
      const id = window.setTimeout(fireReveal, AUTO_REVEAL_GRACE_MS)
      return () => window.clearTimeout(id)
    }

    // (b) Sure doldu
    const deadline = new Date(currentRound.ends_at).getTime()
    const now = Date.now()
    const ms = deadline - now + DEADLINE_GRACE_MS
    if (ms <= 0) {
      fireReveal()
      return
    }
    const id = window.setTimeout(fireReveal, ms)
    return () => window.clearTimeout(id)
  }, [
    isHost,
    roomState,
    currentRound,
    answersCount,
    totalActiveMembers,
    roomId,
    revealFormAction,
  ])

  if (!isHost) return null
  if (roomState !== 'active' && roomState !== 'reveal') return null

  const showError = advanceState.error ?? revealState.error ?? cancelState.error
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

        {/* 2026-05-03: stuck state escape route — host her zaman iptal edebilir */}
        <button
          type="button"
          onClick={() => cancelDialogRef.current?.showModal()}
          disabled={cancelPending}
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-700 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-300"
        >
          {cancelPending ? 'İptal ediliyor…' : 'Odayı İptal Et'}
        </button>

        <dialog
          ref={cancelDialogRef}
          aria-label="İptal onay"
          className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 backdrop:bg-black/40"
        >
          <form action={cancelFormAction} className="space-y-3">
            <input type="hidden" name="room_id" value={roomId} />
            <input type="hidden" name="reason" value="host_canceled" />
            <p className="text-sm">
              {'Bu odayı iptal etmek istediğine emin misin? Oyun bitirilir, üyeler odadan çıkarılır.'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => cancelDialogRef.current?.close()}
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
