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
    <div className="overflow-hidden rounded-[20px] border-2 border-[var(--app-accent-border)] bg-[var(--app-card)] shadow-[0_4px_0_var(--app-shadow-accent)]">
      <div className="border-b border-[var(--app-accent-border)] bg-[var(--app-accent-tint)] px-3 py-2">
        <span className="text-[9px] font-extrabold tracking-[0.18em] text-[var(--app-accent-text)]">
          KONU GUCU
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-3 p-3 sm:grid-cols-3 lg:grid-cols-4 xl:gap-x-6">
        {topics.map((topic, i) => {
          const color = topic.percentage === 0
            ? 'var(--app-text-muted)'
            : topic.percentage >= 70
            ? 'var(--growth)'
            : topic.percentage >= 40
            ? 'var(--reward)'
            : 'var(--urgency)'

          return (
            <div key={i}>
              <div className="mb-[3px] flex items-center justify-between gap-2">
                <span className="truncate text-[10px] font-semibold text-[var(--app-text-sub)]">{topic.label}</span>
                <span className="shrink-0 text-[10px] font-bold" style={{ color }}>
                  %{topic.percentage}
                </span>
              </div>
              <div className="h-[3px] overflow-hidden rounded-full bg-[var(--app-border)]">
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
