/**
 * Bilge Arena Oda: <GameCompleted> oyun bitti scoreboard
 * Sprint 1 PR4e-1 + PR4g (full scoreboard + medal UI)
 *
 * State 'completed' (oyun bitti veya iptal) ve 'archived' (30+ gun retention)
 * icin goruntuleme. PR4g: scoreboard sunucu agregasyonu (score + correct_count
 * + response_ms_total tie-breaker). Top 3 medal emoji.
 *
 * Fallback: scoreboard bos ise (eski oda, archive) members.score uzerinden
 * basit siralama.
 */

import Link from 'next/link'
import type { RoomState } from '@/lib/rooms/room-state-reducer'
import { cn } from '@/lib/utils/cn'
import { ShareButton } from './ShareButton'
import { ReplayButton } from './ReplayButton'

interface GameCompletedProps {
  state: RoomState
  userId: string
}

const MEDALS = ['🥇', '🥈', '🥉'] as const

function formatSeconds(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} sn`
  const m = Math.floor(s / 60)
  const rs = s % 60
  return `${m}d ${rs}sn`
}

export function GameCompleted({ state, userId }: GameCompletedProps) {
  const { room, members, scoreboard } = state
  const isArchived = room.state === 'archived'

  // PR4g: server scoreboard varsa kullan, yoksa member.score fallback
  const ranked =
    scoreboard.length > 0
      ? scoreboard
      : [...members]
          .filter((m) => !m.is_kicked)
          .map((m) => ({
            user_id: m.user_id,
            display_name: m.display_name,
            score: m.score ?? 0,
            correct_count: 0,
            response_ms_total: 0,
          }))
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
            : 'Oyun tamamlandı. Aşağıdaki sıralama: skor → doğru sayısı → hız.'}
        </p>
      </header>

      <ol className="space-y-2" aria-label="Sıralama">
        {ranked.map((entry, idx) => {
          const isMe = entry.user_id === userId
          const medal = idx < 3 ? MEDALS[idx] : null
          const isPodium = medal !== null
          return (
            <li
              key={entry.user_id}
              className={cn(
                'flex items-center gap-3 rounded-lg border px-3 py-2.5',
                isMe
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : isPodium
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : 'border-[var(--border)] bg-[var(--surface)]',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-8 items-center justify-center rounded-full text-base font-bold',
                  isPodium
                    ? 'bg-transparent text-2xl'
                    : 'bg-[var(--card)] text-xs',
                )}
              >
                {medal ?? idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {entry.display_name}
                  </span>
                  {isMe && (
                    <span className="text-xs text-emerald-700 dark:text-emerald-300">
                      (sen)
                    </span>
                  )}
                </div>
                {entry.correct_count > 0 && (
                  <p className="text-[10px] text-[var(--text-sub)]">
                    {entry.correct_count} doğru
                    {entry.response_ms_total > 0 &&
                      ` • ${formatSeconds(entry.response_ms_total)}`}
                  </p>
                )}
              </div>
              <span
                className={cn(
                  'text-base font-bold tabular-nums',
                  isPodium && 'text-amber-700 dark:text-amber-300',
                )}
              >
                {entry.score}
              </span>
            </li>
          )
        })}
      </ol>

      {/* Sprint 2C Task 8: Replay & Share
          Codex P1 fix: NEXT_PUBLIC_SITE_URL ile SSR/client tutarli URL
          (window.location.origin SSR'da yok, hidrasyon mismatch yapiyordu) */}
      {!isArchived && (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <ReplayButton sourceRoomId={room.id} />
          <ShareButton
            url={`${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/oda/${room.code}`}
            text={(() => {
              const me = ranked.find((r) => r.user_id === userId)
              const score = me?.score ?? 0
              return score > 0
                ? `Bilge Arena'da "${room.title}" oyununu bitirdim, ${score} puan topladım!`
                : `Bilge Arena'da "${room.title}" oyununu oynadım!`
            })()}
          />
        </div>
      )}

      <div className="mt-3 flex justify-center gap-2">
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
