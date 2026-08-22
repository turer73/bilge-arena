'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Crown, Sparkles, Trophy, Users } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { getLevelFromXP } from '@/lib/constants/levels'
import { LeaderboardTable } from '@/components/leaderboard/leaderboard-table'
import { WeeklyLearningLeague } from '@/components/leaderboard/weekly-learning-league'
import { WeeklyLearningSpotlights } from '@/components/leaderboard/weekly-learning-spotlights'
import { WeeklyTeamBoss } from '@/components/leaderboard/weekly-team-boss'
import {
  isLearningSpotlightsUiEnabled,
  isSocialLeagueUiEnabled,
  isTeamBossUiEnabled,
} from '@/lib/social-league/client'

interface ApiPlayer {
  rank: number
  name: string
  avatar_url: string | null
  xp: number
  level_name: string | null
  is_me: boolean
  nameplate?: string
  decorations?: string[]
}

interface ApiResponse {
  players: ApiPlayer[]
  myRank: number
  source: 'weekly' | 'profiles_fallback' | 'all_time' | 'empty'
}

export default function SiralamaClient() {
  const { user } = useAuthStore()
  const searchParams = useSearchParams()
  const requestedAllTime = searchParams.get('period') === 'all'
  const [entries, setEntries] = useState<
    { rank: number; name: string; avatar: string; xp: number; level: string; isCurrentUser: boolean; nameplate: string; decorations: string[] }[]
  >([])
  const [loading, setLoading] = useState(true)
  const [isAllTime, setIsAllTime] = useState(false)
  // Ana sayfa 'Tum Zamanlarin Liderleri' CTA'si ?period=all ile gelir -> tum-zaman
  // gorunumunu ACIKCA iste (haftalik-bos fallback'ten ayri). useSearchParams
  // ayni sayfadaki sekme degisimlerini de izler; page Suspense siniri saglar.
  const showRelativeLeague = Boolean(user) && isSocialLeagueUiEnabled()
  const showLearningSpotlights = Boolean(user) && isLearningSpotlightsUiEnabled()
  const showTeamBoss = Boolean(user) && isTeamBossUiEnabled()

  useEffect(() => {
    let cancelled = false

    async function fetchLeaderboard() {
      setLoading(true)
      const allTimeMode = requestedAllTime
      try {
        // Browser->Supabase direkt cagri yerine API proxy uzerinden
        // (Madde 9 — pentest raporu, CF Rate Limit + service-role + edge cache).
        const params = new URLSearchParams()
        if (user?.id) params.set('currentUserId', user.id)
        if (allTimeMode) params.set('period', 'all')
        const qs = params.toString()
        const url = `/api/leaderboard/full${qs ? `?${qs}` : ''}`
        // Cache: response Cache-Control'a guven (anon: public s-maxage=120,
        // auth: private max-age=60). no-store cache stratejisini iptal eder
        // (Codex PR #81 P2). sidebar/landing client'lari bare fetch kullanir.
        const res = await fetch(url)
        if (!res.ok) {
          if (!cancelled) {
            setEntries([])
            setLoading(false)
          }
          return
        }
        const json = (await res.json()) as ApiResponse
        if (cancelled) return

        const mapped = (json.players ?? []).map((p) => ({
          rank: p.rank,
          name: p.name,
          avatar: p.avatar_url || '👤',
          xp: p.xp,
          level: p.level_name || getLevelFromXP(p.xp).name,
          isCurrentUser: p.is_me,
          nameplate: p.nameplate ?? 'none',
          decorations: p.decorations ?? [],
        }))
        setEntries(mapped)
        // Tum-zaman: acik istek (all_time) VEYA haftalik-bos dususu (profiles_fallback)
        setIsAllTime(json.source === 'all_time' || json.source === 'profiles_fallback')
      } catch {
        if (!cancelled) setEntries([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchLeaderboard()
    return () => {
      cancelled = true
    }
  }, [requestedAllTime, user?.id])

  const currentEntry = entries.find((entry) => entry.isCurrentUser)
  const allTimeView = requestedAllTime || isAllTime

  return (
    <div className="min-h-[100dvh] bg-[var(--app-bg)] pb-8 text-[var(--app-text)] md:bg-transparent md:pb-10">
      <style>{`@media (max-width: 767px) { [data-app-navbar] { display: none !important; } [data-arena-main] { padding-top: 0 !important; } }`}</style>
      <header className="sticky top-0 z-30 border-b-2 border-[var(--app-border-soft)] bg-[var(--app-card)]/95 backdrop-blur-xl md:static md:border-0 md:bg-transparent md:backdrop-blur-none">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 md:h-auto md:px-6 md:pb-5 md:pt-8">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--app-warn-tint)] text-[var(--app-warn)]"><Trophy size={22} strokeWidth={2.8} /></span>
            <div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-[var(--app-warn-ink)]">Haftalık rekabet</p><h1 className="text-lg font-black leading-5 md:text-2xl">Lig</h1></div>
          </div>
          <Link href="/arena/profil" aria-label="Lig profiline git" className="flex h-11 w-11 items-center justify-center rounded-2xl text-[var(--app-text-muted)] active:bg-[var(--app-hover)]"><Crown size={21} strokeWidth={2.5} /></Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-3 pt-3 md:px-6 md:pt-0">
        <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[var(--app-warn-strong)] to-[var(--app-warn)] p-4 text-white shadow-[0_6px_0_var(--app-warn-border)] md:p-6">
          <div className="pointer-events-none absolute -right-8 -top-12 h-36 w-36 rounded-full border-[24px] border-white/10" />
          <div className="relative z-10">
            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white/75"><Sparkles size={14} /> {allTimeView ? 'Efsaneler tablosu' : 'Bu haftanın arenası'}</p>
            <h2 className="mt-1.5 max-w-md text-xl font-black leading-6 md:text-2xl">{allTimeView ? 'Tüm zamanların liderleri' : showRelativeLeague ? 'Öğren, puan topla, yüksel' : 'Haftalık sıralamada yerini al'}</h2>
            <p className="mt-1.5 max-w-lg text-xs font-semibold leading-5 text-white/80">{allTimeView ? 'En yüksek XP sahibi arenacıların genel sıralaması.' : showRelativeLeague ? 'XP tablosu ile yakın rakip ligin ayrı hesaplanır.' : 'Her Pazartesi yeni bir yarış başlar.'}</p>
            <div className="mt-3 flex gap-2 text-[10px] font-black">
              <span className="rounded-lg bg-black/15 px-2.5 py-1.5">{currentEntry ? `Sıran #${currentEntry.rank}` : 'Sıranı oluştur'}</span>
              <span className="rounded-lg bg-black/15 px-2.5 py-1.5"><Users size={12} className="mr-1 inline" />{entries.length} oyuncu</span>
            </div>
          </div>
        </section>

        <nav aria-label="Sıralama dönemi" className="mt-4 grid grid-cols-2 rounded-[18px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-1.5 shadow-[0_4px_0_var(--app-border)]">
          <Link href="/arena/siralama" aria-current={!requestedAllTime ? 'page' : undefined} className={`flex min-h-11 items-center justify-center rounded-[14px] text-xs font-black transition-colors ${!requestedAllTime ? 'bg-[var(--app-accent)] text-white shadow-[0_3px_0_var(--app-accent-strong)]' : 'text-[var(--app-text-sub)]'}`}>Bu hafta</Link>
          <Link href="/arena/siralama?period=all" aria-current={requestedAllTime ? 'page' : undefined} className={`flex min-h-11 items-center justify-center rounded-[14px] text-xs font-black transition-colors ${requestedAllTime ? 'bg-[var(--app-accent)] text-white shadow-[0_3px_0_var(--app-accent-strong)]' : 'text-[var(--app-text-sub)]'}`}>Tüm zamanlar</Link>
        </nav>

        <div className="mt-4">
          {!requestedAllTime && showRelativeLeague && <WeeklyLearningLeague />}
          {!requestedAllTime && showLearningSpotlights && <WeeklyLearningSpotlights />}
          {!requestedAllTime && showTeamBoss && <WeeklyTeamBoss />}
        </div>

      {loading ? (
        <div className="flex min-h-[220px] items-center justify-center rounded-[22px] border-2 border-[var(--app-border)] bg-[var(--app-card)]">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--app-border)] border-t-[var(--app-accent)]" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-[22px] border-2 border-[var(--app-border)] bg-[var(--app-card)] py-14 text-center shadow-[0_5px_0_var(--app-border)]">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--app-warn-tint)] text-3xl">🏟️</div>
          <p className="text-sm font-bold text-[var(--app-text-sub)]">
            Henüz kimse oyun oynamadı. İlk sen başla!
          </p>
        </div>
      ) : (
        <LeaderboardTable
          entries={entries}
          title={allTimeView
            ? 'Genel Sıralama — Tüm Zamanlar'
            : showRelativeLeague ? 'XP Sıralaması — Bu Hafta' : 'Global Sıralama — Bu Hafta'}
        />
      )}

      <div className="mt-5 text-center text-[10px] font-bold text-[var(--app-text-muted)]">
        {allTimeView
          ? requestedAllTime
            ? 'Tüm zamanların en yüksek XP sahibi arenacıları'
            : 'Haftalık sıralama yeterli veri olunca otomatik gösterilir'
          : 'Sıralama her Pazartesi sıfırlanır'}
      </div>
      </main>
    </div>
  )
}
