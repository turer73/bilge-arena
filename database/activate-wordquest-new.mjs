#!/usr/bin/env node
/**
 * Yeni eklenen wordquest sorularini aktif et (ai_claude_v4 + is_active=false).
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

// wordquest + ai_claude_v4 + is_active=false olan sorular
const { count: pasifBefore } = await supabase
  .from('questions')
  .select('id', { count: 'exact', head: true })
  .eq('game', 'wordquest')
  .eq('source', 'ai_claude_v4')
  .eq('is_active', false)

console.log(`Aktive edilecek: ${pasifBefore} wordquest sorusu (ai_claude_v4)`)

const { data, error } = await supabase
  .from('questions')
  .update({ is_active: true })
  .eq('game', 'wordquest')
  .eq('source', 'ai_claude_v4')
  .eq('is_active', false)
  .select('id')

if (error) { console.error('UPDATE FAIL:', error); process.exit(1) }
console.log(`Aktive edildi: ${data.length}`)

// Yeni durum
const { count: aktif } = await supabase
  .from('questions')
  .select('id', { count: 'exact', head: true })
  .eq('game', 'wordquest')
  .eq('is_active', true)
console.log(`Yeni wordquest aktif toplam: ${aktif}`)

const { count: tumAktif } = await supabase
  .from('questions')
  .select('id', { count: 'exact', head: true })
  .eq('is_active', true)
console.log(`Tum DB aktif: ${tumAktif}`)
