import { describe, it, expect } from 'vitest'
import { BADGES, checkBadgeEarned, RARITY_COLORS, type BadgeDefinition } from '../badges'

// Her rozet icin minimal istatistik seti
const emptyStats = {
  gamesPlayed: 0,
  correctAnswers: 0,
  bestStreak: 0,
  totalXP: 0,
  dailyQuestsCompleted: 0,
}

describe('BADGES constant', () => {
  it('14 rozet tanimli olmali', () => {
    expect(BADGES).toHaveLength(14)
  })

  it('her rozetin benzersiz kodu olmali', () => {
    const codes = BADGES.map((b) => b.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('her rozet gerekli alanlara sahip olmali', () => {
    for (const badge of BADGES) {
      expect(badge.code).toBeTruthy()
      expect(badge.name).toBeTruthy()
      expect(badge.description).toBeTruthy()
      expect(badge.icon).toBeTruthy()
      expect(badge.conditionType).toBeTruthy()
      expect(badge.conditionValue).toBeGreaterThan(0)
      expect(badge.xpReward).toBeGreaterThan(0)
      expect(['common', 'rare', 'epic', 'legendary']).toContain(badge.rarity)
    }
  })

  it('XP odulleri mantikli siralamayla artmali', () => {
    const gamesBadges = BADGES.filter((b) => b.conditionType === 'games_played')
    for (let i = 1; i < gamesBadges.length; i++) {
      expect(gamesBadges[i].xpReward).toBeGreaterThanOrEqual(gamesBadges[i - 1].xpReward)
    }
  })
})

describe('RARITY_COLORS', () => {
  it('4 nadirlik seviyesi icin renk tanimli olmali', () => {
    expect(Object.keys(RARITY_COLORS)).toHaveLength(4)
    for (const rarity of ['common', 'rare', 'epic', 'legendary']) {
      expect(RARITY_COLORS[rarity]).toBeDefined()
      expect(RARITY_COLORS[rarity].bg).toBeTruthy()
      expect(RARITY_COLORS[rarity].border).toBeTruthy()
      expect(RARITY_COLORS[rarity].text).toBeTruthy()
    }
  })
})

describe('checkBadgeEarned', () => {
  it('bos istatistiklerle hicbir rozet kazanilmamali', () => {
    for (const badge of BADGES) {
      expect(checkBadgeEarned(badge, emptyStats)).toBe(false)
    }
  })

  it('first_game: 1 oyun oynandiktan sonra kazanilmali', () => {
    const badge = BADGES.find((b) => b.code === 'first_game')!
    expect(checkBadgeEarned(badge, { ...emptyStats, gamesPlayed: 1 })).toBe(true)
    expect(checkBadgeEarned(badge, { ...emptyStats, gamesPlayed: 0 })).toBe(false)
  })

  it('ten_games: tam 10 oyunda kazanilmali', () => {
    const badge = BADGES.find((b) => b.code === 'ten_games')!
    expect(checkBadgeEarned(badge, { ...emptyStats, gamesPlayed: 9 })).toBe(false)
    expect(checkBadgeEarned(badge, { ...emptyStats, gamesPlayed: 10 })).toBe(true)
    expect(checkBadgeEarned(badge, { ...emptyStats, gamesPlayed: 100 })).toBe(true)
  })

  it('streak_5: 5 seri dogru icin kazanilmali', () => {
    const badge = BADGES.find((b) => b.code === 'streak_5')!
    expect(checkBadgeEarned(badge, { ...emptyStats, bestStreak: 4 })).toBe(false)
    expect(checkBadgeEarned(badge, { ...emptyStats, bestStreak: 5 })).toBe(true)
  })

  it('xp_1000: 1000 XP ile kazanilmali', () => {
    const badge = BADGES.find((b) => b.code === 'xp_1000')!
    expect(checkBadgeEarned(badge, { ...emptyStats, totalXP: 999 })).toBe(false)
    expect(checkBadgeEarned(badge, { ...emptyStats, totalXP: 1000 })).toBe(true)
  })

  it('daily_first: 1 gunluk gorev tamamlandiginda kazanilmali', () => {
    const badge = BADGES.find((b) => b.code === 'daily_first')!
    expect(checkBadgeEarned(badge, { ...emptyStats, dailyQuestsCompleted: 0 })).toBe(false)
    expect(checkBadgeEarned(badge, { ...emptyStats, dailyQuestsCompleted: 1 })).toBe(true)
  })

  it('bilinmeyen condition tipi false dondurmeli', () => {
    const fakeBadge: BadgeDefinition = {
      code: 'test',
      name: 'Test',
      description: 'Test',
      icon: '🧪',
      conditionType: 'unknown_type' as BadgeDefinition['conditionType'],
      conditionValue: 1,
      xpReward: 10,
      rarity: 'common',
    }
    expect(checkBadgeEarned(fakeBadge, { ...emptyStats, gamesPlayed: 999 })).toBe(false)
  })

  it('legendary rozetler yuksek kosula sahip olmali', () => {
    const legendaries = BADGES.filter((b) => b.rarity === 'legendary')
    for (const badge of legendaries) {
      expect(badge.conditionValue).toBeGreaterThanOrEqual(1000)
    }
  })
})
