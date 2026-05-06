#!/usr/bin/env node
/**
 * YKS-format orijinal soru üretim CLI — Claude Sonnet 4.6
 * --------------------------------------------------------------
 * Tetik: yks-v3 batch'inde gemini-pro %75 format hatası (A) prefix +
 * soru cümlesi eksik). Sonnet ile self-consistency + format compliance
 * daha yüksek beklentisi.
 *
 * Kullanim:
 *   node database/run-generation-claude.mjs <game> <category> <difficulty> [count] [topic]
 *
 * Ornek:
 *   node database/run-generation-claude.mjs sosyal sosyoloji 3 5
 *   node database/run-generation-claude.mjs matematik problemler 3 5 "Yas Problemleri"
 *
 * Prompt cache: system prompt 1500+ token, ardışık batch'lerde %90 saving.
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
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('HATA: SUPABASE env gerekli'); process.exit(1)
}
if (!ANTHROPIC_API_KEY) {
  console.error('HATA: ANTHROPIC_API_KEY gerekli'); process.exit(1)
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

const CLAUDE_MODEL = process.env.CLAUDE_MODEL_OVERRIDE || 'claude-sonnet-4-6'
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

const CATEGORY_LABELS = {
  sayilar: 'Sayılar ve İşlemler', problemler: 'Problemler', geometri: 'Geometri',
  denklemler: 'Denklemler', fonksiyonlar: 'Fonksiyonlar', olasilik: 'Olasılık ve İstatistik',
  paragraf: 'Paragraf Anlama', dil_bilgisi: 'Dil Bilgisi', sozcuk: 'Sözcük Anlamı',
  anlam_bilgisi: 'Anlam Bilgisi', yazim_kurallari: 'Yazım Kuralları',
  fizik: 'Fizik', kimya: 'Kimya', biyoloji: 'Biyoloji',
  tarih: 'Tarih', cografya: 'Coğrafya', felsefe: 'Felsefe ve Mantık', sosyoloji: 'Sosyoloji',
}

const SYSTEM_PROMPT = `Sen YKS (TYT/AYT) sınavı için ORİJİNAL soru üreten kıdemli bir Türk eğitim uzmanısın.

==================================================================
LİSANS VE TELİF ZORUNLULUĞU (KRİTİK)
==================================================================

⛔ ÖSYM tarafından yayımlanmış (TYT 2018-2024, AYT 2018-2024, LGS, KPSS)
   sorulardan PARAPHRASE üretmek YASAKtır. Telif ihlalidir.
⛔ Bilinen klasik ders kitabı sorularını ezbere taklit etme.
⛔ Soruları "kelime değiştirerek" yeniden yazma.

✓ KENDİ orijinal cümle yapın, KENDİ senaryon, KENDİ örneklerin.
✓ Konu (örn paragraf-ana-düşünce) aynı olabilir AMA metin/sayı/karakter
   tamamen farklı olmalı.
✓ Gerçek tarihsel olaylar/kişiler/yerler referans alınabilir AMA spesifik
   yayımlanmış sınav metinleri değil.

==================================================================
KALİTE BARI (ÖSYM SEVİYESİ)
==================================================================

✓ Soru metni NET, TEK ANLAMLI, akademik ton
✓ 5 seçenek (A-E), TEK doğru cevap
✓ Distractor (yanlış seçenekler) MANTIKLI yakın-yanlışlar:
   - Aynı kategoriden, akla yatkın görünen alternatifler
   - Bariz/saçma seçenekler YASAK
   - Hepsi "akla yatkın" ama biri en doğru
✓ Çözüm metni öğretici 2-4 cümle:
   - "Neden bu doğru" + "neden diğerleri yanlış"
   - Kavramı açıkla, ezbere değil mantığa odaklan
✓ TDK 2023 yazım kurallarına uy (yazim_kurallari kategorisi için kesin)

==================================================================
ZORLUK SEVİYELERİ (1-5)
==================================================================

1: Temel kavram tanıma, doğrudan tanım sorusu
2: Kavram + uygulama, küçük ipucu çıkarımı
3: Çoklu kavram bağlantısı, orta dereceli analiz
4: Sentez, çıkarım yapma, çoklu adım, ayırt edici detay
5: İleri analiz, az bilinen ayrıntı, multi-hop akıl yürütme

==================================================================
ANTI-PATTERN (KESİNLİKLE YAPMA)
==================================================================

❌ Soru cümlesi eksik — sadece tanım/olay sunup soruyu unutma
   YASAK: "Ali Bey'in mesleği değişmedi."
   DOĞRU: "...Ali Bey'in geçirdiği değişiklik aşağıdakilerden hangisidir?"

❌ Seçeneklerde A) B) C) D) E) PREFIX kullanma
   YASAK: ["A) Troposfer", "B) Stratosfer", ...]
   DOĞRU: ["Troposfer", "Stratosfer", "Mezosfer", "Termosfer", "Ekzosfer"]

❌ "X ve Y" kombo cevap (tek doğru olmalı)
   YASAK: "Pamuk üretiminde Ege ve Çukurova" (Çukurova bölge değil)
   DOĞRU: tek bölge adı veya tek tanım

❌ Alt-bölge ile ana-bölge karıştırma (Çukurova ova, Akdeniz Bölge)

❌ "Sorunun kendisinde hata var" gibi kendi-çelişen çözüm

❌ Soruda "yanlış olan" istenirken cevap olarak doğru yazılan seçeneği işaretleme

❌ Tek seçeneğin uzunluğu diğerlerinden 3-4 kat (pattern sırıtma)

❌ Çözüm metnini cevap-seçeneği ile çelişkili yazma

==================================================================
SORU CÜMLESİ FORMATI (KRİTİK)
==================================================================

✓ "question" alanı SORU CÜMLESİ olmalı:
  - "?" işareti ile bitmeli, VEYA
  - "hangisidir / nedir / kaç / hangi / nasıl" gibi soru-belirtici kelime içermeli

==================================================================
ÇIKTI FORMATI — SADECE JSON
==================================================================

[{"question":"...?","options":["secenek1","secenek2","secenek3","secenek4","secenek5"],"answer":0,"solution":"...","topic":"..."}]

JSON anahtarları MUTLAKA: question, options (5 elemanlı array, prefix YOK),
answer (0-4 integer), solution (5-300 kelime), topic.

YANIT SADECE JSON DİZİSİ. Markdown wrapping YOK, açıklama YOK, başka metin YOK.`

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

console.log('=== YKS Sonnet uretim ===')
console.log('Game:', game, '| Category:', category, '(', CATEGORY_LABELS[category] || category, ')')
console.log('Difficulty:', difficulty + '/5 | Count:', count, '| Topic:', topic ?? '(çeşitli)')
console.log('Model:', CLAUDE_MODEL, '\n')

// Few-shot
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

console.log('\nClaude API cagriliyor...')
const startTs = Date.now()
const res = await fetch(ANTHROPIC_API_URL, {
  method: 'POST',
  headers: {
    'x-api-key': ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    model: CLAUDE_MODEL,
    max_tokens: 8192,
    temperature: 0.85,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  }),
})

const elapsed = Date.now() - startTs
console.log(`Claude ${elapsed}ms status ${res.status}`)
const json = await res.json().catch(() => null)
if (!json) { console.error('JSON parse fail'); process.exit(2) }

if (json.error) {
  console.error('API error:', JSON.stringify(json.error).slice(0, 500))
  process.exit(2)
}

if (json.usage) {
  const u = json.usage
  console.log(`Tokens: input=${u.input_tokens}, cache_create=${u.cache_creation_input_tokens ?? 0}, cache_read=${u.cache_read_input_tokens ?? 0}, output=${u.output_tokens}`)
}

const text = json.content?.[0]?.text
if (!text) {
  console.error('No text:', JSON.stringify(json).slice(0, 500))
  process.exit(2)
}

let questions
try { questions = JSON.parse(text) }
catch (e1) {
  // Markdown fallback
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

  // Format guards (yks-v3 ogrenimleri)
  const endsQ = /\?\s*$/.test(q.question)
  const hasMarker = /(hangisi|nedir|nasıl|ne ad verilir|en uygun|en iyi|en yakın|en doğru|hangi|kaç |yorum)/i.test(q.question)
  if (!endsQ && !hasMarker) return 'soru-cumlesi yok (no ? or hangisi/nedir)'

  for (const o of q.options) if (/^[A-E]\)\s/.test(o)) return 'options A) prefix YASAK'

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
const auditPath = join(generatedDir, `${ts}-claude-${game}-${category}-d${difficulty}.json`)
writeFileSync(auditPath, JSON.stringify({
  takenAt: new Date().toISOString(),
  game, category, difficulty, topic,
  prompt_version: 'yks-claude-v4',
  model: CLAUDE_MODEL,
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
  source: 'ai_claude_v4',
  is_active: false,
}))

const { data: inserted, error } = await supabase.from('questions').insert(insertData).select('id')
if (error) { console.error('Insert error:', error.message); process.exit(4) }
console.log(`\nDB'ye eklendi: ${inserted?.length ?? 0} (source=ai_claude_v4, is_active=false)\n`)
