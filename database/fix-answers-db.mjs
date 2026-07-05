#!/usr/bin/env node
/**
 * Hedefli DB-UPDATE: denetimde bulunan yanlış answer'lar (METİN-BAZLI).
 *
 * KRITIK: DB'de content.options JSON'dan FARKLI SIRADA (karışık) saklanıyor;
 * content.answer doğru şık-METNİNE işaret ediyor. Bu yüzden JSON-index körlemesine
 * uygulanamaz (ilk script bunu denedi, guard sapma yakalayıp durdurdu). Doğru
 * yaklaşım: her satırın KENDİ options'ında doğru-METİN'in index'ini bul.
 *
 * Her soru için CORRECT_TEXT (kod-çözümüyle doğrulanmış doğru cevap metni) verilir.
 * Satır: correctIdx = row.options.indexOf(CORRECT_TEXT).
 *   - metin şıklarda yok -> SKIP+flag (farklı versiyon)
 *   - row.answer == correctIdx -> zaten doğru, SKIP
 *   - aksi -> UPDATE (active + inactive ayrı raporlanır)
 * Çift-satır (double-seed) varsa HEPSİ güncellenir.
 *
 * node database/fix-answers-db.mjs           # DRY-RUN
 * node database/fix-answers-db.mjs --apply    # UPDATE
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env.local') })
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lvnmzdowhfzmpkueurih.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
if (!KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY yok'); process.exit(1) }
const supabase = createClient(URL, KEY)
const APPLY = process.argv.includes('--apply')

// id -> [game, dogru-cevap-METNİ (kod-cozumuyle)]
const Q = {
  fen_f022: ['fen', '200'], fen_f024: ['fen', '420.000'], fen_f075: ['fen', '60'], fen_k031: ['fen', '8'],
  mat_s058: ['matematik', '0,8'], mat_p001: ['matematik', '48'], mat_p010: ['matematik', '1'], mat_p033: ['matematik', '74'],
  mat_p047: ['matematik', '480'], mat_p062: ['matematik', '15'], mat_p064: ['matematik', '42'], mat_p065: ['matematik', '%20'],
  mat_p072: ['matematik', '61'], mat_p077: ['matematik', '5:-1'], mat_g021: ['matematik', '44'], mat_g041: ['matematik', '2:1'],
  mat_g049: ['matematik', '67,5'], tr_d048: ['turkce', '2'],
}
const FILE = { fen: 'tyt_fen.json', matematik: 'tyt_matematik.json', turkce: 'tyt_turkce.json' }
// soru metni JSON'dan (metin degismedi)
const qtext = {}
for (const fn of new Set(Object.values(FILE))) {
  const d = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'soru-bankasi', fn), 'utf-8'))
  for (const [k, v] of Object.entries(d)) if (k !== 'meta' && Array.isArray(v)) for (const q of v) if (q?.id in Q) qtext[q.id] = q.question
}

const R = { fix: [], okAlready: [], skip: [], applied: [] }
console.log(`Mod: ${APPLY ? 'APPLY' : 'DRY-RUN'} | URL: ${URL}\n`)

for (const [id, [game, correctText]] of Object.entries(Q)) {
  const { data, error } = await supabase.from('questions').select('id, content, is_active').eq('game', game).eq('content->>question', qtext[id])
  if (error) { R.skip.push(`${id}: sorgu hatası ${error.message}`); continue }
  if (!data?.length) { R.skip.push(`${id}: DB'de YOK`); continue }
  for (const row of data) {
    const opts = row.content?.options || []
    const correctIdx = opts.indexOf(correctText)
    const tag = `${id}[${row.id.slice(0, 8)},active=${row.is_active}]`
    if (correctIdx < 0) { R.skip.push(`${tag}: doğru-metin "${correctText}" şıklarda YOK — atlandı (opts=${JSON.stringify(opts)})`); continue }
    if (row.content?.answer === correctIdx) { R.okAlready.push(`${tag}: zaten doğru (answer=${correctIdx}="${correctText}")`); continue }
    R.fix.push(`${tag}: answer ${row.content?.answer}("${opts[row.content?.answer]}") -> ${correctIdx}("${correctText}")`)
    if (APPLY) {
      const { error: uErr } = await supabase.from('questions').update({ content: { ...row.content, answer: correctIdx } }).eq('id', row.id)
      if (uErr) R.skip.push(`${tag}: UPDATE hatası ${uErr.message}`)
      else R.applied.push(tag)
    }
  }
}
console.log(`GÜNCELLENECEK (yanlış): ${R.fix.length}`)
for (const x of R.fix) console.log(`  ✗ ${x}`)
console.log(`\nZATEN DOĞRU: ${R.okAlready.length}`)
for (const x of R.okAlready) console.log(`  ✓ ${x}`)
if (R.skip.length) { console.log(`\nATLANDI: ${R.skip.length}`); for (const x of R.skip) console.log(`  - ${x}`) }
if (APPLY) console.log(`\n✅ UPDATE: ${R.applied.length}`)
else console.log(`\n(DRY-RUN — --apply ile uygula)`)
