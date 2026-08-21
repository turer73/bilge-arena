type ChartSegment = {
  label: string
  value: number
  colorClass: string
  barClass: string
}

function percentage(value: number, total: number): number {
  if (total <= 0 || value <= 0) return 0
  return Math.min(100, Math.round((value / total) * 100))
}

export function EvidenceDistributionChart({
  total,
  centerValue,
  centerLabel,
  segments,
  ariaLabel,
}: {
  total: number
  centerValue: number
  centerLabel: string
  segments: ChartSegment[]
  ariaLabel: string
}) {
  let offset = 0

  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-center">
      <div className="relative mx-auto h-36 w-36" role="img" aria-label={ariaLabel}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r="41" fill="none" stroke="currentColor" strokeWidth="10" className="text-white/10" />
          {segments.map((segment) => {
            const share = total > 0 ? (segment.value / total) * 100 : 0
            const dashOffset = -offset
            offset += share
            return (
              <circle
                key={segment.label}
                cx="50"
                cy="50"
                r="41"
                pathLength="100"
                fill="none"
                stroke="currentColor"
                strokeWidth="10"
                strokeLinecap={share >= 99.5 ? 'butt' : 'round'}
                strokeDasharray={`${Math.max(0, share)} ${Math.max(0, 100 - share)}`}
                strokeDashoffset={dashOffset}
                className={segment.colorClass}
              />
            )
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <strong className="text-3xl font-black leading-none">{centerValue}</strong>
          <span className="mt-1 max-w-20 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-sub)]">{centerLabel}</span>
        </div>
      </div>

      <div className="min-w-0 space-y-3">
        {segments.map((segment) => {
          const share = percentage(segment.value, total)
          return (
            <div key={segment.label}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-2 font-bold">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${segment.barClass}`} aria-hidden="true" />
                  <span className="truncate">{segment.label}</span>
                </span>
                <span className="shrink-0 font-black">{segment.value} <span className="font-medium text-[var(--text-sub)]">· %{share}</span></span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                <div className={`h-full rounded-full ${segment.barClass}`} style={{ width: `${share}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function PercentBar({
  value,
  tone = 'primary',
  label,
}: {
  value: number | null
  tone?: 'primary' | 'emerald' | 'sky' | 'amber'
  label: string
}) {
  const safeValue = value === null ? 0 : Math.max(0, Math.min(100, value))
  const tones = {
    primary: 'bg-[var(--primary)]',
    emerald: 'bg-emerald-400',
    sky: 'bg-sky-400',
    amber: 'bg-amber-400',
  }

  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-white/10"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value ?? undefined}
      aria-valuetext={value === null ? 'Veri yetersiz' : `%${value}`}
    >
      <div className={`h-full rounded-full transition-[width] duration-500 ${tones[tone]}`} style={{ width: `${safeValue}%` }} />
    </div>
  )
}

export function SegmentedBar({
  total,
  segments,
  ariaLabel,
}: {
  total: number
  segments: ChartSegment[]
  ariaLabel: string
}) {
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/10" role="img" aria-label={ariaLabel}>
        {segments.map((segment) => (
          <div
            key={segment.label}
            className={`h-full first:rounded-l-full last:rounded-r-full ${segment.barClass}`}
            style={{ width: `${percentage(segment.value, total)}%` }}
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        {segments.map((segment) => (
          <span key={segment.label} className="flex items-center gap-2 text-xs text-[var(--text-sub)]">
            <span className={`h-2.5 w-2.5 rounded-full ${segment.barClass}`} aria-hidden="true" />
            {segment.label} <strong className="text-[var(--text)]">{segment.value}</strong>
          </span>
        ))}
      </div>
    </div>
  )
}
