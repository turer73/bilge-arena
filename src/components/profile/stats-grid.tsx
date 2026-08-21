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
    <div className="grid grid-cols-2 gap-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex min-h-[5.25rem] items-center gap-3 rounded-2xl border-2 border-[#e2e8f0] bg-white p-3 text-left shadow-[0_4px_0_#dbe2ea]"
        >
          <div
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f1f5f9] text-xl"
          >
            {stat.icon}
          </div>
          <div className="min-w-0">
            <div className="font-display text-lg font-black tabular-nums" style={{ color: stat.color }}>
              {typeof stat.value === 'number' ? stat.value.toLocaleString('tr-TR') : stat.value}
            </div>
            <div className="mt-0.5 text-[10px] font-extrabold leading-tight tracking-[0.08em] text-[#64748b]">
              {stat.label}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
