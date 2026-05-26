export type FrameRarity = 'common' | 'rare' | 'epic' | 'legendary'

export interface ProfileFrameDef {
  id: string
  name: string
  description: string
  rarity: FrameRarity
  /** CSS gradient/color for the outer ring */
  ring: string
  /** Glow rengi (box-shadow) */
  glow?: string
  /** Titreşimli parlama animasyonu */
  animated?: boolean
  /** Çerçeve kalınlığı px */
  thickness: number
  /** Swatch önizleme rengi */
  preview: string
  /** Coin satın alma bedeli — undefined = başlangıç çerçevesi (ücretsiz) */
  coinCost?: number
}

export const PROFILE_FRAMES: ProfileFrameDef[] = [
  {
    id: 'none',
    name: 'Çerçevesiz',
    description: 'Standart görünüm',
    rarity: 'common',
    ring: 'transparent',
    thickness: 0,
    preview: 'var(--border)',
  },
  {
    id: 'mavi',
    name: 'Mavi Hale',
    description: 'Arena\'nın temel çerçevesi',
    rarity: 'common',
    ring: 'linear-gradient(135deg, #1E40AF 0%, #60A5FA 50%, #1E40AF 100%)',
    glow: '#2563EB',
    thickness: 3,
    preview: '#2563EB',
  },
  {
    id: 'alev',
    name: 'Alev Çemberi',
    description: '7 günlük seride yanıyorsun 🔥',
    rarity: 'rare',
    ring: 'linear-gradient(135deg, #7C2D12 0%, #F97316 35%, #FBBF24 55%, #EF4444 80%, #7C2D12 100%)',
    glow: '#F97316',
    thickness: 3,
    preview: '#F97316',
    coinCost: 30,
  },
  {
    id: 'zumrut',
    name: 'Zümrüt Kalkan',
    description: '100 oyun oynayan bilge',
    rarity: 'rare',
    ring: 'linear-gradient(135deg, #064E3B 0%, #34D399 40%, #A7F3D0 60%, #34D399 80%, #064E3B 100%)',
    glow: '#10B981',
    thickness: 3,
    preview: '#10B981',
    coinCost: 60,
  },
  {
    id: 'gold',
    name: 'Altın Şampiyon',
    description: '30 gün seri — altın değerinde',
    rarity: 'epic',
    ring: 'linear-gradient(135deg, #78350F 0%, #FDE68A 25%, #D97706 50%, #FDE68A 75%, #78350F 100%)',
    glow: '#FCD34D',
    animated: true,
    thickness: 3,
    preview: '#D97706',
    coinCost: 120,
  },
  {
    id: 'efsane',
    name: 'Efsanevi Aura',
    description: '100 gün seri — sen bir efsanesin',
    rarity: 'legendary',
    ring: 'conic-gradient(from 0deg, #3B0764 0%, #A855F7 25%, #C4B5FD 50%, #A855F7 75%, #3B0764 100%)',
    glow: '#A78BFA',
    animated: true,
    thickness: 4,
    preview: '#7C3AED',
    coinCost: 250,
  },
  {
    id: 'evren',
    name: 'Evren',
    description: '500 doğru cevap — evrenin bilgesi',
    rarity: 'legendary',
    ring: 'conic-gradient(from 0deg, #0E1A4A, #06B6D4, #8B5CF6, #EC4899, #F59E0B, #10B981, #0E1A4A)',
    glow: '#06B6D4',
    animated: true,
    thickness: 4,
    preview: '#06B6D4',
    coinCost: 300,
  },
]

export const FRAME_RARITY_LABEL: Record<FrameRarity, string> = {
  common: 'Standart',
  rare: 'Nadir',
  epic: 'Destansı',
  legendary: 'Efsanevi',
}

export const FRAME_RARITY_COLOR: Record<FrameRarity, string> = {
  common: 'var(--text-muted)',
  rare: 'var(--focus)',
  epic: 'var(--wisdom)',
  legendary: 'var(--reward)',
}

export const FRAME_STORAGE_KEY = 'bilge-arena-profile-frame-v1'

export function getFrameById(id: string): ProfileFrameDef {
  return PROFILE_FRAMES.find((f) => f.id === id) ?? PROFILE_FRAMES[0]
}
