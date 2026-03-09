'use client'

import { createClient } from '@/lib/supabase/client'
import type { GameSlug } from '@/lib/constants/games'

// ---------- Tip tanimlari ----------

/** session_answers + questions JOIN satir tipi */
interface AnswerWithQuestion {
  is_correct: boolean
  questions: { game: string; category: string }
}

export interface CategoryStat {
  category: string
  total: number
  correct: number
  percentage: number
}

export interface GameStat {
  game: GameSlug
  total: number
  correct: number
  percentage: number
  categories: CategoryStat[]
}

export interface RecentGame {
  id: string
  game: GameSlug
  mode: string
  correct_count: number
  total_questions: number
  total_xp: number
  completed_at: string | null
}

export interface ProfileStats {
  gameStats: GameStat[]
  recentGames: RecentGame[]
}

// ---------- Ana fonksiyon ----------

/**
 * Kullanicinin oyun/kategori bazli basari istatistiklerini ve
 * son oyunlarini Supabase'den ceker.
 *
 * session_answers + questions JOIN ile kategori basari yuzdesi hesaplanir.
 */
export async function fetchProfileStats(userId: string): Promise<ProfileStats> {
  const supabase = createClient()

  // Paralel cek: cevaplar + son oyunlar
  const [answersResult, sessionsResult] = await Promise.all([
    // 1) Tum cevaplari question bilgisiyle cek
    supabase
      .from('session_answers')
      .select('is_correct, questions!inner(game, category)')
      .eq('user_id', userId)
      .returns<AnswerWithQuestion[]>(),

    // 2) Son 10 oyun oturumu
    supabase
      .from('game_sessions')
      .select('id, game, mode, correct_count, total_questions, total_xp, completed_at')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(10),
  ])

  // ---------- Kategori istatistikleri ----------
  const gameMap = new Map<string, Map<string, { total: number; correct: number }>>()

  if (answersResult.data) {
    for (const row of answersResult.data) {
      const q = row.questions
      if (!q?.game || !q?.category) continue

      if (!gameMap.has(q.game)) gameMap.set(q.game, new Map())
      const catMap = gameMap.get(q.game)!

      if (!catMap.has(q.category)) catMap.set(q.category, { total: 0, correct: 0 })
      const stat = catMap.get(q.category)!

      stat.total++
      if (row.is_correct) stat.correct++
    }
  }

  const gameStats: GameStat[] = []
  Array.from(gameMap.entries()).forEach(([game, catMap]) => {
    let gameTotal = 0
    let gameCorrect = 0
    const categories: CategoryStat[] = []

    Array.from(catMap.entries()).forEach(([category, stat]) => {
      const percentage = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0
      categories.push({ category, total: stat.total, correct: stat.correct, percentage })
      gameTotal += stat.total
      gameCorrect += stat.correct
    })

    // Kategorileri basari yuzdesine gore sirala (yuksek → dusuk)
    categories.sort((a, b) => b.percentage - a.percentage)

    gameStats.push({
      game: game as GameSlug,
      total: gameTotal,
      correct: gameCorrect,
      percentage: gameTotal > 0 ? Math.round((gameCorrect / gameTotal) * 100) : 0,
      categories,
    })
  })

  // Oyunlari soru sayisina gore sirala (en cok oynanan once)
  gameStats.sort((a, b) => b.total - a.total)

  // ---------- Son oyunlar ----------
  const recentGames: RecentGame[] = (sessionsResult.data ?? []).map((s) => ({
    id: s.id,
    game: s.game as GameSlug,
    mode: s.mode ?? 'classic',
    correct_count: s.correct_count ?? 0,
    total_questions: s.total_questions ?? 0,
    total_xp: s.total_xp ?? 0,
    completed_at: s.completed_at,
  }))

  return { gameStats, recentGames }
}
