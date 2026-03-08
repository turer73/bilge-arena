'use client'

import { GAMES, type GameSlug } from '@/lib/constants/games'

interface CategoryProgress {
  category: string
  percentage: number
}

interface ProgressChartProps {
  game: GameSlug
  categories: CategoryProgress[]
}

export function ProgressChart({ game, categories }: ProgressChartProps) {
  const gameDef = GAMES[game]

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
      <div className="mb-3 flex items-center gap-2">
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
    </div>
  )
}
