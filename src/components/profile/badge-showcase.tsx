'use client'

import { BADGES, RARITY_COLORS, type BadgeDefinition } from '@/lib/constants/badges'

interface BadgeShowcaseProps {
  earnedBadgeCodes: string[]
}

const RARITY_LABELS: Record<string, string> = {
  common: 'Yaygın',
  rare: 'Nadir',
  epic: 'Destansı',
  legendary: 'Efsanevi',
}

const CATEGORY_GROUPS: Array<{
  key: string
  label: string
  icon: string
  types: BadgeDefinition['conditionType'][]
}> = [
  { key: 'games',     label: 'Oyun Yolculuğu',  icon: '🎮', types: ['games_played'] },
  { key: 'knowledge', label: 'Bilgi Ustası',     icon: '📚', types: ['correct_answers'] },
  { key: 'streak',    label: 'Seri Şampiyonu',  icon: '🔥', types: ['streak'] },
  { key: 'xp',        label: 'XP Avcısı',       icon: '⚡', types: ['xp'] },
  { key: 'quest',     label: 'Görev Uzmanı',    icon: '📋', types: ['daily_quest'] },
  { key: 'login',     label: 'Sadakat Serisi',  icon: '📅', types: ['login_streak'] },
  {
    key: 'arena',
    label: 'Arena Savaşçısı',
    icon: '⚔️',
    types: ['rooms_completed', 'multiplayer_firsts', 'multiplayer_wins'],
  },
]

export function BadgeShowcase({ earnedBadgeCodes }: BadgeShowcaseProps) {
  const totalEarned = earnedBadgeCodes.length
  const total = BADGES.length
  const progress = total > 0 ? (totalEarned / total) * 100 : 0

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4">

      {/* ─── Başlık + Genel İlerleme ─── */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[9px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
          ROZET KASASİ
        </h3>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${progress}%`,
                background:
                  progress >= 100
                    ? 'var(--reward)'
                    : progress >= 50
                    ? 'var(--focus)'
                    : 'var(--focus)',
              }}
            />
          </div>
          <span className="text-[10px] font-bold tabular-nums">
            <span style={{ color: 'var(--focus)' }}>{totalEarned}</span>
            <span className="text-[var(--text-muted)]">/{total}</span>
          </span>
        </div>
      </div>

      {/* ─── Kategori Grupları ─── */}
      <div className="space-y-5">
        {CATEGORY_GROUPS.map(({ key, label, icon, types }) => {
          const groupBadges = BADGES.filter((b) => types.includes(b.conditionType))
          if (groupBadges.length === 0) return null

          const groupEarned = groupBadges.filter((b) =>
            earnedBadgeCodes.includes(b.code)
          ).length
          const groupComplete = groupEarned === groupBadges.length

          return (
            <div key={key}>
              {/* Kategori başlığı */}
              <div className="mb-2 flex items-center gap-1.5">
                <span className="text-xs leading-none">{icon}</span>
                <span className="text-[8px] font-extrabold tracking-[0.14em] uppercase text-[var(--text-muted)]">
                  {label}
                </span>
                <div className="mx-1 flex-1 border-t border-dashed border-[var(--border)]" />
                <span
                  className="rounded-full px-1.5 py-0.5 text-[8px] font-bold"
                  style={{
                    background: groupComplete
                      ? 'var(--growth-bg)'
                      : 'var(--bg-secondary)',
                    color: groupComplete ? 'var(--growth)' : 'var(--text-muted)',
                  }}
                >
                  {groupEarned}/{groupBadges.length}
                </span>
              </div>

              {/* Rozet kartları */}
              <div className="flex flex-wrap gap-2">
                {groupBadges.map((badge) => {
                  const earned = earnedBadgeCodes.includes(badge.code)
                  const rarity = RARITY_COLORS[badge.rarity]
                  const isHighRarity =
                    badge.rarity === 'legendary' || badge.rarity === 'epic'

                  return (
                    <div
                      key={badge.code}
                      className="relative flex w-[74px] flex-col items-center gap-0.5 rounded-xl border px-1.5 pb-2 pt-2.5 text-center transition-all duration-200"
                      style={{
                        background: earned ? rarity.bg : 'var(--bg-secondary)',
                        borderColor: earned ? rarity.border : 'var(--border)',
                        opacity: earned ? 1 : 0.42,
                        boxShadow:
                          earned && isHighRarity
                            ? `0 0 18px -4px ${rarity.border}`
                            : undefined,
                      }}
                      title={`${badge.name}\n${badge.description}\n+${badge.xpReward} XP · ${RARITY_LABELS[badge.rarity]}`}
                    >
                      {/* İkon */}
                      <span
                        className={`leading-none ${isHighRarity ? 'text-2xl' : 'text-xl'}`}
                        style={{ filter: earned ? 'none' : 'grayscale(1)' }}
                      >
                        {badge.icon}
                      </span>

                      {/* Ad */}
                      <span
                        className="mt-1 line-clamp-2 w-full text-[8px] font-bold leading-tight"
                        style={{ color: earned ? rarity.text : 'var(--text-muted)' }}
                      >
                        {badge.name}
                      </span>

                      {/* Nadirlik çizgisi */}
                      <span
                        className="mt-0.5 h-0.5 w-5 rounded-full"
                        style={{ background: earned ? rarity.border : 'var(--border)' }}
                      />

                      {/* XP ödülü (sadece kazanılan) */}
                      {earned && (
                        <span
                          className="text-[7px] font-bold tabular-nums opacity-60"
                          style={{ color: rarity.text }}
                        >
                          +{badge.xpReward} XP
                        </span>
                      )}

                      {/* Kazanılan onay işareti */}
                      {earned && (
                        <span
                          className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-black text-white shadow-sm"
                          style={{ background: rarity.border }}
                        >
                          ✓
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
