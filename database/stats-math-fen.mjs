#!/usr/bin/env node
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

const PAGE = 1000
const all = []
let from = 0
while (true) {
  const { data, error } = await supabase
    .from('questions')
    .select('id, game, category, difficulty, source, is_active, content')
    .in('game', ['matematik', 'fen'])
    .range(from, from + PAGE - 1)
  if (error) { console.error(error); process.exit(1) }
  all.push(...data)
  if (data.length < PAGE) break
  from += PAGE
}

console.log(`\n=== MATEMATIK + FEN TOPLAM: ${all.length} ===\n`)

const byKey = {}
for (const q of all) {
  const k = `${q.game}/${q.category}`
  if (!byKey[k]) byKey[k] = { total: 0, active: 0, sources: {} }
  byKey[k].total++
  if (q.is_active) byKey[k].active++
  byKey[k].sources[q.source || '(null)'] = (byKey[k].sources[q.source || '(null)'] || 0) + 1
}
for (const k of Object.keys(byKey).sort()) {
  const d = byKey[k]
  console.log(`  ${k.padEnd(28)} total=${String(d.total).padStart(4)} active=${String(d.active).padStart(4)} | ${Object.entries(d.sources).map(([s,c]) => `${s}:${c}`).join(' ')}`)
}

// Bozukluk kontrolu
console.log('\n=== Pasif sorular icerik kontrolu ===')
let pasifTotal = 0
let bozukSayisi = 0
let iyiSayisi = 0
for (const q of all) {
  if (q.is_active) continue
  pasifTotal++
  const c = q.content || {}
  const hasQ = (c.question || c.text || '').trim().length > 10
  const hasA = typeof c.answer === 'number'
  const hasOpts = Array.isArray(c.options) && c.options.length === 5
  if (!hasQ || !hasA || !hasOpts) bozukSayisi++
  else iyiSayisi++
}
console.log(`Pasif toplam: ${pasifTotal}`)
console.log(`Bozuk (eksik content): ${bozukSayisi}`)
console.log(`Iyi gorunen (aktive edilebilir): ${iyiSayisi}`)

// Sample pasif sorular - kalite kontrol
console.log('\n=== 5 ornek pasif soru ===')
const passive = all.filter(q => !q.is_active)
const samples = []
for (let i = 0; i < 5 && i < passive.length; i++) {
  samples.push(passive[Math.floor((i + 1) * passive.length / 6)])
}
for (const q of samples) {
  const c = q.content || {}
  console.log(`---`)
  console.log(`id: ${q.id.slice(0, 8)} | ${q.game}/${q.category} d${q.difficulty} | source=${q.source}`)
  console.log(`Q: ${(c.question || c.text || '(BOS)').slice(0, 200)}`)
  console.log(`opts: ${JSON.stringify(c.options || []).slice(0, 200)}`)
  console.log(`answer: ${c.answer}`)
}
