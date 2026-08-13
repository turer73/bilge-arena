'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { gamesForExamType } from '@/lib/constants/exam-types'
import { useAuthStore } from '@/stores/auth-store'
import { getLevelFromXP, LEVELS } from '@/lib/constants/levels'
import { StreakBadge } from '@/components/game/streak-badge'
import { XPBar } from '@/components/game/xp-bar'
import { DailyQuests } from '@/components/game/daily-quests'
import { MiniLeaderboard } from '@/components/game/mini-leaderboard'
import { useDailyQuests } from '@/lib/hooks/use-daily-quests'
import { useCardBackground, CardBackgroundLayer } from '@/components/profile/card-background'
import { ProfileFrameRing } from '@/components/profile/profile-frame-ring'
import { AvatarDecoration } from '@/components/profile/avatar-decoration'
import { Nameplate } from '@/components/profile/nameplate'
import { getFrameById, FRAME_STORAGE_KEY } from '@/lib/constants/profile-frames'
import { GameSelectGrid } from '@/components/game/game-select-grid'
import { ArenaExploreGrid } from '@/components/game/arena-explore-grid'

interface SidebarLeaderRow {
  name: string
  avatar_url: string | null
  xp_earned: number
}
interface MiniLeader {
  name: string
  avatar: string
  avatarUrl: string | null
  xp: string
}

export default function ArenaClient() {
  const { user, profile } = useAuthStore()
  // Profil kartıyla ORTAK kart arka planı (kullanıcının seçtiği tema burada da)
  const { activeBackground, activeBgVideoUrl, isCssBg, reducedMotion } = useCardBackground()

  // Tüm kişiselleştirme lobi kartında da görünsün: çerçeve (localStorage) + süs +
  // isim paneli (DB). Seçimler stüdyo/profilde yapılır; burada yansıtılır.
  const [frameId] = useState(() => {
    try {
      return typeof window === 'undefined'
        ? 'none'
        : localStorage.getItem(FRAME_STORAGE_KEY) ?? 'none'
    } catch {}
    return 'none'
  })
  const lobbyFrame = getFrameById(frameId)
  // Süs(ler) DB'de (selected_avatar_decorations) — başkalarına da görünür.
  const decorationIds = profile?.selected_avatar_decorations ?? []

  const totalXP = profile?.total_xp ?? 0
  const currentStreak = profile?.current_streak ?? 0
  const displayName = profile?.username || profile?.display_name || 'Arenacı'
  const level = getLevelFromXP(totalXP)

  // Seviye ilerlemesi (XP cubugu + "sonraki seviyeye X XP")
  const xpInto = totalXP - level.minXP
  const tierSpan = level.maxXP === Infinity ? Math.max(xpInto, 1) : level.maxXP - level.minXP + 1
  const nextTier = LEVELS.find((t) => t.level === level.level + 1)
  const xpToNext = nextTier ? Math.max(0, nextTier.minXP - totalXP) : 0

  // Gunluk gorevler (mevcut backend: /api/quests + /api/quests/claim)
  const { quests, claimXP } = useDailyQuests()

  // Mini haftalik siralama (mevcut /api/leaderboard/sidebar proxy'si)
  const [leaders, setLeaders] = useState<MiniLeader[]>([])
  const [myRank, setMyRank] = useState(0)
  useEffect(() => {
    const url = user?.id
      ? `/api/leaderboard/sidebar?currentUserId=${user.id}`
      : '/api/leaderboard/sidebar'
    let cancelled = false
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { players?: SidebarLeaderRow[]; myRank?: number } | null) => {
        if (cancelled || !data?.players) return
        setLeaders(
          data.players.map((p) => ({
            name: p.name,
            avatar: '👤',
            avatarUrl: p.avatar_url ?? null,
            xp: Number(p.xp_earned || 0).toLocaleString('tr-TR'),
          })),
        )
        setMyRank(data.myRank ?? 0)
      })
      .catch(() => {
        /* siralama opsiyonel — sessiz gec */
      })
    return () => {
      cancelled = true
    }
  }, [user?.id])

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:py-8 xl:max-w-5xl xl:px-6 2xl:max-w-6xl 2xl:py-10">

      {/* ── Kişiselleştirilmiş karşılama (giriş yapılmışsa) ── */}
      {user && profile ? (
        <div
          className={`relative isolate mb-5 flex flex-col gap-2.5 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-4 py-3 md:mb-6 md:rounded-2xl md:px-5 md:py-3.5 ${isCssBg ? (activeBackground.animClass ?? '') : ''}`}
          style={isCssBg ? { background: activeBackground.css } : undefined}
        >
          <CardBackgroundLayer
            background={activeBackground}
            videoUrl={activeBgVideoUrl}
            reducedMotion={reducedMotion}
          />
          <div className="flex items-center gap-3">
          {/* Avatar — çerçeve + süs(ler) (profildeki tüm kişiselleştirme burada da) */}
          <AvatarDecoration decorationIds={decorationIds} size={44}>
            <ProfileFrameRing frame={lobbyFrame} size={44}>
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={displayName}
                  className="h-11 w-11 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-full text-xl"
                  style={{ background: 'linear-gradient(135deg, var(--focus-bg), var(--focus))' }}
                >
                  {level.badge}
                </div>
              )}
            </ProfileFrameRing>
          </AvatarDecoration>

          {/* İsim + XP + Seviye */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5 truncate">
              <span className="truncate text-sm font-bold md:text-base">
                <Nameplate nameplateId={profile.selected_nameplate}>{displayName}</Nameplate>
              </span>
              <span
                className="shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider md:text-[10px]"
                style={{ background: 'var(--focus-bg)', color: 'var(--focus)' }}
              >
                {level.name}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] md:text-xs">
              <span>⚡ {totalXP.toLocaleString('tr-TR')} XP</span>
              {(profile.coin_balance ?? 0) > 0 && (
                <span className="font-semibold" style={{ color: 'var(--reward-light)' }}>
                  🪙 {(profile.coin_balance ?? 0).toLocaleString('tr-TR')}
                </span>
              )}
            </div>
          </div>

          {/* Streak badge + profil linki */}
          <div className="flex shrink-0 items-center gap-2">
            <StreakBadge streak={currentStreak} />
            <Link
              href="/arena/profil"
              className="hidden rounded-lg border border-[var(--border)] px-2.5 py-1 text-[10px] font-semibold text-[var(--text-sub)] transition-colors hover:border-[var(--focus)] hover:text-[var(--focus)] sm:block"
            >
              Profil →
            </Link>
          </div>
          </div>

          {/* XP ilerleme çubuğu + sonraki seviye */}
          <div className="flex flex-col gap-1">
            <XPBar xp={xpInto} level={level.level} max={tierSpan} />
            {nextTier ? (
              <span className="text-[10px] text-[var(--text-muted)] md:text-[11px]">
                {nextTier.badge} {nextTier.name}&apos;e{' '}
                <span className="font-semibold tabular-nums text-[var(--text-sub)]">
                  {xpToNext.toLocaleString('tr-TR')} XP
                </span>{' '}
                kaldı
              </span>
            ) : (
              <span className="text-[10px] font-semibold text-[var(--reward)] md:text-[11px]">
                {level.badge} Maksimum seviye — Efsane!
              </span>
            )}
          </div>
        </div>
      ) : (
        /* Giriş yapılmamış — mini CTA */
        <div className="mb-5 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-4 py-3 md:mb-6">
          <p className="text-sm text-[var(--text-sub)]">
            <span className="font-bold text-[var(--text)]">Giriş yap</span> ve ilerlemeyi kaydet
          </p>
          <Link
            href="/giris"
            className="rounded-lg bg-[var(--focus)] px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
          >
            Giriş Yap
          </Link>
        </div>
      )}

      {/* ── Günlük görevler (giriş yapılmışsa) ── */}
      {user && profile && quests.length > 0 && (
        <div className="mb-5 md:mb-6">
          <DailyQuests userQuests={quests} onClaimXP={claimXP} />
        </div>
      )}

      {/* ── Ders seçimi: ana eylem ── */}
      <section aria-labelledby="subject-select-title">
        <div className="mb-5 md:mb-7 xl:mb-8">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-black tracking-[0.18em] text-[var(--focus)] md:text-xs">
            <span aria-hidden="true" className="h-px w-6 bg-[var(--focus)]" />
            DERS ARENALARI
          </div>
          <h1 id="subject-select-title" className="max-w-2xl font-display text-2xl font-black leading-tight text-[var(--text)] md:text-3xl xl:text-4xl 2xl:text-5xl">
            Bugün ne çalışmak istersin?
          </h1>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--text-sub)] md:text-sm xl:text-base">
            Dersini seç, oyun modunu belirle ve hemen başla.
          </p>
        </div>

        <GameSelectGrid
          games={gamesForExamType(profile?.exam_type)}
          examType={profile?.exam_type}
        />
      </section>

      {/* ── İkincil modlar ── */}
      <section aria-labelledby="explore-title" className="mt-8 md:mt-10">
        <div className="mb-4">
          <h2 id="explore-title" className="font-display text-lg font-black text-[var(--text)] md:text-xl">
            Daha fazlasını keşfet
          </h2>
          <p className="mt-1 text-xs text-[var(--text-sub)] md:text-sm">
            Farklı bir meydan okuma ya da kişiselleştirme seç.
          </p>
        </div>
        <ArenaExploreGrid
          classroomEnabled={process.env.NEXT_PUBLIC_TEACHER_CLASSROOM_ENABLED === 'true'}
        />
      </section>

      {/* ── Mini sıralama + Arena CTA ── */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 md:mt-8 md:gap-4">
        {leaders.length > 0 && (
          <Link href="/arena/siralama" className="block transition-transform hover:-translate-y-0.5">
            <MiniLeaderboard players={leaders} myRank={myRank} />
          </Link>
        )}
        <Link
          href="/oda"
          className="flex items-center gap-3 rounded-xl border p-4 transition-transform hover:-translate-y-0.5 md:rounded-2xl"
          style={{
            borderColor: 'var(--wisdom-border)',
            background: 'linear-gradient(135deg, var(--wisdom-bg), var(--card-bg))',
          }}
        >
          <span className="text-3xl">⚔️</span>
          <div className="flex-1">
            <div className="text-sm font-bold text-[var(--text)] md:text-base">Arena’da yarış</div>
            <div className="mt-0.5 text-[11px] text-[var(--text-sub)] md:text-xs">
              Arkadaşlarınla canlı oda kur
            </div>
          </div>
          <span className="text-xl" style={{ color: 'var(--wisdom-light)' }}>→</span>
        </Link>
      </div>
    </div>
  )
}
