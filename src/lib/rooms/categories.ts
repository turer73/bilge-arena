/**
 * Bilge Arena Oda Sistemi: Kategori sabit listesi + label helper
 * Sprint 2A Task 3 Codex fix (PR #61 follow-up)
 *
 * Tek kaynak (single source of truth) — PublicRoomList, QuickPlayPanel,
 * CreateRoomForm 3 yerde tekrar tanim engellenir. Kategori eklemek için
 * sadece bu dosyaya satir eklenir.
 *
 * Codex P3 #1 (PR #61): kategori slug raw goruntulendigi yerlerde
 * slugToLabel() ile insan-okunabilir hale getirilir
 * ('genel-kultur' → 'Genel Kültür').
 *
 * Codex P3 #2 (PR #61): CATEGORIES listesi 3 dosyada tekrarlaniyordu —
 * bu dosya tek kaynak. QuickPlayPanel ve CreateRoomForm follow-up PR'da
 * bu helper'a refactor edilir (PR #62 master'a giren state degil, ayri PR).
 */

export const ROOM_CATEGORIES = [
  'genel-kultur',
  'tarih',
  'cografya',
  'edebiyat',
  'matematik',
  'fen',
  'ingilizce',
  'vatandaslik',
  'futbol',
  'sinema',
] as const

export type RoomCategorySlug = (typeof ROOM_CATEGORIES)[number]

/**
 * Slug -> Insan-okunabilir UI label.
 * UI'da kullanilan tum kategori metinleri buradan cekilir.
 */
export const CATEGORY_LABELS: Record<RoomCategorySlug, string> = {
  'genel-kultur': 'Genel Kültür',
  tarih: 'Tarih',
  cografya: 'Coğrafya',
  edebiyat: 'Edebiyat',
  matematik: 'Matematik',
  fen: 'Fen Bilimleri',
  ingilizce: 'İngilizce',
  vatandaslik: 'Vatandaşlık',
  futbol: 'Futbol',
  sinema: 'Sinema',
}

/**
 * Slug -> Label conversion (fallback raw slug bilinmeyen kategori icin).
 *
 * Codex P1 fix: `slug in CATEGORY_LABELS` prototype pollution riski —
 * `__proto__`, `toString`, `constructor` gibi inherited keys de match olur,
 * Object.prototype'tan non-string deger doner ve UI'da "[object Object]"
 * goruntulenir. `Object.hasOwn` own-property kontrolu ile sadece kendi
 * keylerini eslestirir.
 *
 * Kullanim:
 *   slugToLabel('genel-kultur') === 'Genel Kültür'
 *   slugToLabel('xx_unknown')   === 'xx_unknown'  (fallback)
 *   slugToLabel('__proto__')    === '__proto__'   (prototype fallback)
 */
export function slugToLabel(slug: string): string {
  if (Object.hasOwn(CATEGORY_LABELS, slug)) {
    return CATEGORY_LABELS[slug as RoomCategorySlug]
  }
  return slug
}

/**
 * Whitelist kategori dogrulamasi (Zod kullanmadan kontrol).
 * Backend RPC + UI dropdown disinda nadir kullanilir.
 *
 * Codex P1 fix: Object.hasOwn (prototype pollution onlem).
 */
export function isValidCategory(slug: string): slug is RoomCategorySlug {
  return Object.hasOwn(CATEGORY_LABELS, slug)
}
