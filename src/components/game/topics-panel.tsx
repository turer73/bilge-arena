'use client'

interface TopicStrength {
  label: string
  percentage: number
}

interface TopicsPanelProps {
  topics: TopicStrength[]
}

/**
 * Konu Gücü — tam genişlik yatay bant. Quiz grid'inin altında durur;
 * mobilde 2, tablette 3, desktop'ta 4 sütunlu kompakt grid.
 */
export function TopicsPanel({ topics }: TopicsPanelProps) {
  return (
    <div className="overflow-hidden rounded-[20px] border-2 border-[#dbeafe] bg-white shadow-[0_4px_0_#bfdbfe]">
      <div className="border-b border-[#dbeafe] bg-[#eff6ff] px-3 py-2">
        <span className="text-[9px] font-extrabold tracking-[0.18em] text-[#2563eb]">
          KONU GUCU
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-3 p-3 sm:grid-cols-3 lg:grid-cols-4 xl:gap-x-6">
        {topics.map((topic, i) => {
          const color = topic.percentage === 0
            ? '#94a3b8'
            : topic.percentage >= 70
            ? 'var(--growth)'
            : topic.percentage >= 40
            ? 'var(--reward)'
            : 'var(--urgency)'

          return (
            <div key={i}>
              <div className="mb-[3px] flex items-center justify-between gap-2">
                <span className="truncate text-[10px] font-semibold text-[#69717a]">{topic.label}</span>
                <span className="shrink-0 text-[10px] font-bold" style={{ color }}>
                  %{topic.percentage}
                </span>
              </div>
              <div className="h-[3px] overflow-hidden rounded-full bg-[#e5e7eb]">
                <div
                  className="h-full rounded-full transition-[width] duration-700"
                  style={{ width: `${topic.percentage}%`, background: color }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
