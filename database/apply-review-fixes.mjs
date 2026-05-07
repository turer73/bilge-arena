#!/usr/bin/env node
/**
 * Klipper Claude'un dondurdugu OUTPUT_REVIEW.json'u DB'ye uygula.
 *
 * Input format (her satir):
 *   { id: "<uuid>", verdict: "bug" | "false_positive" | "ambiguous",
 *     suggested_action: "fix_answer:N" | "fix_solution" | "deactivate" | "fix_question" | "no_action",
 *     reasoning: "<tr>" }
 *
 * Aksiyonlar:
 *   - fix_answer:N -> content.answer = N
 *   - deactivate -> is_active = false
 *   - fix_solution / fix_question -> manuel (admin queue, sadece logla)
 *   - false_positive / no_action -> hicbir sey yapma
 *   - ambiguous -> admin queue (sadece logla)
 *
 * Mode:
 *   --dry-run (default): planla yaz, UPDATE yapma
 *   --apply: gercek UPDATE
 *   --input <path> (default: database/OUTPUT_REVIEW.json)
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.local')
if (existsSync(envPath)) {
  const txt = readFileSync(envPath, 'utf-8')
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
  }
}

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const inputArg = args.indexOf('--input')
const INPUT = inputArg >= 0 ? args[inputArg + 1] : join(__dirname, 'OUTPUT_REVIEW.json')

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('SUPABASE env yok'); process.exit(1) }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

if (!existsSync(INPUT)) {
  console.error(`Input dosyasi yok: ${INPUT}`)
  console.error(`Klipper'dan: scp klipperos@100.113.153.62:/tmp/bilge-arena-review/OUTPUT_REVIEW.json ${INPUT}`)
  process.exit(1)
}

const reviews = JSON.parse(readFileSync(INPUT, 'utf-8'))
console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
console.log(`Toplam karar: ${reviews.length}`)

// Tally
const tally = { bug: 0, false_positive: 0, ambiguous: 0, other: 0 }
const actions = { fix_answer: [], deactivate: [], manual_queue: [], no_action: [] }

for (const r of reviews) {
  tally[r.verdict] = (tally[r.verdict] || 0) + 1
  if (r.verdict === 'bug') {
    if (r.suggested_action?.startsWith('fix_answer:')) {
      const idx = parseInt(r.suggested_action.split(':')[1], 10)
      actions.fix_answer.push({ id: r.id, newAnswer: idx, reason: r.reasoning })
    } else if (r.suggested_action === 'deactivate') {
      actions.deactivate.push({ id: r.id, reason: r.reasoning })
    } else {
      actions.manual_queue.push({ id: r.id, action: r.suggested_action, reason: r.reasoning })
    }
  } else {
    actions.no_action.push({ id: r.id, verdict: r.verdict, reason: r.reasoning })
  }
}

console.log('\n=== VERDICT TALLY ===')
for (const [k, v] of Object.entries(tally)) console.log(`  ${k}: ${v}`)
console.log('\n=== AKSIYONLAR ===')
console.log(`  fix_answer: ${actions.fix_answer.length}`)
console.log(`  deactivate: ${actions.deactivate.length}`)
console.log(`  manual_queue: ${actions.manual_queue.length}`)
console.log(`  no_action: ${actions.no_action.length}`)

if (!APPLY) {
  console.log('\n--- DRY-RUN: Yapilacak fix_answer ornekleri (ilk 5) ---')
  actions.fix_answer.slice(0, 5).forEach(a => console.log(`  ${a.id}: answer -> ${a.newAnswer}  (${a.reason.slice(0, 80)})`))
  console.log('\n--- Yapilacak deactivate ornekleri (ilk 5) ---')
  actions.deactivate.slice(0, 5).forEach(a => console.log(`  ${a.id}  (${a.reason.slice(0, 80)})`))
  process.exit(0)
}

// APPLY
console.log('\n=== APPLY ===')
let okCount = 0, failCount = 0
const failed = []

// fix_answer batch
for (const a of actions.fix_answer) {
  // Tek soruda answer index degisikligi
  const { data: cur, error: e1 } = await supabase.from('questions').select('content').eq('id', a.id).single()
  if (e1 || !cur) { failed.push({ id: a.id, error: 'fetch failed' }); failCount++; continue }
  const newContent = { ...cur.content, answer: a.newAnswer }
  const { error: e2 } = await supabase.from('questions').update({ content: newContent }).eq('id', a.id)
  if (e2) { failed.push({ id: a.id, error: e2.message }); failCount++ }
  else okCount++
  await new Promise(r => setTimeout(r, 50))
}
console.log(`fix_answer: ${okCount} OK, ${failCount} FAIL`)

// deactivate batch
let deactOk = 0, deactFail = 0
for (const a of actions.deactivate) {
  const { error } = await supabase.from('questions').update({ is_active: false }).eq('id', a.id)
  if (error) { failed.push({ id: a.id, error: error.message }); deactFail++ }
  else deactOk++
  await new Promise(r => setTimeout(r, 50))
}
console.log(`deactivate: ${deactOk} OK, ${deactFail} FAIL`)

// manual_queue: sadece dosyaya yaz
const queuePath = join(__dirname, 'apply-review-manual-queue.json')
writeFileSync(queuePath, JSON.stringify(actions.manual_queue, null, 2))
console.log(`manual_queue (${actions.manual_queue.length}): ${queuePath}`)

if (failed.length > 0) {
  console.log('\n=== FAILED ===')
  failed.forEach(f => console.log(`  ${f.id}: ${f.error}`))
}

console.log('\nTamam. Audit trail icin OUTPUT_REVIEW.json saklanmali.')

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  // No-op, top-level await zaten bitti
}
