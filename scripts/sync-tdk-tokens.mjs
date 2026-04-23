#!/usr/bin/env node
/**
 * Shared TDK Buyuk Turkce Sozluk'ten filtrelenmis token listesi uretir.
 *
 * Kaynak: F:/projelerim/shared/tdk-turkce-sozluk/tokens.json (27947 token)
 * Cikti:  src/lib/validations/data/tdk-tokens-expanded.json
 *
 * Filtre:
 *   - count >= MIN_COUNT (sadece yaygin kelimeler)
 *   - length >= MIN_LENGTH (kisa tokenlar false positive riski yuksek)
 *   - Manuel fixture'da olmayan (duplicate yok)
 *   - Allowlist'te olmayan (mesru ASCII kullanimli kelimeler)
 *
 * Yeniden calistir: node scripts/sync-tdk-tokens.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')

// Paylasilan sozluk (out-of-tree kaynak)
const SHARED_TOKENS = 'F:/projelerim/shared/tdk-turkce-sozluk/tokens.json'
const OUTPUT = resolve(PROJECT_ROOT, 'src/lib/validations/data/tdk-tokens-expanded.json')
const MANUAL_FIXTURE = resolve(PROJECT_ROOT, 'src/lib/validations/tdk-rules.fixture.ts')

// ═══════════════════════════════════════════════════════════════════════
// FILTRE AYARLARI
// ═══════════════════════════════════════════════════════════════════════

const MIN_COUNT = 50 // TDK sozlukte en az X kere gecen
const MIN_LENGTH = 5 // En kisa token uzunlugu (is, su gibi kisa kelimeleri atla)

// ASCII muadili mesru kullanilabilen veya false positive potansiyeli yuksek
// kelimeler. Bu liste zamanla buyur.
const ALLOWLIST_ASCII = new Set([
  // Yaygin inflection'lar (kok zaten listede, tum cekimleri eklemeye gerek yok)
  'isinde', 'isini', 'isiyle', 'isine',
  'icinde', 'icinden', 'icine', 'icindeki',
  'uzere', 'uzerine', 'uzerinde', 'uzerinden', 'uzerindeki',

  // Code/path terimleri
  'icerik', 'iceren', 'icermez', // "içerik" gerekli ama dogru form "Icerik" de ekleyebiliriz manuel
  'dogal', // "doğal" - code variable'larinda olabilir, manuel ekle

  // Kisaltma potansiyeli
  'isim', 'isminde',

  // English benzeri
  'kisim', 'kismi',

  // URL slug (fixture allowedContexts)
  'nasil', // /nasil-calisir route

  // Placeholder email domain (ornek.com = example.com konvansiyon)
  'ornek',

  // DB category enum degeri (data layer, UI'da gosterim icin tr-text ile mapping yapilir)
  'diger',
])

// ═══════════════════════════════════════════════════════════════════════
// OKUMA
// ═══════════════════════════════════════════════════════════════════════

if (!existsSync(SHARED_TOKENS)) {
  console.error(`HATA: Shared tokens bulunamadi: ${SHARED_TOKENS}`)
  console.error('F:/projelerim/shared/tdk-turkce-sozluk/ dizininde extract.mjs calistir.')
  process.exit(1)
}

console.log(`[1/4] Shared sozluk okunuyor: ${SHARED_TOKENS}`)
const allTokens = JSON.parse(readFileSync(SHARED_TOKENS, 'utf8'))
console.log(`      ${allTokens.length} token yuklendi`)

// ═══════════════════════════════════════════════════════════════════════
// MANUEL FIXTURE'DAN ASCII'LERI CIKAR (case-insensitive)
// ═══════════════════════════════════════════════════════════════════════

console.log('[2/4] Manuel fixture ASCII token listesi okuniyor...')
const fixtureSrc = readFileSync(MANUAL_FIXTURE, 'utf8')
// Regex: ['asciiForm', 'turkceForm'] — ilk string (ASCII)
const tokenPairRegex = /\[\s*'([^']+)'\s*,\s*'[^']+'\s*\]/g
const manualAsciis = new Set()
let match
while ((match = tokenPairRegex.exec(fixtureSrc)) !== null) {
  manualAsciis.add(match[1].toLowerCase())
}
console.log(`      ${manualAsciis.size} manuel ASCII token tespit edildi`)

// ═══════════════════════════════════════════════════════════════════════
// FILTRELE
// ═══════════════════════════════════════════════════════════════════════

console.log(`[3/4] Filtre uygulaniyor (count>=${MIN_COUNT}, len>=${MIN_LENGTH})...`)

const filtered = allTokens.filter((t) => {
  if (!t.lossy) return false
  if (t.count < MIN_COUNT) return false
  if (t.ascii.length < MIN_LENGTH) return false
  if (ALLOWLIST_ASCII.has(t.ascii.toLowerCase())) return false
  // Manuel fixture'da zaten varsa atla (case-insensitive)
  if (manualAsciis.has(t.ascii.toLowerCase())) return false
  return true
})

// ═══════════════════════════════════════════════════════════════════════
// CIKTI
// ═══════════════════════════════════════════════════════════════════════

console.log(`[4/4] Yaziliyor: ${OUTPUT}`)

const output = {
  source: 'F:/projelerim/shared/tdk-turkce-sozluk/tokens.json',
  generatedAt: new Date().toISOString(),
  filter: { minCount: MIN_COUNT, minLength: MIN_LENGTH },
  totalInSource: allTokens.length,
  afterFilter: filtered.length,
  tokens: filtered.map((t) => [t.ascii, t.turkish, t.count]),
}

writeFileSync(OUTPUT, JSON.stringify(output, null, 2), 'utf8')

console.log('')
console.log(`TAMAM. ${filtered.length} token yazildi.`)
console.log(`      Dosya boyutu: ${(JSON.stringify(output).length / 1024).toFixed(1)} KB`)
console.log('')
console.log('Ornek (ilk 10):')
for (const t of filtered.slice(0, 10)) {
  console.log(`      ${t.ascii.padEnd(20)} -> ${t.turkish}  (${t.count} kez)`)
}
