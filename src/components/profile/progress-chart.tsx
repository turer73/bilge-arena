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
    <div className="rounded-2xl border-2 border-[#e2e8f0] bg-white p-4 shadow-[0_4px_0_#dbe2ea]">
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
          <div className="flex items-center gap-2 text-[9px] text-[#64748b]">
            <span>{totalAnswered} soru</span>
            <span
              className="font-bold"
              style={{
                color: accuracy >= 70
                  ? '#16a34a'
                  : accuracy >= 40
                  ? '#d97706'
                  : '#dc2626',
              }}
            >
              %{accuracy}
            </span>
          </div>
        )}
      </div>

      {!hasData ? (
        <div className="py-3 text-center text-[10px] font-semibold text-[#64748b]">
          Henüz soru çözülmedi
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {categories.map((cat) => {
            const color = cat.percentage >= 70
              ? '#16a34a'
              : cat.percentage >= 40
              ? '#d97706'
              : '#dc2626'

            return (
              <div key={cat.category}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#475569]">{cat.category}</span>
                  <span className="text-xs font-bold" style={{ color }}>%{cat.percentage}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#e2e8f0]">
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
