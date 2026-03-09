'use client'

import { createClient } from '@/lib/supabase/client'
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

/**
 * Haftalik ilk 5 oyuncuyu ceker.
 * Oncelik: leaderboard_weekly_ranked view
 * Fallback: profiles tablosu (toplam XP'ye gore)
 */
export async function fetchSidebarLeaderboard(
  currentUserId?: string
): Promise<{ players: SidebarPlayer[]; myRank: number }> {
  const supabase = createClient()

  // Haftalik view'i dene
  const { data: weeklyData } = await supabase
    .from('leaderboard_weekly_ranked')
    .select('user_id, display_name, avatar_url, xp_earned, current_rank')
    .order('current_rank', { ascending: true })
    .limit(5)

  if (weeklyData && weeklyData.length > 0) {
    let myRank = 0
    const players: SidebarPlayer[] = weeklyData.map((row, i) => {
      const isMe = row.user_id === currentUserId
      if (isMe) myRank = i + 1
      return {
        name: row.display_name || `Oyuncu ${i + 1}`,
        avatar: row.avatar_url ? '👤' : ['🦊', '🐉', '🦉', '🌟', '⚔️'][i % 5],
        xp: Number(row.xp_earned || 0).toLocaleString('tr-TR'),
        isMe,
      }
    })

    // Kullanici ilk 5'te yoksa, sırasını bul
    if (myRank === 0 && currentUserId) {
      const { data: myData } = await supabase
        .from('leaderboard_weekly_ranked')
        .select('current_rank')
        .eq('user_id', currentUserId)
        .single()
      if (myData) myRank = myData.current_rank
    }

    return { players, myRank }
  }

  // Fallback: profiles tablosu
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, total_xp')
    .order('total_xp', { ascending: false })
    .limit(5)

  if (!profiles) return { players: [], myRank: 0 }

  let myRank = 0
  const players: SidebarPlayer[] = profiles.map((p, i) => {
    const isMe = p.id === currentUserId
    if (isMe) myRank = i + 1
    return {
      name: p.display_name || `Oyuncu ${i + 1}`,
      avatar: p.avatar_url ? '👤' : ['🦊', '🐉', '🦉', '🌟', '⚔️'][i % 5],
      xp: Number(p.total_xp || 0).toLocaleString('tr-TR'),
      isMe,
    }
  })

  return { players, myRank }
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

  if (!data || data.length === 0) return []

  // Kategori bazli toplam/dogru say
  const catMap = new Map<string, { total: number; correct: number }>()

  for (const row of data) {
    const q = row.questions as unknown as { game: string; category: string }
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
