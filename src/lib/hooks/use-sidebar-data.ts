'use client'

import { useState, useEffect } from 'react'
import { fetchTopicStrengths, type TopicStrength } from '@/lib/supabase/sidebar-data'
import type { GameSlug, GameDefinition } from '@/lib/constants/games'

interface UseSidebarDataOptions {
  userId?: string
  game: GameSlug
  gameDef: GameDefinition
  examRef?: string | null
}

interface UseSidebarDataReturn {
  topicData: TopicStrength[]
}

interface TopicRequestState {
  key: string | null
  topics: TopicStrength[]
}

/**
 * Oyun ekraninda halen kullanilan tek eski sidebar verisi: konu gucleri.
 * Gorsel leaderboard kaldirildigi icin leaderboard istegi ve Realtime kanali
 * burada tutulmaz; siralama kendi ekranindaki API akisini kullanir.
 */
export function useSidebarData({ userId, game, examRef }: UseSidebarDataOptions): UseSidebarDataReturn {
  const requestKey = userId ? `${userId}:${game}:${examRef ?? 'all'}` : null
  const [request, setRequest] = useState<TopicRequestState>({ key: null, topics: [] })

  useEffect(() => {
    let cancelled = false
    if (!userId || !requestKey) return () => { cancelled = true }

    fetchTopicStrengths(userId, game, examRef)
      .then((topics) => {
        if (!cancelled) setRequest({ key: requestKey, topics })
      })
      .catch((err) => {
        if (!cancelled) console.error('[Sidebar] Topics hatasi:', err)
      })

    return () => { cancelled = true }
  }, [userId, game, examRef, requestKey])

  return { topicData: request.key === requestKey ? request.topics : [] }
}
