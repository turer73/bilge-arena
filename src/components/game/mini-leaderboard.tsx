'use client'

interface Player {
  name: string
  avatar: string
  xp: string
}

interface MiniLeaderboardProps {
  players: Player[]
  myRank?: number
}

const MEDALS = ['🥇', '🥈', '🥉']
const MEDAL_COLORS = ['var(--reward)', '#CBD5E1', '#CD7F32']

export function MiniLeaderboard({ players, myRank = 0 }: MiniLeaderboardProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)]">
      <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
        <span className="text-[9px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
          HAFTALIK SIRA
        </span>
      </div>

      {players.length === 0 && (
        <div className="px-3 py-4 text-center text-[10px] text-[var(--text-muted)]">
          Henuz veri yok
        </div>
      )}

      {players.map((player, i) => {
        const isMe = i + 1 === myRank
        const medal = MEDALS[i] || null

        return (
          <div
            key={i}
            className="flex items-center gap-2 px-3 py-[7px] transition-colors duration-200"
            style={{
              background: isMe ? 'var(--focus-bg)' : 'transparent',
              borderLeft: `2px solid ${isMe ? 'var(--focus)' : 'transparent'}`,
            }}
          >
            <span
              className="w-4 text-center font-display text-[10px] font-black"
              style={{ color: MEDAL_COLORS[i] || 'var(--text-sub)' }}
            >
              {medal || i + 1}
            </span>
            <span className="text-[15px]">{player.avatar}</span>
            <span
              className="flex-1 text-[11px]"
              style={{
                fontWeight: isMe ? 700 : 400,
                color: isMe ? 'var(--text)' : 'var(--text-sub)',
              }}
            >
              {player.name}{isMe ? ' (Sen)' : ''}
            </span>
            <span className="font-display text-[11px] font-bold text-[var(--reward)]">
              {player.xp}
            </span>
          </div>
        )
      })}
    </div>
  )
}
