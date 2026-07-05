#!/usr/bin/env node
/**
 * 2 turkce answer-divergence sorusu (denetim follow-up, disc#1263/#1264 kalıntısı).
 *
 * (1) 1a3e35d7 "ayakta duramıyorum → hangi anlam": aktif kopya cevabı YANLIŞ
 *     ('Mecaz anlam' idx1); doğru = 'Abartma' idx3 (mübalağa; pasif-kopya solution'ı
 *     da bunu doğruluyor). → answer düzelt + solution ekle. OBJEKTİF.
 * (2) 22f3e4b5 "noktalama yanlış hangisi": aktif kopya idx2, pasif-kopya idx4 —
 *     ikisi de tartışmalı, net tek-doğru YOK (zayıf-tasarım). → DEAKTİVE (yayından
 *     kaldır, silme değil = geri-alınabilir). BELİRSİZ.
 *
 * node database/fix-divergent-turkce.mjs           # DRY-RUN
 * node database/fix-divergent-turkce.mjs --apply
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local') })
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lvnmzdowhfzmpkueurih.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')

// Codex P2: tek-sayfa PostgREST 1000-cap'i hedef-UUID'yi kaçırabilir → pagination.
async function allTurkce() {
  let out = [], from = 0; const sz = 1000
  while (true) {
    const { data, error } = await s.from('questions').select('id,content,is_active').eq('game', 'turkce').range(from, from + sz - 1)
    if (error) { console.error('FETCH HATASI:', error.message); process.exit(1) } // sessiz-fail YOK
    if (!data?.length) break; out.push(...data); if (data.length < sz) break; from += sz
  }
  return out
}
const rows = await allTurkce()
const q1 = rows.find((r) => r.id.startsWith('1a3e35d7'))
const q2 = rows.find((r) => r.id.startsWith('22f3e4b5'))

console.log(`Mod: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`)

// (1) answer düzelt: Abartma (idx3)
if (q1) {
  const opts = q1.content.options || []
  const idx = opts.indexOf('Abartma')
  console.log(`(1) ${q1.id.slice(0, 8)} "${q1.content.question.slice(0, 40)}"`)
  console.log(`    mevcut answer=${q1.content.answer} ("${opts[q1.content.answer]}") -> ${idx} ("Abartma")`)
  if (idx < 0) { console.error('    HATA: Abartma şıkkı bulunamadı, atlaniyor'); }
  else if (APPLY) {
    const newContent = { ...q1.content, answer: idx, solution: "'Ayakta duramıyorum' aşırı yorgunluğu abartarak anlatır; bu mübalağa (abartma) sanatıdır." }
    const { error } = await s.from('questions').update({ content: newContent }).eq('id', q1.id)
    console.log(error ? `    HATA: ${error.message}` : '    ✅ answer düzeltildi')
  }
} else console.log('(1) 1a3e35d7 bulunamadı')

// (2) belirsiz -> deaktive
if (q2) {
  console.log(`\n(2) ${q2.id.slice(0, 8)} "${q2.content.question.slice(0, 40)}" active=${q2.is_active}`)
  console.log('    -> DEAKTİVE (belirsiz, net tek-doğru yok)')
  if (APPLY) {
    const { error } = await s.from('questions').update({ is_active: false }).eq('id', q2.id)
    console.log(error ? `    HATA: ${error.message}` : '    ✅ deaktive edildi')
  }
} else console.log('\n(2) 22f3e4b5 bulunamadı')

if (!APPLY) console.log('\n(DRY-RUN — --apply ile uygula)')
