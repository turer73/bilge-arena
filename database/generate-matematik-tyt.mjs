/**
 * TYT seviyesinde matematik soruları üretir.
 * Hedef: kelime problemleri, uygulamalı geometri, mantık — mekanik hesap değil.
 *
 * Kullanım: node --env-file=.env.local database/generate-matematik-tyt.mjs
 */

import { writeFileSync } from 'node:fs'
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

// ── Üretim planı ──────────────────────────────────────────────────────────────
// TYT'de ağırlıklı konular: problemler, geometri, sayılar
const PLAN = [
  { category: 'problemler', topic: 'Yaş Problemleri',          count: 8 },
  { category: 'problemler', topic: 'Hız-Yol-Zaman Problemleri',count: 8 },
  { category: 'problemler', topic: 'Havuz ve İşçi Problemleri',count: 7 },
  { category: 'problemler', topic: 'Karışım ve Oran Problemleri',count: 7 },
  { category: 'problemler', topic: 'Kar-Zarar ve Yüzdeler',    count: 7 },
  { category: 'geometri',   topic: 'Üçgenler ve Benzerlik',    count: 8 },
  { category: 'geometri',   topic: 'Çember ve Daire Hesapları',count: 7 },
  { category: 'geometri',   topic: 'Alan ve Çevre Problemleri',count: 7 },
  { category: 'sayilar',    topic: 'Bölünebilme ve EBOB-EKOK', count: 7 },
  { category: 'sayilar',    topic: 'Sayı Örüntüleri ve Diziler',count: 6 },
  { category: 'olasilik',   topic: 'Permütasyon ve Kombinasyon',count: 6 },
  { category: 'olasilik',   topic: 'Temel Olasılık',           count: 6 },
]

const SYSTEM_PROMPT = `Sen TYT (Temel Yeterlilik Testi) Matematik sorusu üreticisisin.

TEMEL KURAL: "x + 5 = 12'de x kaçtır?", "eşkenar üçgenin alanı formülü nedir?" gibi MEKANIK HESAP / FORMÜL EZBER soruları KESİNLİKLE YAZMA.

TYT MATEMATİK soruları ŞÖYLE olur:
- Bir SENARYO verir: "Ahmet'in yaşı, kardeşinin yaşının 3 katıdır. 5 yıl sonra..."
- Tablo/liste verir: "Aşağıdaki verilerden hangisi..."
- İki koşulu birden kullanır: "hem ... hem de ... olan sayı"
- Uygulamalı geometri: "Bahçenin çevresini çitlemek için..."
- Mantıksal çıkarım: "Toplam kaç farklı yol vardır?"

ÇOK SEÇENEKLI (A-E), 1 doğru cevap.
JSON çıktısı (başka hiçbir şey yazma):
[{
  "question": "Senaryo ve soru (tek paragraf, açık ve net)",
  "options": ["sayısal A", "sayısal B", "sayısal C", "sayısal D", "sayısal E"],
  "answer": 0,
  "solution": "Adım adım Türkçe çözüm (kısa, 2-4 satır)",
  "topic": "konu adı",
  "difficulty": 3
}]

Seçenekler MUTLAKA sayısal veya kısa ifade olsun (uzun cümle değil). Tüm metinler Türkçe.`

async function generate(category, topic, count) {
  const userPrompt = `${topic} konusunda ${count} adet TYT matematik sorusu üret.
Kategori: ${category}
Her soru gerçekçi bir senaryo içersin, mekanik hesap olmasın.`

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.65, maxOutputTokens: 65536, responseMimeType: 'application/json' },
    }),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Boş yanıt')

  let parsed
  try { parsed = JSON.parse(text) } catch {
    const m = text.match(/\[[\s\S]*\]/)
    if (m) try { parsed = JSON.parse(m[0].replace(/,\s*([}\]])/g, '$1')) } catch { parsed = [] }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('JSON array yok')
  return parsed
}

const TRIVIAL_PATTERNS = [
  /^\s*[x-z]\s+kaçtır\?$/i,           // "x kaçtır?" tek değişken → trivial
  /birimi (nedir|hangisidir)/i,
  /formülü (nedir|hangisidir)/i,
  /\d+\s*[\+\-\*\/]\s*\d+\s*=\s*\?/,  // "3 + 5 = ?"
]

function validate(q) {
  if (!q.question || q.question.length < 30) return 'soru çok kısa'
  if (!Array.isArray(q.options) || q.options.length !== 5) return 'options 5 değil'
  if (typeof q.answer !== 'number' || q.answer < 0 || q.answer > 4) return 'answer geçersiz'
  if (!q.solution || q.solution.length < 20) return 'solution eksik'
  // Trivial kontrol
  if (TRIVIAL_PATTERNS.some(p => p.test(q.question.trim()))) return 'trivial soru'
  // Senaryo kontrolü — soru çok kısaysa muhtemelen sadece denklem
  if (q.question.split(' ').length < 10) return 'senaryo yok (çok kısa)'
  return null
}

async function main() {
  let totalGenerated = 0, totalValid = 0, totalInserted = 0
  const byCat = {}

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

    const valid = questions.filter(q => !validate(q))
    const filtered = questions.length - valid.length
    totalValid += valid.length
    console.log(`  Üretilen: ${questions.length}, Geçerli: ${valid.length}${filtered > 0 ? `, Filtrelenen: ${filtered}` : ''}`)

    if (valid.length === 0) continue

    const insertData = valid.map(q => ({
      game: 'matematik',
      category,
      topic: q.topic || topic,
      difficulty: typeof q.difficulty === 'number' ? q.difficulty : 3,
      content: { question: q.question, options: q.options, answer: q.answer, solution: q.solution },
      source: 'ai_gemini_tyt',
      is_active: false,
    }))

    const { data, error } = await supabase.from('questions').insert(insertData).select('id')
    if (error) {
      console.error(`  DB hata: ${error.message}`)
    } else {
      totalInserted += data.length
      byCat[category] = (byCat[category] || 0) + data.length
      console.log(`  ✓ Eklendi: ${data.length}`)
    }

    await new Promise(r => setTimeout(r, 1200))
  }

  console.log('\n═══════════════════════════════')
  console.log(`Üretilen : ${totalGenerated}`)
  console.log(`Geçerli  : ${totalValid}`)
  console.log(`Eklenen  : ${totalInserted} (is_active=false)`)
  Object.entries(byCat).forEach(([c, n]) => console.log(`  ${c}: ${n}`))

  writeFileSync(resolve(__dir, '_matematik-tyt-log.json'),
    JSON.stringify({ date: new Date().toISOString(), totalInserted, byCat }, null, 2))
  console.log('\nSonraki: kalite sample → aktive et')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
