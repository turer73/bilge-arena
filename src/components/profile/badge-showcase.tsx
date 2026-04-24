'use client'

import { BADGES, RARITY_COLORS } from '@/lib/constants/badges'

interface BadgeShowcaseProps {
  earnedBadgeCodes: string[]
}

export function BadgeShowcase({ earnedBadgeCodes }: BadgeShowcaseProps) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
      <h3 className="mb-3 text-[9px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
        ROZETLER ({earnedBadgeCodes.length}/{BADGES.length})
      </h3>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {BADGES.map((badge) => {
          const earned = earnedBadgeCodes.includes(badge.code)
          const rarity = RARITY_COLORS[badge.rarity]

          return (
            <div
              key={badge.code}
              className="relative flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition-all duration-200"
              style={{
                background: earned ? rarity.bg : 'var(--bg-secondary)',
                borderColor: earned ? rarity.border : 'var(--border)',
                opacity: earned ? 1 : 0.4,
              }}
              title={`${badge.name}: ${badge.description}`}
            >
              <span className="text-2xl" style={{ filter: earned ? 'none' : 'grayscale(1)' }}>
                {badge.icon}
              </span>
              <span
                className="text-[9px] font-bold leading-tight"
                style={{ color: earned ? rarity.text : 'var(--text-muted)' }}
              >
                {badge.name}
              </span>
              {earned && (
                <span className="absolute -right-1 -top-1 text-xs">✓</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
