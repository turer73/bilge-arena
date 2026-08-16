'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { XPBar } from '@/components/game/xp-bar'
import { StreakBadge, StreakMilestoneBanner } from '@/components/game/streak-badge'
import { StatsGrid } from '@/components/profile/stats-grid'
import { BadgeShowcase } from '@/components/profile/badge-showcase'
import { CosmeticBadgeShelf } from '@/components/profile/cosmetic-badge-shelf'
import { ProgressChart } from '@/components/profile/progress-chart'
import { ComponentErrorBoundary } from '@/components/ui/error-boundary'
import { NotificationSettings } from '@/components/profile/notification-settings'
import { DiscoverabilitySettings } from '@/components/profile/discoverability-settings'
import { ReferralCard } from '@/components/profile/referral-card'
import { EditProfileModal } from '@/components/profile/edit-profile-modal'
import { getLevelFromXP } from '@/lib/constants/levels'
import { GAMES, type GameSlug } from '@/lib/constants/games'
import { fetchProfileBootstrap, type ProfileStats } from '@/lib/supabase/profile-stats'
import { PROFILE_FRAMES, FRAME_STORAGE_KEY, FRAME_RARITY_LABEL, FRAME_RARITY_COLOR } from '@/lib/constants/profile-frames'
import { resolveOwnedSelection } from '@/lib/utils/owned-selection'
import { useCardBackground, CardBackgroundLayer } from '@/components/profile/card-background'
import { Nameplate } from '@/components/profile/nameplate'
import { isStaff } from '@/lib/utils/is-staff'
import { ProfileFrameRing, FrameDot } from '@/components/profile/profile-frame-ring'
import { AvatarDecoration } from '@/components/profile/avatar-decoration'
import { ContentQualityStatus } from '@/components/profile/content-quality-status'
import { ProfileActions } from '@/components/profile/profile-actions'
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
  const [selectedFrameId, setSelectedFrameId] = useState<string>('none')
  const [framePickerOpen, setFramePickerOpen] = useState(false)
  const [ownedFrames, setOwnedFrames] = useState<string[]>(['none', 'mavi'])

  // Çerçeve seçimini localStorage'dan yükle
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FRAME_STORAGE_KEY)
      if (saved && PROFILE_FRAMES.some((f) => f.id === saved)) {
        setSelectedFrameId(saved)
      }
    } catch {}
  }, [])

  // Süs(ler) DB'de (selected_avatar_decorations) — sıralama/profilde başkalarına
  // da görünür; localStorage değil. Stüdyo/mağazadan seçilir.
  const decorationIds = profile?.selected_avatar_decorations ?? []

  // Profil KART arka planı — lobi kullanıcı kartıyla ORTAK hook (aynı tema,
  // sahiplik guard + personel bypass dahil). Zemin (ZEMIN_STORAGE_KEY) ayrı.
  const { activeBackground, activeBgVideoUrl, isCssBg, reducedMotion } = useCardBackground()

  // Profile'dan owned_frames yükle
  useEffect(() => {
    if (profile?.owned_frames && profile.owned_frames.length > 0) {
      setOwnedFrames(profile.owned_frames)
    }
  }, [profile?.owned_frames])

  // Kullanici giris yaptiginda istatistikleri ve rozetleri cek
  useEffect(() => {
    if (!user) return
    setStatsLoading(true)

    // Paralel olarak stats ve rozetleri cek — bootstrap tek seferde profile + stats (H3)
    Promise.all([
      fetchProfileBootstrap(),
      fetch('/api/badges').then((r) => r.ok ? r.json() : null),
    ])
      .then(([bootstrapData, badgesData]) => {
        const statsData: ProfileStats = bootstrapData
          ? { gameStats: bootstrapData.gameStats, recentGames: bootstrapData.recentGames }
          : { gameStats: [], recentGames: [] }
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
  const coinBalance = Math.max(0, profile.coin_balance ?? 0)
  const displayName = profile.username || profile.display_name || 'Arenaci'

  const level = getLevelFromXP(totalXP)
  const accuracy = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0

  // Aynı sahiplik guard'ı çerçeveler için (aynı localStorage bypass açığı vardı)
  const frameOwned = isStaff(profile) ? PROFILE_FRAMES.map((f) => f.id) : ownedFrames
  const activeFrame = resolveOwnedSelection(selectedFrameId, frameOwned, PROFILE_FRAMES)

  function selectFrame(id: string) {
    setSelectedFrameId(id)
    setFramePickerOpen(false)
    try { localStorage.setItem(FRAME_STORAGE_KEY, id) } catch {}
  }

  // Satın alma buradan KALDIRILDI (2026-08-16): çerçeveler artık mağazanın
  // Çerçeve sekmesinde satılıyor. Bu panel yalnız SAHİP OLUNANI seçer; sahip
  // olunmayanlar mağazaya yönlendirir. Gerekçe: satın alma üç ayrı sayfaya
  // dağılmıştı ve en ucuz kademe mağazada hiç görünmüyordu
  // (docs/plans/2026-08-16-kozmetik-ekonomi-yol-haritasi.md, İP-2).

  const mainStats = [
    { label: 'COIN', value: coinBalance, icon: '🪙', color: 'var(--reward-light)' },
    { label: 'OYUN', value: totalSessions, icon: '🎮', color: 'var(--focus)' },
    { label: 'BAŞARI', value: `%${accuracy}`, icon: '🎯', color: 'var(--growth)' },
    { label: 'EN İYİ SERİ', value: longestStreak, icon: '🔥', color: 'var(--reward-light)' },
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
    <div className="mx-auto max-w-2xl px-3 pt-4 pb-8 sm:px-4 sm:pt-6 md:max-w-3xl md:py-8 xl:max-w-4xl xl:px-6 xl:py-10 2xl:max-w-5xl">
      {/* Profil basligi — magazadan secilen arka planla (none=standart kart) */}
      <div
        data-testid="profil-header-card"
        className={`relative isolate mb-4 animate-fadeUp overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4 shadow-sm md:mb-6 md:p-6 xl:p-7 2xl:p-8 ${isCssBg ? (activeBackground.animClass ?? '') : ''}`}
        style={isCssBg ? { background: activeBackground.css } : undefined}
      >
        <CardBackgroundLayer
          background={activeBackground}
          videoUrl={activeBgVideoUrl}
          reducedMotion={reducedMotion}
        />
        {activeBackground.id !== 'none' && (
          <div
            aria-hidden
            data-testid="profil-background-scrim"
            className="pointer-events-none absolute inset-0 -z-[5] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--card-bg)_94%,transparent),color-mix(in_srgb,var(--card-bg)_76%,transparent))]"
          />
        )}
        <div className="relative z-10 grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3 md:gap-x-4">

          {/* Avatar + Çerçeve */}
          <div className="relative flex-shrink-0">
            <AvatarDecoration decorationIds={decorationIds} size={52}>
              <ProfileFrameRing frame={activeFrame} size={52}>
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={displayName}
                    className="h-[52px] w-[52px] rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div
                    className="flex h-[52px] w-[52px] items-center justify-center rounded-full text-2xl"
                    style={{ background: 'linear-gradient(135deg, var(--focus-bg), var(--focus))' }}
                  >
                    {level.badge}
                  </div>
                )}
              </ProfileFrameRing>
            </AvatarDecoration>

            {/* Çerçeve değiştir butonu */}
            <button
              onClick={() => setFramePickerOpen((v) => !v)}
              title="Çerçeve seç"
              aria-label="Profil çerçevesini değiştir"
              aria-expanded={framePickerOpen}
              className="absolute -bottom-3 -right-3 flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card-bg)] text-xs shadow-sm transition-colors hover:border-[var(--focus)] hover:text-[var(--focus)]">
                🖼
              </span>
            </button>
          </div>

          <div className="min-w-0 self-center">
            <h1 className="truncate text-base font-bold sm:text-lg md:text-xl xl:text-2xl">
              <Nameplate nameplateId={profile.selected_nameplate}>{displayName}</Nameplate>
            </h1>
            <p className="mt-0.5 truncate text-[11px] font-semibold text-[var(--text-sub)] sm:text-xs">
              {level.badge} {level.name}
            </p>
            <p className="truncate text-[10px] text-[var(--text-muted)] sm:text-[11px]">
              {memberSince}&apos;dan beri üye
            </p>
          </div>

          <div className="justify-self-end">
            <StreakBadge streak={currentStreak} />
          </div>

          <div
            data-testid="profile-xp-summary"
            className="col-span-3 rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-secondary)_82%,transparent)] p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[10px] font-extrabold tracking-[0.12em] text-[var(--text-sub)]">
                SEVİYE İLERLEMESİ
              </span>
              <span className="shrink-0 font-display text-sm font-black tabular-nums text-[var(--reward)]">
                {totalXP.toLocaleString('tr-TR')} XP
              </span>
            </div>
            <XPBar
              xp={totalXP - level.minXP}
              level={level.level}
              max={level.maxXP === Infinity ? 50000 : level.maxXP - level.minXP + 1}
            />
          </div>

          <div className="col-span-3">
            <ProfileActions onEdit={() => setEditOpen(true)} />
          </div>
        </div>

        {/* Çerçeve seçici paneli */}
        {framePickerOpen && (
          <div className="relative z-10 mt-3 animate-fadeUp rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
            <div className="mb-2.5 flex items-center justify-between">
              <p className="text-xs font-extrabold uppercase tracking-widest text-[var(--text-muted)]">
                Profil Çerçevesi
              </p>
              <span className="text-xs font-bold text-[var(--reward-light)]">
                🪙 {coinBalance.toLocaleString('tr-TR')} coin
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {PROFILE_FRAMES.map((frm) => {
                const owned = ownedFrames.includes(frm.id)
                const locked = !owned && frm.coinCost !== undefined

                return (
                  <div key={frm.id} className="flex flex-col items-center gap-1">
                    <div className="relative">
                      <FrameDot
                        frame={frm}
                        active={selectedFrameId === frm.id}
                        onClick={() => owned && selectFrame(frm.id)}
                        className={locked ? 'opacity-50' : ''}
                      />
                      {locked && (
                        <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 text-[8px]">🔒</span>
                      )}
                    </div>

                    <span
                      className="text-[10px] font-bold leading-none text-center"
                      style={{ color: FRAME_RARITY_COLOR[frm.rarity] }}
                    >
                      {frm.id === 'none' ? '—' : FRAME_RARITY_LABEL[frm.rarity]}
                    </span>

                    {locked && (
                      <Link
                        href="/arena/magaza"
                        className="mt-0.5 flex min-h-11 min-w-11 items-center justify-center rounded-md px-1.5 py-1 text-[10px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                        style={{
                          background: 'var(--reward-bg)',
                          color: 'var(--reward-light)',
                          border: '1px solid var(--reward-border)',
                        }}
                        title={`${frm.name} — mağazada ${frm.coinCost} coin`}
                      >
                        🪙{frm.coinCost}
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>

            {activeFrame.id !== 'none' && (
              <p className="mt-2.5 border-t border-[var(--border)] pt-2 text-xs text-[var(--text-muted)]">
                <span className="font-bold" style={{ color: FRAME_RARITY_COLOR[activeFrame.rarity] }}>
                  {activeFrame.name}
                </span>
                {' — '}{activeFrame.description}
              </p>
            )}
          </div>
        )}
      </div>

      <EditProfileModal open={editOpen} onClose={() => setEditOpen(false)} />

      {/* Streak milestone banner (7 / 30 / 100 gün) */}
      {currentStreak >= 7 && (
        <div className="mb-4 animate-fadeUp" style={{ animationDelay: '0.05s', animationFillMode: 'both' }}>
          <StreakMilestoneBanner streak={currentStreak} />
        </div>
      )}

      {/* Istatistikler */}
      <ComponentErrorBoundary label="İstatistikler" variant="inline">
        <div className="mb-6 animate-fadeUp" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
          <StatsGrid stats={mainStats} />
        </div>
      </ComponentErrorBoundary>

      {/* Oyun bazli istatistikler */}
      {stats && stats.gameStats.length > 0 && (
        <div className="mb-6 animate-fadeUp" style={{ animationDelay: '0.15s', animationFillMode: 'both' }}>
          <ProfileSectionTitle>OYUN İSTATİSTİKLERİ</ProfileSectionTitle>
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
                  <div className="text-xs font-bold">{gameDef.name}</div>
                  <div
                    className="font-display text-lg font-black"
                    style={{ color: gameDef.colorHex }}
                  >
                    %{gs.percentage}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
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
          <ProfileSectionTitle>SON OYUNLAR</ProfileSectionTitle>
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
                    <div className="text-xs text-[var(--text-muted)]">
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
                    <div className="text-xs text-[var(--reward)]">+{g.total_xp} XP</div>
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
          <CosmeticBadgeShelf ownedSlugs={profile.owned_cosmetic_badges ?? []} allOwned={isStaff(profile)} />
        </div>
      </ComponentErrorBoundary>

      {/* Bildirim + Referral */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 animate-fadeUp" style={{ animationDelay: '0.28s', animationFillMode: 'both' }}>
        <NotificationSettings />
        <ReferralCard />
      </div>

      <ContentQualityStatus />

      {/* Gizlilik — opt-in keşif */}
      <div className="mb-6 animate-fadeUp" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
        <DiscoverabilitySettings />
      </div>

      {/* Konu ilerleme */}
      <ComponentErrorBoundary label="Konu İlerlemesi" variant="inline">
        <div className="animate-fadeUp" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
          <ProfileSectionTitle>
            KONU İLERLEMESİ
            {statsLoading && (
              <span className="ml-2 inline-block h-3 w-3 animate-spin rounded-full border border-[var(--border)] border-t-[var(--focus)]" />
            )}
          </ProfileSectionTitle>
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

function ProfileSectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-3 inline-flex min-h-7 items-center rounded-lg border border-[var(--border)] bg-[var(--card-bg)] px-2.5 py-1 text-[10px] font-extrabold tracking-[0.14em] text-[var(--text-sub)] shadow-sm sm:text-xs">
      {children}
    </h3>
  )
}

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
