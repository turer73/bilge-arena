'use client'

/**
 * Bilge Arena Oda: <RevealCountdown> auto-advance kalan sure
 * Sprint 2A Task 1
 *
 * Server-canonical timer: revealed_at + auto_advance_seconds * 1000.
 * Client clock drift'e karsi serverOffsetMs prop ile duzeltme:
 *   serverNow = Date.now() + serverOffsetMs
 *   remaining = (targetMs - serverNow) / 1000
 *
 * Codex P1 fix (PR #58): Pure Date.now() kullanim, kullanicinin sistemi
 * 5sn ileri/geri ise countdown yanlis gosterir. serverOffsetMs HYDRATE
 * sirasinda hesaplanir (Sprint 3D realtime resync ile entegre — su an
 * default 0, parent component prop ile override eder).
 *
 * auto_advance_seconds=0 -> hic render etme (manuel mode).
 * remaining=0 -> "Geçiliyor..." gosterir, Realtime UPDATE event ile
 * SonucView unmount olur (Phase 2 auto_relay_tick rooms.state='active' yapar).
 *
 * Memory id=155 (useCallback stale closure):
 * useEffect deps icine sadece revealedAt + autoAdvanceSeconds + serverOffsetMs.
 */

import { useEffect, useState } from 'react'

interface RevealCountdownProps {
  revealedAt: string
  autoAdvanceSeconds: number
  /**
   * Server-client clock offset in milliseconds. `serverNow = Date.now() + serverOffsetMs`.
   * Default 0 (assume client clock matches server). HYDRATE response Date header
   * vs Date.now() farkindan hesaplanir, gelecek Sprint'te baglanir.
   */
  serverOffsetMs?: number
}

export function RevealCountdown({
  revealedAt,
  autoAdvanceSeconds,
  serverOffsetMs = 0,
}: RevealCountdownProps) {
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    // autoAdvanceSeconds<=0 -> manuel mode, render guard zaten null doner
    if (autoAdvanceSeconds <= 0) {
      return
    }

    const targetMs = new Date(revealedAt).getTime() + autoAdvanceSeconds * 1000

    const tick = () => {
      // Server-canonical: serverNow = clientNow + offset (positive=server ahead)
      const serverNow = Date.now() + serverOffsetMs
      const left = Math.max(0, Math.ceil((targetMs - serverNow) / 1000))
      setRemaining(left)
    }

    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [revealedAt, autoAdvanceSeconds, serverOffsetMs])

  if (autoAdvanceSeconds <= 0 || remaining === null) return null

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="reveal-countdown"
      className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-blue-500/10 px-3 py-2 text-xs font-bold text-blue-700 dark:text-blue-300"
    >
      {remaining > 0 ? (
        <>
          <span
            aria-hidden="true"
            className="inline-flex size-6 items-center justify-center rounded-full bg-blue-600 text-white"
          >
            {remaining}
          </span>
          <span>saniye sonra sonraki tur</span>
        </>
      ) : (
        <span>Geçiliyor…</span>
      )}
    </div>
  )
}
