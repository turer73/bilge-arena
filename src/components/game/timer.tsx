'use client'

interface TimerProps {
  seconds: number
  total: number
}

export function Timer({ seconds, total }: TimerProps) {
  const r = 26
  const C = 2 * Math.PI * r
  const offset = C * (1 - seconds / total)

  const isCritical = seconds <= 5
  const isUrgent = seconds <= 10 && seconds > 5

  const color = isCritical
    ? 'var(--urgency)'
    : isUrgent
    ? 'var(--reward)'
    : 'var(--focus)'

  const animation = isCritical
    ? 'animate-timer-shake'
    : isUrgent
    ? 'animate-timer-pulse'
    : ''

  return (
    <div className={`relative flex items-center justify-center ${animation}`}>
      <svg width={68} height={68} className="-rotate-90">
        <circle
          cx={34}
          cy={34}
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={4}
        />
        <circle
          cx={34}
          cy={34}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.4s ease' }}
        />
      </svg>
      <div
        className="absolute font-display font-black transition-colors duration-300"
        style={{
          fontSize: isCritical ? 22 : 19,
          color,
          textShadow: isCritical ? `0 0 8px var(--urgency)` : undefined,
        }}
      >
        {seconds}
      </div>
    </div>
  )
}
