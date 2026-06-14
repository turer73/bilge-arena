/**
 * Avatar Süsleri — avatarın etrafına bindirilen kozmetik (kanat/taç/yıldız/
 * konfeti/aura/alev). ÇOKLU seçim: kullanıcı birden fazlasını aynı anda takabilir
 * (kanat + taç + aura). Emoji + SVG (sıfır-asset, lisans-temiz, çocuk-dostu);
 * render `@/components/profile/avatar-decoration`.
 *
 * Faz 3b: coin ekonomisi + DB seçim (selected_avatar_decorations text[] →
 * başkalarına sıralama/profilde görünür). 'none' YOK; boş dizi = süssüz.
 * konfeti ÜCRETSİZ başlangıç süsü (coinCost yok → owned gerektirmez); diğerleri
 * coin. Sahiplik DB owned_avatar_decorations; select endpoint free|owned|staff guard.
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

// Sıra = mağaza/stüdyo görünüm sırası (ücretsiz önce, sonra fiyat artan).
export const AVATAR_DECORATIONS: AvatarDecorationDef[] = [
  { id: 'konfeti', name: 'Konfeti', description: 'Kutlama havası', rarity: 'common', icon: '🎉' },
  { id: 'aura', name: 'Altın Hale', description: 'Avatarın arkasında parlayan hale', rarity: 'rare', icon: '🟡', coinCost: 150 },
  { id: 'sparkle', name: 'Yıldız Tozu', description: 'Etrafında parıldayan yıldızlar', rarity: 'rare', icon: '✨', coinCost: 200 },
  { id: 'alev', name: 'Alev', description: 'Seri ateşi gibi yanan alevler', rarity: 'rare', icon: '🔥', coinCost: 250 },
  { id: 'kanat', name: 'Melek Kanadı', description: 'İki yanında melek kanatları', rarity: 'epic', icon: '🪽', coinCost: 500 },
  { id: 'crown', name: 'Taç', description: 'Başının üstünde altın taç', rarity: 'epic', icon: '👑', coinCost: 600 },
]

export const DECORATION_RARITY_LABEL: Record<DecorationRarity, string> = {
  common: 'Sıradan',
  rare: 'Nadir',
  epic: 'Epik',
  legendary: 'Efsanevi',
}

export const AVATAR_DECORATION_STORAGE_KEY = 'bilge-arena-avatar-decoration-v1'

const VALID_IDS = new Set(AVATAR_DECORATIONS.map((d) => d.id))

/**
 * localStorage değerini güvenli diziye çevirir. Hem yeni JSON-dizi formatını hem
 * eski tek-string (Faz 3a) formatını okur; geçersiz/bilinmeyen id'leri eler.
 */
export function parseDecorationIds(raw: string | null | undefined): string[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = [raw] // eski tek-string biçim
  }
  const arr = Array.isArray(parsed) ? parsed : [parsed]
  return arr.filter((x): x is string => typeof x === 'string' && VALID_IDS.has(x))
}

export function serializeDecorationIds(ids: string[]): string {
  return JSON.stringify(ids.filter((id) => VALID_IDS.has(id)))
}

export function getDecorationById(id: string | null | undefined): AvatarDecorationDef | undefined {
  return AVATAR_DECORATIONS.find((d) => d.id === id)
}

/** Ücretsiz süs (coinCost yok) → owned gerektirmeden takılabilir. */
export function isDecorationFree(id: string): boolean {
  const d = getDecorationById(id)
  return !!d && d.coinCost === undefined
}
