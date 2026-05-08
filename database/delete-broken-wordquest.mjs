#!/usr/bin/env node
/**
 * Bozuk wordquest sorulari silme — wordquest game'de pasif (is_active=false)
 * olan tum sorular. 629 soru. Once JSON backup, sonra DELETE.
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

const FORCE = process.argv.includes('--force')

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// 1. Hedef sorulari cek (full content + metadata)
const PAGE = 1000
const target = []
let from = 0
while (true) {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('game', 'wordquest')
    .eq('is_active', false)
    .range(from, from + PAGE - 1)
  if (error) { console.error('FETCH FAIL:', error); process.exit(1) }
  target.push(...data)
  if (data.length < PAGE) break
  from += PAGE
}

console.log(`Hedef: ${target.length} soru (game=wordquest, is_active=false)\n`)

// Bozukluk dogrulamasi — WordQuest 4 farkli icerik semasi var:
//   1. AI-generated / import-json-to-db: { question, options, answer }
//   2. Seed multiple_choice:             { sentence, options, correct }
//   3. Seed cloze_test:                  { type:'cloze_test', passage, questions:[{correct}] }
//   4. Seed dialogue:                    { type:'dialogue', lines, options, correct }
function isValidContent(c) {
  if (!c) return false
  // 1. AI format
  if ((c.question || c.text || '').trim().length > 0 && typeof c.answer === 'number') return true
  // 2. Seed multiple_choice
  if (typeof c.sentence === 'string' && c.sentence.trim().length > 0 &&
      Array.isArray(c.options) &&
      (typeof c.correct === 'number' || typeof c.correct === 'string')) return true
  // 3. Cloze test
  if (c.type === 'cloze_test' && typeof c.passage === 'string' && c.passage.trim().length > 0 &&
      Array.isArray(c.questions) && c.questions.length > 0) return true
  // 4. Dialogue
  if (c.type === 'dialogue' && Array.isArray(c.lines) && c.lines.length > 0 &&
      Array.isArray(c.options) &&
      (typeof c.correct === 'number' || typeof c.correct === 'string')) return true
  return false
}

let brokenCount = 0
let okLooking = 0
for (const q of target) {
  if (isValidContent(q.content)) okLooking++
  else brokenCount++
}
console.log(`Bozuk (tum semalar kontrol edildi): ${brokenCount}`)
console.log(`Icerikli (ama pasif): ${okLooking}`)

if (okLooking > 0) {
  if (!FORCE) {
    console.error(`\nHATA: ${okLooking} soru icerikli ve pasif. Kalite gozden gecirilmeden silme riski.`)
    console.error(`Sadece bozuk sorulari silmek icin once bozuklari elle ayikla.`)
    console.error(`Tum pasif sorulari silmek istiyorsan: --force ile calistir.`)
    process.exit(1)
  }
  console.log(`\nUYARI (--force): ${okLooking} icerikli-ama-pasif soru da silinecek.`)
}

// 2. Backup
const backupPath = join(__dirname, 'backup-wordquest-deleted-2026-05-07.json')
writeFileSync(backupPath, JSON.stringify(target, null, 2))
console.log(`\nBackup yazildi: ${backupPath} (${target.length} soru)`)

// 3. DELETE
const ids = target.map(q => q.id)
console.log(`\nDELETE basliyor: ${ids.length} kayit...`)

// Toplu DELETE - 100'er chunk halinde guvenli
const CHUNK = 100
let deleted = 0
for (let i = 0; i < ids.length; i += CHUNK) {
  const batch = ids.slice(i, i + CHUNK)
  const { error } = await supabase.from('questions').delete().in('id', batch)
  if (error) {
    console.error(`Chunk ${i / CHUNK + 1} FAIL:`, error.message)
    process.exit(1)
  }
  deleted += batch.length
  process.stdout.write(`\r  ${deleted}/${ids.length}`)
}
console.log(`\nDELETE tamam: ${deleted} silindi`)

// 4. Dogrulama
const { count: remainingCount } = await supabase
  .from('questions')
  .select('id', { count: 'exact', head: true })
  .eq('game', 'wordquest')
console.log(`\nSonra: wordquest toplam=${remainingCount}`)

const { count: totalCount } = await supabase
  .from('questions')
  .select('id', { count: 'exact', head: true })
console.log(`Sonra: TUM DB toplam=${totalCount}`)
