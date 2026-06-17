#!/usr/bin/env node
/**
 * Klipper rewrite-drafts.json'u DB'ye uygula.
 * Input: C:/Users/sevdi/bilge-arena-surer/rewrite-drafts.json (veya --input)
 * Mode: --dry-run (default) | --apply
 *
 * Tip bazli guncelleme:
 *   fix_solution_only   -> sadece content.solution
 *   fix_options / fix_question_params / fix_option_replacement
 *   fix_question_add_* -> question+options+answer+solution
 *
 * Her canonical rewrite, duplicate_ids listesindeki tum satirlara uygulanir.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
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
const INPUT = inputArg >= 0
  ? args[inputArg + 1]
  : 'C:/Users/sevdi/bilge-arena-surer/rewrite-drafts.json'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('SUPABASE env yok'); process.exit(1) }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

if (!existsSync(INPUT)) { console.error(`Input yok: ${INPUT}`); process.exit(1) }
const { rewrites } = JSON.parse(readFileSync(INPUT, 'utf-8'))
console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
console.log(`Unique rewrite: ${rewrites.length}`)
const totalRows = rewrites.reduce((s, r) => s + r.duplicate_ids.length, 0)
console.log(`Toplam DB satiri: ${totalRows}`)

// SOLUTION_ONLY tipi mi kontrol et
const SOLUTION_ONLY = new Set(['fix_solution_only'])

let okCount = 0, skipCount = 0, failCount = 0
const failed = []
const plan = []

for (const rw of rewrites) {
  const solutionOnly = SOLUTION_ONLY.has(rw.type)

  for (const id of rw.duplicate_ids) {
    if (!APPLY) {
      const summary = solutionOnly
        ? `[${rw.type}] ${id.slice(0, 8)}... -> solution only`
        : `[${rw.type}] ${id.slice(0, 8)}... -> q+opts+ans+sol`
      plan.push(summary)
      continue
    }

    // Fetch current content
    const { data, error: fetchErr } = await supabase
      .from('questions')
      .select('id, content')
      .eq('id', id)
      .single()

    if (fetchErr || !data) {
      failed.push({ id, type: rw.type, error: fetchErr?.message || 'not found' })
      failCount++
      continue
    }

    let newContent
    if (solutionOnly) {
      newContent = { ...data.content, solution: rw.new_solution }
    } else {
      newContent = {
        ...data.content,
        question: rw.new_question,
        options: rw.new_options,
        answer: rw.new_marked_answer_index,
        solution: rw.new_solution,
      }
    }

    const { error: updateErr } = await supabase
      .from('questions')
      .update({ content: newContent })
      .eq('id', id)

    if (updateErr) {
      failed.push({ id, type: rw.type, error: updateErr.message })
      failCount++
    } else {
      okCount++
    }

    await new Promise(r => setTimeout(r, 50))
  }
}

if (!APPLY) {
  console.log('\n--- Plan (ilk 20) ---')
  plan.slice(0, 20).forEach(p => console.log(' ', p))
  if (plan.length > 20) console.log(`  ... +${plan.length - 20} more`)
  console.log('\nGercek uygulama icin: node database/apply-rewrites.mjs --apply')
} else {
  console.log(`\nSonuc: ${okCount} OK, ${failCount} FAIL, ${skipCount} skip`)
  if (failed.length > 0) {
    console.log('\nFailed:')
    failed.forEach(f => console.log(`  ${f.id} [${f.type}]: ${f.error}`))
  }
}
