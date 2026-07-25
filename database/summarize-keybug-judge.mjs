#!/usr/bin/env node
/**
 * Judge sonuçlarını özetler ve verify-listesini üretir.
 * - MISMATCH + belirsiz + hata kayıtlarını tam soru içeriğiyle birleştirir (surer-verify girdisi)
 * - Ayrıca rastgele-altı doğrulukta (acc < %15) yüksek-oynanmış match'lerden spot-check listesi çıkarır
 *
 * node database/summarize-keybug-judge.mjs > database/keybug-verify-list.json
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))

const strip = (s) => s.replace(/^﻿/, '')
const candidates = JSON.parse(strip(readFileSync(join(__dirname, 'keybug-candidates.json'), 'utf8')))
const byId = new Map(candidates.map(c => [c.id, c]))

const results = strip(readFileSync(join(__dirname, 'keybug-judge-results.jsonl'), 'utf8'))
  .split('\n').filter(Boolean).map(l => JSON.parse(l))

const mismatches = [], ambiguous = [], errors = [], spotcheck = []
for (const r of results) {
  const c = byId.get(r.id)
  if (r.error) { errors.push({ ...r, question: c?.question?.slice(0, 80) }); continue }
  const full = { id: r.id, game: r.game, category: c?.category, ta: r.ta, acc: r.acc, recorded: r.recorded, judge: r.judge, reason: r.reason, question: c?.question, options: c?.options, solution: c?.solution }
  if (!r.match && !r.ambiguous) mismatches.push(full)
  else if (r.ambiguous) ambiguous.push(full)
  else if (r.acc < 15 && r.ta >= 10) spotcheck.push(full)
}
spotcheck.sort((a, b) => b.ta - a.ta)

console.log(JSON.stringify({
  toplam: results.length, match: results.filter(r => r.match && !r.ambiguous).length,
  mismatch: mismatches.length, belirsiz: ambiguous.length, hata: errors.length,
  mismatches, ambiguous, errors, spotcheck: spotcheck.slice(0, 12),
}, null, 1))
console.error(`mismatch:${mismatches.length} belirsiz:${ambiguous.length} hata:${errors.length} spotcheck:${Math.min(spotcheck.length, 12)}`)
