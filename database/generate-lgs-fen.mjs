/**
 * LGS (Liselere Geçiş Sınavı) seviyesinde Fen Bilimleri soruları üretir.
 * 8. sınıf müfredatı — Fizik + Kimya + Biyoloji entegre.
 * exam_ref = 'LGS' olarak eklenir.
 *
 * Kullanım: node --env-file=.env.local database/generate-lgs-fen.mjs
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

// ── Üretim planı (LGS Fen Bilimleri 8. sınıf) ────────────────────────────────
const PLAN = [
  // Fizik konuları
  { category: 'fizik', topic: 'Mevsimler ve İklim',                    count: 6 },
  { category: 'fizik', topic: 'Kuvvet ve Hareket (sürtünme, eğim)',    count: 7 },
  { category: 'fizik', topic: 'Basit Makineler (kaldıraç, palanga)',   count: 6 },
  { category: 'fizik', topic: 'Elektrik Yükü ve Elektrik Enerjisi',    count: 7 },
  { category: 'fizik', topic: 'Maddenin Halleri ve Isı (hal değişimi)', count: 6 },
  // Kimya konuları
  { category: 'kimya', topic: 'Asit, Baz ve pH (günlük örnekler)',     count: 7 },
  { category: 'kimya', topic: 'Kimyasal Tepkimeler ve Denklemler',     count: 6 },
  { category: 'kimya', topic: 'Karışımlar ve Çözeltiler',              count: 5 },
  // Biyoloji konuları
  { category: 'biyoloji', topic: 'DNA, Gen ve Kalıtım (Mendel)',       count: 8 },
  { category: 'biyoloji', topic: 'Mitoz ve Mayoz Bölünme',             count: 7 },
  { category: 'biyoloji', topic: 'Ekosistem ve Besin Zinciri',         count: 6 },
  { category: 'biyoloji', topic: 'İnsan Vücudu (sinir, bağışıklık)',  count: 5 },
]

// ── Sistem promptu ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Sen LGS (Liselere Geçiş Sınavı) 8. sınıf Fen Bilimleri sorusu üreticisisin.

SEVİYE: LGS — ortaokul 8. sınıf, 13-14 yaş.
Fen Bilimleri = Fizik + Kimya + Biyoloji konuları entegre tek sınav.
TYT Fen'den DAHA KOLAY: lise ileri konuları (elektromanyetizma, organik kimya, evrim detayı) YOK.

TEMEL KURAL — BUNLARI YAZMA:
- "Fotosentez nedir?" gibi tanım ezberi
- "Asit formülü nedir?" gibi formül ezberi
- Resim/şekil/grafik gerektiren sorular (sadece metin)
- "Kim keşfetti?" / "hangi yıl bulundu?" trivia soruları

LGS FEN soruları ŞÖYLE olur:
- Kavramsal karşılaştırma: "Hangisi asit, hangisi baz?" (günlük örnekler: limon, sabun, sirkemiz)
- Senaryo: "Çiğdem, bir bitkiyi karanlık odaya koyuyor. Birkaç günde ne gözlemler?"
- I/II/III ifadeli: "Kalıtımla ilgili hangileri doğrudur?" (3 önerme, kombinasyon seç)
- Neden-sonuç: "Sürtünme kuvveti artarsa hız nasıl değişir?"
- Günlük hayat bağlantısı: evde yapılan deneyler, vücut sistemleri, doğa olayları

ÇOK SEÇENEKLİ (A-E), 1 doğru cevap.
Roman numeral soruları için options: ["Yalnız I", "Yalnız II", "I ve II", "II ve III", "I, II ve III"] formatı.

JSON çıktısı (başka hiçbir şey yazma):
[{
  "question": "Soru metni (roman numeral varsa I. II. III. ifadeleri buraya)",
  "options": ["A seçenek", "B seçenek", "C seçenek", "D seçenek", "E seçenek"],
  "answer": 0,
  "solution": "Kısa Türkçe açıklama (1-3 cümle)",
  "topic": "konu adı",
  "type": "roman_numeral veya regular",
  "difficulty": 2
}]

Tüm metinler Türkçe. Her konudan sorular %30-40 oranında roman numeral formatında olsun.`

// ── Gemini çağrısı ────────────────────────────────────────────────────────────
async function generate(category, topic, count) {
  const userPrompt = `${topic} konusunda ${count} adet LGS 8. sınıf Fen Bilimleri sorusu üret.
Kategori: ${category}
Sorular kavramsal olsun, ezber gerektirmesin. Günlük hayat bağlantısı kur.`

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.65, maxOutputTokens: 65536, responseMimeType: 'application/json' },
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
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Geçerli JSON array yok')
  return parsed
}

// ── Doğrulama ─────────────────────────────────────────────────────────────────
const TRIVIAL = [
  /^(fotosentez|solunum|kalıtım|asit|baz|kuvvet)\s+(nedir|ne demektir)\?$/i,
  /kim (tarafından|bulunmuştur|keşfetmiştir)/i,
  /formülü (nedir|hangisidir)/i,
  /tanımı nedir/i,
  /sembolü nedir/i,
]

function validate(q) {
  if (!q.question || q.question.length < 20) return 'soru çok kısa'
  if (!Array.isArray(q.options) || q.options.length !== 5) return 'options 5 değil'
  if (typeof q.answer !== 'number' || q.answer < 0 || q.answer > 4) return 'answer geçersiz'
  if (!q.solution || q.solution.length < 10) return 'solution eksik'
  if (TRIVIAL.some(p => p.test(q.question.trim()))) return 'trivial soru'

  // Roman numeral kontrolü
  if (q.type === 'roman_numeral') {
    const hasRomanOpts = q.options.filter(o => /Yalnız [IVX]/.test(o) || /[IVX]+ ve [IVX]+/.test(o))
    if (hasRomanOpts.length < 3) return 'roman numeral option az'
  }
  return null
}

// ── Ana akış ──────────────────────────────────────────────────────────────────
async function main() {
  let totalGenerated = 0, totalValid = 0, totalInserted = 0
  const byCategory = { fizik: 0, kimya: 0, biyoloji: 0 }
  const log = []

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

    const valid = []
    for (const q of questions) {
      const err = validate(q)
      if (err) {
        console.log(`  ✗ ${err}: "${String(q.question || '').slice(0, 60)}"`)
      } else {
        valid.push(q)
      }
    }
    const filtered = questions.length - valid.length
    totalValid += valid.length
    console.log(`  Üretilen: ${questions.length}, Geçerli: ${valid.length}${filtered > 0 ? `, Filtrelenen: ${filtered}` : ''}`)

    const romanCount = valid.filter(q => q.type === 'roman_numeral').length
    if (romanCount > 0) console.log(`  Roman numeral: ${romanCount}`)

    if (valid.length === 0) continue

    const insertData = valid.map(q => ({
      game: 'fen',
      category,
      topic: q.topic || topic,
      difficulty: 2,           // LGS = difficulty 2
      content: {
        question: q.question,
        options: q.options,
        answer: q.answer,
        solution: q.solution,
        type: q.type || 'regular',
      },
      source: 'ai_gemini_lgs',
      exam_ref: 'LGS',          // ← LGS ayrımı
      is_active: false,
    }))

    const { data, error } = await supabase.from('questions').insert(insertData).select('id')
    if (error) {
      console.error(`  DB hata: ${error.message}`)
    } else {
      totalInserted += data.length
      byCategory[category] += data.length
      console.log(`  ✓ Eklendi: ${data.length}`)
      log.push({ category, topic, count: data.length })
    }

    await new Promise(r => setTimeout(r, 1200))
  }

  console.log('\n═══════════════════════════════')
  console.log(`Üretilen : ${totalGenerated}`)
  console.log(`Geçerli  : ${totalValid}`)
  console.log(`Eklenen  : ${totalInserted} (is_active=false, exam_ref=LGS)`)
  console.log(`  Fizik   : ${byCategory.fizik}`)
  console.log(`  Kimya   : ${byCategory.kimya}`)
  console.log(`  Biyoloji: ${byCategory.biyoloji}`)

  writeFileSync(resolve(__dir, '_lgs-fen-log.json'),
    JSON.stringify({ date: new Date().toISOString(), totalInserted, byCategory, log }, null, 2))
  console.log('\nSonraki adım: kalite spot-check → toplu aktive')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
