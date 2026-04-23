import { describe, it, expect } from 'vitest'
import { getLevelFromXP, getLevelProgress, LEVELS } from '../levels'

describe('getLevelFromXP', () => {
  it('0 XP = Acemi (seviye 1)', () => {
    const level = getLevelFromXP(0)
    expect(level.name).toBe('Acemi')
    expect(level.level).toBe(1)
  })

  it('999 XP hala Acemi', () => {
    expect(getLevelFromXP(999).name).toBe('Acemi')
  })

  it('1000 XP = Cirak (seviye 2)', () => {
    expect(getLevelFromXP(1000).name).toBe('Çırak')
  })

  it('5000 XP = Savasci (seviye 3)', () => {
    expect(getLevelFromXP(5000).name).toBe('Savaşçı')
  })

  it('15000 XP = Usta (seviye 4)', () => {
    expect(getLevelFromXP(15000).name).toBe('Usta')
  })

  it('50000 XP = Efsane (seviye 5)', () => {
    expect(getLevelFromXP(50000).name).toBe('Efsane')
  })

  it('cok yuksek XP hala Efsane', () => {
    expect(getLevelFromXP(999999).name).toBe('Efsane')
  })

  it('negatif XP icin Acemi doner', () => {
    expect(getLevelFromXP(-100).name).toBe('Acemi')
  })
})

describe('getLevelProgress', () => {
  it('0 XP = %0 ilerleme', () => {
    expect(getLevelProgress(0)).toBe(0)
  })

  it('orta seviye XP icin dogru yuzde hesaplar', () => {
    // Acemi: 0-999 (1000 aralik)
    const progress = getLevelProgress(500)
    expect(progress).toBe(50)
  })

  it('Efsane seviyesinde her zaman %100', () => {
    expect(getLevelProgress(50000)).toBe(100)
    expect(getLevelProgress(100000)).toBe(100)
  })

  it('seviye sinirinda %0 olur (yeni seviyeye gecis)', () => {
    // Cirak baslangiç: 1000
    expect(getLevelProgress(1000)).toBe(0)
  })
})

describe('LEVELS sabiti', () => {
  it('5 seviye tanimli', () => {
    expect(LEVELS).toHaveLength(5)
  })

  it('seviyeler sirali (minXP artan)', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].minXP).toBeGreaterThan(LEVELS[i - 1].minXP)
    }
  })

  it('son seviyenin maxXP = Infinity', () => {
    expect(LEVELS[LEVELS.length - 1].maxXP).toBe(Infinity)
  })
})
