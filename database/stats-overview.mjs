#!/usr/bin/env node
/**
 * Genel istatistik tablosu — tum sorular, source bazli, kategori bazli, oturum katkisi
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

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('SUPABASE env yok'); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const PAGE = 1000
const all = []
let from = 0
while (true) {
  const { data, error } = await supabase
    .from('questions')
    .select('id, game, category, difficulty, source, is_active, created_at')
    .range(from, from + PAGE - 1)
  if (error) { console.error(error); process.exit(1) }
  all.push(...data)
  if (data.length < PAGE) break
  from += PAGE
}

console.log(`\n=== GENEL TOPLAM ===`)
console.log(`Toplam soru:           ${all.length}`)
console.log(`Aktif (is_active=true): ${all.filter(q => q.is_active).length}`)
console.log(`Pasif (is_active=false): ${all.filter(q => !q.is_active).length}`)

// Source bazli dagilim
console.log(`\n=== SOURCE BAZLI ===`)
const bySource = {}
for (const q of all) {
  const s = q.source || '(null)'
  if (!bySource[s]) bySource[s] = { total: 0, active: 0 }
  bySource[s].total++
  if (q.is_active) bySource[s].active++
}
const sortedSources = Object.entries(bySource).sort((a, b) => b[1].total - a[1].total)
for (const [s, d] of sortedSources) {
  console.log(`  ${s.padEnd(28)} total=${String(d.total).padStart(5)} active=${String(d.active).padStart(5)}`)
}

// Game/category bazli dagilim (tum sorular)
console.log(`\n=== TUM SORULAR — GAME/CATEGORY ===`)
const byCat = {}
for (const q of all) {
  const k = `${q.game}/${q.category}`
  if (!byCat[k]) byCat[k] = { total: 0, active: 0, by_d: {} }
  byCat[k].total++
  if (q.is_active) byCat[k].active++
  const d = q.difficulty
  byCat[k].by_d[d] = (byCat[k].by_d[d] || 0) + 1
}
for (const k of Object.keys(byCat).sort()) {
  const d = byCat[k]
  const dif = Object.entries(d.by_d).sort().map(([dl, c]) => `d${dl}:${c}`).join(' ')
  console.log(`  ${k.padEnd(28)} total=${String(d.total).padStart(5)} active=${String(d.active).padStart(5)} | ${dif}`)
}

// Sadece ai_claude_v4
console.log(`\n=== ai_claude_v4 — GAME/CATEGORY ===`)
const v4 = all.filter(q => q.source === 'ai_claude_v4')
const byCatV4 = {}
for (const q of v4) {
  const k = `${q.game}/${q.category}`
  if (!byCatV4[k]) byCatV4[k] = { total: 0, active: 0, by_d: {} }
  byCatV4[k].total++
  if (q.is_active) byCatV4[k].active++
  const d = q.difficulty
  byCatV4[k].by_d[d] = (byCatV4[k].by_d[d] || 0) + 1
}
for (const k of Object.keys(byCatV4).sort()) {
  const d = byCatV4[k]
  const dif = Object.entries(d.by_d).sort().map(([dl, c]) => `d${dl}:${c}`).join(' ')
  console.log(`  ${k.padEnd(28)} total=${String(d.total).padStart(5)} active=${String(d.active).padStart(5)} | ${dif}`)
}

// Oturum bazli (created_at ile yaklaşık)
console.log(`\n=== ai_claude_v4 — OTURUM TARIH BAZLI ===`)
const byDate = {}
for (const q of v4) {
  const d = q.created_at.slice(0, 10)
  byDate[d] = (byDate[d] || 0) + 1
}
for (const d of Object.keys(byDate).sort()) {
  console.log(`  ${d}    ${String(byDate[d]).padStart(4)} soru`)
}
