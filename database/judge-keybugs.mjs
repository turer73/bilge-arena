#!/usr/bin/env node
/**
 * Answer-key-bug adaylarını DeepSeek ile KÖR yargılar (kayıtlı cevap/çözüm gösterilmez —
 * bias'sız bağımsız çözüm). Karşılaştırma offline yapılır (verify-keybugs aşaması).
 *
 * Girdi:  database/keybug-candidates.json (export-keybug-candidates.mjs çıktısı)
 * Çıktı:  database/keybug-judge-results.jsonl (append; resume destekli — mevcut id'ler atlanır)
 *
 * node database/judge-keybugs.mjs
 */
import { readFileSync, existsSync, appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))

const API_KEY = process.env.DEEPSEEK_API_KEY
if (!API_KEY) { console.error('DEEPSEEK_API_KEY yok'); process.exit(1) }
const MODEL = 'deepseek-v4-flash'
const URL = 'https://api.deepseek.com/chat/completions'
const CONC = 5

const IN = join(__dirname, 'keybug-candidates.json')
const OUT = join(__dirname, 'keybug-judge-results.jsonl')

const candidates = JSON.parse(readFileSync(IN, 'utf8').replace(/^﻿/, ''))
const done = new Set()
if (existsSync(OUT)) {
  for (const line of readFileSync(OUT, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try { done.add(JSON.parse(line).id) } catch {}
  }
}
const todo = candidates.filter(c => !done.has(c.id))
console.log(`Toplam ${candidates.length}, tamamlanan ${done.size}, kalan ${todo.length}`)

const LETTERS = ['A', 'B', 'C', 'D', 'E']

function buildPrompt(c) {
  const opts = c.options.map((o, i) => `${LETTERS[i]}) ${o}`).join('\n')
  return `Sen bir YKS/LGS soru çözücüsüsün. Aşağıdaki çoktan seçmeli soruyu dikkatle ve adım adım çöz.

DERS: ${c.game} / ${c.category}

SORU:
${c.question}

SEÇENEKLER:
${opts}

Kurallar:
- Önce kısa gerekçeyle çöz, sonra nihai cevabı ver.
- Soru hatalıysa (birden fazla doğru şık, hiç doğru şık yok, eksik/çelişkili bilgi) "belirsiz" işaretle.
- SON SATIRDA sadece şu JSON'u yaz (başka metin ekleme):
{"cevap": "<A|B|C|D|E>", "belirsiz": <true|false>, "gerekce": "<en fazla 150 karakter>"}`
}

async function judgeOne(c, attempt = 0) {
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: buildPrompt(c) }],
        temperature: 0,
        max_tokens: 2500,
      }),
      signal: AbortSignal.timeout(90_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const j = await res.json()
    const text = j.choices?.[0]?.message?.content || ''
    // son JSON satırını çek
    const m = text.match(/\{[^{}]*"cevap"[^{}]*\}/g)
    if (!m) throw new Error('JSON bulunamadı: ' + text.slice(-200))
    const parsed = JSON.parse(m[m.length - 1])
    const judgeIdx = LETTERS.indexOf((parsed.cevap || '').trim().toUpperCase())
    if (judgeIdx < 0) throw new Error('geçersiz cevap harfi: ' + parsed.cevap)
    return {
      id: c.id, game: c.game, ta: c.ta, acc: c.acc,
      recorded: c.answer, judge: judgeIdx,
      match: judgeIdx === c.answer, ambiguous: !!parsed.belirsiz,
      reason: (parsed.gerekce || '').slice(0, 200),
      usage: j.usage ? { pt: j.usage.prompt_tokens, ct: j.usage.completion_tokens } : null,
    }
  } catch (e) {
    if (attempt < 2) { await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); return judgeOne(c, attempt + 1) }
    return { id: c.id, game: c.game, error: String(e).slice(0, 300) }
  }
}

let idx = 0, ok = 0, mismatch = 0, amb = 0, err = 0
async function worker() {
  while (idx < todo.length) {
    const c = todo[idx++]
    const r = await judgeOne(c)
    appendFileSync(OUT, JSON.stringify(r) + '\n')
    if (r.error) err++
    else if (r.ambiguous) amb++
    else if (r.match) ok++
    else mismatch++
    const n = ok + mismatch + amb + err
    if (n % 20 === 0) console.log(`[${n}/${todo.length}] match:${ok} MISMATCH:${mismatch} belirsiz:${amb} hata:${err}`)
  }
}
await Promise.all(Array.from({ length: CONC }, worker))
console.log(`BİTTİ — match:${ok} MISMATCH:${mismatch} belirsiz:${amb} hata:${err} (toplam ${ok + mismatch + amb + err})`)
