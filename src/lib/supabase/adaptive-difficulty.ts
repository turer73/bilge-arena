'use client'

import type { GameType } from '@/types/database'

/**
 * Kullanicinin oyundaki genel basari oranina gore zorluk seviyesi onerir.
 * /api/profile/difficulty proxy uzerinden cagirilir; aggregation server'da.
 *
 * Madde 9 #7: eski client `.from('user_topic_progress')` cagrisi server'a tasindi.
 * UserId parametre kaldirildi — server-side auth.uid() kullanilir.
 *
 * Basari orani -> Onerilen zorluk:
 *   %0-30   -> 1 (Kolay)
 *   %30-50  -> 2 (Orta)
 *   %50-70  -> 3 (Zor)
 *   %70-85  -> 4 (Cok Zor)
 *   %85+    -> 5 (Uzman)
 *
 * Yeterli veri yoksa (< 10 soru gorulmus) veya hata olursa null doner —
 * varsayilan zorlugu kullan.
 */
export async function getAdaptiveDifficulty(
  game: GameType,
  category?: string | null,
): Promise<number | null> {
  const params = new URLSearchParams({ game })
  if (category) params.set('category', category)

  try {
    const res = await fetch(`/api/profile/difficulty?${params.toString()}`, {
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as { difficulty: number | null }
    return data.difficulty
  } catch {
    return null
  }
}
