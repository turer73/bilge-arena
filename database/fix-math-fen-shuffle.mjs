#!/usr/bin/env node
/**
 * matematik + fen sorularinda secenek karistirma (shuffle).
 * Dogru cevap indeksini guncelleyerek C-bias duzeltilir.
 * Icerige dokunulmaz — sadece options sirasi + answer index degisir.
 *
 * Kullanim:
 *   node database/fix-math-fen-shuffle.mjs [--dry-run]
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

const DRY_RUN = process.argv.includes('--dry-run')

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Fisher-Yates shuffle (deterministik degil — her calistirmada farkli sonuc)
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// --- 1. Tum aktif matematik+fen cek ---
const PAGE = 1000
const all = []
let from = 0
while (true) {
  const { data, error } = await supabase
    .from('questions')
    .select('id, game, category, content')
    .in('game', ['matematik', 'fen'])
    .eq('is_active', true)
    .range(from, from + PAGE - 1)
  if (error) { console.error('FETCH FAIL:', error); process.exit(1) }
  all.push(...data)
  if (data.length < PAGE) break
  from += PAGE
}

console.log(`Aktif matematik+fen: ${all.length} soru`)
console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}\n`)

// --- 2. Her soru icin yeni content olustur ---
const DUPLICATE_ID = 'a4911ba5-0000' // prefix — duplicate secenek, deaktive edilecek
const toUpdate = []
const toDeactivate = []
let skipCount = 0

for (const q of all) {
  const c = q.content
  const opts = c.options
  const ans = c.answer

  // Duplicate secenek kontrolu
  const unique = new Set(opts.map(o => String(o).trim().toLowerCase()))
  if (unique.size < opts.length) {
    toDeactivate.push(q.id)
    continue
  }

  // Gecersiz answer
  if (typeof ans !== 'number' || ans < 0 || ans >= opts.length) {
    skipCount++
    continue
  }

  // Shuffle
  const correctText = opts[ans]
  const shuffled = shuffle(opts)
  const newAns = shuffled.indexOf(correctText)

  // Ayni siraya denk gelirse tekrar dene (max 5 attempt)
  // (Buyuk ihtimalle bir kez yeter)
  let finalShuffled = shuffled
  let finalAns = newAns
  for (let attempt = 0; attempt < 5 && finalAns === ans; attempt++) {
    finalShuffled = shuffle(opts)
    finalAns = finalShuffled.indexOf(correctText)
  }

  toUpdate.push({
    id: q.id,
    content: { ...c, options: finalShuffled, answer: finalAns }
  })
}

console.log(`Karistirilacak: ${toUpdate.length}`)
console.log(`Deaktive edilecek (duplicate): ${toDeactivate.length}`)
console.log(`Atlanan (gecersiz): ${skipCount}`)

if (DRY_RUN) {
  // Dry-run'da beklenen dagilimi hesapla
  const dist = [0, 0, 0, 0, 0]
  for (const u of toUpdate) dist[u.content.answer]++
  const total = toUpdate.length
  const labels = ['A', 'B', 'C', 'D', 'E']
  console.log('\nBeklenen yeni dagilim (dry-run):')
  for (let i = 0; i < 5; i++) {
    const pct = total > 0 ? ((dist[i] / total) * 100).toFixed(1) : '0.0'
    console.log(`  ${labels[i]}: ${String(dist[i]).padStart(4)}  (${pct.padStart(5)}%)`)
  }
  console.log('\nDry-run tamam — degisiklik yapilmadi.')
  process.exit(0)
}

// --- 3. Deaktive ---
if (toDeactivate.length > 0) {
  const { error } = await supabase
    .from('questions')
    .update({ is_active: false })
    .in('id', toDeactivate)
  if (error) { console.error('Deaktive FAIL:', error.message); process.exit(1) }
  console.log(`\nDeaktive edildi: ${toDeactivate.length}`)
}

// --- 4. Toplu UPDATE — 100'er chunk ---
const CHUNK = 100
let updated = 0
let failed = 0

for (let i = 0; i < toUpdate.length; i += CHUNK) {
  const batch = toUpdate.slice(i, i + CHUNK)

  // Supabase toplu update: her biri ayri (upsert ile de yapilabilir ama content farkli)
  const results = await Promise.all(
    batch.map(({ id, content }) =>
      supabase.from('questions').update({ content }).eq('id', id)
    )
  )

  for (const { error } of results) {
    if (error) { console.error('Update FAIL:', error.message); failed++ }
    else updated++
  }

  process.stdout.write(`\r  ${updated + failed}/${toUpdate.length}  (${failed} hata)`)
}
console.log()

if (failed > 0) {
  console.error(`\nHATA: ${failed} soru guncellenemedi`)
  process.exit(1)
}

console.log(`\nGuncellendi: ${updated}`)

// --- 5. Dogrulama: yeni dagilim ---
const PAGE2 = 1000
const all2 = []
let from2 = 0
while (true) {
  const { data, error } = await supabase
    .from('questions')
    .select('id, content')
    .in('game', ['matematik', 'fen'])
    .eq('is_active', true)
    .range(from2, from2 + PAGE2 - 1)
  if (error) break
  all2.push(...data)
  if (data.length < PAGE2) break
  from2 += PAGE2
}

const dist2 = [0, 0, 0, 0, 0]
for (const q of all2) {
  const a = q.content?.answer
  if (typeof a === 'number' && a >= 0 && a <= 4) dist2[a]++
}
const total2 = dist2.reduce((a, b) => a + b, 0)
const labels = ['A', 'B', 'C', 'D', 'E']
console.log('\nYeni dagilim:')
for (let i = 0; i < 5; i++) {
  const pct = total2 > 0 ? ((dist2[i] / total2) * 100).toFixed(1) : '0.0'
  const bar = '█'.repeat(Math.round(dist2[i] / total2 * 40))
  console.log(`  ${labels[i]}: ${String(dist2[i]).padStart(4)}  (${pct.padStart(5)}%)  ${bar}`)
}

const maxPct = Math.max(...dist2.map(d => (d / total2) * 100))
if (maxPct > 30) console.log(`\n⚠️  Hala sapma var: max %${maxPct.toFixed(1)}`)
else console.log(`\n✅ Dagilim normalize oldu (max %${maxPct.toFixed(1)})`)
