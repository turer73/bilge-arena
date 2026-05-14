/**
 * Sadece roman numeral (I/II/III) formatlı fizik soruları üretir.
 * Gemini'ye çok spesifik format talimatı verilerek validator kısıtlaması kalkar.
 *
 * Kullanım: node --env-file=.env.local database/generate-fizik-roman2.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dir = dirname(fileURLToPath(import.meta.url))

const GEMINI_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY
const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!GEMINI_KEY || !SB_URL || !SB_KEY) { console.error('ENV eksik'); process.exit(1) }

const supabase = createClient(SB_URL, SB_KEY)
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

// ── ÖSYM örnekleri ────────────────────────────────────────────────────────────
const tpl = JSON.parse(readFileSync(resolve(__dir, 'osym-reference/templates/fen_tyt_examples.json'), 'utf8'))
const romanExamples = tpl.examples.filter(e => e.type === 'roman_numeral')

const ROMAN_FEWSHOT = romanExamples.map((e, i) => `
ÖRNEK ${i+1}:
passage: "${e.passage}"
question: "Yukarıdaki ifadelerden hangileri doğrudur?"
options: ${JSON.stringify(e.options)}
answer: ${e.answer}
solution: "...çözüm açıklaması..."
`).join('\n')

// ── Konu listesi (sadece başarısız olanlar) ───────────────────────────────────
const TOPICS = [
  'Kuvvet ve Hareket',
  'Momentum ve İmpuls',
]

// ── Sistem promptu ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Sen TYT (Temel Yeterlilik Testi) Fizik sorusu üreticisisin.

SADECE "Roman Numeral" formatında sorular üreteceksin. Bu format şöyle çalışır:
1. "passage" alanına I, II, III şeklinde numaralandırılmış 3 fizik ifadesi yazılır
2. "question" alanına "Yukarıdaki ifadelerden hangileri doğrudur?" veya benzer soru
3. "options" MUTLAKA şu 5 seçenekten oluşur (sıra değişebilir):
   ["Yalnız I", "Yalnız II", "Yalnız III", "I ve II", "I, II ve III"]
   VEYA başka kombinasyon: ["Yalnız I", "Yalnız III", "I ve II", "II ve III", "I, II ve III"]
   VEYA: ["Yalnız II", "Yalnız III", "I ve II", "I ve III", "II ve III"]
   Ama HER ZAMAN tam olarak 5 roman numeral kombinasyon seçeneği.

GERÇEK SINAVDAN ÖRNEKLER:
${ROMAN_FEWSHOT}

ZORLUK: TYT seviyesi. İfadeler:
- Biri kesinlikle doğru, birkaçı tartışmalı, biri kesinlikle yanlış (ya da tamamı doğru)
- Temel fizik kavramlarını test et, formül ezberi değil
- Günlük hayatla ilişkilendirilmiş ifadeler (yağmur damlası, araç hareketi vb.)
- Resim/grafik gerektirmeyen, sadece metin

JSON ÇIKTI FORMATI (başka hiçbir şey yazma):
[{
  "passage": "I. [birinci ifade]\\nII. [ikinci ifade]\\nIII. [üçüncü ifade]",
  "question": "Yukarıdaki ifadelerden hangileri doğrudur?",
  "options": ["Yalnız I", "Yalnız II", "Yalnız III", "I ve II", "I, II ve III"],
  "answer": 4,
  "solution": "I. doğru çünkü... II. doğru çünkü... III. doğru çünkü... Cevap: I, II ve III",
  "topic": "KONU_ADI"
}]

CRITICAL: options array'i MUTLAKA roman numeral kombinasyonları içermeli. "A seçeneği", "evet/hayır" formatı yasak.`

// ── Gemini çağrısı ────────────────────────────────────────────────────────────
async function generate(topic, count) {
  const userPrompt = `${topic} konusunda ${count} adet roman numeral formatında TYT fizik sorusu üret.
Her soru için passage'daki 3 ifade ${topic} konusuna ait olmalı.`

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 4096, responseMimeType: 'application/json' },
    }),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().then(t => t.slice(0,200))}`)
  const json = await res.json()
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Boş yanıt')

  let parsed
  try { parsed = JSON.parse(text) } catch {
    // Agresif JSON temizleme
    let cleaned = text
    const m = cleaned.match(/\[[\s\S]*\]/)
    if (m) cleaned = m[0]
    cleaned = cleaned
      .replace(/,\s*([}\]])/g, '$1')          // trailing comma
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // control chars
      .replace(/\\n/g, '\\n')                  // normalize escaped newlines
      .replace(/\n/g, '\\n')                   // escape real newlines in values
    try { parsed = JSON.parse(cleaned) } catch {
      // Son çare: her { } bloğunu ayrı parse et
      const blocks = text.match(/\{[\s\S]*?\}(?=\s*[,\]])/g) || []
      parsed = blocks.map(b => { try { return JSON.parse(b) } catch { return null } }).filter(Boolean)
    }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Array bekleniyor veya boş')
  return parsed
}

// ── Validator (roman numeral'a özel) ─────────────────────────────────────────
function validate(q) {
  if (!q.passage || !q.question || !q.solution) return { ok: false, reason: 'eksik alan' }
  if (!Array.isArray(q.options) || q.options.length !== 5) return { ok: false, reason: 'options 5 değil' }
  if (typeof q.answer !== 'number' || q.answer < 0 || q.answer > 4) return { ok: false, reason: 'answer geçersiz' }
  if (q.solution.length < 20) return { ok: false, reason: 'solution çok kısa' }

  // passage'da roman numeral ifadeler olmalı
  if (!/^(I\.|I{1,3}\.)/.test(q.passage.trim()) && !/\nI\./.test(q.passage) && !/\\nI\./.test(q.passage)) {
    return { ok: false, reason: 'passage roman numeral içermiyor' }
  }

  // options roman numeral kombinasyonları içermeli
  const hasRomanOpts = q.options.filter(o => /Yalnız [IVX]/.test(o) || /^[IVX]+ ve [IVX]+/.test(o) || /^I, II ve III/.test(o))
  if (hasRomanOpts.length < 3) return { ok: false, reason: `roman numeral option az: ${hasRomanOpts.length}` }

  return { ok: true }
}

// ── Ana akış ─────────────────────────────────────────────────────────────────
async function main() {
  let totalGenerated = 0, totalValid = 0, totalInserted = 0
  const log = []

  for (const topic of TOPICS) {
    const count = 5  // Her konudan 5 roman numeral soru
    process.stdout.write(`\n── ${topic} ──\n`)

    let questions = []
    try {
      questions = await generate(topic, count)
      totalGenerated += questions.length
    } catch (err) {
      console.error(`  HATA: ${err.message}`)
      continue
    }

    const results = questions.map(q => ({ q, v: validate(q) }))
    const valid = results.filter(r => r.v.ok).map(r => r.q)
    const invalid = results.filter(r => !r.v.ok)

    totalValid += valid.length
    console.log(`  Üretilen: ${questions.length}, Geçerli: ${valid.length}`)
    if (invalid.length > 0) {
      invalid.forEach(r => console.log(`  ✗ ${r.v.reason}`))
    }

    if (valid.length === 0) continue

    // DB'ye ekle
    const insertData = valid.map(q => ({
      game: 'fen',
      category: 'fizik',
      topic: q.topic || topic,
      difficulty: 3,
      content: {
        passage: q.passage,
        question: q.question,
        options: q.options,
        answer: q.answer,
        solution: q.solution,
        type: 'roman_numeral',
      },
      source: 'ai_gemini_tyt',
      is_active: false,
    }))

    const { data, error } = await supabase.from('questions').insert(insertData).select('id')
    if (error) {
      console.error(`  DB hata: ${error.message}`)
    } else {
      totalInserted += data.length
      console.log(`  ✓ DB'ye eklendi: ${data.length}`)
      log.push({ topic, count: data.length, ids: data.map(d => d.id) })
    }

    await new Promise(r => setTimeout(r, 1200))
  }

  console.log('\n═══════════════════════════════')
  console.log(`Üretilen : ${totalGenerated}`)
  console.log(`Geçerli  : ${totalValid}`)
  console.log(`Eklenen  : ${totalInserted} roman numeral soru (is_active=false)`)

  writeFileSync(resolve(__dir, '_fizik-roman2-log.json'), JSON.stringify({ date: new Date().toISOString(), totalInserted, log }, null, 2))
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
