/**
 * Bilge Arena Oda: <WaitingForOthers> async beklerken ekran
 * Async PR2 Faz C
 *
 * Caller member.finished_at NOT NULL ise bu component render edilir.
 * Goster:
 *   - Caller'in final skoru + tamamladigi soru sayisi
 *   - Bitirmis uye listesi (skor sirali, kim bitti)
 *   - Hala oynuyan uye sayisi (current_round_index < question_count+1)
 *   - All-finished sonrasi rooms.state='completed' olur, polling bunu yakalar
 *     ve LobbyContainer GameCompleted view'a gecer (scoreboard).
 *
 * Pure component, useEffect/state yok. Polling primary mekanizma
 * (useRoomChannel hook 3-5sn fetchRoomState).
 */

import type { Member, Room } from '@/lib/rooms/room-state-reducer'

interface WaitingForOthersProps {
  room: Room
  members: Member[]
  viewerUserId: string
}

export function WaitingForOthers({
  room,
  members,
  viewerUserId,
}: WaitingForOthersProps) {
  const me = members.find((m) => m.user_id === viewerUserId)
  // Aktif (kicked olmayan, bot olmayan) uyeler
  const activeMembers = members.filter((m) => !m.is_kicked)
  const finishedMembers = activeMembers.filter(
    (m) => m.finished_at != null,
  )
  const playingMembers = activeMembers.filter((m) => m.finished_at == null)

  // Bitirmis uyeleri skor sirali
  const finishedSorted = [...finishedMembers].sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0),
  )

  return (
    <section
      aria-label="Diger oyuncular bekleniyor"
      className="space-y-4"
    >
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
        <h2 className="mb-2 text-lg font-bold text-emerald-700 dark:text-emerald-300">
          🎉 Tüm soruları tamamladın!
        </h2>
        <p className="text-sm text-[var(--text-sub)]">
          Senin skorun:{' '}
          <span className="text-2xl font-bold text-[var(--text)]">
            {me?.score ?? 0}
          </span>{' '}
          puan
        </p>
        <p className="mt-1 text-xs text-[var(--text-sub)]">
          {room.question_count} sorudan{' '}
          {/* current_round_index = question_count + 1 (sembolik) */}
          {Math.min(
            (me?.current_round_index ?? room.question_count + 1) - 1,
            room.question_count,
          )}{' '}
          tanesini cevapladın
        </p>
      </div>

      {playingMembers.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="mb-3 text-sm font-bold">
            ⏳ Hâlâ oynayan oyuncular ({playingMembers.length})
          </h3>
          <ul className="space-y-2">
            {playingMembers.map((m) => (
              <li
                key={m.user_id}
                className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block size-2 animate-pulse rounded-full bg-amber-500"
                    aria-label="Oynuyor"
                  />
                  <span className="font-medium">
                    {m.display_name ?? 'Oyuncu'}
                    {m.is_bot && (
                      <span className="ml-2 rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 dark:text-purple-300">
                        BOT
                      </span>
                    )}
                  </span>
                </span>
                <span className="text-xs text-[var(--text-sub)]">
                  Soru{' '}
                  {Math.min(
                    m.current_round_index ?? 1,
                    room.question_count,
                  )}{' '}
                  / {room.question_count}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-[var(--text-sub)]">
            Diğer oyuncular bitirince sıralama gösterilecek...
          </p>
        </div>
      )}

      {finishedSorted.length > 1 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="mb-3 text-sm font-bold">
            ✓ Bitiren oyuncular ({finishedSorted.length})
          </h3>
          <ul className="space-y-2">
            {finishedSorted.map((m, idx) => (
              <li
                key={m.user_id}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                  m.user_id === viewerUserId
                    ? 'bg-emerald-500/15 font-semibold'
                    : 'bg-[var(--surface)]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--text-sub)]">
                    #{idx + 1}
                  </span>
                  <span>
                    {m.display_name ?? 'Oyuncu'}
                    {m.is_bot && (
                      <span className="ml-2 rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 dark:text-purple-300">
                        BOT
                      </span>
                    )}
                    {m.user_id === viewerUserId && (
                      <span className="ml-2 text-xs text-emerald-700 dark:text-emerald-300">
                        (Sen)
                      </span>
                    )}
                  </span>
                </span>
                <span className="font-bold text-[var(--text)]">
                  {m.score ?? 0}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
