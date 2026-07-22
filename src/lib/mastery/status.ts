export type MasteryStatus = 'insufficient' | 'developing' | 'mastered'

export interface MasteryEvidence {
  attempts: number
  correctAttempts: number
  weightedEarned: number
  weightedPossible: number
  delayedCorrect: number
}

export interface MasterySummary extends MasteryEvidence {
  accuracy: number
  status: MasteryStatus
}

/**
 * Ilk mastery pilotunun aciklanabilir esikleri.
 *
 * - 3'ten az kanit: karar vermek icin yetersiz
 * - Ustalasti: en az 5 deneme, agirlikli en az %80 ve 24+ saat sonra en az
 *   bir basarili geri getirme
 * - Diger tum durumlar: gelisiyor
 *
 * Ham kanit API'de de doner; UI yalnizca opak bir skor gostermez.
 */
export function summarizeMastery(evidence: MasteryEvidence): MasterySummary {
  const attempts = Math.max(0, Math.trunc(evidence.attempts))
  const correctAttempts = Math.min(attempts, Math.max(0, Math.trunc(evidence.correctAttempts)))
  const weightedPossible = Math.max(0, evidence.weightedPossible)
  const weightedEarned = Math.min(weightedPossible, Math.max(0, evidence.weightedEarned))
  const delayedCorrect = Math.min(correctAttempts, Math.max(0, Math.trunc(evidence.delayedCorrect)))
  const accuracy = weightedPossible > 0
    ? Math.round((weightedEarned / weightedPossible) * 100)
    : 0

  let status: MasteryStatus = 'developing'
  if (attempts < 3) status = 'insufficient'
  else if (attempts >= 5 && accuracy >= 80 && delayedCorrect >= 1) status = 'mastered'

  return {
    attempts,
    correctAttempts,
    weightedEarned,
    weightedPossible,
    delayedCorrect,
    accuracy,
    status,
  }
}
