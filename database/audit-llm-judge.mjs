#!/usr/bin/env node
/**
 * LLM-judge audit — soru havuzu kalite kontrolü
 * --------------------------------------------------------------
 * Regex/heuristic katmanlarının (audit-validate, audit-semantic)
 * yakalayamadığı semantic hataları LLM ile tespit eder:
 *   1. Self-solve: model bağımsız çözer, marked answer ile karşılaştırır
 *   2. Adversarial: belirsizlik, çoklu doğru, gerçek-dışı iddia, zayıf distractor
 *   3. Solution coherence: çözüm metni marked answer'ı destekliyor mu
 *
 * Provider:
 *   - gemini (default): gemini-2.5-flash-lite — 3685 soru ≈ $0.50
 *   - anthropic: claude-haiku-4-5 — ANTHROPIC_API_KEY gerekli
 *
 * Kullanım:
 *   node database/audit-llm-judge.mjs                    # tüm DB
 *   node database/audit-llm-judge.mjs --limit 50
 *   node database/audit-llm-judge.mjs --filter category=tarih --concurrency 8
 *   node database/audit-llm-judge.mjs --provider anthropic --model claude-haiku-4-5
 *   node database/audit-llm-judge.mjs --input my-batch.json --output my-report.json
 *
 * Çıktı: database/audit-llm-judge-report.json
 *   { summary: {...}, flagged: [{id, category, severity, issues, ...}] }
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// .env.local loader (mevcut script pattern)
const envPath = join(__dirname, '..', '.env.local')
if (existsSync(envPath)) {
  const txt = readFileSync(envPath, 'utf-8')
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
  }
}

// Alias: Vercel AI SDK GOOGLE_GENERATIVE_AI_API_KEY kullanir, scriptler GEMINI_API_KEY bekler
if (process.env.GOOGLE_GENERATIVE_AI_API_KEY && !process.env.GEMINI_API_KEY) {
  process.env.GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY
}

// CLI parse
const args = process.argv.slice(2)
const opts = {
  input: join(__dirname, 'audit-claude-batch.json'),
  output: join(__dirname, 'audit-llm-judge-report.json'),
  provider: 'gemini',
  model: null,
  limit: 0,
  filter: {},
  concurrency: 5,
  dryRun: false,
}
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--input') opts.input = resolve(args[++i])
  else if (a === '--output') opts.output = resolve(args[++i])
  else if (a === '--provider') opts.provider = args[++i]
  else if (a === '--model') opts.model = args[++i]
  else if (a === '--limit') opts.limit = parseInt(args[++i], 10)
  else if (a === '--concurrency') opts.concurrency = parseInt(args[++i], 10)
  else if (a === '--dry-run') opts.dryRun = true
  else if (a === '--filter') {
    const [k, v] = args[++i].split('=')
    opts.filter[k] = v
  } else if (a === '--help' || a === '-h') {
    console.log(readFileSync(import.meta.url.replace('file://', ''), 'utf-8').split('\n').slice(0, 24).join('\n'))
    process.exit(0)
  }
}

// Provider config — estCostPerQ = ortalama soru başı USD maliyet
// (varsayım: ~1000 input + 200 output token / soru)
const PROVIDERS = {
  gemini: {
    defaultModel: 'gemini-2.5-flash-lite',
    apiKeyEnv: 'GEMINI_API_KEY',
    endpoint: (m) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,
    estCostPerQ: (1000 * 0.075 + 200 * 0.30) / 1_000_000,
  },
  anthropic: {
    defaultModel: 'claude-haiku-4-5',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    endpoint: () => 'https://api.anthropic.com/v1/messages',
    estCostPerQ: (1000 * 1.0 + 200 * 5.0) / 1_000_000,
  },
  'opencode-zen': {
    defaultModel: 'deepseek-v4-flash-free',
    apiKeyEnv: 'OPENCODE_ZEN_API_KEY',
    endpoint: () => 'https://opencode.ai/zen/v1/chat/completions',
    estCostPerQ: 0,
  },
  // NVIDIA NIM — ücretsiz (kredi yok, ~40 RPM), OpenAI-uyumlu. Gemini spend-cap
  // judge'ı da vuruyordu (default gemini) → cap'siz alternatif. Key: NVIDIA_API_KEY.
  nim: {
    defaultModel: 'deepseek-ai/deepseek-v4-pro',
    apiKeyEnv: 'NVIDIA_API_KEY',
    endpoint: () => 'https://integrate.api.nvidia.com/v1/chat/completions',
    estCostPerQ: 0,
  },
}

const provider = PROVIDERS[opts.provider]
if (!provider) { console.error(`Bilinmeyen provider: ${opts.provider}`); process.exit(1) }
const model = opts.model || provider.defaultModel
// API key check main()'de — module load'unda kontrol unit testleri kırıyor

// JUDGE PROMPT — 3 kontrolün hepsi tek istekte
const SYSTEM = `Sen Türkçe eğitim içerikleri kalite kontrol uzmanısın. YKS/TYT/AYT seviyesi sorularını semantik olarak değerlendiriyorsun.

Bir test sorusu (soru metni, seçenekler, işaretli doğru cevap index'i, çözüm metni) verilecek. Seçenek sayısı 4 (LGS/8. sınıf) veya 5 (YKS/TYT/AYT) olabilir — kullanıcı mesajında kaç seçenek olduğu ve geçerli cevap aralığı belirtilir. Aşağıdaki 3 kontrolü yap:

1. SELF-SOLVE: İşaretli cevaba BAKMADAN, kendi çözümünü üret. Hangi şıkkı doğru buluyorsun?
2. ADVERSARIAL: Soruda hata var mı? (belirsizlik, çoklu doğru cevap, gerçek-dışı iddia, zayıf/saçma distractor)
3. SOLUTION COHERENCE: Çözüm metni işaretli şıkkı gerçekten destekliyor mu?

Yanıtın TAM olarak şu JSON formatında, başka metin yok:

{
  "self_answer": <integer, 0 ile (seçenek sayısı - 1) arası>,
  "confidence": <0.0-1.0 float>,
  "agrees_with_marked": <bool>,
  "solution_supports_marked": <bool>,
  "issues": [<string>, ...],
  "severity": "ok" | "minor" | "major",
  "reasoning_brief": "<1-2 cümle özet>"
}

Severity kuralları:
- "ok": Soru net, cevap doğru, çözüm tutarlı
- "minor": Stil/yazım sorunu, distractor zayıf, ama cevap doğru
- "major": Cevap YANLIŞ, çoklu doğru cevap, gerçek-dışı iddia, anlamsız soru

issues olası değerler: "wrong_answer", "multi_correct", "factual_error", "ambiguous_wording", "weak_distractor", "solution_mismatch", "out_of_scope", "tdk_violation", "requires_visual"

ZORUNLU GUARD'LAR (false positive azaltma — bu kurallar severity'yi belirler):

GUARD 1 — AGREEMENT ROOT:
self_answer == marked_answer ise:
- agrees_with_marked = true
- "wrong_answer" issue EKLEME (mantiken yanlis)
- "solution_mismatch" işaretleyebilirsin AMA reasoning_brief'te çözüm metnindeki SOMUT mismatched sayı/harf'i alıntıla. Sadece "tutarsızlık var" yetersiz, explicit değer farkı göster.
- Eğer somut mismatch yoksa: severity = "ok", issues = []
- Sadece tek başına solution_mismatch varsa: severity = "minor" max, "major" YASAK

GUARD 2 — SEMANTIK NÜANS (sosyoloji/felsefe/tarih/dil bilgisi):
Bu kategorilerde kavram tanımları kaynaklara göre farklılaşabilir:
- Topluluk vs Toplum vs Cemaat (sosyolojide farklı kavramlar — community, society, gemeinschaft)
- Tarihsel başkent (Beylik dönemi vs Devlet dönemi)
- Toplumsal Norm vs Rol vs Statü (statüye bağlı vs genel kural)
- MEB ders kitabı yorumu standart kabul edilebilir
self_answer farklı ama her iki cevap da makul ise:
- severity = "minor" maksimum, "major" YASAK
- issues = ["ambiguous_wording"], wrong_answer EKLEME
- reasoning_brief'te "iki cevap da savunulabilir" belirt

GUARD 3 — CONFIDENCE RUBRIC:
- 0.95-1.0: Soruda explicit matematiksel/sayısal hata (örn: 0.5+0.3=0.7), self-solve sayısal sonucu marked'tan farklı, çözüm de yanlışı doğruluyor. Bu seviye sadece tartışmasız hatalar için.
- 0.7-0.9: Yorum farkı veya kavramsal ambigüite, birden fazla makul cevap var
- 0.5-0.7: Belirsizlik var, verdiğin cevaba tam emin değilsin

GUARD 4 — BAĞLAM HASSASIYETI:
"Bir bölgede sıcaklık-basınç" gibi sorularda BAĞLAM kapalı kap (PV=nRT) değil ATMOSFERİK olabilir. Atmosferik bağlamda sıcaklık↑ → basınç↓ (termik basınç ilkesi).
Soru bağlamı tartışmaya açık ise: severity = "ok", issues = ["ambiguous_wording"]

GUARD 5 — GÖRSEL ZORUNLULUĞU (metin-tabanlı platform):
Bu platform yalnızca METİN gösterir — resim/şekil/grafik render EDİLMEZ. Soru bir görsele referans veriyorsa ("şekildeki", "grafikte", "aşağıdaki resimde", "yandaki devrede" vb.) VE o görsel metin içinde çözülebilir biçimde verilmemişse (ör. tablo/veri metin olarak yazılmamışsa; ASCII-çizim çoğu zaman okunaksız):
- severity = "major", issues = ["requires_visual"]
- reasoning_brief'te hangi görsel öğenin eksik olduğunu belirt
İSTİSNA: gerekli tüm sayısal veri metinde açıkça yazılıysa (görsel yalnız süsse), görselsiz çözülebiliyorsa → bu guard'ı UYGULAMA.

NOT: TDK yazım kontrolü (diakritik kaybı: "acik" yerine "açık" gibi) ayrı bir
deterministic pre-check ile yapılıyor; bu listeye senin tarafından eklenmesi gerekmiyor
ancak gözüne çarpan başka yazım/akademik dil hatasını "minor" olarak flagleyebilirsin.`

function buildUserPrompt(q) {
  const opts = q.options || []
  const letters = ['A', 'B', 'C', 'D', 'E']
  const optionsText = opts.map((o, i) => `${letters[i]}) ${o}`).join('\n')
  const ans = q.answer
  const markedLetter = letters[ans] || '?'
  const n = opts.length
  const maxIdx = Math.max(0, n - 1)
  // Codex#267-P2: content.passage (öncül/tablo/veri) oyun UI'ında soru kökünden ÖNCE
  // render edilir (question-card.tsx). Judge'a dahil edilmezse, verisi passage'da olan
  // sorular yanlışlıkla "requires_visual"/çözülemez sanılır (GUARD 5 false-positive).
  const passage = q.passage || q.content?.passage || ''
  const passageBlock = passage ? `Öncül/tablo/veri (soru kökünden önce öğrenciye gösterilir):\n${passage}\n\n` : ''
  return `${passageBlock}Soru:
${q.question}

Seçenekler (${n} adet):
${optionsText}

İşaretli doğru cevap: ${markedLetter} (index ${ans})
Geçerli cevap aralığı: self_answer 0-${maxIdx} olmalı (${n} seçenek).

Çözüm metni:
${q.solution || '(boş)'}

Kategori: ${q.category} | Difficulty: ${q.difficulty} | Game: ${q.game}`
}

// Provider-specific call (apiKey runtime'da resolve)
function getApiKey() {
  const k = process.env[provider.apiKeyEnv]
  if (!k) throw new Error(`${provider.apiKeyEnv} env yok`)
  return k
}

async function callGemini(systemPrompt, userPrompt) {
  const url = `${provider.endpoint(model)}?key=${getApiKey()}`
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini: boş yanıt')
  return text
}

async function callAnthropic(systemPrompt, userPrompt) {
  const res = await fetch(provider.endpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const text = data?.content?.[0]?.text
  if (!text) throw new Error('Anthropic: boş yanıt')
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  return jsonMatch ? jsonMatch[0] : text
}

async function callOpenCodeZen(systemPrompt, userPrompt) {
  const res = await fetch(provider.endpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt + '\n\nYanıt SADECE JSON, başka metin YOK.' },
      ],
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    }),
  })
  if (!res.ok) throw new Error(`OpenCodeZen ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error('OpenCodeZen: boş yanıt')
  return text
}

// NIM ve OpenCodeZen ikisi de OpenAI-uyumlu (choices[].message.content) — tek gövde paylaşır
async function callNim(systemPrompt, userPrompt) {
  const res = await fetch(provider.endpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt + '\n\nYanıt SADECE JSON, başka metin YOK.' },
      ],
      temperature: 0.1,
      max_tokens: 500,
    }),
  })
  if (!res.ok) throw new Error(`NIM ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error('NIM: boş yanıt')
  return text
}

const callLLM = opts.provider === 'anthropic' ? callAnthropic
  : opts.provider === 'opencode-zen' ? callOpenCodeZen
  : opts.provider === 'nim' ? callNim
  : callGemini

// Response parser — defensive (model her zaman valid JSON döndürmeyebilir)
export function parseJudgeResponse(rawText) {
  if (!rawText) return { error: 'empty_response' }
  let text = rawText.trim()
  // Markdown code block temizle
  const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (mdMatch) text = mdMatch[1].trim()
  
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    // JSON object extract dene
    const objMatch = text.match(/\{[\s\S]*\}/)
    if (objMatch) {
      try { parsed = JSON.parse(objMatch[0]) } catch { return { error: 'parse_failed', raw: rawText.slice(0, 200) } }
    } else {
      return { error: 'parse_failed', raw: rawText.slice(0, 200) }
    }
  }
  // Validate shape
  const required = ['self_answer', 'agrees_with_marked', 'solution_supports_marked', 'severity']
  for (const k of required) {
    if (!(k in parsed)) return { error: `missing_field:${k}`, raw: parsed }
  }
  if (!['ok', 'minor', 'major'].includes(parsed.severity)) {
    return { error: 'invalid_severity', raw: parsed }
  }
  if (typeof parsed.self_answer !== 'number' || parsed.self_answer < 0 || parsed.self_answer > 4) {
    return { error: 'invalid_self_answer', raw: parsed }
  }
  return {
    ok: true,
    self_answer: parsed.self_answer,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    agrees_with_marked: !!parsed.agrees_with_marked,
    solution_supports_marked: !!parsed.solution_supports_marked,
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    severity: parsed.severity,
    reasoning_brief: parsed.reasoning_brief || '',
  }
}

export function buildPromptForQuestion(q) {
  return { system: SYSTEM, user: buildUserPrompt(q) }
}

// Production shape ({id, game, category, ..., content:{question,...}}) ile
// fixture/flat shape arasını köprüle: top-level + content merge
function normalizeRow(row) {
  return { ...row, ...(row.content || {}) }
}

// TDK ASCII-token pre-check (deterministic, LLM'den önce)
// Kaynak: src/lib/validations/data/tdk-tokens-expanded.json (439 token)
// Soru/seçenek/çözüm metninde "acik" gibi diakritik kaybetmiş kelime → flag
let _tdkRegex = null
let _tdkMap = null
function loadTDK() {
  if (_tdkRegex) return
  const tdkPath = join(__dirname, '..', 'src', 'lib', 'validations', 'data', 'tdk-tokens-expanded.json')
  if (!existsSync(tdkPath)) { _tdkRegex = false; return }
  try {
    const data = JSON.parse(readFileSync(tdkPath, 'utf-8'))
    const tokens = data.tokens || []
    _tdkMap = new Map(tokens.map(([a, t]) => [a.toLowerCase(), t]))
    // Tek regex (alternatif | birleşik), case-insensitive, word boundary
    const pattern = tokens.map(([a]) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    _tdkRegex = new RegExp(`\\b(${pattern})\\b`, 'gi')
  } catch {
    _tdkRegex = false
  }
}

export function tdkPreCheck(text) {
  loadTDK()
  if (!_tdkRegex) return []
  const violations = new Set()
  for (const m of text.matchAll(_tdkRegex)) {
    const ascii = m[1].toLowerCase()
    const correct = _tdkMap.get(ascii)
    if (correct) violations.add(`${ascii}→${correct}`)
  }
  return [...violations]
}

function checkRowTDK(c) {
  const buf = `${c.question || ''} ${(c.options || []).join(' ')} ${c.solution || ''}`
  return tdkPreCheck(buf)
}

// Codex#267-P2: NIM ~40 RPM cap. Concurrent runner + hızlı yanıtlar cap'i aşıp 429
// üretebilir; per-worker retry-sleep aynı pencerede kalır. Global "slot rezervasyonu":
// her çağrı _nimGateTs'i ileri iter, worker'lar min-interval'e serialize olur (race-safe:
// senkron güncelleme). Yalnız provider=nim'de aktif.
let _nimGateTs = 0
const NIM_MIN_INTERVAL_MS = 1600 // ~37 req/dk (40 RPM altında güvenli marj)
async function nimThrottle() {
  if (opts.provider !== 'nim') return
  const now = Date.now()
  const slot = Math.max(now, _nimGateTs + NIM_MIN_INTERVAL_MS)
  _nimGateTs = slot
  const wait = slot - now
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
}

// Per-question judge with retry
async function judgeOne(row, attempt = 0) {
  const c = normalizeRow(row)
  // TDK pre-check (deterministic, LLM'den önce)
  const tdkViolations = checkRowTDK(c)
  const { system, user } = buildPromptForQuestion(c)
  try {
    await nimThrottle()
    const raw = await callLLM(system, user)
    const parsed = parseJudgeResponse(raw)
    if (parsed.error) {
      if (attempt < 1) return judgeOne(row, attempt + 1)
      return { id: row.id, error: parsed.error, category: c.category, tdk_violations: tdkViolations }
    }
    // Codex#267-P2: self_answer seçenek-sayısı aralığını aşarsa (ör. 4-seçenekli soruda 4)
    // geçerli-judged SAYMA — parser'ın gevşek 0-4 kabulünü option-count'a göre sıkılaştır.
    const nOpts = Array.isArray(c.options) ? c.options.length : 5
    if (typeof parsed.self_answer === 'number' && parsed.self_answer >= nOpts) {
      if (attempt < 1) return judgeOne(row, attempt + 1)
      return { id: row.id, error: `self_answer_out_of_range:${parsed.self_answer}/${nOpts}`, category: c.category, tdk_violations: tdkViolations }
    }
    // TDK ihlali varsa LLM'in issues array'ine merge + severity yükselt
    const issues = [...(parsed.issues || [])]
    if (tdkViolations.length > 0) {
      if (!issues.includes('tdk_violation')) issues.push('tdk_violation')
    }
    let severity = parsed.severity
    if (tdkViolations.length > 0 && severity === 'ok') severity = 'minor'
    return {
      id: row.id,
      category: c.category,
      difficulty: c.difficulty,
      game: c.game,
      marked_answer: c.answer,
      ...parsed,
      issues,
      severity,
      tdk_violations: tdkViolations,
    }
  } catch (e) {
    if (attempt < 4) {
      await new Promise(res => setTimeout(res, 1000 * (attempt + 1)))
      return judgeOne(row, attempt + 1)
    }
    return { id: row.id, error: e.message.slice(0, 100), category: c.category }
  }
}

// Concurrent runner
async function runBatch(rows, concurrency) {
  const results = []
  let idx = 0
  let done = 0
  const total = rows.length
  const startTs = Date.now()

  async function worker() {
    while (idx < total) {
      const myIdx = idx++
      const r = await judgeOne(rows[myIdx])
      results[myIdx] = r
      done++
      if (done % 25 === 0 || done === total) {
        const elapsed = (Date.now() - startTs) / 1000
        const rate = done / elapsed
        const eta = ((total - done) / rate).toFixed(0)
        process.stderr.write(`\r${done}/${total}  ${rate.toFixed(1)}/s  ETA ${eta}s    `)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  process.stderr.write('\n')
  return results
}

// Main
async function main() {
  if (!existsSync(opts.input)) {
    console.error(`Input dosyası yok: ${opts.input}`)
    console.error(`Oluştur: node database/audit-claude-batch.mjs`)
    process.exit(1)
  }
  const data = JSON.parse(readFileSync(opts.input, 'utf-8'))
  let rows
  if (Array.isArray(data)) {
    rows = data
  } else if (data.questions) {
    // Generated JSON files: { takenAt, game, category, difficulty, questions: [...] }
    // Merge parent-level metadata into each row so filters and prompts work correctly
    const { questions, takenAt: _ts, ...parentMeta } = data
    rows = questions.map(q => ({ ...parentMeta, ...q }))
  } else {
    rows = []
  }

  // Apply filter (top-level + content merged)
  for (const [k, v] of Object.entries(opts.filter)) {
    rows = rows.filter(r => String(normalizeRow(r)[k]) === v)
  }
  if (opts.limit > 0) rows = rows.slice(0, opts.limit)

  console.log(`Provider: ${opts.provider} (${model})`)
  console.log(`Sorular: ${rows.length}`)
  console.log(`Concurrency: ${opts.concurrency}`)
  const estCost = (rows.length * provider.estCostPerQ).toFixed(3)
  console.log(`Tahmini cost: ~$${estCost}`)

  if (opts.dryRun) {
    console.log('\n--dry-run: API çağrısı yapılmadı.')
    process.exit(0)
  }

  // API key check runtime'da (testleri bozmamak için)
  try { getApiKey() } catch (e) {
    console.error(`HATA: ${e.message}`); process.exit(1)
  }

  const results = await runBatch(rows, opts.concurrency)
  const dur = ((Date.now() - Date.now()) / 1000).toFixed(0)

  // Aggregate
  const flagged = results.filter(r => r.severity && (r.severity !== 'ok' || (r.issues && r.issues.length > 0)))
  const errored = results.filter(r => r.error)
  const bySeverity = { ok: 0, minor: 0, major: 0 }
  const byIssue = {}
  for (const r of results) {
    if (r.severity) bySeverity[r.severity]++
    for (const issue of r.issues || []) byIssue[issue] = (byIssue[issue] || 0) + 1
  }

  const summary = {
    total: rows.length,
    judged: results.length - errored.length,
    errored: errored.length,
    by_severity: bySeverity,
    by_issue: byIssue,
    flagged_count: flagged.length,
    provider: opts.provider,
    model,
    timestamp: new Date().toISOString(),
  }

  console.log('\n=== Özet ===')
  console.log(JSON.stringify(summary, null, 2))

  writeFileSync(opts.output, JSON.stringify({ summary, flagged, errored }, null, 2))
  console.log(`\nÇıktı: ${opts.output}`)
}

// Run if invoked directly (test importlarda main çalışmasın)
// pathToFileURL = Windows backslash + Linux forward slash ikisini de file:// URL'e çevirir
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().catch(e => { console.error(e); process.exit(1) })
}
