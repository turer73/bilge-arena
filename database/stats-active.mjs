#!/usr/bin/env node
/**
 * Aktif soru istatistigi — sadece is_active=true olanlar
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
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const PAGE = 1000
const all = []
let from = 0
while (true) {
  const { data, error } = await supabase
    .from('questions')
    .select('id, game, category, difficulty, source, is_active')
    .eq('is_active', true)
    .range(from, from + PAGE - 1)
  if (error) { console.error(error); process.exit(1) }
  all.push(...data)
  if (data.length < PAGE) break
  from += PAGE
}

console.log(`\n=== TOPLAM AKTIF SORU: ${all.length} ===\n`)

// Game bazli
const byGame = {}
for (const q of all) {
  byGame[q.game] = (byGame[q.game] || 0) + 1
}
console.log('=== OYUN BAZLI ===')
for (const [g, c] of Object.entries(byGame).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${g.padEnd(15)} ${String(c).padStart(5)}`)
}

// Game/category bazli
console.log('\n=== KATEGORI BAZLI (aktif) ===')
const byCat = {}
for (const q of all) {
  const k = `${q.game}/${q.category}`
  if (!byCat[k]) byCat[k] = { total: 0, by_d: {} }
  byCat[k].total++
  byCat[k].by_d[q.difficulty] = (byCat[k].by_d[q.difficulty] || 0) + 1
}
for (const k of Object.keys(byCat).sort()) {
  const d = byCat[k]
  const dif = Object.entries(d.by_d).sort().map(([dl, c]) => `d${dl}:${c}`).join(' ')
  console.log(`  ${k.padEnd(28)} total=${String(d.total).padStart(4)} | ${dif}`)
}

// Source bazli aktif
console.log('\n=== SOURCE BAZLI (aktif) ===')
const bySource = {}
for (const q of all) {
  const s = q.source || '(null)'
  bySource[s] = (bySource[s] || 0) + 1
}
for (const [s, c] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${s.padEnd(24)} ${String(c).padStart(5)}`)
}
