/**
 * Bilge Arena Oda: <GameCompleted> oyun bitti scoreboard placeholder
 * Sprint 1 PR4e-1 — state-aware routing scaffold
 *
 * State 'completed' (oyun bitti veya iptal) ve 'archived' (30+ gun retention)
 * icin goruntuleme. Member.score'a gore basit scoreboard. Gercek scoreboard
 * (correct_count + tie-breaker + medal UI) PR4e-2/4f'te eklenecek.
 */

import Link from 'next/link'
import type { RoomState } from '@/lib/rooms/room-state-reducer'

interface GameCompletedProps {
  state: RoomState
  userId: string
}

export function GameCompleted({ state, userId }: GameCompletedProps) {
  const { room, members } = state
  const isArchived = room.state === 'archived'

  // Skora gore desc sirala (basit scoreboard, PR4e-2'de scoreboard array kullanilir)
  const ranked = [...members]
    .map((m) => ({ ...m, score: m.score ?? 0 }))
    .sort((a, b) => b.score - a.score)

  return (
    <section
      aria-label={isArchived ? 'Oda arşivlenmiş' : 'Oyun bitti'}
      className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6"
    >
      <header className="mb-4">
        <h1 className="text-lg font-bold">{room.title}</h1>
        <p className="mt-1 text-sm text-[var(--text-sub)]">
          {isArchived
            ? 'Bu oda arşivlendi (30+ gün). Yeni oda kur veya başka bir koda katıl.'
            : 'Oyun tamamlandı. Aşağıdaki sıralama tamamlanmış skor üzerinden.'}
        </p>
      </header>

      <ol className="space-y-2">
        {ranked.map((m, idx) => {
          const isMe = m.user_id === userId
          return (
            <li
              key={m.user_id}
              className={
                isMe
                  ? 'flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2'
                  : 'flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2'
              }
            >
              <span
                aria-hidden="true"
                className="flex size-6 items-center justify-center rounded-full bg-[var(--card)] text-xs font-bold"
              >
                {idx + 1}
              </span>
              <span className="flex-1 truncate text-sm font-medium">
                {m.display_name}
                {isMe && (
                  <span className="ml-1 text-xs text-emerald-700 dark:text-emerald-300">
                    (sen)
                  </span>
                )}
              </span>
              <span className="text-sm font-bold tabular-nums">{m.score}</span>
            </li>
          )
        })}
      </ol>

      <div className="mt-6 flex justify-center gap-2">
        <Link
          href="/oda"
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium hover:bg-[var(--card)]"
        >
          Odalarım
        </Link>
        <Link
          href="/oda/yeni"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
        >
          Yeni Oda Kur
        </Link>
      </div>
    </section>
  )
}
