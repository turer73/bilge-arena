'use client'

interface Stat {
  label: string
  value: string | number
  icon: string
  color: string
  featured?: boolean
}

interface StatsGridProps {
  stats: Stat[]
}

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-6 sm:gap-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`rounded-xl border border-[var(--border)] bg-[var(--card-bg)] ${
            stat.featured
              ? 'col-span-2 flex min-h-24 items-center justify-between gap-4 p-4 text-left sm:col-span-2 sm:block sm:min-h-28 sm:text-center'
              : 'col-span-1 flex min-h-24 flex-col items-center justify-center p-3 text-center sm:min-h-28'
          }`}
        >
          <div aria-hidden className="text-xl sm:mb-1">{stat.icon}</div>
          <div className={stat.featured ? 'flex-1 sm:block' : undefined}>
            <div className="font-display text-xl font-black" style={{ color: stat.color }}>
              {typeof stat.value === 'number' ? stat.value.toLocaleString('tr-TR') : stat.value}
            </div>
            <div className="mt-1 text-xs font-extrabold tracking-wider text-[var(--text-sub)]">
              {stat.label}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
