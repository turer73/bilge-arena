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
    <div className="rounded-2xl border-2 border-[var(--app-border)] bg-[var(--app-card)] p-4 shadow-[0_4px_0_var(--app-border)]">
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
          <div className="flex items-center gap-2 text-[9px] text-[var(--app-text-sub)]">
            <span>{totalAnswered} soru</span>
            <span
              className="font-bold"
              style={{
                color: accuracy >= 70
                  ? 'var(--app-success)'
                  : accuracy >= 40
                  ? 'var(--app-warn)'
                  : 'var(--app-danger)',
              }}
            >
              %{accuracy}
            </span>
          </div>
        )}
      </div>

      {!hasData ? (
        <div className="py-3 text-center text-[10px] font-semibold text-[var(--app-text-sub)]">
          Henüz soru çözülmedi
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {categories.map((cat) => {
            const color = cat.percentage >= 70
              ? 'var(--app-success)'
              : cat.percentage >= 40
              ? 'var(--app-warn)'
              : 'var(--app-danger)'

            return (
              <div key={cat.category}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--app-text-sub)]">{cat.category}</span>
                  <span className="text-xs font-bold" style={{ color }}>%{cat.percentage}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--app-border)]">
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
