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
    .select('id, category, difficulty, level_tag, source, is_active, content, created_at')
    .eq('game', 'wordquest')
    .range(from, from + PAGE - 1)
  if (error) { console.error(error); process.exit(1) }
  all.push(...data)
  if (data.length < PAGE) break
  from += PAGE
}

console.log(`\n=== WORDQUEST TOPLAM: ${all.length} (Aktif: ${all.filter(q => q.is_active).length}, Pasif: ${all.filter(q => !q.is_active).length}) ===\n`)

// Source bazli
console.log('=== Source bazli ===')
const bySource = {}
for (const q of all) {
  const s = q.source || '(null)'
  if (!bySource[s]) bySource[s] = { total: 0, active: 0 }
  bySource[s].total++
  if (q.is_active) bySource[s].active++
}
for (const [s, d] of Object.entries(bySource).sort((a, b) => b[1].total - a[1].total)) {
  console.log(`  ${s.padEnd(28)} total=${String(d.total).padStart(4)} active=${String(d.active).padStart(4)}`)
}

// Category + level_tag bazli
console.log('\n=== Category + level_tag (CEFR) ===')
const byKey = {}
for (const q of all) {
  const k = `${q.category}/${q.level_tag || 'no-level'}`
  if (!byKey[k]) byKey[k] = { total: 0, active: 0, sources: {} }
  byKey[k].total++
  if (q.is_active) byKey[k].active++
  const s = q.source || '(null)'
  byKey[k].sources[s] = (byKey[k].sources[s] || 0) + 1
}
for (const k of Object.keys(byKey).sort()) {
  const d = byKey[k]
  console.log(`  ${k.padEnd(28)} total=${String(d.total).padStart(4)} active=${String(d.active).padStart(4)} | ${Object.entries(d.sources).map(([s,c]) => `${s}:${c}`).join(' ')}`)
}

// Sample 3 pasif soru — kalite kontrol
console.log('\n=== 3 örnek pasif soru ===')
const passive = all.filter(q => !q.is_active)
for (let i = 0; i < Math.min(3, passive.length); i++) {
  const q = passive[Math.floor((i + 1) * passive.length / 4)]
  const c = q.content || {}
  console.log(`---`)
  console.log(`id: ${q.id.slice(0,8)} | ${q.category}/${q.level_tag} | source=${q.source}`)
  console.log(`Q: ${(c.question || c.text || '').slice(0, 200)}`)
  console.log(`opts: ${JSON.stringify(c.options || []).slice(0, 200)}`)
  console.log(`answer: ${c.answer}`)
}
