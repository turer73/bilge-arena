#!/usr/bin/env node
/**
 * Real-API eval — judge'ın gerçek precision/recall'unu ölçer.
 *
 * 3 fixture seti üzerinde judge'ı çalıştırır, beklenen davranışla karşılaştırır.
 * Bu CI'da çalıştırılmamalı — gerçek API maliyeti var (~$0.02 per run, ~10 soru).
 *
 * Kullanım:
 *   node database/__tests__/eval-judge.mjs                  # gemini default
 *   node database/__tests__/eval-judge.mjs --provider anthropic
 *   node database/__tests__/eval-judge.mjs --model gemini-2.5-pro
 *
 * Çıktı: database/__tests__/eval-judge-report.json + konsol özet
 *
 * Beklenen sonuç (provider sağlamsa):
 *   - known-correct: %100 severity=ok
 *   - known-wrong-answer: %100 agrees_with_marked=false + severity=major
 *   - known-ambiguous: ≥%50 multi_correct issue (zor — model ambiguity'yi her zaman görmüyor)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Provider arg
const args = process.argv.slice(2)
let provider = 'gemini'
let model = ''
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--provider') provider = args[++i]
  else if (args[i] === '--model') model = args[++i]
}

// Fixtures yükle
const fixtures = {
  correct: JSON.parse(readFileSync(join(__dirname, 'fixtures/known-correct.json'), 'utf-8')),
  wrong: JSON.parse(readFileSync(join(__dirname, 'fixtures/known-wrong-answer.json'), 'utf-8')),
  ambiguous: JSON.parse(readFileSync(join(__dirname, 'fixtures/known-ambiguous.json'), 'utf-8')),
}

// Tek input dosyası halinde birleştir (audit-llm-judge.mjs --input bekliyor)
const allFixtures = [...fixtures.correct, ...fixtures.wrong, ...fixtures.ambiguous]
const tmpInput = join(__dirname, '_eval-input.json')
writeFileSync(tmpInput, JSON.stringify(allFixtures, null, 2))

// audit-llm-judge.mjs çalıştır
const tmpOutput = join(__dirname, '_eval-output.json')
const cmd = ['database/audit-llm-judge.mjs',
  '--input', tmpInput,
  '--output', tmpOutput,
  '--provider', provider,
  '--concurrency', '3']
if (model) cmd.push('--model', model)

console.log(`\nJudge çalıştırılıyor: ${cmd.join(' ')}\n`)
const result = spawnSync('node', cmd, { stdio: 'inherit', cwd: join(__dirname, '..', '..') })
if (result.status !== 0) { console.error('Judge çalıştırılamadı'); process.exit(1) }

// Output yükle ve fixture _expected ile karşılaştır
const output = JSON.parse(readFileSync(tmpOutput, 'utf-8'))
const allResults = [...(output.flagged || []), ...(output.errored || [])]
// audit-llm-judge sadece flagged + errored basıyor — ok'ları geri çıkar
// fixture id'lerini map'le, karşılaştır
const resultsById = new Map()
for (const r of allResults) resultsById.set(r.id, r)
// "ok" olanları output'tan çıkarmak yerine fixture'ları kabul et = severity=ok varsayalım
// (judge severity=ok dönerse flagged'a girmez; o zaman varsayılan beklediğimiz)

const checks = []
let pass = 0, fail = 0

function check(label, cond, detail) {
  checks.push({ label, pass: cond, detail })
  cond ? pass++ : fail++
}

// 1. known-correct: severity=ok beklenir → flagged'a düşmemeli
for (const f of fixtures.correct) {
  const r = resultsById.get(f.id)
  check(`[correct] ${f.id} severity=ok`,
    !r || r.severity === 'ok',
    r ? `flagged: severity=${r.severity}, issues=${(r.issues||[]).join(',')}` : 'ok (not flagged)')
}

// 2. known-wrong: agrees_with_marked=false + severity=major beklenir
for (const f of fixtures.wrong) {
  const r = resultsById.get(f.id)
  if (!r || r.error) {
    check(`[wrong] ${f.id} flagged`, false, r ? `error: ${r.error}` : 'NOT FLAGGED (false negative!)')
    continue
  }
  check(`[wrong] ${f.id} agrees_with_marked=false`, r.agrees_with_marked === false,
    `agrees=${r.agrees_with_marked}, self=${r.self_answer}, marked=${r.marked_answer}`)
  check(`[wrong] ${f.id} severity=major`, r.severity === 'major',
    `severity=${r.severity}`)
  check(`[wrong] ${f.id} self_answer matches expected`,
    r.self_answer === f._expected.self_answer,
    `expected=${f._expected.self_answer}, got=${r.self_answer}`)
}

// 3. known-ambiguous: severity=major + multi_correct issue beklenir
for (const f of fixtures.ambiguous) {
  const r = resultsById.get(f.id)
  if (!r || r.error) {
    check(`[ambig] ${f.id} flagged`, false, r ? `error: ${r.error}` : 'NOT FLAGGED')
    continue
  }
  check(`[ambig] ${f.id} severity=major`, r.severity === 'major',
    `severity=${r.severity}`)
  const hasMultiCorrect = (r.issues || []).some(i => i === 'multi_correct' || i === 'ambiguous_wording')
  check(`[ambig] ${f.id} multi_correct OR ambiguous_wording flag`, hasMultiCorrect,
    `issues=${(r.issues || []).join(',')}`)
}

// Rapor
console.log('\n=== Eval Sonuçları ===')
for (const c of checks) {
  console.log(`${c.pass ? '✓' : '✗'} ${c.label}  ${c.detail}`)
}
console.log(`\nTotal: ${pass}/${pass + fail} pass`)
console.log(`Provider: ${provider}${model ? ` (${model})` : ''}`)

const reportPath = join(__dirname, 'eval-judge-report.json')
writeFileSync(reportPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  provider, model,
  pass, fail, total: pass + fail,
  checks,
  summary: output.summary,
}, null, 2))
console.log(`Rapor: ${reportPath}`)

process.exit(fail > 0 ? 1 : 0)
