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
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex min-h-[5.25rem] items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-3 text-left shadow-sm sm:min-h-24 sm:flex-col sm:justify-center sm:gap-1 sm:text-center"
        >
          <div
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-secondary)] text-lg sm:h-auto sm:w-auto sm:bg-transparent sm:text-xl"
          >
            {stat.icon}
          </div>
          <div className="min-w-0">
            <div className="font-display text-lg font-black tabular-nums sm:text-xl" style={{ color: stat.color }}>
              {typeof stat.value === 'number' ? stat.value.toLocaleString('tr-TR') : stat.value}
            </div>
            <div className="mt-0.5 text-[10px] font-extrabold leading-tight tracking-[0.08em] text-[var(--text-sub)] sm:text-xs">
              {stat.label}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
