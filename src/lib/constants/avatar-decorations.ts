/**
 * Avatar Süsleri — avatarın etrafına bindirilen kozmetik (kanat/taç/yıldız/
 * konfeti/aura/alev). Emoji + CSS (sıfır-asset, lisans-temiz, çocuk-dostu);
 * render `@/components/profile/avatar-decoration`.
 *
 * Faz 3a: ücretsiz + localStorage seçim (kendi görünümü). Faz 3b: coinCost ile
 * coin ekonomisi + DB seçim (başkalarına görünür). coinCost alanı şimdiden var.
 */

export type DecorationRarity = 'common' | 'rare' | 'epic' | 'legendary'

export interface AvatarDecorationDef {
  id: string
  name: string
  description: string
  rarity: DecorationRarity
  /** Önizleme ikonu (seçici grid'inde) */
  icon: string
  /** Coin bedeli — undefined = ücretsiz (Faz 3b ekonomisi için) */
  coinCost?: number
}

export const AVATAR_DECORATIONS: AvatarDecorationDef[] = [
  { id: 'none', name: 'Süssüz', description: 'Standart görünüm', rarity: 'common', icon: '∅' },
  { id: 'aura', name: 'Altın Hale', description: 'Avatarın arkasında parlayan hale', rarity: 'rare', icon: '🟡', coinCost: 150 },
  { id: 'sparkle', name: 'Yıldız Tozu', description: 'Etrafında parıldayan yıldızlar', rarity: 'rare', icon: '✨', coinCost: 200 },
  { id: 'konfeti', name: 'Konfeti', description: 'Kutlama havası', rarity: 'common', icon: '🎉', coinCost: 100 },
  { id: 'kanat', name: 'Melek Kanadı', description: 'İki yanında melek kanatları', rarity: 'epic', icon: '🪽', coinCost: 500 },
  { id: 'crown', name: 'Taç', description: 'Başının üstünde altın taç', rarity: 'epic', icon: '👑', coinCost: 600 },
  { id: 'alev', name: 'Alev', description: 'Seri ateşi gibi yanan alevler', rarity: 'rare', icon: '🔥', coinCost: 250 },
]

export const DECORATION_RARITY_LABEL: Record<DecorationRarity, string> = {
  common: 'Sıradan',
  rare: 'Nadir',
  epic: 'Epik',
  legendary: 'Efsanevi',
}

export const AVATAR_DECORATION_STORAGE_KEY = 'bilge-arena-avatar-decoration-v1'

export function getDecorationById(id: string | null | undefined): AvatarDecorationDef {
  return AVATAR_DECORATIONS.find((d) => d.id === id) ?? AVATAR_DECORATIONS[0]
}
