#!/usr/bin/env node
/**
 * Onceki pasif sorularin gercek durumu — yeni aktive edilen 929 soruyu incele.
 * Bunlar gercekten 'sadece bekleyen iyi sorular' miydi yoksa kalite sorunu var mi?
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
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

// Tum math+fen aktif sorular (bunlardan onceden zaten aktif olan 388+258 ile su an aktif olan 967+608 var)
const PAGE = 1000
const all = []
let from = 0
while (true) {
  const { data, error } = await supabase
    .from('questions')
    .select('id, game, category, source, content, created_at, updated_at')
    .in('game', ['matematik', 'fen'])
    .eq('is_active', true)
    .range(from, from + PAGE - 1)
  if (error) { console.error(error); process.exit(1) }
  all.push(...data)
  if (data.length < PAGE) break
  from += PAGE
}

// updated_at son 24 saat icinde olanlar — bizim aktive ettigimiz
const recent = all.filter(q => {
  const t = new Date(q.updated_at || q.created_at).getTime()
  return Date.now() - t < 24 * 60 * 60 * 1000
})
const old = all.filter(q => {
  const t = new Date(q.updated_at || q.created_at).getTime()
  return Date.now() - t >= 24 * 60 * 60 * 1000
})

console.log(`Toplam aktif math+fen: ${all.length}`)
console.log(`Son 24 saatte aktive (yeni): ${recent.length}`)
console.log(`Eski aktif: ${old.length}`)

// Created_at distribution
console.log('\n=== Yeni aktive olanlarin orijinal created_at dagilimi ===')
const byDate = {}
for (const q of recent) {
  const d = q.created_at.slice(0, 10)
  byDate[d] = (byDate[d] || 0) + 1
}
for (const d of Object.keys(byDate).sort()) {
  console.log(`  ${d}    ${String(byDate[d]).padStart(4)}`)
}

// Source distribution
console.log('\n=== Yeni aktive olanlarin source dagilimi ===')
const bySource = {}
for (const q of recent) {
  bySource[q.source] = (bySource[q.source] || 0) + 1
}
for (const [s, c] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${s.padEnd(28)} ${c}`)
}

// Cevap dagilimi (eger tek bir cevap secenegi cok yogunsa template-soru olabilir)
console.log('\n=== Cevap (a/b/c/d/e index) dagilimi ===')
const ansDist = [0, 0, 0, 0, 0]
for (const q of recent) {
  const a = q.content?.answer
  if (typeof a === 'number' && a >= 0 && a <= 4) ansDist[a]++
}
for (let i = 0; i < 5; i++) {
  console.log(`  ${String.fromCharCode(65 + i)}: ${ansDist[i]}`)
}

// Random 5 sample manuel check
console.log('\n=== 5 Random ornek (yeni aktive) ===')
for (let i = 0; i < 5; i++) {
  const q = recent[Math.floor(Math.random() * recent.length)]
  const c = q.content || {}
  console.log('---')
  console.log(`id: ${q.id.slice(0,8)} | ${q.game}/${q.category} | source=${q.source} | created=${q.created_at.slice(0,10)}`)
  console.log(`Q: ${(c.question || '').slice(0, 200)}`)
  console.log(`opts: ${JSON.stringify(c.options || []).slice(0, 200)}`)
  console.log(`answer: ${c.answer} | solution length: ${(c.solution || '').length}`)
}
