'use client'

interface Quest {
  label: string
  done: number
  total: number
  color: string
}

interface DailyQuestsProps {
  quests: Quest[]
}

export function DailyQuests({ quests }: DailyQuestsProps) {
  const completedCount = quests.filter(q => q.done >= q.total).length

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
        <span className="text-[9px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
          GUNLUK GOREV
        </span>
        <span className="text-[10px] font-bold text-[var(--reward)]">
          {completedCount}/{quests.length} ✓
        </span>
      </div>

      {/* Quest items */}
      {quests.map((quest, i) => {
        const pct = Math.min((quest.done / quest.total) * 100, 100)
        const done = quest.done >= quest.total

        return (
          <div
            key={i}
            className="px-3 py-2"
            style={{ borderBottom: i < quests.length - 1 ? '1px solid var(--border)' : undefined }}
          >
            <div className="mb-1 flex items-center justify-between">
              <span
                className="text-[11px]"
                style={{
                  color: done ? quest.color : 'var(--text-sub)',
                  fontWeight: done ? 600 : 400,
                }}
              >
                {done ? '✓ ' : ''}{quest.label}
              </span>
              <span className="text-[10px] font-bold" style={{ color: quest.color }}>
                {quest.done}/{quest.total}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-[var(--border)]">
              <div
                className="h-full rounded-full transition-[width] duration-600"
                style={{
                  width: `${pct}%`,
                  background: quest.color,
                  boxShadow: done ? `0 0 6px color-mix(in srgb, ${quest.color} 53%, transparent)` : undefined,
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
