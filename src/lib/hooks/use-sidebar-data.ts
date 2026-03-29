'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchSidebarLeaderboard, fetchTopicStrengths, type SidebarPlayer, type TopicStrength } from '@/lib/supabase/sidebar-data'
import type { GameSlug, GameDefinition } from '@/lib/constants/games'

interface UseSidebarDataOptions {
  userId?: string
  game: GameSlug
  gameDef: GameDefinition
}

interface UseSidebarDataReturn {
  leaderboard: SidebarPlayer[]
  myRank: number
  topicData: TopicStrength[]
}

/**
 * Sidebar verileri: mini liderboard + konu gucleri.
 * Leaderboard Supabase Realtime ile canli guncellenir.
 * Konu gucleri oyun veya kullanici degistiginde cekilir.
 */
export function useSidebarData({ userId, game }: UseSidebarDataOptions): UseSidebarDataReturn {
  const [leaderboard, setLeaderboard] = useState<SidebarPlayer[]>([])
  const [myRank, setMyRank] = useState(0)
  const [topicData, setTopicData] = useState<TopicStrength[]>([])

  const refreshLeaderboard = useCallback(() => {
    fetchSidebarLeaderboard(userId)
      .then(({ players, myRank: rank }) => {
        setLeaderboard(players)
        setMyRank(rank)
      })
      .catch((err) => console.error('[Sidebar] Leaderboard hatasi:', err))
  }, [userId])

  useEffect(() => {
    // Ilk yukle
    refreshLeaderboard()

    // Konu gucu verisini cek (giris yapilmissa)
    if (userId) {
      fetchTopicStrengths(userId, game)
        .then(setTopicData)
        .catch((err) => console.error('[Sidebar] Topics hatasi:', err))
    }
  }, [userId, game, refreshLeaderboard])

  // Supabase Realtime: XP degistiginde leaderboard'u guncelle
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('leaderboard-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: 'total_xp=neq.0' },
        () => {
          // Biri XP kazandiginda leaderboard'u yeniden cek
          refreshLeaderboard()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [refreshLeaderboard])

  return { leaderboard, myRank, topicData }
}
