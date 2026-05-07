#!/usr/bin/env node
/**
 * ai_claude_v4 source'lu pasif sorulari aktif et.
 * 941 toplam, 324 zaten aktif, 617 pasif -> hepsini aktif yap.
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

// Once durum
const { count: totalBefore } = await supabase
  .from('questions')
  .select('id', { count: 'exact', head: true })
  .eq('source', 'ai_claude_v4')
const { count: activeBefore } = await supabase
  .from('questions')
  .select('id', { count: 'exact', head: true })
  .eq('source', 'ai_claude_v4')
  .eq('is_active', true)

console.log(`Once: ai_claude_v4 toplam=${totalBefore}, aktif=${activeBefore}, pasif=${totalBefore - activeBefore}`)

// UPDATE: pasif olanlari aktif yap
const { data, error } = await supabase
  .from('questions')
  .update({ is_active: true })
  .eq('source', 'ai_claude_v4')
  .eq('is_active', false)
  .select('id')

if (error) {
  console.error('UPDATE FAIL:', error)
  process.exit(1)
}

console.log(`UPDATE: ${data.length} soru aktif edildi`)

// Sonra durum
const { count: activeAfter } = await supabase
  .from('questions')
  .select('id', { count: 'exact', head: true })
  .eq('source', 'ai_claude_v4')
  .eq('is_active', true)

console.log(`Sonra: ai_claude_v4 aktif=${activeAfter}`)

// Tum aktif sorular
const { count: allActive } = await supabase
  .from('questions')
  .select('id', { count: 'exact', head: true })
  .eq('is_active', true)

console.log(`Toplam aktif soru (tum sourcelar): ${allActive}`)
