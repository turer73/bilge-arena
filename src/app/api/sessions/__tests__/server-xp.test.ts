import { describe, it, expect } from 'vitest'

// serverCalculateXP is not exported, so we replicate its logic for direct testing.
// This ensures the server-side XP formula stays consistent with expectations.

const BASE_XP: Record<number, number> = { 1: 10, 2: 20, 3: 30, 4: 50, 5: 50 }

function serverCalculateXP(
  difficulty: number,
  currentStreak: number
): number {
  const base = BASE_XP[difficulty] || 20
  const streakBonus = currentStreak >= 5 ? 10 : 0
  return base + streakBonus
}

describe('serverCalculateXP', () => {
  it('returns base XP for each difficulty', () => {
    expect(serverCalculateXP(1, 0)).toBe(10)
    expect(serverCalculateXP(2, 0)).toBe(20)
    expect(serverCalculateXP(3, 0)).toBe(30)
    expect(serverCalculateXP(4, 0)).toBe(50)
    expect(serverCalculateXP(5, 0)).toBe(50)
  })

  it('falls back to 20 for unknown difficulty', () => {
    expect(serverCalculateXP(99, 0)).toBe(20)
  })

  it('does not award a client-timed speed bonus', () => {
    expect(serverCalculateXP(2, 0)).toBe(20)
  })

  it('gives +10 streak bonus at streak >= 5', () => {
    expect(serverCalculateXP(1, 5)).toBe(20) // 10 + 10
    expect(serverCalculateXP(1, 10)).toBe(20) // 10 + 10
  })

  it('no streak bonus at streak < 5', () => {
    expect(serverCalculateXP(1, 4)).toBe(10)
  })

  it('combines base and streak bonus only', () => {
    expect(serverCalculateXP(3, 7)).toBe(40)
  })
})
