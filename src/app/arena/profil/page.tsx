'use client'

import { useAuthStore } from '@/stores/auth-store'
import { XPBar } from '@/components/game/xp-bar'
import { StreakBadge } from '@/components/game/streak-badge'
import { StatsGrid } from '@/components/profile/stats-grid'
import { BadgeShowcase } from '@/components/profile/badge-showcase'
import { ProgressChart } from '@/components/profile/progress-chart'
import { getLevelFromXP } from '@/lib/constants/levels'
import type { GameSlug } from '@/lib/constants/games'
import Link from 'next/link'

// Konu ilerlemesi — ileride user_topic_progress tablosundan cekilecek
const DEFAULT_PROGRESS: Record<GameSlug, { category: string; percentage: number }[]> = {
  matematik: [
    { category: 'Sayilar', percentage: 0 },
    { category: 'Problemler', percentage: 0 },
    { category: 'Geometri', percentage: 0 },
  ],
  turkce: [
    { category: 'Paragraf', percentage: 0 },
    { category: 'Dil Bilgisi', percentage: 0 },
    { category: 'Sozcuk', percentage: 0 },
  ],
  fen: [
    { category: 'Fizik', percentage: 0 },
    { category: 'Kimya', percentage: 0 },
    { category: 'Biyoloji', percentage: 0 },
  ],
  sosyal: [
    { category: 'Tarih', percentage: 0 },
    { category: 'Cografya', percentage: 0 },
    { category: 'Felsefe', percentage: 0 },
  ],
  wordquest: [
    { category: 'Vocabulary', percentage: 0 },
    { category: 'Grammar', percentage: 0 },
  ],
}

export default function ProfilePage() {
  const { user, profile, loading } = useAuthStore()

  // Yukleniyor
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-[var(--border)] border-t-[var(--focus)]" />
      </div>
    )
  }

  // Giris yapilmamis
  if (!user || !profile) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mb-4 text-5xl">🔒</div>
        <h1 className="mb-2 text-xl font-bold">Giris Yapmaniz Gerekiyor</h1>
        <p className="mb-6 text-sm text-[var(--text-sub)]">
          Profilinizi gormek ve ilerlemenizi takip etmek icin giris yapin.
        </p>
        <Link
          href="/giris"
          className="btn-primary inline-block rounded-[10px] px-8 py-3 font-display text-sm font-bold tracking-wider"
        >
          Giris Yap
        </Link>
      </div>
    )
  }

  // Gercek profil verileri (DB kolon adlariyla uyumlu)
  const totalXP = profile.total_xp ?? 0
  const currentStreak = profile.current_streak ?? 0
  const longestStreak = profile.longest_streak ?? 0
  const totalSessions = profile.total_sessions ?? 0
  const correctAnswers = profile.correct_answers ?? 0
  const totalQuestions = profile.total_questions ?? 0
  const displayName = profile.display_name || profile.username || 'Arenaci'

  const level = getLevelFromXP(totalXP)
  const accuracy = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0

  const stats = [
    { label: 'TOPLAM XP', value: totalXP, icon: '⚡', color: 'var(--reward)' },
    { label: 'OYUN', value: totalSessions, icon: '🎮', color: 'var(--focus)' },
    { label: 'BASARI', value: `%${accuracy}`, icon: '🎯', color: 'var(--growth)' },
    { label: 'EN IYI SERI', value: longestStreak, icon: '🔥', color: 'var(--reward-light)' },
  ]

  // Rozet kontrolu — profil verilerine gore basit hesaplama
  // Ileride user_badges tablosundan cekilecek
  const earnedBadges: string[] = []
  if (totalSessions >= 1) earnedBadges.push('first_game')
  if (totalSessions >= 10) earnedBadges.push('ten_games')
  if (totalSessions >= 50) earnedBadges.push('fifty_games')
  if (correctAnswers >= 10) earnedBadges.push('first_correct')
  if (correctAnswers >= 100) earnedBadges.push('hundred_correct')
  if (currentStreak >= 3) earnedBadges.push('streak_5')
  if (currentStreak >= 7) earnedBadges.push('streak_10')
  if (totalXP >= 1000) earnedBadges.push('xp_1000')

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:max-w-3xl md:py-8 xl:max-w-4xl xl:px-6 xl:py-10 2xl:max-w-5xl">
      {/* Profil basligi */}
      <div className="mb-4 animate-fadeUp rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-4 md:mb-6 md:rounded-2xl md:p-6 xl:p-7 2xl:p-8">
        <div className="flex items-center gap-3 md:gap-4">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full border-[3px] text-2xl md:h-16 md:w-16 md:text-3xl xl:h-20 xl:w-20 xl:text-4xl"
            style={{
              background: 'linear-gradient(135deg, var(--focus-bg), var(--focus))',
              borderColor: 'var(--focus-border)',
            }}
          >
            {level.badge}
          </div>
          <div className="flex-1">
            <h1 className="text-base font-bold md:text-xl xl:text-2xl">{displayName}</h1>
            <div className="flex items-center gap-2 text-xs text-[var(--text-sub)] md:text-sm xl:text-base">
              <span>{level.badge} {level.name}</span>
              <span>·</span>
              <span>{totalXP.toLocaleString()} XP</span>
            </div>
            <div className="mt-2">
              <XPBar
                xp={totalXP - level.minXP}
                level={level.level}
                max={level.maxXP === Infinity ? 50000 : level.maxXP - level.minXP + 1}
              />
            </div>
          </div>
          <StreakBadge streak={currentStreak} />
        </div>
      </div>

      {/* Istatistikler */}
      <div className="mb-6 animate-fadeUp" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
        <StatsGrid stats={stats} />
      </div>

      {/* Rozetler */}
      <div className="mb-6 animate-fadeUp" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
        <BadgeShowcase earnedBadgeCodes={earnedBadges} />
      </div>

      {/* Konu ilerleme */}
      <div className="animate-fadeUp" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
        <h3 className="mb-3 text-[9px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
          KONU ILERLEMESI
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 md:gap-3 xl:gap-4">
          {(Object.entries(DEFAULT_PROGRESS) as [GameSlug, typeof DEFAULT_PROGRESS.matematik][]).map(
            ([game, cats]) => (
              <ProgressChart key={game} game={game} categories={cats} />
            )
          )}
        </div>
      </div>
    </div>
  )
}
