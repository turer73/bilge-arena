#!/usr/bin/env node
/**
 * Bozuk wordquest sorularini sil — session_answers'a referansli olanlari atla.
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

// 1. session_answers'daki tum question_id'leri al
const PAGE = 1000
const referencedIds = new Set()
let from = 0
while (true) {
  const { data, error } = await supabase
    .from('session_answers')
    .select('question_id')
    .range(from, from + PAGE - 1)
  if (error) { console.error('session_answers FAIL:', error); process.exit(1) }
  for (const r of data) referencedIds.add(r.question_id)
  if (data.length < PAGE) break
  from += PAGE
}
console.log(`session_answers'ta referansli benzersiz soru sayisi: ${referencedIds.size}`)

// 2. Pasif wordquest sorularini al
const candidates = []
from = 0
while (true) {
  const { data, error } = await supabase
    .from('questions')
    .select('id, category, level_tag, source')
    .eq('game', 'wordquest')
    .eq('is_active', false)
    .range(from, from + PAGE - 1)
  if (error) { console.error('questions FAIL:', error); process.exit(1) }
  candidates.push(...data)
  if (data.length < PAGE) break
  from += PAGE
}
console.log(`Pasif wordquest sorular: ${candidates.length}`)

// 3. Referansi olmayanlari ayir
const safeToDelete = candidates.filter(q => !referencedIds.has(q.id))
const referenced = candidates.filter(q => referencedIds.has(q.id))
console.log(`Silinebilir (referanssiz): ${safeToDelete.length}`)
console.log(`Atlanan (referansli): ${referenced.length}`)

// 4. DELETE
const ids = safeToDelete.map(q => q.id)
console.log(`\nDELETE basliyor: ${ids.length} kayit...`)

const CHUNK = 50
let deleted = 0
let failedChunks = 0
for (let i = 0; i < ids.length; i += CHUNK) {
  const batch = ids.slice(i, i + CHUNK)
  const { error } = await supabase.from('questions').delete().in('id', batch)
  if (error) {
    failedChunks++
    console.log(`\nChunk ${Math.floor(i / CHUNK) + 1} FAIL: ${error.message.slice(0, 80)}`)
    // Bireysel deneme
    for (const id of batch) {
      const { error: e2 } = await supabase.from('questions').delete().eq('id', id)
      if (!e2) deleted++
    }
  } else {
    deleted += batch.length
  }
  process.stdout.write(`\r  ${deleted}/${ids.length} (${failedChunks} chunk fail)`)
}
console.log(`\nDELETE tamam: ${deleted} silindi`)

// 5. Dogrulama
const { count: wqRemaining } = await supabase
  .from('questions')
  .select('id', { count: 'exact', head: true })
  .eq('game', 'wordquest')
console.log(`\nSonra: wordquest toplam=${wqRemaining}`)

const { count: wqPasif } = await supabase
  .from('questions')
  .select('id', { count: 'exact', head: true })
  .eq('game', 'wordquest')
  .eq('is_active', false)
console.log(`Sonra: wordquest pasif=${wqPasif}`)

console.log(`\nReferansli oldugu icin atlanan ${referenced.length} soru hala pasif kalir.`)
