'use client'

import { useState, useEffect } from 'react'
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
 * Sadece oyun veya kullanici degistiginde Supabase'den ceker.
 */
export function useSidebarData({ userId, game, gameDef }: UseSidebarDataOptions): UseSidebarDataReturn {
  const [leaderboard, setLeaderboard] = useState<SidebarPlayer[]>([])
  const [myRank, setMyRank] = useState(0)
  const [topicData, setTopicData] = useState<TopicStrength[]>([])

  useEffect(() => {
    // Leaderboard verisini cek
    fetchSidebarLeaderboard(userId)
      .then(({ players, myRank: rank }) => {
        setLeaderboard(players)
        setMyRank(rank)
      })
      .catch((err) => console.error('[Sidebar] Leaderboard hatasi:', err))

    // Konu gucu verisini cek (giris yapilmissa)
    if (userId) {
      fetchTopicStrengths(userId, game)
        .then(setTopicData)
        .catch((err) => console.error('[Sidebar] Topics hatasi:', err))
    }
  }, [userId, game])

  return { leaderboard, myRank, topicData }
}
