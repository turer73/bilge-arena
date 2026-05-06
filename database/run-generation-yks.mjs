#!/usr/bin/env node
/**
 * YKS-format orijinal soru uretim CLI
 * --------------------------------------------------------------
 * Tetik: kullanici raporu (mass-cleanup PR #121 sonrasi pool 1507'ye dustu).
 *
 * Hedef: TYT/AYT formatinda ORIJINAL sorular - ÖSYM yayimlanmis
 * sorulardan paraphrase YASAK. Lisans-uyumlu, kendi cümle yapisi.
 *
 * Kullanim:
 *   node database/run-generation-yks.mjs <game> <category> <difficulty> [count] [topic]
 *
 * Ornek:
 *   node database/run-generation-yks.mjs sosyal sosyoloji 3 5 "Toplumsal Yapı"
 *   node database/run-generation-yks.mjs turkce paragraf 2 5
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.local')
if (existsSync(envPath)) {
  const envText = readFileSync(envPath, 'utf-8')
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('HATA: SUPABASE env gerekli'); process.exit(1)
}
if (!GEMINI_API_KEY) {
  console.error('HATA: GEMINI_API_KEY gerekli'); process.exit(1)
}

const [, , game, category, difficultyArg, countArg, topicArg] = process.argv
const difficulty = parseInt(difficultyArg ?? '2', 10)
const count = parseInt(countArg ?? '5', 10)
const topic = topicArg && topicArg !== '--' ? topicArg : null

if (!game || !category) {
  console.error('Kullanim: <game> <category> <difficulty> [count] [topic]'); process.exit(1)
}
if (![1, 2, 3, 4, 5].includes(difficulty)) {
  console.error('HATA: difficulty 1-5'); process.exit(1)
}

const GEMINI_MODEL = 'gemini-2.5-pro'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const CATEGORY_LABELS = {
  sayilar: 'Sayılar ve İşlemler', problemler: 'Problemler', geometri: 'Geometri',
  denklemler: 'Denklemler', fonksiyonlar: 'Fonksiyonlar', olasilik: 'Olasılık ve İstatistik',
  paragraf: 'Paragraf Anlama', dil_bilgisi: 'Dil Bilgisi', sozcuk: 'Sözcük Anlamı',
  anlam_bilgisi: 'Anlam Bilgisi', yazim_kurallari: 'Yazım Kuralları',
  fizik: 'Fizik', kimya: 'Kimya', biyoloji: 'Biyoloji',
  tarih: 'Tarih', cografya: 'Coğrafya', felsefe: 'Felsefe ve Mantık', sosyoloji: 'Sosyoloji',
}

const SYSTEM_PROMPT = `Sen YKS (TYT/AYT) sınavı için ORİJİNAL soru üreten bir öğretmensin.

==================================================================
LİSANS VE TELİF ZORUNLULUĞU (KRİTİK)
==================================================================

⛔ ÖSYM tarafından yayımlanmış (TYT 2018-2024, AYT 2018-2024, LGS, KPSS)
   sorulardan paraphrase ÜRETME. Bu telif ihlalidir.
⛔ Mevcut soruları "kelime değiştirerek" yeniden yazma.
⛔ Bilinen klasik soru kalıplarını ezbere taklit etme.

✓ KENDİ orijinal cümle yapın, KENDİ senaryonu kur.
✓ Konu aynı (örn paragraf-ana-düşünce) olabilir ama metin / örnek /
   sayılar TAMAMEN farkli olmali.
✓ Gerçek olaylar, kişiler, kurumlar referans alınabilir AMA spesifik
   yayımlanmış sınav metinleri değil.

==================================================================
KALİTE BARI (ÖSYM SEVİYESİ)
==================================================================

✓ Soru metni NET ve TEK ANLAMLI (muğlak değil)
✓ 5 seçenek (A-E), TEK doğru cevap
✓ Dağıtıcı (distractor) seçenekler MANTIKLI yakın-yanlışlar
   - Çok bariz yanlışlar (saçma seçenekler) YASAK
   - Tüm seçenekler "akla yatkın" ama bir tanesi en doğru
✓ Çözüm öğretici, kavramı açıklayan, "neden bu doğru / neden diğerleri
   yanlış" mantığında 2-4 cümle
✓ TDK uyumlu Türkçe (yazim_kurallari için TDK 2023 kuralları kesin)

==================================================================
ZORLUK AYARI (1-5)
==================================================================

1: Temel kavram tanıma, doğrudan tanım sorusu
2: Kavram + uygulama, küçük ipucu çıkarımı
3: Çoklu kavram bağlantısı, orta dereceli analiz
4: Sentez, çıkarım yapma, çoklu adım, ayırt edici detay
5: İleri analiz, az bilinen ayrıntı, multi-hop akıl yürütme

==================================================================
ANTI-PATTERN
==================================================================

❌ "Aşağıdakilerden hangisi yanlıştır?" + cevap zaten doğru yazılmış
❌ "Çukurova" gibi alt-bölge ile bölge karıştırma
❌ "X ve Y" kombo cevap (tek doğru olmalı, kombolar muğlak)
❌ "Sorunun kendisinde hata var" gibi kendi-çelişen çözüm
❌ Tek seçeneğin uzunluğu diğerlerinden 3-4 kat (sırıtma)

==================================================================
SORU CÜMLESİ FORMATI (KRİTİK)
==================================================================

✓ "question" alanı SORU CÜMLESİ olmalı:
  - "?" ile bitmeli VEYA
  - "hangisidir / nedir / kaç / hangi" gibi soru-belirtici kelime içermeli
✗ Sadece tanım veya bilgi sunup soru cümlesi eklemeyi UNUTMA
   YASAK ÖRNEK: "Ali Bey'in mesleği değişmemiştir."
   DOĞRU ÖRNEK: "...Ali Bey'in geçirdiği değişiklik aşağıdakilerden hangisidir?"

==================================================================
SEÇENEK FORMATI (KRİTİK)
==================================================================

✗ Seçeneklere "A)", "B)" gibi PREFIX EKLEME — UI prefix'i kendi koyar
✗ YASAK: ["A) Troposfer", "B) Stratosfer", ...]
✓ DOĞRU:   ["Troposfer", "Stratosfer", "Mezosfer", "Termosfer", "Ekzosfer"]

==================================================================
ÇIKTI FORMATI — JSON
==================================================================

[{"question":"...?","options":["secenek1","secenek2","secenek3","secenek4","secenek5"],"answer":0,"solution":"...","topic":"..."}]

JSON anahtarları MUTLAKA: question, options (5 elemanlı array, A)/B) prefix YOK),
answer (0-4 integer), solution, topic.

SADECE JSON döndür, başka metin yok.`

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

console.log('=== YKS-format orijinal soru uretim ===')
console.log('Game:', game, '| Category:', category, '(', CATEGORY_LABELS[category] || category, ')')
console.log('Difficulty:', difficulty + '/5 | Count:', count)
console.log('Topic:', topic ?? '(cesitli)')
console.log('Model:', GEMINI_MODEL, '\n')

// Few-shot: mevcut DB'den 3 ornek (audit edilmis kategorilerin kalitesini ornek al)
const { data: examples } = await supabase
  .from('questions')
  .select('content')
  .eq('game', game).eq('category', category)
  .eq('is_active', true)
  .limit(3)

let fewShot = ''
if (examples?.length) {
  fewShot = '\n\nKALİTE REFERANSI (BENZER STİLDE FARKLI SORU ÜRET):\n'
  for (let i = 0; i < examples.length; i++) {
    const c = examples[i].content ?? {}
    fewShot += `\nÖrnek ${i + 1}:\nSoru: ${c.question}\n`
    for (let j = 0; j < (c.options ?? []).length; j++) {
      fewShot += `  ${String.fromCharCode(65 + j)}) ${c.options[j]}\n`
    }
    fewShot += `Doğru: ${String.fromCharCode(65 + (c.answer ?? 0))}\nÇözüm: ${c.solution}\n`
  }
  console.log(`Few-shot: ${examples.length} ornek yuklendi.`)
}

// Existing prefix dedup
const { data: existing } = await supabase
  .from('questions')
  .select('content')
  .eq('game', game).eq('category', category).limit(500)

const TR_MAP = { 'İ': 'i', 'I': 'i', 'Ş': 's', 'Ç': 'c', 'Ğ': 'g', 'Ü': 'u', 'Ö': 'o' }
const trLower = s => { let o = ''; for (const c of s) o += TR_MAP[c] ?? c.toLowerCase(); return o }
const existingPrefixes = new Set()
for (const e of existing ?? []) {
  const text = trLower((e.content?.question ?? '').slice(0, 50))
  if (text) existingPrefixes.add(text)
}
console.log(`Dedup prefix set: ${existingPrefixes.size}`)

const userPrompt = `${count} adet ORİJİNAL ${CATEGORY_LABELS[category] || category} sorusu üret.
Game: ${game}
Difficulty: ${difficulty}/5
${topic ? `Konu: ${topic}` : 'Konu çeşitliliği bekleniyor.'}

LİSANS HATIRLATICI: ÖSYM yayımlanmış sorulardan paraphrase yasak. KENDİ orijinal cümlen.${fewShot}`

console.log('\nGemini cagriliyor...')
const startTs = Date.now()
const res = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.85,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  }),
})

const elapsed = Date.now() - startTs
console.log(`Gemini ${elapsed}ms status ${res.status}`)
const json = await res.json().catch(() => null)
if (!json) { console.error('JSON parse fail'); process.exit(2) }

const text = json.candidates?.[0]?.content?.parts?.[0]?.text
if (!text) {
  console.error('No text:', JSON.stringify(json).slice(0, 500))
  process.exit(2)
}

let questions
try { questions = JSON.parse(text) }
catch (e1) {
  const m = text.match(/\[[\s\S]*\]/)
  if (m) {
    const cleaned = m[0]
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/[\x00-\x1F\x7F]/g, ' ')
      .replace(/\\\n/g, ' ')
      .replace(/\n/g, ' ')
    questions = JSON.parse(cleaned)
  } else { console.error('Cannot extract JSON. e1:', e1.message); process.exit(2) }
}

if (!Array.isArray(questions)) { console.error('Not array'); process.exit(2) }
console.log(`Parse: ${questions.length} soru`)

function validate(q) {
  if (typeof q?.question !== 'string' || q.question.length < 10 || q.question.length > 4000) return 'question 10-4000 char'
  if (!Array.isArray(q.options) || q.options.length !== 5) return 'options 5 array'
  for (let i = 0; i < 5; i++)
    if (typeof q.options[i] !== 'string' || q.options[i].length < 1 || q.options[i].length > 600) return `options[${i}] 1-600 char`
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 4) return 'answer 0-4 int'
  if (typeof q.solution !== 'string' || q.solution.length < 5 || q.solution.length > 3000) return 'solution 5-3000 char'
  return null
}

const valid = []
for (let i = 0; i < questions.length; i++) {
  const err = validate(questions[i])
  if (err) console.warn(`  Reddedildi #${i+1}: ${err}`)
  else valid.push(questions[i])
}
console.log(`Validate: ${valid.length}/${questions.length}`)

const unique = []
let dupCount = 0
for (const q of valid) {
  const p = trLower(q.question.slice(0, 50))
  if (existingPrefixes.has(p)) dupCount++
  else { existingPrefixes.add(p); unique.push(q) }
}
console.log(`Dedup: ${unique.length} unique, ${dupCount} cakisma`)

if (unique.length === 0) { console.error('HATA: 0 unique'); process.exit(3) }

const generatedDir = join(__dirname, 'generated')
if (!existsSync(generatedDir)) mkdirSync(generatedDir, { recursive: true })
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const auditPath = join(generatedDir, `${ts}-yks-${game}-${category}-d${difficulty}.json`)
writeFileSync(auditPath, JSON.stringify({
  takenAt: new Date().toISOString(),
  game, category, difficulty, topic,
  prompt_version: 'yks-orijinal-v3',
  count: unique.length, valid_count: valid.length, raw_count: questions.length,
  questions: unique,
}, null, 2), 'utf-8')
console.log(`Audit: ${auditPath}`)

const insertData = unique.map(q => ({
  game, category,
  topic: q.topic ?? topic ?? null,
  difficulty,
  level_tag: null,
  content: { question: q.question, options: q.options, answer: q.answer, solution: q.solution },
  source: 'ai_generated_v3', // YKS-orijinal v3
  is_active: false,
}))

const { data: inserted, error } = await supabase.from('questions').insert(insertData).select('id')
if (error) { console.error('Insert error:', error.message); process.exit(4) }
console.log(`\nDB'ye eklendi: ${inserted?.length ?? 0} (source=ai_generated_v3, is_active=false)\n`)
