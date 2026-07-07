import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
const d = JSON.parse(readFileSync(join(__dirname, 'audit-keybug-candidates.json'), 'utf-8'))

// 1. Zero-accuracy (kesin answer-key-bug)
const zeroAcc = d.filter(x => (x.times_correct || 0) === 0).sort((a,b) => b.times_answered - a.times_answered)
console.log('=== %0 DOGRULUK (kesin answer-key-bug adayi) ===')
console.log(`Toplam: ${zeroAcc.length} soru\n`)
zeroAcc.slice(0, 10).forEach(x => {
  const c = x.content || {}
  console.log(`[${x.game}/${x.category}] ${x.times_answered}x oynanmis, %0 dogru`)
  console.log(`  ID: ${x.id}`)
  console.log(`  S: ${(c.question || c.sentence || '').slice(0, 70)}`)
  console.log(`  Cevap: ${c.answer} | Cozum: ${(c.solution || '').slice(0, 60)}`)
  console.log('')
})

// 2. Category distribution
console.log('\n=== KATEGORI DAGILIMI ===')
const catDist = {}
for (const x of d) {
  const k = `${x.game}/${x.category}`
  catDist[k] = (catDist[k] || 0) + 1
}
for (const [k, v] of Object.entries(catDist).sort((a,b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`)
}

// 3. En cok oynanan 10 soru
console.log('\n=== EN COK OYNANAN 10 ===')
const topPlayed = [...d].sort((a,b) => b.times_answered - a.times_answered).slice(0, 10)
topPlayed.forEach(x => {
  const c = x.content || {}
  const acc = Math.round((x.times_correct / x.times_answered) * 100)
  console.log(`[${x.game}/${x.category}] ${x.times_answered}x oynanmis, %${acc} dogru`)
  console.log(`  ID: ${x.id} | S: ${(c.question || c.sentence || '').slice(0, 65)}`)
  console.log(`  Cevap: ${c.answer} | Cozum: ${(c.solution || '').slice(0, 55)}`)
  console.log('')
})

// 4. Summary
const total = d.length
const turkce = d.filter(x => x.game === 'turkce').length
const sosyal = d.filter(x => x.game === 'sosyal').length
const pct0 = zeroAcc.length
const pctUnder10 = d.filter(x => (x.times_correct / x.times_answered) < 0.10).length

console.log(`\n=== OZET ===`)
console.log(`Toplam aday: ${total} (Turkce: ${turkce}, Sosyal: ${sosyal})`)
console.log(`%%0 dogruluk: ${pct0} soru`)
console.log(`%%10 alti dogruluk: ${pctUnder10} soru`)
console.log(`Bunlardan ilk ${zeroAcc.slice(0, 10).length} tanesi yukarida listelendi`)
