#!/usr/bin/env node
/**
 * Soru bankası kalite-audit (tüm havuz, spend-gerektirmez).
 * DIAGNOSTIC ONLY: question_validation_decisions yazmaz ve yayin karari degildir.
 *
 * 3 sinyal:
 *  (1) YAPISAL: 5-şık değil / answer 0-4 dışı / solution kısa / öncül-bölünme / dup
 *  (2) PLAY-DATA (answer-key-bug adayı): times_answered ≥ MIN_PLAY ve doğruluk < LOW_ACC
 *      → çok oynanmış ama çok yanlış = cevap-anahtarı hatalı VEYA aşırı-zor/belirsiz
 *  (3) DAĞILIM: ders bazında cevap-şık dengesizliği (bias)
 *
 * node database/quality-audit.mjs [game]     # game verilmezse tüm dersler
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hasSplitPremiseOptions } from '../src/lib/admin/question-content-guard.mjs'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env.local') })
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lvnmzdowhfzmpkueurih.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY)

const MIN_PLAY = 5      // en az bu kadar oynanmış (istatistiksel anlam)
const LOW_ACC = 0.35    // bu oranın altı doğruluk = şüpheli
const games = process.argv[2] ? [process.argv[2]] : ['matematik', 'turkce', 'sosyal', 'fen', 'wordquest']

async function all(game) {
  let out = [], from = 0
  while (true) {
    const { data, error } = await s.from('questions')
      .select('id,category,content,times_answered,times_correct,is_active')
      .eq('game', game).eq('is_active', true).range(from, from + 999)
    if (error) { console.error('FETCH HATASI:', error.message); process.exit(1) }
    if (!data?.length) break
    out.push(...data); if (data.length < 1000) break; from += 1000
  }
  return out
}

const report = {}
for (const game of games) {
  const rows = await all(game)
  let structFail = 0, guardFail = 0, dupCount = 0
  const seen = new Set(); const ad = {}; const keyBugs = []
  for (const r of rows) {
    const c = r.content || {}, o = c.options || []
    const a = (c.answer != null ? c.answer : c.correct)
    if (!Array.isArray(o) || o.length !== 5) structFail++
    if (typeof a !== 'number' || a < 0 || a > 4) structFail++
    // 079-guard ile uyumlu eşik (solution≥5). Önceki 15-char eşik kozmetik-FP üretiyordu
    // (basit sorularda "tan45°=1" gibi kısa-ama-doğru çözümler bug sanılıyordu).
    // wordquest muaf: format sentence+correct, solution alanı hiç yok (2026-07-25 FP-tespiti).
    if (game !== 'wordquest' && (c.solution || '').length < 5) structFail++
    if (hasSplitPremiseOptions(o)) guardFail++
    if (typeof a === 'number') ad[a] = (ad[a] || 0) + 1
    const k = (c.question || c.sentence || '').slice(0, 45).toLowerCase()
    if (seen.has(k)) dupCount++; else seen.add(k)
    // PLAY-DATA: answer-key-bug adayı
    const ta = r.times_answered || 0, tc = r.times_correct || 0
    if (ta >= MIN_PLAY) {
      const acc = tc / ta
      if (acc < LOW_ACC) keyBugs.push({ id: r.id, cat: r.category, acc: Math.round(acc * 100), ta, q: (c.question || c.sentence || '').slice(0, 55) })
    }
  }
  keyBugs.sort((x, y) => y.ta - x.ta) // en-çok-oynanan önce
  const mx = Math.max(...Object.values(ad)), mn = Math.min(...Object.values(ad))
  report[game] = { n: rows.length, structFail, guardFail, dupCount, keyBugs, distBalanced: (mx - mn) <= Math.ceil(rows.length * 0.3), dist: ad }
}

console.log('=== KALİTE-AUDIT RAPORU ===\n')
for (const [g, r] of Object.entries(report)) {
  console.log(`${g.toUpperCase()} (${r.n} aktif):`)
  console.log(`  yapısal-fail: ${r.structFail} | guard-fail: ${r.guardFail} | duplicate: ${r.dupCount} | dağılım: ${r.distBalanced ? 'dengeli' : 'DENGESİZ ' + JSON.stringify(r.dist)}`)
  console.log(`  ANSWER-KEY-BUG adayı (≥${MIN_PLAY} oynanmış, <%${LOW_ACC * 100} doğru): ${r.keyBugs.length}`)
  for (const b of r.keyBugs.slice(0, 5)) console.log(`    [${b.cat}] %${b.acc} doğru (${b.ta}x) "${b.q}"`)
  console.log('')
}
const totalKeyBugs = Object.values(report).reduce((a, r) => a + r.keyBugs.length, 0)
const totalStruct = Object.values(report).reduce((a, r) => a + r.structFail, 0)
console.log(`ÖZET: ${totalStruct} yapısal-fail, ${totalKeyBugs} answer-key-bug adayı (tüm havuz)`)
