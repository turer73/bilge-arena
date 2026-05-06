#!/usr/bin/env node
/**
 * yazim_kurallari ozel AI uretici — TDK 2023 Yazim Kurallari rehberli
 * --------------------------------------------------------------
 * run-generation.mjs basarisiz oldu (PR #114'te 16/16 reject) cunku
 * generic prompt TDK kurallarini ters uyguladi. Bu CLI:
 * - TDK kurallarini system prompt'a gomulu (5 ana kural seti)
 * - Few-shot 3 GERCEK kaliteli ornek (mevcut DB'den)
 * - "Anti-pattern" listesi (Codex P2 + audit'te bulunan hatalar)
 * - Insert source='ai_generated_v2', is_active=false
 *
 * Kullanim:
 *   node database/run-generation-yazim.mjs <difficulty> [count]
 *
 * Ornek:
 *   node database/run-generation-yazim.mjs 2 5
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
  console.error('HATA: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env gerekli'); process.exit(1)
}
if (!GEMINI_API_KEY) {
  console.error('HATA: GOOGLE_GENERATIVE_AI_API_KEY env gerekli'); process.exit(1)
}

const [, , difficultyArg, countArg, topicArg] = process.argv
const difficulty = parseInt(difficultyArg ?? '2', 10)
const count = parseInt(countArg ?? '5', 10)
const topic = topicArg && topicArg !== '--' ? topicArg : null

if (![1, 2, 3, 4, 5].includes(difficulty)) {
  console.error('HATA: difficulty 1-5'); process.exit(1)
}

const GEMINI_MODEL = process.env.GEMINI_MODEL_OVERRIDE || 'gemini-2.5-pro'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const TDK_RULES_PROMPT = `Sen TDK (Turk Dil Kurumu) 2023 Yazim Kurallari konusunda uzman bir Turkce ogretmenisin. Asagidaki kurallari TAM olarak biliyor ve UYGULANABILIYOR.

==================================================================
TDK KURAL OZETI (5 KATEGORI)
==================================================================

1. KESME ISARETI (')
   ✓ Ozel isimlere gelen CEKIM EKLERI kesme ile: Ankara'ya, Ali'nin, Turkiye'de
   ✓ Kisaltmalara gelen cekim ekleri kesme ile: TBMM'nin, MEB'e, BM'ye
   ✗ YAPIM EKLERI kesme almaz: Turkce (Turk + ce yapim eki), Turkcu, Antalyalı
   ✗ Kisaltmalara gelen YAPIM EKI kesme almaz: TDK'li degil TDKli (yapim eki)

2. BAGLAC DA/DE/Kİ vs EK -DA/-DE/-Kİ
   AYRI yazilan BAGLAC:
   ✓ "Sen de mi geldin?" — bagrac "de"
   ✓ "Bu kitabi ben de aldim." — bagrac "de"
   ✓ "Baktim ki kimse yok" — bagrac "ki"
   BITISIK yazilan EK:
   ✓ "Rafta", "Evde" — hal eki -da/-de (bulunma hali)
   ✓ "Evdeki kitap" — ilgi zamiri -ki
   ✓ "Yarinki toplanti" — ilgi zamiri -ki (zaman kelimesinden sonra)

3. BITISIK/AYRI YAZIM
   Her zaman BITISIK: herkes, biraz, hicbir, birkac, birtakim, hicbiri,
                     bircok, herhangi, birsey
   Her zaman AYRI:    her sey, bir sey, her bir, bir gun, bir kez,
                     bu yilki (zaman + ki), o gunku

4. IKILEMELER
   PEKISTIRME (bitisik): masmavi, simsiyah, yepyeni, capcanli
   TEKRAR (ayri):        kosa kosa, yavas yavas, parca parca
                          eksik eksik, akin akin

5. SAYI YAZIMI
   Saatler nokta ile: 14.30 (kesme cekim eki ile alir: 14.30'da, 09.00'da)
   Yil aralig kisa cizgi: 2023-2024 (kesmesiz)
   Para: 100.000 TL VEYA 100 bin TL (her ikisi de TDK uygun, ikiside dogru)

==================================================================
ANTI-PATTERN — KESINLIKLE YAPMA
==================================================================

❌ "X yerine X yazilmali" gibi tekrar eden iki ayni kelime
❌ "Sorunun kendisinde hata var" / "ancak ... ancak" gibi celiskili cozumler
❌ Cevap olarak isaretlenen secenek ZATEN dogru yazilmis (kendi-celisen soru)
❌ "TBMM'nin yerine TBMMnin" gibi TDK'ye gore yanlis cozum
❌ "Antalya'ya yerine Antalyaya" gibi ozel isim cekim eki YANLIS iddia
❌ "Bu yilki ayri yazilir" — YANLIS, "bu yilki" ZAMAN+ki, ayri yazilmaz mi?
   Aslinda TDK: "bu yilki" AYRI yazilir cunku zaman bildiren isim sonu degil
   ama "yarinki" (zaman zarfi sonu ki) BITISIK yazilir.

==================================================================
URETIM KURALLARI
==================================================================

✓ 5 secenek (A-E), 1 dogru cevap (index 0-4)
✓ Cevap olarak isaretlenen secenek MUTLAKA kuralin DOGRU uygulanmis halini icermeli
✓ Diger 4 secenek MUTLAKA kuralin yanlis uygulanmis halini icermeli
✓ Cozum metni cevap secenegi desteklemeli, KURALI ACIKCA NETIKLEMELI (5-50 kelime)
✓ Soru kategorisi: TDK yazim kurallari (kesme, da/de/ki, bitisik/ayri, ikileme, sayi, buyuk harf)
✓ KENDI uretdigin sorudan EMIN OL: 5 secenegi tek tek kontrol et — sadece 1 dogru olmali

==================================================================
CIKTI FORMATI — JSON
==================================================================

[{"question":"Soru metni","options":["secenek1","secenek2","secenek3","secenek4","secenek5"],"answer":0,"solution":"Cozum","topic":"Konu basligi"}]

JSON anahtarlari MUTLAKA: question, options, answer, solution, topic
SADECE JSON dondur, baska metin YOK.`

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

console.log('=== yazim_kurallari TDK-rehberli AI uretim ===')
console.log('Difficulty:', difficulty + '/5')
console.log('Count:', count)
console.log('Topic:', topic ?? '(cesitli)')
console.log('Model:', GEMINI_MODEL, '\n')

// Few-shot: mevcut iyi sorulardan 3 tane
const { data: examples } = await supabase
  .from('questions')
  .select('content')
  .eq('game', 'turkce').eq('category', 'yazim_kurallari')
  .eq('is_active', true).neq('source', 'ai_generated').neq('source', 'ai_generated_v2')
  .limit(3)

let fewShot = ''
if (examples && examples.length > 0) {
  fewShot = '\n\nFEW-SHOT ORNEKLER (BENZER STILDE FARKLI SORU URET):\n'
  for (let i = 0; i < examples.length; i++) {
    const c = examples[i].content ?? {}
    fewShot += `\nOrnek ${i + 1}:\nSoru: ${c.question}\n`
    for (let j = 0; j < (c.options ?? []).length; j++) {
      fewShot += `  ${String.fromCharCode(65 + j)}) ${c.options[j]}\n`
    }
    fewShot += `Dogru: ${String.fromCharCode(65 + (c.answer ?? 0))}\nCozum: ${c.solution}\n`
  }
  console.log(`Few-shot: ${examples.length} ornek yuklendi.`)
}

// Existing prefix set (dedup)
const { data: existing } = await supabase
  .from('questions')
  .select('content')
  .eq('game', 'turkce').eq('category', 'yazim_kurallari').limit(500)

const TR_MAP = { 'İ': 'i', 'I': 'i', 'Ş': 's', 'Ç': 'c', 'Ğ': 'g', 'Ü': 'u', 'Ö': 'o' }
const trLower = s => { let o = ''; for (const c of s) o += TR_MAP[c] ?? c.toLowerCase(); return o }
const existingPrefixes = new Set()
for (const e of existing ?? []) {
  const text = trLower((e.content?.question ?? '').slice(0, 50))
  if (text) existingPrefixes.add(text)
}
console.log(`Dedup prefix set: ${existingPrefixes.size}`)

// Gemini call
const topicFocus = topic
  ? `Sadece "${topic}" konusunda soru uret (DIGER konulari KULLANMA).`
  : 'Konu cesitliligi (her batch\'te farkli): kesme isareti, da/de/ki bagrac, bitisik/ayri yazim, ikileme, sayi yazimi, buyuk harf'

const userPrompt = `${count} adet TDK Yazim Kurallari sorusu uret.
Zorluk: ${difficulty}/5
${topicFocus}
${fewShot}`

console.log('\nGemini cagriliyor...')
const startTs = Date.now()
const res = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    system_instruction: { parts: [{ text: TDK_RULES_PROMPT }] },
    contents: [{ parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.85,
      maxOutputTokens: 8192, // pro thinking-mode 4096'i tuketebilir, response icin yer birak
      responseMimeType: 'application/json',
    },
  }),
})

const elapsed = Date.now() - startTs
console.log(`Gemini ${elapsed}ms status ${res.status}`)
const json = await res.json().catch(() => null)
if (!json) { console.error('JSON parse fail'); process.exit(2) }

const text = json.candidates?.[0]?.content?.parts?.[0]?.text
if (!text) { console.error('No text:', JSON.stringify(json).slice(0, 500)); process.exit(2) }

let questions
try { questions = JSON.parse(text) }
catch (e1) {
  const m = text.match(/\[[\s\S]*\]/)
  if (m) {
    const cleaned = m[0]
      .replace(/,\s*([}\]])/g, '$1')          // trailing comma
      .replace(/[\x00-\x1F\x7F]/g, ' ')        // control chars
      .replace(/\\\n/g, ' ')                    // escaped newlines
      .replace(/\n/g, ' ')                      // raw newlines in strings
    try { questions = JSON.parse(cleaned) }
    catch (e2) {
      console.error('Parse fail. e1:', e1.message, '| e2:', e2.message)
      console.error('Raw text excerpt (first 2000):', text.slice(0, 2000))
      console.error('Around error position:', text.slice(2300, 2400))
      process.exit(2)
    }
  } else {
    console.error('Cannot extract JSON. Raw:', text.slice(0, 1000))
    process.exit(2)
  }
}

if (!Array.isArray(questions)) { console.error('Not array'); process.exit(2) }
console.log(`Parse: ${questions.length} soru`)

// Validate
function validate(q) {
  if (typeof q?.question !== 'string' || q.question.length < 10 || q.question.length > 2000) return 'question 10-2000 char'
  if (!Array.isArray(q.options) || q.options.length !== 5) return 'options 5 array'
  for (let i = 0; i < 5; i++)
    if (typeof q.options[i] !== 'string' || q.options[i].length < 1 || q.options[i].length > 500) return `options[${i}] 1-500 char`
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

// Dedup
const unique = []
let dupCount = 0
for (const q of valid) {
  const p = trLower(q.question.slice(0, 50))
  if (existingPrefixes.has(p)) dupCount++
  else { existingPrefixes.add(p); unique.push(q) }
}
console.log(`Dedup: ${unique.length} unique, ${dupCount} cakisma`)

if (unique.length === 0) { console.error('HATA: 0 unique'); process.exit(3) }

// Audit dump
const generatedDir = join(__dirname, 'generated')
if (!existsSync(generatedDir)) mkdirSync(generatedDir, { recursive: true })
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const auditPath = join(generatedDir, `${ts}-yazim-tdk-d${difficulty}.json`)
writeFileSync(auditPath, JSON.stringify({
  takenAt: new Date().toISOString(),
  game: 'turkce', category: 'yazim_kurallari', difficulty,
  prompt_version: 'tdk-rehberli-v2',
  count: unique.length, valid_count: valid.length, raw_count: questions.length,
  questions: unique,
}, null, 2), 'utf-8')
console.log(`Audit: ${auditPath}`)

// Insert
const insertData = unique.map(q => ({
  game: 'turkce', category: 'yazim_kurallari',
  topic: q.topic ?? null,
  difficulty,
  level_tag: null,
  content: { question: q.question, options: q.options, answer: q.answer, solution: q.solution },
  source: 'ai_generated_v2', // YENI source: TDK-rehberli
  is_active: false,
}))

const { data: inserted, error } = await supabase.from('questions').insert(insertData).select('id')
if (error) { console.error('Insert error:', error.message); process.exit(4) }
console.log(`\nDB'ye eklendi: ${inserted?.length ?? 0} (source=ai_generated_v2, is_active=false)\n`)
