/**
 * Satın-alınabilir Kozmetik Rozet — tipler + yardımcılar (Faz-3).
 *
 * KAZANILAN achievement rozetlerinden (src/lib/constants/badges.ts,
 * user_achievements, XP ödüllü) AYRI. Bunlar coin'le satın-alınan, admin'in
 * görsel yüklediği prestij/sezon rozetleri (cosmetic_badges tablosu). Discord
 * "Orbs Apprentice" / Ensar "12 Takım rozetleri" analoğu.
 */

export type CosmeticBadgeRarity = 'common' | 'rare' | 'epic' | 'legendary'

export const COSMETIC_BADGE_RARITY_LABEL: Record<CosmeticBadgeRarity, string> = {
  common: 'Sıradan',
  rare: 'Nadir',
  epic: 'Epik',
  legendary: 'Efsanevi',
}

/** DB satırı (snake_case, cosmetic_badges tablosu). */
export interface CosmeticBadgeRow {
  id: string
  slug: string
  name: string
  description: string | null
  category: string
  rarity: CosmeticBadgeRarity
  coin_cost: number
  icon_url: string | null
  is_published: boolean
  created_at: string
  updated_at?: string
}

/** Mağaza/profil için normalize edilmiş rozet (camelCase, id=slug). */
export interface StoreBadgeItem {
  id: string
  name: string
  description: string
  category: string
  rarity: CosmeticBadgeRarity
  coinCost: number
  iconUrl: string | null
}

export function rowToBadgeItem(r: CosmeticBadgeRow): StoreBadgeItem {
  return {
    id: r.slug,
    name: r.name,
    description: r.description ?? '',
    category: r.category,
    rarity: r.rarity,
    coinCost: r.coin_cost,
    iconUrl: r.icon_url ?? null,
  }
}

/** Public yayınlanmış kozmetik rozetleri çeken endpoint. */
export const PUBLISHED_BADGES_ENDPOINT = '/api/cosmetic-badges'
