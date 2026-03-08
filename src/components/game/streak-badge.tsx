'use client'

interface StreakBadgeProps {
  streak: number
}

export function StreakBadge({ streak }: StreakBadgeProps) {
  const isHot = streak >= 5
  const isFire = streak >= 10

  return (
    <div
      className="flex items-center gap-1.5 rounded-[20px] border-[1.5px] px-[11px] py-[5px] transition-all duration-300"
      style={{
        background: isHot ? 'color-mix(in srgb, var(--reward) 10%, transparent)' : 'transparent',
        borderColor: isHot ? 'var(--reward)' : 'var(--border)',
        opacity: streak > 0 ? 1 : 0.4,
      }}
    >
      <span
        className={`inline-block ${isHot ? 'animate-flame' : ''}`}
        style={{ fontSize: isFire ? 24 : isHot ? 20 : 16 }}
      >
        🔥
      </span>

      <span
        className="font-display font-black"
        style={{
          fontSize: isHot ? 16 : 13,
          color: isHot ? 'var(--reward)' : 'var(--text-sub)',
        }}
      >
        {streak}
      </span>

      {isHot && (
        <span className="text-[9px] font-extrabold tracking-wider text-[var(--reward)]">
          {isFire ? 'YANGIN!' : 'SERI!'}
        </span>
      )}
    </div>
  )
}
