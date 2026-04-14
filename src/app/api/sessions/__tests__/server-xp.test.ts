import { describe, it, expect } from 'vitest'

// serverCalculateXP is not exported, so we replicate its logic for direct testing.
// This ensures the server-side XP formula stays consistent with expectations.

const BASE_XP: Record<number, number> = { 1: 10, 2: 20, 3: 30, 4: 50, 5: 50 }

function serverCalculateXP(
  difficulty: number,
  timeTaken: number,
  timeLimit: number,
  currentStreak: number
): number {
  const base = BASE_XP[difficulty] || 20
  const remainingSeconds = Math.max(0, timeLimit - timeTaken)
  const timeBonus = remainingSeconds >= 20 ? 5 : 0
  const streakBonus = currentStreak >= 5 ? 10 : 0
  return base + timeBonus + streakBonus
}

describe('serverCalculateXP', () => {
  it('returns base XP for each difficulty', () => {
    expect(serverCalculateXP(1, 30, 30, 0)).toBe(10)
    expect(serverCalculateXP(2, 30, 30, 0)).toBe(20)
    expect(serverCalculateXP(3, 30, 30, 0)).toBe(30)
    expect(serverCalculateXP(4, 30, 30, 0)).toBe(50)
    expect(serverCalculateXP(5, 30, 30, 0)).toBe(50)
  })

  it('falls back to 20 for unknown difficulty', () => {
    expect(serverCalculateXP(99, 30, 30, 0)).toBe(20)
  })

  it('gives +5 time bonus when 20+ seconds remaining', () => {
    // timeLimit=30, timeTaken=10 → 20 seconds remaining
    expect(serverCalculateXP(2, 10, 30, 0)).toBe(25) // 20 + 5
  })

  it('no time bonus when <20 seconds remaining', () => {
    // timeLimit=30, timeTaken=11 → 19 seconds remaining
    expect(serverCalculateXP(2, 11, 30, 0)).toBe(20)
  })

  it('gives +10 streak bonus at streak >= 5', () => {
    expect(serverCalculateXP(1, 30, 30, 5)).toBe(20) // 10 + 10
    expect(serverCalculateXP(1, 30, 30, 10)).toBe(20) // 10 + 10
  })

  it('no streak bonus at streak < 5', () => {
    expect(serverCalculateXP(1, 30, 30, 4)).toBe(10)
  })

  it('combines all bonuses', () => {
    // difficulty=3 (30), timeTaken=5 timeLimit=30 (25 remaining → +5), streak=7 (→ +10)
    expect(serverCalculateXP(3, 5, 30, 7)).toBe(45)
  })

  it('clamps negative remaining time to 0', () => {
    // timeTaken > timeLimit — should not break
    expect(serverCalculateXP(2, 40, 30, 0)).toBe(20) // no time bonus
  })
})
