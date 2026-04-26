#!/usr/bin/env node
/**
 * AI Soru Uretim CLI — Sosyoloji + Wordquest A1/A2/C2 icerik kosulari icin
 * --------------------------------------------------------------
 * Kullanim:
 *   node database/run-generation.mjs <game> <category> <difficulty> [level_tag] [count]
 *
 * Ornek:
 *   node database/run-generation.mjs sosyal sosyoloji 3 -- 5
 *   node database/run-generation.mjs wordquest vocabulary 1 A1 5
 *
 * Not:
 *   - Generated sorular DB'ye is_active=false ile eklenir; admin UI'dan review edilmeli.
 *   - Cikti ayni anda database/generated/ icine JSON olarak yazilir (audit + reproduce icin).
 *   - Bu CLI, /api/admin/generate-questions route ile *AYNI* prompt logic'ini kullanir
 *     (CEFR_GUIDANCE, TOPIC_MAP, dedup vs). 2026-04-26 tek kullanim icin duplicate edildi —
 *     ikinci kullanim olursa src/lib/admin/question-generator.ts'e refactor edilmeli.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── env yukle ────────────────────────────────────────
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
  console.error('HATA: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env gerekli')
  process.exit(1)
}
if (!GEMINI_API_KEY) {
  console.error('HATA: GOOGLE_GENERATIVE_AI_API_KEY env gerekli')
  process.exit(1)
}

// ── CLI args ─────────────────────────────────────────
const [, , game, category, difficultyArg, levelArg, countArg] = process.argv
if (!game || !category || !difficultyArg) {
  console.error('Kullanim: node run-generation.mjs <game> <category> <difficulty> [level_tag|--] [count]')
  console.error('Ornek: node run-generation.mjs wordquest vocabulary 2 A2 5')
  console.error('       node run-generation.mjs sosyal sosyoloji 3 -- 5')
  process.exit(1)
}
const difficulty = parseInt(difficultyArg, 10)
const level_tag = levelArg && levelArg !== '--' ? levelArg : null
const count = parseInt(countArg ?? '5', 10)

if (![1, 2, 3, 4, 5].includes(difficulty)) {
  console.error(`HATA: difficulty 1-5 arasi olmali (girilen: ${difficultyArg})`)
  process.exit(1)
}
if (level_tag !== null && !['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(level_tag)) {
  console.error(`HATA: level_tag A1-C2 enum olmali (girilen: ${level_tag})`)
  process.exit(1)
}

// ── Sabitler — route.ts ile bire bir (audit aksaklik = tek kaynaktan duplicate) ──
const GEMINI_MODEL = 'gemini-2.5-flash-lite'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const TOPIC_MAP = {
  matematik: {
    sayilar: ['Bölünebilme', 'Asal Sayılar', 'EBOB-EKOK', 'Tam Sayılar', 'Üslü Sayılar', 'Köklü Sayılar', 'Rasyonel Sayılar', 'Mutlak Değer', 'Ondalık Sayılar', 'Yüzdeler', 'Oran Orantı'],
    problemler: ['Yaş Problemleri', 'İşçi Problemleri', 'Havuz Problemleri', 'Hız Problemleri', 'Karışım Problemleri', 'Kar-Zarar', 'Sayı Problemleri', 'Rakam Problemleri', 'Kesir Problemleri'],
    geometri: ['Üçgenler', 'Dörtgenler', 'Çember ve Daire', 'Alan Hesaplama', 'Açılar', 'Benzerlik', 'Pisagor Teoremi', 'Koordinat Geometri'],
    denklemler: ['1. Derece Denklemler', 'Denklem Sistemleri', 'Eşitsizlikler', 'Mutlak Değerli Denklemler'],
    fonksiyonlar: ['Fonksiyon Kavramı', 'Bileşke Fonksiyon', 'Ters Fonksiyon', 'Polinom'],
    olasilik: ['Permütasyon', 'Kombinasyon', 'Olasılık', 'Veri Analizi', 'İstatistik'],
  },
  turkce: {
    paragraf: ['Ana Düşünce', 'Yardımcı Düşünce', 'Paragraf Tamamlama', 'Paragraf Sıralama', 'Başlık Belirleme'],
    dil_bilgisi: ['Sözcük Türleri', 'Cümle Öğeleri', 'Fiil Çekimi', 'Ek ve Kök', 'Yapım Ekleri'],
    sozcuk: ['Eş Anlamlı', 'Zıt Anlamlı', 'Mecaz Anlam', 'Deyimler', 'Atasözleri'],
    anlam_bilgisi: ['Cümle Anlamı', 'Söz Yorumu', 'Anlam İlişkileri'],
    yazim_kurallari: ['Noktalama', 'Yazım Kuralları', 'Büyük Harf Kullanımı'],
  },
  fen: {
    fizik: ['Kuvvet ve Hareket', 'Enerji', 'Isı ve Sıcaklık', 'Basınç', 'Elektrik', 'Dalgalar', 'Optik'],
    kimya: ['Atom ve Periyodik Tablo', 'Kimyasal Bağlar', 'Asit-Baz', 'Karışımlar', 'Kimyasal Tepkimeler', 'Mol Kavramı'],
    biyoloji: ['Hücre', 'Canlıların Sınıflandırılması', 'Ekosistem', 'Kalıtım', 'DNA ve Gen', 'Sindirim Sistemi', 'Dolaşım Sistemi'],
  },
  sosyal: {
    tarih: ['İlk Türk Devletleri', 'Osmanlı Kuruluş', 'Osmanlı Yükseliş', 'Tanzimat', 'Kurtuluş Savaşı', 'Atatürk İnkılapları', 'Çok Partili Dönem'],
    cografya: ['İklim', 'Nüfus', 'Göç', 'Harita Bilgisi', 'Türkiye Coğrafyası', 'Doğal Afetler', 'Ekonomik Coğrafya'],
    felsefe: ['Felsefenin Alanı', 'Bilgi Felsefesi', 'Ahlak Felsefesi', 'Mantık', 'Psikoloji', 'Sosyoloji'],
    sosyoloji: [
      'Toplum ve Birey', 'Sosyal Yapı', 'Toplumsal Kurumlar',
      'Toplumsal Değişme', 'Aile', 'Kültür ve Toplum',
      'Din ve Toplum', 'Eğitim ve Toplum',
      'Toplumsal Tabakalaşma', 'Toplumsal Hareketlilik',
    ],
  },
  wordquest: {
    vocabulary: ['Synonyms', 'Antonyms', 'Contextual Meaning', 'Word Families', 'Collocations'],
    grammar: ['Tenses', 'Conditionals', 'Passive Voice', 'Relative Clauses', 'Modals'],
    cloze_test: ['Reading Comprehension', 'Vocabulary in Context'],
    dialogue: ['Daily Conversations', 'Formal Situations'],
    restatement: ['Sentence Rewriting', 'Paraphrasing'],
    sentence_completion: ['Grammar Completion', 'Vocabulary Completion'],
    phrasal_verbs: ['Common Phrasal Verbs', 'Idiomatic Expressions'],
  },
}

const CATEGORY_LABELS = {
  sayilar: 'Sayılar ve İşlemler', problemler: 'Problemler', geometri: 'Geometri',
  denklemler: 'Denklemler', fonksiyonlar: 'Fonksiyonlar', olasilik: 'Olasılık ve İstatistik',
  paragraf: 'Paragraf Anlama', dil_bilgisi: 'Dil Bilgisi', sozcuk: 'Sözcük Anlamı',
  anlam_bilgisi: 'Anlam Bilgisi', yazim_kurallari: 'Yazım Kuralları',
  fizik: 'Fizik', kimya: 'Kimya', biyoloji: 'Biyoloji',
  tarih: 'Tarih', cografya: 'Coğrafya', felsefe: 'Felsefe ve Mantık', sosyoloji: 'Sosyoloji',
  vocabulary: 'İngilizce Kelime Bilgisi', grammar: 'İngilizce Dilbilgisi',
  cloze_test: 'İngilizce Boşluk Doldurma', dialogue: 'İngilizce Diyalog',
  restatement: 'İngilizce Yeniden İfade', sentence_completion: 'İngilizce Cümle Tamamlama',
  phrasal_verbs: 'İngilizce Phrasal Verbs',
}

const CEFR_GUIDANCE = {
  A1: 'A1 — Beginner: en temel 500-1000 kelime, simple present/past, kisa cumleler, gunluk konular',
  A2: 'A2 — Elementary: yaygin 2000 kelime, present/past/future basics, simple connectors',
  B1: 'B1 — Intermediate: 3000-4000 kelime, present perfect, 1st conditional, passive basics',
  B2: 'B2 — Upper-Intermediate: idioms, phrasal verbs, 2nd-3rd conditional, reported speech',
  C1: 'C1 — Advanced: nuanced vocabulary, complex structures, abstract topics, formal register',
  C2: 'C2 — Mastery: idiomatic native-like vocabulary, sophisticated structures, abstract topics',
}

const PROMPT_FALLBACK = `Sen YKS soru üretiyorsun. Kategori: {categoryLabel}.
- Her soru 5 seçenekli (A-E), 1 doğru cevap (index 0-4)
- {langRule}
- Zorluk seviyesine uygun, çözüm kısa ve net olmalı
- JSON formatında döndür
{topicList}

ÇIKTI FORMATI — JSON key isimleri İngilizce olmalı:
[{"question":"Soru metni","options":["A","B","C","D","E"],"answer":0,"solution":"Çözüm","topic":"Konu"}]

KRİTİK: JSON anahtarları MUTLAKA "question", "options", "answer", "solution", "topic" olmalı.
Türkçe key KULLANMA. SADECE JSON döndür, başka hiçbir şey yazma.`

function buildSystemPrompt(g, c, lvl) {
  const isEnglish = g === 'wordquest'
  const categoryLabel = CATEGORY_LABELS[c] || c
  const topics = TOPIC_MAP[g]?.[c] || []
  const topicList = topics.length > 0 ? `\nBu kategorideki YKS konulari: ${topics.join(', ')}` : ''
  const cefrLine = isEnglish && lvl && CEFR_GUIDANCE[lvl]
    ? `\nCEFR seviyesi: ${CEFR_GUIDANCE[lvl]}. Soru zorlugu bu seviyeye uygun olmali.`
    : ''
  const langRule = isEnglish
    ? `Soru metni İngilizce, çözüm Türkçe olmalı.${cefrLine}`
    : 'Türkçe yazılmalı'

  const tpl = process.env.QUESTION_GEN_PROMPT_TEMPLATE || PROMPT_FALLBACK
  return tpl
    .replace(/\{categoryLabel\}/g, categoryLabel)
    .replace(/\{langRule\}/g, langRule)
    .replace(/\{topicList\}/g, topicList)
}

// ── trLower (route ile ayni) ────────────────────────
const TR_MAP = { 'İ': 'i', 'I': 'i', 'Ş': 's', 'Ç': 'c', 'Ğ': 'g', 'Ü': 'u', 'Ö': 'o' }
function trLower(s) {
  let out = ''
  for (const ch of s) out += TR_MAP[ch] ?? ch.toLowerCase()
  return out
}

// ── Effective level_tag: route ile ayni davranis ─────
const effectiveLevelTag = level_tag ?? (game === 'wordquest' ? 'B2' : null)

// ── Main ─────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

console.log(`\n=== AI Soru Uretim ===`)
console.log(`Game:       ${game}`)
console.log(`Category:   ${category}`)
console.log(`Difficulty: ${difficulty}/5`)
console.log(`Level tag:  ${effectiveLevelTag ?? '(NULL)'}`)
console.log(`Count:      ${count}`)
console.log(`Model:      ${GEMINI_MODEL}\n`)

// ── Few-shot ───────────────────────────────
let fewShotText = ''
{
  const { data: examples } = await supabase
    .from('questions')
    .select('content')
    .eq('game', game)
    .eq('category', category)
    .eq('is_active', true)
    .limit(3)

  if (examples && examples.length > 0) {
    const formatted = examples.map((e, i) => {
      const c = e.content ?? {}
      const q = c.question || c.sentence || ''
      const opts = (c.options || []).map((o, j) => `  ${String.fromCharCode(65 + j)}) ${o}`).join('\n')
      return `Ornek ${i + 1}:\nSoru: ${q}\n${opts}\nDogru: ${String.fromCharCode(65 + (c.answer ?? 0))}\nCozum: ${c.solution || '-'}`
    })
    fewShotText = `\n\nMEVCUT ORNEKLER (bunlara benzer ama FARKLI sorular uret):\n${formatted.join('\n\n')}`
    console.log(`Few-shot: ${examples.length} ornek bulundu.`)
  } else {
    console.log(`Few-shot: ornek soru yok (yeni kategori).`)
  }
}

// ── Duplicate prefix set ───────────────────
const existingPrefixes = new Set()
{
  const { data: existing } = await supabase
    .from('questions')
    .select('content')
    .eq('game', game)
    .eq('category', category)
    .limit(500)

  if (existing) {
    for (const e of existing) {
      const c = e.content ?? {}
      const text = trLower((c.question || c.sentence || '').slice(0, 50))
      if (text) existingPrefixes.add(text)
    }
  }
  console.log(`Dup-prefix set: ${existingPrefixes.size} mevcut soru.`)
}

// ── Gemini call ─────────────────────────────
const categoryLabel = CATEGORY_LABELS[category] || category
const userPrompt = `${count} adet ${categoryLabel} sorusu uret.
Oyun: ${game}
Kategori: ${category}
${effectiveLevelTag && game === 'wordquest' ? `CEFR: ${effectiveLevelTag}\n` : ''}Zorluk: ${difficulty}/5
Soru sayisi: ${count}${fewShotText}`

console.log(`\nGemini'ye gonderiliyor...`)
const startTs = Date.now()

const res = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    system_instruction: { parts: [{ text: buildSystemPrompt(game, category, effectiveLevelTag) }] },
    contents: [{ parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    },
  }),
})

const elapsedMs = Date.now() - startTs
console.log(`Gemini yanit ${elapsedMs}ms, status ${res.status}.`)

const json = await res.json().catch(() => null)
if (!json) {
  console.error('HATA: Gemini gecersiz JSON dondu')
  console.error(await res.text().catch(() => ''))
  process.exit(2)
}

const text = json.candidates?.[0]?.content?.parts?.[0]?.text
if (!text) {
  console.error('HATA: Gemini text uretmedi')
  console.error(JSON.stringify(json, null, 2).slice(0, 1000))
  process.exit(2)
}

// ── Parse ────────────────────────────────────
let questions
try {
  questions = JSON.parse(text)
} catch {
  // Markdown code block fallback (route ile ayni)
  const match = text.match(/\[[\s\S]*\]/)
  if (match) {
    const cleaned = match[0]
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/[\x00-\x1F\x7F]/g, ' ')
      .replace(/\n/g, ' ')
    questions = JSON.parse(cleaned)
  } else {
    console.error('HATA: JSON parse basarisiz, raw:', text.slice(0, 500))
    process.exit(2)
  }
}

if (!Array.isArray(questions)) {
  console.error('HATA: AI dizi dondurmedi, raw:', JSON.stringify(questions).slice(0, 500))
  process.exit(2)
}

console.log(`Parse: ${questions.length} soru cikti.`)

// ── Validate (route'taki Zod sema'sinin manuel kopyasi) ──
function validate(q) {
  if (typeof q?.question !== 'string' || q.question.length < 10 || q.question.length > 2000) return 'question metni 10-2000 karakter'
  if (!Array.isArray(q.options) || q.options.length !== 5) return 'options 5 elemanli array'
  for (let i = 0; i < 5; i++) if (typeof q.options[i] !== 'string' || q.options[i].length < 1 || q.options[i].length > 500) return `options[${i}] 1-500 karakter`
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 4) return 'answer 0-4 integer'
  if (typeof q.solution !== 'string' || q.solution.length < 5 || q.solution.length > 3000) return 'solution 5-3000 karakter'
  return null
}

const valid = []
for (let i = 0; i < questions.length; i++) {
  const err = validate(questions[i])
  if (err) {
    console.warn(`  Soru #${i + 1} reddedildi: ${err}`)
  } else {
    valid.push(questions[i])
  }
}
console.log(`Validate: ${valid.length}/${questions.length} sorun gecti.`)

// ── Dedup ────────────────────────────────────
const unique = []
let dupCount = 0
for (const q of valid) {
  const prefix = trLower(q.question.slice(0, 50))
  if (existingPrefixes.has(prefix)) {
    dupCount++
  } else {
    existingPrefixes.add(prefix)
    unique.push(q)
  }
}
console.log(`Dedup: ${unique.length} unique, ${dupCount} mevcut soru ile cakisma.`)

if (unique.length === 0) {
  console.error('HATA: Tum uretilen sorular ya gecersiz ya da mevcut sorularla cakisiyor')
  process.exit(3)
}

// ── JSON audit dump ──────────────────────────
const generatedDir = join(__dirname, 'generated')
if (!existsSync(generatedDir)) mkdirSync(generatedDir, { recursive: true })

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const auditPath = join(generatedDir, `${ts}-${game}-${category}${effectiveLevelTag ? '-' + effectiveLevelTag : ''}.json`)
writeFileSync(auditPath, JSON.stringify({
  takenAt: new Date().toISOString(),
  game,
  category,
  difficulty,
  level_tag: effectiveLevelTag,
  count: unique.length,
  duplicate_count: dupCount,
  raw_count: questions.length,
  valid_count: valid.length,
  questions: unique,
}, null, 2), 'utf-8')
console.log(`\nAudit JSON: ${auditPath}`)

// ── DB insert (is_active=false) ──────────────
const insertData = unique.map((q) => ({
  game,
  category,
  topic: q.topic ?? null,
  difficulty,
  level_tag: effectiveLevelTag,
  content: {
    question: q.question,
    options: q.options,
    answer: q.answer,
    solution: q.solution,
  },
  source: 'ai_generated',
  is_active: false,
}))

const { data: inserted, error } = await supabase.from('questions').insert(insertData).select('id')
if (error) {
  console.error('HATA: DB insert basarisiz:', error.message)
  process.exit(4)
}

console.log(`\n=== TAMAM ===`)
console.log(`DB'ye eklendi: ${inserted?.length ?? 0} soru (is_active=false, manuel review gerekli)`)
console.log(`Admin UI: /admin/sorular?active=false&game=${game}&category=${category}\n`)
