/**
 * Hazır-avatar kataloğu — OTOMATİK ÜRETİLDİ (scripts/gen-preset-avatars.mjs).
 * Elle düzenleme; script'i yeniden çalıştır. Tümü CC0/MIT (atıfsız), statik
 * /public/avatars/preset/ altında. Serbest foto yükleme yerine güvenli set.
 */

export interface PresetAvatar {
  id: string
  /** /public altı yol — avatar_url olarak set edilir */
  path: string
  /** DiceBear stil anahtarı */
  style: string
  /** Türkçe kategori etiketi (UI grupları) */
  label: string
}

export const PRESET_AVATARS: PresetAvatar[] = [
  {
    "id": "pixel-art-1",
    "path": "/avatars/preset/pixel-art-1.svg",
    "style": "pixel-art",
    "label": "Piksel"
  },
  {
    "id": "pixel-art-2",
    "path": "/avatars/preset/pixel-art-2.svg",
    "style": "pixel-art",
    "label": "Piksel"
  },
  {
    "id": "pixel-art-3",
    "path": "/avatars/preset/pixel-art-3.svg",
    "style": "pixel-art",
    "label": "Piksel"
  },
  {
    "id": "pixel-art-4",
    "path": "/avatars/preset/pixel-art-4.svg",
    "style": "pixel-art",
    "label": "Piksel"
  },
  {
    "id": "pixel-art-5",
    "path": "/avatars/preset/pixel-art-5.svg",
    "style": "pixel-art",
    "label": "Piksel"
  },
  {
    "id": "pixel-art-6",
    "path": "/avatars/preset/pixel-art-6.svg",
    "style": "pixel-art",
    "label": "Piksel"
  },
  {
    "id": "pixel-art-7",
    "path": "/avatars/preset/pixel-art-7.svg",
    "style": "pixel-art",
    "label": "Piksel"
  },
  {
    "id": "pixel-art-8",
    "path": "/avatars/preset/pixel-art-8.svg",
    "style": "pixel-art",
    "label": "Piksel"
  },
  {
    "id": "thumbs-1",
    "path": "/avatars/preset/thumbs-1.svg",
    "style": "thumbs",
    "label": "Minik"
  },
  {
    "id": "thumbs-2",
    "path": "/avatars/preset/thumbs-2.svg",
    "style": "thumbs",
    "label": "Minik"
  },
  {
    "id": "thumbs-3",
    "path": "/avatars/preset/thumbs-3.svg",
    "style": "thumbs",
    "label": "Minik"
  },
  {
    "id": "thumbs-4",
    "path": "/avatars/preset/thumbs-4.svg",
    "style": "thumbs",
    "label": "Minik"
  },
  {
    "id": "thumbs-5",
    "path": "/avatars/preset/thumbs-5.svg",
    "style": "thumbs",
    "label": "Minik"
  },
  {
    "id": "thumbs-6",
    "path": "/avatars/preset/thumbs-6.svg",
    "style": "thumbs",
    "label": "Minik"
  },
  {
    "id": "thumbs-7",
    "path": "/avatars/preset/thumbs-7.svg",
    "style": "thumbs",
    "label": "Minik"
  },
  {
    "id": "thumbs-8",
    "path": "/avatars/preset/thumbs-8.svg",
    "style": "thumbs",
    "label": "Minik"
  },
  {
    "id": "notionists-1",
    "path": "/avatars/preset/notionists-1.svg",
    "style": "notionists",
    "label": "Çizgi"
  },
  {
    "id": "notionists-2",
    "path": "/avatars/preset/notionists-2.svg",
    "style": "notionists",
    "label": "Çizgi"
  },
  {
    "id": "notionists-3",
    "path": "/avatars/preset/notionists-3.svg",
    "style": "notionists",
    "label": "Çizgi"
  },
  {
    "id": "notionists-4",
    "path": "/avatars/preset/notionists-4.svg",
    "style": "notionists",
    "label": "Çizgi"
  },
  {
    "id": "notionists-5",
    "path": "/avatars/preset/notionists-5.svg",
    "style": "notionists",
    "label": "Çizgi"
  },
  {
    "id": "notionists-6",
    "path": "/avatars/preset/notionists-6.svg",
    "style": "notionists",
    "label": "Çizgi"
  },
  {
    "id": "notionists-7",
    "path": "/avatars/preset/notionists-7.svg",
    "style": "notionists",
    "label": "Çizgi"
  },
  {
    "id": "notionists-8",
    "path": "/avatars/preset/notionists-8.svg",
    "style": "notionists",
    "label": "Çizgi"
  },
  {
    "id": "lorelei-1",
    "path": "/avatars/preset/lorelei-1.svg",
    "style": "lorelei",
    "label": "Sevimli"
  },
  {
    "id": "lorelei-2",
    "path": "/avatars/preset/lorelei-2.svg",
    "style": "lorelei",
    "label": "Sevimli"
  },
  {
    "id": "lorelei-3",
    "path": "/avatars/preset/lorelei-3.svg",
    "style": "lorelei",
    "label": "Sevimli"
  },
  {
    "id": "lorelei-4",
    "path": "/avatars/preset/lorelei-4.svg",
    "style": "lorelei",
    "label": "Sevimli"
  },
  {
    "id": "lorelei-5",
    "path": "/avatars/preset/lorelei-5.svg",
    "style": "lorelei",
    "label": "Sevimli"
  },
  {
    "id": "lorelei-6",
    "path": "/avatars/preset/lorelei-6.svg",
    "style": "lorelei",
    "label": "Sevimli"
  },
  {
    "id": "lorelei-7",
    "path": "/avatars/preset/lorelei-7.svg",
    "style": "lorelei",
    "label": "Sevimli"
  },
  {
    "id": "lorelei-8",
    "path": "/avatars/preset/lorelei-8.svg",
    "style": "lorelei",
    "label": "Sevimli"
  },
  {
    "id": "open-peeps-1",
    "path": "/avatars/preset/open-peeps-1.svg",
    "style": "open-peeps",
    "label": "Karakter"
  },
  {
    "id": "open-peeps-2",
    "path": "/avatars/preset/open-peeps-2.svg",
    "style": "open-peeps",
    "label": "Karakter"
  },
  {
    "id": "open-peeps-3",
    "path": "/avatars/preset/open-peeps-3.svg",
    "style": "open-peeps",
    "label": "Karakter"
  },
  {
    "id": "open-peeps-4",
    "path": "/avatars/preset/open-peeps-4.svg",
    "style": "open-peeps",
    "label": "Karakter"
  },
  {
    "id": "open-peeps-5",
    "path": "/avatars/preset/open-peeps-5.svg",
    "style": "open-peeps",
    "label": "Karakter"
  },
  {
    "id": "open-peeps-6",
    "path": "/avatars/preset/open-peeps-6.svg",
    "style": "open-peeps",
    "label": "Karakter"
  },
  {
    "id": "open-peeps-7",
    "path": "/avatars/preset/open-peeps-7.svg",
    "style": "open-peeps",
    "label": "Karakter"
  },
  {
    "id": "open-peeps-8",
    "path": "/avatars/preset/open-peeps-8.svg",
    "style": "open-peeps",
    "label": "Karakter"
  }
]

export const PRESET_AVATAR_IDS = new Set(PRESET_AVATARS.map((a) => a.id))

/** presetId geçerliyse statik path'i döndür; değilse null (sunucu-tarafı guard). */
export function presetAvatarPath(id: string): string | null {
  return PRESET_AVATAR_IDS.has(id) ? `/avatars/preset/${id}.svg` : null
}
