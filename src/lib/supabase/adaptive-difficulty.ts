'use client'

import { createClient } from '@/lib/supabase/client'
import type { GameType } from '@/types/database'

/**
 * Kullanicinin oyundaki genel basari oranina gore zorluk seviyesi onerir.
 * user_topic_progress tablosundaki accuracy_pct ortalamasini kullanir.
 *
 * Basari orani -> Onerilen zorluk:
 *   %0-30   -> 1 (Kolay)
 *   %30-50  -> 2 (Orta)
 *   %50-70  -> 3 (Zor)
 *   %70-85  -> 4 (Cok Zor)
 *   %85+    -> 5 (Uzman)
 *
 * Yeterli veri yoksa (< 10 soru gorulmus) null doner — varsayilan zorlugu kullan.
 */
export async function getAdaptiveDifficulty(
  userId: string,
  game: GameType,
  category?: string | null,
): Promise<number | null> {
  const supabase = createClient()

  let query = supabase
    .from('user_topic_progress')
    .select('questions_seen, correct, accuracy_pct')
    .eq('user_id', userId)
    .eq('game', game)

  if (category) query = query.eq('category', category)

  const { data, error } = await query

  if (error || !data || data.length === 0) return null

  // Toplam soru ve dogru sayisini hesapla
  const totalSeen = data.reduce((sum, row) => sum + (row.questions_seen || 0), 0)
  const totalCorrect = data.reduce((sum, row) => sum + (row.correct || 0), 0)

  // Yeterli veri yoksa onerme
  if (totalSeen < 10) return null

  const accuracy = (totalCorrect / totalSeen) * 100

  if (accuracy >= 85) return 5
  if (accuracy >= 70) return 4
  if (accuracy >= 50) return 3
  if (accuracy >= 30) return 2
  return 1
}
