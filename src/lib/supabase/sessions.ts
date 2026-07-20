'use client'

import type { GameType } from '@/types/database'
import type { AnswerRecord } from '@/stores/quiz-store'

interface SaveSessionParams {
  userId: string
  game: GameType
  mode: string
  answers: AnswerRecord[]
  totalXP: number
  maxStreak: number
  category?: string | null
  difficulty?: number | null
  timeLimit?: number
  /** Idempotency key (migration 081) — cagiran, sonuc-ekranina girince BIR KEZ uretmeli
   * ve ayni oturum-kaydetme denemesi boyunca sabit tutmali (network-retry korumasi). */
  clientRequestId: string
}

/**
 * Oyun oturumunu server-side API uzerinden kaydeder.
 * XP hesaplamasi artik server tarafinda yapilir (client-side XP manipulasyonunu onler).
 *
 * Hata durumunda null dondurur, client tarafinda hata gosterilmez.
 */
export async function saveGameSession({
  game,
  mode,
  answers,
  maxStreak,
  category,
  difficulty,
  timeLimit = 30,
  clientRequestId,
}: SaveSessionParams): Promise<string | null> {
  try {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game,
        mode,
        answers: answers.map(a => ({
          questionId: a.questionId,
          // Server KANONIK DB-index'iyle notlar; ekran-index'i degil (disc#1296).
          // Eski kayitlarla uyum: selectedCanonical yoksa ekran-index'ine dus.
          selectedOption: a.selectedCanonical ?? a.selectedOption,
          isCorrect: a.isCorrect,
          timeTaken: a.timeTaken,
        })),
        maxStreak,
        category,
        difficulty,
        timeLimit,
        clientRequestId,
      }),
    })

    if (!res.ok) {
      console.error('[saveGameSession] API hatasi:', res.status)
      return null
    }

    const data = await res.json()
    return data.sessionId ?? null
  } catch (err) {
    console.error('[saveGameSession] Fetch hatasi:', err)
    return null
  }
}
