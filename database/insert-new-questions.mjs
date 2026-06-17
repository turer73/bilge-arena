/**
 * Yeni üretilmiş soruları DB'ye ekler (is_active=false, source=ai_sonnet_v1)
 * Kullanım: node database/insert-new-questions.mjs <json-dosyasi>
 * JSON format: [{ game, category, difficulty, content:{question,options,answer,solution}, ... }]
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.local')
if (existsSync(envPath)) {
  const txt = readFileSync(envPath, 'utf-8')
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('SUPABASE env yok'); process.exit(1) }

const jsonPath = process.argv[2]
if (!jsonPath) { console.error('Kullanım: node insert-new-questions.mjs <json>'); process.exit(1) }
const absPath = resolve(jsonPath)
if (!existsSync(absPath)) { console.error('Dosya yok:', absPath); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const questions = JSON.parse(readFileSync(absPath, 'utf-8'))
console.log(`Yüklenecek: ${questions.length} soru`)

const insertData = questions.map(q => ({
  external_id:  q.external_id ?? null,
  game:         q.game,
  category:     q.category,
  subcategory:  q.subcategory ?? null,
  topic:        q.topic ?? null,
  difficulty:   Number(q.difficulty),
  level_tag:    q.level_tag ?? null,
  content:      q.content,
  is_active:    false,
  is_boss:      false,
  source:       q.source ?? 'ai_sonnet_v1',
  exam_ref:     q.exam_ref ?? null,
}))

const BATCH = 10
let successCount = 0
let failCount = 0

for (let i = 0; i < insertData.length; i += BATCH) {
  const batch = insertData.slice(i, i + BATCH)
  const { data, error } = await supabase.from('questions').insert(batch).select('id')
  if (error) {
    console.error(`Batch ${i}-${i+BATCH} FAIL:`, error.message, error.details ?? '')
    failCount += batch.length
  } else {
    successCount += data?.length ?? 0
    process.stdout.write(`${successCount}/${insertData.length} `)
  }
}

console.log(`\nTamamlandı: ${successCount} eklendi, ${failCount} hata`)
