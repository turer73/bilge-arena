'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { getCategoryLabel } from '@/lib/constants/games'
import { gamesForExamType } from '@/lib/constants/exam-types'
import { useAuthStore } from '@/stores/auth-store'
import { getLevelFromXP, LEVELS } from '@/lib/constants/levels'
import { StreakBadge } from '@/components/game/streak-badge'
import { XPBar } from '@/components/game/xp-bar'
import { DailyQuests } from '@/components/game/daily-quests'
import { MiniLeaderboard } from '@/components/game/mini-leaderboard'
import { useDailyQuests } from '@/lib/hooks/use-daily-quests'

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

const GAME_EMOJI: Record<string, string> = {
  matematik: '🧮',
  turkce: '📝',
  fen: '🔬',
  sosyal: '🌍',
  wordquest: '🌐',
}

export default function ArenaClient() {
  const { user, profile } = useAuthStore()

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
        <div className="mb-5 flex flex-col gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-4 py-3 md:mb-6 md:rounded-2xl md:px-5 md:py-3.5">
          <div className="flex items-center gap-3">
          {/* Avatar / seviye ikonu */}
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={displayName}
              className="h-9 w-9 shrink-0 rounded-full border-2 object-cover md:h-11 md:w-11"
              style={{ borderColor: 'var(--focus-border)' }}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-lg md:h-11 md:w-11 md:text-xl"
              style={{
                background: 'linear-gradient(135deg, var(--focus-bg), var(--focus))',
                borderColor: 'var(--focus-border)',
              }}
            >
              {level.badge}
            </div>
          )}

          {/* İsim + XP + Seviye */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5 truncate">
              <span className="text-sm font-bold truncate md:text-base">{displayName}</span>
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

      {/* ── Başlık ── */}
      <div className="mb-5 text-center md:mb-7 xl:mb-8">
        <h1 className="font-display text-2xl font-black md:text-3xl xl:text-4xl 2xl:text-5xl">
          <span className="bg-gradient-to-r from-[var(--focus)] to-[var(--reward)] bg-clip-text text-transparent">
            Bilge Arena
          </span>
        </h1>
        <p className="mt-1.5 text-xs text-[var(--text-sub)] md:mt-2 md:text-sm xl:text-base">
          Bir oyun konsolu seç ve maceraya başla
        </p>
      </div>

      {/* ── Özel Modlar ── */}
      <div className="mb-4 flex flex-wrap gap-2 md:mb-5">
        <Link
          href="/arena/fethet"
          className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-3 py-2 text-xs font-bold text-[var(--text-sub)] transition-all hover:-translate-y-0.5 hover:border-[var(--reward-border)] hover:text-[var(--reward)] hover:shadow-sm md:px-4 md:text-sm"
        >
          <span>⚔️</span>
          <span>Bil ve Fethet</span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[8px] font-extrabold tracking-wider"
            style={{ background: 'var(--reward-bg)', color: 'var(--reward)' }}
          >
            YENİ
          </span>
        </Link>
        <Link
          href="/arena/kule"
          className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-3 py-2 text-xs font-bold text-[var(--text-sub)] transition-all hover:-translate-y-0.5 hover:border-[var(--focus-border)] hover:text-[var(--focus)] hover:shadow-sm md:px-4 md:text-sm"
        >
          <span>🗼</span>
          <span>Kule Modu</span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[8px] font-extrabold tracking-wider"
            style={{ background: 'var(--focus-bg)', color: 'var(--focus)' }}
          >
            YENİ
          </span>
        </Link>
        <Link
          href="/arena/soru-gonder"
          className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-3 py-2 text-xs font-bold text-[var(--text-sub)] transition-all hover:-translate-y-0.5 hover:border-[var(--growth-border)] hover:text-[var(--growth)] hover:shadow-sm md:px-4 md:text-sm"
        >
          <span>✍️</span>
          <span>Soru Gönder</span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[8px] font-extrabold tracking-wider"
            style={{ background: 'var(--growth-bg)', color: 'var(--growth)' }}
          >
            KATKI
          </span>
        </Link>
      </div>

      {/* ── Oyun konsollari ── */}
      <div className="grid gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3 xl:gap-5 2xl:gap-6">
        {gamesForExamType(profile?.exam_type).map((game) => (
          <Link
            key={game.slug}
            href={`/arena/${game.slug}`}
            className="group relative overflow-hidden rounded-xl border-[1.5px] border-[var(--border)] bg-[var(--card-bg)] p-4 transition-all duration-200 hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--border)_50%,white)] hover:shadow-lg md:rounded-2xl md:p-6 xl:p-7 2xl:p-8"
          >
            {/* Glow */}
            <div
              className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-10 blur-2xl transition-opacity duration-300 group-hover:opacity-20 xl:h-40 xl:w-40"
              style={{ background: game.colorHex }}
            />

            {/* Emoji */}
            <div className="mb-2 text-3xl md:mb-3 md:text-4xl xl:text-5xl 2xl:text-6xl">
              {GAME_EMOJI[game.slug] || '📋'}
            </div>

            {/* Başlık */}
            <h2
              className="mb-1 font-display text-base font-bold md:text-lg xl:text-xl 2xl:text-2xl"
              style={{ color: game.colorHex }}
            >
              {game.name}
            </h2>

            {/* Sınav etiketleri */}
            <div className="mb-2 flex flex-wrap gap-1 xl:gap-1.5">
              {game.examTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide md:text-[10px] xl:px-2.5 xl:text-[11px]"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${game.colorHex} 12%, transparent)`,
                    borderColor: `color-mix(in srgb, ${game.colorHex} 30%, transparent)`,
                    color: game.colorHex,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Açıklama */}
            <p className="mb-3 text-[11px] text-[var(--text-sub)] md:mb-4 md:text-xs xl:text-sm">
              {game.description}
            </p>

            {/* Kategori badge'leri */}
            <div className="flex flex-wrap gap-1 xl:gap-1.5">
              {game.categories.map((cat) => (
                <span
                  key={cat}
                  className="rounded-full px-2 py-0.5 text-[9px] font-medium md:text-[10px] xl:px-2.5 xl:text-xs"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${game.colorHex} 10%, transparent)`,
                    color: `color-mix(in srgb, ${game.colorHex} 70%, var(--text-sub))`,
                  }}
                >
                  {getCategoryLabel(cat)}
                </span>
              ))}
            </div>

            {/* Ok */}
            <div className="absolute bottom-3 right-3 text-[var(--text-muted)] transition-all duration-200 group-hover:translate-x-1 group-hover:text-[var(--text-sub)] md:bottom-4 md:right-4 xl:text-lg">
              →
            </div>
          </Link>
        ))}
      </div>

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
