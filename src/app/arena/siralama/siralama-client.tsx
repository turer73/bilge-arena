'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import { getLevelFromXP } from '@/lib/constants/levels'
import { LeaderboardTable } from '@/components/leaderboard/leaderboard-table'

interface LeaderboardRow {
  user_id: string
  xp_earned: number
  sessions_played: number
  correct_answers: number
  accuracy: number
  username: string | null
  display_name: string | null
  avatar_url: string | null
  level_name: string | null
  current_rank: number
}

export default function SiralamaClient() {
  const { user } = useAuthStore()
  const [entries, setEntries] = useState<
    { rank: number; name: string; avatar: string; xp: number; level: string; isCurrentUser: boolean }[]
  >([])
  const [loading, setLoading] = useState(true)
  const [isAllTime, setIsAllTime] = useState(false)

  useEffect(() => {
    async function fetchLeaderboard() {
      setLoading(true)
      const supabase = createClient()

      // 1) Haftalik siralama — leaderboard_weekly_ranked view
      const { data: weeklyData, error: weeklyErr } = await supabase
        .from('leaderboard_weekly_ranked')
        .select('*')
        .order('current_rank', { ascending: true })
        .limit(50)

      if (!weeklyErr && weeklyData && weeklyData.length > 0) {
        const rows = weeklyData as LeaderboardRow[]
        setEntries(
          rows.map((r) => ({
            rank: r.current_rank,
            name: r.username || r.display_name || 'Arenaci',
            avatar: r.avatar_url || '👤',
            xp: r.xp_earned,
            level: r.level_name || getLevelFromXP(r.xp_earned).name,
            isCurrentUser: user?.id === r.user_id,
          }))
        )
        setIsAllTime(false)
        setLoading(false)
        return
      }

      // 2) Haftalik veri yoksa — all-time profiles fallback
      const { data: profilesData, error: profilesErr } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url, total_xp, level_name')
        .gt('total_xp', 0)
        .is('deleted_at', null)
        .order('total_xp', { ascending: false })
        .limit(50)

      if (!profilesErr && profilesData && profilesData.length > 0) {
        setEntries(
          profilesData.map((p, idx) => ({
            rank: idx + 1,
            name: p.username || p.display_name || 'Arenaci',
            avatar: p.avatar_url || '👤',
            xp: p.total_xp ?? 0,
            level: p.level_name || getLevelFromXP(p.total_xp ?? 0).name,
            isCurrentUser: user?.id === p.id,
          }))
        )
        setIsAllTime(true)
      }

      setLoading(false)
    }

    fetchLeaderboard()
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
