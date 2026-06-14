/**
 * Hazır-avatar seti üretici (tek seferlik / yeniden-çalıştırılabilir).
 *
 * DiceBear HTTP API'sinden SVG çeker → public/avatars/preset/ altına yazar +
 * tipli manifest (src/lib/constants/preset-avatars.ts) + lisans NOTICE üretir.
 *
 * ÖNEMLİ: Yalnız CC0/MIT (atıf gerektirmeyen) stiller kullanılır — lisanslar
 * dicebear.com/styles'tan doğrulandı (2026-06-14). Atıf-gerektirenler (bottts,
 * fun-emoji, adventurer, big-smile = CC BY 4.0 / commercial) BİLİNÇLİ HARİÇ.
 *
 * Çalıştır:  node scripts/gen-preset-avatars.mjs
 * Runtime'da DiceBear bağımlılığı YOK — üretilen SVG'ler statik servis edilir.
 */
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const OUT_DIR = 'public/avatars/preset'
const CONST_FILE = 'src/lib/constants/preset-avatars.ts'

// Tümü CC0 1.0 (atıf yok) — dicebear.com/styles doğrulamasıyla
const STYLES = [
  { key: 'pixel-art', label: 'Piksel', credit: 'DiceBear · CC0 1.0' },
  { key: 'thumbs', label: 'Minik', credit: 'DiceBear · CC0 1.0' },
  { key: 'notionists', label: 'Çizgi', credit: 'Zoish · CC0 1.0' },
  { key: 'lorelei', label: 'Sevimli', credit: 'Lisa Wischofsky · CC0 1.0' },
  { key: 'open-peeps', label: 'Karakter', credit: 'Pablo Stanley · CC0 1.0' },
]
const SEEDS = ['Bilge', 'Yildiz', 'Deniz', 'Kaya', 'Cinar', 'Pamuk', 'Atlas', 'Umut']

mkdirSync(OUT_DIR, { recursive: true })

const manifest = []
for (const style of STYLES) {
  for (let i = 0; i < SEEDS.length; i++) {
    const id = `${style.key}-${i + 1}`
    const seed = `${SEEDS[i]}-${style.key}`
    const url = `https://api.dicebear.com/9.x/${style.key}/svg?seed=${encodeURIComponent(seed)}&radius=50&backgroundType=gradientLinear,solid`
    const res = await fetch(url)
    if (!res.ok) {
      console.error('FAIL', id, res.status)
      process.exitCode = 1
      continue
    }
    const svg = await res.text()
    writeFileSync(join(OUT_DIR, `${id}.svg`), svg)
    manifest.push({ id, style: style.key, label: style.label })
    console.log('OK', id)
  }
}

// Lisans bildirimi
const notice = [
  'Bilge Arena — Hazır Avatar Seti / Lisans Bildirimi',
  '',
  'Avatarlar DiceBear (https://www.dicebear.com) ile üretildi.',
  'Yalnız CC0 1.0 / MIT (atıf gerektirmeyen) stiller kullanıldı:',
  '',
  ...STYLES.map((s) => `  - ${s.key}: ${s.credit}`),
  '',
  'CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/',
  `Üretim: scripts/gen-preset-avatars.mjs · ${manifest.length} avatar`,
].join('\n')
writeFileSync(join(OUT_DIR, 'NOTICE.txt'), notice + '\n')

// Tipli manifest (uygulama bunu import eder)
const ts = `/**
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

export const PRESET_AVATARS: PresetAvatar[] = ${JSON.stringify(
    manifest.map((m) => ({ id: m.id, path: `/avatars/preset/${m.id}.svg`, style: m.style, label: m.label })),
    null,
    2,
  )}

export const PRESET_AVATAR_IDS = new Set(PRESET_AVATARS.map((a) => a.id))

/** presetId geçerliyse statik path'i döndür; değilse null (sunucu-tarafı guard). */
export function presetAvatarPath(id: string): string | null {
  return PRESET_AVATAR_IDS.has(id) ? \`/avatars/preset/\${id}.svg\` : null
}
`
writeFileSync(CONST_FILE, ts)
console.log(`\nManifest: ${manifest.length} avatar → ${CONST_FILE}`)
