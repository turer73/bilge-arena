'use client'

import { useState } from 'react'
import { Award, ChevronDown, ChevronUp, LockKeyhole, Sparkles } from 'lucide-react'
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
  { key: 'games', label: 'Oyun Yolculuğu', icon: '🎮', types: ['games_played'] },
  { key: 'knowledge', label: 'Bilgi Ustası', icon: '📚', types: ['correct_answers'] },
  { key: 'streak', label: 'Seri Şampiyonu', icon: '🔥', types: ['streak'] },
  { key: 'xp', label: 'XP Avcısı', icon: '⚡', types: ['xp'] },
  { key: 'quest', label: 'Görev Uzmanı', icon: '📋', types: ['daily_quest'] },
  { key: 'login', label: 'Sadakat Serisi', icon: '📅', types: ['login_streak'] },
  {
    key: 'arena',
    label: 'Arena Savaşçısı',
    icon: '⚔️',
    types: ['rooms_completed', 'multiplayer_firsts', 'multiplayer_wins'],
  },
]

function BadgeTile({ badge, earned }: { badge: BadgeDefinition; earned: boolean }) {
  const rarity = RARITY_COLORS[badge.rarity]
  const isHighRarity = badge.rarity === 'legendary' || badge.rarity === 'epic'

  return (
    <div
      className="relative flex min-h-[82px] min-w-0 flex-col items-center justify-center rounded-xl border px-1.5 py-2 text-center transition-all duration-200"
      style={{
        background: earned ? rarity.bg : 'var(--app-card-sunken)',
        borderColor: earned ? rarity.border : 'var(--app-border)',
        opacity: earned ? 1 : 0.56,
        boxShadow: earned && isHighRarity ? `0 0 18px -4px ${rarity.border}` : undefined,
      }}
      title={`${badge.name}\n${badge.description}\n+${badge.xpReward} XP · ${RARITY_LABELS[badge.rarity]}`}
    >
      <span className={isHighRarity ? 'text-2xl leading-none' : 'text-xl leading-none'} style={{ filter: earned ? 'none' : 'grayscale(1)' }}>{badge.icon}</span>
      <span className="mt-1 line-clamp-2 w-full text-[8px] font-black leading-tight" style={{ color: earned ? rarity.text : 'var(--app-text-muted)' }}>{badge.name}</span>
      <span className="mt-1 text-[7px] font-bold tabular-nums" style={{ color: earned ? rarity.text : 'var(--app-text-muted)' }}>+{badge.xpReward} XP</span>
      {earned ? (
        <span aria-label="Kazanıldı" className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-black text-white shadow-sm" style={{ background: rarity.border }}>✓</span>
      ) : (
        <LockKeyhole aria-label="Kilitli" className="absolute right-1.5 top-1.5 text-[var(--app-text-muted)]" size={10} />
      )}
    </div>
  )
}

export function BadgeShowcase({ earnedBadgeCodes }: BadgeShowcaseProps) {
  const [expanded, setExpanded] = useState(false)
  const totalEarned = earnedBadgeCodes.length
  const total = BADGES.length
  const progress = total > 0 ? (totalEarned / total) * 100 : 0
  const earnedSet = new Set(earnedBadgeCodes)
  const earnedPreview = BADGES.filter((badge) => earnedSet.has(badge.code)).slice(0, 4)
  const nextTargets = BADGES.filter((badge) => !earnedSet.has(badge.code)).slice(0, earnedPreview.length > 0 ? 2 : 4)
  const previewBadges = [...earnedPreview, ...nextTargets].slice(0, 4)

  return (
    <section data-badge-showcase className="rounded-[22px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-4 shadow-[0_4px_0_var(--app-border)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--app-warn-tint)] text-[var(--app-warn-ink)]"><Award size={22} strokeWidth={2.4} /></span>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.17em] text-[var(--app-text-muted)]">Başarı koleksiyonu</p>
            <h3 className="mt-0.5 text-sm font-black">Rozet Kasası</h3>
          </div>
        </div>
        <span className="rounded-xl bg-[var(--app-accent-tint)] px-2.5 py-1.5 text-[10px] font-black tabular-nums text-[var(--app-accent-text)]">{totalEarned}/{total}</span>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--app-border-soft)]" aria-label={`Rozet ilerlemesi yüzde ${Math.round(progress)}`}>
        <div className="h-full rounded-full bg-gradient-to-r from-[var(--app-accent)] to-[var(--app-warn)] transition-[width] duration-700" style={{ width: `${progress}%` }} />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-1.5" aria-label="Rozet özeti">
        {previewBadges.map((badge) => <BadgeTile key={badge.code} badge={badge} earned={earnedSet.has(badge.code)} />)}
      </div>

      {totalEarned === 0 ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-[var(--app-accent-tint)] p-3 text-[10px] font-semibold leading-4 text-[var(--app-accent-text)]"><Sparkles className="mt-0.5 shrink-0" size={13} /> İlk oyununu tamamlayarak rozet yolculuğunu başlat.</p>
      ) : (
        <p className="mt-3 text-[10px] font-semibold leading-4 text-[var(--app-text-sub)]">{totalEarned} rozet kazandın. Sıradaki hedefler kilitli kartlarda seni bekliyor.</p>
      )}

      {expanded && (
        <div id="all-profile-badges" className="mt-5 space-y-5 border-t-2 border-[var(--app-border-soft)] pt-4">
          {CATEGORY_GROUPS.map(({ key, label, icon, types }) => {
            const groupBadges = BADGES.filter((badge) => types.includes(badge.conditionType))
            if (groupBadges.length === 0) return null
            const groupEarned = groupBadges.filter((badge) => earnedSet.has(badge.code)).length

            return (
              <div key={key}>
                <div className="mb-2 flex items-center gap-1.5">
                  <span className="text-xs leading-none">{icon}</span>
                  <span className="text-[8px] font-black uppercase tracking-[0.14em] text-[var(--app-text-muted)]">{label}</span>
                  <div className="mx-1 flex-1 border-t border-dashed border-[var(--app-border)]" />
                  <span className="rounded-full bg-[var(--app-card-sunken)] px-1.5 py-0.5 text-[8px] font-black text-[var(--app-text-muted)]">{groupEarned}/{groupBadges.length}</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {groupBadges.map((badge) => <BadgeTile key={badge.code} badge={badge} earned={earnedSet.has(badge.code)} />)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="all-profile-badges"
        onClick={() => setExpanded((current) => !current)}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--app-border)] bg-[var(--app-card-sunken)] text-[10px] font-black text-[var(--app-text-sub)] transition-colors hover:border-[var(--app-accent-border)] hover:text-[var(--app-accent-text)]"
      >
        {expanded ? <><ChevronUp size={15} /> Rozetleri daralt</> : <><ChevronDown size={15} /> Tüm rozetleri gör</>}
      </button>
    </section>
  )
}
