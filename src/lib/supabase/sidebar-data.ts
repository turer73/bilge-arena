'use client'

import { createClient } from '@/lib/supabase/client'
import type { GameSlug } from '@/lib/constants/games'

// ---------- Tip tanimlari ----------

/** session_answers + questions JOIN satir tipi */
interface AnswerWithQuestion {
  is_correct: boolean
  questions: { game: string; category: string }
}

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

/**
 * Belirli bir oyun icin kullanicinin kategori bazli basari yuzdelerini ceker.
 * session_answers + questions JOIN.
 */
export async function fetchTopicStrengths(
  userId: string,
  game: GameSlug
): Promise<TopicStrength[]> {
  const supabase = createClient()

  const { data } = await supabase
    .from('session_answers')
    .select('is_correct, questions!inner(game, category)')
    .eq('user_id', userId)
    .eq('questions.game', game)
    .returns<AnswerWithQuestion[]>()

  if (!data || data.length === 0) return []

  // Kategori bazli toplam/dogru say
  const catMap = new Map<string, { total: number; correct: number }>()

  for (const row of data) {
    const q = row.questions
    if (!q?.category) continue

    if (!catMap.has(q.category)) catMap.set(q.category, { total: 0, correct: 0 })
    const stat = catMap.get(q.category)!
    stat.total++
    if (row.is_correct) stat.correct++
  }

  const topics: TopicStrength[] = []
  Array.from(catMap.entries()).forEach(([category, stat]) => {
    topics.push({
      label: category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' '),
      percentage: stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0,
    })
  })

  // Yuksek → dusuk sirala
  topics.sort((a, b) => b.percentage - a.percentage)

  return topics
}
