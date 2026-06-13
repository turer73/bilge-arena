'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { getLevelFromXP } from '@/lib/constants/levels'
import { LeaderboardTable } from '@/components/leaderboard/leaderboard-table'

interface ApiPlayer {
  rank: number
  name: string
  avatar_url: string | null
  xp: number
  level_name: string | null
  is_me: boolean
  nameplate?: string
}

interface ApiResponse {
  players: ApiPlayer[]
  myRank: number
  source: 'weekly' | 'profiles_fallback' | 'all_time' | 'empty'
}

export default function SiralamaClient() {
  const { user } = useAuthStore()
  const [entries, setEntries] = useState<
    { rank: number; name: string; avatar: string; xp: number; level: string; isCurrentUser: boolean; nameplate: string }[]
  >([])
  const [loading, setLoading] = useState(true)
  const [isAllTime, setIsAllTime] = useState(false)
  // Ana sayfa 'Tum Zamanlarin Liderleri' CTA'si ?period=all ile gelir -> tum-zaman
  // gorunumunu ACIKCA iste (haftalik-bos fallback'ten ayri). useSearchParams Suspense
  // gerektirir; client effect'te window.location yeter (Codex #196 P2 cozumu).
  const [explicitAllTime, setExplicitAllTime] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function fetchLeaderboard() {
      setLoading(true)
      const allTimeMode =
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('period') === 'all'
      setExplicitAllTime(allTimeMode)
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
  }, [user?.id])

  return (
    <div className="mx-auto max-w-xl px-4 py-6 md:max-w-2xl md:py-8 xl:max-w-3xl xl:px-6 xl:py-10 2xl:max-w-4xl">
      <div className="mb-4 text-center md:mb-6 xl:mb-8">
        <h1 className="font-display text-xl font-black md:text-2xl xl:text-3xl 2xl:text-4xl">
          <span className="bg-gradient-to-r from-[var(--reward)] to-[var(--reward-light)] bg-clip-text text-transparent">
            🏆 {isAllTime ? 'Tüm Zamanlar Sıralaması' : 'Haftalık Sıralama'}
          </span>
        </h1>
        <p className="mt-1 text-xs text-[var(--text-sub)] md:text-sm xl:text-base">
          {isAllTime
            ? 'En yüksek XP sahibi arenacıların genel sıralaması'
            : 'Bu haftanın en başarılı arenacıları'}
        </p>
      </div>

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--border)] border-t-[var(--focus)]" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] py-16 text-center">
          <div className="mb-3 text-4xl">🏟️</div>
          <p className="text-sm text-[var(--text-sub)]">
            Henüz kimse oyun oynamadı. İlk sen başla!
          </p>
        </div>
      ) : (
        <LeaderboardTable
          entries={entries}
          title={isAllTime ? 'Genel Sıralama — Tüm Zamanlar' : 'Global Sıralama — Bu Hafta'}
        />
      )}

      <div className="mt-4 text-center text-xs text-[var(--text-muted)]">
        {isAllTime
          ? explicitAllTime
            ? 'Tüm zamanların en yüksek XP sahibi arenacıları'
            : 'Haftalık sıralama yeterli veri olunca otomatik gösterilir'
          : 'Sıralama her Pazartesi sıfırlanır'}
      </div>
    </div>
  )
}
