'use client'

import { XPBar } from '@/components/game/xp-bar'
import { StreakBadge } from '@/components/game/streak-badge'
import { StatsGrid } from '@/components/profile/stats-grid'
import { BadgeShowcase } from '@/components/profile/badge-showcase'
import { ProgressChart } from '@/components/profile/progress-chart'
import { getLevelFromXP, getLevelProgress } from '@/lib/constants/levels'
import type { GameSlug } from '@/lib/constants/games'

// Mock profil verisi — Supabase baglaninca gercek veri gelecek
const MOCK_PROFILE = {
  displayName: 'Deniz T.',
  avatarEmoji: '🦉',
  totalXP: 2950,
  currentStreak: 7,
  bestStreak: 12,
  gamesPlayed: 34,
  correctAnswers: 218,
  totalAnswers: 340,
  earnedBadges: ['first_game', 'ten_games', 'first_correct', 'hundred_correct', 'streak_5', 'streak_10', 'xp_1000', 'daily_first'],
}

const MOCK_PROGRESS: Record<GameSlug, { category: string; percentage: number }[]> = {
  matematik: [
    { category: 'Sayilar', percentage: 78 },
    { category: 'Problemler', percentage: 54 },
    { category: 'Geometri', percentage: 31 },
  ],
  turkce: [
    { category: 'Paragraf', percentage: 65 },
    { category: 'Dil Bilgisi', percentage: 42 },
    { category: 'Sozcuk', percentage: 88 },
  ],
  fen: [
    { category: 'Fizik', percentage: 70 },
    { category: 'Kimya', percentage: 45 },
    { category: 'Biyoloji', percentage: 60 },
  ],
  sosyal: [
    { category: 'Tarih', percentage: 82 },
    { category: 'Cografya', percentage: 38 },
    { category: 'Felsefe', percentage: 25 },
  ],
  wordquest: [
    { category: 'Vocabulary', percentage: 55 },
    { category: 'Grammar', percentage: 40 },
  ],
}

export default function ProfilePage() {
  const p = MOCK_PROFILE
  const level = getLevelFromXP(p.totalXP)
  const accuracy = p.totalAnswers > 0 ? Math.round((p.correctAnswers / p.totalAnswers) * 100) : 0

  const stats = [
    { label: 'TOPLAM XP', value: p.totalXP, icon: '⚡', color: 'var(--reward)' },
    { label: 'OYUN', value: p.gamesPlayed, icon: '🎮', color: 'var(--focus)' },
    { label: 'BASARI', value: `%${accuracy}`, icon: '🎯', color: 'var(--growth)' },
    { label: 'EN IYI SERI', value: p.bestStreak, icon: '🔥', color: 'var(--reward-light)' },
  ]

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Profil basligi */}
      <div className="mb-6 animate-fadeUp rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-6">
        <div className="flex items-center gap-4">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full border-[3px] text-3xl"
            style={{
              background: 'linear-gradient(135deg, var(--focus-bg), var(--focus))',
              borderColor: 'var(--focus-border)',
            }}
          >
            {p.avatarEmoji}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{p.displayName}</h1>
            <div className="flex items-center gap-2 text-sm text-[var(--text-sub)]">
              <span>{level.badge} {level.name}</span>
              <span>·</span>
              <span>{p.totalXP.toLocaleString()} XP</span>
            </div>
            <div className="mt-2">
              <XPBar
                xp={p.totalXP - level.minXP}
                level={level.level}
                max={level.maxXP === Infinity ? 50000 : level.maxXP - level.minXP + 1}
              />
            </div>
          </div>
          <StreakBadge streak={p.currentStreak} />
        </div>
      </div>

      {/* Istatistikler */}
      <div className="mb-6 animate-fadeUp" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
        <StatsGrid stats={stats} />
      </div>

      {/* Rozetler */}
      <div className="mb-6 animate-fadeUp" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
        <BadgeShowcase earnedBadgeCodes={p.earnedBadges} />
      </div>

      {/* Konu ilerleme */}
      <div className="animate-fadeUp" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
        <h3 className="mb-3 text-[9px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
          KONU ILERLEMESI
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.entries(MOCK_PROGRESS) as [GameSlug, typeof MOCK_PROGRESS.matematik][]).map(
            ([game, cats]) => (
              <ProgressChart key={game} game={game} categories={cats} />
            )
          )}
        </div>
      </div>
    </div>
  )
}
