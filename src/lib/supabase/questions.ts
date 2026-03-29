'use client'

import { createClient } from '@/lib/supabase/client'
import type { Question, GameType } from '@/types/database'
import { cacheQuestions, getCachedQuestions } from '@/lib/utils/question-cache'

interface FetchQuestionsOptions {
  game: GameType
  limit?: number
  category?: string | null
  difficulty?: number | null
}

/** Fisher-Yates shuffle (in-place) */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Supabase'den quiz sorularini ceker, karistirir ve dondurur.
 * Cekilen sorular IndexedDB'ye kaydedilir (offline destek).
 * Ag yoksa veya Supabase hata verirse cache'den sunar.
 */
export async function fetchQuizQuestions({
  game,
  limit = 10,
  category,
  difficulty,
}: FetchQuestionsOptions): Promise<Question[]> {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true

  // Cevrimdisi: dogrudan cache'den sun
  if (!isOnline) {
    const cached = await getCachedQuestions({ game, category, difficulty, limit })
    if (cached.length > 0) return cached
    // Cache de bossa bos dizi don (use-quiz-game DEMO fallback kullanir)
    return []
  }

  // Cevrimici: Supabase'den cek
  const supabase = createClient()

  let query = supabase
    .from('questions')
    .select('*')
    .eq('game', game)
    .eq('is_active', true)

  if (category) query = query.eq('category', category)
  if (difficulty) query = query.eq('difficulty', difficulty)

  // Daha iyi rastgelelik icin fazla cek
  const fetchLimit = Math.min(limit * 3, 150)

  const { data, error } = await query.limit(fetchLimit)

  if (error || !data || data.length === 0) {
    if (error) console.warn('[fetchQuizQuestions] Hata:', error.message)

    // Network hatasi — cache'den dene
    const cached = await getCachedQuestions({ game, category, difficulty, limit })
    if (cached.length > 0) return cached
    return []
  }

  const questions = data as unknown as Question[]

  // Arkaplanda cache'e kaydet (await etmeye gerek yok)
  cacheQuestions(questions).catch(() => {})

  return shuffle([...questions]).slice(0, limit)
}
