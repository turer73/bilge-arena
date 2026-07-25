#!/usr/bin/env node
/**
 * AI-üretilen fen sorularını prod'a insert (idempotent, dedup'lı).
 *
 * - external_id = 'gen2026fen-' + question-text-hash (deterministik → re-run idempotent)
 * - source = 'ai-gen-2026' (izlenebilirlik / gerekirse toplu geri-al)
 * - dedup: mevcut fen soru-metni prefix'i + batch-içi + external_id çakışması
 * - 079-guard trigger her INSERT'te doğrular (batch zaten 0-guard-fail)
 *
 * node database/insert-generated-fen.mjs [dosya]            # DRY-RUN
 * node database/insert-generated-fen.mjs [dosya] --apply
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env.local') })
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lvnmzdowhfzmpkueurih.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY)

const APPLY = process.argv.includes('--apply')
const fileArg = process.argv.find((a, i) => i >= 2 && a.endsWith('.json'))
const batchPath = fileArg || join(__dirname, 'generated', 'fen-batch.json')
const batch = JSON.parse(readFileSync(batchPath, 'utf-8'))

const norm = (t) => (t || '').trim().toLowerCase().replace(/\s+/g, ' ')
// external_id varchar(20): 'g26f'(4) + 14-hex = 18 char ≤ 20
const extId = (q) => 'g26f' + createHash('sha1').update(norm(q.question)).digest('hex').slice(0, 14)

// Mevcut fen soru-metni prefix'leri (dedup) — paginated
async function existingPrefixes() {
  const set = new Set(); let from = 0
  while (true) {
    const { data, error } = await s.from('questions').select('content,external_id').eq('game', 'fen').range(from, from + 999)
    if (error) { console.error('FETCH HATASI:', error.message); process.exit(1) }
    if (!data?.length) break
    for (const r of data) { set.add(norm(r.content?.question).slice(0, 50)); if (r.external_id) set.add('EID:' + r.external_id) }
    if (data.length < 1000) break; from += 1000
  }
  return set
}

// Insert-time şık-karıştırma: AI-üretimi doğru cevabı B/C'ye yığma eğiliminde
// (2026-07-25 audit: türkçe 339/349, sosyal 566/484 B/C-yığılması). Kayıt anında
// karıştırarak yeni içerikte dağılımı dengeliyoruz. Fisher-Yates.
function shuffleContentOptions(options, answer) {
  const idx = options.map((_, i) => i)
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return { options: idx.map(i => options[i]), answer: idx.indexOf(answer) }
}

const existing = await existingPrefixes()
const seenBatch = new Set()
const rows = []
let dupExisting = 0, dupBatch = 0
for (const q of batch) {
  const eid = extId(q)
  const pfx = norm(q.question).slice(0, 50)
  if (existing.has(pfx) || existing.has('EID:' + eid)) { dupExisting++; continue }
  if (seenBatch.has(pfx)) { dupBatch++; continue }
  seenBatch.add(pfx)
  // Çözüm metni şık-harfi referanslıyorsa karıştırma metni bozar — o soruda atla.
  const refsLetter = /\b[A-E]\)|se[cç]enek\s+[A-E]\b|[şs][ıi]kk?[ıi]?\s+[A-E]\b|cevap:?\s+[A-E]\b/i.test(q.solution || '')
  const sh = refsLetter ? { options: q.options, answer: q.answer } : shuffleContentOptions(q.options, q.answer)
  rows.push({
    game: 'fen',
    category: q.category,
    subcategory: q._topic || null,
    topic: q._topic || null,
    difficulty: q.difficulty || 2,
    content: { question: q.question, options: sh.options, answer: sh.answer, solution: q.solution },
    external_id: eid,
    source: 'ai-gen-2026',
    exam_ref: 'TYT',
    is_active: true,
  })
}

console.log(`Mod: ${APPLY ? 'APPLY (INSERT)' : 'DRY-RUN'}`)
console.log(`Batch: ${batch.length} | insert-edilecek: ${rows.length} | dedup(mevcut): ${dupExisting} | dedup(batch-içi): ${dupBatch}`)
const byCat = {}; rows.forEach((r) => (byCat[r.category] = (byCat[r.category] || 0) + 1))
console.log('ders-dağılım:', JSON.stringify(byCat))

if (APPLY && rows.length) {
  let inserted = 0
  for (let i = 0; i < rows.length; i += 50) {
    const b = rows.slice(i, i + 50)
    const { data, error } = await s.from('questions').insert(b).select('id')
    if (error) { console.error(`INSERT HATASI (batch ${i}):`, error.message); process.exit(1) } // 079-guard fail dahil
    inserted += data.length
  }
  console.log(`\n✅ ${inserted} fen sorusu INSERT edildi (source=ai-gen-2026).`)
} else if (!APPLY) {
  console.log('\n(DRY-RUN — --apply ile insert)')
}
