export interface LevelTier {
  level: number
  name: string
  minXP: number
  maxXP: number
  badge: string   // Emoji rozet
  color: string   // CSS variable key
}

export const LEVELS: LevelTier[] = [
  { level: 1, name: 'Acemi',    minXP: 0,     maxXP: 999,    badge: '\u{1F6E1}\uFE0F',  color: 'text-muted' },
  { level: 2, name: 'Cirak',    minXP: 1000,  maxXP: 4999,   badge: '\u2694\uFE0F',  color: 'focus' },
  { level: 3, name: 'Savasci',  minXP: 5000,  maxXP: 14999,  badge: '\u{1F451}', color: 'reward' },
  { level: 4, name: 'Usta',     minXP: 15000, maxXP: 49999,  badge: '\u{1F48E}', color: 'wisdom' },
  { level: 5, name: 'Efsane',   minXP: 50000, maxXP: Infinity, badge: '\u{1F525}', color: 'urgency' },
]

/** XP'ye gore seviye hesapla */
export function getLevelFromXP(xp: number): LevelTier {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].minXP) return LEVELS[i]
  }
  return LEVELS[0]
}

/** Bir sonraki seviyeye kalan XP yuzdesini hesapla (0-100) */
export function getLevelProgress(xp: number): number {
  const current = getLevelFromXP(xp)
  if (current.maxXP === Infinity) return 100
  const range = current.maxXP - current.minXP + 1
  const progress = xp - current.minXP
  return Math.min(99, Math.floor((progress / range) * 100))
}
