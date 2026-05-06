#!/usr/bin/env node
/**
 * Sonnet Üretim Audit
 * --------------------------------------------------------------
 * source=ai_claude_v4 + is_active=false soruları çek, kategori/difficulty
 * grupla, semantic review için JSON dump üret.
 *
 * Çıktı:
 *   database/audit-claude-batch.json — tüm sorular
 *   database/audit-claude-stats.json — özet sayım
 *
 * Kullanım: node database/audit-claude-batch.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
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
    .select('id, game, category, difficulty, level_tag, content, source, is_active, created_at')
    .eq('source', 'ai_claude_v4')
    .order('created_at', { ascending: true })
    .range(from, from + PAGE - 1)
  if (error) { console.error(error); process.exit(1) }
  all.push(...data)
  if (data.length < PAGE) break
  from += PAGE
}

console.log('Toplam ai_claude_v4:', all.length)

const stats = {}
for (const q of all) {
  const k = `${q.game}/${q.category}`
  if (!stats[k]) stats[k] = { total: 0, active: 0, by_difficulty: {} }
  stats[k].total++
  if (q.is_active) stats[k].active++
  const d = q.difficulty
  stats[k].by_difficulty[d] = (stats[k].by_difficulty[d] || 0) + 1
}

console.log('\n=== Kategori Bazlı ===')
for (const k of Object.keys(stats).sort()) {
  const s = stats[k]
  const dif = Object.entries(s.by_difficulty).map(([d,c]) => `d${d}:${c}`).join(' ')
  console.log(`${k.padEnd(28)} total=${s.total} active=${s.active} | ${dif}`)
}

writeFileSync(join(__dirname, 'audit-claude-batch.json'), JSON.stringify(all, null, 2))
writeFileSync(join(__dirname, 'audit-claude-stats.json'), JSON.stringify(stats, null, 2))
console.log('\nDosyalar yazıldı: database/audit-claude-batch.json, audit-claude-stats.json')
