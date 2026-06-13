/**
 * Video Arka Plan Mağazası — tipler + yardımcılar (Faz-2).
 *
 * CSS temalar profile-backgrounds.ts'te STATİK kalır; video temalar
 * `background_assets` tablosunda DİNAMİK (admin upload). Mağaza ve profil
 * ikisini tek `StoreBackgroundItem` tipinde birleştirir. Sahiplik aynı
 * (profiles.owned_backgrounds + purchase_background RPC).
 */

import { PROFILE_BACKGROUNDS, type BackgroundRarity } from './profile-backgrounds'

export type VideoResolution = 'hd' | 'k2' | 'k4'

export const RESOLUTION_LABELS: Record<VideoResolution, string> = {
  hd: 'HD',
  k2: '2K',
  k4: '4K',
}

/** Kalite sırası (düşük → yüksek) — seçici ve varsayılan seçim için. */
export const RESOLUTION_ORDER: VideoResolution[] = ['hd', 'k2', 'k4']

export interface VideoVariants {
  hd?: string
  k2?: string
  k4?: string
}

/** DB satırı (snake_case, background_assets tablosu). */
export interface BackgroundAssetRow {
  id: string
  slug: string
  name: string
  description: string | null
  category: string
  rarity: BackgroundRarity
  coin_cost: number
  variants: VideoVariants
  poster_url: string | null
  is_published: boolean
  created_at: string
  updated_at?: string
}

/** Mağaza/profil birleşik kozmetik item (CSS statik + video DB → tek tip). */
export interface StoreBackgroundItem {
  id: string
  name: string
  description: string
  category: string
  rarity: BackgroundRarity
  /** undefined = ücretsiz (yalnız CSS başlangıç temaları); video daima ücretli. */
  coinCost?: number
  kind: 'css' | 'video'
  // CSS tema alanları
  css?: string
  animClass?: string
  // Video tema alanları
  variants?: VideoVariants
  posterUrl?: string
}

/** DB satırını mağaza item'ına çevirir (id = slug). */
export function rowToStoreItem(r: BackgroundAssetRow): StoreBackgroundItem {
  return {
    id: r.slug,
    name: r.name,
    description: r.description ?? '',
    category: r.category,
    rarity: r.rarity,
    coinCost: r.coin_cost,
    kind: 'video',
    variants: r.variants ?? {},
    posterUrl: r.poster_url ?? undefined,
  }
}

/** variants içinde gerçekten URL'i olan çözünürlükleri (sıralı) döndürür. */
export function availableResolutions(variants: VideoVariants | undefined): VideoResolution[] {
  if (!variants) return []
  return RESOLUTION_ORDER.filter((res) => {
    const url = variants[res]
    return typeof url === 'string' && url.length > 0
  })
}

/**
 * İstenen çözünürlüğü mevcut varyantlara göre çözer: tam eşleşme yoksa
 * en yakın daha düşük, o da yoksa en yüksek mevcut. Hiç varyant yoksa null.
 */
export function resolveVariantUrl(
  variants: VideoVariants | undefined,
  preferred: VideoResolution,
): string | null {
  const available = availableResolutions(variants)
  if (available.length === 0) return null
  if (available.includes(preferred)) return variants![preferred]!
  // preferred'dan düşüğe in, yoksa en yükseği ver
  const prefIdx = RESOLUTION_ORDER.indexOf(preferred)
  for (let i = prefIdx - 1; i >= 0; i--) {
    const res = RESOLUTION_ORDER[i]
    if (available.includes(res)) return variants![res]!
  }
  const highest = available[available.length - 1]
  return variants![highest]!
}

/** Çözünürlük tercihinin saklandığı localStorage anahtarı. */
export const BACKGROUND_RESOLUTION_KEY = 'bilge-arena-bg-resolution-v1'

/** Public yayınlanmış video temaları çeken endpoint. */
export const PUBLISHED_BACKGROUNDS_ENDPOINT = '/api/backgrounds'

/**
 * Statik CSS temalarını birleşik mağaza tipine çevirir (CSS + video tek
 * katalog). Mağaza ve profil ortak kaynak — divergence olmasın.
 */
export const CSS_STORE_ITEMS: StoreBackgroundItem[] = PROFILE_BACKGROUNDS.map((b) => ({
  id: b.id,
  name: b.name,
  description: b.description,
  category: b.category,
  rarity: b.rarity,
  coinCost: b.coinCost,
  kind: 'css',
  css: b.css,
  animClass: b.animClass,
}))
