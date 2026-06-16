import { PRESET_AVATARS, type PresetAvatar } from './preset-avatars'

/**
 * Tüm avatar kataloğu = Bilge Chan maskotları + DiceBear preset'leri.
 *
 * MASCOT_AVATARS elle bakımlıdır (preset-avatars.ts `gen-preset-avatars.mjs` ile
 * OTOMATİK üretilir → mascot'ları ORADA tutarsak script siler). Görseller
 * Renderhane'de üretildi (flux-kontext-max, 3D-render stili, chan-idle referansı),
 * kare webp olarak public/avatars/mascot/ altında (~25-31KB).
 *
 * id'ler İngilizce (TDK: kullanıcıya görünmez, sadece anahtar); label TR ("Bilge Chan").
 */
export const MASCOT_AVATARS: PresetAvatar[] = [
  { id: 'chan-3d-smile', path: '/avatars/mascot/chan-avatar-3d-smile.webp', style: 'bilge-chan', label: 'Bilge Chan' },
  { id: 'chan-3d-cheer', path: '/avatars/mascot/chan-avatar-3d-cheer.webp', style: 'bilge-chan', label: 'Bilge Chan' },
  { id: 'chan-3d-wink', path: '/avatars/mascot/chan-avatar-3d-wink.webp', style: 'bilge-chan', label: 'Bilge Chan' },
  { id: 'chan-3d-study', path: '/avatars/mascot/chan-avatar-3d-study.webp', style: 'bilge-chan', label: 'Bilge Chan' },
  { id: 'chan-3d-shy', path: '/avatars/mascot/chan-avatar-3d-shy.webp', style: 'bilge-chan', label: 'Bilge Chan' },
  { id: 'chan-3d-cool', path: '/avatars/mascot/chan-avatar-3d-cool.webp', style: 'bilge-chan', label: 'Bilge Chan' },
  // Karakterler — Bilge Arena formasını (lacivert "B" varsity ceket) koruyan
  // temalı varyantlar (erkek + astronot/uzaylı/kedi). Aynı Renderhane pipeline'ı.
  { id: 'chan-3d-male', path: '/avatars/mascot/chan-avatar-3d-male.webp', style: 'bilge-chan', label: 'Karakterler' },
  { id: 'chan-3d-astronaut', path: '/avatars/mascot/chan-avatar-3d-astronaut.webp', style: 'bilge-chan', label: 'Karakterler' },
  { id: 'chan-3d-alien', path: '/avatars/mascot/chan-avatar-3d-alien.webp', style: 'bilge-chan', label: 'Karakterler' },
  { id: 'chan-3d-cat', path: '/avatars/mascot/chan-avatar-3d-cat.webp', style: 'bilge-chan', label: 'Karakterler' },
  // Hayvanlar — formayı koruyan antropomorfik hayvan karakterleri
  { id: 'chan-dog', path: '/avatars/mascot/chan-avatar-dog.webp', style: 'bilge-chan', label: 'Hayvanlar' },
  { id: 'chan-fox', path: '/avatars/mascot/chan-avatar-fox.webp', style: 'bilge-chan', label: 'Hayvanlar' },
  { id: 'chan-panda', path: '/avatars/mascot/chan-avatar-panda.webp', style: 'bilge-chan', label: 'Hayvanlar' },
  { id: 'chan-owl', path: '/avatars/mascot/chan-avatar-owl.webp', style: 'bilge-chan', label: 'Hayvanlar' },
  // Fantastik
  { id: 'chan-wizard', path: '/avatars/mascot/chan-avatar-wizard.webp', style: 'bilge-chan', label: 'Fantastik' },
  { id: 'chan-knight', path: '/avatars/mascot/chan-avatar-knight.webp', style: 'bilge-chan', label: 'Fantastik' },
  { id: 'chan-fairy', path: '/avatars/mascot/chan-avatar-fairy.webp', style: 'bilge-chan', label: 'Fantastik' },
  // Arketipler
  { id: 'chan-gamer', path: '/avatars/mascot/chan-avatar-gamer.webp', style: 'bilge-chan', label: 'Arketipler' },
  { id: 'chan-athlete', path: '/avatars/mascot/chan-avatar-athlete.webp', style: 'bilge-chan', label: 'Arketipler' },
  // Anime — 2D cel-shaded stil (3D'den farklı estetik, çeşitlilik için)
  { id: 'chan-anime-chan', path: '/avatars/mascot/chan-avatar-anime-chan.webp', style: 'anime', label: 'Anime' },
  { id: 'chan-anime-ninja', path: '/avatars/mascot/chan-avatar-anime-ninja.webp', style: 'anime', label: 'Anime' },
]

/** Maskot önce (galeri vitrini), sonra DiceBear preset'leri. */
export const ALL_AVATARS: PresetAvatar[] = [...MASCOT_AVATARS, ...PRESET_AVATARS]

const PATH_BY_ID = new Map(ALL_AVATARS.map((a) => [a.id, a.path]))

/**
 * Geçerli avatar id → /public yolu (mascot webp + DiceBear svg). Geçersizse null.
 * Sunucu-tarafı guard (rastgele avatar_url enjeksiyonunu engeller). preset-avatars
 * presetAvatarPath'i yalnız `.svg` döndürdüğü için webp mascot'lar buradan çözülür.
 */
export function avatarPath(id: string): string | null {
  return PATH_BY_ID.get(id) ?? null
}

/**
 * Rarity — seviye kilidi (Z kuşağı: "exclusive/earn" bağlılık). Avatar id →
 * gereken min seviye (LEVELS 1-5: Acemi→Efsane). Listede yoksa 1 = herkese açık.
 * Çoğu avatar açık; birkaç prestij avatarı oynayarak (XP) açılır. Personel hepsi.
 * Sunucu select-route + galeri bu eşiği uygular (kozmetik kilit, ödeme değil).
 */
const AVATAR_MIN_LEVEL: Record<string, number> = {
  // Lv2 (Çırak)
  'chan-3d-astronaut': 2, 'chan-3d-alien': 2, 'chan-3d-cat': 2,
  'chan-dog': 2, 'chan-fox': 2, 'chan-gamer': 2, 'chan-athlete': 2,
  // Lv3 (Savaşçı)
  'chan-panda': 3, 'chan-owl': 3, 'chan-knight': 3, 'chan-anime-chan': 3,
  // Lv4 (Usta)
  'chan-wizard': 4, 'chan-anime-ninja': 4,
  // Lv5 (Efsane) — en nadir
  'chan-fairy': 5,
}

/** Avatarın gerektirdiği min seviye (yoksa 1 = herkese açık). */
export function avatarMinLevel(id: string): number {
  return AVATAR_MIN_LEVEL[id] ?? 1
}

/**
 * label'a göre gruplanmış (ekleme sırası korunur → "Bilge Chan" ilk). Galeride
 * bölüm başlıklarıyla render edilir.
 */
export const AVATAR_GROUPS: { label: string; items: PresetAvatar[] }[] = (() => {
  const groups: { label: string; items: PresetAvatar[] }[] = []
  const byLabel = new Map<string, PresetAvatar[]>()
  for (const a of ALL_AVATARS) {
    let g = byLabel.get(a.label)
    if (!g) {
      g = []
      byLabel.set(a.label, g)
      groups.push({ label: a.label, items: g })
    }
    g.push(a)
  }
  return groups
})()
