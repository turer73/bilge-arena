'use client'

interface XPBarProps {
  xp: number
  level: number
  max: number
}

export function XPBar({ xp, level, max }: XPBarProps) {
  const pct = Math.min((xp / max) * 100, 100)
  const nearLevel = pct >= 80

  return (
    <div className="flex items-center gap-2">
      {/* Level badge */}
      <div className="rounded-[5px] border border-[var(--reward-border)] bg-[var(--reward-bg)] px-2 py-0.5 font-display text-[10px] font-black tracking-wider text-[var(--reward)]">
        Sv.{level}
      </div>

      {/* Bar */}
      <div className="relative h-[7px] flex-1 overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className="relative h-full overflow-hidden rounded-full transition-[width] duration-700"
          style={{
            width: `${pct}%`,
            background: nearLevel
              ? 'linear-gradient(90deg, var(--reward-dark), var(--reward))'
              : 'linear-gradient(90deg, var(--focus-dark), var(--focus))',
            boxShadow: nearLevel
              ? '0 0 10px color-mix(in srgb, var(--reward) 53%, transparent)'
              : '0 0 6px color-mix(in srgb, var(--focus) 40%, transparent)',
          }}
        >
          {/* Shimmer scan */}
          <div className="absolute inset-0 w-1/2 animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </div>
      </div>

      {/* XP text */}
      <span className="text-[10px] font-semibold text-[var(--text-sub)]">
        {xp}
        <span className="text-[var(--text-muted)]">/{max}</span>
      </span>
    </div>
  )
}
