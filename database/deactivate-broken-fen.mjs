#!/usr/bin/env node
/**
 * Fen "jenerik-gövde" broken sorularını DEAKTİVE et (denetim follow-up, disc#1263).
 *
 * Sınıf: "Yukarıdaki ifadelerden hangileri doğrudur?" gövdesi + şıklar roman-rakam
 * kombinasyonu ("Yalnız I", "I ve II"...). Gövdede olması gereken numaralı ifadeler
 * (I/II/III) DB'de stored DEĞİL -> öğrenci neyin doğru olduğunu göremez = ONARILAMAZ
 * (ifadeleri uydurmak soru-cevap tutarsızlığı yaratır). Deaktive = yayından kaldır,
 * silme DEĞİL (is_active=false, geri-alınabilir, session_answers FK korunur).
 * Rewrite (yeni sağlam soru üretimi) AYRI iş.
 *
 * node database/deactivate-broken-fen.mjs           # DRY-RUN
 * node database/deactivate-broken-fen.mjs --apply
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local') })
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lvnmzdowhfzmpkueurih.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')

async function all(game) {
  let out = [], from = 0; const sz = 1000
  while (true) {
    const { data } = await s.from('questions').select('id,content,is_active').eq('game', game).range(from, from + sz - 1)
    if (!data?.length) break; out.push(...data); if (data.length < sz) break; from += sz
  }
  return out
}
function isBroken(r) {
  const q = r.content?.question || ''
  const opts = (r.content?.options || []).join(' | ')
  const refsOutside = /(yukar[ıi]daki|verilen).{0,20}ifade|hangileri/i.test(q)
  const romanAnswers = /\b(I|II|III|IV)\b/.test(opts) && /ve|,|yaln/i.test(opts)
  const hasInlineList = /\b(I{1,3}\.|[1-4]\.|•)/.test(q) || q.length > 200
  return refsOutside && romanAnswers && !hasInlineList
}

const d = await all('fen')
const broken = d.filter(isBroken)
const activeBroken = broken.filter((r) => r.is_active)

console.log(`Mod: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
console.log(`Gerçek-broken toplam: ${broken.length} | aktif (deaktive edilecek): ${activeBroken.length}\n`)
for (const r of activeBroken.slice(0, 6)) console.log(`  ${r.id.slice(0, 8)} "${(r.content.question || '').slice(0, 55)}"`)
if (activeBroken.length > 6) console.log(`  ... +${activeBroken.length - 6} daha`)

if (APPLY && activeBroken.length) {
  const ids = activeBroken.map((r) => r.id)
  const { error } = await s.from('questions').update({ is_active: false }).in('id', ids)
  console.log(error ? `\nHATA: ${error.message}` : `\n✅ ${ids.length} broken soru deaktive edildi (is_active=false).`)
} else if (!APPLY) {
  console.log('\n(DRY-RUN — --apply ile deaktive et)')
}
