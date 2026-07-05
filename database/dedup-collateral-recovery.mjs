#!/usr/bin/env node
/**
 * Dedup collateral-recovery (Codex #260 (A)/(B) + klipper #100479).
 *
 * Orijinal dedup qkey = qtext+options-set (exam_ref YOK, wordquest content.correct
 * YOK). Sonuç: exam_ref-collapse (farklı-sınav aynı-soru birleşti) + wordquest
 * content.correct-divergence yanlış-pasifleme mümkün. Soft-delete olduğu için
 * REVERSIBLE. Bu araç yanlış-pasifleri bulur ve is_active=true geri-alır.
 *
 * node database/dedup-collateral-recovery.mjs           # DRY-RUN
 * node database/dedup-collateral-recovery.mjs --apply    # REACTIVATE
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env.local') })
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lvnmzdowhfzmpkueurih.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')

async function all(game) {
  let out = [], from = 0; const size = 1000
  while (true) {
    const { data } = await s.from('questions').select('id,content,exam_ref,is_active').eq('game', game).range(from, from + size - 1)
    if (!data?.length) break
    out.push(...data); if (data.length < size) break; from += size
  }
  return out
}
const correct = (c) => (c?.options?.[c?.answer] ?? c?.options?.[c?.correct] ?? null)
// DOĞRU dedup anahtarı: soru + şık-seti + exam_ref (+ wordquest content.correct).
// Orijinal dedup bunları içermiyordu -> collapse. Bu anahtarla her alt-grup GERÇEK
// tekil-soru; hiç-aktifi olmayan alt-grup = collapse-kurbanı -> 1 temsilci reactivate.
const ckey = (c, examRef) =>
  (c?.question || c?.sentence || '') + '||' +
  JSON.stringify([...(c?.options || [])].map(String).sort()) + '||' +
  (examRef || 'NULL') + '||' + (String(correct(c)) || '')

const coarse = (c) => (c?.question || c?.sentence || '') + '||' + JSON.stringify([...(c?.options || [])].map(String).sort())
const recover = []      // EXAM-COLLAPSE: aynı-cevap farklı-sınav -> güvenli reactivate
const divergent = []    // ANSWER-DIVERGENCE: farklı-cevap -> MANUEL (benim collateral'ım değil)
for (const g of ['sosyal', 'turkce', 'matematik', 'fen', 'wordquest']) {
  const d = await all(g)
  const byKey = {}
  for (const r of d) (byKey[ckey(r.content, r.exam_ref)] ||= []).push(r)
  for (const [, rows] of Object.entries(byKey)) {
    if (rows.some((x) => x.is_active)) continue
    const row = rows[0]
    // aynı kaba-anahtarlı (soru+şık) AKTİF eşler
    const activeSib = d.filter((x) => x.is_active && coarse(x.content) === coarse(row.content))
    if (!activeSib.length) continue // dedup-öncesi başka-neden pasif -> DOKUNMA
    const rc = String(correct(row.content))
    const examCollapse = activeSib.some((x) => String(correct(x.content)) === rc && (x.exam_ref || 'NULL') !== (row.exam_ref || 'NULL'))
    const item = { id: row.id, game: g, exam: row.exam_ref || 'NULL', q: (row.content?.question || row.content?.sentence || '').slice(0, 45) }
    if (examCollapse) recover.push(item)
    else divergent.push(item) // farklı-cevap: reactivate conflict-getirir, manuel
  }
}

console.log(`Mod: ${APPLY ? 'APPLY (REACTIVATE)' : 'DRY-RUN'}\n`)
console.log(`EXAM-COLLAPSE collateral (reactivate — aynı-cevap farklı-sınav): ${recover.length}`)
for (const r of recover) console.log(`  ${r.game} ${r.id.slice(0, 8)} exam=${r.exam} "${r.q}"`)
console.log(`\nANSWER-DIVERGENCE (MANUEL — farklı-cevap, reactivate ETME, ayrı-iş): ${divergent.length}`)
for (const r of divergent) console.log(`  ${r.game} ${r.id.slice(0, 8)} exam=${r.exam} "${r.q}"`)

if (APPLY && recover.length) {
  const ids = recover.map((r) => r.id)
  const { error } = await s.from('questions').update({ is_active: true }).in('id', ids)
  if (error) { console.error('REACTIVATE HATASI:', error.message); process.exit(1) }
  console.log(`\n✅ ${ids.length} satır REACTIVATE edildi (is_active=true).`)
} else if (!APPLY) {
  console.log('\n(DRY-RUN — --apply ile geri-al)')
}
