#!/usr/bin/env node
/**
 * JSON → DB import (Max plan üretiminde kullanım)
 * --------------------------------------------------------------
 * Claude (Opus/Sonnet) doğrudan üretip JSON yazdığında, bu script
 * format guard + dedup + insert yapar. Anthropic API çağrısı YOK.
 *
 * JSON formatı (array of questions):
 *   [{ "game", "category", "difficulty", "question", "options",
 *      "answer", "solution", "topic" }, ...]
 *
 * Kullanım:
 *   node database/import-json-to-db.mjs <jsonPath>
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
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

const [, , jsonPath] = process.argv
if (!jsonPath) { console.error('Kullanım: node import-json-to-db.mjs <path>'); process.exit(1) }
const absPath = resolve(jsonPath)
if (!existsSync(absPath)) { console.error('Dosya yok:', absPath); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function trLower(s) {
  return s
    .replace(/I/g, 'ı').replace(/İ/g, 'i')
    .replace(/Ş/g, 'ş').replace(/Ğ/g, 'ğ').replace(/Ü/g, 'ü')
    .replace(/Ç/g, 'ç').replace(/Ö/g, 'ö')
    .toLowerCase()
}

function validate(q) {
  if (typeof q?.question !== 'string' || q.question.length < 10 || q.question.length > 4000) return 'question 10-4000 char'
  if (!Array.isArray(q.options) || q.options.length !== 5) return 'options 5 array'
  for (let i = 0; i < 5; i++)
    if (typeof q.options[i] !== 'string' || q.options[i].length < 1 || q.options[i].length > 600) return `options[${i}] 1-600 char`
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 4) return 'answer 0-4 int'
  if (typeof q.solution !== 'string' || q.solution.length < 5 || q.solution.length > 3000) return 'solution 5-3000 char'
  if (!q.game || !q.category || !Number.isInteger(q.difficulty)) return 'game/category/difficulty eksik'

  // Marker validate sadece Turkce ders icerigi icin (sosyal/turkce/matematik/fen)
  // Wordquest (Ingilizce) icin "fill-in-blank" ve "Choose..." formati standarttir
  if (q.game !== 'wordquest') {
    const endsQ = /\?\s*$/.test(q.question)
    const hasMarker = /(hangisi|nedir|nasıl|ne ad verilir|en uygun|en iyi|en yakın|en doğru|hangi|kaç |yorum)/i.test(q.question)
    if (!endsQ && !hasMarker) return 'soru-cumlesi yok'
  }
  for (const o of q.options) if (/^[A-E]\)\s/.test(o)) return 'options A) prefix YASAK'
  return null
}

const raw = JSON.parse(readFileSync(absPath, 'utf-8'))
let questions
if (Array.isArray(raw)) {
  questions = raw
} else if (Array.isArray(raw.questions)) {
  // Batch shape: top-level game/category/difficulty + questions array (item-only payload)
  const defaults = {}
  if (raw.game) defaults.game = raw.game
  if (raw.category) defaults.category = raw.category
  if (Number.isInteger(raw.difficulty)) defaults.difficulty = raw.difficulty
  questions = raw.questions.map(q => ({ ...defaults, ...q }))
} else {
  questions = []
}
console.log(`JSON yüklendi: ${questions.length} soru`)

// DB-side dedup prefix seti (mevcut tüm sorular)
const existingPrefixes = new Set()
let from = 0
const PAGE = 1000
while (true) {
  const { data, error } = await supabase.from('questions').select('content').range(from, from + PAGE - 1)
  if (error) { console.error('Dedup fetch fail:', error.message); process.exit(2) }
  for (const r of data) {
    const q = r.content?.question
    if (q) existingPrefixes.add(trLower(q.slice(0, 50)))
  }
  if (data.length < PAGE) break
  from += PAGE
}
console.log(`Mevcut prefix seti: ${existingPrefixes.size}`)

const valid = []
const rejected = []
for (let i = 0; i < questions.length; i++) {
  const err = validate(questions[i])
  if (err) { rejected.push({ i, err, q: questions[i].question?.slice(0, 60) }) }
  else valid.push(questions[i])
}
console.log(`Validate: ${valid.length}/${questions.length}`)
if (rejected.length) {
  console.log('Reddedilenler:')
  for (const r of rejected) console.log(`  #${r.i+1} [${r.err}] ${r.q}`)
}

const unique = []
let dupCount = 0
for (const q of valid) {
  const p = trLower(q.question.slice(0, 50))
  if (existingPrefixes.has(p)) { dupCount++ }
  else { existingPrefixes.add(p); unique.push(q) }
}
console.log(`Dedup: ${unique.length} unique, ${dupCount} cakisma`)

if (unique.length === 0) { console.error('0 unique, çıkıyorum'); process.exit(0) }

const insertData = unique.map(q => ({
  game: q.game,
  category: q.category,
  topic: q.topic ?? null,
  difficulty: q.difficulty,
  level_tag: q.level_tag ?? null,
  content: { question: q.question, options: q.options, answer: q.answer, solution: q.solution },
  source: 'ai_claude_v4',
  is_active: false,
}))

const { data: inserted, error } = await supabase.from('questions').insert(insertData).select('id')
if (error) { console.error('Insert error:', error.message); process.exit(4) }
console.log(`\nDB'ye eklendi: ${inserted?.length ?? 0} (source=ai_claude_v4, is_active=false)`)
