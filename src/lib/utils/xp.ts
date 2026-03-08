import type { Difficulty } from '@/types/database'

const BASE_XP: Record<Difficulty, number> = {
  1: 10,
  2: 20,
  3: 30,
  4: 50,
  5: 50,
}

export interface XPResult {
  base: number
  timeBonus: number
  streakBonus: number
  total: number
  hasBonus: boolean
}

/**
 * XP hesaplama:
 * - Base: zorluga gore (10/20/30/50)
 * - Time bonus: >= 20 saniye kalirsa +5
 * - Streak bonus: >= 5 seri dogru ise +10
 */
export function calculateXP(
  difficulty: Difficulty,
  remainingSeconds: number,
  currentStreak: number
): XPResult {
  const base = BASE_XP[difficulty] || 20
  const timeBonus = remainingSeconds >= 20 ? 5 : 0
  const streakBonus = currentStreak >= 5 ? 10 : 0
  const total = base + timeBonus + streakBonus

  return {
    base,
    timeBonus,
    streakBonus,
    total,
    hasBonus: timeBonus > 0 || streakBonus > 0,
  }
}

/**
 * Rank hesaplama: dogruluk yuzdesi bazinda S/A/B/C/D
 */
export type Rank = 'S' | 'A' | 'B' | 'C' | 'D'

export function calculateRank(correctCount: number, totalCount: number): Rank {
  if (totalCount === 0) return 'D'
  const pct = Math.round((correctCount / totalCount) * 100)
  if (pct >= 90) return 'S'
  if (pct >= 75) return 'A'
  if (pct >= 60) return 'B'
  if (pct >= 40) return 'C'
  return 'D'
}

export const RANK_CONFIG: Record<Rank, { color: string; message: string }> = {
  S: { color: 'var(--reward)', message: 'Efsane!' },
  A: { color: 'var(--growth)', message: 'Harika!' },
  B: { color: 'var(--focus)', message: 'Iyi Is!' },
  C: { color: 'var(--wisdom)', message: 'Devam Et!' },
  D: { color: 'var(--urgency)', message: 'Tekrar Dene' },
}
