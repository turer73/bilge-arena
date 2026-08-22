#!/usr/bin/env node
/**
 * matematik + fen aktif sorularin kalite denetimi.
 * DIAGNOSTIC ONLY: question_validation_decisions yazmaz ve yayin karari degildir.
 * Kontroller:
 *  1. Cevap dagilimi (A/B/C/D/E — ideal ~%20 her biri)
 *  2. Garbled/encoding hatasi (ASCII Turkce)
 *  3. Bos/eksik options
 *  4. answer out-of-range (5 secenekten buyuk)
 *  5. Cok kisa soru (<15 char)
 *  6. Random 20 soru ornekleme (manuel gozden gecirme icin stdout)
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.local')
if (existsSync(envPath)) {
  const txt = readFileSync(envPath, 'utf-8')
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// --- 1. Tum aktif matematik+fen cek ---
const PAGE = 1000
const all = []
let from = 0
while (true) {
  const { data, error } = await supabase
    .from('questions')
    .select('id, game, category, difficulty, content')
    .in('game', ['matematik', 'fen'])
    .eq('is_active', true)
    .range(from, from + PAGE - 1)
  if (error) { console.error('FETCH FAIL:', error); process.exit(1) }
  all.push(...data)
  if (data.length < PAGE) break
  from += PAGE
}

console.log(`\nAktif matematik+fen: ${all.length} soru\n`)

// --- 2. Kontroller ---
const GARBLED = /[sgouc][ai]?[ngti]?[iy]?(n|m|k|r|l|c)|asag|ust(e|u)?n?|donmus|olusum|cevap|islev|katil|yazil|gecis|buyuk|kucuk|ozet|anlam|katman|dagil|koken|ilisk|bolum|sonuc|deger|kural|guclu|cesit|farkl|ozellik|gelis|dunyan|esles|ornek|urun|eklem|duzey|icerik|bolen|acikl|turler|degis|kapsam|birim|ozell|gecen|altta|ustun/i

const dist = [0, 0, 0, 0, 0] // A B C D E
const flagged = {
  out_of_range: [],
  short_question: [],
  garbled: [],
  bad_options: [],
  duplicate_options: [],
}

for (const q of all) {
  const c = q.content || {}
  const text = (c.question || c.text || '').trim()
  const opts = c.options || []
  const ans = c.answer

  // Cevap dagilimi
  if (typeof ans === 'number' && ans >= 0 && ans <= 4) {
    dist[ans]++
  }

  // out-of-range answer
  if (typeof ans !== 'number' || ans < 0 || ans > 4) {
    flagged.out_of_range.push(q)
  }

  // Kisa soru
  if (text.length < 15) {
    flagged.short_question.push(q)
  }

  // Garbled encoding (Turkce karakter yerine ASCII)
  const combined = text + ' ' + opts.join(' ')
  if (GARBLED.test(combined) && /[sgouc][ai]/.test(combined)) {
    // daha kesin: sadece ASCII Turkce karekter seti hatasi
  }
  // Daha basit: is there a letter sequence that screams garbled?
  const garbledPattern = /\b(olusum|islev|donmus|asagida|ustte|buyuktur|kucuktur|yazilis|gecis|bolunme|cevap[^lari]|iliskisi|katmani|anlami|dagili|sorulari|bileseni|donusum|ozellik|katili|gelistir|duzelt|degistir|icerik)\b/i
  if (garbledPattern.test(combined)) {
    flagged.garbled.push({ id: q.id, game: q.game, cat: q.category, text: text.slice(0, 80) })
  }

  // 5'ten az secenek
  if (opts.length !== 5) {
    flagged.bad_options.push({ id: q.id, game: q.game, optCount: opts.length })
  }

  // Duplicate secenek
  const unique = new Set(opts.map(o => String(o).trim().toLowerCase()))
  if (unique.size < opts.length) {
    flagged.duplicate_options.push({ id: q.id, game: q.game, opts })
  }
}

// --- 3. Rapor ---
const labels = ['A', 'B', 'C', 'D', 'E']
const total = dist.reduce((a, b) => a + b, 0)
console.log('=== CEVAP DAGILIMI ===')
for (let i = 0; i < 5; i++) {
  const pct = total > 0 ? ((dist[i] / total) * 100).toFixed(1) : '0.0'
  const bar = '█'.repeat(Math.round(dist[i] / total * 40))
  console.log(`  ${labels[i]}: ${String(dist[i]).padStart(4)}  (${pct.padStart(5)}%)  ${bar}`)
}
console.log()

// Beklenen: her secenek ~%20 (±5 makul, ±10 sari, >%30 kirmizi)
const maxPct = Math.max(...dist.map(d => (d / total) * 100))
const minPct = Math.min(...dist.map(d => (d / total) * 100))
if (maxPct > 30) {
  console.log(`⚠️  UYARI: En yuksek secenek %${maxPct.toFixed(1)} — ciddi sapma`)
} else if (maxPct > 25) {
  console.log(`🟡 Dikkat: En yuksek secenek %${maxPct.toFixed(1)} — hafif sapma`)
} else {
  console.log(`✅ Cevap dagilimi normal (max %${maxPct.toFixed(1)})`)
}

console.log('\n=== HATA SAYILARI ===')
console.log(`  Out-of-range answer:    ${flagged.out_of_range.length}`)
console.log(`  Kisa soru (<15 char):   ${flagged.short_question.length}`)
console.log(`  Garbled encoding:       ${flagged.garbled.length}`)
console.log(`  Yanlis secenek sayisi:  ${flagged.bad_options.length}`)
console.log(`  Duplicate secenek:      ${flagged.duplicate_options.length}`)

if (flagged.out_of_range.length > 0) {
  console.log('\nOut-of-range (ilk 5):')
  flagged.out_of_range.slice(0, 5).forEach(q =>
    console.log(`  ${q.id.slice(0,8)} ${q.game}/${q.category} answer=${q.content?.answer}`)
  )
}
if (flagged.short_question.length > 0) {
  console.log('\nKisa sorular (ilk 5):')
  flagged.short_question.slice(0, 5).forEach(q =>
    console.log(`  ${q.id.slice(0,8)} "${(q.content?.question || '').slice(0, 50)}"`)
  )
}
if (flagged.garbled.length > 0) {
  console.log(`\nGarbled (ilk 10):`)
  flagged.garbled.slice(0, 10).forEach(g =>
    console.log(`  ${g.id.slice(0,8)} [${g.game}/${g.cat}] "${g.text}"`)
  )
}
if (flagged.bad_options.length > 0) {
  console.log('\nYanlis secenek sayisi (ilk 5):')
  flagged.bad_options.slice(0, 5).forEach(b =>
    console.log(`  ${b.id.slice(0,8)} ${b.game} — ${b.optCount} secenek`)
  )
}
if (flagged.duplicate_options.length > 0) {
  console.log('\nDuplicate secenek (ilk 3):')
  flagged.duplicate_options.slice(0, 3).forEach(d => {
    console.log(`  ${d.id.slice(0,8)} ${d.game}`)
    d.opts.forEach((o, i) => console.log(`    ${i}) ${o}`))
  })
}

// --- 4. Random 20 ornek ---
console.log('\n=== RANDOM 20 ORNEK (manuel inceleme) ===')
const shuffled = [...all].sort(() => Math.random() - 0.5).slice(0, 20)
for (const q of shuffled) {
  const c = q.content
  console.log(`\n[${q.game}/${q.category} d${q.difficulty}] ${q.id.slice(0,8)}`)
  console.log(`  S: ${(c.question || c.text || '').slice(0, 120)}`)
  ;(c.options || []).forEach((o, i) =>
    console.log(`  ${labels[i]}) ${String(o).slice(0, 80)}${i === c.answer ? ' ← CEVAP' : ''}`)
  )
}

// --- 5. JSON export ---
const report = {
  date: new Date().toISOString(),
  total: all.length,
  dist: Object.fromEntries(labels.map((l, i) => [l, dist[i]])),
  maxPct,
  minPct,
  flagged: {
    out_of_range: flagged.out_of_range.map(q => q.id),
    short_question: flagged.short_question.map(q => q.id),
    garbled: flagged.garbled.map(g => g.id),
    bad_options: flagged.bad_options.map(b => b.id),
    duplicate_options: flagged.duplicate_options.map(d => d.id),
  },
  sample20: shuffled.map(q => ({
    id: q.id, game: q.game, category: q.category, difficulty: q.difficulty,
    question: (q.content?.question || q.content?.text || '').slice(0, 200),
    options: q.content?.options,
    answer: q.content?.answer,
  }))
}

const outPath = join(__dirname, 'audit-math-fen-result.json')
writeFileSync(outPath, JSON.stringify(report, null, 2))
console.log(`\n\nJSON rapor: ${outPath}`)
