'use client'

import type { GameSlug } from '@/lib/constants/games'

// ---------- Tip tanimlari ----------

export interface SidebarPlayer {
  name: string
  avatar: string
  xp: string
  isMe?: boolean
}

export interface TopicStrength {
  label: string
  percentage: number
}

// ---------- Mini Leaderboard ----------

interface ApiSidebarLeader {
  rank: number
  user_id: string | null
  name: string
  avatar_url: string | null
  xp_earned: number
  is_me: boolean
}

interface ApiSidebarResponse {
  players?: ApiSidebarLeader[]
  myRank?: number
}

/**
 * Haftalik ilk 5 oyuncuyu ceker.
 *
 * Madde 9 (pentest raporu) refactor: Browser->Supabase direkt cagri
 * (`leaderboard_weekly_ranked` view) yerine `/api/leaderboard/sidebar`
 * proxy uzerinden gecer. Service-role client server-side, edge cache
 * 60s, IP rate limit 60 req/dk.
 */
export async function fetchSidebarLeaderboard(
  currentUserId?: string
): Promise<{ players: SidebarPlayer[]; myRank: number }> {
  try {
    const url = currentUserId
      ? `/api/leaderboard/sidebar?currentUserId=${encodeURIComponent(currentUserId)}`
      : '/api/leaderboard/sidebar'
    const res = await fetch(url)
    if (!res.ok) return { players: [], myRank: 0 }
    const json = (await res.json()) as ApiSidebarResponse
    const apiPlayers = json.players ?? []
    const myRank = json.myRank ?? 0

    const players: SidebarPlayer[] = apiPlayers.map((row, i) => ({
      name: row.name,
      avatar: row.avatar_url ? '👤' : ['🦊', '🐉', '🦉', '🌟', '⚔️'][i % 5],
      xp: row.xp_earned.toLocaleString('tr-TR'),
      isMe: row.is_me,
    }))

    return { players, myRank }
  } catch (err) {
    console.error('[fetchSidebarLeaderboard] proxy hatasi:', err)
    return { players: [], myRank: 0 }
  }
}

// ---------- Konu Gucu ----------

interface ApiTopicStrengthsResponse {
  topics?: TopicStrength[]
  game?: string
}

/**
 * Belirli bir oyun icin kullanicinin kategori bazli basari yuzdelerini ceker.
 *
 * Madde 9 #4 (pentest raporu) refactor: Browser->Supabase direkt cagri yerine
 * `/api/profile/topic-strengths` proxy uzerinden gecer. Auth-only endpoint —
 * server-side service-role + auth.uid() filter, edge cache 60s private,
 * IP+user cift kalkan rate limit. Aggregation server-side (eski client-side
 * aggregation cok bandwidth wastes).
 *
 * userId param API'de kullanilmaz — auth.uid() server-side filter eder.
 * Backward compat icin imza korundu (use-sidebar-data hook'u userId guard).
 */
export async function fetchTopicStrengths(
  _userId: string,
  game: GameSlug,
): Promise<TopicStrength[]> {
  try {
    const res = await fetch(`/api/profile/topic-strengths?game=${encodeURIComponent(game)}`)
    if (!res.ok) return []
    const json = (await res.json()) as ApiTopicStrengthsResponse
    return json.topics ?? []
  } catch (err) {
    console.error('[fetchTopicStrengths] proxy hatasi:', err)
    return []
  }
}
