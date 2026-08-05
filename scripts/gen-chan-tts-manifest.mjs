#!/usr/bin/env node
/**
 * Bilge Chan sabit repliklerini (CHAN_LINES + bilinen sabit dize'ler) FreyaTTS
 * icin icerik-adresli bir sentez manifestine cevirir. Ses dosyalarini KENDISI
 * URETMEZ — Klipper'daki FreyaTTS ortaminin girdisi olacak JSON listesini yazar.
 *
 * Kaynak: src/lib/constants/chan-dialogue.ts (tek gercek kaynak, burada
 * DUPLIKE EDILMEZ — text olarak okunup regex ile ayiklanir, boylece replikler
 * degisince manifest otomatik senkron kalir; yalniz yeniden calistirmak gerekir).
 *
 * Cikti: scripts/output/chan-tts-manifest.json
 * Her girdi: { key, category, letter, text }
 *   key = sha256(text|voice|params) — Klipper'in onerdigi icerik-adresli
 *   onbellek semasiyla ayni (bkz. not #100923). Uretilecek MP3 dosya adi
 *   `${key}.mp3` olmali (public/audio/chan/ altina).
 *
 * Yeniden calistir: node scripts/gen-chan-tts-manifest.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createHash } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const SOURCE = resolve(PROJECT_ROOT, 'src/lib/constants/chan-dialogue.ts')
const OUTPUT_DIR = resolve(__dirname, 'output')
const OUTPUT = resolve(OUTPUT_DIR, 'chan-tts-manifest.json')
const AUDIO_MAP_OUTPUT = resolve(PROJECT_ROOT, 'src/lib/constants/chan-audio-map.ts')

// Klipper'in gorusune gore sabit tutulmasi gereken sentez kimligi — voice/params
// degisirse (ornegin farkli bir model surumune gecilirse) burayi guncelleyip
// manifesti yeniden uretin; eski onbellek dogal olarak gecersiz olur (yeni hash).
const VOICE_ID = 'freya-tts-small-v1'
const SYNTH_PARAMS = 'euler32-default'

const LETTERS = ['A', 'B', 'C', 'D', 'E']

// bilge-chan-companion.tsx icinde CHAN_LINES disinda kalan tek sabit replik
// (sure-doldu durumu). Kaynak dosya degisirse burasi da elle guncellenmeli.
const EXTRA_FIXED_LINES = [
  { category: 'timeout', text: 'Süre doldu; sıradaki soruda yeniden dene. 💙' },
]

/** chan-dialogue.ts icindeki `key: 'metin'` veya `key: ['a', 'b']` bloklarini ayiklar. */
function extractChanLines(source) {
  const bodyMatch = source.match(/export const CHAN_LINES = \{([\s\S]*?)\} as const/)
  if (!bodyMatch) throw new Error('CHAN_LINES bloğu bulunamadı — kaynak dosya formatı değişmiş olabilir.')
  const body = bodyMatch[1]

  const result = {}
  // Her `key: [ ... ]` (array) veya `key: '...'` (tekil) grubunu yakala.
  const entryRe = /(\w+):\s*(\[[\s\S]*?\]|'(?:[^'\\]|\\.)*')/g
  let m
  while ((m = entryRe.exec(body))) {
    const [, key, raw] = m
    if (raw.startsWith('[')) {
      const strings = [...raw.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(s => s[1])
      result[key] = strings
    } else {
      result[key] = [raw.slice(1, -1)]
    }
  }
  return result
}

/** chan-tts.ts'teki emoji temizleme kuralıyla birebir aynı — hash tutarlılığı için kritik. */
function cleanText(text) {
  return text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim()
}

function contentKey(text) {
  return createHash('sha256').update(`${text}|${VOICE_ID}|${SYNTH_PARAMS}`).digest('hex').slice(0, 24)
}

function buildManifest() {
  const source = readFileSync(SOURCE, 'utf-8')
  const lines = extractChanLines(source)

  const wantedCategories = ['greet', 'offer', 'check', 'encourage', 'easyJoke', 'correct', 'wrong']
  const missing = wantedCategories.filter(c => !lines[c])
  if (missing.length > 0) {
    throw new Error(`Beklenen kategoriler kaynakta bulunamadı: ${missing.join(', ')}`)
  }

  const entries = []
  const seenKeys = new Set()

  const addEntry = (category, rawText, letter = null) => {
    const cleaned = cleanText(rawText)
    if (!cleaned) return
    const key = contentKey(cleaned)
    if (seenKeys.has(key)) return // aynı temiz metin farklı harflerde tekrar üretilmesin
    seenKeys.add(key)
    entries.push({ key, category, letter, text: cleaned })
  }

  for (const category of ['greet', 'offer', 'check', 'encourage', 'easyJoke']) {
    for (const raw of lines[category]) addEntry(category, raw)
  }

  for (const category of ['correct', 'wrong']) {
    for (const raw of lines[category]) {
      if (raw.includes('{harf}')) {
        for (const letter of LETTERS) addEntry(category, raw.replace('{harf}', letter), letter)
      } else {
        addEntry(category, raw)
      }
    }
  }

  for (const { category, text } of EXTRA_FIXED_LINES) addEntry(category, text)

  return entries
}

const entries = buildManifest()
mkdirSync(OUTPUT_DIR, { recursive: true })
writeFileSync(
  OUTPUT,
  JSON.stringify({ voice: VOICE_ID, params: SYNTH_PARAMS, generatedAt: new Date().toISOString(), entries }, null, 2),
  'utf-8',
)

// Client-bundle edilecek metin→dosya-anahtarı eşlemesi — chan-tts.ts bunu kullanarak
// statik MP3'ü (varsa) tarayıcı speechSynthesis'e tercih eder. Tek gerçek kaynak burası;
// elle senkronize edilen ikinci bir kopya YOK.
const audioMapLines = entries.map(e => `  ${JSON.stringify(e.text)}: ${JSON.stringify(e.key)},`).join('\n')
writeFileSync(
  AUDIO_MAP_OUTPUT,
  `// AUTO-GENERATED — scripts/gen-chan-tts-manifest.mjs tarafından üretilir, elle düzenlemeyin.\n` +
  `// Temiz metin → /audio/chan/{key}.mp3 dosya anahtarı. Kaynak: scripts/output/chan-tts-manifest.json\n\n` +
  `export const CHAN_AUDIO_MAP: Readonly<Record<string, string>> = {\n${audioMapLines}\n}\n`,
  'utf-8',
)

console.log(`${entries.length} benzersiz replik → ${OUTPUT}`)
console.log(`Client audio-map → ${AUDIO_MAP_OUTPUT}`)
for (const e of entries) console.log(`  ${e.key}  [${e.category}${e.letter ? '/' + e.letter : ''}]  ${e.text}`)
