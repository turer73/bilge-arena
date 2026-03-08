'use client'

interface LeaderboardEntry {
  rank: number
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

export function LeaderboardTable({ entries, title = 'Haftalik Siralama' }: LeaderboardTableProps) {
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
      {entries.map((entry) => (
        <div
          key={entry.rank}
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
            <span className="text-lg">{entry.avatar}</span>
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
