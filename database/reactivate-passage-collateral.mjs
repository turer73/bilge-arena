#!/usr/bin/env node
/**
 * Passage-collateral kurtarma (Codex PR#261 P2 + önceki-araç-hatası).
 *
 * deactivate-broken-fen.mjs broken-predicate'i öncülleri YALNIZ content.question'da
 * aradı, content.passage'ı KAÇIRDI. Renderer passage'ı gövdeden önce gösterir; öncüller
 * passage'da + şıklar standart-kombinasyon ("Yalnız I", "I ve II") ise soru GEÇERLİ ve
 * self-contained'dır. Önceki --apply bunları yanlışlıkla deaktive etti → geri al.
 *
 * KEEP-KRİTER (yanlış-pasif = reactivate): pasif + passage'da I&II öncül + 5-şık +
 * answer 0-4 + solution≥5 + TÜM şıklar standart roman-kombinasyon. Bu kriterin dışı
 * (gerçek-broken / farklı-neden-pasif) DOKUNULMAZ.
 *
 * node database/reactivate-passage-collateral.mjs           # DRY-RUN
 * node database/reactivate-passage-collateral.mjs --apply
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local') })
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lvnmzdowhfzmpkueurih.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')

async function all(game) {
  let out = [], from = 0; const size = 1000
  while (true) {
    const { data, error } = await s.from('questions').select('id,content,is_active').eq('game', game).range(from, from + size - 1)
    if (error) { console.error(`FETCH HATASI (${game}):`, error.message); process.exit(1) } // sessiz-fail YOK (Codex P2)
    if (!data?.length) break
    out.push(...data); if (data.length < size) break; from += size
  }
  return out
}

const stdOptRe = /^(yalnız\s+)?(I|II|III|IV|V)(\s*(ve|,)\s*(I|II|III|IV|V))*$/i

const recover = []
for (const game of ['fen', 'matematik', 'turkce', 'sosyal']) {
  for (const r of await all(game)) {
    if (r.is_active) continue
    const c = r.content || {}
    const p = c.passage || ''
    const hasPassagePremises = /(?:^|\n)\s*I\.\s/.test(p) && /(?:^|\n)\s*II\.\s/.test(p)
    if (!hasPassagePremises) continue
    const valid = Array.isArray(c.options) && c.options.length === 5 &&
      /^[0-4]$/.test(String(c.answer)) && (c.solution || '').length >= 5 &&
      c.options.every((o) => stdOptRe.test(String(o).trim()))
    if (valid) recover.push({ id: r.id, game, q: (c.question || '').slice(0, 45) })
  }
}

console.log(`Mod: ${APPLY ? 'APPLY (REACTIVATE)' : 'DRY-RUN'}\n`)
console.log(`Yanlış-pasif passage-collateral (reactivate): ${recover.length}`)
const byGame = {}; recover.forEach((r) => (byGame[r.game] = (byGame[r.game] || 0) + 1))
console.log('ders-dağılım:', JSON.stringify(byGame))

if (APPLY && recover.length) {
  const ids = recover.map((r) => r.id)
  // batch 100'er (Codex-P2 batch-fail sınıfına karşı: her batch error-kontrollü)
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100)
    const { error } = await s.from('questions').update({ is_active: true }).in('id', batch)
    if (error) { console.error(`REACTIVATE HATASI (batch ${i}):`, error.message); process.exit(1) }
  }
  console.log(`\n✅ ${ids.length} satır REACTIVATE edildi.`)
} else if (!APPLY) {
  console.log('\n(DRY-RUN — --apply ile geri-al)')
}
