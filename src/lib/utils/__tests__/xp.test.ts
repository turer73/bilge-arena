import { describe, it, expect } from 'vitest'
import { calculateXP, calculateRank } from '../xp'
import type { Difficulty } from '@/types/database'

describe('calculateXP', () => {
  it('zorluk 1 icin base XP 10 verir', () => {
    const result = calculateXP(1 as Difficulty, 0, 0)
    expect(result.base).toBe(10)
    expect(result.total).toBe(10)
    expect(result.hasBonus).toBe(false)
  })

  it('zorluk 3 icin base XP 30 verir', () => {
    const result = calculateXP(3 as Difficulty, 0, 0)
    expect(result.base).toBe(30)
  })

  it('zorluk 5 icin base XP 50 verir', () => {
    const result = calculateXP(5 as Difficulty, 0, 0)
    expect(result.base).toBe(50)
  })

  it('20+ saniye kalinca time bonus +5 verir', () => {
    const result = calculateXP(2 as Difficulty, 20, 0)
    expect(result.timeBonus).toBe(5)
    expect(result.total).toBe(25) // 20 base + 5 time
    expect(result.hasBonus).toBe(true)
  })

  it('19 saniye kalinca time bonus vermez', () => {
    const result = calculateXP(2 as Difficulty, 19, 0)
    expect(result.timeBonus).toBe(0)
  })

  it('5+ seri dogru ise streak bonus +10 verir', () => {
    const result = calculateXP(1 as Difficulty, 0, 5)
    expect(result.streakBonus).toBe(10)
    expect(result.total).toBe(20) // 10 base + 10 streak
    expect(result.hasBonus).toBe(true)
  })

  it('4 seri dogru ise streak bonus vermez', () => {
    const result = calculateXP(1 as Difficulty, 0, 4)
    expect(result.streakBonus).toBe(0)
  })

  it('tum bonuslar birlikte calisir', () => {
    const result = calculateXP(3 as Difficulty, 25, 7)
    expect(result.base).toBe(30)
    expect(result.timeBonus).toBe(5)
    expect(result.streakBonus).toBe(10)
    expect(result.total).toBe(45)
    expect(result.hasBonus).toBe(true)
  })

  it('bilinmeyen zorluk icin fallback 20 verir', () => {
    const result = calculateXP(99 as Difficulty, 0, 0)
    expect(result.base).toBe(20)
  })
})

describe('calculateRank', () => {
  it('%90+ icin S rank verir', () => {
    expect(calculateRank(9, 10)).toBe('S')
    expect(calculateRank(10, 10)).toBe('S')
  })

  it('%75-89 icin A rank verir', () => {
    expect(calculateRank(8, 10)).toBe('A')
    expect(calculateRank(15, 20)).toBe('A')
  })

  it('%60-74 icin B rank verir', () => {
    expect(calculateRank(6, 10)).toBe('B')
    expect(calculateRank(7, 10)).toBe('B')
  })

  it('%40-59 icin C rank verir', () => {
    expect(calculateRank(4, 10)).toBe('C')
    expect(calculateRank(5, 10)).toBe('C')
  })

  it('%40 alti icin D rank verir', () => {
    expect(calculateRank(3, 10)).toBe('D')
    expect(calculateRank(0, 10)).toBe('D')
  })

  it('0 soru icin D rank verir', () => {
    expect(calculateRank(0, 0)).toBe('D')
  })
})
