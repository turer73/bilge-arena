#!/usr/bin/env node
/**
 * TDK Rewrite — ASCII Türkçe yazılmış soruları diakritik ile düzelt
 * Anlam/seçenek/cevap değişmez, yalnız karakter düzeltir.
 * Input: _ascii-heavy.json (id, content)
 * Output: _tdk-rewrite-report.json + DB PATCH
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
  }
}
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!GEMINI_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('GEMINI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY gerekli')
  process.exit(1)
}

const inputFile = join(__dirname, '_ascii-heavy.json')
const reportFile = join(__dirname, '_tdk-rewrite-report.json')
const items = JSON.parse(readFileSync(inputFile, 'utf-8'))
console.log(`Toplam: ${items.length} soru`)

const CONCURRENCY = 5
const MODEL = 'gemini-2.5-flash-lite'

const SYS_PROMPT = `Sen TDK uyumlu Türkçe metin düzelticisin. Görev: ASCII karakterlerle (c, g, i, o, s, u) yazılmış Türkçe metni doğru diakritiklerle (ç, ğ, ı, İ, ö, ş, ü) yeniden yaz.

KURALLAR:
1. Anlamı KESİNLİKLE değiştirme — sadece karakter düzelt
2. Kelime sırasını değiştirme
3. Noktalama aynı kalsın
4. Sayılar, formüller, özel adlar olduğu gibi
5. İngilizce kelimeler (CO2, H2O, vb.) olduğu gibi
6. Cevap index'i ve seçenek metinleri korunur, sadece TR karakterleri düzeltilir

ÇIKTI FORMATI (sadece JSON, başka şey yok):
{"question":"düzeltilmiş","solution":"düzeltilmiş","options":["düzeltilmiş1","düzeltilmiş2",...]}`

async function rewriteOne(item) {
  const c = item.content
  const userMsg = `JSON oluştur:
question: ${JSON.stringify(c.question)}
solution: ${JSON.stringify(c.solution)}
options: ${JSON.stringify(c.options)}`

  const body = {
    systemInstruction: { parts: [{ text: SYS_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: userMsg }] }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json', maxOutputTokens: 4096 }
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0,200)}`)
  const data = await res.json()
  const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!txt) throw new Error('Empty response')
  const parsed = JSON.parse(txt)
  return parsed
}

async function patchDB(id, newContent) {
  const url = `${SUPABASE_URL}/rest/v1/questions?id=eq.${id}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({ content: newContent })
  })
  if (!res.ok) throw new Error(`PATCH ${res.status}: ${(await res.text()).slice(0,200)}`)
}

let done = 0, ok = 0, fail = 0
const errors = []
const results = []
const queue = [...items]
const t0 = Date.now()

async function worker() {
  while (queue.length) {
    const item = queue.shift()
    try {
      const rewrite = await rewriteOne(item)
      // Sanity check: options uzunluğu eşit
      if (!rewrite.question || !rewrite.solution || !Array.isArray(rewrite.options) || rewrite.options.length !== item.content.options.length) {
        throw new Error('Invalid rewrite shape')
      }
      const newContent = {
        answer: item.content.answer,
        options: rewrite.options,
        question: rewrite.question,
        solution: rewrite.solution
      }
      await patchDB(item.id, newContent)
      ok++
      results.push({ id: item.id, status: 'ok' })
    } catch (e) {
      fail++
      errors.push({ id: item.id, error: e.message })
    }
    done++
    if (done % 10 === 0) {
      const elapsed = (Date.now() - t0) / 1000
      const rate = done / elapsed
      const eta = ((items.length - done) / rate).toFixed(0)
      process.stdout.write(`\r${done}/${items.length} ok=${ok} fail=${fail} ETA ${eta}s `)
    }
  }
}

await Promise.all(Array(CONCURRENCY).fill(0).map(() => worker()))
console.log(`\nTamamlandi: ${ok} ok, ${fail} fail, sure ${((Date.now()-t0)/1000).toFixed(0)}s`)

writeFileSync(reportFile, JSON.stringify({ summary: { total: items.length, ok, fail }, results, errors }, null, 2))
console.log(`Rapor: ${reportFile}`)
