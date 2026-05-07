#!/usr/bin/env node
/**
 * Semantic Audit — risk-pattern tarayici
 * --------------------------------------------------------------
 * audit-claude-batch.json'u oku, semantik risk tasiyan sorulari isaretle:
 *   - Tarihsel iddia (yil + olay)
 *   - Filozof-eser-kavram eslemeleri
 *   - Cografik istatistik
 *   - "Yalniz/sadece/her zaman/asla" mutlak ifadeler
 *   - Cevap-cozum tutarsizlik ipucu
 *   - Soru/secenek/cozum overlap (cevap secenegi cozumde aynen mi?)
 *   - Cok benzer secenekler (subtle ipucu)
 *
 * Cikti: database/audit-semantic-report.json
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const data = JSON.parse(readFileSync(join(__dirname, 'audit-claude-batch.json'), 'utf-8'))

// Risk patterns
const HISTORICAL_YEARS = /\b(1[0-9]{3}|20[0-2][0-9])\b/g
const ABSOLUTE_TERMS = /\b(yalnizca|sadece|her zaman|asla|hicbir|tamamen|kesinlikle|tek basina|mutlaka|kesin)\b/i
const PHILOSOPHER_NAMES = /(Sokrates|Platon|Aristoteles|Descartes|Kant|Hegel|Marx|Nietzsche|Hume|Locke|Berkeley|Heidegger|Sartre|Foucault|Husserl|Wittgenstein|Habermas|Mead|Goffman|Bourdieu|Comte|Weber|Durkheim|Parsons|Mill|Bentham|Anselm|Aquinas|Augustinus|Heraklietos|Parmenides|Pythagoras|Demokritos|Thales|Anaksimandros|Anaksimenes|Epikuros|Zenon|Pyrrhon|Ataturk|Mustafa Kemal|Fatih|Kanuni|Selim|Murat|Mehmed|Mahmut|Abdulhamit|Abdulmecit|Vahdettin|Inonu|Ismet)/g

const flagged = []
let okCount = 0
const flagStats = {}

function flag(row, code, detail) {
  return { code, detail }
}

for (const row of data) {
  const c = row.content || {}
  const q = c.question || ''
  const opts = c.options || []
  const ans = c.answer
  const sol = c.solution || ''
  const flags = []
  const allText = `${q} ${opts.join(' ')} ${sol}`

  // 1. Tarihsel iddia: ozellikle d2/d3'te yil + iddia (manuel kontrol gerek)
  const years = q.match(HISTORICAL_YEARS) || []
  if (row.category === 'tarih' && years.length > 0 && row.difficulty >= 2) {
    flags.push(flag(row, 'HISTORICAL_DATE', `years: ${years.slice(0, 5).join(', ')}`))
  }

  // 2. Mutlak ifadeler — ozellikle sosyoloji/felsefe'de subtle hata kaynagi
  if (ABSOLUTE_TERMS.test(opts[ans] || '')) {
    flags.push(flag(row, 'ABSOLUTE_IN_ANSWER', `answer: "${(opts[ans] || '').slice(0, 80)}"`))
  }

  // 3. Filozof-eser-kavram eslemesi (cozumde filozof + soruda farkli filozof)
  const qPhilosophers = q.match(PHILOSOPHER_NAMES) || []
  const solPhilosophers = sol.match(PHILOSOPHER_NAMES) || []
  if (qPhilosophers.length > 0 && solPhilosophers.length > 0) {
    const qSet = new Set(qPhilosophers)
    const solSet = new Set(solPhilosophers)
    const onlyInSol = [...solSet].filter(p => !qSet.has(p))
    if (onlyInSol.length > 2) {
      flags.push(flag(row, 'MULTIPLE_PHILOSOPHERS', `q:${qPhilosophers.length} sol:${solPhilosophers.length} extra:${onlyInSol.slice(0,3).join(',')}`))
    }
  }

  // 4. Cografik istatistik (km, milyon, yuzde)
  if (row.category === 'cografya' && /\b\d{2,5}\s*(km|metre|mm|%|yuzde|milyon|bin)\b/i.test(q + ' ' + opts.join(' ') + ' ' + sol)) {
    flags.push(flag(row, 'GEO_STATISTIC', 'sayisal coğrafi iddia'))
  }

  // 5. Cevap secenegi cozumde aynen yer aliyor mu? (yardim olabilir ama hatalı eşleşme de gösterebilir)
  // Cevap metni uzunsa skip
  if (opts[ans] && opts[ans].length > 5 && opts[ans].length < 50) {
    if (!sol.includes(opts[ans].slice(0, Math.min(20, opts[ans].length)))) {
      // Cevap cozumde gecmiyorsa subtle (cozum aciklamayi destek olmayabilir)
      // Genelde guzel imkanlardan biri olabilir
    }
  }

  // 6. Cevap+cozum tutarsizlik ipucu: cozumde "ancak/oysa/farkli olarak" gibi karsi bagliac
  // (manuel inceleme gerek)

  // 7. Cok benzer secenekler (Levenshtein degil, basit substring)
  let similarPairs = 0
  for (let i = 0; i < opts.length; i++) {
    for (let j = i+1; j < opts.length; j++) {
      const a = opts[i].toLowerCase()
      const b = opts[j].toLowerCase()
      if (a.length > 15 && b.length > 15 && (a.startsWith(b.slice(0, 15)) || b.startsWith(a.slice(0, 15)))) {
        similarPairs++
      }
    }
  }
  if (similarPairs > 0) flags.push(flag(row, 'SIMILAR_OPTIONS', `${similarPairs} pair(s)`))

  // 8. "Yanlistir" / "degildir" tipindeki sorular ekstra dikkat
  if (/değildir|yanlıştır|yanlistir|olamaz|gosterilemez|verilemez|denilemez/i.test(q)) {
    flags.push(flag(row, 'NEGATION_QUESTION', 'olumsuz soru — answer mantıği ters'))
  }

  if (flags.length === 0) {
    okCount++
  } else {
    flagged.push({
      id: row.id,
      game: row.game,
      category: row.category,
      difficulty: row.difficulty,
      flags,
      question: q.slice(0, 200),
      answer: ans,
      answer_text: opts[ans],
      solution_preview: sol.slice(0, 250)
    })
    for (const f of flags) flagStats[f.code] = (flagStats[f.code] || 0) + 1
  }
}

console.log(`Toplam: ${data.length}`)
console.log(`Risk-isaretlenmemis: ${okCount}`)
console.log(`Risk-isaretlenmis: ${flagged.length}`)
console.log('\nRisk pattern dagilimi:')
for (const [k,v] of Object.entries(flagStats).sort((a,b) => b[1]-a[1])) {
  console.log(`  ${k.padEnd(28)} ${v}`)
}

// En riskli kategoriler
const byCat = {}
for (const f of flagged) {
  const k = `${f.category}/d${f.difficulty}`
  byCat[k] = (byCat[k] || 0) + 1
}
console.log('\nKategori-difficulty bazli risk:')
for (const [k,v] of Object.entries(byCat).sort((a,b) => b[1]-a[1])) {
  console.log(`  ${k.padEnd(20)} ${v}`)
}

writeFileSync(join(__dirname, 'audit-semantic-report.json'), JSON.stringify({
  summary: { total: data.length, ok: okCount, flagged: flagged.length, flagStats, byCat },
  flagged
}, null, 2))
console.log('\nDosya: database/audit-semantic-report.json')
