#!/usr/bin/env node
/**
 * ai_sonnet_v1 source'lu tum pasif sorulari aktif et.
 * Kullanim: node database/activate-sonnet-v1.mjs [game]
 * Ornek: node database/activate-sonnet-v1.mjs sosyal
 *        node database/activate-sonnet-v1.mjs   (tum oyunlar)
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

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const gameFilter = process.argv[2] ?? null

let query = supabase.from('questions').select('id', { count: 'exact', head: true }).eq('source', 'ai_sonnet_v1')
if (gameFilter) query = query.eq('game', gameFilter)
const { count: totalBefore } = await query

let query2 = supabase.from('questions').select('id', { count: 'exact', head: true }).eq('source', 'ai_sonnet_v1').eq('is_active', true)
if (gameFilter) query2 = query2.eq('game', gameFilter)
const { count: activeBefore } = await query2

const scope = gameFilter ? `game=${gameFilter}` : 'tum oyunlar'
console.log(`Önce [${scope}]: ai_sonnet_v1 toplam=${totalBefore}, aktif=${activeBefore}, pasif=${totalBefore - activeBefore}`)

let upd = supabase.from('questions').update({ is_active: true }).eq('source', 'ai_sonnet_v1').eq('is_active', false)
if (gameFilter) upd = upd.eq('game', gameFilter)
const { data, error } = await upd.select('id')

if (error) {
  console.error('UPDATE FAIL:', error)
  process.exit(1)
}

console.log(`UPDATE: ${data.length} soru aktif edildi`)

let query3 = supabase.from('questions').select('id', { count: 'exact', head: true }).eq('source', 'ai_sonnet_v1').eq('is_active', true)
if (gameFilter) query3 = query3.eq('game', gameFilter)
const { count: activeAfter } = await query3

console.log(`Sonra [${scope}]: ai_sonnet_v1 aktif=${activeAfter}`)

const { count: allActive } = await supabase.from('questions').select('id', { count: 'exact', head: true }).eq('is_active', true)
console.log(`Toplam aktif soru (tüm kaynaklar): ${allActive}`)
