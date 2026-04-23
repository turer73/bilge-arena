'use client'

import Image from 'next/image'

interface LeaderboardEntry {
  rank: number
  user_id?: string
  name: string
  avatar: string
  xp: number
  level: string
  isCurrentUser?: boolean
}

interface LeaderboardTableProps {
  entries: LeaderboardEntry[]
  title?: string
}

const MEDALS = ['🥇', '🥈', '🥉']
const MEDAL_COLORS = ['var(--reward)', '#CBD5E1', '#CD7F32']

export function LeaderboardTable({ entries, title = 'Haftalık Sıralama' }: LeaderboardTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card-bg)]">
      {/* Header */}
      <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
        <h2 className="font-display text-sm font-bold">{title}</h2>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[40px_1fr_80px_60px] gap-2 border-b border-[var(--border)] px-4 py-2">
        <span className="text-[9px] font-extrabold tracking-wider text-[var(--text-muted)]">#</span>
        <span className="text-[9px] font-extrabold tracking-wider text-[var(--text-muted)]">OYUNCU</span>
        <span className="text-right text-[9px] font-extrabold tracking-wider text-[var(--text-muted)]">XP</span>
        <span className="text-right text-[9px] font-extrabold tracking-wider text-[var(--text-muted)]">SEVİYE</span>
      </div>

      {/* Entries */}
      {entries.map((entry, idx) => (
        <div
          key={entry.user_id ?? `rank-${idx}`}
          className="grid grid-cols-[40px_1fr_80px_60px] items-center gap-2 px-4 py-2.5 transition-colors duration-200"
          style={{
            background: entry.isCurrentUser ? 'var(--focus-bg)' : 'transparent',
            borderLeft: entry.isCurrentUser ? '3px solid var(--focus)' : '3px solid transparent',
          }}
        >
          {/* Rank */}
          <span
            className="font-display text-sm font-black"
            style={{ color: MEDAL_COLORS[entry.rank - 1] || 'var(--text-sub)' }}
          >
            {MEDALS[entry.rank - 1] || entry.rank}
          </span>

          {/* Player */}
          <div className="flex items-center gap-2">
            {entry.avatar.startsWith('http') ? (
              <Image
                src={entry.avatar}
                alt={entry.name}
                width={32}
                height={32}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface)] text-lg">
                {entry.avatar}
              </span>
            )}
            <span
              className="text-sm"
              style={{
                fontWeight: entry.isCurrentUser ? 700 : 400,
                color: entry.isCurrentUser ? 'var(--text)' : 'var(--text-sub)',
              }}
            >
              {entry.name}
              {entry.isCurrentUser && <span className="ml-1 text-[10px] text-[var(--focus)]">(Sen)</span>}
            </span>
          </div>

          {/* XP */}
          <span className="text-right font-display text-sm font-bold text-[var(--reward)]">
            {entry.xp.toLocaleString()}
          </span>

          {/* Level */}
          <span className="text-right text-xs text-[var(--text-sub)]">
            {entry.level}
          </span>
        </div>
      ))}
    </div>
  )
}
