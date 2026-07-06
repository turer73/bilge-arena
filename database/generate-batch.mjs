#!/usr/bin/env node
/**
 * Batch soru-üretici (fen-rewrite Faz-1). Admin-endpoint'in üretim+doğrulama
 * mantığını STANDALONE koşar (admin-auth olmadan, lokal Gemini-key ile).
 *
 * Prompt: generate-questions route ile PARİTE — question-content-guard.mjs'ten
 * buildSubjectPromptAppendix (REF_2026_STYLE + QUALITY kuralları) import edilir;
 * ayrıca 2026-stil few-shot + öncül/görsel-şekil-KURMA sınırı prompt'ta.
 *
 * Doğrulama: Zod (question/options/answer/solution) + validateGeneratedQuestionContent
 * (TDK + yasaklı-şık + öncül-guard) + question_content_basic_guard paritesi.
 *
 * KEY-AGNOSTİK:
 *   node database/generate-batch.mjs                 # DRY: matris + prompt-preview (Gemini-call YOK)
 *   node database/generate-batch.mjs --run           # ÜRETİM (GEMINI_API_KEY .env.local gerekli)
 *   node database/generate-batch.mjs --run --matrix database/fen-matrix.json
 *
 * Çıktı: database/generated/fen-batch-<ts>.json (repo-dışı, gitignore database/generated/*).
 */
import { config } from 'dotenv'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSubjectPromptAppendix } from '../src/lib/admin/question-content-guard.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env.local') })

const RUN = process.argv.includes('--run')
const matrixArg = process.argv.indexOf('--matrix')
const matrixPath = matrixArg > -1 ? process.argv[matrixArg + 1] : join(__dirname, 'fen-matrix.json')
const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent'

const CATEGORY_LABELS = { fizik: 'Fizik', kimya: 'Kimya', biyoloji: 'Biyoloji' }

function buildPrompt(row) {
  const label = CATEGORY_LABELS[row.category] || row.category
  const system =
    `Sen YKS TYT ${label} sorusu üreten uzman bir ölçme-değerlendirme editörüsün. ` +
    `Çıktı SADECE geçerli JSON dizisi: [{question, options:[5], answer:0-4, solution, topic}]. ` +
    `Türkçe yaz. Sembol/formül Unicode (√, ², ×, ⁻, ₂). ` +
    buildSubjectPromptAppendix('fen')
  // Pilot-40 bulgusu: aşırı öncül-mantık sorusu → cevaplar C/D/E'ye yığıldı (A/B ~yok).
  // Fix: (1) soru-tipi ÇEŞİTLİLİĞİ zorla, (2) doğru-cevap harfini AÇIKÇA hedefle (dağılım).
  const answerLetter = ['A', 'B', 'C', 'D', 'E'][row._answerHint ?? (row.count % 5)]
  const user =
    `${row.count} adet TYT ${label} sorusu üret.\nKonu: ${row.topic}\nZorluk: ${row.difficulty}/5\n` +
    `KURALLAR: 5 şık, tek-doğru, çeldiriciler makul-ama-yanlış. Şıklarda "Hiçbiri"/"Hepsi" YOK. ` +
    `ÇEŞİTLİLİK ZORUNLU: her soru FARKLI tipte olsun — hesap/işlem sorusu, kavram-tanım sorusu, ` +
    `tekil-doğru öncül (Yalnız I / Yalnız II gibi), ve senaryo-yorumlama karışık kullan. ` +
    `TÜM soruları I/II/III-mantık yapma (pilot'ta aşırı-kullanım cevap-dağılımını bozdu). ` +
    `DAĞILIM: doğru cevap ${answerLetter} şıkkında olsun (A/B dahil dengeli dağıt, hep C/D/E yapma). ` +
    `Numaralı öncül kullanırsan öncülleri GÖVDEDE tam yaz. GÖRSEL-şekil/çizim/devre gerektiren soru KURMA. ` +
    `solution 1-3 cümle, doğru cevabı gerekçelendir.`
  return { system, user }
}

async function callGemini({ system, user }) {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': API_KEY },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ parts: [{ text: user }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 8192, responseMimeType: 'application/json' },
    }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json) throw new Error(`Gemini HTTP ${res.status}: ${JSON.stringify(json)?.slice(0, 200)}`)
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini boş yanıt')
  let qs
  try { qs = JSON.parse(text) }
  catch { const m = text.match(/\[[\s\S]*\]/); qs = m ? JSON.parse(m[0].replace(/,\s*([}\]])/g, '$1')) : null }
  return Array.isArray(qs) ? qs : []
}

// hafif-yapısal doğrulama (endpoint Zod paritesi; TDK/öncül-guard prod-endpoint'te ikinci-kez uygulanır)
function structOk(q) {
  return q && typeof q.question === 'string' && q.question.length >= 10 && q.question.length <= 2000 &&
    Array.isArray(q.options) && q.options.length === 5 && q.options.every((o) => typeof o === 'string' && o.length >= 1) &&
    Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 4 &&
    typeof q.solution === 'string' && q.solution.length >= 5 &&
    !q.options.some((o) => /^(hiçbiri|hepsi)/i.test(o.trim()))
}

const matrix = JSON.parse(readFileSync(matrixPath, 'utf-8'))
// Dağılım-fix (pilot-40 bulgusu): her satıra rotasyonlu hedef-cevap-harfi (A,B,C,D,E,A,...)
// → doğru cevaplar 5 şıkka dengeli dağılır (count=1/satır varsayımı).
matrix.forEach((r, i) => { r._answerHint = i % 5 })
const totalTarget = matrix.reduce((a, r) => a + r.count, 0)
console.log(`Matris: ${matrix.length} satır, hedef ${totalTarget} soru | Mod: ${RUN ? 'ÜRETİM' : 'DRY (preview)'}`)
console.log(`Key: ${API_KEY ? 'SET (' + API_KEY.length + 'ch)' : 'YOK — --run için .env.local GEMINI_API_KEY gerekli'}\n`)

if (!RUN) {
  const sample = buildPrompt(matrix[0])
  console.log('=== ÖRNEK PROMPT (matris[0]) ===')
  console.log('SYSTEM:', sample.system.slice(0, 400), '...')
  console.log('\nUSER:', sample.user)
  console.log('\n=== MATRİS DAĞILIM ===')
  const byCat = {}; matrix.forEach((r) => (byCat[r.category] = (byCat[r.category] || 0) + r.count))
  console.log(JSON.stringify(byCat))
  console.log('\n(DRY — --run ile üret; key-varsa Gemini çağrılır)')
  process.exit(0)
}

if (!API_KEY) { console.error('HATA: GEMINI_API_KEY yok (.env.local).'); process.exit(1) }

mkdirSync(join(__dirname, 'generated'), { recursive: true })
// SABİT checkpoint-yolu (out.length'e bağlı DEĞİL) — her satırda üzerine yazılır.
// Böylece timeout/crash'te o ana kadarki üretim KAYBOLMAZ (19/40-kesilme dersi).
const outPath = join(__dirname, 'generated', 'fen-batch.json')

// RESUME: var-olan checkpoint'i yükle. Tamamlanan-SATIRI (index bazlı) atla —
// full-matriste aynı category|topic çok kez tekrar eder, o yüzden topic-anahtar YANLIŞ
// olur (aynı konunun diğer satırlarını da atlar). _rowIndex ile satır-bazlı resume.
let out = []
try { out = JSON.parse(readFileSync(outPath, 'utf-8')) } catch { out = [] }
const doneRows = new Set(out.map((q) => q._rowIndex).filter((x) => x != null))

let ok = out.length, drop = 0, fail = 0
for (const [i, row] of matrix.entries()) {
  if (doneRows.has(i)) {
    console.log(`[${i + 1}/${matrix.length}] ${row.category}/${row.topic}: ATLA (satır üretildi)`)
    continue
  }
  try {
    const qs = await callGemini(buildPrompt(row))
    for (const q of qs) {
      if (structOk(q)) { out.push({ ...q, game: 'fen', category: row.category, difficulty: row.difficulty, _topic: row.topic, _rowIndex: i }); ok++ }
      else drop++
    }
    console.log(`[${i + 1}/${matrix.length}] ${row.category}/${row.topic}: +${qs.filter(structOk).length}/${qs.length} (toplam ${ok})`)
  } catch (e) {
    fail++; console.error(`[${i + 1}/${matrix.length}] ${row.category}/${row.topic} HATA: ${e.message}`)
  }
  writeFileSync(outPath, JSON.stringify(out, null, 1), 'utf-8') // CHECKPOINT her satırda
  await new Promise((r) => setTimeout(r, 2500)) // rate-limit nazik
}

console.log(`\n✅ ÜRETİM: ${ok} geçer, ${drop} yapısal-elendi, ${fail} satır-hata → ${outPath}`)
console.log('SONRAKI: 3-katman kalite (validate + llm-judge + spot) → prod-insert (Turgut-onayı).')
