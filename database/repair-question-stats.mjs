#!/usr/bin/env node
// disc#1296 istatistik onarimi — DRY-RUN RAPORLAYICI (yazma YAPMAZ).
//
// Onarimin kendisi TEK ATOMIK SQL ile yapilir: database/repair-question-stats.sql
// (PR#264 Codex re-review: satir-satir mutlak-SET canli-sistemde race'liydi +
// order'siz pagination >1000 satirda guvensizdi -> yazma yolu SQL'e tasindi).
// Bu script yalniz: pencereyi dogrular, degisecek sayaclari raporlar ve
// calistirilmaya-hazir SQL'i parametreleri baglanmis halde basar.
//
// Kullanim:
//   node database/repair-question-stats.mjs [--bug-start=<ISO>] [--bug-end=<ISO>]
//
//   --bug-start  bug'li client'in deploy ani (93172c6). Default 2026-04-14T00:00:00Z
//                (gun-basi = o sabahki birkac gecerli cevabin kabul-edilebilir kaybi).
//   --bug-end    fix'in (PR#264) GERCEK deploy ani. Rapor icin verilmezse "now"
//                varsayilir (uyariyla); SQL-apply oncesi GERCEK degeri kullan.
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env.local') })

const arg = (name) => {
  const a = process.argv.find(x => x.startsWith(`--${name}=`))
  return a ? a.split('=').slice(1).join('=') : null
}
const BUG_START = arg('bug-start') || '2026-04-14T00:00:00Z'
const BUG_END = arg('bug-end') || new Date().toISOString()
if (!arg('bug-start')) console.log('UYARI: --bug-start verilmedi, default 2026-04-14T00:00:00Z (gun-basi).')
if (!arg('bug-end')) console.log('UYARI: --bug-end verilmedi, rapor "now" varsayiyor — SQL-apply icin GERCEK deploy zamanini kullan.')

// Uygulamadaki isimlendirmeyle ayni oncelik (src/lib/supabase/service-role.ts).
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE_KEY) {
  console.error('HATA: SUPABASE_SERVICE_KEY (veya legacy SUPABASE_SERVICE_ROLE_KEY) tanimli degil.')
  process.exit(1)
}
const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lvnmzdowhfzmpkueurih.supabase.co',
  SERVICE_KEY,
)

// Deterministik pagination: order('id') SART — order'siz range >1000 satirda
// sayfalar-arasi tutarliligi garanti etmez (Codex bulgusu).
async function fetchAllOrdered(table, columns, filter) {
  const out = []
  let from = 0
  while (true) {
    let q = s.from(table).select(columns).order('id').range(from, from + 999)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) { console.error('FETCH HATASI:', error.message); process.exit(1) }
    if (!data?.length) break
    out.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return out
}

// Guvenilir (pencere-disi) cevaplardan per-soru sayac — prod-parite semantigi
// (migration 022): ta = COUNT(*) SKIP DAHIL; tc = COUNT(*) FILTER is_correct.
const trustedRows = await fetchAllOrdered(
  'session_answers', 'question_id,is_correct,answered_at',
  q => q.or(`answered_at.lt.${BUG_START},answered_at.gte.${BUG_END}`),
)
const trusted = new Map()
for (const r of trustedRows) {
  const c = trusted.get(r.question_id) || { ta: 0, tc: 0 }
  c.ta++; if (r.is_correct) c.tc++
  trusted.set(r.question_id, c)
}

const current = await fetchAllOrdered('questions', 'id,times_answered,times_correct')

let changed = 0, zeroed = 0
for (const cur of current) {
  const t = trusted.get(cur.id) || { ta: 0, tc: 0 }
  if ((cur.times_answered || 0) !== t.ta || (cur.times_correct || 0) !== t.tc) {
    changed++
    if (t.ta === 0) zeroed++
  }
}

console.log(`\nBug penceresi: ${BUG_START} -> ${BUG_END}`)
console.log(`Guvenilir cevap satiri olan soru: ${trusted.size}`)
console.log(`Sayaci degisecek soru: ${changed} (sifirlanacak: ${zeroed})`)

const sql = (await import('node:fs')).readFileSync(join(__dirname, 'repair-question-stats.sql'), 'utf-8')
  .replace(/:BUG_START/g, BUG_START)
  .replace(/:BUG_END/g, BUG_END)
console.log('\n=== CALISTIRILMAYA-HAZIR SQL (Supabase SQL editor / MCP execute_sql) ===\n')
console.log(sql.split('\n').filter(l => !l.startsWith('--')).join('\n').trim())
