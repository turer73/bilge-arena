import type { createServiceRoleClient } from '@/lib/supabase/service-role'

interface AnswerWithQuestion {
  is_correct: boolean
  questions: { game: string; category: string }
}

export interface TopicStrength {
  label: string
  category: string
  percentage: number
  total: number
}

/**
 * Kullanicinin belirli bir oyundaki konu bazli basari yuzdelerini hesaplar
 * (percentage descending sirali).
 *
 * Extract: src/app/api/profile/topic-strengths/route.ts eski inline
 * aggregation'i -- artik paylasilan (topic-strengths route + /api/study/today
 * plan-uretimi zayif-kategori secimi ayni hesaplamayi kullanir). Davranis
 * AYNEN korunmustur (parity testleri topic-strengths/__tests__ ile dogrulanir).
 *
 * `category` + `total` alanlari route'un eski donus tipinde YOKTU (yalniz
 * label+percentage) -- plan-uretimi min-orneklem (total>=5) filtresi ve
 * select_random_questions p_category parametresi icin gerekli, bu yuzden
 * helper'in donus tipine eklendi. topic-strengths/route.ts kendi yanitinda
 * bu iki alani whitelist'lemeyerek (Pick benzeri) eski sozlesmeyi korur.
 */
export async function computeTopicStrengths(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  game: string,
): Promise<TopicStrength[]> {
  const { data, error } = await admin
    .from('session_answers')
    .select('is_correct, questions!inner(game, category)')
    .eq('user_id', userId)
    .eq('questions.game', game)
    .returns<AnswerWithQuestion[]>()

  if (error) throw error
  if (!data || data.length === 0) return []

  const catMap = new Map<string, { total: number; correct: number }>()
  for (const row of data) {
    const q = row.questions
    if (!q?.category) continue
    if (!catMap.has(q.category)) catMap.set(q.category, { total: 0, correct: 0 })
    const stat = catMap.get(q.category)!
    stat.total++
    if (row.is_correct) stat.correct++
  }

  return Array.from(catMap.entries())
    .map(([category, stat]) => ({
      label: category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' '),
      category,
      total: stat.total,
      percentage: stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0,
    }))
    .sort((a, b) => b.percentage - a.percentage)
}
