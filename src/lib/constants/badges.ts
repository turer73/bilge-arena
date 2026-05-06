export interface BadgeDefinition {
  code: string
  name: string
  description: string
  icon: string
  conditionType:
    | 'games_played'
    | 'correct_answers'
    | 'streak'
    | 'xp'
    | 'category_mastery'
    | 'daily_quest'
    | 'multiplayer_wins'
    | 'rooms_completed'
    | 'multiplayer_firsts'
  conditionValue: number
  xpReward: number
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
}

export const BADGES: BadgeDefinition[] = [
  // Oyun sayisi
  { code: 'first_game', name: 'İlk Adım', description: 'İlk oyununu tamamla', icon: '🎮', conditionType: 'games_played', conditionValue: 1, xpReward: 50, rarity: 'common' },
  { code: 'ten_games', name: 'Çaylak', description: '10 oyun tamamla', icon: '⚔️', conditionType: 'games_played', conditionValue: 10, xpReward: 100, rarity: 'common' },
  { code: 'fifty_games', name: 'Savaşçı', description: '50 oyun tamamla', icon: '🛡️', conditionType: 'games_played', conditionValue: 50, xpReward: 250, rarity: 'rare' },
  { code: 'hundred_games', name: 'Veteran', description: '100 oyun tamamla', icon: '👑', conditionType: 'games_played', conditionValue: 100, xpReward: 500, rarity: 'epic' },

  // Dogru cevap
  { code: 'first_correct', name: 'Bilge Baş', description: 'İlk doğru cevabın', icon: '✅', conditionType: 'correct_answers', conditionValue: 1, xpReward: 25, rarity: 'common' },
  { code: 'hundred_correct', name: 'Bilge', description: '100 doğru cevap', icon: '📚', conditionType: 'correct_answers', conditionValue: 100, xpReward: 200, rarity: 'rare' },
  { code: 'thousand_correct', name: 'Âlim', description: '1000 doğru cevap', icon: '🎓', conditionType: 'correct_answers', conditionValue: 1000, xpReward: 1000, rarity: 'legendary' },

  // Seri
  { code: 'streak_5', name: 'Seri Başlangıç', description: '5 seri doğru', icon: '🔥', conditionType: 'streak', conditionValue: 5, xpReward: 75, rarity: 'common' },
  { code: 'streak_10', name: 'Yangın!', description: '10 seri doğru', icon: '💥', conditionType: 'streak', conditionValue: 10, xpReward: 200, rarity: 'rare' },
  { code: 'streak_20', name: 'Durdurulamaz', description: '20 seri doğru', icon: '⚡', conditionType: 'streak', conditionValue: 20, xpReward: 500, rarity: 'epic' },

  // XP
  { code: 'xp_1000', name: 'Çırak', description: '1.000 XP topla', icon: '🌱', conditionType: 'xp', conditionValue: 1000, xpReward: 100, rarity: 'common' },
  { code: 'xp_10000', name: 'Usta', description: '10.000 XP topla', icon: '💎', conditionType: 'xp', conditionValue: 10000, xpReward: 500, rarity: 'epic' },
  { code: 'xp_50000', name: 'Efsane', description: '50.000 XP topla', icon: '🏆', conditionType: 'xp', conditionValue: 50000, xpReward: 2000, rarity: 'legendary' },

  // Gunluk gorev
  { code: 'daily_first', name: 'Görevci', description: 'İlk günlük görevi tamamla', icon: '📋', conditionType: 'daily_quest', conditionValue: 1, xpReward: 50, rarity: 'common' },

  // Multiplayer (Faz 3)
  { code: 'mp_first_room', name: 'Arena Çırağı', description: 'İlk odan tamamlandı', icon: '⚔️', conditionType: 'rooms_completed', conditionValue: 1, xpReward: 50, rarity: 'common' },
  { code: 'mp_ten_rooms', name: 'Arena Savaşçısı', description: '10 oda tamamla', icon: '🛡️', conditionType: 'rooms_completed', conditionValue: 10, xpReward: 200, rarity: 'rare' },
  { code: 'mp_first_win', name: 'İlk Galibiyet', description: 'Bir multiplayer odada birinci ol', icon: '🥇', conditionType: 'multiplayer_firsts', conditionValue: 1, xpReward: 150, rarity: 'common' },
  { code: 'mp_five_firsts', name: 'Şampiyon', description: '5 multiplayer odada birinci ol', icon: '🏆', conditionType: 'multiplayer_firsts', conditionValue: 5, xpReward: 500, rarity: 'epic' },
]

export const RARITY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  common: { bg: 'var(--card-bg)', border: 'var(--border)', text: 'var(--text-sub)' },
  rare: { bg: 'var(--focus-bg)', border: 'var(--focus-border)', text: 'var(--focus)' },
  epic: { bg: 'var(--wisdom-bg)', border: 'var(--wisdom-border)', text: 'var(--wisdom)' },
  legendary: { bg: 'var(--reward-bg)', border: 'var(--reward-border)', text: 'var(--reward)' },
}

export interface BadgeStats {
  gamesPlayed: number
  correctAnswers: number
  bestStreak: number
  totalXP: number
  dailyQuestsCompleted: number
  // Faz 3 multiplayer (opsiyonel - eski caller'lar 0 default'la)
  multiplayerWins?: number
  roomsCompleted?: number
  multiplayerFirsts?: number
}

/**
 * Kullanici profilini rozet kosullarina karsi kontrol et
 */
export function checkBadgeEarned(badge: BadgeDefinition, stats: BadgeStats): boolean {
  switch (badge.conditionType) {
    case 'games_played': return stats.gamesPlayed >= badge.conditionValue
    case 'correct_answers': return stats.correctAnswers >= badge.conditionValue
    case 'streak': return stats.bestStreak >= badge.conditionValue
    case 'xp': return stats.totalXP >= badge.conditionValue
    case 'daily_quest': return stats.dailyQuestsCompleted >= badge.conditionValue
    case 'multiplayer_wins': return (stats.multiplayerWins ?? 0) >= badge.conditionValue
    case 'rooms_completed': return (stats.roomsCompleted ?? 0) >= badge.conditionValue
    case 'multiplayer_firsts': return (stats.multiplayerFirsts ?? 0) >= badge.conditionValue
    default: return false
  }
}
