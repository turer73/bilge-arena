/**
 * LGS Matematik — sadece kalan konular (Rasyonel Sayılar zaten eklendi).
 * Kullanım: node --env-file=.env.local database/generate-lgs-matematik-retry.mjs
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

// Sadece başarısız olan 11 konu
const PLAN = [
  { category: 'sayilar',    topic: 'Üslü ve Köklü İfadeler',       count: 7 },
  { category: 'sayilar',    topic: 'Çarpanlar ve Katlar / EBOB-EKOK', count: 6 },
  { category: 'cebir',      topic: 'Denklemler ve Eşitsizlikler',   count: 8 },
  { category: 'cebir',      topic: 'Oran ve Orantı Problemleri',    count: 8 },
  { category: 'cebir',      topic: 'Yüzde, Faiz ve Kar-Zarar',     count: 7 },
  { category: 'geometri',   topic: 'Dörtgenler (kare, dikdörtgen, eşkenar dörtgen)', count: 7 },
  { category: 'geometri',   topic: 'Çember ve Daire Alanı-Çevresi', count: 6 },
  { category: 'geometri',   topic: 'Dönüşüm Geometrisi (yansıma, öteleme, dönme)', count: 5 },
  { category: 'geometri',   topic: 'Piramit, Koni ve Küre Yüzey-Hacim', count: 5 },
  { category: 'veri',       topic: 'İstatistik (ortalama, medyan, mod)', count: 6 },
  { category: 'veri',       topic: 'Olasılık (basit olaylar)',      count: 5 },
]

const SYSTEM_PROMPT = `Sen LGS (Liselere Geçiş Sınavı) 8. sınıf Matematik sorusu üreticisisin.

SEVİYE: LGS — ortaokul 8. sınıf, 13-14 yaş, orta zorluk.
Bağlam: okul hayatı, günlük alışveriş, spor, aile, hobi.

TEMEL KURAL — BUNLARI YAZMA:
- "x + 5 = 12'de x kaçtır?" gibi mekanik hesap
- "Karenin alanı formülü nedir?" gibi tanım/formül ezberi
- Resim/şekil/grafik gerektiren sorular (sadece metin)

LGS MATEMATİK soruları ŞÖYLE olur:
- Gerçekçi senaryo: "Selin, harçlığının 3/5'ini kitaba harcadı..."
- Oran-orantı bağlamı: "Bir tarlanın 2/3'ü ekilidir, ekili alan 480 m² ise..."
- İki adımlı problem: önce hesapla, sonra karşılaştır
- Yüzde uygulaması: "İndirim öncesi fiyat 240 TL, %25 indirimle..."
- Geometri uygulaması: "Bahçenin çevresi 56 m, bir kenarı diğerinin 3 katı ise..."

ÇOK SEÇENEKLİ (A-E), 1 doğru cevap.
JSON çıktısı (başka hiçbir şey yazma):
[{
  "question": "Senaryo ve soru (tek paragraf, net ve anlaşılır)",
  "options": ["A seçenek", "B seçenek", "C seçenek", "D seçenek", "E seçenek"],
  "answer": 0,
  "solution": "Adım adım Türkçe çözüm (kısa, 2-3 satır)",
  "topic": "konu adı",
  "difficulty": 2
}]

Seçenekler sayısal veya kısa ifade olsun. Tüm metinler Türkçe.`

async function generate(category, topic, count) {
  const userPrompt = `${topic} konusunda ${count} adet LGS 8. sınıf matematik sorusu üret. Kategori: ${category}`
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
    if (m) { try { parsed = JSON.parse(m[0].replace(/,\s*([}\]])/g, '$1')) } catch { parsed = [] } }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Geçerli JSON array yok')
  return parsed
}

const TRIVIAL_PATTERNS = [
  /^\s*[x-z]\s+kaçtır\?$/i,
  /formülü (nedir|hangisidir)/i,
  /birimi (nedir|hangisidir)/i,
]

function validate(q) {
  if (!q.question || q.question.length < 25) return 'soru çok kısa'
  if (!Array.isArray(q.options) || q.options.length !== 5) return 'options 5 değil'
  if (typeof q.answer !== 'number' || q.answer < 0 || q.answer > 4) return 'answer geçersiz'
  if (!q.solution || q.solution.length < 15) return 'solution eksik'
  if (TRIVIAL_PATTERNS.some(p => p.test(q.question))) return 'trivial soru'
  return null
}

async function main() {
  let totalInserted = 0
  const byCategory = {}

  for (const { category, topic, count } of PLAN) {
    process.stdout.write(`\n── ${category}/${topic} (${count}) ──\n`)
    let questions = []
    try {
      questions = await generate(category, topic, count)
    } catch (err) {
      console.error(`  HATA: ${err.message}`)
      // 403'te 10s bekle, devam et
      if (err.message.includes('403')) await new Promise(r => setTimeout(r, 10000))
      continue
    }
    const valid = questions.filter(q => !validate(q))
    const filtered = questions.length - valid.length
    console.log(`  Üretilen: ${questions.length}, Geçerli: ${valid.length}${filtered > 0 ? `, Filtrelenen: ${filtered}` : ''}`)
    if (valid.length === 0) continue

    const insertData = valid.map(q => ({
      game: 'matematik', category, topic: q.topic || topic,
      difficulty: 2, content: { question: q.question, options: q.options, answer: q.answer, solution: q.solution, type: 'regular' },
      source: 'ai_gemini_lgs', exam_ref: 'LGS', is_active: false,
    }))
    const { data, error } = await supabase.from('questions').insert(insertData).select('id')
    if (error) { console.error(`  DB hata: ${error.message}`) }
    else {
      totalInserted += data.length
      byCategory[category] = (byCategory[category] || 0) + data.length
      console.log(`  ✓ Eklendi: ${data.length}`)
    }
    // İstekler arası 3s bekleme (rate limit için)
    await new Promise(r => setTimeout(r, 3000))
  }

  console.log('\n═══════════════════════════════')
  console.log(`Eklenen: ${totalInserted} (exam_ref=LGS)`)
  Object.entries(byCategory).forEach(([cat, n]) => console.log(`  ${cat}: ${n}`))
  writeFileSync(resolve(__dir, '_lgs-matematik-retry-log.json'),
    JSON.stringify({ date: new Date().toISOString(), totalInserted, byCategory }, null, 2))
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
