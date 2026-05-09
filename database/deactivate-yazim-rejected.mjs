#!/usr/bin/env node
/**
 * Denetimde hata tespit edilen yazim_kurallari sorularini deaktive et.
 * Kaynak: database/generated/2026-05-06-yazim-tdk-rejected.json
 *
 * 4 sorun:
 *  - Sayi yazimi: A ve B secenegi her ikisi de TDK-dogru (2 dogru cevap)
 *  - Mademki: dogru yazilmis bitisik hali yanlis olarak isaretliyor
 *  - Birlesik fiil: dogru yazilmis secenegi yanlis olarak isaretliyor
 *  - Duplicate: baska bir soru ile icerik ayni
 *
 * Kullanim:
 *   node database/deactivate-yazim-rejected.mjs [--dry-run]
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

const DRY_RUN = process.argv.includes('--dry-run')

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('SUPABASE env yok'); process.exit(1) }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const rejectedPath = join(__dirname, 'generated', '2026-05-06-yazim-tdk-rejected.json')
if (!existsSync(rejectedPath)) { console.error('Kaynak dosya yok:', rejectedPath); process.exit(1) }

const rejected = JSON.parse(readFileSync(rejectedPath, 'utf-8'))
const ids = (rejected.rejectedItems ?? []).map(r => r.id)

if (ids.length === 0) { console.log('Deaktive edilecek ID yok'); process.exit(0) }

console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`)
console.log(`Deaktive edilecek: ${ids.length} soru`)
for (const r of rejected.rejectedItems ?? []) {
  console.log(`  ${r.id.slice(0, 8)}... d${r.difficulty} — ${r.reason.slice(0, 80)}`)
}

if (DRY_RUN) { console.log('\nDry-run tamamlandi, degisiklik yapilmadi.'); process.exit(0) }

// Once DB'deki mevcut durumu kontrol et
const { data: rows, error: fetchErr } = await supabase
  .from('questions')
  .select('id, is_active')
  .in('id', ids)

if (fetchErr) { console.error('Fetch hatasi:', fetchErr.message); process.exit(1) }

const alreadyInactive = rows?.filter(r => !r.is_active).length ?? 0
const activeRows = rows?.filter(r => r.is_active) ?? []
console.log(`\nMevcut: ${alreadyInactive} zaten pasif, ${activeRows.length} aktif`)

if (activeRows.length === 0) {
  console.log('Aktif soru yok, islem gerekmez.')
  process.exit(0)
}

const { error: updateErr } = await supabase
  .from('questions')
  .update({ is_active: false })
  .in('id', activeRows.map(r => r.id))

if (updateErr) { console.error('Update hatasi:', updateErr.message); process.exit(1) }
console.log(`Deaktive edildi: ${activeRows.length}`)
