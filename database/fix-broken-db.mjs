#!/usr/bin/env node
/**
 * Broken-soru DB fix: 4 gerçek-broken sorunun content'ini düzeltilmiş JSON ile
 * güncelle. mat_g062 (answer), mat_g057 (opt+answer+sol), mat_p053 (opt+answer),
 * mat_p008 (soru+sol yeniden — ESKİ metinle eşleşir).
 *
 * node database/fix-broken-db.mjs           # DRY-RUN
 * node database/fix-broken-db.mjs --apply    # UPDATE
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env.local') })
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lvnmzdowhfzmpkueurih.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')

// düzeltilmiş JSON içeriğini oku
const mat = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'soru-bankasi', 'tyt_matematik.json'), 'utf-8'))
const byId = {}
for (const [k, v] of Object.entries(mat)) if (k !== 'meta' && Array.isArray(v)) for (const q of v) byId[q.id] = q

// id -> DB'de eşleşme için kullanılacak soru-metni (p008 eski-metin)
const MATCH = {
  mat_g062: byId.mat_g062.question,
  mat_g057: byId.mat_g057.question,
  mat_p053: byId.mat_p053.question,
  mat_p008: 'A bir boşaltma borusunu 3 saatte, B bir dolum borusunu 4 saatte doldurur. Her ikisi aynı anda açılırsa havuz kaç saatte dolar?',
}

for (const [id, matchQ] of Object.entries(MATCH)) {
  const fixed = byId[id]
  const { data, error } = await s.from('questions').select('id, content, is_active').eq('game', 'matematik').eq('content->>question', matchQ)
  if (error) { console.log(`${id}: sorgu hatası ${error.message}`); continue }
  if (!data?.length) { console.log(`${id}: DB'de eşleşme YOK (metin: "${matchQ.slice(0, 40)}...")`); continue }
  for (const row of data) {
    const newContent = { question: fixed.question, options: fixed.options, answer: fixed.answer, solution: fixed.solution }
    console.log(`${id} [${row.id.slice(0, 8)},active=${row.is_active}]: content -> düzeltilmiş (answer=${fixed.answer}="${fixed.options[fixed.answer]}")`)
    if (APPLY) {
      const { error: uErr } = await s.from('questions').update({ content: newContent }).eq('id', row.id)
      if (uErr) console.log(`  UPDATE hatası: ${uErr.message}`)
      else console.log('  ✅ güncellendi')
    }
  }
}
console.log(APPLY ? '\n✅ APPLY tamam' : '\n(DRY-RUN — --apply ile uygula)')
