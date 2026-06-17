#!/usr/bin/env node
/**
 * P2 #125 ve #127 icin DB'de sorgu + fix onerisi.
 * Sadece inceleme — DB degisikligi yapmiyor.
 *
 * Kullanim: node database/investigate-p2-content.mjs
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

function printQ(row) {
  const c = row.content
  console.log(`\nID: ${row.id}`)
  console.log(`Aktif: ${row.is_active}  |  Game: ${row.game}  Cat: ${row.category}  Diff: ${row.difficulty}`)
  console.log(`Soru: ${c.question}`)
  ;(c.options ?? []).forEach((o, i) => console.log(`  ${i}) ${o}${i === c.answer ? '  ← CEVAP' : ''}`))
  console.log(`Cozum: ${(c.solution ?? '').slice(0, 150)}`)
}

// ── P2 #125 — 3 tarih hatasi ────────────────────────────────────────────────
// 1) Misak-i Milli multi-correct
// 2) Tanzimat vs Sened-i Ittifak oncelik
// 3) 1924 / halifelik kronoloji

const terms125 = [
  { label: 'Misak-i Milli',     ilike: '%Misak%'              },
  { label: 'Sened-i Ittifak',   ilike: '%Sened%'              },
  { label: '1924 Anayasasi',    ilike: '%1924 Anayasa%'       },
  { label: 'halifelik+1924',    ilike: '%alifelik%'           },
]

console.log('=== P2 #125 — Tarih sorulari ===')
for (const t of terms125) {
  const { data } = await supabase
    .from('questions')
    .select('id, game, category, difficulty, is_active, content')
    .eq('game', 'tarih')
    .eq('is_active', true)
    .ilike('content->>question', t.ilike)
    .limit(5)
  if (!data || data.length === 0) {
    console.log(`\n[${t.label}] Aktif soru bulunamadi.`)
    continue
  }
  console.log(`\n[${t.label}] ${data.length} aktif soru:`)
  data.forEach(printQ)
}

// ── P2 #127 — Garbled sociology stem ────────────────────────────────────────
// "belirli bir donmeyi (cevre) icine alan" bozuk ifade

const terms127 = [
  '%donmeyi%',
  '%cevre%ine alan%',
  '%dönem%ine alan%',
  '%çevre%ine alan%',
]

console.log('\n\n=== P2 #127 — Garbled sosyoloji sorusu ===')
let found127 = false
for (const ilike of terms127) {
  const { data } = await supabase
    .from('questions')
    .select('id, game, category, difficulty, is_active, content')
    .in('game', ['sosyal', 'sosyoloji', 'tarih', 'turkce'])
    .ilike('content->>question', ilike)
    .limit(5)
  if (data && data.length > 0) {
    console.log(`\n[${ilike}] ${data.length} soru:`)
    data.forEach(printQ)
    found127 = true
  }
}
if (!found127) {
  console.log('\nGarbled stem bulunamadi — genis arama deneniyor...')
  // Tum aktif sosyal sorularda "belirli bir" + garbled
  const { data } = await supabase
    .from('questions')
    .select('id, game, category, difficulty, is_active, content')
    .in('category', ['sosyoloji', 'psikoloji', 'felsefe'])
    .eq('is_active', true)
    .ilike('content->>question', '%belirli bir%')
    .limit(20)
  if (data && data.length > 0) {
    console.log(`\n[sosyal+belirli bir] ${data.length} soru — ilk 5:`)
    data.slice(0, 5).forEach(printQ)
  } else {
    console.log('Hicbir eslesen soru bulunamadi.')
  }
}
