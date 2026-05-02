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
}

interface ApiResponse {
  players: ApiPlayer[]
  myRank: number
  source: 'weekly' | 'profiles_fallback' | 'empty'
}

export default function SiralamaClient() {
  const { user } = useAuthStore()
  const [entries, setEntries] = useState<
    { rank: number; name: string; avatar: string; xp: number; level: string; isCurrentUser: boolean }[]
  >([])
  const [loading, setLoading] = useState(true)
  const [isAllTime, setIsAllTime] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function fetchLeaderboard() {
      setLoading(true)
      try {
        // Browser->Supabase direkt cagri yerine API proxy uzerinden
        // (Madde 9 — pentest raporu, CF Rate Limit + service-role + edge cache).
        const url = user?.id
          ? `/api/leaderboard/full?currentUserId=${encodeURIComponent(user.id)}`
          : '/api/leaderboard/full'
        const res = await fetch(url, { cache: 'no-store' })
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
        }))
        setEntries(mapped)
        setIsAllTime(json.source === 'profiles_fallback')
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
          ? 'Haftalık sıralama yeterli veri olunca otomatik gösterilir'
          : 'Sıralama her Pazartesi sıfırlanır'}
      </div>
    </div>
  )
}
