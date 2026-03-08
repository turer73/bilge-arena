'use client'

interface TopicStrength {
  label: string
  percentage: number
}

interface TopicsPanelProps {
  topics: TopicStrength[]
}

export function TopicsPanel({ topics }: TopicsPanelProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)]">
      <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
        <span className="text-[9px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
          KONU GUCU
        </span>
      </div>

      {topics.map((topic, i) => {
        const color = topic.percentage >= 70
          ? 'var(--growth)'
          : topic.percentage >= 40
          ? 'var(--reward)'
          : 'var(--urgency)'

        return (
          <div
            key={i}
            className="px-3 py-[7px]"
            style={{ borderBottom: i < topics.length - 1 ? '1px solid var(--border)' : undefined }}
          >
            <div className="mb-[3px] flex items-center justify-between">
              <span className="text-[10px] text-[var(--text-sub)]">{topic.label}</span>
              <span className="text-[10px] font-bold" style={{ color }}>
                %{topic.percentage}
              </span>
            </div>
            <div className="h-[3px] overflow-hidden rounded-full bg-[var(--border)]">
              <div
                className="h-full rounded-full transition-[width] duration-700"
                style={{ width: `${topic.percentage}%`, background: color }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
