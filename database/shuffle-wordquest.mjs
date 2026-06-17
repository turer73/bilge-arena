import { readFileSync, writeFileSync } from 'node:fs'

const questions = JSON.parse(readFileSync('database/_new-questions-wordquest.json', 'utf-8'))

let seed = 137
function seededRandom() {
  seed = (seed * 1664525 + 1013904223) & 0xffffffff
  return (seed >>> 0) / 0xffffffff
}

// 30 soruda 6x(0,1,2,3,4) = 30 tam
const targets = []
for (let t = 0; t < 6; t++) for (let i = 0; i < 5; i++) targets.push(i)
for (let i = targets.length - 1; i > 0; i--) {
  const j = Math.floor(seededRandom() * (i + 1))
  ;[targets[i], targets[j]] = [targets[j], targets[i]]
}

const letters = ['A', 'B', 'C', 'D', 'E']

const shuffled = questions.map((q, i) => {
  const currentAnswer = q.content.answer
  const targetAnswer = targets[i]
  const options = [...q.content.options]
  const correct = options[currentAnswer]
  options.splice(currentAnswer, 1)
  options.splice(targetAnswer, 0, correct)
  const letter = letters[targetAnswer]
  const solution = q.content.solution.replace(
    /The correct answer is [A-E](\s*[\(\.])/,
    `The correct answer is ${letter}$1`
  )
  return { ...q, content: { ...q.content, options, answer: targetAnswer, solution } }
})

const dist = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }
shuffled.forEach(q => { dist[q.content.answer]++ })
console.log('Yeni dağılım:', JSON.stringify(dist))

writeFileSync('database/_new-questions-wordquest.json', JSON.stringify(shuffled, null, 2), 'utf-8')
console.log('Kaydedildi.')
