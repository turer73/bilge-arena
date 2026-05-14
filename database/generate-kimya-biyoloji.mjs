/**
 * TYT seviyesinde kimya ve biyoloji soruları üretir.
 * Trivial "birim/tanım" soruları değil, kavramsal analiz ve uygulama soruları.
 *
 * Kullanım: node --env-file=.env.local database/generate-kimya-biyoloji.mjs
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

// ── ÖSYM biyoloji örnekleri (few-shot) ───────────────────────────────────────
const tpl = JSON.parse(readFileSync(resolve(__dir, 'osym-reference/templates/fen_tyt_examples.json'), 'utf8'))
const BIO_EXAMPLES = tpl.examples.filter(e => e.category === 'biyoloji').slice(0, 3)
const BIO_FEWSHOT = BIO_EXAMPLES.map((e, i) => {
  const q = e.question || e.passage || ''
  const opts = e.options.map((o, j) => `  ${String.fromCharCode(65+j)}) ${o}`).join('\n')
  return `ÖRNEK ${i+1}:\n${q}\n${opts}\nDoğru: ${e.answer_letter}`
}).join('\n\n')

// ── Üretim planı ──────────────────────────────────────────────────────────────
const PLAN = [
  { category: 'kimya', topic: 'Madde Miktarı ve Mol Hesabı', count: 7 },
]

// ── Sistem promptları ─────────────────────────────────────────────────────────
function buildPrompt(category, topic, count) {
  const isBio = category === 'biyoloji'

  const fewshot = isBio ? `\nGERÇEK TYT BİYOLOJİ SORU ÖRNEKLERİ:\n${BIO_FEWSHOT}\n` : ''

  const catRules = isBio ? `
- Hücre, sistem, süreç karşılaştırması yap (Örn: "mitoz ve mayoz arasındaki fark")
- Yanlış ifadeyi bulmak veya doğru olanı seçmek tipinde
- Günlük hayat bağlantısı: hastalık, genetik bozukluk, evrim örneği
- Roman numeral (I/II/III hangileri doğru?) formatında da sorular olsun` : `
- Hesaplama soruları olsun (mol, konsantrasyon, pH, denge)
- Kavramsal karşılaştırma: iyonik vs kovalent, asit vs baz
- Günlük hayat: pil, sabun, asit yağmuru, fotosintez
- Roman numeral (I/II/III hangileri doğru?) formatında da sorular olsun`

  return `Sen TYT (Temel Yeterlilik Testi) ${category === 'kimya' ? 'Kimya' : 'Biyoloji'} sorusu üreticisisin.

KONU: ${topic}
SORU SAYISI: ${count}
ZORLUK: TYT seviyesi — lise 9-12. sınıf, orta-zor

ZORUNLU KURALLAR:
- "Birimi nedir?", "Formülü nedir?", "Kim buldu?" gibi TRIVIAL EZBER sorular KESINLIKLE YASAK
- Her soru bir kavramı, süreci veya ilişkiyi test etmeli
- Seçenekler mantıklı ve ayırt edici olmalı (4 yanlış birbirinden farklı hatalı mantık)
- Resim/grafik/tablo gerektirmeyen, sadece metin bazlı sorular
${catRules}
${fewshot}
JSON ÇIKTI (başka hiçbir şey yazma):
[{
  "question": "soru metni (roman numeral varsa I. II. III. ifadeleri de buraya)",
  "options": ["A seçenek", "B seçenek", "C seçenek", "D seçenek", "E seçenek"],
  "answer": 0,
  "solution": "Türkçe kısa açıklama (1-3 cümle)",
  "topic": "${topic}",
  "type": "roman_numeral veya regular"
}]

KRİTİK: options tam 5 eleman. answer 0-4 arası. solution Türkçe.`
}

// ── Gemini çağrısı ────────────────────────────────────────────────────────────
async function generate(category, topic, count) {
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(category, topic, count) }] }],
      generationConfig: { temperature: 0.65, maxOutputTokens: 6000, responseMimeType: 'application/json' },
    }),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`)
  const json = await res.json()
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Boş yanıt')

  let parsed
  try { parsed = JSON.parse(text) } catch {
    const m = text.match(/\[[\s\S]*\]/)
    if (m) {
      try { parsed = JSON.parse(m[0].replace(/,\s*([}\]])/g, '$1')) } catch {
        const blocks = text.match(/\{[\s\S]*?\}(?=\s*[,\]])/g) || []
        parsed = blocks.map(b => { try { return JSON.parse(b) } catch { return null } }).filter(Boolean)
      }
    }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Geçerli JSON array yok')
  return parsed
}

// ── Doğrulama ─────────────────────────────────────────────────────────────────
const TRIVIAL = [
  /birimi (nedir|hangisidir)/i,
  /formülü (nedir|hangisidir)/i,
  /kim (tarafından|bulunmuştur|keşfetmiştir)/i,
  /sembolü nedir/i,
  /tanımı nedir/i,
  /SI birimi/i,
  /kaç elektronu vardır/i,
]

function validate(q) {
  if (!q.question || q.question.length < 20) return 'soru çok kısa'
  if (!Array.isArray(q.options) || q.options.length !== 5) return 'options 5 değil'
  if (typeof q.answer !== 'number' || q.answer < 0 || q.answer > 4) return 'answer geçersiz'
  if (!q.solution || q.solution.length < 10) return 'solution eksik'
  if (TRIVIAL.some(p => p.test(q.question))) return 'trivial soru'
  return null
}

// ── Ana akış ─────────────────────────────────────────────────────────────────
async function main() {
  let totalGenerated = 0, totalValid = 0, totalInserted = 0
  const byCategory = { kimya: 0, biyoloji: 0 }

  for (const { category, topic, count } of PLAN) {
    process.stdout.write(`\n── ${category}/${topic} (${count}) ──\n`)

    let questions = []
    try {
      questions = await generate(category, topic, count)
      totalGenerated += questions.length
    } catch (err) {
      console.error(`  HATA: ${err.message}`)
      continue
    }

    const valid = questions.filter(q => {
      const err = validate(q)
      return !err
    })
    const filtered = questions.length - valid.length
    totalValid += valid.length
    console.log(`  Üretilen: ${questions.length}, Geçerli: ${valid.length}${filtered > 0 ? `, Filtrelenen: ${filtered}` : ''}`)

    if (valid.length === 0) continue

    const romanCount = valid.filter(q => q.type === 'roman_numeral' ||
      (q.question.includes('I.') && q.options.some(o => /Yalnız [IVX]/.test(o)))).length
    if (romanCount > 0) console.log(`  Roman numeral: ${romanCount}`)

    const insertData = valid.map(q => ({
      game: 'fen',
      category,
      topic: q.topic || topic,
      difficulty: 3,
      content: {
        question: q.question,
        options: q.options,
        answer: q.answer,
        solution: q.solution,
        type: q.type || 'regular',
      },
      source: 'ai_gemini_tyt',
      is_active: false,
    }))

    const { data, error } = await supabase.from('questions').insert(insertData).select('id')
    if (error) {
      console.error(`  DB hata: ${error.message}`)
    } else {
      totalInserted += data.length
      byCategory[category] += data.length
      console.log(`  ✓ Eklendi: ${data.length}`)
    }

    await new Promise(r => setTimeout(r, 1200))
  }

  console.log('\n═══════════════════════════════')
  console.log(`Üretilen : ${totalGenerated}`)
  console.log(`Geçerli  : ${totalValid}`)
  console.log(`Eklenen  : ${totalInserted} (is_active=false)`)
  console.log(`  Kimya   : ${byCategory.kimya}`)
  console.log(`  Biyoloji: ${byCategory.biyoloji}`)

  writeFileSync(resolve(__dir, '_kimya-biyoloji-log.json'),
    JSON.stringify({ date: new Date().toISOString(), totalInserted, byCategory }, null, 2))
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
