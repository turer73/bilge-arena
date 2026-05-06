#!/usr/bin/env node
/**
 * Audit Validator — semantic+format anomali yakalayıcı
 * --------------------------------------------------------------
 * audit-claude-batch.json'u oku, her soruyu kontrol et:
 *   - format: ? marker, A) prefix, 5 seçenek, cevap aralığı
 *   - semantic-lite: çoklu doğru cevap ipuçları (yanıt seçeneğinde "ve")
 *   - tek-kelime seçenek (kalite indikatörü)
 *
 * Çıktı: database/audit-validate-report.json (id + flags)
 *        Ayrıca sayım özeti konsola.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const data = JSON.parse(readFileSync(join(__dirname, 'audit-claude-batch.json'), 'utf-8'))

const flagged = []
let okCount = 0
const flagStats = {}

for (const row of data) {
  const c = row.content || {}
  const q = c.question || ''
  const opts = c.options || []
  const ans = c.answer
  const sol = c.solution || ''
  const flags = []

  // 1. soru marker (? veya hangi/hangisi/aşağıdaki/kaçtır/ne olur)
  if (!/\?$|hangi|aşağıdaki|kaç\b|nedir\?|nasıl/.test(q)) flags.push('NO_QUESTION_MARKER')

  // 2. A) prefix kalıntısı
  for (const o of opts) {
    if (/^[A-E]\s*[\)\.\:]\s*/i.test(o)) { flags.push('OPTION_PREFIX'); break }
  }

  // 3. 5 seçenek değil
  if (opts.length !== 5) flags.push('OPTIONS_NOT_5')

  // 4. cevap aralığı
  if (typeof ans !== 'number' || ans < 0 || ans > 4) flags.push('ANSWER_OUT_OF_RANGE')

  // 5. boş alan
  if (!q || q.length < 10) flags.push('EMPTY_QUESTION')
  if (!sol || sol.length < 20) flags.push('SHORT_SOLUTION')

  // 6. yanıt seçeneğinde "ve" / "her ikisi" — multi-correct ipucu
  if (typeof ans === 'number' && opts[ans]) {
    const a = opts[ans].toLowerCase()
    if (/\b(ve|hem.*hem|her ikisi|tümü|hepsi)\b/.test(a)) flags.push('MAYBE_MULTI_CORRECT')
  }

  // 7. çok kısa seçenek (tek kelime kalitesi düşük)
  let singleWordCount = 0
  for (const o of opts) {
    if (o.split(/\s+/).length === 1) singleWordCount++
  }
  if (singleWordCount >= 4) flags.push('SINGLE_WORD_OPTIONS')

  // 8. duplicate seçenek (case-insensitive trim)
  const norm = opts.map(o => o.trim().toLowerCase())
  if (new Set(norm).size !== norm.length) flags.push('DUP_OPTION')

  if (flags.length === 0) {
    okCount++
  } else {
    flagged.push({ id: row.id, game: row.game, category: row.category, difficulty: row.difficulty, flags, question: q.slice(0, 90), answer_text: opts[ans] })
    for (const f of flags) flagStats[f] = (flagStats[f] || 0) + 1
  }
}

console.log(`Toplam: ${data.length}`)
console.log(`Format/auto-OK: ${okCount}`)
console.log(`Flagged: ${flagged.length}`)
console.log('\nFlag dağılımı:')
for (const [k,v] of Object.entries(flagStats).sort((a,b) => b[1]-a[1])) {
  console.log(`  ${k.padEnd(24)} ${v}`)
}

writeFileSync(join(__dirname, 'audit-validate-report.json'), JSON.stringify({ summary: { total: data.length, ok: okCount, flagged: flagged.length, flagStats }, flagged }, null, 2))
console.log('\nDosya: database/audit-validate-report.json')
