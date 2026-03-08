export interface BadgeDefinition {
  code: string
  name: string
  description: string
  icon: string
  conditionType: 'games_played' | 'correct_answers' | 'streak' | 'xp' | 'category_mastery' | 'daily_quest'
  conditionValue: number
  xpReward: number
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
}

export const BADGES: BadgeDefinition[] = [
  // Oyun sayisi
  { code: 'first_game', name: 'Ilk Adim', description: 'Ilk oyununu tamamla', icon: '🎮', conditionType: 'games_played', conditionValue: 1, xpReward: 50, rarity: 'common' },
  { code: 'ten_games', name: 'Caylak', description: '10 oyun tamamla', icon: '⚔️', conditionType: 'games_played', conditionValue: 10, xpReward: 100, rarity: 'common' },
  { code: 'fifty_games', name: 'Savasci', description: '50 oyun tamamla', icon: '🛡️', conditionType: 'games_played', conditionValue: 50, xpReward: 250, rarity: 'rare' },
  { code: 'hundred_games', name: 'Veteran', description: '100 oyun tamamla', icon: '👑', conditionType: 'games_played', conditionValue: 100, xpReward: 500, rarity: 'epic' },

  // Dogru cevap
  { code: 'first_correct', name: 'Bilge Bas', description: 'Ilk dogru cevabin', icon: '✅', conditionType: 'correct_answers', conditionValue: 1, xpReward: 25, rarity: 'common' },
  { code: 'hundred_correct', name: 'Bilge', description: '100 dogru cevap', icon: '📚', conditionType: 'correct_answers', conditionValue: 100, xpReward: 200, rarity: 'rare' },
  { code: 'thousand_correct', name: 'Alim', description: '1000 dogru cevap', icon: '🎓', conditionType: 'correct_answers', conditionValue: 1000, xpReward: 1000, rarity: 'legendary' },

  // Seri
  { code: 'streak_5', name: 'Seri Baslangic', description: '5 seri dogru', icon: '🔥', conditionType: 'streak', conditionValue: 5, xpReward: 75, rarity: 'common' },
  { code: 'streak_10', name: 'Yangin!', description: '10 seri dogru', icon: '💥', conditionType: 'streak', conditionValue: 10, xpReward: 200, rarity: 'rare' },
  { code: 'streak_20', name: 'Durdurulamaz', description: '20 seri dogru', icon: '⚡', conditionType: 'streak', conditionValue: 20, xpReward: 500, rarity: 'epic' },

  // XP
  { code: 'xp_1000', name: 'Cirak', description: '1.000 XP topla', icon: '🌱', conditionType: 'xp', conditionValue: 1000, xpReward: 100, rarity: 'common' },
  { code: 'xp_10000', name: 'Usta', description: '10.000 XP topla', icon: '💎', conditionType: 'xp', conditionValue: 10000, xpReward: 500, rarity: 'epic' },
  { code: 'xp_50000', name: 'Efsane', description: '50.000 XP topla', icon: '🏆', conditionType: 'xp', conditionValue: 50000, xpReward: 2000, rarity: 'legendary' },

  // Gunluk gorev
  { code: 'daily_first', name: 'Gorevci', description: 'Ilk gunluk gorevi tamamla', icon: '📋', conditionType: 'daily_quest', conditionValue: 1, xpReward: 50, rarity: 'common' },
]

export const RARITY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  common: { bg: 'var(--card-bg)', border: 'var(--border)', text: 'var(--text-sub)' },
  rare: { bg: 'var(--focus-bg)', border: 'var(--focus-border)', text: 'var(--focus)' },
  epic: { bg: 'var(--wisdom-bg)', border: 'var(--wisdom-border)', text: 'var(--wisdom)' },
  legendary: { bg: 'var(--reward-bg)', border: 'var(--reward-border)', text: 'var(--reward)' },
}

/**
 * Kullanici profilini rozet kosullarina karsi kontrol et
 */
export function checkBadgeEarned(
  badge: BadgeDefinition,
  stats: { gamesPlayed: number; correctAnswers: number; bestStreak: number; totalXP: number; dailyQuestsCompleted: number }
): boolean {
  switch (badge.conditionType) {
    case 'games_played': return stats.gamesPlayed >= badge.conditionValue
    case 'correct_answers': return stats.correctAnswers >= badge.conditionValue
    case 'streak': return stats.bestStreak >= badge.conditionValue
    case 'xp': return stats.totalXP >= badge.conditionValue
    case 'daily_quest': return stats.dailyQuestsCompleted >= badge.conditionValue
    default: return false
  }
}
