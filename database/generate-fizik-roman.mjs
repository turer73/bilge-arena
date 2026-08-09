/**
 * TYT seviyesinde fizik soruları üretir — roman numeral ve ilişki formatına odaklanır.
 * ÖSYM templates'ten few-shot örnekler kullanır.
 * Üretilen sorular is_active=false olarak eklenir, review sonrası aktive edilir.
 *
 * Kullanım: node database/generate-fizik-roman.mjs
 * Env: GOOGLE_GENERATIVE_AI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (.env.local)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const __dir = dirname(fileURLToPath(import.meta.url))

// ── Env ──────────────────────────────────────────────────────────────────────
const GEMINI_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY
const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!GEMINI_KEY || !SB_URL || !SB_KEY) {
  console.error('GOOGLE_GENERATIVE_AI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY gerekli')
  process.exit(1)
}

const supabase = createClient(SB_URL, SB_KEY)
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

// ── ÖSYM few-shot örnekleri ───────────────────────────────────────────────────
const templatePath = resolve(__dir, 'osym-reference/templates/fen_tyt_examples.json')
const templates = JSON.parse(readFileSync(templatePath, 'utf8'))
const FIZIK_EXAMPLES = templates.examples.filter(e => e.category === 'fizik')

// Roman numeral + relation tiplerini al (en değerli format örnekleri)
const ROMAN_EXAMPLES = FIZIK_EXAMPLES.filter(e => e.type === 'roman_numeral')
const RELATION_EXAMPLES = FIZIK_EXAMPLES.filter(e => e.type === 'relation')

function fewShotText(examples) {
  return examples.map((e, i) => {
    const passageOrQ = e.passage || e.question || ''
    const opts = e.options.map((o, j) => `  ${String.fromCharCode(65+j)}) ${o}`).join('\n')
    return `Örnek ${i+1} [${e.type}]:\n${passageOrQ}\n${opts}\nDoğru: ${e.answer_letter} (index=${e.answer})\nKonu: ${e.subcategory}`
  }).join('\n\n')
}

// ── Konu planı ────────────────────────────────────────────────────────────────
// Her konu için kaç soru, hangi ağırlıkta roman_numeral vs regular
const TOPICS = [
  { topic: 'Kuvvet ve Hareket', count: 8, romanRatio: 0.5 },
  { topic: 'Enerji',            count: 8, romanRatio: 0.5 },
  { topic: 'Basınç',            count: 6, romanRatio: 0.4 },
  { topic: 'Elektrik',          count: 6, romanRatio: 0.4 },
  { topic: 'Isı ve Sıcaklık',   count: 6, romanRatio: 0.4 },
  { topic: 'Dalgalar',          count: 5, romanRatio: 0.4 },
  { topic: 'Optik',             count: 5, romanRatio: 0.4 },
  { topic: 'Basit Harmonik Hareket', count: 4, romanRatio: 0.5 },
  { topic: 'Manyetizma',        count: 4, romanRatio: 0.4 },
  { topic: 'Çembersel Hareket', count: 4, romanRatio: 0.5 },
]

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildPrompt(topic, count, romanCount) {
  const regularCount = count - romanCount
  const romanSection = romanCount > 0 ? `
## Roman Numeral Formatı (${romanCount} soru)
"I, II, III" ifadeleri verilen, "hangileri doğrudur/yanlıştır?" tipinde sorular.
Seçenekler MUTLAKA: ["Yalnız I", "Yalnız II", "Yalnız III", "I ve II", "I, II ve III"]
veya: ["Yalnız I", "Yalnız III", "I ve II", "II ve III", "I, II ve III"]
vb. 5 farklı kombinasyon.

ROMAN NUMERAL ÖRNEKLER:
${fewShotText(ROMAN_EXAMPLES)}
` : ''

  const relationSection = RELATION_EXAMPLES.length > 0 ? `
## İlişki/Karşılaştırma Formatı (regular sorulara eklenebilir)
${fewShotText(RELATION_EXAMPLES)}
` : ''

  return `Sen bir YKS TYT Fizik sorusu üreticisisin. TYT seviyesinde, lise 9-12. sınıf müfredatı.

KONU: ${topic}
ZORLUK: TYT seviyesi (kolay-orta, ama "birim nedir?" gibi trivial DEĞIL — kavram ve hesap dengeli)
ÜRETILECEK SORU SAYISI: ${count} (${romanCount} roman numeral + ${regularCount} regular format)
${romanSection}
## Regular Format (${regularCount} soru)
Doğrudan 5 seçenekli çoktan seçmeli. Hesaplamalı, kavramsal veya ilişki tipi olabilir.
${relationSection}

## ÇIKTI KURALLARI
- JSON array döndür, başka hiçbir şey yazma
- Her soru objesi: {"passage": "...", "question": "...", "options": [...], "answer": 0, "solution": "...", "topic": "${topic}", "type": "roman_numeral|relation|regular"}
- "passage": roman numeral veya bağlam metni (varsa), yoksa null
- "question": asıl soru cümlesi
- "options": tam 5 string
- "answer": 0-indexed doğru cevap
- "solution": kısa çözüm açıklaması Türkçe (1-3 cümle)
- TÜM metinler Türkçe
- Fizik sembolleri: F, v, a, m, g, W, P, Q vb. doğru kullan
- Trivial ezber sorular (birim adı, formül adı) YASAK
- Her soru bağımsız olmalı (resim/grafik referansı olmasın)`
}

// ── Gemini API çağrısı ────────────────────────────────────────────────────────
async function generateQuestions(prompt, count) {
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini HTTP ${res.status}: ${err.slice(0, 200)}`)
  }

  const json = await res.json()
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini boş yanıt')

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    const match = text.match(/\[[\s\S]*\]/)
    if (match) parsed = JSON.parse(match[0].replace(/,\s*([}\]])/g, '$1'))
  }

  if (!Array.isArray(parsed)) throw new Error('JSON array bekleniyor')
  return parsed
}

// ── Doğrulama ─────────────────────────────────────────────────────────────────
function validateQuestion(q) {
  if (!q.question || q.question.length < 15) return false
  if (!Array.isArray(q.options) || q.options.length !== 5) return false
  if (typeof q.answer !== 'number' || q.answer < 0 || q.answer > 4) return false
  if (!q.solution || q.solution.length < 10) return false

  // Roman numeral seçenek formatı kontrolü
  if (q.type === 'roman_numeral') {
    const hasRomanOpts = q.options.some(o => /Yalnız [IVX]/.test(o))
    if (!hasRomanOpts) return false
    if (!q.passage || !/[IVX]+\./.test(q.passage)) return false
  }

  // Trivial soru filtresi
  const trivialPatterns = [
    /birim(i|si) (nedir|hangisidir)/i,
    /formül(ü|ü) (nedir|hangisidir)/i,
    /tanım(ı|ı) (nedir|hangisidir)/i,
    /SI birimi/i,
  ]
  if (trivialPatterns.some(p => p.test(q.question))) return false

  return true
}

// ── Ana akış ──────────────────────────────────────────────────────────────────
async function main() {
  const allResults = []
  let totalGenerated = 0
  let totalValid = 0
  let totalInserted = 0

  for (const { topic, count, romanRatio } of TOPICS) {
    const romanCount = Math.round(count * romanRatio)
    const prompt = buildPrompt(topic, count, romanCount)

    console.log(`\n── ${topic} (${count} soru, ${romanCount} roman) ──`)

    let questions = []
    try {
      questions = await generateQuestions(prompt, count)
      totalGenerated += questions.length
      console.log(`  Üretilen: ${questions.length}`)
    } catch (err) {
      console.error(`  HATA: ${err.message}`)
      continue
    }

    // Doğrula
    const valid = questions.filter(validateQuestion)
    totalValid += valid.length
    const invalid = questions.length - valid.length
    if (invalid > 0) console.log(`  Geçersiz (filtre): ${invalid}`)

    // Roman numeral sayısı
    const romanActual = valid.filter(q => q.type === 'roman_numeral').length
    console.log(`  Geçerli: ${valid.length} (roman: ${romanActual})`)

    // DB'ye ekle
    const insertData = valid.map(q => ({
      game: 'fen',
      category: 'fizik',
      topic: q.topic || topic,
      difficulty: 3,
      content: {
        passage: q.passage || null,
        question: q.question,
        options: q.options,
        answer: q.answer,
        solution: q.solution,
        type: q.type || 'regular',
      },
      source: 'ai_gemini_tyt',
      exam_ref: 'TYT',
      is_active: false,
    }))

    if (insertData.length === 0) {
      console.log('  Eklenecek soru yok, atlandı')
      continue
    }

    const { data, error } = await supabase
      .from('questions')
      .insert(insertData)
      .select('id')

    if (error) {
      console.error(`  DB hata: ${error.message}`)
    } else {
      totalInserted += data.length
      console.log(`  DB'ye eklendi: ${data.length} (is_active=false)`)
      allResults.push({ topic, questions: valid })
    }

    // Rate limit için kısa bekleme
    await new Promise(r => setTimeout(r, 1500))
  }

  console.log('\n═══════════════════════════════')
  console.log(`Toplam üretilen : ${totalGenerated}`)
  console.log(`Toplam geçerli  : ${totalValid}`)
  console.log(`DB'ye eklenen   : ${totalInserted} (is_active=false)`)
  console.log('\nSonraki adım: admin panelinde review → aktive et')
  console.log('veya: node database/activate-fizik-review.mjs')

  // Log dosyası
  const logPath = resolve(__dir, '_fizik-roman-generation.json')
  writeFileSync(logPath, JSON.stringify({ date: new Date().toISOString(), totalInserted, topics: allResults }, null, 2))
  console.log(`\nLog: ${logPath}`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
