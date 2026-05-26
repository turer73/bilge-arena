'use client'

interface StreakBadgeProps {
  streak: number
}

interface StreakTier {
  label: string
  icon: string
  iconSize: number
  borderColor: string
  bgColor: string
  textColor: string
  animate: boolean
  pulse: boolean
}

function getStreakTier(streak: number): StreakTier {
  if (streak >= 100) {
    return {
      label: '100 GÜN!',
      icon: '✨',
      iconSize: 26,
      borderColor: 'var(--reward)',
      bgColor: 'color-mix(in srgb, var(--reward) 15%, transparent)',
      textColor: 'var(--reward)',
      animate: true,
      pulse: true,
    }
  }
  if (streak >= 30) {
    return {
      label: '30 GÜN!',
      icon: '👑',
      iconSize: 24,
      borderColor: 'var(--reward)',
      bgColor: 'color-mix(in srgb, var(--reward) 12%, transparent)',
      textColor: 'var(--reward)',
      animate: true,
      pulse: true,
    }
  }
  if (streak >= 10) {
    return {
      label: 'YANGIN!',
      icon: '🔥',
      iconSize: 24,
      borderColor: 'var(--reward)',
      bgColor: 'color-mix(in srgb, var(--reward) 10%, transparent)',
      textColor: 'var(--reward)',
      animate: true,
      pulse: false,
    }
  }
  if (streak >= 5) {
    return {
      label: 'SERİ!',
      icon: '🔥',
      iconSize: 20,
      borderColor: 'var(--reward)',
      bgColor: 'color-mix(in srgb, var(--reward) 8%, transparent)',
      textColor: 'var(--reward)',
      animate: true,
      pulse: false,
    }
  }
  if (streak > 0) {
    return {
      label: '',
      icon: '🔥',
      iconSize: 16,
      borderColor: 'var(--border)',
      bgColor: 'transparent',
      textColor: 'var(--text-sub)',
      animate: false,
      pulse: false,
    }
  }
  return {
    label: '',
    icon: '🔥',
    iconSize: 16,
    borderColor: 'var(--border)',
    bgColor: 'transparent',
    textColor: 'var(--text-muted)',
    animate: false,
    pulse: false,
  }
}

export function StreakBadge({ streak }: StreakBadgeProps) {
  const tier = getStreakTier(streak)

  return (
    <div
      className={`flex items-center gap-1.5 rounded-[20px] border-[1.5px] px-[11px] py-[5px] transition-all duration-300 ${
        tier.pulse ? 'animate-pulse-ring' : ''
      }`}
      style={{
        background: tier.bgColor,
        borderColor: tier.borderColor,
        opacity: streak > 0 ? 1 : 0.4,
      }}
    >
      <span
        className={`inline-block leading-none ${tier.animate ? 'animate-flame' : ''}`}
        style={{ fontSize: tier.iconSize }}
      >
        {tier.icon}
      </span>

      <span
        className="font-display font-black tabular-nums"
        style={{
          fontSize: streak >= 5 ? 16 : 13,
          color: tier.textColor,
        }}
      >
        {streak}
      </span>

      {tier.label && (
        <span
          className="text-[9px] font-extrabold tracking-wider"
          style={{ color: tier.textColor }}
        >
          {tier.label}
        </span>
      )}
    </div>
  )
}

/**
 * Profil sayfasında streak milestone kutlama banner'i.
 * 7 / 30 / 100 gün eşiklerinde göster.
 */
export function StreakMilestoneBanner({ streak }: { streak: number }) {
  const milestones = [
    { threshold: 100, icon: '✨', text: '100 Günlük Seri!', sub: 'Efsane seviyeye ulaştın', color: 'var(--reward)', bg: 'var(--reward-bg)', border: 'var(--reward-border)' },
    { threshold: 30,  icon: '👑', text: '30 Günlük Seri!',  sub: 'Bir ay boyunca hiç bırakmadın', color: 'var(--reward)', bg: 'var(--reward-bg)', border: 'var(--reward-border)' },
    { threshold: 7,   icon: '🔥', text: '7 Günlük Seri!',  sub: 'Tam bir hafta! Şampiyonsun', color: 'var(--focus)', bg: 'var(--focus-bg)', border: 'var(--focus-border)' },
  ]

  const milestone = milestones.find((m) => streak >= m.threshold)
  if (!milestone) return null

  return (
    <div
      className="flex items-center gap-3 rounded-xl border px-4 py-2.5"
      style={{ background: milestone.bg, borderColor: milestone.border }}
    >
      <span className="text-2xl leading-none">{milestone.icon}</span>
      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-extrabold leading-tight"
          style={{ color: milestone.color }}
        >
          {milestone.text}
        </div>
        <div className="text-[10px] text-[var(--text-sub)]">{milestone.sub}</div>
      </div>
      <div
        className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black tabular-nums"
        style={{ background: milestone.border, color: 'white' }}
      >
        {streak} gün
      </div>
    </div>
  )
}
