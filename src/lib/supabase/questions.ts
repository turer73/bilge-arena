'use client'

import { createClient } from '@/lib/supabase/client'
import type { Question, GameType } from '@/types/database'

interface FetchQuestionsOptions {
  game: GameType
  limit?: number
  category?: string | null
  difficulty?: number | null
}

/**
 * Supabase'den quiz sorularini ceker, karistirir ve dondurur.
 * RLS politikasi sayesinde sadece is_active=true sorular gelir.
 * Hata durumunda bos dizi dondurur (fallback DEMO_QUESTIONS kullanilir).
 */
export async function fetchQuizQuestions({
  game,
  limit = 10,
  category,
  difficulty,
}: FetchQuestionsOptions): Promise<Question[]> {
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
    return []
  }

  // DB kolon adlarini TS tiplerine maple
  // DB: subcategory → TS: sub_category
  // DB: times_answered → TS: play_count
  // DB: times_correct → TS: success_rate
  const questions: Question[] = data.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    game: row.game as GameType,
    category: row.category as string,
    sub_category: (row.subcategory as string) || null,
    difficulty: row.difficulty as Question['difficulty'],
    content: row.content as Question['content'],
    is_active: row.is_active as boolean,
    play_count: (row.times_answered as number) || 0,
    success_rate: (row.times_correct as number) || 0,
    created_at: row.created_at as string,
  }))

  // Fisher-Yates shuffle
  for (let i = questions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[questions[i], questions[j]] = [questions[j], questions[i]]
  }

  return questions.slice(0, limit)
}
