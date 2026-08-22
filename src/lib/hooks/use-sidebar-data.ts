'use client'

import { useState, useEffect } from 'react'
import { fetchTopicStrengths, type TopicStrength } from '@/lib/supabase/sidebar-data'
import type { GameSlug, GameDefinition } from '@/lib/constants/games'

interface UseSidebarDataOptions {
  userId?: string
  game: GameSlug
  gameDef: GameDefinition
}

interface UseSidebarDataReturn {
  topicData: TopicStrength[]
}

/**
 * Oyun ekraninda halen kullanilan tek eski sidebar verisi: konu gucleri.
 * Gorsel leaderboard kaldirildigi icin leaderboard istegi ve Realtime kanali
 * burada tutulmaz; siralama kendi ekranindaki API akisini kullanir.
 */
export function useSidebarData({ userId, game }: UseSidebarDataOptions): UseSidebarDataReturn {
  const [topicData, setTopicData] = useState<TopicStrength[]>([])

  useEffect(() => {
    if (userId) {
      fetchTopicStrengths(userId, game)
        .then(setTopicData)
        .catch((err) => console.error('[Sidebar] Topics hatasi:', err))
    }
  }, [userId, game])

  return { topicData }
}
