/**
 * Wordquest eksik kategori ve level boşluklarını doldurur.
 * Hedefler:
 *   dialogue       → 0 soru, tüm seviyeler
 *   phrasal_verbs  → 0 soru, B1-C2
 *   sentence_completion → A1/A2/C2 eksik
 *   cloze_test     → A1/A2/C2 eksik
 *   restatement    → A1/A2/B1/B2/C2 eksik
 *
 * Kullanım: node --env-file=.env.local database/generate-wordquest-gaps.mjs
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

// ── CEFR kılavuzu (route.ts ile senkron) ─────────────────────────────────────
const CEFR = {
  A1: 'A1 — Başlangıç: en temel 500-1000 kelime, present simple/continuous, günlük basit konular, çok kısa cümleler',
  A2: 'A2 — Temel: yaygın 2000 kelime, past simple, future, basit bağlaçlar, alışveriş/seyahat/aile konuları',
  B1: 'B1 — Orta: 3000-4000 kelime, present perfect, 1st conditional, pasif yapı, iş/okul/seyahat',
  B2: 'B2 — Orta-İleri: phrasal verbs, 2nd-3rd conditional, dolaylı anlatım, akademik konular',
  C1: 'C1 — İleri: nüanslı kelime, karmaşık dilbilgisi, inversion, cleft sentences, resmi-yazılı register',
  C2: 'C2 — Usta: native-level deyimsel kullanım, edebi/akademik metin, idiom, karmaşık yapılar',
}

// ── Kategori açıklamaları ──────────────────────────────────────────────────
const CAT_DESC = {
  dialogue: `Bir konuşmadan (diyalog) alınan boşluklu cümle. Konuşma bağlamına uygun yanıt seçimi.
Format: Kısa diyalog snippet'i, boşlukta hangi ifade uygun?
Örnek: "A: Could you help me? B: ___"
→ seçenekler günlük konuşma kalıpları`,

  phrasal_verbs: `Phrasal verb kullanımını test eden boşluk doldurma.
Cümlede phrasal verb boşluğu (___) var, doğru particle/form seçilmeli.
Örnek: "She decided to ___ the job offer." (turn down / turn up / turn in / turn off / turn over)
Her zaman gerçek kullanım bağlamı içinde test et, soyut değil.`,

  sentence_completion: `Gramer veya kelime bilgisi gerektiren boşluk doldurma.
Cümle içinde ___ boşluğu var. Gramerce doğru ve anlam uyumlu seçenek.
Örnek: "I ___ here for three years." → have been / was / am / will be / had been`,

  cloze_test: `Tek kelime boşluğu — kelime türü/form/collocation testi.
Genellikle adjective/adverb/noun/verb doğru formu seçmek.
Örnek: "He spoke ___ during the presentation." → confidently / confident / confidence / confide / confiding`,

  restatement: `"Original sentence" verilir, anlamı en iyi koruyan paraphrase seçilir.
Format: Original: '...' Which of the following best restates the above?`,
}

// ── Üretim hedefleri ──────────────────────────────────────────────────────────
// [kategori, level_tag, count]
const TARGETS = [
  ['restatement', 'C2', 5],
]

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildPrompt(category, level, count) {
  return `You are a YDT (Turkish university entrance exam) English question generator.

CATEGORY: ${category}
CEFR LEVEL: ${CEFR[level]}
QUESTION COUNT: ${count}

CATEGORY DESCRIPTION:
${CAT_DESC[category]}

RULES:
- Questions must be at exactly ${level} CEFR level — not easier, not harder
- 5 options (A-E), exactly 1 correct answer
- All question text in ENGLISH
- "solution" field in TURKISH (explanation why the answer is correct)
- No culturally offensive content
- Each question must be independent (no shared context)
- Distractors must be plausible but clearly wrong with the right knowledge

JSON OUTPUT ONLY (no markdown, no explanation):
[{
  "question": "question text with ___ for blank",
  "options": ["opt1", "opt2", "opt3", "opt4", "opt5"],
  "answer": 0,
  "solution": "Türkçe açıklama",
  "topic": "specific grammar/vocab topic"
}]

CRITICAL: Return valid JSON array only. Options array must have exactly 5 strings.`
}

// ── Gemini çağrısı ────────────────────────────────────────────────────────────
async function generate(category, level, count) {
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(category, level, count) }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 4096, responseMimeType: 'application/json' },
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
      try { parsed = JSON.parse(m[0].replace(/,\s*([}\]])/g, '$1')) } catch { parsed = [] }
    }
  }
  if (!Array.isArray(parsed)) throw new Error('Array bekleniyor')
  return parsed
}

// ── Doğrulama ─────────────────────────────────────────────────────────────────
function validate(q, category) {
  if (!q.question || q.question.length < 10) return 'question eksik'
  if (!Array.isArray(q.options) || q.options.length !== 5) return 'options 5 değil'
  if (typeof q.answer !== 'number' || q.answer < 0 || q.answer > 4) return 'answer geçersiz'
  if (!q.solution || q.solution.length < 5) return 'solution eksik'

  // Kategori spesifik kontroller
  if (['sentence_completion', 'cloze_test', 'dialogue'].includes(category)) {
    if (!q.question.includes('___')) return '___  boşluğu yok'
  }
  if (category === 'restatement' && !q.question.toLowerCase().includes('original')) {
    return 'restatement formatı yanlış'
  }

  // Türkçe solution kontrolü (basit: Türkçe karakter var mı veya yaygın Türkçe kelime)
  const turkishSignals = ['çünkü', 'için', 'doğru', 'yanlış', 'cevap', 'anlam', 'kullanım', 'ifade', 'ile', 'bir', 'bu']
  const hasTurkish = turkishSignals.some(w => q.solution.toLowerCase().includes(w))
  if (!hasTurkish && q.solution.length < 30) return 'solution Türkçe değil'

  return null // geçerli
}

// ── Ana akış ──────────────────────────────────────────────────────────────────
async function main() {
  let totalGenerated = 0, totalValid = 0, totalInserted = 0
  const log = []
  const errors = []

  for (const [category, level, count] of TARGETS) {
    process.stdout.write(`\n── ${category} / ${level} (hedef: ${count}) ──\n`)

    let questions = []
    try {
      questions = await generate(category, level, count)
      totalGenerated += questions.length
    } catch (err) {
      console.error(`  HATA: ${err.message}`)
      errors.push({ category, level, error: err.message })
      continue
    }

    const validQ = []
    for (const q of questions) {
      const err = validate(q, category)
      if (err) {
        // console.log(`  ✗ ${err}: "${String(q.question || '').slice(0, 50)}"`)
      } else {
        validQ.push(q)
      }
    }

    const invalidCount = questions.length - validQ.length
    totalValid += validQ.length
    console.log(`  Üretilen: ${questions.length}, Geçerli: ${validQ.length}${invalidCount > 0 ? `, Filtrelenen: ${invalidCount}` : ''}`)

    if (validQ.length === 0) continue

    // Difficulty: A1→1, A2→2, B1→3, B2→4, C1→4, C2→5
    const diffMap = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 4, C2: 5 }

    const insertData = validQ.map(q => ({
      game: 'wordquest',
      category,
      topic: q.topic || null,
      difficulty: diffMap[level] || 3,
      level_tag: level,
      content: {
        question: q.question,
        options: q.options,
        answer: q.answer,
        solution: q.solution,
      },
      source: 'ai_gemini_gaps',
      is_active: false,
    }))

    const { data, error } = await supabase.from('questions').insert(insertData).select('id')
    if (error) {
      console.error(`  DB hata: ${error.message}`)
      errors.push({ category, level, error: error.message })
    } else {
      totalInserted += data.length
      console.log(`  ✓ Eklendi: ${data.length}`)
      log.push({ category, level, count: data.length })
    }

    await new Promise(r => setTimeout(r, 1000))
  }

  console.log('\n═══════════════════════════════')
  console.log(`Üretilen : ${totalGenerated}`)
  console.log(`Geçerli  : ${totalValid}`)
  console.log(`Eklenen  : ${totalInserted} (is_active=false)`)
  if (errors.length > 0) {
    console.log(`\nHatalı: ${errors.length} istek`)
    errors.forEach(e => console.log(`  ${e.category}/${e.level}: ${e.error}`))
  }

  // Özet tablo
  console.log('\nKategori özeti:')
  const byCat = {}
  log.forEach(({ category, count }) => { byCat[category] = (byCat[category] || 0) + count })
  Object.entries(byCat).sort().forEach(([cat, n]) => console.log(`  ${cat}: +${n}`))

  writeFileSync(resolve(__dir, '_wordquest-gaps-log.json'), JSON.stringify({ date: new Date().toISOString(), totalInserted, log, errors }, null, 2))
  console.log('\nSonraki adım: kalite sample → toplu aktive')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
