#!/usr/bin/env node
/**
 * Soru bankası DB dedup — çift-seed/re-seed kaynaklı tekrar eden satırları temizler.
 *
 * Grup anahtarı: (game, soru-metni). Her grupta 1 satır TUTULUR, gerisi SİLİNİR.
 * KEEP stratejisi (öncelik sırası):
 *   1. Tek active varsa onu tut (kullanıcıya sunulan).
 *   2. Aksi halde: en çok times_answered (kullanıcı geçmişi), sonra en yeni created_at.
 * DIVERGENCE guard: silinecek satırın doğru-cevap-METNİ veya options'ı tutulan
 * satırdan FARKLIYSA -> grup FLAG'lenir, OTOMATİK SİLİNMEZ (manuel inceleme).
 *
 * node database/dedup-questions.mjs           # DRY-RUN (rapor, silme yok)
 * node database/dedup-questions.mjs --apply    # SİL (destructive!)
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env.local') })
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lvnmzdowhfzmpkueurih.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')

const qtext = (c) => c?.question || c?.sentence || JSON.stringify(c?.dialogue || c || '')
const correctText = (c) => Array.isArray(c?.options) && Number.isInteger(c?.answer) ? c.options[c.answer] : null
// GRUP ANAHTARI = soru-metni + ŞIK-SETİ (sıralı). Böylece yalnız gerçek içerik-
// kopyaları (shuffled dahil) gruplanır; jenerik-gövde ("hangileri doğrudur?")
// farklı-şıklı DISTINCT sorular AYRI kalır (yanlış-silme önlenir).
const qkey = (c) => qtext(c) + '||' + JSON.stringify([...(c?.options || [])].map(String).sort())

function pickKeep(rows) {
  const active = rows.filter((r) => r.is_active)
  const pool = active.length === 1 ? active : (active.length ? active : rows)
  return [...pool].sort((a, b) =>
    (b.times_answered || 0) - (a.times_answered || 0) ||
    String(b.created_at).localeCompare(String(a.created_at)))[0]
}

let groups = 0, toDelete = 0, diverge = 0, delActive = 0
const divergeList = []
const delIds = []

for (const game of ['matematik', 'fen', 'turkce', 'sosyal', 'wordquest']) {
  const { data } = await s.from('questions').select('id, content, is_active, times_answered, created_at').eq('game', game)
  const byQ = {}
  for (const r of data || []) (byQ[qkey(r.content)] ||= []).push(r)
  for (const [q, rows] of Object.entries(byQ)) {
    if (rows.length < 2) continue
    groups++
    const keep = pickKeep(rows)
    const keepCorrect = correctText(keep.content)
    const others = rows.filter((r) => r.id !== keep.id)
    // divergence: SADECE doğru-cevap-METNİ farklıysa (şık-sırası önemsiz —
    // shuffled-kopya aynı doğru cevabı korur, dedup güvenli). Farklı doğru-metin
    // = gerçek çatışma (biri yanlış-cevaplı versiyon olabilir) -> manuel.
    const div = others.some((r) => correctText(r.content) !== keepCorrect)
    if (div) {
      diverge++
      divergeList.push({ game, q: q.slice(0, 55), keep: `${keep.id.slice(0, 8)}(a=${keep.is_active},"${keepCorrect}")`, others: others.map((r) => `${r.id.slice(0, 8)}(a=${r.is_active},"${correctText(r.content)}")`) })
      continue // OTOMATİK SİLME
    }
    for (const r of others) { delIds.push(r.id); toDelete++; if (r.is_active) delActive++ }
  }
}

console.log(`Mod: ${APPLY ? 'APPLY (SİL)' : 'DRY-RUN'}\n`)
console.log(`Çift-grup: ${groups}`)
console.log(`SİLİNECEK (güvenli, aynı-cevap/aynı-şık): ${toDelete} satır (${delActive} active)`)
console.log(`DIVERGENT (FLAG, otomatik silinmez): ${diverge} grup`)
if (divergeList.length) {
  console.log('\n── DIVERGENT gruplar (manuel inceleme) ──')
  for (const d of divergeList.slice(0, 25)) console.log(`  [${d.game}] "${d.q}" keep=${d.keep} vs ${d.others.join(', ')}`)
  if (divergeList.length > 25) console.log(`  ... +${divergeList.length - 25} daha`)
}

if (APPLY && delIds.length) {
  // SOFT-DELETE (is_active=false): hard-delete session_answers FK'ya takılır
  // (cevaplanmış sorular) + geri-alınamaz. Soft-delete GERİ-ALINABILIR, FK-sorunsuz,
  // veri-kaybısız; dedup amacını (çift-görünme) karşılar. keep her zaman active
  // (pickKeep active-öncelik) -> her grupta 1 active kalır.
  const B = 100; let done = 0
  for (let i = 0; i < delIds.length; i += B) {
    const { error } = await s.from('questions').update({ is_active: false }).in('id', delIds.slice(i, i + B))
    if (error) { console.error('UPDATE HATASI:', error.message); break }
    done += Math.min(B, delIds.length - i)
  }
  console.log(`✅ ${done} redundant kopya PASİFLEŞTİRİLDİ (is_active=false, geri-alınabilir).`)
} else if (!APPLY) {
  console.log(`\n(DRY-RUN — --apply ile sil)`)
}
