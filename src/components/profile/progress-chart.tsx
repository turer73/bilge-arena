'use client'

import { GAMES, type GameSlug } from '@/lib/constants/games'

interface CategoryProgress {
  category: string
  percentage: number
}

interface ProgressChartProps {
  game: GameSlug
  categories: CategoryProgress[]
  totalAnswered?: number
  accuracy?: number
}

export function ProgressChart({ game, categories, totalAnswered = 0, accuracy = 0 }: ProgressChartProps) {
  const gameDef = GAMES[game]
  const hasData = totalAnswered > 0

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="rounded-md px-2 py-0.5 text-[10px] font-bold"
            style={{
              backgroundColor: `color-mix(in srgb, ${gameDef.colorHex} 12%, transparent)`,
              color: gameDef.colorHex,
            }}
          >
            {gameDef.name}
          </span>
        </div>
        {hasData && (
          <div className="flex items-center gap-2 text-[9px] text-[var(--text-muted)]">
            <span>{totalAnswered} soru</span>
            <span
              className="font-bold"
              style={{
                color: accuracy >= 70
                  ? 'var(--growth)'
                  : accuracy >= 40
                  ? 'var(--reward)'
                  : 'var(--urgency)',
              }}
            >
              %{accuracy}
            </span>
          </div>
        )}
      </div>

      {!hasData ? (
        <div className="py-3 text-center text-[10px] text-[var(--text-muted)]">
          Henuz soru cozulmedi
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {categories.map((cat) => {
            const color = cat.percentage >= 70
              ? 'var(--growth)'
              : cat.percentage >= 40
              ? 'var(--reward)'
              : 'var(--urgency)'

            return (
              <div key={cat.category}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs text-[var(--text-sub)]">{cat.category}</span>
                  <span className="text-xs font-bold" style={{ color }}>%{cat.percentage}</span>
                </div>
                <div className="h-[5px] overflow-hidden rounded-full bg-[var(--border)]">
                  <div
                    className="h-full rounded-full transition-[width] duration-700"
                    style={{ width: `${cat.percentage}%`, background: color }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
