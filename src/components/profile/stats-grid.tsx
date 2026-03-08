'use client'

interface Stat {
  label: string
  value: string | number
  icon: string
  color: string
}

interface StatsGridProps {
  stats: Stat[]
}

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat, i) => (
        <div
          key={i}
          className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-4 text-center"
        >
          <div className="mb-1 text-xl">{stat.icon}</div>
          <div className="font-display text-xl font-black" style={{ color: stat.color }}>
            {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
          </div>
          <div className="mt-1 text-[9px] font-extrabold tracking-wider text-[var(--text-sub)]">
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  )
}
