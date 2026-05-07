#!/usr/bin/env node
/**
 * Matematik + Fen pasif sorulari icerikli olanlari aktif et.
 * 930 pasifden 929 icerikli, 1 bozuk var.
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

// 1. Tum pasif math+fen sorulari cek
const PAGE = 1000
const passive = []
let from = 0
while (true) {
  const { data, error } = await supabase
    .from('questions')
    .select('id, game, category, content')
    .in('game', ['matematik', 'fen'])
    .eq('is_active', false)
    .range(from, from + PAGE - 1)
  if (error) { console.error(error); process.exit(1) }
  passive.push(...data)
  if (data.length < PAGE) break
  from += PAGE
}

console.log(`Pasif matematik+fen: ${passive.length}`)

// 2. Iyi sorulari ayir
const goodIds = []
const badQuestions = []
for (const q of passive) {
  const c = q.content || {}
  const hasQ = (c.question || c.text || '').trim().length > 10
  const hasA = typeof c.answer === 'number'
  const hasOpts = Array.isArray(c.options) && c.options.length === 5
  if (hasQ && hasA && hasOpts) {
    goodIds.push(q.id)
  } else {
    badQuestions.push(q)
  }
}
console.log(`Iyi (aktive edilecek): ${goodIds.length}`)
console.log(`Bozuk (atlanacak): ${badQuestions.length}`)

if (badQuestions.length > 0) {
  console.log('\nBozuk sorular:')
  for (const q of badQuestions) {
    console.log(`  ${q.id.slice(0,8)} | ${q.game}/${q.category}`)
  }
}

// 3. Toplu UPDATE — IN clause limit 100, chunk halinde
const CHUNK = 200
let activated = 0
for (let i = 0; i < goodIds.length; i += CHUNK) {
  const batch = goodIds.slice(i, i + CHUNK)
  const { error } = await supabase
    .from('questions')
    .update({ is_active: true })
    .in('id', batch)
  if (error) { console.error(`Chunk ${i / CHUNK + 1} FAIL:`, error.message); process.exit(1) }
  activated += batch.length
  process.stdout.write(`\r  ${activated}/${goodIds.length}`)
}
console.log(`\nAktive edildi: ${activated}`)

// 4. Yeni durum
const { count: matAktif } = await supabase
  .from('questions')
  .select('id', { count: 'exact', head: true })
  .eq('game', 'matematik')
  .eq('is_active', true)
const { count: fenAktif } = await supabase
  .from('questions')
  .select('id', { count: 'exact', head: true })
  .eq('game', 'fen')
  .eq('is_active', true)
const { count: tumAktif } = await supabase
  .from('questions')
  .select('id', { count: 'exact', head: true })
  .eq('is_active', true)

console.log(`\nYeni durum:`)
console.log(`  matematik aktif: ${matAktif}`)
console.log(`  fen aktif: ${fenAktif}`)
console.log(`  TUM DB aktif: ${tumAktif}`)
