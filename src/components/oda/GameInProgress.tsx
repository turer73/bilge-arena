/**
 * Bilge Arena Oda: <GameInProgress> oyun devam ediyor placeholder
 * Sprint 1 PR4e-1 — state-aware routing scaffold
 *
 * State 'active' (aktif soru) ve 'reveal' (cevap gosterimi) icin
 * goruntuleme. Gercek soru rendering + cevap submit + timer PR4e-2'de
 * eklenecek (4e-2 placeholder text yerine GameView).
 *
 * Server component (state already drilled), Realtime updates parent
 * LobbyContainer hook'undan gelir.
 */

import type { RoomState } from '@/lib/rooms/room-state-reducer'

interface GameInProgressProps {
  state: RoomState
  /** Mevcut goruntulen kullanici (PR4e-2'de answer submit form icin) */
  userId: string
}

export function GameInProgress({ state, userId }: GameInProgressProps) {
  const { room, current_round, members } = state
  const me = members.find((m) => m.user_id === userId)
  const isReveal = room.state === 'reveal'
  const roundNumber = current_round?.round_number ?? 0

  return (
    <section
      aria-label="Oyun devam ediyor"
      className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6"
    >
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">{room.title}</h1>
        <span
          className={
            isReveal
              ? 'rounded-full bg-purple-500/15 px-3 py-1 text-xs font-bold text-purple-700 dark:text-purple-300'
              : 'rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-700 dark:text-blue-300'
          }
        >
          {isReveal ? 'Sonuç' : 'Soru'} {roundNumber} / {room.question_count}
        </span>
      </header>

      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-center">
        <p className="text-sm text-[var(--text-sub)]">
          {isReveal
            ? 'Cevap gösterimi — sonraki tura geçiş bekleniyor.'
            : 'Soru aktif — cevap arayüzü 4e-2 sürümünde gelecek.'}
        </p>
        {me && (
          <p className="mt-2 text-xs text-[var(--text-sub)]">
            Skor: <span className="font-semibold">{me.score ?? 0}</span>
          </p>
        )}
      </div>
    </section>
  )
}
