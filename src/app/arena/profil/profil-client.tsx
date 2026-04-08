'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { XPBar } from '@/components/game/xp-bar'
import { StreakBadge } from '@/components/game/streak-badge'
import { StatsGrid } from '@/components/profile/stats-grid'
import { BadgeShowcase } from '@/components/profile/badge-showcase'
import { ProgressChart } from '@/components/profile/progress-chart'
import { ComponentErrorBoundary } from '@/components/ui/error-boundary'
import { NotificationSettings } from '@/components/profile/notification-settings'
import { ReferralCard } from '@/components/profile/referral-card'
import { EditProfileModal } from '@/components/profile/edit-profile-modal'
import { getLevelFromXP } from '@/lib/constants/levels'
import { GAMES, type GameSlug } from '@/lib/constants/games'
import { fetchProfileStats, type ProfileStats } from '@/lib/supabase/profile-stats'
import Link from 'next/link'

// Mod isimleri
const MODE_LABELS: Record<string, string> = {
  classic: 'Klasik',
  blitz: 'Blitz',
  marathon: 'Maraton',
  boss: 'Boss',
  practice: 'Pratik',
  deneme: 'Deneme',
}

export default function ProfilClient() {
  const { user, profile, loading } = useAuthStore()
  const [stats, setStats] = useState<ProfileStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [earnedBadgeCodes, setEarnedBadgeCodes] = useState<string[]>([])
  const [editOpen, setEditOpen] = useState(false)

  // Kullanici giris yaptiginda istatistikleri ve rozetleri cek
  useEffect(() => {
    if (!user) return
    setStatsLoading(true)

    // Paralel olarak stats ve rozetleri cek
    Promise.all([
      fetchProfileStats(user.id),
      fetch('/api/badges').then((r) => r.ok ? r.json() : null),
    ])
      .then(([statsData, badgesData]) => {
        setStats(statsData)
        if (badgesData?.earnedCodes) {
          setEarnedBadgeCodes(badgesData.earnedCodes)
        }
      })
      .catch((err) => console.error('[Profil] Stats/Badges hatasi:', err))
      .finally(() => setStatsLoading(false))
  }, [user])

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

  // Gercek profil verileri
  const totalXP = profile.total_xp ?? 0
  const currentStreak = profile.current_streak ?? 0
  const longestStreak = profile.longest_streak ?? 0
  const totalSessions = profile.total_sessions ?? 0
  const correctAnswers = profile.correct_answers ?? 0
  const totalQuestions = profile.total_questions ?? 0
  const displayName = profile.display_name || profile.username || 'Arenaci'

  const level = getLevelFromXP(totalXP)
  const accuracy = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0

  const mainStats = [
    { label: 'TOPLAM XP', value: totalXP, icon: '⚡', color: 'var(--reward)' },
    { label: 'OYUN', value: totalSessions, icon: '🎮', color: 'var(--focus)' },
    { label: 'BASARI', value: `%${accuracy}`, icon: '🎯', color: 'var(--growth)' },
    { label: 'EN IYI SERI', value: longestStreak, icon: '🔥', color: 'var(--reward-light)' },
  ]

  // Kategori ilerleme verisini hazirla (gercek veya bos)
  const gameProgressData = Object.keys(GAMES).map((slug) => {
    const game = slug as GameSlug
    const gameDef = GAMES[game]
    const gameStat = stats?.gameStats.find((g) => g.game === game)

    if (gameStat && gameStat.categories.length > 0) {
      // Gercek veri var
      return {
        game,
        totalAnswered: gameStat.total,
        accuracy: gameStat.percentage,
        categories: gameStat.categories.map((c) => ({
          category: c.category.charAt(0).toUpperCase() + c.category.slice(1).replace(/_/g, ' '),
          percentage: c.percentage,
        })),
      }
    }

    // Henuz oynanmamis — kategorileri listele ama %0
    return {
      game,
      totalAnswered: 0,
      accuracy: 0,
      categories: gameDef.categories.slice(0, 4).map((cat) => ({
        category: cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' '),
        percentage: 0,
      })),
    }
  })

  // Uye olma suresi
  const memberSince = new Date(profile.created_at).toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: 'long',
  })

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:max-w-3xl md:py-8 xl:max-w-4xl xl:px-6 xl:py-10 2xl:max-w-5xl">
      {/* Profil basligi */}
      <div className="mb-4 animate-fadeUp rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-4 md:mb-6 md:rounded-2xl md:p-6 xl:p-7 2xl:p-8">
        <div className="flex items-center gap-3 md:gap-4">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={displayName}
              className="h-12 w-12 rounded-full border-[3px] object-cover md:h-16 md:w-16 xl:h-20 xl:w-20"
              style={{ borderColor: 'var(--focus-border)' }}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full border-[3px] text-2xl md:h-16 md:w-16 md:text-3xl xl:h-20 xl:w-20 xl:text-4xl"
              style={{
                background: 'linear-gradient(135deg, var(--focus-bg), var(--focus))',
                borderColor: 'var(--focus-border)',
              }}
            >
              {level.badge}
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-base font-bold md:text-xl xl:text-2xl">{displayName}</h1>
            <div className="flex items-center gap-2 text-xs text-[var(--text-sub)] md:text-sm xl:text-base">
              <span>{level.badge} {level.name}</span>
              <span>·</span>
              <span>{totalXP.toLocaleString()} XP</span>
              <span>·</span>
              <span>{memberSince}</span>
            </div>
            <div className="mt-2">
              <XPBar
                xp={totalXP - level.minXP}
                level={level.level}
                max={level.maxXP === Infinity ? 50000 : level.maxXP - level.minXP + 1}
              />
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StreakBadge streak={currentStreak} />
            <button
              onClick={() => setEditOpen(true)}
              className="rounded-lg border border-[var(--border)] px-3 py-1 text-[10px] font-semibold text-[var(--text-sub)] transition-colors hover:border-[var(--focus)] hover:text-[var(--focus)]"
            >
              Duzenle
            </button>
          </div>
        </div>
      </div>

      <EditProfileModal open={editOpen} onClose={() => setEditOpen(false)} />

      {/* Istatistikler */}
      <ComponentErrorBoundary label="İstatistikler" variant="inline">
        <div className="mb-6 animate-fadeUp" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
          <StatsGrid stats={mainStats} />
        </div>
      </ComponentErrorBoundary>

      {/* Oyun bazli istatistikler */}
      {stats && stats.gameStats.length > 0 && (
        <div className="mb-6 animate-fadeUp" style={{ animationDelay: '0.15s', animationFillMode: 'both' }}>
          <h3 className="mb-3 text-[9px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
            OYUN ISTATISTIKLERI
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 md:gap-3">
            {stats.gameStats.map((gs) => {
              const gameDef = GAMES[gs.game]
              if (!gameDef) return null
              return (
                <Link
                  key={gs.game}
                  href={`/arena/${gs.game}`}
                  className="group rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-3 text-center transition-all hover:border-[var(--focus-border)] hover:shadow-sm"
                >
                  <div
                    className="mx-auto mb-1.5 h-1 w-8 rounded-full"
                    style={{ backgroundColor: gameDef.colorHex }}
                  />
                  <div className="text-[11px] font-bold">{gameDef.name}</div>
                  <div
                    className="font-display text-lg font-black"
                    style={{ color: gameDef.colorHex }}
                  >
                    %{gs.percentage}
                  </div>
                  <div className="text-[9px] text-[var(--text-muted)]">
                    {gs.correct}/{gs.total} dogru
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Son oyunlar */}
      {stats && stats.recentGames.length > 0 && (
        <div className="mb-6 animate-fadeUp" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
          <h3 className="mb-3 text-[9px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
            SON OYUNLAR
          </h3>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] divide-y divide-[var(--border)]">
            {stats.recentGames.map((g) => {
              const gameDef = GAMES[g.game]
              if (!gameDef) return null
              const gameAccuracy = g.total_questions > 0
                ? Math.round((g.correct_count / g.total_questions) * 100)
                : 0
              const timeAgo = g.completed_at ? getTimeAgo(g.completed_at) : ''

              return (
                <div key={g.id} className="flex items-center gap-3 px-4 py-3">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
                    style={{ backgroundColor: gameDef.colorHex }}
                  >
                    {gameDef.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold truncate">{gameDef.name}</span>
                      <span className="rounded-md bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--text-muted)]">
                        {MODE_LABELS[g.mode] || g.mode}
                      </span>
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)]">
                      {g.correct_count}/{g.total_questions} dogru · {timeAgo}
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className="text-xs font-bold"
                      style={{
                        color: gameAccuracy >= 70
                          ? 'var(--growth)'
                          : gameAccuracy >= 40
                          ? 'var(--reward)'
                          : 'var(--urgency)',
                      }}
                    >
                      %{gameAccuracy}
                    </div>
                    <div className="text-[9px] text-[var(--reward)]">+{g.total_xp} XP</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Rozetler */}
      <ComponentErrorBoundary label="Rozetler" variant="inline">
        <div className="mb-6 animate-fadeUp" style={{ animationDelay: '0.25s', animationFillMode: 'both' }}>
          <BadgeShowcase earnedBadgeCodes={earnedBadgeCodes} />
        </div>
      </ComponentErrorBoundary>

      {/* Bildirim + Referral */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 animate-fadeUp" style={{ animationDelay: '0.28s', animationFillMode: 'both' }}>
        <NotificationSettings />
        <ReferralCard />
      </div>

      {/* Konu ilerleme */}
      <ComponentErrorBoundary label="Konu İlerlemesi" variant="inline">
        <div className="animate-fadeUp" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
          <h3 className="mb-3 text-[9px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
            KONU ILERLEMESI
            {statsLoading && (
              <span className="ml-2 inline-block h-3 w-3 animate-spin rounded-full border border-[var(--border)] border-t-[var(--focus)]" />
            )}
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 md:gap-3 xl:gap-4">
            {gameProgressData.map(({ game, categories, totalAnswered, accuracy: gameAcc }) => (
              <ProgressChart
                key={game}
                game={game}
                categories={categories}
                totalAnswered={totalAnswered}
                accuracy={gameAcc}
              />
            ))}
          </div>
        </div>
      </ComponentErrorBoundary>
    </div>
  )
}

// ---------- Yardimci ----------

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'az once'
  if (minutes < 60) return `${minutes}dk once`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}sa once`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}g once`
  const weeks = Math.floor(days / 7)
  if (weeks < 4) return `${weeks}hf once`
  return new Date(dateStr).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}
